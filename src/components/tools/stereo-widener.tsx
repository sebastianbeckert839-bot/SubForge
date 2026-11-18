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
import { gainToDb, truePeak, widenChannels } from "@/lib/audio/dsp";

interface WidenInfo {
  widthPct: number;
  haasOn: boolean;
  haasMs: number;
  peakDb: number;
}

interface WidenSettings {
  width: number;
  haasOn: boolean;
  haasMs: number;
}

export default function StereoWidenerTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<WidenInfo>("stereo-widener");

  const [width, setWidth] = useState(100);
  const [haasOn, setHaasOn] = useState(false);
  const [haasMs, setHaasMs] = useState(12);

  const isMono = channels !== null && channels.length === 1;
  const effectiveHaas = haasOn && !isMono;

  const settings: WidenSettings = useMemo(
    () => ({ width, haasOn: effectiveHaas, haasMs }),
    [width, effectiveHaas, haasMs]
  );

  const apply = useCallback(
    (s: WidenSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        const out = await widenChannels(channels, fs, {
          widthPct: s.width,
          haasOn: s.haasOn,
          haasMs: s.haasMs,
          onProgress: report,
        });
        await report(1);
        return {
          channels: out,
          info: {
            widthPct: s.width,
            haasOn: s.haasOn,
            haasMs: s.haasMs,
            peakDb: gainToDb(truePeak(out)),
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

  // live preview — mid/side processing is cheap, standard debounce
  useLivePreview(channels, settings, apply, 250);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="stereo-widener">
      <ToolGrid>
        <ControlsCard
          title="Stereo width"
          description="Mid/side based width control — collapse to mono or stretch past the speakers, with optional Haas enhancement."
        >
          <SliderRow
            label="Width"
            value={width}
            min={0}
            max={200}
            step={1}
            onChange={(v) => setWidth(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
            hint="0% = mono, 100% = untouched, 200% = extra wide"
            disabled={isMono}
          />
          <ToggleRow
            label="Haas delay"
            description="Delay one side a few milliseconds for instant width"
            checked={effectiveHaas}
            onChange={setHaasOn}
          />
          <SliderRow
            label="Haas delay time"
            value={haasMs}
            min={5}
            max={30}
            step={1}
            onChange={(v) => setHaasMs(Math.round(v))}
            format={(v) => `${Math.round(v)} ms`}
            disabled={!effectiveHaas}
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
          {isMono ? (
            <InfoBanner variant="warn">
              This file is mono — widening needs a stereo track. Load a stereo
              file (or duplicate the channel via the Channel Converter) to use
              this tool.
            </InfoBanner>
          ) : null}
          {info && !isMono ? (
            <ControlsCard title="Output analysis">
              <StatRow
                label="Width"
                value={`${info.widthPct}%`}
                accent
              />
              <StatRow
                label="Haas delay"
                value={info.haasOn ? `${info.haasMs} ms` : "Off"}
              />
              <StatRow
                label="Output peak"
                value={`${info.peakDb.toFixed(1)} dB`}
              />
            </ControlsCard>
          ) : null}
          {!info && !isMono ? (
            <InfoBanner>
              100% is your original stereo image. Push toward 200% for
              headphone-filling width, or down to 0% for a tight mono fold.
            </InfoBanner>
          ) : null}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="stereo-widener"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
