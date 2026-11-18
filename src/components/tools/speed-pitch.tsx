"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  ToggleRow,
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

interface SpeedPitchInfo {
  newDurationSec: number;
  limiterUsed: boolean;
}

interface SpeedPitchSettings {
  speed: number;
  semitones: number;
  preservePitch: boolean;
}

export default function SpeedPitchTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<SpeedPitchInfo>("speed-pitch");

  const [speed, setSpeed] = useState(1);
  const [preservePitch, setPreservePitch] = useState(true);
  const [semitones, setSemitones] = useState(0);
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const settings: SpeedPitchSettings = useMemo(
    () => ({ speed, semitones, preservePitch }),
    [speed, semitones, preservePitch]
  );

  const apply = useCallback(
    (s: SpeedPitchSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        const out = await speedAndPitchChannels(
          channels,
          fs,
          { speed: s.speed, semitones: s.semitones, preservePitch: s.preservePitch },
          report
        );
        // peak-protect: resampling can overshoot transients slightly
        let limiterUsed = false;
        if (gainToDb(truePeak(out)) > -0.05) {
          await report(0.96, "Peak protection");
          await limitChannels(out, fs, { ceilingDb: -0.3 });
          limiterUsed = true;
        }
        await report(1);
        return {
          channels: out,
          info: {
            newDurationSec: out[0].length / fs,
            limiterUsed,
          },
        };
      });
    },
    [channels, fs, proc]
  );

  // drop the stale result the moment a different file is loaded
  const reset = proc.reset;
  useEffect(() => {
    reset();
  }, [channels, reset]);

  // live preview — WSOLA time-stretching is CPU heavy, debounce a bit longer
  useLivePreview(channels, settings, apply, 400);

  const presets = [
    {
      label: "0.75x slowed",
      apply: () => {
        setSpeed(0.75);
        setActivePreset("0.75x slowed");
      },
    },
    {
      label: "Original",
      apply: () => {
        setSpeed(1);
        setSemitones(0);
        setPreservePitch(true);
        setActivePreset("Original");
      },
    },
    {
      label: "1.25x faster",
      apply: () => {
        setSpeed(1.25);
        setActivePreset("1.25x faster");
      },
    },
    {
      label: "1.5x fast",
      apply: () => {
        setSpeed(1.5);
        setActivePreset("1.5x fast");
      },
    },
  ];

  const info = proc.result?.info;

  const vinylSemi = 12 * Math.log2(speed);
  const pitchText = preservePitch
    ? semitones === 0
      ? "original"
      : `${semitones > 0 ? "+" : ""}${semitones} st`
    : speed === 1
      ? "original"
      : `${vinylSemi > 0 ? "+" : ""}${vinylSemi.toFixed(1)} st (follows speed)`;

  return (
    <ToolPage toolId="speed-pitch">
      <ToolGrid>
        <ControlsCard
          title="Speed & pitch"
          description="Change tempo from 0.5x to 2x and shift pitch up to ±12 semitones — independently."
        >
          <PresetChips presets={presets} active={activePreset} />
          <SliderRow
            label="Speed"
            value={speed}
            min={0.5}
            max={2}
            step={0.01}
            onChange={(v) => {
              setSpeed(Math.round(v * 100) / 100);
              setActivePreset(undefined);
            }}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="100% = original tempo"
          />
          <ToggleRow
            label="Preserve pitch"
            description="Keep the original pitch while changing tempo"
            checked={preservePitch}
            onChange={setPreservePitch}
          />
          <SliderRow
            label="Pitch shift"
            value={semitones}
            min={-12}
            max={12}
            step={1}
            onChange={(v) => {
              setSemitones(Math.round(v));
              setActivePreset(undefined);
            }}
            format={(v) => `${v > 0 ? "+" : ""}${v} st`}
            disabled={!preservePitch}
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
                label="Speed"
                value={`${Math.round(speed * 100)}%`}
              />
              <StatRow label="Pitch" value={pitchText} />
              <StatRow
                label="Peak protection"
                value={info.limiterUsed ? "limiter engaged" : "not needed"}
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Change tempo and pitch independently. Turn off pitch preservation
              for classic vinyl-style speedup.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="speed-pitch"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
