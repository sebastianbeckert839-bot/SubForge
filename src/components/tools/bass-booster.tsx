"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  applyBiquadInPlace,
  copyChannels,
  designBiquad,
  gainToDb,
  limitChannels,
  normalizePeakDb,
  truePeak,
  type LimiterStats,
} from "@/lib/audio/dsp";
import { formatDb } from "@/lib/audio/engine";

type AntiClipMode = "limiter" | "trim";

interface BoosterInfo {
  peakDb: number;
  limiter?: LimiterStats;
  trimmedDb?: number;
}

interface BoosterSettings {
  gain: number;
  focus: number;
  antiClip: AntiClipMode;
}

export default function BassBoosterTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<BoosterInfo>("bass-booster");
  const { reset } = proc;

  const [gain, setGain] = useState(6);
  const [focus, setFocus] = useState(90);
  const [antiClip, setAntiClip] = useState<AntiClipMode>("limiter");
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const settings: BoosterSettings = useMemo(
    () => ({ gain, focus, antiClip }),
    [gain, focus, antiClip]
  );

  const apply = useCallback(
    (s: BoosterSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        await report(0.15, "Boosting bass");
        const out = copyChannels(channels);
        // smooth low-shelf boost (S=1 slope — no ringing, no phase smearing)
        const shelf = designBiquad(
          { type: "lowshelf", freq: s.focus, gainDb: s.gain },
          fs
        );
        for (const ch of out) applyBiquadInPlace(ch, shelf);

        let info: BoosterInfo = { peakDb: gainToDb(truePeak(out)) };
        if (s.antiClip === "limiter") {
          const stats = await limitChannels(out, fs, {
            ceilingDb: -0.3,
            lookaheadMs: 5,
            releaseMs: 90,
            onProgress: async (p) => {
              await report(0.2 + p * 0.8, "Limiting");
            },
          });
          info = {
            peakDb: gainToDb(truePeak(out)),
            limiter: stats,
          };
        } else {
          const trimmed = normalizePeakDb(out, -0.1);
          info = { peakDb: -0.1, trimmedDb: trimmed };
        }
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

  useLivePreview(channels, settings, apply, 250);

  const presets = [
    {
      label: "Sub +12 dB",
      apply: () => {
        setGain(12);
        setFocus(60);
        setActivePreset("Sub +12 dB");
      },
    },
    {
      label: "Deep +15 dB",
      apply: () => {
        setGain(15);
        setFocus(80);
        setActivePreset("Deep +15 dB");
      },
    },
    {
      label: "Warm +8 dB",
      apply: () => {
        setGain(8);
        setFocus(110);
        setActivePreset("Warm +8 dB");
      },
    },
    {
      label: "Punch +5 dB",
      apply: () => {
        setGain(5);
        setFocus(150);
        setActivePreset("Punch +5 dB");
      },
    },
  ];

  const info = proc.result?.info;

  return (
    <ToolPage toolId="bass-booster">
      <ToolGrid>
        <ControlsCard
          title="Boost settings"
          description="A smooth low-shelf filter plus a transparent look-ahead limiter — clean even at +15 dB."
        >
          <PresetChips presets={presets} active={activePreset} />
          <SliderRow
            label="Bass boost"
            value={gain}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => {
              setGain(Math.round(v * 2) / 2);
              setActivePreset(undefined);
            }}
            format={(v) => `+${v.toFixed(1)} dB`}
            hint="0 to +15 dB of clean low-end gain"
          />
          <SliderRow
            label="Focus frequency"
            value={focus}
            min={40}
            max={250}
            log
            onChange={(v) => {
              setFocus(Math.round(v));
              setActivePreset(undefined);
            }}
            format={(v) => `${Math.round(v)} Hz`}
            hint="Everything below this shelf midpoint gets boosted"
          />
          <SelectRow
            label="Anti-clip protection"
            value={antiClip}
            options={[
              { value: "limiter", label: "Look-ahead limiter (recommended)" },
              { value: "trim", label: "Auto-trim level" },
            ]}
            onChange={(v) => setAntiClip(v)}
            hint="Guarantees a distortion-free export at any boost amount"
          />
          <LiveStatus
            running={proc.isRunning}
            progress={proc.progress}
            stage={proc.stage}
          />
        </ControlsCard>

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
            <ControlsCard title="Output analysis">
              <StatRow label="Output peak" value={formatDb(info.peakDb)} accent />
              {info.limiter ? (
                <>
                  <StatRow
                    label="Max gain reduction"
                    value={formatDb(-info.limiter.maxReductionDb)}
                  />
                  <StatRow
                    label="Limiter active"
                    value={`${(info.limiter.activeFraction * 100).toFixed(1)}% of samples`}
                  />
                </>
              ) : null}
              {info.trimmedDb != null ? (
                <StatRow label="Level trimmed" value={formatDb(info.trimmedDb)} />
              ) : null}
            </ControlsCard>
          ) : (
            <InfoBanner>
              Load a track and it will be processed instantly with these
              settings. Toggle between <strong>Original</strong> and{" "}
              <strong>Processed</strong> in the player to hear the difference
              before downloading.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="bass-booster"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
