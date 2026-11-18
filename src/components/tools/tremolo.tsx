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
import {
  gainToDb,
  truePeak,
  tremoloChannels,
  type TremoloWave,
} from "@/lib/audio/dsp";

interface TremoloInfo {
  rateHz: number;
  depthPct: number;
  wave: TremoloWave;
  phaseDeg: number;
  peakDb: number;
}

interface TremoloSettings {
  rate: number;
  depth: number;
  wave: TremoloWave;
  phase: number;
}

const WAVE_LABELS: Record<TremoloWave, string> = {
  sine: "Sine",
  triangle: "Triangle",
  square: "Square",
};

export default function TremoloTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<TremoloInfo>("tremolo");

  const [rate, setRate] = useState(4);
  const [depth, setDepth] = useState(70);
  const [wave, setWave] = useState<TremoloWave>("sine");
  const [phase, setPhase] = useState(0);

  const isStereo = channels !== null && channels.length > 1;

  const settings: TremoloSettings = useMemo(
    () => ({
      rate,
      depth,
      wave,
      phase: isStereo ? phase : 0,
    }),
    [rate, depth, wave, phase, isStereo]
  );

  const apply = useCallback(
    (s: TremoloSettings) => {
      if (!channels) return;
      void proc.run(async (report) => {
        const out = await tremoloChannels(channels, fs, {
          rateHz: s.rate,
          depthPct: s.depth,
          wave: s.wave,
          stereoPhaseDeg: s.phase,
          onProgress: report,
        });
        await report(1);
        return {
          channels: out,
          info: {
            rateHz: s.rate,
            depthPct: s.depth,
            wave: s.wave,
            phaseDeg: s.phase,
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

  // live preview — a simple sample loop, standard debounce
  useLivePreview(channels, settings, apply, 250);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="tremolo">
      <ToolGrid>
        <ControlsCard
          title="Tremolo"
          description="Classic amplitude modulation — pick a shape, set the pulse, and let your track breathe."
        >
          <SliderRow
            label="Rate"
            value={rate}
            min={0.5}
            max={12}
            step={0.1}
            onChange={(v) => setRate(Math.round(v * 10) / 10)}
            format={(v) => `${v.toFixed(1)} Hz`}
            hint="How many volume pulses per second"
          />
          <SliderRow
            label="Depth"
            value={depth}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setDepth(Math.round(v))}
            format={(v) => `${Math.round(v)}%`}
            hint="How far the volume dips"
          />
          <SelectRow<TremoloWave>
            label="Waveform"
            value={wave}
            options={[
              { value: "sine", label: "Sine — smooth pulse" },
              { value: "triangle", label: "Triangle — linear swell" },
              { value: "square", label: "Square — choppy gate" },
            ]}
            onChange={setWave}
          />
          <SliderRow
            label="Stereo phase"
            value={phase}
            min={0}
            max={180}
            step={1}
            onChange={(v) => setPhase(Math.round(v))}
            format={(v) => `${Math.round(v)}°`}
            hint="Offsets left and right LFOs for an auto-pan feel"
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
                label="Rate"
                value={`${info.rateHz.toFixed(1)} Hz`}
                accent
              />
              <StatRow label="Depth" value={`${info.depthPct}%`} />
              <StatRow label="Waveform" value={WAVE_LABELS[info.wave]} />
              {isStereo ? (
                <StatRow
                  label="Stereo phase"
                  value={info.phaseDeg > 0 ? `${info.phaseDeg}°` : "Off"}
                />
              ) : null}
              <StatRow
                label="Output peak"
                value={`${info.peakDb.toFixed(1)} dB`}
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Volume that pulses in time — subtle shimmer at low depth, or a
              full rhythmic chop with the square wave.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="tremolo"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
