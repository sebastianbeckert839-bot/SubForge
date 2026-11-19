/**
 * Visualizer engine — pure canvas rendering shared by the live preview and
 * the exported video, so what you see is exactly what you get.
 *
 * Styles: bars / mirror / radial / freq-wave / wave +
 *   halo  — smooth circular spectrum ring around your photo
 *           (top of the ring = bass, bottom = highs, sides = mids)
 *   vinyl — your art spinning on a record with a reacting ring
 *   ripple — rings pulse outward from your art on bass hits
 *
 * Everything is customizable on every style: photo backgrounds with blur /
 * darken / bass pulse, floating particles, custom fonts, draggable text and
 * visualizer placement, colors, glow, sensitivity and more.
 */

export type VizPreset =
  | "bars"
  | "mirror"
  | "radial"
  | "freq-wave"
  | "wave"
  | "halo"
  | "vinyl"
  | "ripple";
export type ColorMode = "solid" | "gradient" | "rainbow";
export type VizFormat = "16:9" | "9:16" | "1:1" | "4:5";
export type TextFont =
  | "system"
  | "modern"
  | "display"
  | "grotesk"
  | "condensed"
  | "elegant"
  | "handwritten"
  | "serif"
  | "mono";
export type TextAlign = "left" | "center" | "right";

export interface VizSettings {
  preset: VizPreset;
  /** number of bars / spectrum points (bar, radial and ring styles) */
  barCount: number;
  /** 0..0.9 — gap between bars as a fraction of the bar slot */
  barGap: number;
  roundedBars: boolean;
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
  /** stroke width for the line + ring styles, px at 1080p reference */
  lineWidth: number;
  fillWave: boolean;
  /** 0..2 rotation speed (radial bars, halo spin, vinyl spin, ripple speed) */
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

  /* ---------------- background & atmosphere -------------------------- */
  /** image URL / data-URL behind everything; "use-center" mirrors the
   *  center artwork as a blurred background (the album-art look) */
  bgImage: string | null;
  /** static gaussian blur on the background image, px */
  bgBlur: number;
  /** static dark overlay over the background image, 0..0.9 */
  bgDark: number;
  /** 0..1 — bass hits push the background extra dark + blurry for a beat */
  bgBass: number;
  /** 0..1 radial vignette */
  vignette: number;
  /** floating dust particles, count 0..140 */
  particles: number;
  /** particle drift speed multiplier, 0.2..3 */
  particleSpeed: number;

  /* ---------------- text --------------------------------------------- */
  showArtist: boolean;
  artistText: string;
  font: TextFont;
  /** title size multiplier, 0.4..3 */
  titleScale: number;
  /** artist size multiplier, 0.4..3 */
  artistScale: number;
  textUppercase: boolean;
  textColor: string;
  /** normalized anchor; y < 0 → auto (bottom area of the frame) */
  textPos: { x: number; y: number };
  align: TextAlign;

  /* ---------------- visualizer placement ------------------------------ */
  /** normalized anchor; y < 0 → auto (per-preset default) */
  vizPos: { x: number; y: number };

  /* ---------------- center art (radial / halo / vinyl / ripple) ------ */
  centerImage: string | null;
  /** fraction of min(w,h), 0.08..0.45 */
  centerSize: number;
  /** 0 = square, 1 = circle */
  centerRound: number;

  /* ---------------- ring styles -------------------------------------- */
  /** thickness of the halo / vinyl / ripple band as a fraction of
   *  min(w,h), 0.04..0.3 */
  haloSpread: number;
}

export const DEFAULT_SETTINGS: VizSettings = {
  preset: "bars",
  barCount: 64,
  barGap: 0.3,
  roundedBars: true,
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
  bgImage: null,
  bgBlur: 8,
  bgDark: 0.25,
  bgBass: 0,
  vignette: 0,
  particles: 0,
  particleSpeed: 1,
  showArtist: false,
  artistText: "",
  font: "system",
  titleScale: 1,
  artistScale: 0.7,
  textUppercase: false,
  textColor: "#f4f4f5",
  textPos: { x: 0.5, y: -1 },
  align: "center",
  vizPos: { x: 0.5, y: -1 },
  centerImage: null,
  centerSize: 0.3,
  centerRound: 0,
  haloSpread: 0.16,
};

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

