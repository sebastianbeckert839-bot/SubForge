/**
 * Visualizer engine — pure canvas rendering shared by the live preview and
 * the exported video, so what you see is exactly what you get.
 */

export type VizPreset = "bars" | "mirror" | "radial" | "freq-wave" | "wave";
export type ColorMode = "solid" | "gradient" | "rainbow";
export type VizFormat = "16:9" | "9:16" | "1:1" | "4:5";

export interface VizSettings {
  preset: VizPreset;
  /** number of bars / spectrum points (bar + radial presets) */
  barCount: number;
  /** 0..0.9 — gap between bars as a fraction of the bar slot */
  barGap: number;
  roundedBars: boolean;
  capDots: boolean;
  colorMode: ColorMode;
  color1: string;
  color2: string;
  bg: string;
  /** 0..100 */
  glow: number;
  /** 0..0.95 → AnalyserNode.smoothingTimeConstant */
  smoothing: number;
  /** 0.4..3 */
  sensitivity: number;
  /** stroke width for the line presets, px at 1080p reference */
  lineWidth: number;
  fillWave: boolean;
  /** 0..2 rotation speed for the radial preset */
  rotateSpeed: number;
  showTitle: boolean;
  titleText: string;
  showProgress: boolean;
  format: VizFormat;
  /** true → 720p, false → 1080p */
  res720: boolean;
  fps: 30 | 60;
  bitrateMbps: number;
  exportLength: "full" | 15 | 30 | 60;
}

export const DEFAULT_SETTINGS: VizSettings = {
  preset: "bars",
  barCount: 64,
  barGap: 0.3,
  roundedBars: true,
  capDots: true,
  colorMode: "gradient",
  color1: "#f97316",
  color2: "#fbbf24",
  bg: "#0b0b0d",
  glow: 45,
  smoothing: 0.8,
  sensitivity: 1.2,
  lineWidth: 5,
  fillWave: true,
  rotateSpeed: 0.4,
  showTitle: true,
  titleText: "",
  showProgress: true,
  format: "16:9",
  res720: false,
  fps: 60,
  bitrateMbps: 16,
  exportLength: "full",
};

/* ------------------------------------------------------------------ */
/* Style presets — one click, full look                                */
/* ------------------------------------------------------------------ */

