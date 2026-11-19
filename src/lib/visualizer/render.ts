/**
 * Visualizer engine — pure canvas rendering shared by the live preview and
 * the exported video, so what you see is exactly what you get.
 *
 * Two tiers of styles:
 *  - Classic: bars / mirror / radial / freq-wave / wave.
 *  - "Better Visualizers" (premium): photo-background styles with floating
 *    particles, bass-reactive background blur + darken, draggable text and
 *    visualizer anchors, custom fonts, and center-art styles:
 *      hanging — waveform hanging down from a line under the text
 *      flank   — mirrored bar clusters flanking a center artwork
 *      lines   — frequency "equalizer ladder" lines beside the artwork
 *      blob    — wobbling liquid blob with a glowing rim and art inside
 */

export type VizPreset =
  | "bars"
  | "mirror"
  | "radial"
  | "freq-wave"
  | "wave"
  | "hanging"
  | "flank"
  | "lines"
  | "blob";
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

  /* ---------------- background & atmosphere (Better Visualizers) ------ */
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

  /* ---------------- center art (blob / flank / lines) ----------------- */
  centerImage: string | null;
  /** fraction of min(w,h), 0.08..0.45 */
  centerSize: number;
  /** 0 = square, 1 = circle */
  centerRound: number;
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
};

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

/** display fonts for the text overlays (loaded via the Google Fonts
 *  stylesheet in the root layout; canvas falls back to system-ui until
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
  /** premium styles live in the "Better Visualizers" dropdown */
  premium?: boolean;
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

  /* ---------------- Better Visualizers (premium) ------------------- */

  {
    id: "skyline",
    label: "Skyline — monochrome city, hanging wave",
    premium: true,
    settings: {
      preset: "hanging",
      colorMode: "solid",
      color1: "#ffffff",
      bg: "#0b0b0d",
      bgImage: "/viz/bg-skyline.jpg",
      bgBlur: 0,
      bgDark: 0.2,
      bgBass: 0.75,
      vignette: 0.35,
      particles: 70,
      particleSpeed: 1.5,
      glow: 0,
      barCount: 72,
      barGap: 0.22,
      sensitivity: 1.15,
      font: "modern",
      textUppercase: true,
      titleScale: 1.7,
      artistScale: 0.8,
      showArtist: false,
      textColor: "#f4f4f5",
      textPos: { x: 0.5, y: 0.26 },
      align: "center",
      vizPos: { x: 0.5, y: 0.46 },
    },
  },
  {
    id: "dusk-ridge",
    label: "Dusk Ridge — mountains, glowing wave",
    premium: true,
    settings: {
      preset: "freq-wave",
      colorMode: "gradient",
      color1: "#ff5a2a",
      color2: "#ffb03a",
      bg: "#0a1218",
      bgImage: "/viz/bg-ridge.jpg",
      bgBlur: 2,
      bgDark: 0.22,
      bgBass: 0.5,
      vignette: 0.4,
      particles: 45,
      particleSpeed: 0.9,
      glow: 55,
      lineWidth: 4,
      fillWave: false,
      sensitivity: 1.3,
      font: "grotesk",
      textUppercase: false,
      titleScale: 0.9,
      artistScale: 1.35,
      showArtist: true,
      textColor: "#ffffff",
      textPos: { x: 0.5, y: 0.58 },
      align: "center",
      vizPos: { x: 0.5, y: 0.42 },
    },
  },
  {
    id: "neon-ember",
    label: "Neon Ember — red city, liquid blob",
    premium: true,
    settings: {
      preset: "blob",
      colorMode: "gradient",
      color1: "#ff4500",
      color2: "#ffb03a",
      bg: "#0a0302",
      bgImage: "/viz/bg-neon.jpg",
      bgBlur: 3,
      bgDark: 0.3,
      bgBass: 0.6,
      vignette: 0.45,
      particles: 90,
      particleSpeed: 1.6,
      glow: 70,
      sensitivity: 1.2,
      font: "modern",
      textUppercase: false,
      titleScale: 0.85,
      artistScale: 1.25,
      showArtist: true,
      textColor: "#ffffff",
      textPos: { x: 0.5, y: 0.74 },
      align: "center",
      vizPos: { x: 0.5, y: 0.42 },
      centerSize: 0.3,
      centerRound: 1,
    },
  },
  {
    id: "vortex-ghost",
    label: "Vortex Ghost — teal spiral, liquid blob",
    premium: true,
    settings: {
      preset: "blob",
      colorMode: "gradient",
      color1: "#9be9ff",
      color2: "#2fb8d8",
      bg: "#04141a",
      bgImage: "/viz/bg-vortex.jpg",
      bgBlur: 4,
      bgDark: 0.25,
      bgBass: 0.55,
      vignette: 0.5,
      particles: 60,
      particleSpeed: 0.8,
      glow: 60,
      sensitivity: 1.15,
      font: "grotesk",
      textUppercase: false,
      titleScale: 0.85,
      artistScale: 1.25,
      showArtist: true,
      textColor: "#eafcff",
      textPos: { x: 0.5, y: 0.74 },
      align: "center",
      vizPos: { x: 0.5, y: 0.42 },
      centerSize: 0.3,
      centerRound: 1,
    },
  },
  {
    id: "album-flank",
    label: "Album Flank — your art, mirrored bars",
    premium: true,
    settings: {
      preset: "flank",
      colorMode: "solid",
      color1: "#ffffff",
      bg: "#0d0d10",
      bgImage: "use-center",
      bgBlur: 55,
      bgDark: 0.38,
      bgBass: 0.4,
      vignette: 0.3,
      particles: 0,
      glow: 0,
      barCount: 56,
      barGap: 0.35,
      sensitivity: 1.1,
      font: "modern",
      textUppercase: false,
      titleScale: 0.8,
      artistScale: 1.3,
      showArtist: true,
      textColor: "#ffffff",
      textPos: { x: 0.5, y: 0.79 },
      align: "center",
      vizPos: { x: 0.5, y: 0.45 },
      centerSize: 0.34,
      centerRound: 0.1,
    },
  },
  {
    id: "flank-lines",
    label: "Flank Lines — minimal ladder equalizer",
    premium: true,
    settings: {
      preset: "lines",
      colorMode: "solid",
      color1: "#ffffff",
      bg: "#0d0d10",
      bgImage: "use-center",
      bgBlur: 50,
      bgDark: 0.42,
      bgBass: 0.35,
      vignette: 0.35,
      particles: 0,
      glow: 0,
      barCount: 48,
      sensitivity: 1.15,
      font: "condensed",
      textUppercase: true,
      titleScale: 0.75,
      artistScale: 1.45,
      showArtist: true,
      textColor: "#ffffff",
      textPos: { x: 0.5, y: 0.79 },
      align: "center",
      vizPos: { x: 0.5, y: 0.45 },
      centerSize: 0.34,
      centerRound: 0,
    },
  },
];