/** display fonts for the text overlays (loaded via the Google Fonts
 *  stylesheet injected by the tool; canvas falls back to system-ui until
 *  the font arrives) */
export const FONT_OPTIONS: { value: TextFont; label: string; family: string }[] =
  [
    {
      value: "system",
      label: "System Sans — clean",
      family: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    { value: "modern", label: "Montserrat — modern bold", family: "'Montserrat', system-ui, sans-serif" },
    { value: "display", label: "Bebas Neue — tall display", family: "'Bebas Neue', 'Montserrat', sans-serif" },
    { value: "grotesk", label: "Space Grotesk — techy", family: "'Space Grotesk', system-ui, sans-serif" },
    { value: "condensed", label: "Oswald — condensed impact", family: "'Oswald', system-ui, sans-serif" },
    { value: "elegant", label: "Playfair Display — elegant serif", family: "'Playfair Display', Georgia, serif" },
    { value: "handwritten", label: "Caveat — handwritten", family: "'Caveat', cursive" },
    { value: "serif", label: "Classic Serif", family: "Georgia, 'Times New Roman', serif" },
    { value: "mono", label: "Monospace", family: "ui-monospace, 'Courier New', monospace" },
  ];

export function fontFamily(key: TextFont): string {
  return FONT_OPTIONS.find((f) => f.value === key)?.family ?? FONT_OPTIONS[0].family;
}

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

  /* ---------------- new circular styles ---------------------------- */

  {
    id: "halo",
    label: "Halo",
    settings: {
      preset: "halo",
      colorMode: "gradient",
      color1: "#f97316",
      color2: "#fde047",
      bg: "#0b0b0d",
      glow: 60,
      barCount: 96,
      lineWidth: 2.5,
      haloSpread: 0.16,
      centerSize: 0.3,
      centerRound: 1,
      sensitivity: 1.2,
      rotateSpeed: 0,
    },
  },
  {
    id: "vinyl",
    label: "Spinning Vinyl",
    settings: {
      preset: "vinyl",
      colorMode: "gradient",
      color1: "#fbbf24",
      color2: "#f97316",
      bg: "#0c0a08",
      glow: 45,
      lineWidth: 2,
      haloSpread: 0.11,
      centerSize: 0.24,
      centerRound: 1,
      rotateSpeed: 0.3,
      sensitivity: 1.15,
    },
  },
  {
    id: "ripple",
    label: "Bass Ripples",
    settings: {
      preset: "ripple",
      colorMode: "gradient",
      color1: "#22d3ee",
      color2: "#a855f7",
      bg: "#04070e",
      glow: 65,
      haloSpread: 0.09,
      centerSize: 0.3,
      centerRound: 1,
      rotateSpeed: 1,
      sensitivity: 1.3,
    },
  },
];

/** default visualizer anchor per preset (used when vizPos.y < 0 and to
 *  materialize a position when the user starts dragging) */
export function defaultVizPos(preset: VizPreset): { x: number; y: number } {
  switch (preset) {
    case "mirror":
    case "freq-wave":
    case "wave":
      return { x: 0.5, y: 0.46 };
    case "radial":
    case "halo":
    case "vinyl":
    case "ripple":
      return { x: 0.5, y: 0.5 };
    default:
      return { x: 0.5, y: 0.9 };
  }
}

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

function mixHex(a: string, b: string, u: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(
    A[0] + (B[0] - A[0]) * u,
    A[1] + (B[1] - A[1]) * u,
    A[2] + (B[2] - A[2]) * u
  );
}