export interface StylePreset {
  id: string;
  label: string;
  settings: Partial<VizSettings>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "forge",
    label: "Forge",
    settings: {
      preset: "bars",
      colorMode: "gradient",
      color1: "#f97316",
      color2: "#fde047",
      bg: "#0b0b0d",
      glow: 45,
      barCount: 64,
      roundedBars: true,
      capDots: true,
    },
  },
  {
    id: "neon-rainbow",
    label: "Neon Rainbow",
    settings: {
      preset: "bars",
      colorMode: "rainbow",
      bg: "#070510",
      glow: 80,
      barCount: 96,
      capDots: true,
    },
  },
  {
    id: "mirror-purple",
    label: "Mirror Violet",
    settings: {
      preset: "mirror",
      colorMode: "gradient",
      color1: "#a855f7",
      color2: "#22d3ee",
      bg: "#0a0612",
      glow: 60,
      barCount: 72,
    },
  },
  {
    id: "sunset",
    label: "Sunset Wave",
    settings: {
      preset: "freq-wave",
      colorMode: "gradient",
      color1: "#ff5e3a",
      color2: "#ffd23f",
      bg: "#120806",
      glow: 55,
      fillWave: true,
      lineWidth: 5,
    },
  },
  {
    id: "chrome",
    label: "Chrome Line",
    settings: {
      preset: "wave",
      colorMode: "solid",
      color1: "#e8e8ec",
      bg: "#000000",
      glow: 35,
      lineWidth: 3,
      sensitivity: 1.6,
    },
  },
  {
    id: "ring-fire",
    label: "Ring of Fire",
    settings: {
      preset: "radial",
      colorMode: "rainbow",
      bg: "#0b0603",
      glow: 70,
      barCount: 120,
      rotateSpeed: 0.5,
    },
  },
  {
    id: "minimal",
    label: "Minimal Mono",
    settings: {
      preset: "bars",
      colorMode: "solid",
      color1: "#17171a",
      bg: "#f4f4f5",
      glow: 0,
      barCount: 48,
      roundedBars: false,
      capDots: false,
    },
  },
  {
    id: "deep-ocean",
    label: "Deep Ocean",
    settings: {
      preset: "freq-wave",
      colorMode: "gradient",
      color1: "#06b6d4",
      color2: "#34d399",
      bg: "#03110f",
      glow: 65,
      fillWave: true,
    },
  },
  {
    id: "ice-mirror",
    label: "Ice Mirror",
    settings: {
      preset: "mirror",
      colorMode: "gradient",
      color1: "#e0f2fe",
      color2: "#38bdf8",
      bg: "#050a10",
      glow: 50,
      barCount: 56,
    },
  },
  {
    id: "orbit",
    label: "Orbit",
    settings: {
      preset: "radial",
      colorMode: "gradient",
      color1: "#f43f5e",
      color2: "#fb923c",
      bg: "#0d0508",
      glow: 60,
      barCount: 90,
      rotateSpeed: 0.8,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

const FORMAT_RATIOS: Record<VizFormat, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

export function videoDims(s: VizSettings): { w: number; h: number } {
  const [w, h] = FORMAT_RATIOS[s.format];
  return s.res720
    ? { w: Math.round((w * 2) / 3), h: Math.round((h * 2) / 3) }
    : { w, h };
}

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function contrastOn(hex: string): string {
  return luminance(hex) > 0.55 ? "#17171a" : "#f4f4f5";
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** color for bar i of n — solid, position gradient or animated rainbow */
function elementColor(s: VizSettings, i: number, n: number, t: number): string {
  if (s.colorMode === "rainbow") {
    return `hsl(${(((i / n) * 320 + t * 40) % 360 + 360) % 360} 85% 60%)`;
  }
  if (s.colorMode === "gradient") {
    const u = n <= 1 ? 0 : i / (n - 1);
    const [r1, g1, b1] = hexToRgb(s.color1);
    const [r2, g2, b2] = hexToRgb(s.color2);
    return rgbToHex(r1 + (r2 - r1) * u, g1 + (g2 - g1) * u, b1 + (b2 - b1) * u);
  }
  return s.color1;
}

/* ------------------------------------------------------------------ */
/* Frequency sampling (log-spaced bands)                               */
/* ------------------------------------------------------------------ */

const F_MIN = 30;
const F_MAX = 16000;

function bandValue(
  freq: Uint8Array,
  sampleRate: number,
  i: number,
  n: number
): number {
  const binHz = sampleRate / 2 / freq.length;
  const f0 = F_MIN * Math.pow(F_MAX / F_MIN, i / n);
  const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (i + 1) / n);
  let b0 = Math.floor(f0 / binHz);
  let b1 = Math.ceil(f1 / binHz);
  if (b1 <= b0) b1 = b0 + 1;
  b0 = Math.max(0, Math.min(freq.length - 1, b0));
  b1 = Math.max(0, Math.min(freq.length, b1));
  let m = 0;
  for (let b = b0; b < b1; b++) if (freq[b] > m) m = freq[b];
  return m / 255;
}

/* ------------------------------------------------------------------ */
/* The renderer                                                        */
/* ------------------------------------------------------------------ */

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** getByteFrequencyData output */
  freq: Uint8Array;
  /** getByteTimeDomainData output */
  time: Uint8Array;
  sampleRate: number;
  settings: VizSettings;
  /** seconds since render start — drives rotation / rainbow animation */
  t: number;
  /** 0..1 position in the track */
  progress: number;
  /** persistent per-bar peak heights (0..1); caller owns the state */
  peaks: Float32Array;
  /** seconds since last frame, for peak decay */
  dt: number;
}

export function drawFrame(inp: RenderInput): void {
  const { ctx, w, h, settings: s, t } = inp;
  const need = s.preset === "wave" ? 0 : s.barCount;
  if (inp.peaks.length !== need) {
    inp.peaks = new Float32Array(need);
  }
  const peaks = inp.peaks;

  ctx.save();
  // background
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, w, h);

  const glowPx = (s.glow / 100) * h * 0.05;
  const scaleRef = h / 1080; // sizes are tuned at 1080p

  switch (s.preset) {
    case "bars":
      drawBars(inp, peaks, false, glowPx, scaleRef);
      break;
    case "mirror":
      drawBars(inp, peaks, true, glowPx, scaleRef);
      break;
    case "radial":
      drawRadial(inp, peaks, glowPx, scaleRef);
      break;
    case "freq-wave":
      drawFreqWave(inp, glowPx, scaleRef);
      break;
    case "wave":
      drawWave(inp, glowPx, scaleRef);
      break;
  }

  // ---- title ----
  if (s.showTitle && s.titleText.trim()) {
    const fontSize = Math.max(12, h * 0.03);
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(contrastOn(s.bg), 0.92);
    ctx.fillText(s.titleText.trim(), w / 2, h * 0.945, w * 0.86);
  }

  // ---- progress bar ----
  if (s.showProgress) {
    const barH = Math.max(3, h * 0.006);
    ctx.fillStyle = rgba(contrastOn(s.bg), 0.14);
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = s.colorMode === "solid" ? s.color1 : s.color2;
    ctx.fillRect(0, h - barH, Math.max(0, Math.min(1, inp.progress)) * w, barH);
  }

  ctx.restore();
}

