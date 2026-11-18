"use client";

import { useCallback, useMemo, useState } from "react";
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
import { ABPlayer, type Selection } from "@/components/ab-player";
import { DownloadPanel } from "@/components/download-panel";
import { useAudioStore } from "@/store/audio";
import { useProcessor } from "@/hooks/use-processor";
import { fadeInOut, sliceChannels } from "@/lib/audio/dsp";
import { formatTime } from "@/lib/audio/engine";

interface TrimInfo {
  durationSec: number;
  regionStart: number;
  regionEnd: number;
  fadeInSec: number;
  fadeOutSec: number;
}

interface TrimSettings {
  start: number | null;
  end: number | null;
  fadeIn: number;
  fadeOut: number;
}

const fadeText = (sec: number) => (sec > 0 ? `${sec.toFixed(1)} s` : "None");

/**
 * The player ignores drag-to-select while its `selection` prop is null, so a
 * degenerate no-op selection (draws no overlay, keeps the preview idle) is
 * passed until the user drags a real region.
 */
const NO_SELECTION: Selection = { start: 0, end: 0 };

export default function TrimTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<TrimInfo>("trim");
  const { reset } = proc;

  const [selection, setSelection] = useState<Selection | null>(null);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  // a new file invalidates the old selection and result — render-phase reset
  // (the documented "adjust state when a prop changes" pattern)
  const [prevChannels, setPrevChannels] = useState(channels);
  if (channels !== prevChannels) {
    setPrevChannels(channels);
    setSelection(null);
    reset();
  }

  const settings: TrimSettings = useMemo(
    () => ({
      start: selection?.start ?? null,
      end: selection?.end ?? null,
      fadeIn,
      fadeOut,
    }),
    [selection, fadeIn, fadeOut]
  );

  const apply = useCallback((s: TrimSettings) => {
    // no selection (or a degenerate one) yet — nothing to preview
    if (!channels || s.start == null || s.end == null) return;
    if (s.end - s.start <= 0.05) return;
    const sel: Selection = { start: s.start, end: s.end };
    void proc.run(async (report) => {
      await report(0.2, "Trimming");
      const startSample = Math.floor(sel.start * fs);
      const endSample = Math.ceil(sel.end * fs);
      // sliceChannels returns fresh arrays, so the in-place fade is safe
      const out = sliceChannels(channels, startSample, endSample);
      if (out[0].length === 0) {
        throw new Error("The selected region is empty — drag a larger area on the waveform.");
      }
      fadeInOut(out, fs, s.fadeIn, s.fadeOut);
      await report(1);
      return {
        channels: out,
        info: {
          durationSec: out[0].length / fs,
          regionStart: sel.start,
          regionEnd: sel.end,
          fadeInSec: s.fadeIn,
          fadeOutSec: s.fadeOut,
        },
      };
    });
  }, [channels, fs, proc]);

  useLivePreview(channels, settings, apply, 300);

  const handleSelectionChange = useCallback((sel: Selection | null) => {
    if (!sel) {
      setSelection(null);
      return;
    }
    setSelection({
      start: Math.max(0, sel.start),
      end: Math.max(0, sel.end),
    });
  }, []);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="trim">
      <ToolGrid>
        <ControlsCard
          title="Trim settings"
          description="Pick a region on the waveform, then cut it out with optional smooth fades."
        >
          <SliderRow
            label="Fade in"
            value={fadeIn}
            min={0}
            max={5}
            step={0.1}
            onChange={(v) => setFadeIn(Math.round(v * 10) / 10)}
            format={(v) => `${v.toFixed(1)} s`}
            hint="Smooth cosine ramp at the start of the cut"
          />
          <SliderRow
            label="Fade out"
            value={fadeOut}
            min={0}
            max={5}
            step={0.1}
            onChange={(v) => setFadeOut(Math.round(v * 10) / 10)}
            format={(v) => `${v.toFixed(1)} s`}
            hint="Smooth cosine ramp at the end of the cut"
          />
          <InfoBanner>
            Drag across the waveform to select the region you want to keep.
            Click to seek. Drag either orange edge to fine-tune the boundaries.
          </InfoBanner>
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
            selection={selection ?? NO_SELECTION}
            onSelectionChange={handleSelectionChange}
            hint="Live preview — keep it playing while you tweak, the track updates itself"
          />
          {proc.error ? (
            <InfoBanner variant="warn">{proc.error}</InfoBanner>
          ) : null}
          {info ? (
            <ControlsCard title="Trim result">
              <StatRow
                label="New duration"
                value={formatTime(info.durationSec)}
                accent
              />
              <StatRow
                label="Region"
                value={`${formatTime(info.regionStart)} – ${formatTime(info.regionEnd)}`}
              />
              <StatRow label="Fade in" value={fadeText(info.fadeInSec)} />
              <StatRow label="Fade out" value={fadeText(info.fadeOutSec)} />
            </ControlsCard>
          ) : null}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="trim"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
