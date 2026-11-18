"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { Download, Sparkles } from "lucide-react";
import {
  ToolPage,
  ControlsCard,
  StatRow,
  InfoBanner,
  LiveStatus,
  useLivePreview,
} from "@/components/tool-ui";
import { Button } from "@/components/ui/button";
import { navigate, toolHref } from "@/components/hash-router";
import { useAudioStore } from "@/store/audio";
import { useProcessor } from "@/hooks/use-processor";
import { copyChannels, mixdown } from "@/lib/audio/dsp";
import { analyzeBass, type BassAnalysis } from "@/lib/audio/pitch";
import { FFT } from "@/lib/audio/fft";
import { downloadBlob, formatHz } from "@/lib/audio/engine";

interface SpectrumInfo {
  spectrumDb: Float32Array;
  bass: BassAnalysis;
}

const FFT_SIZE = 4096;
const FFT_HOP = 2048;
const BINS = FFT_SIZE / 2;
const PLOT_MIN_HZ = 20;
const PLOT_MAX_HZ = 20000;
const CANVAS_H = 220;
const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

const BANDS: { label: string; range: string; lo: number; hi: number }[] = [
  { label: "Sub", range: "20–60 Hz", lo: 20, hi: 60 },
  { label: "Bass", range: "60–250 Hz", lo: 60, hi: 250 },
  { label: "Low mid", range: "250–500 Hz", lo: 250, hi: 500 },
  { label: "Mid", range: "500 Hz–2 kHz", lo: 500, hi: 2000 },
  { label: "High mid", range: "2–6 kHz", lo: 2000, hi: 6000 },
  { label: "High", range: "6–20 kHz", lo: 6000, hi: 20000 },
];

/** Sum of linear power inside a frequency band (from the dB spectrum). */
function bandPower(spectrumDb: Float32Array, loHz: number, hiHz: number, fs: number): number {
  const binHz = fs / FFT_SIZE;
  const lo = Math.max(1, Math.ceil(loHz / binHz));
  const hi = Math.min(spectrumDb.length - 1, Math.floor(hiHz / binHz));
  let sum = 0;
  for (let b = lo; b <= hi; b++) sum += Math.pow(10, spectrumDb[b] / 10);
  return sum;
}

