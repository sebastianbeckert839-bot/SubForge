"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  ToggleRow,
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
import { renderReverb } from "@/lib/audio/offline";
import { formatTime } from "@/lib/audio/engine";

interface SlowedInfo {
  newDurationSec: number;
  reverbOn: boolean;
}

interface SlowedSettings {
  speed: number;
  reverbOn: boolean;
  amount: number;
}

export default function SlowedTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<SlowedInfo>("slowed");

  const [speed, setSpeed] = useState(0.85);
  const [reverbOn, setReverbOn] = useState(true);
  const [amount, setAmount] = useState(35);

  const settings: SlowedSettings = useMemo(
    () => ({ speed, reverbOn, amount }),
    [speed, reverbOn, amount]
  );

  const apply = useCallback(
    (s: SlowedSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        // 1) vinyl-style slowdown — pitch drops with the tempo
        let out = await speedAndPitchChannels(
          channels,
          fs,
          { speed: s.speed, semitones: 0, preservePitch: false },
          async (frac, stage) => {
            await report(s.reverbOn ? frac * 0.7 : frac, stage);
          }
        );
        // 2) the signature hall wash
        if (s.reverbOn) {
          out = await renderReverb(
            out,
            fs,
            { mode: "hall", decaySec: 2.6, damping: 0.45, mix: s.amount / 100 },
            async (frac, stage) => {
              await report(0.7 + frac * 0.3, stage);
            }
          );
        }
        if (gainToDb(truePeak(out)) > -0.05) {
          await report(0.97, "Peak protection");
          await limitChannels(out, fs, { ceilingDb: -0.3 });
        }
        await report(1);
        return {
          channels: out,
          info: {
            newDurationSec: out[0].length / fs,
            reverbOn: s.reverbOn,
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

  // live preview — hall convolution on top of the resample is CPU heavy
  useLivePreview(channels, settings, apply, 400);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="slowed">
      <ToolGrid>
        <ControlsCard
          title="Slowed + reverb"
          description="A vinyl-style slowdown with a lush hall behind it — the sound of a million late-night edits."
        >
          <SliderRow
            label="Speed"
            value={speed}
            min={0.7}
            max={1}
            step={0.01}
            onChange={(v) => setSpeed(Math.round(v * 100) / 100)}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="Pitch drops with the tempo, vinyl style"
          />
          <ToggleRow
            label="Add reverb"
            description="Hall reverb, 35% wet — the signature sound"
            checked={reverbOn}
            onChange={setReverbOn}
          />
          <SliderRow
            label="Reverb amount"
            value={amount}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setAmount(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
            disabled={!reverbOn}
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
              <StatRow
                label="Reverb"
                value={
                  info.reverbOn
                    ? `Hall, ${Math.round(amount)}% wet`
                    : "Off"
                }
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Slow it down, drench it in hall reverb. The sound of a million
              late-night edits.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="slowed"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
