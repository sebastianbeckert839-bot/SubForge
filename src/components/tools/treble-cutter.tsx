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
import { filterChannels } from "@/lib/audio/dsp";
import { formatHz } from "@/lib/audio/engine";

interface CutterInfo {
  cutoffHz: number;
  slope: number;
}

interface CutterSettings {
  cutoff: number;
  slope: number;
}

const SLOPE_OPTIONS = [
  { value: 12, label: "12 dB/oct — gentle" },
  { value: 24, label: "24 dB/oct — standard" },
  { value: 36, label: "36 dB/oct — steep" },
  { value: 48, label: "48 dB/oct — brickwall" },
];

export default function TrebleCutterTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<CutterInfo>("treble-cutter");
  const { reset } = proc;

  const [cutoff, setCutoff] = useState(12000);
  const [slope, setSlope] = useState(24);

  const settings: CutterSettings = useMemo(
    () => ({ cutoff, slope }),
    [cutoff, slope]
  );

  const apply = useCallback(
    (s: CutterSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        await report(0.02);
        const out = await filterChannels(
          channels,
          fs,
          { type: "lowpass", freq: s.cutoff },
          Math.round(s.slope / 12),
          report
        );
        await report(1);
        return {
          channels: out,
          info: { cutoffHz: Math.round(s.cutoff), slope: s.slope },
        };
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
    <ToolPage toolId="treble-cutter">
      <ToolGrid>
        <ControlsCard
          title="Cut settings"
          description="A smooth low-pass filter — the low end and mids stay untouched."
        >
          <SliderRow
            label="Cut above"
            value={cutoff}
            min={500}
            max={18000}
            log
            onChange={(v) => setCutoff(Math.round(v))}
            format={(v) => `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz`}
            hint="Everything above this frequency is rolled off"
          />
          <SelectRow
            label="Slope"
            value={slope}
            options={SLOPE_OPTIONS}
            onChange={(v) => setSlope(v)}
            hint="Steeper slopes darken the track faster"
          />
          <InfoBanner>
            Rolls off harsh highs — great for dark, lo-fi edits or taming
            bright masters.
          </InfoBanner>
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
              <StatRow label="Cutoff" value={formatHz(info.cutoffHz)} accent />
              <StatRow label="Slope" value={`${info.slope} dB/oct`} />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Load a track and the cut will be applied instantly with these
              settings. Toggle between <strong>Original</strong> and{" "}
              <strong>Processed</strong> in the player to hear the difference
              before downloading.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="treble-cutter"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