export const BETTER_PRESETS = STYLE_PRESETS.filter((p) => p.premium);

/** default visualizer anchor per preset (used when vizPos.y < 0 and to
 *  materialize a position when the user starts dragging) */
export function defaultVizPos(preset: VizPreset): { x: number; y: number } {
  switch (preset) {
    case "mirror":
    case "freq-wave":
    case "wave":
      return { x: 0.5, y: 0.46 };
    case "radial":
    case "flank":
    case "lines":
      return { x: 0.5, y: 0.5 };
    case "hanging":
      return { x: 0.5, y: 0.46 };
    case "blob":
      return { x: 0.5, y: 0.42 };
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

/** per-canvas mutable state (bass smoothing, particles) — the caller owns
 *  one instance per canvas (preview + one fresh per export) */
export interface VizRenderState {
  /** smoothed bass energy 0..1 */
  bass: number;
  /** particle data, 4 floats each: x, y, upward speed px/s, phase */
  parts: Float32Array;
  partCount: number;
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
  /** persistent per-bar peak heights (0..1); caller owns the state */
  peaks: Float32Array;
  /** seconds since last frame, for peak decay */
  dt: number;
  /** decoded background image, if the settings reference one */
  bgImg?: HTMLImageElement | null;
  /** decoded center artwork (blob / flank / lines + "use-center" bg) */
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
  if (!inp.state) inp.state = { bass: 0, parts: new Float32Array(0), partCount: 0 };
  const st = inp.state;
  const need = s.preset === "wave" || s.preset === "blob" || s.preset === "lines" ? 0 : s.barCount;
  if (inp.peaks.length !== need) {
    inp.peaks = new Float32Array(need);
  }
  const peaks = inp.peaks;

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
      drawBars(inp, peaks, false, glowPx, scaleRef, anchor);
      break;
    case "mirror":
      drawBars(inp, peaks, true, glowPx, scaleRef, anchor);
      break;
    case "radial":
      drawRadial(inp, peaks, glowPx, scaleRef, anchor);
      break;
    case "freq-wave":
      drawFreqWave(inp, glowPx, scaleRef, anchor);
      break;
    case "wave":
      drawWave(inp, glowPx, scaleRef, anchor);
      break;
    case "hanging":
      drawHanging(inp, peaks, glowPx, scaleRef, anchor);
      break;
    case "flank":
      drawFlank(inp, peaks, glowPx, scaleRef, anchor);
      break;
    case "lines":
      drawLines(inp, glowPx, scaleRef, anchor);
      break;
    case "blob":
      drawBlob(inp, glowPx, scaleRef, anchor, bass);
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
  peaks: Float32Array,
  mirror: boolean,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t, dt } = inp;
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
      roundRectPath(ctx, x, cy - barH, bw, barH * 2, r);
      ctx.fill();
    } else {
      roundRectPath(ctx, x, cy - barH, bw, barH, r);
      ctx.fill();
      if (s.capDots && p > 0.02) {
        ctx.shadowBlur = glowPx * 0.6;
        const capY = cy - p * maxHalf - 8 * scaleRef;
        ctx.beginPath();
        ctx.arc(x + bw / 2, capY, Math.max(1.5, bw * 0.28), 0, Math.PI * 2);
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
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t, dt } = inp;
  const n = Math.max(16, Math.min(240, Math.round(s.barCount)));
  const cx = anchor.x;
  const cy = anchor.y;
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

/* --------------------- hanging waveform (premium) ------------------ */

function drawHanging(
  inp: RenderInput,
  peaks: Float32Array,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t, dt } = inp;
  const n = Math.max(16, Math.min(160, Math.round(s.barCount)));
  const spanW = Math.min(w * 0.7, Math.max(w * 0.4, w * 0.62));
  const x0 = anchor.x - spanW / 2;
  const lineY = anchor.y;
  const maxDrop = h * 0.17;
  const slot = spanW / n;
  const bw = Math.max(1, slot * (1 - s.barGap));
  const decay = 0.9 * dt;

  // anchor line
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x0, lineY - Math.max(1, scaleRef), spanW, Math.max(2, 2 * scaleRef));

  for (let i = 0; i < n; i++) {
    const v = Math.min(1, bandValue(freq, sampleRate, i, n) * s.sensitivity);
    const p = Math.max(v, (peaks[i] ?? 0) - decay);
    peaks[i] = p;
    const drop = Math.max(v * maxDrop, v > 0.02 ? 2 : 0);
    if (drop <= 0 && p <= 0.001) continue;
    const x = x0 + i * slot + (slot - bw) / 2;
    const color = elementColor(s, i, n, t);
    ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
    if (glowPx > 0.5) ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillRect(x, lineY, bw, drop);
  }
  ctx.shadowBlur = 0;
}

