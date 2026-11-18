"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  SelectRow,
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
  rmsLevel,
  truePeak,
} from "@/lib/audio/dsp";
import { formatDb } from "@/lib/audio/engine";

type NormMode = "peak" | "rms";

interface NormalizerInfo {
  beforePeakDb: number;
  beforeRmsDb: number;
  afterPeakDb: number;
  afterRmsDb: number;
  appliedDb: number;
  limiterUsed: boolean;
}

interface NormalizerSettings {
  mode: NormMode;
  peakTarget: number;
  loudTarget: number;
}

export default function NormalizerTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<NormalizerInfo>("normalizer");
  const { reset } = proc;

  const [mode, setMode] = useState<NormMode>("peak");
  const [peakTarget, setPeakTarget] = useState(-1);
  const [loudTarget, setLoudTarget] = useState(-14);

  const settings: NormalizerSettings = useMemo(
    () => ({ mode, peakTarget, loudTarget }),
    [mode, peakTarget, loudTarget]
  );

  const apply = useCallback(
    (s: NormalizerSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        await report(0.1, "Measuring");
        const beforePeakDb = gainToDb(truePeak(channels));
        const beforeRmsDb = gainToDb(rmsLevel(channels));

        const out = copyChannels(channels);
        let appliedDb = 0;
        let limiterUsed = false;

        if (s.mode === "peak") {
          appliedDb = normalizePeakDb(out, s.peakTarget);
        } else {
          appliedDb = s.loudTarget - beforeRmsDb;
          applyGainDb(out, appliedDb);
          if (gainToDb(truePeak(out)) > -0.1) {
            await limitChannels(out, fs, {
              ceilingDb: -0.3,
              onProgress: async (p) => {
                await report(0.2 + p * 0.75, "Limiting");
              },
            });
            limiterUsed = true;
          }
        }

        await report(0.95, "Measuring");
        const info: NormalizerInfo = {
          beforePeakDb,
          beforeRmsDb,
          afterPeakDb: gainToDb(truePeak(out)),
          afterRmsDb: gainToDb(rmsLevel(out)),
          appliedDb,
          limiterUsed,
        };
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

  const info = proc.result?.info;

  return (
    <ToolPage toolId="normalizer">
      <ToolGrid>
        <ControlsCard
          title="Normalize settings"
          description="Peak mode matches the loudest sample; loudness (RMS) mode matches the average level."
        >
          <SelectRow
            label="Mode"
            value={mode}
            options={[
              { value: "peak", label: "Peak normalize" },
              { value: "rms", label: "Loudness / RMS" },
            ]}
            onChange={(v) => setMode(v)}
            hint="RMS gives consistent perceived volume across tracks"
          />
          <SliderRow
            label="Peak target"
            value={peakTarget}
            min={-6}
            max={-0.1}
            step={0.1}
            onChange={(v) => setPeakTarget(Math.round(v * 10) / 10)}
            format={formatDb}
            hint="Highest sample level after normalization"
            disabled={mode === "rms"}
          />
          <SliderRow
            label="Loudness target"
            value={loudTarget}
            min={-22}
            max={-9}
            step={0.5}
            onChange={(v) => setLoudTarget(Math.round(v * 2) / 2)}
            format={formatDb}
            hint="Average RMS level after normalization"
            disabled={mode === "peak"}
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
              <StatRow label="Peak before" value={formatDb(info.beforePeakDb)} />
              <StatRow
                label="Peak after"
                value={formatDb(info.afterPeakDb)}
                accent
              />
              <StatRow label="RMS before" value={formatDb(info.beforeRmsDb)} />
              <StatRow
                label="RMS after"
                value={formatDb(info.afterRmsDb)}
                accent
              />
              <StatRow label="Applied gain" value={formatDb(info.appliedDb)} />
              {info.limiterUsed ? (
                <InfoBanner variant="warn">
                  Peak protection engaged — the limiter caught transients
                  after normalization.
                </InfoBanner>
              ) : null}
            </ControlsCard>
          ) : (
            <InfoBanner>
              Load a track and its level will be normalized instantly with
              these settings. Toggle between <strong>Original</strong> and{" "}
              <strong>Processed</strong> in the player to hear the difference
              before downloading.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="normalizer"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
