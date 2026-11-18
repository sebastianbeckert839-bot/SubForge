/**
 * MP3 encoder built on @breezystack/lamejs (pure JS LAME port).
 * Loaded dynamically; if it fails to load, callers fall back to WAV-only.
 */

import type { Channels } from "./dsp";

let lameModule: any = null;
let loadAttempted = false;

async function getLame(): Promise<any> {
  if (lameModule) return lameModule;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    const m = await import("@breezystack/lamejs");
    lameModule = (m as any).default ?? m;
    return lameModule;
  } catch {
    return null;
  }
}

export async function mp3Available(): Promise<boolean> {
  return (await getLame()) != null;
}

const SUPPORTED_RATES = new Set([
  8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000,
]);

function toInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    let s = f[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** downsample helper using linear interpolation for rate conversion */
function resampleLinear(ch: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return ch;
  const ratio = from / to;
  const outLen = Math.floor(ch.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    out[i] = ch[i0] * (1 - frac) + ch[Math.min(ch.length - 1, i0 + 1)] * frac;
  }
  return out;
}

export async function encodeMp3(
  chs: Channels,
  fs: number,
  kbps = 320
): Promise<Blob | null> {
  const lame = await getLame();
  if (!lame) return null;

  // LAME only supports specific sample rates — convert if needed
  let src = chs;
  let rate = fs;
  if (!SUPPORTED_RATES.has(fs)) {
    src = chs.map((c) => resampleLinear(c, fs, 44100));
    rate = 44100;
  }

  const nCh = Math.min(2, src.length);
  const left = toInt16(src[0]);
  const right = nCh > 1 ? toInt16(src[1]) : null;
  const encoder = new lame.Mp3Encoder(nCh, rate, kbps);
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, Math.min(i + blockSize, left.length));
    const r = right ? right.subarray(i, Math.min(i + blockSize, right.length)) : undefined;
    const buf = right ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (buf.length > 0) chunks.push(new Uint8Array(buf));
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(new Uint8Array(end));
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

export function estimateMp3Bytes(chs: Channels, fs: number, kbps: number): number {
  const seconds = chs[0].length / fs;
  return Math.ceil((kbps * 1000 * seconds) / 8);
}
