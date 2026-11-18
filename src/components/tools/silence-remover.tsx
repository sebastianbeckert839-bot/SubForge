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
import { envelopeRmsDb, mixdown, type Channels } from "@/lib/audio/dsp";
import { formatTime } from "@/lib/audio/engine";

interface SilenceInfo {
  removedSec: number;
  removedPct: number;
  segments: number;
  newDurationSec: number;
}

interface SilenceRemoverSettings {
  thresholdDb: number;
  minSilenceSec: number;
  paddingMs: number;
}

const fmtSec = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : formatTime(s));

export default function SilenceRemoverTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<SilenceInfo>("silence-remover");
  const { reset } = proc;

  const [thresholdDb, setThresholdDb] = useState(-40);
  const [minSilenceSec, setMinSilenceSec] = useState(0.4);
  const [paddingMs, setPaddingMs] = useState(60);

  const settings: SilenceRemoverSettings = useMemo(
    () => ({ thresholdDb, minSilenceSec, paddingMs }),
    [thresholdDb, minSilenceSec, paddingMs]
  );

  // a new file invalidates the previous result
  useEffect(() => {
    reset();
  }, [channels, reset]);

  const apply = useCallback((s: SilenceRemoverSettings) => {
    if (!channels) return;
    const nCh = channels.length;
    const N = channels[0].length;
    const threshold = s.thresholdDb;
    const minSilence = s.minSilenceSec;
    const padding = s.paddingMs;
    void proc.run(async (report) => {
      await report(0.05, "Detecting silence");

      // 1) per-frame RMS level (20 ms non-overlapping frames)
      const mono = mixdown(channels);
      const frame = Math.max(1, Math.round(fs * 0.02));
      const { envDb } = envelopeRmsDb(mono, frame, frame);
      const frames = envDb.length;

      // 2) group consecutive silent frames; only long-enough runs are removed
      const removed: { s: number; e: number }[] = [];
      let i = 0;
      while (i < frames) {
        if (envDb[i] < threshold) {
          let j = i;
          while (j < frames && envDb[j] < threshold) j++;
          if (((j - i) * frame) / fs >= minSilence) {
            removed.push({ s: i * frame, e: Math.min(N, j * frame) });
          }
          i = j;
        } else {
          i++;
        }
      }

      await report(0.25, "Rebuilding");

      // 3) kept regions = complement of the removed runs, expanded by padding
      const pad = Math.round((padding / 1000) * fs);
      const kept: { s: number; e: number }[] = [];
      let cursor = 0;
      for (const r of removed) {
        if (r.s > cursor) {
          kept.push({ s: Math.max(0, cursor - pad), e: Math.min(N, r.s + pad) });
        }
        cursor = Math.max(cursor, r.e);
      }
      if (cursor < N) kept.push({ s: Math.max(0, cursor - pad), e: N });

      // 4) merge overlapping / adjacent regions
      kept.sort((a, b) => a.s - b.s);
      const merged: { s: number; e: number }[] = [];
      for (const r of kept) {
        const last = merged[merged.length - 1];
        if (last && r.s <= last.e) {
          last.e = Math.max(last.e, r.e);
        } else {
          merged.push({ s: r.s, e: r.e });
        }
      }

      let total = 0;
      for (const r of merged) total += r.e - r.s;
      if (total < fs * 0.25) {
        throw new Error("Almost everything would be removed — try a lower threshold.");
      }

      // 5) concatenate with a 6 ms raised-cosine fade at every region boundary
      const fadeN = Math.max(1, Math.round(0.006 * fs));
      const out: Channels = [];
      for (let c = 0; c < nCh; c++) out.push(new Float32Array(total));
      let pos = 0;
      for (let k = 0; k < merged.length; k++) {
        const r = merged[k];
        const len = r.e - r.s;
        const fn = Math.max(1, Math.min(fadeN, len >> 1));
        for (let c = 0; c < nCh; c++) {
          const src = channels[c];
          const dst = out[c];
          for (let n = 0; n < len; n++) {
            let g = 1;
            if (n < fn) {
              g = 0.5 - 0.5 * Math.cos((Math.PI * n) / fn);
            } else if (n >= len - fn) {
              g = 0.5 - 0.5 * Math.cos((Math.PI * (len - 1 - n)) / fn);
            }
            dst[pos + n] = src[r.s + n] * g;
          }
        }
        pos += len;
        await report(0.3 + 0.65 * ((k + 1) / merged.length), "Rebuilding");
      }
      await report(1);

      return {
        channels: out,
        info: {
          removedSec: (N - total) / fs,
          removedPct: N > 0 ? ((N - total) / N) * 100 : 0,
          segments: removed.length,
          newDurationSec: total / fs,
        },
      };
    });
  }, [channels, fs, proc]);

  useLivePreview(channels, settings, apply, 300);

  const info = proc.result?.info;

  return (
    <ToolPage toolId="silence-remover">
      <ToolGrid>
        <ControlsCard
          title="Detection settings"
          description="Finds silent passages, cuts them out and heals every joint with a 6 ms micro-fade."
        >
          <SliderRow
            label="Silence threshold"
            value={thresholdDb}
            min={-60}
            max={-20}
            step={1}
            onChange={(v) => setThresholdDb(Math.round(v))}
            format={(v) => `${Math.round(v)} dB`}
            hint="Anything quieter than this counts as silence"
          />
          <SliderRow
            label="Min silence length"
            value={minSilenceSec}
            min={0.1}
            max={2}
            step={0.1}
            onChange={(v) => setMinSilenceSec(Math.round(v * 10) / 10)}
            format={(v) => `${v.toFixed(1)} s`}
            hint="Shorter gaps than this are kept"
          />
          <SliderRow
            label="Keep padding"
            value={paddingMs}
            min={0}
            max={200}
            step={10}
            onChange={(v) => setPaddingMs(Math.round(v / 10) * 10)}
            format={(v) => `${Math.round(v)} ms`}
            hint="Extra audio kept on each side of every cut"
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
            <ControlsCard title="Removal summary">
              <StatRow
                label="Silence removed"
                value={`${fmtSec(info.removedSec)} (${info.removedPct.toFixed(1)}%)`}
                accent
              />
              <StatRow label="Segments cut" value={`${info.segments}`} />
              <StatRow
                label="New duration"
                value={fmtSec(info.newDurationSec)}
              />
              <StatRow
                label="Original duration"
                value={formatTime(channels![0].length / fs)}
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Detects and cuts silent passages automatically — perfect for
              podcasts and live recordings. Load a track and tweak the
              detection settings — the cut preview updates itself as you go.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="silence-remover"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
