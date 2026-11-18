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
import { renderReverb } from "@/lib/audio/offline";
import { formatTime } from "@/lib/audio/engine";

type ReverbMode = "room" | "hall" | "echo";

interface ReverbInfo {
  mode: ReverbMode;
  wetPct: number;
  tailSec: number;
}

interface ReverbSettings {
  mode: ReverbMode;
  decay: number;
  damping: number;
  delay: number;
  feedback: number;
  mix: number;
}

const MODE_LABELS: Record<ReverbMode, string> = {
  room: "Room",
  hall: "Hall",
  echo: "Echo",
};

export default function ReverbTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<ReverbInfo>("reverb");

  const [mode, setMode] = useState<ReverbMode>("room");
  const [decay, setDecay] = useState(0.8);
  const [damping, setDamping] = useState(50);
  const [delay, setDelay] = useState(0.25);
  const [feedback, setFeedback] = useState(45);
  const [mix, setMix] = useState(30);

  const settings: ReverbSettings = useMemo(
    () => ({ mode, decay, damping, delay, feedback, mix }),
    [mode, decay, damping, delay, feedback, mix]
  );

  const apply = useCallback(
    (s: ReverbSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        const out = await renderReverb(
          channels,
          fs,
          {
            mode: s.mode,
            decaySec: s.decay,
            damping: s.damping / 100,
            mix: s.mix / 100,
            echoDelaySec: s.delay,
            echoFeedback: s.feedback / 100,
          },
          report
        );
        await report(1);
        const inputDuration = channels[0].length / fs;
        const outDuration = out[0].length / fs;
        return {
          channels: out,
          info: {
            mode: s.mode,
            wetPct: s.mix,
            tailSec: outDuration - inputDuration,
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

  // live preview — convolution rendering is CPU heavy, debounce a bit longer
  useLivePreview(channels, settings, apply, 400);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="reverb">
      <ToolGrid>
        <ControlsCard
          title="Reverb settings"
          description="Pick a space and dial it in — every mode is rendered offline with a hand-rolled impulse response."
        >
          <SelectRow<ReverbMode>
            label="Mode"
            value={mode}
            options={[
              { value: "room", label: "Room — tight ambience" },
              { value: "hall", label: "Hall — big and lush" },
              { value: "echo", label: "Echo — rhythmic repeats" },
            ]}
            onChange={(m) => {
              setMode(m);
              if (m === "room") setDecay(0.8);
              else if (m === "hall") setDecay(2.5);
            }}
          />
          {mode !== "echo" ? (
            <>
              <SliderRow
                label="Decay"
                value={decay}
                min={0.2}
                max={6}
                log
                onChange={(v) => setDecay(Math.round(v * 100) / 100)}
                format={(v) => `${v.toFixed(2)} s`}
                hint="How long the tail rings out"
              />
              <SliderRow
                label="Damping"
                value={damping}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setDamping(Math.round(v))}
                format={(v) => `${Math.round(v)}%`}
                hint="Higher = darker, warmer tail"
              />
            </>
          ) : (
            <>
              <SliderRow
                label="Delay"
                value={delay}
                min={0.05}
                max={1.0}
                step={0.01}
                onChange={(v) => setDelay(Math.round(v * 100) / 100)}
                format={(v) => `${v.toFixed(2)} s`}
                hint="Time between repeats"
              />
              <SliderRow
                label="Feedback"
                value={feedback}
                min={0}
                max={90}
                step={1}
                onChange={(v) => setFeedback(Math.round(v))}
                format={(v) => `${Math.round(v)}%`}
                hint="How many repeats"
              />
            </>
          )}
          <SliderRow
            label="Wet mix"
            value={mix}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setMix(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
            hint="Balance between the dry signal and the effect"
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
                label="Mode"
                value={MODE_LABELS[info.mode]}
                accent
              />
              <StatRow label="Wet mix" value={`${info.wetPct}%`} />
              <StatRow
                label="Added tail"
                value={formatTime(info.tailSec)}
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Convolution reverb rendered with a hand-rolled impulse response —
              rooms, halls, or classic echo.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="reverb"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
