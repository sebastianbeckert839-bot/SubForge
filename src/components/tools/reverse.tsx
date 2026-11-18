"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  StatRow,
  InfoBanner,
  LiveStatus,
  useLivePreview,
} from "@/components/tool-ui";
import { ABPlayer } from "@/components/ab-player";
import { DownloadPanel } from "@/components/download-panel";
import { useAudioStore } from "@/store/audio";
import { useProcessor } from "@/hooks/use-processor";
import { reverseChannels } from "@/lib/audio/dsp";
import { formatTime } from "@/lib/audio/engine";

interface ReverseInfo {
  durationSec: number;
}

/** No controls — a constant settings object means the track is reversed
 *  exactly once per loaded file. */
type ReverseSettings = Record<string, never>;

export default function ReverseTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<ReverseInfo>("reverse");
  const { reset } = proc;

  const settings: ReverseSettings = useMemo<ReverseSettings>(() => ({}), []);

  const apply = useCallback(
    (_settings: ReverseSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        await report(0.5, "Reversing");
        const out = reverseChannels(channels);
        const info: ReverseInfo = { durationSec: out[0].length / fs };
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
    <ToolPage toolId="reverse">
      <ToolGrid>
        <ControlsCard
          title="How it works"
          description="No settings needed — the whole track is flipped in one pass."
        >
          <InfoBanner>
            Flips the entire track end-to-end — reversals, transitions and
            hidden messages.
          </InfoBanner>
          <LiveStatus
            running={proc.isRunning}
            progress={proc.progress}
            stage={proc.stage}
            idleText="Live preview — the track reverses the moment a file loads"
          />
        </ControlsCard>

        <div className="flex flex-col gap-6">
          <ABPlayer
            original={channels!}
            processed={proc.result?.channels ?? null}
            fs={fs}
            hint="Live preview — the track reverses the moment a file loads"
          />
          {proc.error ? (
            <InfoBanner variant="warn">{proc.error}</InfoBanner>
          ) : null}
          {info ? (
            <ControlsCard title="Output analysis">
              <StatRow
                label="Duration"
                value={formatTime(info.durationSec)}
                accent
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Load a track and it will be reversed instantly. Toggle between{" "}
              <strong>Original</strong> and <strong>Processed</strong> in the
              player to hear the difference before downloading.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="reverse"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
