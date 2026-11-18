/**
 * Core DSP library — pure TypeScript, operates on Float32Array channel data.
 *
 * IMPORTANT conventions:
 * - `Channels` = one Float32Array per channel. Lengths must match.
 * - Functions marked *in-place* mutate their input; callers must pass copies
 *   they own (the global audio store's channels must never be mutated).
 * - Heavy functions are async and accept an optional `onProgress` callback
 *   that they call periodically; the callback may yield to the event loop so
 *   the UI stays responsive.
 */

export type Channels = Float32Array[];

export type ProgressFn = (frac: number, stage?: string) => Promise<void>;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  return 20 * Math.log10(Math.max(g, 1e-9));
}

export function createChannels(count: number, length: number): Channels {
  const chs: Channels = [];
  for (let c = 0; c < count; c++) chs.push(new Float32Array(length));
  return chs;
}

export function copyChannels(chs: Channels): Channels {
  return chs.map((c) => c.slice());
}

export function mixdown(chs: Channels): Float32Array {
  if (chs.length === 1) return chs[0].slice();
  const n = chs[0].length;
  const out = new Float32Array(n);
  const inv = 1 / chs.length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < chs.length; c++) s += chs[c][i];
    out[i] = s * inv;
  }
  return out;
}

export function truePeak(chs: Channels): number {
  let peak = 0;
  for (const ch of chs) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export function rmsLevel(chs: Channels): number {
  let sum = 0;
  let count = 0;
  for (const ch of chs) {
    for (let i = 0; i < ch.length; i++) {
      sum += ch[i] * ch[i];
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

/** in-place multiply by linear factor */
export function scaleChannels(chs: Channels, factor: number): void {
  for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= factor;
}

/** in-place gain in dB */
export function applyGainDb(chs: Channels, db: number): void {
  scaleChannels(chs, dbToGain(db));
}

/* ------------------------------------------------------------------ */
/* Biquad filters (RBJ Audio EQ Cookbook)                              */
/* ------------------------------------------------------------------ */

export type BiquadType =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "lowshelf"
  | "highshelf"
  | "peaking";

export interface BiquadSpec {
  type: BiquadType;
  /** corner / center / shelf-midpoint frequency in Hz */
  freq: number;
  /** gain in dB (shelf & peaking only) */
  gainDb?: number;
  /** Q (peaking & pass filters). default 0.707 */
  q?: number;
}

export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function designBiquad(spec: BiquadSpec, fs: number): BiquadCoeffs {
  const f0 = Math.min(Math.max(spec.freq, 10), fs * 0.49);
  const w0 = (2 * Math.PI * f0) / fs;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const q = spec.q ?? 0.70710678;
  const alpha = sw / (2 * q);
  const A = Math.pow(10, (spec.gainDb ?? 0) / 40);

  let b0 = 0,
    b1 = 0,
    b2 = 0,
    a0 = 1,
    a1 = 0,
    a2 = 0;

  switch (spec.type) {
    case "lowpass":
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case "highpass":
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case "bandpass":
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case "lowshelf": {
      const S = 1; // shelf slope — gentle, smooth transition
      const al = (sw / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 - (A - 1) * cw + sq);
      b1 = 2 * A * (A - 1 - (A + 1) * cw);
      b2 = A * (A + 1 - (A - 1) * cw - sq);
      a0 = A + 1 + (A - 1) * cw + sq;
      a1 = -2 * (A - 1 + (A + 1) * cw);
      a2 = A + 1 + (A - 1) * cw - sq;
      break;
    }
    case "highshelf": {
      const S = 1;
      const al = (sw / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 + (A - 1) * cw + sq);
      b1 = -2 * A * (A - 1 + (A + 1) * cw);
      b2 = A * (A + 1 + (A - 1) * cw - sq);
      a0 = A + 1 - (A - 1) * cw + sq;
      a1 = 2 * (A - 1 - (A + 1) * cw);
      a2 = A + 1 - (A - 1) * cw - sq;
      break;
    }
    case "peaking":
      b0 = 1 + alpha * A;
      b1 = -2 * cw;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cw;
      a2 = 1 - alpha / A;
      break;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/** in-place transposed direct form II */
export function applyBiquadInPlace(ch: Float32Array, c: BiquadCoeffs): void {
  let z1 = 0;
  let z2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    ch[i] = y;
  }
}

/**
 * Filter channels (returns a NEW array; never mutates input).
 * `cascades` stacks the same filter N times: 1=12dB/oct, 2=24, 3=36, 4=48.
 */
export async function filterChannels(
  chs: Channels,
  fs: number,
  spec: BiquadSpec,
  cascades = 1,
  onProgress?: ProgressFn
): Promise<Channels> {
  const out = copyChannels(chs);
  const n = chs[0].length;
  for (let k = 0; k < cascades; k++) {
    const coeffs = designBiquad(spec, fs);
    for (let c = 0; c < out.length; c++) {
      applyBiquadInPlace(out[c], coeffs);
      if (onProgress && n > 500000) {
        await onProgress(
          (k * out.length + c + 1) / (cascades * out.length),
          "Filtering"
        );
      }
    }
  }
  return out;
}

/** Magnitude response (dB) of a biquad at frequency f — for EQ curve drawing */
export function biquadMagnitudeAt(spec: BiquadSpec, fs: number, f: number): number {
  const c = designBiquad(spec, fs);
  const w = (2 * Math.PI * f) / fs;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  // z^-1 = e^{-jw} = cos(w) - j sin(w)
  const numRe = c.b0 + c.b1 * cw + c.b2 * Math.cos(2 * w);
  const numIm = -(c.b1 * sw + c.b2 * Math.sin(2 * w));
  const denRe = 1 + c.a1 * cw + c.a2 * Math.cos(2 * w);
  const denIm = -(c.a1 * sw + c.a2 * Math.sin(2 * w));
  const numSq = numRe * numRe + numIm * numIm;
  const denSq = denRe * denRe + denIm * denIm;
  return 10 * Math.log10(Math.max(numSq, 1e-12) / Math.max(denSq, 1e-12));
}

/* ------------------------------------------------------------------ */
/* Look-ahead brickwall limiter                                        */
/* ------------------------------------------------------------------ */

export interface LimiterStats {
  maxReductionDb: number;
  /** fraction of samples where >0.1 dB of gain reduction was applied */
  activeFraction: number;
}

export interface LimiterOptions {
  ceilingDb?: number;
  lookaheadMs?: number;
  releaseMs?: number;
  onProgress?: ProgressFn;
}

/**
 * In-place stereo-linked look-ahead limiter. Guarantees output peak stays
 * at or below `ceilingDb` (final safety normalization if a transient still
 * sneaks through the smoothing). Smooth even with heavy reduction.
 */
export async function limitChannels(
  chs: Channels,
  fs: number,
  opts: LimiterOptions = {}
): Promise<LimiterStats> {
  const ceilingDb = opts.ceilingDb ?? -0.3;
  const lookaheadMs = opts.lookaheadMs ?? 5;
  const releaseMs = opts.releaseMs ?? 80;
  const onProgress = opts.onProgress;
  const ceiling = dbToGain(ceilingDb);
  // internal ceiling with a touch of headroom so smoothing residue stays
  // under the target; a final safety pass catches anything that slips past
  const innerCeil = ceiling * dbToGain(-0.6);

  const N = chs[0].length;
  const nCh = chs.length;
  const L = Math.max(1, Math.round((fs * lookaheadMs) / 1000));

  // 1) per-sample required gain (linked across channels)
  const g = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let c = 0; c < nCh; c++) {
      const a = Math.abs(chs[c][i]);
      if (a > m) m = a;
    }
    g[i] = m > innerCeil ? innerCeil / m : 1;
  }

  // 2) sliding-window minimum (monotonic deque) with look-ahead
  const t = new Float32Array(N);
  const dq = new Int32Array(N + L + 2);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < N + L; i++) {
    if (i < N) {
      const v = g[i];
      while (tail > head && g[dq[tail - 1]] >= v) tail--;
      dq[tail++] = i;
    }
    if (i >= L) {
      const nIdx = i - L;
      while (tail > head && dq[head] < nIdx) head++;
      t[nIdx] = g[dq[head]];
    }
  }

  // 3) asymmetric smoothing — fast attack (well inside the lookahead
  //    window), slow release — then apply gain
  const attackSec = Math.max(lookaheadMs / 7000, 0.0003);
  const atk = Math.exp(-1 / (fs * attackSec));
  const rel = Math.exp(-1 / (fs * (releaseMs / 1000)));
  let env = 1;
  let maxRedDb = 0;
  let activeCount = 0;
  const activeThresh = dbToGain(-0.1);
  for (let n = 0; n < N; n++) {
    const target = t[n];
    env =
      target < env
        ? atk * env + (1 - atk) * target
        : rel * env + (1 - rel) * target;
    if (env < activeThresh) activeCount++;
    const redDb = -gainToDb(env);
    if (redDb > maxRedDb) maxRedDb = redDb;
    if (env !== 1) {
      for (let c = 0; c < nCh; c++) chs[c][n] *= env;
    }
    if (onProgress && n > 0 && (n & 0x3fffff) === 0) {
      await onProgress(n / N, "Limiting");
    }
  }

  // 4) absolute safety: normalize down if we still overshot the ceiling
  const peak = truePeak(chs);
  if (peak > ceiling && peak > 0) {
    scaleChannels(chs, ceiling / peak);
  }

  return {
    maxReductionDb: maxRedDb,
    activeFraction: N > 0 ? activeCount / N : 0,
  };
}

/** In-place peak normalize; returns applied gain in dB */
export function normalizePeakDb(chs: Channels, targetDb: number): number {
  const peak = truePeak(chs);
  if (peak <= 1e-9) return 0;
  const gain = dbToGain(targetDb) / peak;
  scaleChannels(chs, gain);
  return gainToDb(gain);
}

/* ------------------------------------------------------------------ */
/* Resampling (cubic interpolation) — changes pitch & speed together   */
/* ------------------------------------------------------------------ */

/** rate > 1 → faster + higher pitch. Output sample rate stays `fs`. */
export function resampleChannel(ch: Float32Array, rate: number): Float32Array {
  const N = ch.length;
  const outLen = Math.max(1, Math.floor(N / rate));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * rate;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const xm1 = ch[i0 > 0 ? i0 - 1 : 0];
    const x0 = ch[Math.min(N - 1, i0)];
    const x1 = ch[Math.min(N - 1, i0 + 1)];
    const x2 = ch[Math.min(N - 1, i0 + 2)];
    out[i] =
      0.5 *
      (2 * x0 +
        (-xm1 + x1) * frac +
        (2 * xm1 - 5 * x0 + 4 * x1 - x2) * frac * frac +
        (-xm1 + 3 * x0 - 3 * x1 + x2) * frac * frac * frac);
  }
  return out;
}

export async function resampleChannels(
  chs: Channels,
  rate: number,
  onProgress?: ProgressFn
): Promise<Channels> {
  const out: Channels = [];
  for (let c = 0; c < chs.length; c++) {
    out.push(resampleChannel(chs[c], rate));
    if (onProgress) await onProgress((c + 1) / chs.length, "Resampling");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Simple edit operations (all return new arrays)                      */
/* ------------------------------------------------------------------ */

export function reverseChannels(chs: Channels): Channels {
  return chs.map((ch) => ch.slice().reverse());
}

export function sliceChannels(
  chs: Channels,
  startSample: number,
  endSample: number
): Channels {
  const a = Math.max(0, Math.floor(startSample));
  const b = Math.min(chs[0].length, Math.ceil(endSample));
  return chs.map((ch) => ch.slice(a, b));
}

export type ChannelMode = "mono" | "stereo" | "left" | "right" | "swap";

export function convertChannels(chs: Channels, mode: ChannelMode): Channels {
  const N = chs[0].length;
  switch (mode) {
    case "mono": {
      if (chs.length === 1) return copyChannels(chs);
      const m = mixdown(chs);
      return [m.slice(), m.slice()];
    }
    case "stereo": {
      if (chs.length >= 2) return copyChannels(chs.slice(0, 2));
      return [chs[0].slice(), chs[0].slice()];
    }
    case "left":
      return [chs[0].slice(), chs[0].slice()];
    case "right": {
      const r = chs.length > 1 ? chs[1] : chs[0];
      return [r.slice(), r.slice()];
    }
    case "swap": {
      if (chs.length < 2) return copyChannels(chs);
      return [chs[1].slice(), chs[0].slice()];
    }
  }
}

/** cosine fade in/out — in place */
export function fadeInOut(
  chs: Channels,
  fs: number,
  fadeInSec: number,
  fadeOutSec: number
): void {
  const N = chs[0].length;
  const fi = Math.min(Math.round(fadeInSec * fs), N);
  const fo = Math.min(Math.round(fadeOutSec * fs), N);
  for (const ch of chs) {
    for (let i = 0; i < fi; i++) {
      ch[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
    }
    for (let i = 0; i < fo; i++) {
      ch[N - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Vocal removal / isolation                                           */
/* ------------------------------------------------------------------ */

/** karaoke: cancel centered content, keep the low end. Requires stereo. */
export async function karaokeChannels(
  chs: Channels,
  fs: number,
  bassKeepPct: number,
  onProgress?: ProgressFn
): Promise<Channels> {
  const N = chs[0].length;
  if (chs.length < 2) {
    // mono input — cancellation is impossible; return silence
    return createChannels(2, N);
  }
  const [L, R] = chs;
  // bass extracted from the mid signal, low-passed at 170 Hz (2 cascades)
  const mid = new Float32Array(N);
  for (let i = 0; i < N; i++) mid[i] = (L[i] + R[i]) * 0.5;
  const bass = mid.slice();
  const lp = designBiquad({ type: "lowpass", freq: 170 }, fs);
  applyBiquadInPlace(bass, lp);
  applyBiquadInPlace(bass, lp);
  const k = (bassKeepPct / 100) * 0.9;
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const side = (L[i] - R[i]) * 0.62;
    const b = bass[i] * k;
    outL[i] = side + b;
    outR[i] = -side + b;
  }
  if (onProgress) await onProgress(1);
  return [outL, outR];
}

/** acapella: isolate the centered mid signal, band-limited. Requires stereo. */
export async function isolateVocalsChannels(
  chs: Channels,
  fs: number,
  lowCutHz: number,
  highCutHz: number,
  onProgress?: ProgressFn
): Promise<Channels> {
  const N = chs[0].length;
  const mid = mixdown(chs);
  const hp = designBiquad({ type: "highpass", freq: lowCutHz }, fs);
  applyBiquadInPlace(mid, hp);
  applyBiquadInPlace(mid, hp);
  const lp = designBiquad({ type: "lowpass", freq: highCutHz }, fs);
  applyBiquadInPlace(mid, lp);
  applyBiquadInPlace(mid, lp);
  if (onProgress) await onProgress(1);
  return [mid.slice(), mid.slice()];
}

/* ------------------------------------------------------------------ */
/* Stereo widener (mid/side + optional Haas)                           */
/* ------------------------------------------------------------------ */

export interface WidenOptions {
  /** 0 = mono, 100 = untouched, 200 = extra wide */
  widthPct: number;
  /** Haas enhancement — delay one side by a few milliseconds */
  haasOn: boolean;
  /** Haas delay in ms (5–30) */
  haasMs: number;
  onProgress?: ProgressFn;
}

/**
 * Mid/side stereo width control. Mono input is passed through untouched
 * (the caller should warn). Peaks are clamped to ±1 for safety.
 */
export async function widenChannels(
  chs: Channels,
  fs: number,
  opts: WidenOptions
): Promise<Channels> {
  const N = chs[0].length;
  if (chs.length < 2) return copyChannels(chs);

  const [L, R] = chs;
  const w = opts.widthPct / 100;
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const mid = (L[i] + R[i]) * 0.5;
    const side = (L[i] - R[i]) * 0.5 * w;
    let l = mid + side;
    let r = mid - side;
    if (l > 1) l = 1;
    else if (l < -1) l = -1;
    if (r > 1) r = 1;
    else if (r < -1) r = -1;
    outL[i] = l;
    outR[i] = r;
  }

  // optional Haas delay on the right channel
  if (opts.haasOn && opts.haasMs > 0) {
    const d = Math.min(N - 1, Math.max(1, Math.round((fs * opts.haasMs) / 1000)));
    outR.copyWithin(0, d);
    for (let i = 0; i < d; i++) outR[i] = 0;
  }

  if (opts.onProgress) await opts.onProgress(1);
  return [outL, outR];
}

/* ------------------------------------------------------------------ */
/* Tremolo (amplitude modulation)                                      */
/* ------------------------------------------------------------------ */

export type TremoloWave = "sine" | "triangle" | "square";

export interface TremoloOptions {
  rateHz: number;
  /** 0–100 */
  depthPct: number;
  wave: TremoloWave;
  /** L/R LFO phase offset in degrees (0–180), stereo files only */
  stereoPhaseDeg: number;
  onProgress?: ProgressFn;
}

/**
 * Amplitude modulation with a phase accumulator. The LFO maps to the range
 * [1 - depth, 1]. Square edges are smoothed with a ~5 ms one-pole filter to
 * avoid clicks. For stereo input, the right channel LFO is offset by
 * `stereoPhaseDeg` degrees for a subtle auto-pan feel.
 */
export async function tremoloChannels(
  chs: Channels,
  fs: number,
  opts: TremoloOptions
): Promise<Channels> {
  const N = chs[0].length;
  const depth = Math.min(1, Math.max(0, opts.depthPct / 100));
  const inc = (2 * Math.PI * opts.rateHz) / fs;
  const phaseOffset = (opts.stereoPhaseDeg * Math.PI) / 180;
  const nCh = chs.length;
  const out: Channels = [];
  for (let c = 0; c < nCh; c++) out.push(new Float32Array(N));

  // per-channel LFO state; stereo offset only on the right channel
  const phases = new Float64Array(nCh);
  if (nCh > 1) phases[1] = phaseOffset;
  // one-pole smoother for the square wave (~5 ms)
  const smooth = Math.exp((-2 * Math.PI * 1000) / (5 * fs)); // ~5ms time const
  const smoothed = new Float64Array(nCh).fill(1);

  const period = 2 * Math.PI;
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < nCh; c++) {
      let lfo: number;
      const p = phases[c] % period;
      if (opts.wave === "sine") {
        lfo = 0.5 - 0.5 * Math.cos(p);
      } else if (opts.wave === "triangle") {
        // 0..1..0 over one period
        const t = p / period;
        lfo = t < 0.5 ? t * 2 : 2 - t * 2;
      } else {
        lfo = p < Math.PI ? 1 : 0;
      }
      if (opts.wave === "square") {
        // smooth the edges to avoid clicks
        smoothed[c] = smooth * smoothed[c] + (1 - smooth) * lfo;
        lfo = smoothed[c];
      }
      const gain = 1 - depth * lfo;
      out[c][i] = chs[c][i] * gain;
      phases[c] += inc;
    }
    if (opts.onProgress && i > 0 && (i & 0x3fffff) === 0) {
      await opts.onProgress(i / N, "Modulating");
    }
  }
  if (opts.onProgress) await opts.onProgress(1);
  return out;
}

/* ------------------------------------------------------------------ */
/* Envelope / analysis helpers                                         */
/* ------------------------------------------------------------------ */

export interface EnvelopeResult {
  /** RMS level in dB per hop (unclamped, can be very low) */
  envDb: Float32Array;
  hopSamples: number;
}

export function envelopeRmsDb(
  sig: Float32Array,
  frameSamples: number,
  hopSamples: number
): EnvelopeResult {
  const frames = Math.max(1, Math.floor((sig.length - frameSamples) / hopSamples) + 1);
  const envDb = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * hopSamples;
    let sum = 0;
    for (let i = 0; i < frameSamples; i++) {
      const v = sig[start + i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / frameSamples);
    envDb[f] = 20 * Math.log10(Math.max(rms, 1e-7));
  }
  return { envDb, hopSamples };
}

/** Median filter over the valid (non-zero) entries of `values` */
export function medianFilterSparse(values: Float32Array, window: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  const half = Math.floor(window / 2);
  const buf: number[] = [];
  for (let i = 0; i < n; i++) {
    if (values[i] <= 0) {
      out[i] = 0;
      continue;
    }
    buf.length = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      if (values[j] > 0) buf.push(values[j]);
    }
    buf.sort((a, b) => a - b);
    out[i] = buf[Math.floor(buf.length / 2)];
  }
  return out;
}

export function percentileOf(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx];
}
