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
  applyGainDb,
  copyChannels,
  gainToDb,
  limitChannels,
  normalizePeakDb,
  truePeak,
  type LimiterStats,
} from "@/lib/audio/dsp";
import { formatDb } from "@/lib/audio/engine";

type AntiClipMode = "limiter" | "trim";

interface VolumeInfo {
  peakDb: number;
  limiter?: LimiterStats;
  trimmedDb?: number;
}

interface VolumeSettings {
  gain: number;
  antiClip: AntiClipMode;
}

export default function VolumeBoosterTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<VolumeInfo>("volume-booster");
  const { reset } = proc;

  const [gain, setGain] = useState(6);
  const [antiClip, setAntiClip] = useState<AntiClipMode>("limiter");
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const settings: VolumeSettings = useMemo(
    () => ({ gain, antiClip }),
    [gain, antiClip]
  );

  const apply = useCallback(
    (s: VolumeSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        await report(0.15, "Boosting volume");
        const out = copyChannels(channels);
        applyGainDb(out, s.gain);

        let info: VolumeInfo = { peakDb: gainToDb(truePeak(out)) };
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
      label: "+6 dB",
      apply: () => {
        setGain(6);
        setActivePreset("+6 dB");
      },
    },
    {
      label: "+12 dB",
      apply: () => {
        setGain(12);
        setActivePreset("+12 dB");
      },
    },
    {
      label: "+18 dB",
      apply: () => {
        setGain(18);
        setActivePreset("+18 dB");
      },
    },
    {
      label: "+24 dB max",
      apply: () => {
        setGain(24);
        setActivePreset("+24 dB max");
      },
    },
  ];

  const info = proc.result?.info;

  return (
    <ToolPage toolId="volume-booster">
      <ToolGrid>
        <ControlsCard
          title="Boost settings"
          description="Raises the whole track by a uniform amount, with true-peak protection."
        >
          <PresetChips presets={presets} active={activePreset} />
          <SliderRow
            label="Volume boost"
            value={gain}
            min={0}
            max={24}
            step={0.5}
            onChange={(v) => {
              setGain(Math.round(v * 2) / 2);
              setActivePreset(undefined);
            }}
            format={(v) => `+${v.toFixed(1)} dB`}
            hint="0 to +24 dB of overall gain"
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
              Raises the whole track. The look-ahead limiter keeps even +24 dB
              completely distortion-free.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="volume-booster"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
