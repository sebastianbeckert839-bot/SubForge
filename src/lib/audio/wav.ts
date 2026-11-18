/**
 * WAV encoder — 16/24-bit PCM and 32-bit float, inline (no workers needed).
 */

import type { Channels } from "./dsp";

export type WavBitDepth = 16 | 24 | 32;

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

export function encodeWav(
  chs: Channels,
  fs: number,
  bitDepth: WavBitDepth = 16
): Blob {
  const nCh = chs.length;
  const N = chs[0].length;
  const float = bitDepth === 32;
  const bytesPerSample = bitDepth / 8;
  const dataSize = N * nCh * bytesPerSample;
  // float WAV: fmt(16) + fact(12) + data header(8) = 56; PCM: 44
  const headerSize = float ? 56 : 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, headerSize + dataSize - 8, true); // bytes after "WAVE"
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, float ? 3 : 1, true); // 3 = IEEE float, 1 = PCM
  view.setUint16(22, nCh, true);
  view.setUint32(24, fs, true);
  view.setUint32(28, fs * nCh * bytesPerSample, true); // byte rate
  view.setUint16(32, nCh * bytesPerSample, true); // block align
  view.setUint16(34, bitDepth, true);

  let offset: number;
  if (float) {
    // fact chunk is required for non-PCM formats
    writeString(view, 36, "fact");
    view.setUint32(40, 4, true);
    view.setUint32(44, N, true); // sample frames
    writeString(view, 48, "data");
    view.setUint32(52, dataSize, true);
    offset = 56;
  } else {
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    offset = 44;
  }
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < nCh; c++) {
      let s = chs[c][i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      if (float) {
        view.setFloat32(offset, s, true);
        offset += 4;
      } else if (bitDepth === 16) {
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      } else {
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      }
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function estimateWavBytes(
  chs: Channels,
  bitDepth: WavBitDepth
): number {
  return (
    (bitDepth === 32 ? 56 : 44) +
    chs[0].length * chs.length * (bitDepth / 8)
  );
}
