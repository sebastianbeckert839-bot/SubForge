"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  SelectRow,
  PresetChips,
  StatRow,
  InfoBanner,
  LiveStatus,
  useLivePreview,
} from "@/components/tool-ui";
import { ABPlayer } from "@/components/ab-player";
import { DownloadPanel } from "@/components/download-panel";
import { useAudioStore } from "@/store/audio";
import { useProcessor } from "@/hooks/use-processor";
import {
  processRebass,
  type RebassInfo,
  type RebassOptions,
  type RebassWaveform,
  type RebassFollow,
} from "@/lib/audio/rebass";
import { formatDb, formatHz } from "@/lib/audio/engine";

const RANGE_MIN = 18;
const RANGE_MAX = 140;

export default function RebasserTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<RebassInfo>("rebasser");
  const { reset } = proc;

  // pick up a range suggested by the Spectrum Analyzer (the component mounts
  // fresh after the analyzer navigates here, so initial state is enough)
  const suggestion = useAudioStore.getState().rebassSuggestion;
  const [range, setRange] = useState<[number, number]>(() =>
    suggestion
      ? [
          Math.max(RANGE_MIN, suggestion.low),
          Math.min(RANGE_MAX, suggestion.high),
        ]
      : [29, 34]
  );
  const [autoRemove, setAutoRemove] = useState(true);
  const [manualRemoveBelow, setManualRemoveBelow] = useState(
    suggestion ? suggestion.high : 34
  );
  const [slope, setSlope] = useState<12 | 24 | 36 | 48>(48);
  const [subLevel, setSubLevel] = useState(0);
  const [waveform, setWaveform] = useState<RebassWaveform>("sine");
  const [follow, setFollow] = useState<RebassFollow>("natural");
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const info = proc.result?.info;

  // while auto is on, the cutoff is resolved inside the processor so it
  // clears the whole detected bassline; show what it resolved to
  const removeBelow = autoRemove
    ? Math.round(info?.cutoffHz ?? Math.max(range[0], range[1]))
    : manualRemoveBelow;

  const settings: RebassOptions = useMemo(() => {
    const low = Math.min(range[0], range[1]);
    const high = Math.max(range[0], range[1]);
    return {
      rangeLow: low,
      rangeHigh: high,
      removeBelowHz: autoRemove ? "auto" : manualRemoveBelow,
      removeSlope: slope,
      subLevelDb: subLevel,
      waveform,
      follow,
    };
  }, [range, autoRemove, manualRemoveBelow, slope, subLevel, waveform, follow]);

  const apply = useCallback(
    (opts: RebassOptions) => {
      if (!channels) return;
      void proc.run(async (report) => {
        const { channels: out, info } = await processRebass(
          channels,
          fs,
          opts,
          report
        );
        await report(1);
        return { channels: out, info };
      });
    },
    [channels, fs, proc]
  );

  // drop the stale result the moment a different file is loaded
  useEffect(() => {
    reset();
  }, [channels, reset]);

  useEffect(() => {
    const s = useAudioStore.getState().rebassSuggestion;
    if (s) {
      toast.info(`Using suggested range: ${s.low}–${s.high} Hz`);
    }
  }, []);

  useLivePreview(channels, settings, apply, 300);

  const handleRangeChange = (vals: number[]) => {
    const [a, b] = vals;
    if (b - a >= 2) {
      setRange([a, b]);
    } else {
      // push the other thumb along when they collide
      if (a !== range[0]) setRange([Math.min(a, RANGE_MAX - 2), Math.min(a + 2, RANGE_MAX)]);
      else setRange([Math.max(b - 2, RANGE_MIN), Math.max(b, RANGE_MIN + 2)]);
    }
    setActivePreset(undefined);
  };

  const presets = [
    {
      label: "Deep 27–33",
      apply: () => {
        setRange([27, 33]);
        setAutoRemove(true);
        setActivePreset("Deep 27–33");
      },
    },
    {
      label: "Classic 29–34",
      apply: () => {
        setRange([29, 34]);
        setAutoRemove(true);
        setActivePreset("Classic 29–34");
      },
    },
    {
      label: "Growl 38–48",
      apply: () => {
        setRange([38, 48]);
        setAutoRemove(true);
        setActivePreset("Growl 38–48");
      },
    },
    {
      label: "Warm 45–60",
      apply: () => {
        setRange([45, 60]);
        setAutoRemove(true);
        setActivePreset("Warm 45–60");
      },
    },
  ];

  return (
    <ToolPage toolId="rebasser">
      <ToolGrid>
        <div className="flex flex-col gap-6">
          <ControlsCard
            title="Target band"
            description="Pick the frequency band your new sub-bass line is centered on. The whole bassline shifts as one, so the melody survives intact."
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Rebass range</label>
                <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-primary">
                  {Math.round(Math.min(...range))} – {Math.round(Math.max(...range))} Hz
                </span>
              </div>
              <Slider
                value={[Math.min(...range), Math.max(...range)]}
                onValueChange={handleRangeChange}
                min={RANGE_MIN}
                max={RANGE_MAX}
                step={1}
                aria-label="Rebass frequency range"
              />
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground/60">
                <span>{RANGE_MIN} Hz</span>
                <span>50 Hz</span>
                <span>{RANGE_MAX} Hz</span>
              </div>
            </div>
            <PresetChips presets={presets} active={activePreset} />
          </ControlsCard>

          <ControlsCard
            title="Rebass engine"
            description="The original bass is removed first, then a new sub is synthesized that follows your track's own bassline."
          >
            <SliderRow
              label="Remove original below"
              value={removeBelow}
              min={18}
              max={150}
              onChange={(v) => {
                setManualRemoveBelow(Math.round(v));
                setAutoRemove(false);
              }}
              format={(v) => `${Math.round(v)} Hz`}
              hint={
                autoRemove
                  ? "Auto: clears the whole detected bassline"
                  : "Custom cutoff"
              }
            />
            <SelectRow
              label="Removal slope"
              value={slope}
              options={[
                { value: 12, label: "12 dB/oct — gentle" },
                { value: 24, label: "24 dB/oct — standard" },
                { value: 36, label: "36 dB/oct — steep" },
                { value: 48, label: "48 dB/oct — surgical" },
              ]}
              onChange={(v) => setSlope(v as 12 | 24 | 36 | 48)}
            />
            <SliderRow
              label="Sub level"
              value={subLevel}
              min={-12}
              max={12}
              step={0.5}
              onChange={(v) => setSubLevel(Math.round(v * 2) / 2)}
              format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
              hint="Relative to the original bass loudness"
            />
            <SelectRow
              label="Sub character"
              value={waveform}
              options={[
                { value: "sine", label: "Pure sine — deepest, cleanest" },
                { value: "saturated", label: "Saturated — audible on small speakers" },
                { value: "triangle", label: "Triangle — hollow, synth-like" },
              ]}
              onChange={(v) => setWaveform(v)}
            />
            <SelectRow
              label="Bassline follow"
              value={follow}
              options={[
                { value: "slow", label: "Slow — smooth and sustained" },
                { value: "natural", label: "Natural" },
                { value: "fast", label: "Fast — tight and punchy" },
              ]}
              onChange={(v) => setFollow(v)}
            />
            <LiveStatus
              running={proc.isRunning}
              progress={proc.progress}
              stage={proc.stage}
            />
          </ControlsCard>
        </div>

        <div className="flex flex-col gap-6">
          <ABPlayer
            original={channels!}
            processed={proc.result?.channels ?? null}
            fs={fs}
            hint="Live preview — keep it playing while you tweak, the track updates itself"
          />
          {proc.error ? (
            <InfoBanner variant="warn">{proc.error}</InfoBanner>
          ) : null}
          {info ? (
            <ControlsCard title="Rebass analysis">
              {info.lowConfidence ? (
                <InfoBanner variant="warn">
                  Little bass was detected in this track — the sub layer may
                  be sparse. The Bass Booster may work better here.
                </InfoBanner>
              ) : null}
              <StatRow
                label="Detected bassline"
                value={
                  info.analysis.medianF0 > 0
                    ? `${formatHz(info.analysis.rangeF0[0])} – ${formatHz(info.analysis.rangeF0[1])} (median ${formatHz(info.analysis.medianF0)})`
                    : "—"
                }
              />
              <StatRow
                label="Original removed below"
                value={`${Math.round(info.cutoffHz)} Hz`}
              />
              <StatRow
                label="Notes mapped"
                value={info.noteCount > 0 ? `${info.noteCount}` : "—"}
              />
              <StatRow
                label="Sub range"
                value={
                  info.subRangeHz[1] > 0
                    ? `${formatHz(info.subRangeHz[0])} – ${formatHz(info.subRangeHz[1])}`
                    : "—"
                }
              />
              <StatRow
                label="Octave shift"
                value={
                  info.octaveShift === 0
                    ? "none (line already in band)"
                    : info.octaveShift < 0
                      ? `+${-info.octaveShift} octave${-info.octaveShift > 1 ? "s" : ""} up`
                      : `−${info.octaveShift} octave${info.octaveShift > 1 ? "s" : ""}`
                }
                accent
              />
              <StatRow
                label="Sub active"
                value={`${info.subActivePct.toFixed(0)}% of track`}
              />
              <StatRow label="Sub peak" value={formatDb(info.subPeakDb)} />
              {info.limiter ? (
                <StatRow
                  label="Limiter max reduction"
                  value={formatDb(-info.limiter.maxReductionDb)}
                />
              ) : null}
            </ControlsCard>
          ) : (
            <InfoBanner>
              <strong>How it works:</strong> the current low end is filtered
              out, then a brand-new sub-bass line is synthesized inside your
              chosen band (29–34 Hz? 45–60? totally up to you). The sub
              plays your song's own bassline, note for note, shifted into
              the band.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="rebasser"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
