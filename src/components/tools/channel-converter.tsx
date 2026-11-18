"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
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
import { convertChannels, type ChannelMode } from "@/lib/audio/dsp";

interface ConverterInfo {
  inChannels: number;
  outChannels: number;
  mode: ChannelMode;
}

interface ConverterSettings {
  mode: ChannelMode;
}

const MODE_OPTIONS: { value: ChannelMode; label: string }[] = [
  { value: "mono", label: "Mono (downmix)" },
  { value: "stereo", label: "Stereo (upmix)" },
  { value: "left", label: "Left channel only" },
  { value: "right", label: "Right channel only" },
  { value: "swap", label: "Swap L/R" },
];

function channelLabel(n: number): string {
  return `${n} (${n >= 2 ? "stereo" : "mono"})`;
}

export default function ChannelConverterTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<ConverterInfo>("channel-converter");
  const { reset } = proc;

  // null = untouched → derive the default from the loaded file in render
  const [userMode, setUserMode] = useState<ChannelMode | null>(null);
  const mode: ChannelMode =
    userMode ?? (channels && channels.length >= 2 ? "mono" : "stereo");

  const settings: ConverterSettings = useMemo(() => ({ mode }), [mode]);

  const apply = useCallback(
    (s: ConverterSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        await report(0.5, "Converting channels");
        const out = convertChannels(channels, s.mode);
        const info: ConverterInfo = {
          inChannels: channels.length,
          outChannels: out.length,
          mode: s.mode,
        };
        await report(1);
        return { channels: out, info };
      });
    },
    [channels, proc]
  );

  // drop the stale result the moment a different file is loaded
  useEffect(() => {
    reset();
  }, [channels, reset]);

  useLivePreview(channels, settings, apply, 250);

  const info = proc.result?.info;
  const passthrough =
    !!info &&
    ((info.mode === "mono" && info.inChannels === 1) ||
      (info.mode === "stereo" && info.inChannels === 2));

  return (
    <ToolPage toolId="channel-converter">
      <ToolGrid>
        <ControlsCard
          title="Conversion settings"
          description="Downmix to mono, upmix to stereo, extract one side, or swap left and right."
        >
          <SelectRow
            label="Output"
            value={mode}
            options={MODE_OPTIONS}
            onChange={(v) => setUserMode(v)}
            hint="Mono folds both sides into one; single-channel modes play on both ears"
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
              <StatRow label="Input channels" value={channelLabel(info.inChannels)} />
              <StatRow
                label="Output channels"
                value={channelLabel(info.outChannels)}
                accent
              />
              {passthrough ? (
                <InfoBanner>
                  The selected output already matches the input — the track
                  was copied through unchanged.
                </InfoBanner>
              ) : null}
            </ControlsCard>
          ) : (
            <InfoBanner>
              Load a track and it will be converted instantly with these
              settings. Toggle between <strong>Original</strong> and{" "}
              <strong>Processed</strong> in the player to hear the difference
              before downloading.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="channel-converter"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
