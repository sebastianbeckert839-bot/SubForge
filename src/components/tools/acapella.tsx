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
  isolateVocalsChannels,
  limitChannels,
  truePeak,
} from "@/lib/audio/dsp";
import { formatDb, formatHz } from "@/lib/audio/engine";

interface AcapellaInfo {
  lowCutHz: number;
  highCutHz: number;
  peakDb: number;
}

interface AcapellaSettings {
  lowCut: number;
  highCut: number;
}

export default function AcapellaTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<AcapellaInfo>("acapella");
  const { reset } = proc;

  const [lowCut, setLowCut] = useState(110);
  const [highCut, setHighCut] = useState(9000);

  const isStereo = (channels?.length ?? 0) >= 2;

  const settings: AcapellaSettings = useMemo(
    () => ({ lowCut, highCut }),
    [lowCut, highCut]
  );

  // a new file invalidates the previous result (mono files can't be processed)
  useEffect(() => {
    reset();
  }, [channels, reset]);

  const apply = useCallback(
    (s: AcapellaSettings) => {
      if (!channels || !isStereo) return;
      void proc.run(async (report) => {
        await report(0.1, "Isolating vocals");
        const out = await isolateVocalsChannels(channels, fs, s.lowCut, s.highCut, async (p) => {
          await report(0.1 + p * 0.5, "Isolating vocals");
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
        return { channels: out, info: { lowCutHz: s.lowCut, highCutHz: s.highCut, peakDb } };
      });
    },
    [channels, fs, isStereo, proc]
  );

  useLivePreview(channels, settings, apply, 250);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="acapella">
      <ToolGrid>
        <ControlsCard
          title="Isolation settings"
          description="Keeps the centered mid band where lead vocals live and filters out the rest."
        >
          {!isStereo ? (
            <InfoBanner variant="warn">
              This tool needs a stereo track — the mid/side isolation
              can&apos;t work on mono audio.
            </InfoBanner>
          ) : null}
          <SliderRow
            label="Low cut"
            value={lowCut}
            min={40}
            max={300}
            log
            onChange={(v) => setLowCut(Math.round(v))}
            format={formatHz}
            hint="Removes bass and kick"
            disabled={!isStereo}
          />
          <SliderRow
            label="High cut"
            value={highCut}
            min={3000}
            max={14000}
            log
            onChange={(v) => setHighCut(Math.round(v / 50) * 50)}
            format={formatHz}
            hint="Removes cymbals and hiss"
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
              <StatRow label="Low cut" value={formatHz(info.lowCutHz)} />
              <StatRow label="High cut" value={formatHz(info.highCutHz)} />
              <StatRow
                label="Output peak"
                value={formatDb(info.peakDb)}
                accent
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Isolates the centered mid signal — lead vocals pop out, wide
              instruments fade. Quality depends heavily on the mix. Load a
              stereo track and it will be processed instantly.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="acapella"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
