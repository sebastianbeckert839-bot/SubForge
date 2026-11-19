"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Pause, Play } from "lucide-react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  SelectRow,
  PresetChips,
  InfoBanner,
} from "@/components/tool-ui";

const F_MIN = 20;
const F_MAX = 20000;

type ToneWave = "sine" | "square" | "triangle" | "sawtooth";

/** slider position (0..1000) ↔ Hz on a log scale */
const posToHz = (pos: number) =>
  F_MIN * Math.pow(F_MAX / F_MIN, pos / 1000);
const hzToPos = (hz: number) =>
  (1000 * Math.log(hz / F_MIN)) / Math.log(F_MAX / F_MIN);

function formatFreq(hz: number): string {
  return hz >= 1000
    ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`
    : `${Math.round(hz)} Hz`;
}

/** nearest musical note + detune in cents (A4 = 440 Hz) */
const NOTE_NAMES = [
  "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#",
];
function noteName(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return "—";
  const exact = 12 * Math.log2(hz / 440);
  const n = Math.round(exact);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = 4 + Math.floor((n + 9) / 12);
  const cents = Math.round((exact - n) * 100);
  if (cents === 0) return `${name}${octave} · in tune`;
  return `${name}${octave} · ${cents > 0 ? "+" : "−"}${Math.abs(cents)} ¢`;
}

/** volume % → linear gain (quadratic curve keeps the low end of the slider usable) */
const volToGain = (v: number) => Math.pow(v / 100, 2) * 0.9;

interface LiveTone {
  ctx: AudioContext;
  osc: OscillatorNode;
  gain: GainNode;
}

export default function FrequencyGeneratorTool() {
  const [wave, setWave] = useState<ToneWave>("sine");
  const [freqPos, setFreqPos] = useState(hzToPos(440));
  const [volume, setVolume] = useState(35);
  const [playing, setPlaying] = useState(false);
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const toneRef = useRef<LiveTone | null>(null);
  const freq = useMemo(() => posToHz(freqPos), [freqPos]);

  /* -------- live oscillator (plays until stopped — no duration) -------- */

  const startTone = () => {
    if (toneRef.current) return;
    const ctx = new AudioContext();
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    // short fade-in so the tone never clicks
    gain.gain.setTargetAtTime(volToGain(volume), ctx.currentTime, 0.015);
    toneRef.current = { ctx, osc, gain };
    setPlaying(true);
    // count it in the site stats (same endpoint the other tools use)
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "frequency-generator" }),
    }).catch(() => {});
  };

  const stopTone = () => {
    const t = toneRef.current;
    if (!t) return;
    toneRef.current = null;
    setPlaying(false);
    t.gain.gain.setTargetAtTime(0, t.ctx.currentTime, 0.015);
    window.setTimeout(
      () => {
        try {
          t.osc.stop();
        } catch {
          /* already stopped */
        }
        void t.ctx.close();
      },
      120
    );
  };

  // live parameter updates while the tone is sounding
  useEffect(() => {
    const t = toneRef.current;
    if (t) t.osc.frequency.setTargetAtTime(freq, t.ctx.currentTime, 0.008);
  }, [freq]);
  useEffect(() => {
    const t = toneRef.current;
    if (t) t.osc.type = wave;
  }, [wave]);
  useEffect(() => {
    const t = toneRef.current;
    if (t)
      t.gain.gain.setTargetAtTime(volToGain(volume), t.ctx.currentTime, 0.02);
  }, [volume]);

  // never leave an oscillator running after leaving the page
  useEffect(
    () => () => {
      const t = toneRef.current;
      if (t) {
        try {
          t.osc.stop();
        } catch {
          /* already stopped */
        }
        void t.ctx.close();
      }
    },
    []
  );

  /* ------------------------------ presets ------------------------------ */

  const presets = [
    { label: "30 Hz", hz: 30 },
    { label: "40 Hz", hz: 40 },
    { label: "50 Hz", hz: 50 },
    { label: "60 Hz", hz: 60 },
    { label: "440 Hz", hz: 440 },
    { label: "1 kHz", hz: 1000 },
  ].map((p) => ({
    label: p.label,
    apply: () => {
      setFreqPos(hzToPos(p.hz));
      setActivePreset(p.label);
    },
  }));

  /* ------------------------------- render ------------------------------ */

  return (
    <ToolPage toolId="frequency-generator" standalone>
      <ToolGrid>
        <div className="flex flex-col gap-6">
          <ControlsCard
            title="Tone"
            description="A live test tone that plays until you stop it. Drag the frequency slider while it sounds — the pitch follows your finger in real time."
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <label className="text-sm font-medium" htmlFor="fg-freq">
                    Frequency
                  </label>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {noteName(freq)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="fg-freq"
                    className="h-8 w-28 text-right font-mono text-sm tabular-nums"
                    type="number"
                    min={F_MIN}
                    max={F_MAX}
                    step={1}
                    value={Math.round(freq)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) {
                        const clamped = Math.min(F_MAX, Math.max(F_MIN, v));
                        setFreqPos(hzToPos(clamped));
                        setActivePreset(undefined);
                      }
                    }}
                    aria-label="Frequency in hertz"
                  />
                  <span className="text-sm text-muted-foreground">Hz</span>
                </div>
              </div>
              <Slider
                value={[freqPos]}
                onValueChange={(v) => {
                  setFreqPos(v[0]);
                  setActivePreset(undefined);
                }}
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
            <SliderRow
              label="Volume"
              value={volume}
              min={0}
              max={100}
              step={1}
              onChange={(v) => setVolume(Math.round(v))}
              format={(v) => `${Math.round(v)}%`}
              hint="Ears and speakers first — pure tones at full volume hurt both"
            />
            <PresetChips presets={presets} active={activePreset} />
            <Button
              onClick={playing ? stopTone : startTone}
              variant={playing ? "destructive" : "default"}
              className="w-full"
              aria-pressed={playing}
            >
              {playing ? (
                <>
                  <Pause className="size-4" />
                  Stop tone
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Play tone
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {playing ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  playing — it runs until you stop it
                </span>
              ) : (
                "no duration, no export — just a tone"
              )}
            </p>
          </ControlsCard>
        </div>

        <div className="flex flex-col gap-6">
          <InfoBanner>
            <strong>Why a frequency generator?</strong> Find out what your
            speakers can really do. Play a 30 Hz sine — if you hear nothing,
            your rig can&apos;t reproduce sub-bass (the Rebasser&apos;s 29–34
            Hz band lives exactly there). Sweep up by dragging the slider to
            find rattles, resonances and your speakers&apos; real limits.
            <strong> Careful with the volume</strong> — pure tones at high
            level can damage drivers and hearing.
          </InfoBanner>
          <InfoBanner>
            <strong>Tips.</strong> Deep sines are felt more than heard — on
            laptops and phone speakers anything below ~60 Hz is mostly
            silence, and that&apos;s normal. Start low, turn up slowly. If a
            tone seems to vanish around one frequency but is audible on both
            sides, you&apos;ve found a room resonance or a speaker dip.
          </InfoBanner>
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
