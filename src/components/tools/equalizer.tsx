"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  PresetChips,
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
  applyBiquadInPlace,
  biquadMagnitudeAt,
  copyChannels,
  designBiquad,
  gainToDb,
  limitChannels,
  truePeak,
  type BiquadSpec,
  type BiquadType,
} from "@/lib/audio/dsp";
import { formatDb } from "@/lib/audio/engine";

interface EqBand {
  type: BiquadType;
  freq: number;
  q?: number;
  label: string;
}

const EQ_BANDS: EqBand[] = [
  { type: "lowshelf", freq: 60, label: "60 Hz (low shelf)" },
  { type: "peaking", freq: 250, q: 1, label: "250 Hz" },
  { type: "peaking", freq: 1000, q: 1, label: "1 kHz" },
  { type: "peaking", freq: 3500, q: 1, label: "3.5 kHz" },
  { type: "highshelf", freq: 12000, label: "12 kHz (high shelf)" },
];

const EQ_PRESETS: { label: string; gains: number[] }[] = [
  { label: "Flat", gains: [0, 0, 0, 0, 0] },
  { label: "Bass +", gains: [7, 3, 0, 0, 0] },
  { label: "Vocal", gains: [-2, 3, 4, 2, 0] },
  { label: "Loudness", gains: [5, -2, 0, 3, 6] },
  { label: "Lo-fi", gains: [4, 0, -2, -8, -11] },
];

const CURVE_HEIGHT = 140;
const F_MIN = 20;
const F_MAX = 20000;
const CURVE_POINTS = 160;
const DB_RANGE = 15;

interface EqualizerInfo {
  appliedBands: number;
  limiterUsed: boolean;
}

interface EqualizerSettings {
  bands: number[];
}

/* ------------------------------------------------------------------ */
/* Live response-curve canvas                                          */
/* ------------------------------------------------------------------ */

function EqCurve({
  gains,
  fs,
  dark,
}: {
  gains: number[];
  fs: number;
  dark: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrap.clientWidth;
    const h = CURVE_HEIGHT;
    if (w <= 0) return;
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const plotL = 34;
    const plotR = w - 8;
    const plotT = 8;
    const plotB = h - 18;
    const plotW = plotR - plotL;
    const plotH = plotB - plotT;
    const cy = plotT + plotH / 2;

    const specs: BiquadSpec[] = EQ_BANDS.map((b, i) => ({
      type: b.type,
      freq: b.freq,
      q: b.q,
      gainDb: gains[i],
    }));
    const magnitudeAt = (f: number) =>
      specs.reduce((s, sp) => s + biquadMagnitudeAt(sp, fs, f), 0);

    const xForFreq = (f: number) =>
      plotL + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * plotW;
    const yForDb = (db: number) =>
      cy -
      (Math.max(-DB_RANGE, Math.min(DB_RANGE, db)) / DB_RANGE) * (plotH / 2);

    // background
    ctx.fillStyle = dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)";
    ctx.fillRect(0, 0, w, h);

    const gridColor = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
    const textColor = dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";

    // dB gridlines at +/-5, +/-10, +/-15
    for (const db of [-15, -10, -5, 5, 10, 15]) {
      const y = yForDb(db);
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(plotL, y);
      ctx.lineTo(plotR, y);
      ctx.stroke();
    }

    // dB labels
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (const db of [-15, -5, 5, 15]) {
      ctx.fillText(db > 0 ? `+${db}` : `${db}`, plotL - 5, yForDb(db));
    }

    // 0 dB center line (stronger)
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.moveTo(plotL, cy);
    ctx.lineTo(plotR, cy);
    ctx.stroke();
    ctx.fillText("0", plotL - 5, cy);

    // frequency gridlines at 100 / 1k / 10k with labels
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const freqMarks: { f: number; label: string }[] = [
      { f: 100, label: "100" },
      { f: 1000, label: "1k" },
      { f: 10000, label: "10k" },
    ];
    for (const m of freqMarks) {
      const x = xForFreq(m.f);
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(x, plotT);
      ctx.lineTo(x, plotB);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(m.label, x, plotB + 4);
    }

    // curve points — log-spaced 20 Hz .. 20 kHz
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < CURVE_POINTS; i++) {
      const f = F_MIN * Math.pow(F_MAX / F_MIN, i / (CURVE_POINTS - 1));
      xs.push(xForFreq(f));
      ys.push(yForDb(magnitudeAt(f)));
    }

    const grad = ctx.createLinearGradient(plotL, 0, plotR, 0);
    grad.addColorStop(0, "#f97316");
    grad.addColorStop(0.55, "#f43f5e");
    grad.addColorStop(1, "#a855f7");

    // fill under the curve
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < CURVE_POINTS; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(plotR, plotB);
    ctx.lineTo(plotL, plotB);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // stroke the curve
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < CURVE_POINTS; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.stroke();

    // mark band frequencies with small dots on the curve
    ctx.fillStyle = grad;
    for (const b of EQ_BANDS) {
      const x = xForFreq(b.freq);
      const y = yForDb(magnitudeAt(b.freq));
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [fs, gains, dark]);

  // redraw whenever the band state (or theme) changes
  useEffect(() => {
    draw();
  }, [draw]);

  // redraw on resize
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="block w-full touch-none select-none rounded-lg"
        style={{ height: CURVE_HEIGHT }}
        role="img"
        aria-label="Live EQ frequency response curve"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool page                                                           */
