/**
 * Bass pitch detection for the Rebasser.
 *
 * Strategy: anti-alias low-pass → decimate to ~1 kHz → frame-wise
 * autocorrelation (via FFT) on the decimated signal → median filter +
 * octave correction → smooth pitch track + bass-band envelope track.
 */

import {
  applyBiquadInPlace,
  designBiquad,
  envelopeRmsDb,
  medianFilterSparse,
  mixdown,
  type Channels,
  type ProgressFn,
} from "./dsp";
import { FFT } from "./fft";

export interface BassAnalysis {
  /** hop duration in seconds */
  hopSec: number;
  /**
   * Window-center offset in seconds: frame f's estimates describe the
   * signal at time f·hopSec + centerOffsetSec (frame f analyzes the
   * window [f·hopSec, f·hopSec + 2·centerOffsetSec)). Consumers MUST add
   * this offset when mapping frames back to sample positions — using the
   * window start instead makes everything they drive run half a window
   * (~128 ms) too early.
   */
  centerOffsetSec: number;
  /** frames count */
  frames: number;
  /** detected bass fundamental per frame in Hz (0 = no confident bass) */
  f0: Float32Array;
  /** autocorrelation confidence per frame, 0..1 */
  conf: Float32Array;
  /** bass-band RMS level in dB per frame */
  envDb: Float32Array;
  /** median of valid f0 values, 0 if none */
  medianF0: number;
  /** 10th..90th percentile range of valid f0 values */
  rangeF0: [number, number];
}

const DECIM_TARGET_FS = 1000;
const FRAME = 256; // decimated samples (~256 ms)
const HOP = 48; // decimated samples (~48 ms)
const MIN_F = 24;
const MAX_F = 290;

export async function analyzeBass(
  chs: Channels,
  fs: number,
  onProgress?: ProgressFn
): Promise<BassAnalysis> {
  // 1) mono + anti-alias low-pass + decimate
  let mono = mixdown(chs);
  const lp = designBiquad({ type: "lowpass", freq: 560 }, fs);
  applyBiquadInPlace(mono, lp);
  applyBiquadInPlace(mono, lp);
  const D = Math.max(1, Math.round(fs / DECIM_TARGET_FS));
  const fsD = fs / D;
  const decim = new Float32Array(Math.floor(mono.length / D));
  for (let i = 0; i < decim.length; i++) decim[i] = mono[i * D];
  mono = decim;

  // 2) bass-band signal (30–250 Hz in decimated domain) for the envelope
  const bassSig = mono.slice();
  const hp = designBiquad({ type: "highpass", freq: 30 }, fsD);
  applyBiquadInPlace(bassSig, hp);
  const lp2 = designBiquad({ type: "lowpass", freq: 250 }, fsD);
  applyBiquadInPlace(bassSig, lp2);
  const { envDb } = envelopeRmsDb(bassSig, FRAME, HOP);

  // 3) frame-wise autocorrelation
  const nFrames = Math.max(1, Math.floor((mono.length - FRAME) / HOP) + 1);
  const fftSize = 512;
  const fft = new FFT(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const hann = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  }

  const lagMin = Math.max(2, Math.floor(fsD / MAX_F));
  const lagMax = Math.min(FRAME - 2, Math.ceil(fsD / MIN_F));

  const f0 = new Float32Array(nFrames);
  const conf = new Float32Array(nFrames);

  for (let f = 0; f < nFrames; f++) {
    if (onProgress && f % 64 === 0) await onProgress(f / nFrames, "Analyzing bass");
    const start = f * HOP;
    re.fill(0);
    im.fill(0);
    let energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = mono[start + i] * hann[i];
      re[i] = v;
      energy += v * v;
    }
    if (energy < 1e-9) continue;

    // ACF via FFT
    fft.transform(re, im, false);
    for (let i = 0; i < fftSize; i++) {
      const p = re[i] * re[i] + im[i] * im[i];
      re[i] = p;
      im[i] = 0;
    }
    fft.transform(re, im, true);

    // peak picking on the (bias-corrected) ACF within the lag range
    let best = -1;
    let bestVal = 0;
    let globalMax = 0;
    const acf = (lag: number) => (re[lag] * FRAME) / (FRAME - lag);
    for (let lag = lagMin; lag <= lagMax; lag++) {
      const v = acf(lag);
      if (v > globalMax) globalMax = v;
    }
    if (globalMax <= 0) continue;
    const accept = 0.85 * globalMax;
    for (let lag = lagMin + 1; lag < lagMax; lag++) {
      const v = acf(lag);
      const prev = acf(lag - 1);
      const next = acf(lag + 1);
      if (v >= prev && v >= next && v >= accept) {
        best = lag;
        bestVal = v;
        break;
      }
    }
    if (best < 0) {
      best = lagMin;
      bestVal = acf(lagMin);
    }

    // parabolic interpolation around the peak
    const y0 = acf(best - 1);
    const y1 = acf(best);
    const y2 = acf(best + 1);
    const denom = y0 - 2 * y1 + y2;
    const delta = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
    const lagRef = best + Math.max(-1, Math.min(1, delta));
    const freq = fsD / lagRef;

    if (freq >= MIN_F * 0.9 && freq <= MAX_F * 1.15) {
      f0[f] = freq;
      conf[f] = Math.max(0, Math.min(1, bestVal / re[0]));
    }
  }

  // 4) median filter + octave correction + light smoothing
  let track = medianFilterSparse(f0, 5);

  // octave snap: compare each valid frame against local median of neighbors
  const snapped = track.slice();
  for (let i = 0; i < track.length; i++) {
    if (track[i] <= 0) continue;
    const neigh: number[] = [];
    for (let j = Math.max(0, i - 6); j <= Math.min(track.length - 1, i + 6); j++) {
      if (j !== i && track[j] > 0) neigh.push(track[j]);
    }
    if (neigh.length < 3) continue;
    neigh.sort((a, b) => a - b);
    const med = neigh[Math.floor(neigh.length / 2)];
    const r = track[i] / med;
    if (r < 0.6) snapped[i] = track[i] * 2;
    else if (r > 1.7) snapped[i] = track[i] / 2;
  }
  track = medianFilterSparse(snapped, 5);

  // light one-pole smoothing across valid runs — edge-preserving: values
  // within ~half a semitone of the running value are smoothed (removes
  // frame-to-frame jitter), but larger jumps adopt immediately so real
  // note changes never drag through intermediate pitches that the note
  // mapper would then snap to wrong semitones
  const smooth = new Float32Array(track.length);
  let last = 0;
  for (let i = 0; i < track.length; i++) {
    if (track[i] <= 0) {
      last = 0;
      smooth[i] = 0;
      continue;
    }
    if (last > 0 && Math.abs(track[i] / last - 1) < 0.03) {
      last = last * 0.6 + track[i] * 0.4;
    } else {
      last = track[i];
    }
    smooth[i] = last;
  }

  // 5) stats
  const valid: number[] = [];
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] > 0 && conf[i] > 0.25) valid.push(smooth[i]);
  }
  valid.sort((a, b) => a - b);
  const median = valid.length > 0 ? valid[Math.floor(valid.length / 2)] : 0;
  const p10 =
    valid.length > 0 ? valid[Math.floor(valid.length * 0.1)] : 0;
  const p90 =
    valid.length > 0 ? valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.9))] : 0;

  return {
    hopSec: HOP / fsD,
    centerOffsetSec: (FRAME / 2) / fsD,
    frames: nFrames,
    f0: smooth,
    conf,
    envDb,
    medianF0: median,
    rangeF0: [p10, p90],
  };
}
