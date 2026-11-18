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
import {
  gainToDb,
  karaokeChannels,
  limitChannels,
  truePeak,
} from "@/lib/audio/dsp";
import { formatDb } from "@/lib/audio/engine";

interface KaraokeInfo {
  bassKeepPct: number;
  peakDb: number;
}

interface VocalRemoverSettings {
  bassKeep: number;
}

export default function VocalRemoverTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<KaraokeInfo>("vocal-remover");
  const { reset } = proc;

  const [bassKeep, setBassKeep] = useState(60);

  const isStereo = (channels?.length ?? 0) >= 2;

  const settings: VocalRemoverSettings = useMemo(
    () => ({ bassKeep }),
    [bassKeep]
  );

  // a new file invalidates the previous result (mono files can't be processed)
  useEffect(() => {
    reset();
  }, [channels, reset]);

  const apply = useCallback(
    (s: VocalRemoverSettings) => {
      if (!channels || !isStereo) return;
      void proc.run(async (report) => {
        await report(0.1, "Removing vocals");
        const out = await karaokeChannels(channels, fs, s.bassKeep, async (p) => {
          await report(0.1 + p * 0.5, "Removing vocals");
        });
        let peakDb = gainToDb(truePeak(out));
        if (peakDb > -0.1) {
          await limitChannels(out, fs, {
            ceilingDb: -0.3,
            onProgress: async (p) => {
              await report(0.6 + p * 0.4, "Limiting");
            },
          });
          peakDb = gainToDb(truePeak(out));
        }
        await report(1);
        return { channels: out, info: { bassKeepPct: s.bassKeep, peakDb } };
      });
    },
    [channels, fs, isStereo, proc]
  );

  useLivePreview(channels, settings, apply, 250);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="vocal-remover">
      <ToolGrid>
        <ControlsCard
          title="Removal settings"
          description="Center-channel cancellation with adjustable bass retention — instant karaoke."
        >
          {!isStereo ? (
            <InfoBanner variant="warn">
              This tool needs a stereo track — center-channel cancellation
              can&apos;t work on mono audio.
            </InfoBanner>
          ) : null}
          <SliderRow
            label="Keep bass below 170 Hz"
            value={bassKeep}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setBassKeep(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
            hint="How much of the low end survives the cancellation"
            disabled={!isStereo}
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
                label="Bass kept below 170 Hz"
                value={`${info.bassKeepPct}%`}
              />
              <StatRow
                label="Output peak"
                value={formatDb(info.peakDb)}
                accent
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Removes centered content (usually lead vocals) while preserving
              the bass. Stereo effects, harmony and wide instruments survive.
              Load a stereo track and it will be processed instantly.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="vocal-remover"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
