/**
 * Audio engine — decoding, playback context, waveform peaks, formatting
 * and download helpers.
 */

import type { Channels } from "./dsp";

let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    sharedCtx = new Ctor();
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

export interface DecodedAudio {
  channels: Channels;
  fs: number;
  durationSec: number;
}

const ACCEPTED_EXTENSIONS = [
  "mp3", "wav", "flac", "ogg", "oga", "m4a", "aac", "opus", "webm", "mp4", "aif", "aiff", "wma",
];

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getAudioContext();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  const channels: Channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c).slice());
  }
  return {
    channels,
    fs: buffer.sampleRate,
    durationSec: buffer.duration,
  };
}

export function channelsToAudioBuffer(chs: Channels, fs: number): AudioBuffer {
  const ctx = getAudioContext();
  const buf = ctx.createBuffer(chs.length, chs[0].length, fs);
  for (let c = 0; c < chs.length; c++) buf.getChannelData(c).set(chs[c]);
  return buf;
}

/* ------------------------------------------------------------------ */
/* Waveform peaks                                                      */
/* ------------------------------------------------------------------ */

export interface Peaks {
  min: Float32Array;
  max: Float32Array;
}

const peaksCache = new WeakMap<Channels, Peaks>();

export function computePeaks(chs: Channels, buckets = 1600): Peaks {
  const cached = peaksCache.get(chs);
  if (cached) return cached;
  const N = chs[0].length;
  const count = Math.min(buckets, Math.max(16, N));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  const perBucket = N / count;
  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * perBucket);
    const end = Math.min(N, Math.floor((b + 1) * perBucket));
    let lo = 0;
    let hi = 0;
    for (let c = 0; c < chs.length; c++) {
      const ch = chs[c];
      for (let i = start; i < end; i++) {
        const v = ch[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
  }
  const peaks = { min, max };
  peaksCache.set(chs, peaks);
  return peaks;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1).replace(/\.0$/, "")} kHz`;
  return `${Math.round(hz)} Hz`;
}

export function formatDb(db: number): string {
  const sign = db > 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

export function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${n}`;
}

export function sanitizeBaseName(name: string): string {
  return (
    name
      .replace(/\.[^./\\]+$/, "")
      .replace(/[^\w\-. ]+/g, "")
      .trim()
      .slice(0, 60) || "track"
  );
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