/** color for element i of n — solid, position gradient or animated rainbow */
function elementColor(s: VizSettings, i: number, n: number, t: number): string {
  if (s.colorMode === "rainbow") {
    return `hsl(${(((i / n) * 320 + t * 40) % 360 + 360) % 360} 85% 60%)`;
  }
  if (s.colorMode === "gradient") {
    const u = n <= 1 ? 0 : i / (n - 1);
    return mixHex(s.color1, s.color2, u);
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

/** an expanding ripple ring (bass ripples style) */
export interface VizRing {
  /** spawn time, seconds on the render clock */
  t0: number;
  /** bass energy at spawn, 0..1 */
  strong: number;
}

/** per-canvas mutable state (bass smoothing, particles, ripple rings) —
 *  the caller owns one instance per canvas (preview + one fresh per
 *  export) */
export interface VizRenderState {
  /** smoothed bass energy 0..1 */
  bass: number;
  /** bass on the previous frame — attack detection for ripples */
  bassPrev: number;
  /** last ripple spawn time */
  lastSpawn: number;
  /** particle data, 4 floats each: x, y, upward speed px/s, phase */
  parts: Float32Array;
  partCount: number;
  /** live ripple rings */
  rings: VizRing[];
}

export function makeVizRenderState(): VizRenderState {
  return {
    bass: 0,
    bassPrev: 0,
    lastSpawn: -10,
    parts: new Float32Array(0),
    partCount: 0,
    rings: [],
  };
}

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
  /** seconds since last frame (bass release, particles, ripples) */
  dt: number;
  /** decoded background image, if the settings reference one */
  bgImg?: HTMLImageElement | null;
  /** decoded center artwork (radial / halo / vinyl / ripple + "use-center" bg) */
  centerImg?: HTMLImageElement | null;
  /** per-canvas mutable state; created on first call if missing */
  state?: VizRenderState;
}

/** smoothed 20–150 Hz energy: instant attack, ~0.7 s release so the
 *  background "breathes" with the bass instead of flickering */
function updateBass(inp: RenderInput, st: VizRenderState): number {
  const { freq, sampleRate, dt } = inp;
  if (freq.length < 8) return st.bass * 0.95;
  const binHz = sampleRate / 2 / freq.length;
  const b0 = Math.max(1, Math.floor(20 / binHz));
  const b1 = Math.min(freq.length - 1, Math.ceil(150 / binHz));
  let sum = 0;
  for (let b = b0; b <= b1; b++) sum += freq[b];
  const inst = Math.min(1, (sum / (b1 - b0 + 1) / 255) * 1.7);
  if (inst >= st.bass) st.bass = inst;
  else st.bass = Math.max(inst, st.bass - dt * 1.35);
  return st.bass;
}

/** draw an image covering the canvas (aspect-preserving) with a gaussian
 *  blur; oversized by the blur radius so edges never show */
function drawCoverBlurred(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  blurPx: number
): void {
  const m = blurPx * 2.5;
  const scale = Math.max((w + 2 * m) / img.width, (h + 2 * m) / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  if (blurPx > 0.4) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = "none";
}

/** rounded-rect center artwork (or a subtle placeholder when no image) */
function drawCenterArt(
  inp: RenderInput,
  cx: number,
  cy: number,
  size: number,
  round: number
): void {
  const { ctx, settings: s } = inp;
  const half = size / 2;
  const x = cx - half;
  const y = cy - half;
  const r = (Math.min(1, Math.max(0, round)) * size) / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.05;
  roundRectPath(ctx, x, y, size, size, r);
  ctx.fillStyle = "#101014";
  ctx.fill();
  ctx.restore();

  if (inp.centerImg) {
    ctx.save();
    roundRectPath(ctx, x, y, size, size, r);
    ctx.clip();
    const img = inp.centerImg;
    const scale = Math.max(size / img.width, size / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  } else {
    // placeholder: three soft bars (the SubForge glyph)
    const bc = rgba(contrastOn(s.bg), 0.85);
    const bw = size * 0.09;
    for (let k = -1; k <= 1; k++) {
      const bh = size * (k === 0 ? 0.34 : 0.2);
      roundRectPath(
        ctx,
        cx + k * size * 0.19 - bw / 2,
        cy - bh / 2,
        bw,
        bh,
        bw / 2
      );
      ctx.fillStyle = bc;
      ctx.fill();
    }
  }
}

export function drawFrame(inp: RenderInput): void {
  const { ctx, w, h, settings: s, t } = inp;
  if (!inp.state) inp.state = makeVizRenderState();
  const st = inp.state;

  ctx.save();

  const bass = updateBass(inp, st);
  const scaleRef = h / 1080; // sizes are tuned at 1080p

  /* ---- background ---- */
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, w, h);

  const bgImg =
    s.bgImage === "use-center"
      ? inp.centerImg ?? null
      : s.bgImage
        ? inp.bgImg ?? null
        : null;
  if (bgImg && bgImg.width > 0) {
    const blur = s.bgBlur + s.bgBass * bass * 26;
    drawCoverBlurred(ctx, bgImg, w, h, blur);
  }

  const dark = Math.min(0.92, s.bgDark + s.bgBass * bass * 0.45);
  if (dark > 0.002) {
    ctx.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (s.vignette > 0.02) {
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${s.vignette.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---- visualizer ---- */
  const glowPx = (s.glow / 100) * h * 0.05;
  const anchor =
    s.vizPos.y >= 0
      ? { x: s.vizPos.x * w, y: s.vizPos.y * h }
      : (() => {
          const d = defaultVizPos(s.preset);
          return { x: d.x * w, y: d.y * h };
        })();

  switch (s.preset) {
    case "bars":
      drawBars(inp, false, glowPx, scaleRef, anchor);
      break;
    case "mirror":
      drawBars(inp, true, glowPx, scaleRef, anchor);
      break;
    case "radial":
      drawRadial(inp, glowPx, scaleRef, anchor);
      break;
    case "freq-wave":
      drawFreqWave(inp, glowPx, scaleRef, anchor);
      break;
    case "wave":
      drawWave(inp, glowPx, scaleRef, anchor);
      break;
    case "halo":
      drawHalo(inp, glowPx, scaleRef, anchor);
      break;
    case "vinyl":
      drawVinyl(inp, glowPx, scaleRef, anchor, bass);
      break;
    case "ripple":
      drawRipple(inp, st, glowPx, scaleRef, anchor, bass);
      break;
  }

  /* ---- particles ---- */
  if (s.particles > 0) drawParticles(inp, st, scaleRef);

  /* ---- text ---- */
  drawTextBlock(inp);

  /* ---- progress bar ---- */
  if (s.showProgress) {
    const barH = Math.max(3, h * 0.006);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = s.colorMode === "solid" ? s.color1 : s.color2;
    ctx.fillRect(0, h - barH, Math.max(0, Math.min(1, inp.progress)) * w, barH);
  }

  ctx.restore();
}

/* ---------------------------- bars / mirror ----------------------- */

function drawBars(
  inp: RenderInput,
  mirror: boolean,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t } = inp;
  const n = Math.max(8, Math.min(256, Math.round(s.barCount)));
  const padX = w * 0.04;
  const hasTitle =
    (s.showTitle && s.titleText.trim().length > 0) ||
    (s.showArtist && s.artistText.trim().length > 0);

  const autoBase = h - h * (hasTitle ? 0.08 : 0.04);
  // explicit vizPos (drag/chips) overrides the classic bottom-anchored look
  const cy = s.vizPos.y >= 0 ? Math.min(anchor.y, h * 0.97) : autoBase;

  const availH = mirror ? h * 0.42 : Math.max(h * 0.2, cy - h * 0.08);
  const maxHalf = availH;

  const slot = (w - padX * 2) / n;
  const bw = Math.max(1, slot * (1 - s.barGap));
  const r = s.roundedBars ? Math.min(bw / 2, 12 * scaleRef) : 0;

  for (let i = 0; i < n; i++) {
    const v = Math.min(1, bandValue(freq, sampleRate, i, n) * s.sensitivity);
    const barH = Math.max(v * maxHalf, v > 0.02 ? 2 : 0);
    if (barH <= 0) continue;
    const x = padX + i * slot + (slot - bw) / 2;
    const color = elementColor(s, i, n, t);

    ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
    if (glowPx > 0.5) ctx.shadowColor = color;
    ctx.fillStyle = color;

    if (mirror) {
      roundRectPath(ctx, x, cy - barH, bw, barH * 2, r);
      ctx.fill();
    } else {
      roundRectPath(ctx, x, cy - barH, bw, barH, r);
      ctx.fill();
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
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t } = inp;
  const n = Math.max(16, Math.min(240, Math.round(s.barCount)));
  const cx = anchor.x;
  const cy = anchor.y;
  const m = Math.min(w, h);
  // center artwork (optional) sits inside the ring of bars
  const artSize = inp.centerImg ? Math.max(24, s.centerSize * m) : 0;
  const r0 = Math.max(m * 0.17, artSize ? (artSize / 2) * 1.18 : 0);
  const maxLen = m * 0.26;
  const bw = ((Math.PI * 2 * r0) / n) * (1 - s.barGap);
  const rotation = t * s.rotateSpeed;

  if (artSize > 0) drawCenterArt(inp, cx, cy, artSize, s.centerRound);

  for (let i = 0; i < n; i++) {
    const v = Math.min(1, bandValue(freq, sampleRate, i, n) * s.sensitivity);
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

function drawFreqWave(
  inp: RenderInput,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s } = inp;
  const n = 128;
  const cy = anchor.y;
  const maxHalf = h * 0.24;
  const padX = w * 0.08;

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

function drawWave(
  inp: RenderInput,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, time, settings: s } = inp;
  const cy = anchor.y;
  const amp = h * 0.26;
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

/* ---------------------- smooth circular spectrum ------------------ */

/** sample the spectrum around a circle: index 0 = top (bass), half way =
 *  bottom (highs), mirrored so both sides show mids — the "ball" mapping
 *  where the top of the circle is low bass and the bottom is treble */
function circularBands(
  freq: Uint8Array,
  sampleRate: number,
  n: number
): Float32Array {
  const half = Math.max(8, Math.floor(n / 2));
  const raw = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    raw[i] = bandValue(freq, sampleRate, i, half);
  }
  // gaussian-ish 5-tap smoothing so the ring flows instead of spiking
  const sm = new Float32Array(half);
  const K = [1, 4, 6, 4, 1];
  for (let i = 0; i < half; i++) {
    let acc = 0;
    for (let k = -2; k <= 2; k++) {
      const j = Math.max(0, Math.min(half - 1, i + k));
      acc += raw[j] * K[k + 2];
    }
    sm[i] = acc / 16;
  }
  const out = new Float32Array(n);
  const halfN = n / 2;
  for (let i = 0; i < n; i++) {
    const u = i <= halfN ? i / halfN : (n - i) / halfN;
    out[i] = sm[Math.min(half - 1, Math.round(u * (half - 1)))];
  }
  // second pass around the circle (wraps the seam at the top)
  let soft = out;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      next[i] =
        (soft[(i - 1 + n) % n] + soft[i] * 2 + soft[(i + 1) % n]) / 4;
    }
    soft = next;
  }
  return soft;
}

/** smooth closed curve through points (quadratic through midpoints) */
function smoothClosedPath(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[]
): void {
  const n = pts.length;
  if (n < 3) return;
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p.x, p.y, next.x, next.y);
  }
}

/**
 * The reacting ring shared by the halo / vinyl / ripple styles: a smooth
 * band whose thickness follows the spectrum around the circle (bass at
 * the top, highs at the bottom), filled with the configured colors and
 * stroked along its outer edge.
 */
function drawHaloBand(
  inp: RenderInput,
  cx: number,
  cy: number,
  r0: number,
  band: number,
  glowPx: number,
  scaleRef: number,
  rotation: number,
  edgeWidth: number
): void {
  const { ctx, freq, sampleRate, settings: s, t } = inp;
  const n = Math.max(24, Math.min(160, Math.round(s.barCount)));
  const vals = circularBands(freq, sampleRate, n);

  const outer: { x: number; y: number }[] = [];
  const innerStart = { x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, vals[i] * s.sensitivity);
    // soften spikes + keep a visible base ring even in silence, so it
    // always reads as a ring that swells — never a collapsing blob
    const e = Math.pow(v, 0.88);
    const th = (i / n) * Math.PI * 2 - Math.PI / 2 + rotation; // start at top
    const r = r0 + band * (0.16 + 0.84 * e);
    outer.push({ x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r });
    if (i === 0) {
      innerStart.x = cx + Math.cos(th) * r0;
      innerStart.y = cy + Math.sin(th) * r0;
    }
  }

  /* fill the band: outer curve forward, inner circle backward */
  let fill: string | CanvasGradient;
  if (s.colorMode === "gradient") {
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r0 + band);
    g.addColorStop(0, rgba(s.color1, 0.95));
    g.addColorStop(1, rgba(s.color2, 0.95));
    fill = g;
  } else if (s.colorMode === "rainbow") {
    const conic = (
      ctx as CanvasRenderingContext2D & {
        createConicGradient?: (
          startAngle: number,
          x: number,
          y: number
        ) => CanvasGradient;
      }
    ).createConicGradient;
    if (typeof conic === "function") {
      const g = conic.call(ctx, rotation - Math.PI / 2, cx, cy);
      for (let k = 0; k <= 6; k++) {
        g.addColorStop(k / 6, `hsl(${(k / 6) * 320 + (t * 40) % 360} 85% 60%)`);
      }
      fill = g;
    } else {
      const g = ctx.createLinearGradient(cx - r0 - band, cy, cx + r0 + band, cy);
      for (let k = 0; k <= 4; k++) {
        g.addColorStop(k / 4, `hsl(${(k / 4) * 320 + (t * 40) % 360} 85% 60%)`);
      }
      fill = g;
    }
  } else {
    fill = rgba(s.color1, 0.95);
  }

  ctx.save();
  ctx.beginPath();
  smoothClosedPath(ctx, outer);
  ctx.lineTo(innerStart.x, innerStart.y);
  // travel the inner circle backwards → nonzero winding leaves the
  // middle (behind the art) unfilled
  const a0 = -Math.PI / 2 + rotation;
  ctx.arc(cx, cy, r0, a0, a0 - Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.shadowBlur = glowPx > 0.5 ? glowPx * 0.8 : 0;
  if (glowPx > 0.5) ctx.shadowColor = s.colorMode === "solid" ? s.color1 : s.color2;
  ctx.fill();
  ctx.shadowBlur = 0;

  /* outer edge stroke */
  if (edgeWidth > 0.05) {
    ctx.beginPath();
    smoothClosedPath(ctx, outer);
    ctx.strokeStyle =
      s.colorMode === "solid" ? s.color1 : mixHex(s.color1, s.color2, 0.65);
    ctx.lineWidth = Math.max(1, edgeWidth * scaleRef * 2);
    ctx.lineJoin = "round";
    ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
    if (glowPx > 0.5) ctx.shadowColor = s.color2;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* ------------------------------ halo ------------------------------ */

function drawHalo(
  inp: RenderInput,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, settings: s, t } = inp;
  const m = Math.min(w, h);
  const cx = anchor.x;
  const cy = anchor.y;

  const artSize = Math.max(24, s.centerSize * m);
  drawCenterArt(inp, cx, cy, artSize, s.centerRound);

  const r0 = (artSize / 2) * 1.16 + 6 * scaleRef;
  const band = Math.max(6 * scaleRef, m * s.haloSpread);
  drawHaloBand(inp, cx, cy, r0, band, glowPx, scaleRef, t * s.rotateSpeed, s.lineWidth);
}

/* ------------------------------ vinyl ----------------------------- */

function drawVinyl(
  inp: RenderInput,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number },
  bass: number
): void {
  const { ctx, w, h, settings: s, t } = inp;
  const m = Math.min(w, h);
  const cx = anchor.x;
  const cy = anchor.y;

  const labelSize = Math.max(24, s.centerSize * m); // the spinning image
  const discR = (labelSize / 2) * 1.9 + 8 * scaleRef;
  const spin = t * s.rotateSpeed;

  // reacting ring around the disc
  drawHaloBand(
    inp,
    cx,
    cy,
    discR * 1.07,
    Math.max(6 * scaleRef, m * s.haloSpread),
    glowPx,
    scaleRef,
    spin * 0.4,
    s.lineWidth
  );

  ctx.save();
  ctx.translate(cx, cy);
  const pulse = 1 + bass * 0.035;
  ctx.scale(pulse, pulse);

  // disc body
  const g = ctx.createRadialGradient(0, 0, discR * 0.2, 0, 0, discR);
  g.addColorStop(0, "#17171c");
  g.addColorStop(0.75, "#0d0d10");
  g.addColorStop(1, "#08080a");
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = discR * 0.14;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, discR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // grooves
  for (let k = 0; k < 5; k++) {
    const gr = discR * (0.62 + k * 0.075);
    ctx.strokeStyle = `rgba(255,255,255,${(0.05 + k * 0.014).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (2.4 - k * 0.3) * scaleRef);
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // fixed sheen — light catching the grooves while the record spins
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(2, 7 * scaleRef);
  ctx.beginPath();
  ctx.arc(0, 0, discR * 0.82, -Math.PI * 0.78, -Math.PI * 0.42);
  ctx.stroke();

  // spinning label (your image, cover-cropped into a circle)
  ctx.save();
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.arc(0, 0, labelSize / 2, 0, Math.PI * 2);
  ctx.clip();
  if (inp.centerImg) {
    const img = inp.centerImg;
    const scale = Math.max(labelSize / img.width, labelSize / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    // placeholder glyph so it's obvious where the image goes
    const bc = rgba(contrastOn(s.bg), 0.9);
    const bw = labelSize * 0.11;
    for (let k = -1; k <= 1; k++) {
      const bh = labelSize * (k === 0 ? 0.42 : 0.26);
      roundRectPath(ctx, k * labelSize * 0.24 - bw / 2, -bh / 2, bw, bh, bw / 2);
      ctx.fillStyle = bc;
      ctx.fill();
    }
  }
  ctx.restore();

  // label ring + spindle
  ctx.strokeStyle = rgba(s.colorMode === "solid" ? s.color1 : s.color2, 0.4);
  ctx.lineWidth = Math.max(1, 3 * scaleRef);
  ctx.beginPath();
  ctx.arc(0, 0, labelSize / 2 + Math.max(1.5, 3 * scaleRef), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#1c1c21";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(3, 6 * scaleRef), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#050507";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.5, 2.5 * scaleRef), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ----------------------------- ripple ----------------------------- */

/** ripple lifetime, seconds */
const RING_LIFE = 1.7;

function drawRipple(
  inp: RenderInput,
  st: VizRenderState,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number },
  bass: number
): void {
  const { ctx, w, h, settings: s, t } = inp;
  const m = Math.min(w, h);
  const cx = anchor.x;
  const cy = anchor.y;

  const artSize = Math.max(24, s.centerSize * m);
  drawCenterArt(inp, cx, cy, artSize, s.centerRound);
  const r0 = (artSize / 2) * 1.14 + 6 * scaleRef;

  /* spawn a ring on every bass attack */
  if (
    bass > 0.3 &&
    bass > st.bassPrev + 0.04 &&
    t - st.lastSpawn > 0.16
  ) {
    st.rings.push({ t0: t, strong: bass });
    st.lastSpawn = t;
    if (st.rings.length > 12) st.rings.shift();
  }
  st.bassPrev = bass;
  st.rings = st.rings.filter((r) => t - r.t0 < RING_LIFE);

  /* thin reacting halo hugging the art */
  drawHaloBand(
    inp,
    cx,
    cy,
    r0,
    Math.max(5 * scaleRef, m * s.haloSpread),
    glowPx,
    scaleRef,
    t * s.rotateSpeed * 0.3,
    Math.max(1, s.lineWidth * 0.7)
  );

  /* expanding rings */
  const speed = Math.max(0.15, s.rotateSpeed);
  for (const ring of st.rings) {
    const p = Math.min(1, (t - ring.t0) / RING_LIFE); // 0..1
    const r = r0 + p * m * 0.42 * speed * (0.7 + ring.strong * 0.5);
    const alpha = Math.pow(1 - p, 1.6) * (0.3 + ring.strong * 0.55);
    if (alpha <= 0.01) continue;

    let color: string;
    if (s.colorMode === "rainbow") {
      color = `hsl(${(p * 300 + t * 40) % 360} 85% 60%)`;
    } else if (s.colorMode === "gradient") {
      color = mixHex(s.color1, s.color2, p);
    } else {
      color = s.color1;
    }

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(
      2,
      (1 - p) * 11 * scaleRef * (0.5 + ring.strong * 0.7)
    );
    ctx.shadowBlur = glowPx > 0.5 ? glowPx * 0.7 : 0;
    if (glowPx > 0.5) ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

/* -------------------------- particles ----------------------------- */

function drawParticles(
  inp: RenderInput,
  st: VizRenderState,
  scaleRef: number
): void {
  const { ctx, w, h, settings: s, t, dt } = inp;
  const count = Math.max(0, Math.min(140, Math.round(s.particles)));
  if (count === 0) return;
  if (st.partCount !== count) {
    st.parts = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      st.parts[i * 4] = Math.random() * w;
      st.parts[i * 4 + 1] = Math.random() * h;
      st.parts[i * 4 + 2] = (0.35 + Math.random() * 0.9) * h * 0.03;
      st.parts[i * 4 + 3] = Math.random() * Math.PI * 2;
    }
    st.partCount = count;
  }
  const speed = s.particleSpeed;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    let y = st.parts[o + 1] - st.parts[o + 2] * speed * dt;
    if (y < -h * 0.02) {
      y = h * 1.02;
      st.parts[o] = Math.random() * w;
    }
    st.parts[o + 1] = y;
    const x = st.parts[o] + Math.sin(t * 0.8 + st.parts[o + 3]) * 8 * scaleRef;
    const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + st.parts[o + 3] * 3);
    const alpha = 0.22 + 0.55 * tw;
    const r = (1 + ((st.parts[o + 3] * 7) % 1) * 2.1) * Math.max(1, scaleRef);
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------- text ------------------------------- */

function drawTextBlock(inp: RenderInput): void {
  const { ctx, w, h, settings: s } = inp;
  const rawTitle = s.showTitle ? s.titleText.trim() : "";
  const rawArtist = s.showArtist ? s.artistText.trim() : "";
  if (!rawTitle && !rawArtist) return;

  const fam = fontFamily(s.font);
  const upper = s.textUppercase;
  const title = upper ? rawTitle.toUpperCase() : rawTitle;
  const artist = upper ? rawArtist.toUpperCase() : rawArtist;

  const titleSize = Math.max(10, h * 0.045 * s.titleScale);
  const artistSize = Math.max(8, h * 0.028 * s.artistScale);
  const gap = Math.max(4, titleSize * 0.34);

  const titleFont = `800 ${titleSize}px ${fam}`;
  const artistFont = `700 ${artistSize}px ${fam}`;

  // measure the block so auto-positioning can bottom-align it
  ctx.save();
  ctx.font = titleFont;
  const titleW = title ? ctx.measureText(title).width : 0;
  ctx.font = artistFont;
  const artistW = artist ? ctx.measureText(artist).width : 0;
  const blockH =
    (artist ? artistSize : 0) + (artist && title ? gap : 0) + (title ? titleSize : 0);
  ctx.restore();

  const bottomPad = s.showProgress ? h * 0.045 : h * 0.03;
  const autoTop = h - bottomPad - blockH;
  const topY = s.textPos.y >= 0 ? s.textPos.y * h : autoTop;
  const ax = s.textPos.x * w;

  ctx.save();
  ctx.textAlign =
    s.align === "left" ? "left" : s.align === "right" ? "right" : "center";
  ctx.textBaseline = "top";
  // letter-spacing (Chromium 99+, ignored elsewhere)
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${Math.max(0.5, h * 0.0035).toFixed(2)}px`;
  } catch {
    /* not supported — fine */
  }
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = Math.max(2, h * 0.008);
  ctx.fillStyle = s.textColor;

  let y = topY;
  if (artist) {
    ctx.font = artistFont;
    ctx.fillText(artist, ax, y, w * 0.92);
    y += artistSize + gap;
  }
  if (title) {
    ctx.font = titleFont;
    ctx.fillText(title, ax, y, w * 0.92);
  }
  ctx.restore();
  void titleW;
  void artistW;
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