/* ------------------------------------------------------------------ */

export default function EqualizerTool() {
  const { channels, fs } = useAudioStore();
  const proc = useProcessor<EqualizerInfo>("equalizer");
  const { reset } = proc;
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const [bands, setBands] = useState<number[]>([0, 0, 0, 0, 0]);
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const settings: EqualizerSettings = useMemo(() => ({ bands }), [bands]);

  const apply = useCallback((s: EqualizerSettings) => {
    if (!channels) return;
    void proc.run(async (report) => {
      const out = copyChannels(channels);
      let appliedBands = 0;
      for (let i = 0; i < EQ_BANDS.length; i++) {
        const g = s.bands[i];
        if (Math.abs(g) <= 0.01) continue;
        appliedBands++;
        await report(0.05 + (i / EQ_BANDS.length) * 0.25, "Equalizing");
        const coeffs = designBiquad(
          {
            type: EQ_BANDS[i].type,
            freq: EQ_BANDS[i].freq,
            gainDb: g,
            q: EQ_BANDS[i].q,
          },
          fs
        );
        for (const ch of out) applyBiquadInPlace(ch, coeffs);
      }

      let limiterUsed = false;
      if (gainToDb(truePeak(out)) > -0.05) {
        await limitChannels(out, fs, {
          ceilingDb: -0.3,
          onProgress: async (p) => {
            await report(0.3 + p * 0.68, "Limiting");
          },
        });
        limiterUsed = true;
      }
      await report(1);
      return { channels: out, info: { appliedBands, limiterUsed } };
    });
  }, [channels, fs, proc]);

  // drop the stale result the moment a different file is loaded
  useEffect(() => {
    reset();
  }, [channels, reset]);

  useLivePreview(channels, settings, apply, 250);

  const presets = EQ_PRESETS.map((p) => ({
    label: p.label,
    apply: () => {
      setBands([...p.gains]);
      setActivePreset(p.label);
    },
  }));

  const info = proc.result?.info;

  return (
    <ToolPage toolId="equalizer">
      <ToolGrid>
        <ControlsCard
          title="EQ settings"
          description="The response curve and the processed track update live while you drag."
        >
          <EqCurve gains={bands} fs={fs} dark={dark} />
          <PresetChips presets={presets} active={activePreset} />
          {EQ_BANDS.map((b, i) => (
            <SliderRow
              key={b.label}
              label={b.label}
              value={bands[i]}
              min={-12}
              max={12}
              step={0.5}
              onChange={(v) => {
                setBands(bands.map((g, j) => (j === i ? Math.round(v * 2) / 2 : g)));
                setActivePreset(undefined);
              }}
              format={formatDb}
            />
          ))}
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
                label="Bands adjusted"
                value={`${info.appliedBands} of 5`}
                accent
              />
              <StatRow
                label="Limiter used"
                value={info.limiterUsed ? "Yes" : "No"}
              />
            </ControlsCard>
          ) : (
            <InfoBanner>
              Drag the band sliders to shape the curve — the processed track
              updates itself as you tweak. Toggle between <strong>Original</strong>{" "}
              and <strong>Processed</strong> in the player to hear the
              difference.
            </InfoBanner>
          )}
          {proc.result ? (
            <DownloadPanel
              channels={proc.result.channels}
              fs={fs}
              toolId="equalizer"
              stale={proc.isRunning}
            />
          ) : null}
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
