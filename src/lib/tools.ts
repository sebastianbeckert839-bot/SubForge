/**
 * Central tool registry — pure data only (no React imports) so it can be
 * used from both server (API route validation) and client code.
 * Icons are referenced by name and mapped to components in tool-ui.tsx.
 */

export type ToolCategory =
  | "bass"
  | "tone"
  | "time"
  | "fx"
  | "vocals"
  | "editing"
  | "analysis"
  | "visual";

export interface ToolMeta {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: ToolCategory;
  icon: string;
  /** short lowercase suffix used in downloaded file names */
  suffix: string;
}

export const CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: "bass", label: "Bass Tools" },
  { id: "tone", label: "Volume & Tone" },
  { id: "time", label: "Time & Pitch" },
  { id: "fx", label: "Effects" },
  { id: "vocals", label: "Vocals" },
  { id: "editing", label: "Editing" },
  { id: "analysis", label: "Analysis" },
  { id: "visual", label: "Visuals" },
];

export const TOOLS: ToolMeta[] = [
  {
    id: "rebasser",
    name: "Rebasser",
    tagline: "Rebuild your bass in any frequency band",
    description:
      "Remove the original low end and synthesize a brand-new sub-bass line inside any custom band you pick — 29–34 Hz, 45–60 Hz, anything. The sub follows your track's own bassline.",
    category: "bass",
    icon: "AudioWaveform",
    suffix: "rebass",
  },
  {
    id: "bass-booster",
    name: "Bass Booster",
    tagline: "Up to +15 dB, smooth and distortion-free",
    description:
      "Boost bass up to +15 dB with a transparent look-ahead limiter that keeps the low end smooth and clean at any setting.",
    category: "bass",
    icon: "Speaker",
    suffix: "bass-boost",
  },
  {
    id: "bass-cutter",
    name: "Bass Cutter",
    tagline: "Surgically remove rumble and mud",
    description:
      "High-pass filter with steep studio-grade slopes. Cut everything below any frequency from 20 Hz to 400 Hz.",
    category: "bass",
    icon: "Scissors",
    suffix: "bass-cut",
  },
  {
    id: "volume-booster",
    name: "Volume Booster",
    tagline: "Louder, with true-peak protection",
    description:
      "Raise the overall level up to +24 dB. A look-ahead limiter guarantees the output never clips or distorts.",
    category: "tone",
    icon: "Volume2",
    suffix: "volume",
  },
  {
    id: "normalizer",
    name: "Normalizer",
    tagline: "Consistent loudness across tracks",
    description:
      "Normalize by peak or by perceived loudness (RMS) to a target level, with automatic peak protection.",
    category: "tone",
    icon: "Gauge",
    suffix: "normalized",
  },
  {
    id: "equalizer",
    name: "Equalizer",
    tagline: "5-band EQ with live curve",
    description:
      "Shape your track with a 5-band parametric EQ and watch the frequency response curve update in real time.",
    category: "tone",
    icon: "SlidersHorizontal",
    suffix: "eq",
  },
  {
    id: "treble-cutter",
    name: "Treble Cutter",
    tagline: "Tame harsh highs",
    description:
      "Smooth low-pass filter from 500 Hz to 18 kHz with selectable slope. Perfect for lo-fi or dark edits.",
    category: "tone",
    icon: "Filter",
    suffix: "treble-cut",
  },
  {
    id: "speed-pitch",
    name: "Speed & Pitch",
    tagline: "Tempo and pitch, independently",
    description:
      "Change speed from 0.5x to 2x with optional pitch preservation, plus independent pitch shift of ±12 semitones.",
    category: "time",
    icon: "Timer",
    suffix: "speed-pitch",
  },
  {
    id: "nightcore",
    name: "Nightcore Maker",
    tagline: "The classic, one slider",
    description:
      "Speed and pitch up together, vinyl style. One intensity slider from subtle to full nightcore.",
    category: "time",
    icon: "Zap",
    suffix: "nightcore",
  },
  {
    id: "slowed",
    name: "Slowed + Reverb",
    tagline: "The slowed-and-reverb classic",
    description:
      "Slow your track down and drench it in hall reverb. The signature sound of a million edits.",
    category: "time",
    icon: "Waves",
    suffix: "slowed",
  },
  {
    id: "8d-audio",
    name: "8D Audio",
    tagline: "Sound that orbits your head",
    description:
      "Rotate the mix around the listener with equal-power panning and a touch of room reverb. Headphones recommended.",
    category: "fx",
    icon: "Orbit",
    suffix: "8d",
  },
  {
    id: "reverb",
    name: "Reverb & Echo",
    tagline: "Rooms, halls and echoes",
    description:
      "Convolution reverb with selectable room or hall character, adjustable decay and damping, plus a classic echo mode.",
    category: "fx",
    icon: "Sparkles",
    suffix: "reverb",
  },
  {
    id: "reverse",
    name: "Reverse Audio",
    tagline: "Play it backwards",
    description:
      "Flip the entire track end-to-end. Instant hidden-message energy.",
    category: "fx",
    icon: "ArrowLeftRight",
    suffix: "reversed",
  },
  {
    id: "stereo-widener",
    name: "Stereo Widener",
    tagline: "From mono-tight to wider than the speakers",
    description:
      "Mid/side stereo width control from 0% (mono) to 200% (extra wide), plus a Haas delay option that nudges one side a few milliseconds for instant headphone-filling space.",
    category: "fx",
    icon: "Expand",
    suffix: "wide",
  },
  {
    id: "tremolo",
    name: "Tremolo",
    tagline: "Volume that pulses in time",
    description:
      "Classic amplitude modulation with sine, triangle or square LFO shapes, adjustable rate and depth, and a stereo phase offset for an auto-pan feel.",
    category: "fx",
    icon: "AudioLines",
    suffix: "tremolo",
  },
  {
    id: "vocal-remover",
    name: "Vocal Remover",
    tagline: "Instant karaoke from any song",
    description:
      "Cancels centered vocals while keeping the low end intact. Works on stereo tracks.",
    category: "vocals",
    icon: "MicOff",
    suffix: "karaoke",
  },
  {
    id: "acapella",
    name: "Acapella Extractor",
    tagline: "Isolate the vocals",
    description:
      "Extract centered vocal content from a stereo mix by isolating the mid signal with band filtering.",
    category: "vocals",
    icon: "Mic",
    suffix: "acapella",
  },
  {
    id: "trim",
    name: "Trim & Fade",
    tagline: "Visual cut with fades",
    description:
      "Select any region on the waveform, trim with sample accuracy and add smooth fade in/out.",
    category: "editing",
    icon: "Crop",
    suffix: "trimmed",
  },
  {
    id: "silence-remover",
    name: "Silence Remover",
    tagline: "Auto-cut the dead air",
    description:
      "Detects silent passages automatically and removes them with seamless crossfades. Great for podcasts and recordings.",
    category: "editing",
    icon: "Eraser",
    suffix: "no-silence",
  },
  {
    id: "channel-converter",
    name: "Channel Converter",
    tagline: "Mono, stereo, and more",
    description:
      "Convert between mono and stereo, extract a single channel, or swap left and right.",
    category: "editing",
    icon: "Layers",
    suffix: "converted",
  },
  {
    id: "spectrum-analyzer",
    name: "Spectrum Analyzer",
    tagline: "See inside your track",
    description:
      "Full frequency analysis with band energy readouts and bass detection. Pick the perfect rebass range before you forge.",
    category: "analysis",
    icon: "Activity",
    suffix: "spectrum",
  },
  {
    id: "frequency-generator",
    name: "Frequency Generator",
    tagline: "Test tones & sweeps from 20 Hz to 20 kHz",
    description:
      "Generate pure sine, square, triangle or sawtooth tones at any frequency, or sweep across the whole spectrum. Perfect for testing speakers and subs, finding rattles and resonances, or picking your rebass band.",
    category: "analysis",
    icon: "WaveSquare",
    suffix: "tone",
  },
  {
    id: "visualizer",
    name: "Video Visualizer",
    tagline: "Turn any track into a 1080p60 video",
    description:
      "Render your music as bars, waves or a radial ring — fully customizable colors, bar counts, glow, titles and more — then export a 1080p 60fps video in 16:9 for YouTube, 9:16 for TikTok, square or 4:5. What you see in the live preview is exactly what gets exported.",
    category: "visual",
    icon: "Clapperboard",
    suffix: "visualizer",
  },
];

export const TOOL_IDS = TOOLS.map((t) => t.id);

export function getTool(id: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function getCategoryLabel(id: ToolCategory): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