/* ---------------- flank bar clusters (premium) --------------------- */

function drawFlank(
  inp: RenderInput,
  peaks: Float32Array,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t, dt } = inp;
  const size = Math.max(24, s.centerSize * Math.min(w, h));
  const artHalf = size / 2;
  const gapX = artHalf * 1.28;
  const cx = anchor.x;
  const cy = anchor.y;
  const nSide = Math.max(12, Math.min(80, Math.round(s.barCount / 2)));
  const clusterW = Math.min((w / 2 - gapX - w * 0.05) * 0.92, w * 0.24);
  const slot = clusterW / nSide;
  const bw = Math.max(1, slot * (1 - s.barGap));
  const maxHalf = Math.min(h * 0.2, size * 0.62);
  const decay = 0.9 * dt;

  drawCenterArt(inp, cx, cy, size, s.centerRound);

  for (const dir of [-1, 1] as const) {
    for (let i = 0; i < nSide; i++) {
      // mirrored bins: i=0 at the outer edge … i=nSide-1 beside the art
      const bin = dir < 0 ? nSide - 1 - i : i;
      const u = i / Math.max(1, nSide - 1); // 0 outer … 1 near art
      const win = Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.65);
      const v = Math.min(
        1,
        bandValue(freq, sampleRate, bin, nSide) * s.sensitivity * win
      );
      const idx = dir < 0 ? i : nSide + i;
      const p = Math.max(v, (peaks[idx] ?? 0) - decay);
      peaks[idx] = p;
      const bh = Math.max(v * maxHalf, v > 0.02 ? 2 : 0);
      if (bh <= 0) continue;
      const x =
        dir < 0
          ? cx - gapX - clusterW + i * slot + (slot - bw) / 2
          : cx + gapX + i * slot + (slot - bw) / 2;
      const color = elementColor(s, dir < 0 ? i : nSide - 1 - i, nSide, t);
      ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
      if (glowPx > 0.5) ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.fillRect(x, cy - bh, bw, bh * 2);
    }
  }
  ctx.shadowBlur = 0;
}