/* ---------------------------- bars / mirror ----------------------- */

function drawBars(
  inp: RenderInput,
  peaks: Float32Array,
  mirror: boolean,
  glowPx: number,
  scaleRef: number
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t, dt } = inp;
  const n = Math.max(8, Math.min(256, Math.round(s.barCount)));
  const padX = w * 0.04;
  const hasTitle = s.showTitle && s.titleText.trim().length > 0;
  const availH = h * (hasTitle ? 0.86 : 0.94);
  const maxHalf = mirror ? availH * 0.46 : availH;
  const baseY = mirror
    ? h * (hasTitle ? 0.45 : 0.48)
    : h - h * (hasTitle ? 0.08 : 0.04);

  const slot = (w - padX * 2) / n;
  const bw = Math.max(1, slot * (1 - s.barGap));
  const r = s.roundedBars ? Math.min(bw / 2, 12 * scaleRef) : 0;
  const decay = 0.9 * dt; // peak gravity, per second

  for (let i = 0; i < n; i++) {
    const v = Math.min(1, bandValue(freq, sampleRate, i, n) * s.sensitivity);
    const p = Math.max(v, (peaks[i] ?? 0) - decay);
    peaks[i] = p;

    const barH = Math.max(v * maxHalf, v > 0.02 ? 2 : 0);
    if (barH <= 0 && p <= 0.001) continue;
    const x = padX + i * slot + (slot - bw) / 2;
    const color = elementColor(s, i, n, t);

    ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
    if (glowPx > 0.5) ctx.shadowColor = color;
    ctx.fillStyle = color;

    if (mirror) {
      roundRectPath(ctx, x, baseY - barH, bw, barH * 2, r);
      ctx.fill();
    } else {
      roundRectPath(ctx, x, baseY - barH, bw, barH, r);
      ctx.fill();
      if (s.capDots && p > 0.02) {
        ctx.shadowBlur = glowPx * 0.6;
        const cy = baseY - p * maxHalf - 8 * scaleRef;
        ctx.beginPath();
        ctx.arc(x + bw / 2, cy, Math.max(1.5, bw * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.shadowBlur = 0;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (w <= 0 || h <= 0) return;
  if (r <= 0) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rr);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

/* ---------------------------- radial ------------------------------ */

function drawRadial(
  inp: RenderInput,
  peaks: Float32Array,
  glowPx: number,
  scaleRef: number
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t, dt } = inp;
  const n = Math.max(16, Math.min(240, Math.round(s.barCount)));
  const cx = w / 2;
  const cy = h / 2;
  const m = Math.min(w, h);
  const r0 = m * 0.17;
  const maxLen = m * 0.26;
  const bw = ((Math.PI * 2 * r0) / n) * (1 - s.barGap);
  const rotation = t * s.rotateSpeed;
  const decay = 0.9 * dt;

  for (let i = 0; i < n; i++) {
    const v = Math.min(1, bandValue(freq, sampleRate, i, n) * s.sensitivity);
    const p = Math.max(v, (peaks[i] ?? 0) - decay);
    peaks[i] = p;
    if (v <= 0.005) continue;

    const ang = (i / n) * Math.PI * 2 + rotation;
    const len = Math.max(2, v * maxLen);
    const color = elementColor(s, i, n, t);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
    if (glowPx > 0.5) ctx.shadowColor = color;
    ctx.fillStyle = color;
    if (s.roundedBars) {
      roundRectPath(ctx, -bw / 2, r0, bw, len, bw / 2);
      ctx.fill();
    } else {
      ctx.fillRect(-bw / 2, r0, bw, len);
    }
    if (s.capDots && p > 0.03) {
      ctx.beginPath();
      ctx.arc(0, r0 + p * maxLen + 12 * scaleRef, Math.max(1.5, bw * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // center ring
  const ringColor = s.colorMode === "solid" ? s.color1 : s.color2;
  ctx.shadowBlur = glowPx > 0.5 ? glowPx * 0.7 : 0;
  if (glowPx > 0.5) ctx.shadowColor = ringColor;
  ctx.strokeStyle = rgba(ringColor, 0.7);
  ctx.lineWidth = Math.max(1, 6 * scaleRef);
  ctx.beginPath();
  ctx.arc(cx, cy, r0 * 0.92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/* ------------------------- frequency wave ------------------------- */

function drawFreqWave(inp: RenderInput, glowPx: number, scaleRef: number): void {
  const { ctx, w, h, freq, sampleRate, settings: s } = inp;
  const n = 128;
  const hasTitle = s.showTitle && s.titleText.trim().length > 0;
  const availH = h * (hasTitle ? 0.86 : 0.94);
  const maxHalf = availH * 0.44;
  const cy = h * (hasTitle ? 0.45 : 0.48);
  const padX = w * 0.04;

  const xs = new Float32Array(n);
  const vs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = padX + (i / (n - 1)) * (w - padX * 2);
    vs[i] = Math.min(1, bandValue(freq, sampleRate, i, n) * s.sensitivity);
  }

  // symmetric filled shape
  ctx.beginPath();
  ctx.moveTo(xs[0], cy);
  for (let i = 0; i < n; i++) ctx.lineTo(xs[i], cy - vs[i] * maxHalf);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(xs[i], cy + vs[i] * maxHalf);
  ctx.closePath();

  if (s.fillWave) {
    const g = ctx.createLinearGradient(0, cy - maxHalf, 0, cy + maxHalf);
    g.addColorStop(0, rgba(s.color2, 0.42));
    g.addColorStop(0.5, rgba(s.color1, 0.2));
    g.addColorStop(1, rgba(s.color2, 0.42));
    ctx.fillStyle = g;
    ctx.shadowBlur = glowPx > 0.5 ? glowPx * 0.5 : 0;
    if (glowPx > 0.5) ctx.shadowColor = s.color2;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const stroke = makeHorizontalStroke(ctx, s, xs[0], xs[n - 1]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, s.lineWidth * scaleRef * 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
  if (glowPx > 0.5) ctx.shadowColor = s.colorMode === "solid" ? s.color1 : s.color2;

  // top + bottom curves
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(xs[0], cy + dir * vs[0] * maxHalf);
    for (let i = 1; i < n; i++) ctx.lineTo(xs[i], cy + dir * vs[i] * maxHalf);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

/* ------------------------- oscilloscope wave ---------------------- */

function drawWave(inp: RenderInput, glowPx: number, scaleRef: number): void {
  const { ctx, w, h, time, settings: s } = inp;
  const hasTitle = s.showTitle && s.titleText.trim().length > 0;
  const cy = h * (hasTitle ? 0.45 : 0.48);
  const amp = h * (hasTitle ? 0.38 : 0.42);
  const padX = w * 0.03;
  const N = time.length;

  const steps = Math.min(N, 1024);
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const idx = Math.floor((i / (steps - 1)) * (N - 1));
    const x = padX + (i / (steps - 1)) * (w - padX * 2);
    const y = cy + ((time[idx] - 128) / 128) * amp * Math.min(2, s.sensitivity);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = makeHorizontalStroke(ctx, s, padX, w - padX);
  ctx.lineWidth = Math.max(1, s.lineWidth * scaleRef * 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
  if (glowPx > 0.5) ctx.shadowColor = s.colorMode === "solid" ? s.color1 : s.color2;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/* ------------------------- shared stroke -------------------------- */

function makeHorizontalStroke(
  ctx: CanvasRenderingContext2D,
  s: VizSettings,
  x0: number,
  x1: number
): string | CanvasGradient {
  if (s.colorMode === "gradient") {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, s.color1);
    g.addColorStop(1, s.color2);
    return g;
  }
  return s.colorMode === "rainbow" ? s.color2 : s.color1;
}
