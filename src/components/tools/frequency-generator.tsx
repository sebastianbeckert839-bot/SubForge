"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { AudioWaveform } from "lucide-react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  SelectRow,
  PresetChips,
  InfoBanner,
} from "@/components/tool-ui";
import { ABPlayer } from "@/components/ab-player";
import { DownloadPanel } from "@/components/download-panel";
import type { Channels } from "@/lib/audio/dsp";

const FS = 44100;
const F_MIN = 20;
const F_MAX = 20000;

type ToneWave = "sine" | "square" | "triangle" | "sawtooth";
type GenMode = "fixed" | "sweep";
type SweepCurve = "log" | "linear";

/** slider position (0..1000) ↔ Hz on a log scale */
const posToHz = (pos: number) =>
  F_MIN * Math.pow(F_MAX / F_MIN, pos / 1000);
const hzToPos = (hz: number) =>
  (1000 * Math.log(hz / F_MIN)) / Math.log(F_MAX / F_MIN);

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz` : `${Math.round(hz)} Hz`;
}

function waveSample(phase: number, kind: ToneWave): number {
  switch (kind) {
    case "sine":
      return Math.sin(phase);
    case "square":
      return Math.sin(phase) >= 0 ? 1 : -1;
    case "triangle":
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
    case "sawtooth": {
      // phase in [0, 2π) → −1..1 ramp
      const t = phase / (2 * Math.PI);
      return 2 * t - 1;
    }
  }
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function generateTone(opts: {
  mode: GenMode;
  wave: ToneWave;
  freq: number;
  sweepStart: number;
  sweepEnd: number;
  durationSec: number;
  levelDb: number;
  fadeMs: number;
  curve: SweepCurve;
}): Channels {
  const N = Math.max(1, Math.round(opts.durationSec * FS));
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  const amp = dbToGain(opts.levelDb);
  const fade = Math.max(0.001, opts.fadeMs / 1000);
  let phase = 0;

  for (let n = 0; n < N; n++) {
    const t = n / FS;
    let f: number;
    if (opts.mode === "fixed") {
      f = opts.freq;
    } else {
      const p = Math.min(1, t / opts.durationSec);
      f =
        opts.curve === "log"
          ? opts.sweepStart *
            Math.pow(opts.sweepEnd / opts.sweepStart, p)
          : opts.sweepStart + (opts.sweepEnd - opts.sweepStart) * p;
    }
    phase += (2 * Math.PI * f) / FS;
    if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;

    // click-free fade in/out
    const env = Math.min(1, t / fade, (opts.durationSec - t) / fade);
    const s = waveSample(phase, opts.wave) * amp * Math.max(0, env);
    left[n] = s;
    right[n] = s;
  }
  return [left, right];
}

export default function FrequencyGeneratorTool() {
  const [mode, setMode] = useState<GenMode>("fixed");
  const [wave, setWave] = useState<ToneWave>("sine");
  const [freqPos, setFreqPos] = useState(hzToPos(440));
  const [startPos, setStartPos] = useState(hzToPos(20));
  const [endPos, setEndPos] = useState(hzToPos(20000));
  const [duration, setDuration] = useState(10);
  const [levelDb, setLevelDb] = useState(-6);
  const [fadeMs, setFadeMs] = useState(20);
  const [curve, setCurve] = useState<SweepCurve>("log");
  const [result, setResult] = useState<Channels | null>(null);
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const freq = useMemo(() => posToHz(freqPos), [freqPos]);
  const sweepStart = useMemo(() => posToHz(startPos), [startPos]);
  const sweepEnd = useMemo(() => posToHz(endPos), [endPos]);

  const generate = useCallback(() => {
    const chs = generateTone({
      mode,
      wave,
      freq,
      sweepStart,
      sweepEnd,
      durationSec: duration,
      levelDb,
      fadeMs,
      curve,
    });
    setResult(chs);
    // count it in the site stats (same endpoint the other tools use)
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "frequency-generator" }),
    }).catch(() => {});
    toast.success(
      mode === "fixed"
        ? `Generated ${formatFreq(freq)} tone`
        : `Generated ${formatFreq(sweepStart)} → ${formatFreq(sweepEnd)} sweep`
    );
  }, [mode, wave, freq, sweepStart, sweepEnd, duration, levelDb, fadeMs, curve]);

  const presets = [
    {
      label: "Sub test 30 Hz",
      apply: () => {
        setMode("fixed");
        setWave("sine");
        setFreqPos(hzToPos(30));
        setDuration(10);
        setActivePreset("Sub test 30 Hz");
      },
    },
    {
      label: "Sub sweep 20–60 Hz",
      apply: () => {
        setMode("sweep");
        setWave("sine");
        setStartPos(hzToPos(20));
        setEndPos(hzToPos(60));
        setDuration(15);
        setActivePreset("Sub sweep 20–60 Hz");
      },
    },
    {
      label: "Full sweep 20 Hz–20 kHz",
      apply: () => {
        setMode("sweep");
        setWave("sine");
        setStartPos(hzToPos(20));
        setEndPos(hzToPos(20000));
        setDuration(30);
        setActivePreset("Full sweep 20 Hz–20 kHz");
      },
    },
    {
      label: "A4 440 Hz",
      apply: () => {
        setMode("fixed");
        setWave("sine");
        setFreqPos(hzToPos(440));
        setDuration(5);
        setActivePreset("A4 440 Hz");
      },
    },
  ];

  return (
    <ToolPage toolId="frequency-generator" standalone>
      <ToolGrid>
        <div className="flex flex-col gap-6">
          <ControlsCard
            title="Tone"
            description="Pure test tones generated in your browser at studio quality — 44.1 kHz, click-free."
          >
            <SelectRow
              label="Mode"
              value={mode}
              options={[
                { value: "fixed", label: "Fixed tone — one steady frequency" },
                { value: "sweep", label: "Sweep — glide from A to B" },
              ]}
              onChange={(v) => setMode(v as GenMode)}
            />
            <SelectRow
              label="Waveform"
              value={wave}
              options={[
                { value: "sine", label: "Sine — pure, no harmonics" },
                { value: "square", label: "Square — bright, rich harmonics" },
                { value: "triangle", label: "Triangle — soft harmonics" },
                { value: "sawtooth", label: "Sawtooth — full harmonic stack" },
              ]}
              onChange={(v) => setWave(v as ToneWave)}
            />
            {mode === "fixed" ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Frequency</label>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 w-28 text-right font-mono text-sm tabular-nums"
                      type="number"
                      min={F_MIN}
                      max={F_MAX}
                      step={1}
                      value={Math.round(freq)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= F_MIN && v <= F_MAX) {
                          setFreqPos(hzToPos(v));
                        }
                      }}
                      aria-label="Frequency in hertz"
                    />
                    <span className="text-sm text-muted-foreground">Hz</span>
                  </div>
                </div>
                <Slider
                  value={[freqPos]}
                  onValueChange={(v) => setFreqPos(v[0])}
                  min={0}
                  max={1000}
                  step={1}
                  aria-label="Frequency (logarithmic)"
                />
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground/60">
                  <span>20 Hz</span>
                  <span>200 Hz</span>
                  <span>2 kHz</span>
                  <span>20 kHz</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Start frequency</label>
                    <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-primary">
                      {formatFreq(sweepStart)}
                    </span>
                  </div>
                  <Slider
                    value={[startPos]}
                    onValueChange={(v) => setStartPos(v[0])}
                    min={0}
                    max={1000}
                    step={1}
                    aria-label="Sweep start frequency"
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">End frequency</label>
                    <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-primary">
                      {formatFreq(sweepEnd)}
                    </span>
                  </div>
                  <Slider
                    value={[endPos]}
                    onValueChange={(v) => setEndPos(v[0])}
                    min={0}
                    max={1000}
                    step={1}
                    aria-label="Sweep end frequency"
                  />
                </div>
                <SelectRow
                  label="Sweep curve"
                  value={curve}
                  options={[
                    { value: "log", label: "Logarithmic — even note spacing (recommended)" },
                    { value: "linear", label: "Linear — even Hz spacing" },
                  ]}
                  onChange={(v) => setCurve(v as SweepCurve)}
                />
              </div>
            )}
            <SliderRow
              label="Duration"
              value={duration}
              min={1}
              max={120}
              step={1}
              onChange={(v) => setDuration(Math.round(v))}
              format={(v) => `${Math.round(v)} s`}
            />
            <SliderRow
              label="Level"
              value={levelDb}
              min={-24}
              max={0}
              step={0.5}
              onChange={(v) => setLevelDb(Math.round(v * 2) / 2)}
              format={(v) => `${v.toFixed(1)} dBFS`}
              hint="Start low — pure tones stress speakers fast"
            />
            <SliderRow
              label="Fade in / out"
              value={fadeMs}
              min={0}
              max={500}
              step={5}
              onChange={(v) => setFadeMs(Math.round(v))}
              format={(v) => `${Math.round(v)} ms`}
              hint="Prevents clicks at start and end"
            />
            <PresetChips presets={presets} active={activePreset} />
            <Button onClick={generate} className="w-full">
              <AudioWaveform className="size-4" />
              Generate tone
            </Button>
          </ControlsCard>
        </div>

        <div className="flex flex-col gap-6">
          {result ? (
            <>
              <ABPlayer
                original={result}
                fs={FS}
                labelA="Tone"
                hint="Press play — use the level slider if it's too loud"
              />
              <DownloadPanel
                channels={result}
                fs={FS}
                toolId="frequency-generator"
              />
            </>
          ) : (
            <InfoBanner>
              <strong>Why a frequency generator?</strong> Find out what your
              speakers can really do. Play a 30 Hz sine — if you hear nothing,
              your rig can't reproduce sub-bass (the Rebasser's 29–34 Hz band
              lives exactly there). Run a 20 Hz–20 kHz sweep to find rattles,
              resonances and your speakers' real limits. Careful with the
              volume — pure tones at high level can damage drivers.
            </InfoBanner>
          )}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