/* ---------------- flank line ladders (premium) --------------------- */

function drawLines(
  inp: RenderInput,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number }
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t } = inp;
  const size = Math.max(24, s.centerSize * Math.min(w, h));
  const artHalf = size / 2;
  const gapX = artHalf * 1.2;
  const cx = anchor.x;
  const cy = anchor.y;
  const n = Math.max(20, Math.min(120, Math.round(s.barCount)));
  const stackH = Math.min(h * 0.56, size * 1.95);
  const maxLen = Math.min(w * 0.12, (w / 2 - gapX - w * 0.06) * 0.9);
  const lineH = Math.max(1.5, 2.6 * scaleRef);

  drawCenterArt(inp, cx, cy, size, s.centerRound);

  for (const dir of [-1, 1] as const) {
    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1); // 0 bottom … 1 top
      // hourglass mapping: low bins near the vertical center, highs at
      // the outer ends — the classic "equalizer ladder" silhouette
      const dist = Math.abs(u - 0.5) * 2; // 0 center … 1 edges
      const bin = Math.round((1 - dist) * (n - 1) * 0.55);
      const v = Math.min(1, bandValue(freq, sampleRate, bin, n) * s.sensitivity);
      const len = Math.max(v * maxLen, v > 0.02 ? 2 : 0);
      if (len <= 0) continue;
      const y = cy - stackH / 2 + u * stackH - lineH / 2;
      const x = dir < 0 ? cx - gapX - len : cx + gapX;
      const color = elementColor(s, i, n, t);
      ctx.shadowBlur = glowPx > 0.5 ? glowPx : 0;
      if (glowPx > 0.5) ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, len, lineH);
    }
  }
  ctx.shadowBlur = 0;
}

/* ----------------------- liquid blob (premium) --------------------- */

function drawBlob(
  inp: RenderInput,
  glowPx: number,
  scaleRef: number,
  anchor: { x: number; y: number },
  bass: number
): void {
  const { ctx, w, h, freq, sampleRate, settings: s, t } = inp;
  const m = Math.min(w, h);
  const baseR = (Math.max(24, s.centerSize * m) / 2) * (1 + bass * 0.16);
  const cx = anchor.x;
  const cy = anchor.y;

  // overall loudness → wobble energy
  let loud = 0;
  for (let b = 2; b < Math.min(freq.length, 60); b++) loud += freq[b];
  loud = Math.min(1, (loud / 58 / 255) * 1.5);

  const path = new Path2D();
  const STEPS = 96;
  for (let i = 0; i <= STEPS; i++) {
    const th = (i / STEPS) * Math.PI * 2;
    const wob =
      0.055 * Math.sin(3 * th + t * 1.4) * (0.55 + bass * 0.9) +
      0.035 * Math.sin(5 * th - t * 2.2) * (0.4 + loud * 0.8) +
      0.02 * Math.sin(8 * th + t * 0.7);
    const r = baseR * (1 + wob);
    const x = cx + Math.cos(th) * r;
    const y = cy + Math.sin(th) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();

  // dark body
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = baseR * 0.16;
  ctx.fillStyle = "#0a0a0c";
  ctx.fill(path);
  ctx.restore();

  // center image clipped inside the blob (fallback: soft glyph)
  if (inp.centerImg) {
    ctx.save();
    ctx.clip(path);
    const img = inp.centerImg;
    const scale = Math.max((baseR * 2.1) / img.width, (baseR * 2.1) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.globalAlpha = 0.94;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.save();
    ctx.clip(path);
    const bc = rgba(contrastOn(s.bg), 0.9);
    for (let k = -1; k <= 1; k++) {
      const bw = baseR * 0.14;
      const bh = baseR * (k === 0 ? 0.9 : 0.55);
      roundRectPath(ctx, cx + k * baseR * 0.42 - bw / 2, cy - bh / 2, bw, bh, bw / 2);
      ctx.fillStyle = bc;
      ctx.fill();
    }
    ctx.restore();
  }

  // glowing rim
  const rimA = s.colorMode === "solid" ? s.color1 : s.color1;
  const rimB = s.colorMode === "solid" ? s.color1 : s.color2;
  const grad = ctx.createLinearGradient(cx - baseR, cy - baseR, cx + baseR, cy + baseR);
  grad.addColorStop(0, rimA);
  grad.addColorStop(1, rimB);
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(2, 5 * scaleRef);
  ctx.shadowBlur = glowPx > 0.5 ? glowPx * 1.5 : 12 * scaleRef;
  ctx.shadowColor = rimB;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
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
