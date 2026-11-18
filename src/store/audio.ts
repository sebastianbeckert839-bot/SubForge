"use client";

import { create } from "zustand";
import type { Channels } from "@/lib/audio/dsp";

export interface AudioFileMeta {
  name: string;
  sizeBytes: number;
  durationSec: number;
  channels: number;
  sampleRate: number;
}

interface AudioState {
  /** decoded original audio — the single source of truth shared by every tool */
  channels: Channels | null;
  fs: number;
  meta: AudioFileMeta | null;
  /** file name without extension, used for download naming */
  baseName: string;
  /** optional range suggested by the Spectrum Analyzer for the Rebasser */
  rebassSuggestion: { low: number; high: number } | null;

  setAudio: (
    channels: Channels,
    fs: number,
    meta: AudioFileMeta,
    baseName: string
  ) => void;
  setRebassSuggestion: (s: { low: number; high: number } | null) => void;
  clear: () => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  channels: null,
  fs: 44100,
  meta: null,
  baseName: "track",
  rebassSuggestion: null,

  setAudio: (channels, fs, meta, baseName) =>
    set({ channels, fs, meta, baseName }),
  setRebassSuggestion: (rebassSuggestion) => set({ rebassSuggestion }),
  clear: () => set({ channels: null, meta: null }),
}));
