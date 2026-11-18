"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
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
import { gainToDb, limitChannels, truePeak } from "@/lib/audio/dsp";
import { speedAndPitchChannels } from "@/lib/audio/wsola";
import { formatTime } from "@/lib/audio/engine";

interface NightcoreInfo {
  newDurationSec: number;
  intensityPct: number;
}

interface NightcoreSettings {
  intensity: number;
}

export default function NightcoreTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<NightcoreInfo>("nightcore");

  const [intensity, setIntensity] = useState(1.25);
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const settings: NightcoreSettings = useMemo(
    () => ({ intensity }),
    [intensity]
  );

  const apply = useCallback(
    (s: NightcoreSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        // vinyl mode — pitch rises with the speed, single clean resample
        const out = await speedAndPitchChannels(
          channels,
          fs,
          { speed: s.intensity, semitones: 0, preservePitch: false },
          report
        );
        if (gainToDb(truePeak(out)) > -0.05) {
          await report(0.96, "Peak protection");
          await limitChannels(out, fs, { ceilingDb: -0.3 });
        }
        await report(1);
        return {
          channels: out,
          info: {
            newDurationSec: out[0].length / fs,
            intensityPct: Math.round(s.intensity * 100),
          },
        };
      });
    },
    [channels, fs, proc]
  );

  // drop the stale result the moment a different file is loaded
  const { reset } = proc;
  useEffect(() => {
    reset();
  }, [channels, reset]);

  // live preview — a single resample is cheap, re-run quickly
  useLivePreview(channels, settings, apply, 250);

  const presets = [
    {
      label: "Subtle 115%",
      apply: () => {
        setIntensity(1.15);
        setActivePreset("Subtle 115%");
      },
    },
    {
      label: "Classic 125%",
      apply: () => {
        setIntensity(1.25);
        setActivePreset("Classic 125%");
      },
    },
    {
      label: "Fast 135%",
      apply: () => {
        setIntensity(1.35);
        setActivePreset("Fast 135%");
      },
    },
    {
      label: "Extreme 150%",
      apply: () => {
        setIntensity(1.5);
        setActivePreset("Extreme 150%");
      },
    },
  ];

  const info = proc.result?.info;
  const semis = info ? 12 * Math.log2(info.intensityPct / 100) : 0;

  return (
    <ToolPage toolId="nightcore">
      <ToolGrid>
        <ControlsCard
          title="Nightcore intensity"
          description="One slider — the track speeds up and the pitch rises with it, exactly like a record spun faster."
        >
          <PresetChips presets={presets} active={activePreset} />
          <SliderRow
            label="Intensity"
            value={intensity}
            min={1.0}
            max={1.5}
            step={0.01}
            onChange={(v) => {
              setIntensity(Math.round(v * 100) / 100);
              setActivePreset(undefined);
            }}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="Speed and pitch rise together, vinyl style"
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
              <StatRow
                label="New duration"
                value={formatTime(info.newDurationSec)}
                accent
              />
              <StatRow
                label="Speedup"
                value={`${info.intensityPct}%`}
              />
              <StatRow
                label="Pitch shift"
                value={`${semis > 0 ? "+" : ""}${semis.toFixed(1)} st`}
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              The classic nightcore treatment — one slider, instant serotonin.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="nightcore"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