export default function SpectrumAnalyzerTool() {
  const { channels, fs, baseName, setRebassSuggestion } = useAudioStore();
  const proc = useProcessor<SpectrumInfo>("spectrum-analyzer");
  const { reset } = proc;
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const analyze = useCallback(() => {
    if (!channels) return;
    void proc.run(async (report) => {
      await report(0.02, "Analyzing spectrum");

      // Welch-averaged power spectrum: 4096-point FFT, hop 2048, Hann window
      const mono = mixdown(channels);
      const fft = new FFT(FFT_SIZE);
      const re = new Float64Array(FFT_SIZE);
      const im = new Float64Array(FFT_SIZE);
      const hann = new Float64Array(FFT_SIZE);
      for (let i = 0; i < FFT_SIZE; i++) {
        hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      }
      const acc = new Float64Array(BINS);
      const nFrames = Math.max(0, Math.floor((mono.length - FFT_SIZE) / FFT_HOP) + 1);
      let used = 0;
      for (let f = 0; f < nFrames; f++) {
        if (f % 16 === 0) {
          await report(0.05 + (f / Math.max(1, nFrames)) * 0.4, "Analyzing spectrum");
        }
        const start = f * FFT_HOP;
        re.fill(0);
        im.fill(0);
        let energy = 0;
        for (let i = 0; i < FFT_SIZE; i++) {
          const v = mono[start + i] * hann[i];
          re[i] = v;
          energy += v * v;
        }
        if (energy < 1e-9) continue; // skip near-silent frames
        fft.transform(re, im, false);
        for (let b = 0; b < BINS; b++) {
          acc[b] += re[b] * re[b] + im[b] * im[b];
        }
        used++;
      }
      const norm = 1 / Math.max(1, used);
      const spectrumDb = new Float32Array(BINS);
      for (let b = 0; b < BINS; b++) {
        spectrumDb[b] = 10 * Math.log10(acc[b] * norm + 1e-12);
      }

      const bass = await analyzeBass(channels, fs, async (p) => {
        await report(0.5 + p * 0.45, "Analyzing bass");
      });
      await report(1);

      return {
        channels: copyChannels(channels),
        info: { spectrumDb, bass },
      };
    });
  }, [channels, fs, proc]);

  // a new file invalidates the previous analysis
  useEffect(() => {
    reset();
  }, [channels, reset]);

  // no configurable settings — re-analyze immediately on every new file
  const settings = useMemo(() => ({}), []);
  useLivePreview(channels, settings, analyze, 250);

  const info = proc.result?.info;
  const spectrum = info?.spectrumDb ?? null;
  const bass = info?.bass ?? null;

  // 3-point moving average for a smooth drawable curve
  const smoothed = useMemo(() => {
    if (!spectrum) return null;
    const n = spectrum.length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = spectrum[Math.max(0, i - 1)];
      const b = spectrum[i];
      const c = spectrum[Math.min(n - 1, i + 1)];
      out[i] = (a + b + c) / 3;
    }
    return out;
  }, [spectrum]);

  /* ---------------- canvas drawing ---------------- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !smoothed || !bass) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrap.clientWidth;
    const h = CANVAS_H;
    if (w <= 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);

    const padL = 46;
    const padR = 14;
    const padT = 18;
    const padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    if (plotW <= 10 || plotH <= 10) return;

    // auto-ranged dB axis (10 dB headroom on both ends)
    const binHz = fs / FFT_SIZE;
    const bLo = Math.max(1, Math.ceil(PLOT_MIN_HZ / binHz));
    const bHi = Math.min(smoothed.length - 1, Math.floor(PLOT_MAX_HZ / binHz));
    let dbMin = Infinity;
    let dbMax = -Infinity;
    for (let b = bLo; b <= bHi; b++) {
      const v = smoothed[b];
      if (v < dbMin) dbMin = v;
      if (v > dbMax) dbMax = v;
    }
    if (!isFinite(dbMin) || !isFinite(dbMax) || dbMax - dbMin < 1) {
      dbMin = (isFinite(dbMin) ? dbMin : -130) - 10;
      dbMax = (isFinite(dbMax) ? dbMax : -10) + 10;
    } else {
      dbMin -= 10;
      dbMax += 10;
    }

    const logSpan = Math.log(PLOT_MAX_HZ / PLOT_MIN_HZ);
    const xOf = (f: number) =>
      padL + (Math.log(Math.max(f, PLOT_MIN_HZ) / PLOT_MIN_HZ) / logSpan) * plotW;
    const yOf = (db: number) => padT + ((dbMax - db) / (dbMax - dbMin)) * plotH;
    const at = (b: number) =>
      smoothed[Math.max(0, Math.min(smoothed.length - 1, b))];

    // background + plot border
    ctx2d.fillStyle = dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.025)";
    ctx2d.fillRect(0, 0, w, h);
    ctx2d.strokeStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(padL + 0.5, padT + 0.5, plotW - 1, plotH - 1);

    ctx2d.font = "10px ui-monospace, monospace";

    // vertical frequency grid + labels
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "top";
    for (const gf of GRID_FREQS) {
      const x = Math.round(xOf(gf)) + 0.5;
      ctx2d.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
      ctx2d.beginPath();
      ctx2d.moveTo(x, padT);
      ctx2d.lineTo(x, padT + plotH);
      ctx2d.stroke();
      ctx2d.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)";
      ctx2d.fillText(formatHz(gf), xOf(gf), padT + plotH + 7);
    }

    // horizontal dB grid + labels
    ctx2d.textAlign = "right";
    ctx2d.textBaseline = "middle";
    for (let db = Math.ceil(dbMin / 20) * 20; db <= dbMax; db += 20) {
      const y = Math.round(yOf(db)) + 0.5;
      ctx2d.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
      ctx2d.beginPath();
      ctx2d.moveTo(padL, y);
      ctx2d.lineTo(padL + plotW, y);
      ctx2d.stroke();
      ctx2d.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)";
      ctx2d.fillText(`${db}`, padL - 6, yOf(db));
    }
    ctx2d.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)";
    ctx2d.fillText("dB", padL - 6, 8);

    // spectrum curve — per-pixel log-frequency sampling with bin interpolation
    const pts: number[] = [];
    for (let px = 0; px <= plotW; px++) {
      const f = PLOT_MIN_HZ * Math.pow(PLOT_MAX_HZ / PLOT_MIN_HZ, px / plotW);
      const pos = f / binHz;
      const b0 = Math.floor(pos);
      const frac = pos - b0;
      const db = at(b0) + (at(b0 + 1) - at(b0)) * frac;
      const y = Math.max(padT, Math.min(padT + plotH, yOf(db)));
      pts.push(padL + px, y);
    }

    // filled area under the curve
    ctx2d.beginPath();
    ctx2d.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx2d.lineTo(pts[i], pts[i + 1]);
    ctx2d.lineTo(padL + plotW, padT + plotH);
    ctx2d.lineTo(padL, padT + plotH);
    ctx2d.closePath();
    const fillGrad = ctx2d.createLinearGradient(padL, 0, padL + plotW, 0);
    fillGrad.addColorStop(0, "rgba(249,115,22,0.22)");
    fillGrad.addColorStop(1, "rgba(244,63,94,0.06)");
    ctx2d.fillStyle = fillGrad;
    ctx2d.fill();

    // gradient stroke
    ctx2d.beginPath();
    ctx2d.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx2d.lineTo(pts[i], pts[i + 1]);
    const strokeGrad = ctx2d.createLinearGradient(padL, 0, padL + plotW, 0);
    strokeGrad.addColorStop(0, "#f97316");
    strokeGrad.addColorStop(1, "#f43f5e");
    ctx2d.strokeStyle = strokeGrad;
    ctx2d.lineWidth = 2;
    ctx2d.lineJoin = "round";
    ctx2d.stroke();

    // detected bassline marker
    if (bass.medianF0 > 0) {
      const x = xOf(Math.min(Math.max(bass.medianF0, PLOT_MIN_HZ), PLOT_MAX_HZ));
      ctx2d.save();
      ctx2d.setLineDash([4, 4]);
      ctx2d.strokeStyle = "#fb923c";
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(x, padT);
      ctx2d.lineTo(x, padT + plotH);
      ctx2d.stroke();
      ctx2d.restore();
      ctx2d.font = "10px ui-monospace, monospace";
      const label = `bass ${Math.round(bass.medianF0)} Hz`;
      const tw = ctx2d.measureText(label).width;
      const lx = x + 8 + tw > padL + plotW ? x - tw - 8 : x + 8;
      ctx2d.textAlign = "left";
      ctx2d.textBaseline = "top";
      ctx2d.fillStyle = dark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)";
      ctx2d.fillText(label, lx, padT + 5);
    }
  }, [smoothed, bass, fs, dark]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  /* ---------------- readouts ---------------- */

  const peak = useMemo(() => {
    if (!spectrum) return null;
    const binHz = fs / FFT_SIZE;
    const lo = Math.max(1, Math.ceil(PLOT_MIN_HZ / binHz));
    const hi = Math.min(spectrum.length - 1, Math.floor(PLOT_MAX_HZ / binHz));
    let best = lo;
    let bestDb = -Infinity;
    let total = 0;
    for (let b = lo; b <= hi; b++) {
      if (spectrum[b] > bestDb) {
        bestDb = spectrum[b];
        best = b;
      }
      total += Math.pow(10, spectrum[b] / 10);
    }
    return {
      hz: (best * fs) / FFT_SIZE,
      silent: !isFinite(bestDb) || bestDb <= -119.5,
      total,
    };
  }, [spectrum, fs]);

  const basslineText = !bass
    ? "—"
    : bass.medianF0 > 0
      ? `${formatHz(bass.medianF0)} · ${formatHz(bass.rangeF0[0])}–${formatHz(bass.rangeF0[1])}`
      : "No bass detected";

  const suggestedRange = useMemo(() => {
    const median = bass?.medianF0 ?? 0;
    const low = Math.min(90, Math.max(18, Math.round(median / 2) - 2));
    return { low, high: Math.min(140, low + 5) };
  }, [bass]);

  const canSuggest = (bass?.medianF0 ?? 0) > 0;

  const suggestRebass = () => {
    if (!canSuggest) return;
    setRebassSuggestion({ low: suggestedRange.low, high: suggestedRange.high });
    navigate(toolHref("rebasser"));
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${baseName}-spectrum.png`);
    }, "image/png");
  };

  return (
    <ToolPage toolId="spectrum-analyzer">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <ControlsCard
          title="Controls"
          description="Nothing to configure — the full analysis runs automatically the moment a track is loaded."
        >
          <LiveStatus
            running={proc.isRunning}
            progress={proc.progress}
            stage={proc.stage}
            idleText="Analysis runs automatically the moment a track is loaded."
          />
          {proc.error && !info ? (
            <InfoBanner variant="warn">{proc.error}</InfoBanner>
          ) : (
            <InfoBanner>
              The spectrum, bassline detection and band energies below are
              computed locally on your device — nothing is uploaded.
            </InfoBanner>
          )}
        </ControlsCard>

        {info ? (
          <ControlsCard
            title="Frequency spectrum"
            description="Welch-averaged power spectrum — 4096-point FFT, Hann window, logarithmic frequency axis."
          >
            <div ref={wrapRef} className="relative">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Power spectrum of the loaded track from 20 Hz to 20 kHz"
                className="block w-full"
                style={{ height: CANVAS_H }}
              />
            </div>

            <div className="grid gap-x-10 sm:grid-cols-2">
              <StatRow label="Detected bassline" value={basslineText} accent />
              <StatRow
                label="Peak frequency"
                value={peak ? (peak.silent ? "Silence" : formatHz(peak.hz)) : "—"}
              />
              {BANDS.map((band) => {
                const share =
                  spectrum && peak && peak.total > 0 && !peak.silent
                    ? (bandPower(spectrum, band.lo, band.hi, fs) / peak.total) * 100
                    : 0;
                return (
                  <StatRow
                    key={band.label}
                    label={`${band.label} · ${band.range}`}
                    value={`${Math.round(share)}%`}
                  />
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full"
                onClick={suggestRebass}
                disabled={!canSuggest}
              >
                <Sparkles className="size-4" />
                Use this range in the Rebasser
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {canSuggest
                  ? `Suggested sub-bass band: ${formatHz(suggestedRange.low)}–${formatHz(suggestedRange.high)}, derived from the detected bassline.`
                  : "No confident bassline detected — the Rebasser suggestion needs a detectable bass."}
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={downloadPng}>
              <Download className="size-4" />
              Download spectrum (PNG)
            </Button>
          </ControlsCard>
        ) : null}
      </div>
    </ToolPage>
  );
}
