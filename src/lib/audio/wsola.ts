/**
 * WSOLA time-stretching + combined speed/pitch processing.
 *
 * timeStretch: changes duration without touching pitch.
 * speedAndPitch: independent control of speed (tempo) and pitch.
 */

import {
  copyChannels,
  resampleChannel,
  type Channels,
  type ProgressFn,
} from "./dsp";

const FRAME = 1024; // analysis/synthesis frame (~23 ms @ 44.1k)
const HOP_S = 512; // synthesis hop (50% overlap)
const SEARCH = 384; // WSOLA search radius in samples

/**
 * Stretch audio by `stretch` (output_duration = input_duration * stretch).
 * stretch > 1 → longer/slower, stretch < 1 → shorter/faster. Pitch unchanged.
 *
 * Channel 0 is processed first; the alignment offsets chosen for it are
 * reused for every other channel so the stereo image stays coherent.
 */
export async function timeStretchChannels(
  chs: Channels,
  fs: number,
  stretch: number,
  onProgress?: ProgressFn
): Promise<Channels> {
  if (Math.abs(stretch - 1) < 0.001 || chs[0].length < FRAME * 3) {
    return copyChannels(chs);
  }
  const nCh = chs.length;
  const N = chs[0].length;
  const outLen = Math.max(FRAME, Math.round(N * stretch));
  const Ha = Math.max(1, Math.round(HOP_S / stretch));
  const ref = chs[0];

  // ---------- pass 1: build channel 0 output, record segment offsets ----------
  const dst0 = new Float32Array(outLen);
  const wsum0 = new Float32Array(outLen);
  const segments: { a: number; p: number }[] = [];

  const addSegment = (a: number, p: number) => {
    segments.push({ a, p });
    for (let i = 0; i < FRAME && p + i < outLen; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / HOP_S);
      dst0[p + i] += ref[a + i] * w;
      wsum0[p + i] += w;
    }
  };

  addSegment(0, 0);
  let p = HOP_S;
  let aExp = Ha;

  while (p + FRAME <= outLen && aExp + FRAME + SEARCH < N) {
    const base = Math.max(0, Math.min(N - FRAME - 1, aExp));
    const lo = Math.max(0, base - SEARCH);
    const hi = Math.min(N - FRAME - 1, base + SEARCH);

    // WSOLA search: maximize correlation between the candidate frame start
    // and the material already written at the synthesis overlap position
    let bestOff = base;
    let bestScore = -Infinity;
    for (let off = lo; off <= hi; off += 3) {
      let corr = 0;
      let energy = 1e-9;
      for (let i = 0; i < HOP_S; i += 4) {
        const v = ref[off + i];
        corr += v * dst0[p + i];
        energy += v * v;
      }
      const score = corr / Math.sqrt(energy);
      if (score > bestScore) {
        bestScore = score;
        bestOff = off;
      }
    }
    addSegment(bestOff, p);
    p += HOP_S;
    aExp += Ha;
    if (onProgress && (segments.length & 0x1f) === 0) {
      await onProgress(Math.min(0.9, p / outLen), "Stretching");
    }
  }

  const normalize = (dst: Float32Array, wsum: Float32Array) => {
    for (let i = 0; i < outLen; i++) {
      dst[i] = wsum[i] > 0.001 ? dst[i] / wsum[i] : dst[i];
    }
  };
  normalize(dst0, wsum0);

  // ---------- pass 2: apply the same segments to remaining channels ----------
  const out: Channels = [dst0];
  for (let c = 1; c < nCh; c++) {
    const src = chs[c];
    const dst = new Float32Array(outLen);
    const wsum = new Float32Array(outLen);
    for (const seg of segments) {
      for (let i = 0; i < FRAME && seg.p + i < outLen; i++) {
        const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / HOP_S);
        dst[seg.p + i] += src[seg.a + i] * w;
        wsum[seg.p + i] += w;
      }
    }
    normalize(dst, wsum);
    out.push(dst);
    if (onProgress) await onProgress(0.9 + (0.1 * c) / nCh, "Stretching");
  }
  return out;
}

export interface SpeedPitchOptions {
  /** tempo multiplier. 1.25 = 25% faster. Final duration = input/speed */
  speed: number;
  /** pitch shift in semitones (only used when preservePitch = true) */
  semitones: number;
  /** true = pitch preserved while speed changes; false = vinyl style */
  preservePitch: boolean;
}

/**
 * Independent speed & pitch control.
 * preservePitch=true: resample for pitch, then WSOLA to fix the duration.
 * preservePitch=false: pure resample (pitch follows speed, vinyl style).
 */
export async function speedAndPitchChannels(
  chs: Channels,
  fs: number,
  opts: SpeedPitchOptions,
  onProgress?: ProgressFn
): Promise<Channels> {
  const speed = Math.min(4, Math.max(0.25, opts.speed));
  if (opts.preservePitch) {
    const r = Math.pow(2, opts.semitones / 12);
    // 1) resample for pitch
    let out: Channels = [];
    for (let c = 0; c < chs.length; c++) {
      out.push(resampleChannel(chs[c], r));
      if (onProgress) await onProgress(((c + 1) / chs.length) * 0.4, "Pitch shift");
    }
    // 2) WSOLA stretch to reach the target duration
    const stretch = r / speed;
    out = await timeStretchChannels(out, fs, stretch, async (f, s) => {
      if (onProgress) await onProgress(0.4 + f * 0.6, s);
    });
    return out;
  }
  // vinyl mode — single resample
  const out: Channels = [];
  for (let c = 0; c < chs.length; c++) {
    out.push(resampleChannel(chs[c], speed));
    if (onProgress) await onProgress((c + 1) / chs.length, "Processing");
  }
  return out;
}
