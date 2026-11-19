"use client";

import { lazy, type ComponentType } from "react";

/**
 * Maps tool ids from the registry to their page components.
 * Every tool is its own page component, code-split via React.lazy.
 */
const loaders: Record<string, Promise<{ default: ComponentType }>> = {
  rebasser: import("@/components/tools/rebasser"),
  "bass-booster": import("@/components/tools/bass-booster"),
  "bass-cutter": import("@/components/tools/bass-cutter"),
  "volume-booster": import("@/components/tools/volume-booster"),
  normalizer: import("@/components/tools/normalizer"),
  equalizer: import("@/components/tools/equalizer"),
  "treble-cutter": import("@/components/tools/treble-cutter"),
  "speed-pitch": import("@/components/tools/speed-pitch"),
  nightcore: import("@/components/tools/nightcore"),
  slowed: import("@/components/tools/slowed"),
  "8d-audio": import("@/components/tools/8d-audio"),
  reverb: import("@/components/tools/reverb"),
  reverse: import("@/components/tools/reverse"),
  "stereo-widener": import("@/components/tools/stereo-widener"),
  tremolo: import("@/components/tools/tremolo"),
  "vocal-remover": import("@/components/tools/vocal-remover"),
  acapella: import("@/components/tools/acapella"),
  trim: import("@/components/tools/trim"),
  "silence-remover": import("@/components/tools/silence-remover"),
  "channel-converter": import("@/components/tools/channel-converter"),
  "spectrum-analyzer": import("@/components/tools/spectrum-analyzer"),
  "frequency-generator": import("@/components/tools/frequency-generator"),
  visualizer: import("@/components/tools/visualizer"),
};

export const TOOL_COMPONENTS: Record<string, ComponentType> = Object.fromEntries(
  Object.entries(loaders).map(([id, loader]) => [id, lazy(() => loader)])
);
