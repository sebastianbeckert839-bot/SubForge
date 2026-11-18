"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  StatRow,
  InfoBanner,
  LiveStatus,
  useLivePreview,
} from "@/components/tool-ui";
import { ABPlayer } from "@/components/ab-player";
import { DownloadPanel } from "@/components/download-panel";
import { useAudioStore } from "@/store/audio";
import { useProcessor } from "@/hooks/use-processor";
import { render8d } from "@/lib/audio/offline";

interface EightDInfo {
  periodSec: number;
  widthPct: number;
  roomPct: number;
}

interface EightDSettings {
  period: number;
  width: number;
  room: number;
}

export default function EightDAudioTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<EightDInfo>("8d-audio");

  const [period, setPeriod] = useState(8);
  const [width, setWidth] = useState(85);
  const [room, setRoom] = useState(25);

  const settings: EightDSettings = useMemo(
    () => ({ period, width, room }),
    [period, width, room]
  );

  const apply = useCallback(
    (s: EightDSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        const out = await render8d(
          channels,
          fs,
          { periodSec: s.period, width: s.width / 100, roomMix: s.room / 100 },
          report
        );
        await report(1);
        return {
          channels: out,
          info: { periodSec: s.period, widthPct: s.width, roomPct: s.room },
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

  // live preview — the room convolution makes this a heavier render
  useLivePreview(channels, settings, apply, 400);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="8d-audio">
      <ToolGrid>
        <ControlsCard
          title="Rotation"
          description="The mix is collapsed to mono and spun around your head with equal-power panning and a touch of room."
        >
          <SliderRow
            label="Rotation speed"
            value={period}
            min={2}
            max={20}
            step={1}
            onChange={(v) => setPeriod(Math.round(v))}
            format={(v) => `${v.toFixed(0)} s / turn`}
            hint="Seconds for one full orbit"
          />
          <SliderRow
            label="Rotation width"
            value={width}
            min={50}
            max={100}
            step={1}
            onChange={(v) => setWidth(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
          />
          <SliderRow
            label="Room feel"
            value={room}
            min={0}
            max={60}
            step={1}
            onChange={(v) => setRoom(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
          />
          <LiveStatus
            running={proc.isRunning}
            progress={proc.progress}
            stage={proc.stage}
          />
        </ControlsCard>

        <div className="flex flex-col gap-6">
          <InfoBanner>
            Headphones recommended — the sound orbits around your head.
          </InfoBanner>
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
                label="Rotation period"
                value={`${info.periodSec.toFixed(0)} s / turn`}
                accent
              />
              <StatRow label="Width" value={`${info.widthPct}%`} />
              <StatRow label="Room mix" value={`${info.roomPct}%`} />
            </ControlsCard>
          ) : (
            <InfoBanner>
              The track is processed automatically with these settings.
              Toggle between <strong>Original</strong> and{" "}
              <strong>Processed</strong> in the player to hear the difference
              before downloading.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="8d-audio"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
