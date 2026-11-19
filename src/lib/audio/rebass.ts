/**
 * The Rebasser — flagship processor.
 *
 * Pipeline:
 *  1. Analyze the track's bassline (pitch track + envelope, see pitch.ts).
 *     The analysis is cached per file so live-preview re-runs are fast.
 *  2. Transcribe the bassline to semitone notes and shift the WHOLE line
 *     by one global octave so its median centers on the user's target
 *     band. A global shift preserves every interval exactly — the sub
 *     plays the same melody, note for note, just deeper. Two modes:
 *     "calm" follows every note (floor-clamped so nothing sinks below
 *     the band), "extreme" locks onto the bassline's DOMINANT note per
 *     section — a steady in-band sub at full pressure, zero bouncing.
 *     Frame data is applied at the CENTER of each analysis window (see
 *     BassAnalysis.centerOffsetSec) plus a note-confirmation delay
 *     (~1.5 hops): a straddling window can lock onto a new note's attack
 *     up to ~100 ms before the note truly starts, which made the sub
 *     switch pitches before the original bass changed. The delay keeps
 *     the sub on the old note until the new one is actually there.
 *  3. Remove the original low end with a steep high-pass (cached per
 *     cutoff/slope). "Auto" clears the entire detected bassline, not just
 *     the sub band, so the track never plays two bass lines at once.
 *  4. Synthesize the new sub: constant per-note frequency with a short
 *     portamento glide between notes, plus a per-sample attack/release
 *     envelope scaled to the sub period. A line-level anti-collision
 *     guard never leaves the sub's core in unison with original notes
 *     that survive the removal filter — two sines at the same pitch
 *     drift in and out of phase, the classic "two basses wobbling"
 *     artefact. The guard shifts the WHOLE line one octave when needed
 *     (a single consistent move — the old per-note guard made
 *     individual notes leap octaves and the sub audibly bounced).
 *     "Survives" is measured slope-aware: an N dB/oct high-pass leaves
 *     a note below its corner only N·log2(corner/f) dB down, so notes
 *     several semitones below the cutoff still count as audible when
 *     the slope is gentle (or the note is close to the corner).
 *  5. Mix with a sidechain duck — while the sub sounds, the original's
 *     low band dips a few dB so the two layers never fight — then limit
 *     with a slow-release limiter whose release is far longer than a sub
 *     cycle, so it never wobbles the low end.
 */

import {
  copyChannels,
  dbToGain,
  filterChannels,
  gainToDb,
  limitChannels,
  mixdown,
  truePeak,
  type Channels,
  type LimiterStats,
  type ProgressFn,
} from "./dsp";
import { analyzeBass, type BassAnalysis } from "./pitch";

export type RebassWaveform = "sine" | "saturated" | "triangle";
export type RebassFollow = "slow" | "natural" | "fast";
export type RebassMode = "extreme" | "calm";

export interface RebassOptions {
  /** target band, e.g. 29–34 Hz */
  rangeLow: number;
  rangeHigh: number;
  /**
   * High-pass the original below this frequency first (removes the
   * current bass). "auto" resolves inside processRebass to a cutoff that
   * clears the entire detected bassline — at least the top of the target
   * band — so the original line and the new sub never play at once.
   */
  removeBelowHz: number | "auto";
  /** high-pass steepness in dB/oct */
  removeSlope: 12 | 24 | 36 | 48;
  /** sub level relative to the original bass level, dB */
  subLevelDb: number;
  waveform: RebassWaveform;
  follow: RebassFollow;
  /**
   * "extreme": the sub locks onto the bassline's dominant note per
   * section — a steady, saturated sub that stays inside the band and
   * hits at full pressure (the stress-your-speakers rebass).
   * "calm": the sub follows the bassline note for note, gently.
   */
  mode: RebassMode;
}

export interface RebassInfo {
  analysis: BassAnalysis;
  /** resolved removal cutoff in Hz (what "auto" became) */
  cutoffHz: number;
  /** actual sub frequency span produced, Hz; [0, 0] when nothing mapped */
  subRangeHz: [number, number];
  /** share of samples where the sub is audible */
  subActivePct: number;
  /** global octave shift applied to the bassline */
  octaveShift: number;
  /** sub output peak in dBFS */
  subPeakDb: number;
  limiter: LimiterStats;
  /** true when almost no bass was detected */
  lowConfidence: boolean;
  /** number of distinct bass notes mapped into the sub */
  noteCount: number;
}

/** glide / attack / release times per follow mode (seconds) */
const FOLLOW_TIMES: Record<
  RebassFollow,
  { glide: number; atk: number; rel: number }
> = {
  slow: { glide: 0.045, atk: 0.04, rel: 0.28 },
  natural: { glide: 0.025, atk: 0.02, rel: 0.15 },
  fast: { glide: 0.012, atk: 0.01, rel: 0.08 },
};

/** sub output peak ceiling (dBFS) — keeps the limiter out of sub cycles */
const SUB_PEAK_CAP_DB = -3.5;

function synthWaveform(phase: number, kind: RebassWaveform): number {
  switch (kind) {
    case "sine":
      return Math.sin(phase);
    case "saturated": {
      const s = Math.sin(phase);
      const drive = 2.1;
      return Math.tanh(drive * s) / Math.tanh(drive);
    }
    case "triangle":
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
  }
}

/* ------------------------------------------------------------------ */
/* Per-file cache (analysis + high-passed dry signal)                   */
/* ------------------------------------------------------------------ */

interface FileCache {
  analysis: BassAnalysis;
  envMax: number;
  gateDb: number;
  /** gated mean bass RMS (linear) of the original */
  bassRms: number;
  lowConfidence: boolean;
  /** single-slot cache for the high-passed original */
  hpKey: string | null;
  hpChannels: Channels | null;
}

const fileCache = new WeakMap<Channels, FileCache>();

async function getFileCache(
  chs: Channels,
  fs: number,
  onProgress?: ProgressFn
): Promise<FileCache> {
  let c = fileCache.get(chs);
  if (c) return c;

  const analysis = await analyzeBass(chs, fs, async (f, s) => {
    if (onProgress) await onProgress(f * 0.5, s ?? "Analyzing bass");
  });

  const frames = analysis.frames;
  let validFrames = 0;
  for (let i = 0; i < frames; i++) {
    if (analysis.f0[i] > 0 && analysis.conf[i] > 0.22) validFrames++;
  }
  const validRatio = frames > 0 ? validFrames / frames : 0;
  const lowConfidence = validFrames < 24 || validRatio < 0.02;

  let envMax = -Infinity;
  for (let i = 0; i < analysis.envDb.length; i++) {
    if (analysis.envDb[i] > envMax) envMax = analysis.envDb[i];
  }
  if (!isFinite(envMax)) envMax = 0;
  const gateDb = envMax - 32;

  let bassRmsSum = 0;
  let bassRmsCount = 0;
  for (let i = 0; i < frames; i++) {
    if (analysis.envDb[i] > gateDb) {
      bassRmsSum += Math.pow(10, (analysis.envDb[i] - envMax) / 20);
      bassRmsCount++;
    }
  }
  const bassRms = bassRmsCount > 0 ? bassRmsSum / bassRmsCount : 0.4;

  c = {
    analysis,
    envMax,
    gateDb,
    bassRms,
    lowConfidence,
    hpKey: null,
    hpChannels: null,
  };
  fileCache.set(chs, c);
  return c;
}

/* ------------------------------------------------------------------ */
/* Note transcription & octave mapping                                  */
/* ------------------------------------------------------------------ */

/** nearest semitone index (12-TET; anchor is irrelevant, A1 = 55 Hz) */
function snapToNote(f: number): number {
  return Math.round(12 * Math.log2(f / 55));
}

const noteToHz = (n: number) => 55 * Math.pow(2, n / 12);

/** Result of transcribing + mapping the bassline into the sub band. */
export interface BasslineMap {
  /** mapped sub frequency per frame (Hz); 0 where nothing is mapped yet */
  targets: Float32Array;
  /** global octave shift applied to the whole line (−1 … 4) */
  octaveShift: number;
  /** distinct source notes mapped */
  noteCount: number;
  /** span of mapped sub frequencies over confirmed notes (Hz); [0,0] if none */
  subRange: [number, number];
}

/**
 * Deterministic global mapping. The whole bassline is shifted by ONE
 * octave count (kStar) so its median centers on the band — intervals are
 * preserved exactly, so the sub plays the original melody instead of the
 * per-note "closest octave" zigzag (which turned a 2-semitone step into a
 * 10-semitone leap and sounded like a second, unrelated bass line).
 *
 * Line-level anti-collision guard: if the line's median note would land
 * in unison with an original note that survives the removal high-pass,
 * the WHOLE line shifts one more octave down — one consistent move, no
 * per-note leaps. Two sines at the same pitch but different phase drift
 * in and out of phase — the "two bass frequencies modulating each other"
 * wobble. (Octave-related originals collapsing onto the same sub pitch
 * is normal rebass behaviour and does not beat.)
 *
 * Never below the band: every mapped frequency is held at or above
 * rangeLow (calm) or clamped into the band (extreme), so a 29–34 Hz
 * setting never turns into a 20 Hz rumble small speakers can't even
 * reproduce.
 */
export function mapBasslineNotes(
  analysis: BassAnalysis,
  low: number,
  high: number,
  /** resolved removal cutoff in Hz — originals near/above it survive */
  cutoffHz: number,
  /** removal filter steepness in dB/oct — decides how far below the cutoff a note is still audible */
  removeSlopeDb: number,
  /** extreme: dominant-note sub locked inside the band; calm: melodic */
  mode: RebassMode
): BasslineMap {
  const frames = analysis.frames;
  const fc = Math.sqrt(low * high);

  // global octave shift: line median → band center. One up-shift is
  // allowed for lines that already sit below the band.
  const med = analysis.medianF0 > 0 ? analysis.medianF0 : 55;
  let kStar = Math.round(Math.log2(med / fc));
  if (kStar < -1) kStar = -1;
  if (kStar > 4) kStar = 4;

  // sentinel for "no confident bass this frame" — must NOT collide with a
  // real note index: notes below A1 (55 Hz) have negative indices too
  const NO_NOTE = -1000;

  // snap every confident frame to a semitone index. Sticky deadband: once
  // a note is current, a frame only switches to another note when its f0
  // is clearly closer to it (> 0.85 semitone away). This kills the
  // semitone flip-flop on borderline/detuned basslines — and the pitch
  // sag of a decaying note (synth releases and plucked strings drift
  // flat at the tail) no longer flips the sub off its note before the
  // next note actually arrives.
  const noteIdx = new Int32Array(frames).fill(NO_NOTE);
  let curNote = Number.NaN;
  for (let i = 0; i < frames; i++) {
    const f = analysis.f0[i];
    if (f <= 0 || analysis.conf[i] <= 0.22) continue;
    if (Number.isFinite(curNote)) {
      const semi = Math.abs(12 * Math.log2(f / noteToHz(curNote)));
      if (semi < 0.85) {
        noteIdx[i] = curNote;
        continue;
      }
    }
    curNote = snapToNote(f);
    noteIdx[i] = curNote;
  }

  // group consecutive frames into note runs (single-frame gaps tolerated)
  interface Run {
    note: number;
    start: number;
    end: number;
    len: number;
  }
  const runs: Run[] = [];
  let i = 0;
  while (i < frames) {
    if (noteIdx[i] === NO_NOTE) {
      i++;
      continue;
    }
    const note = noteIdx[i];
    let j = i;
    let len = 0;
    while (j < frames) {
      if (noteIdx[j] === note) {
        len++;
        j++;
      } else if (
        noteIdx[j] === NO_NOTE &&
        j + 1 < frames &&
        noteIdx[j + 1] === note
      ) {
        j++; // tolerate a single dropout frame inside the run
      } else {
        break;
      }
    }
    runs.push({ note, start: i, end: j, len });
    i = j;
  }

  // which original notes actually occur, and which of them the removal
  // high-pass leaves audible. Slope-aware threshold: an N dB/oct
  // high-pass leaves a note at f roughly N·log2(cutoff/f) dB down, so a
  // note stays audible (≥ −18 dB, before the sidechain duck takes
  // another 6–12 dB) down to cutoff·2^(−18/N). The old fixed factor
  // (0.945 ≈ one semitone below the corner) ignored the slope: at
  // 48 dB/oct notes 2–4 semitones below the corner still passed at
  // −10…−25 dB, and at 12 dB/oct almost the whole bassline survived.
  // A sub note at (near-)unison with such a residual beats slowly
  // against it — the "two bass frequencies modulating" wobble.
  const AUDIBLE_RESIDUAL_DB = 18;
  const usedNotes = new Set<number>();
  for (const r of runs) if (r.len >= 2) usedNotes.add(r.note);
  const surviveThresh =
    cutoffHz *
    Math.pow(2, -AUDIBLE_RESIDUAL_DB / Math.max(12, removeSlopeDb));
  const surviving = new Set<number>();
  for (const n of usedNotes) {
    if (noteToHz(n) >= surviveThresh) surviving.add(n);
  }

  // Line-level anti-collision guard: if the line's MEDIAN note still
  // lands in unison with a surviving original at this octave shift (a
  // manual cutoff that doesn't clear the line, or a bassline that
  // already sits inside the band), drop the whole line one more octave.
  // One consistent shift for every note — the previous per-note guard
  // moved individual colliding notes up octaves while their neighbours
  // stayed put, and the sub audibly "bounced" up and down through those
  // sections.
  const medNote = snapToNote(med);
  let kLine = kStar;
  while (kLine < 5 && surviving.has(medNote - 12 * kLine)) kLine++;
  kStar = kLine;

  const targets = new Float32Array(frames);
  let minHz = Infinity;
  let maxHz = 0;

  if (mode === "extreme") {
    /* Dominant-note sub: the median of the snapped notes in a ±1 s
     * window per frame, then a debounced switch (the new dominant must
     * hold ~0.4 s before the pitch moves). The sub sits on one steady
     * pitch per section, always inside the band, and pumps with the
     * track's own bass envelope — maximum pressure, and by design it
     * cannot bounce up and down octaves. */
    const W = Math.max(5, Math.round(1.0 / analysis.hopSec));
    const HOLD = Math.max(3, Math.round(0.4 / analysis.hopSec));
    const dom = new Int32Array(frames).fill(NO_NOTE);
    const vals: number[] = [];
    for (let i = 0; i < frames; i++) {
      vals.length = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(frames - 1, i + W); j++) {
        if (noteIdx[j] !== NO_NOTE) vals.push(noteIdx[j]);
      }
      if (vals.length >= 3) {
        vals.sort((a, b) => a - b);
        dom[i] = vals[Math.floor(vals.length / 2)];
      }
    }
    // debounce: hold the current pitch until a different dominant note
    // has persisted for HOLD frames (≈0.4 s)
    let cur = NO_NOTE;
    let cand = NO_NOTE;
    let hold = 0;
    for (let i = 0; i < frames; i++) {
      const d = dom[i];
      if (cur === NO_NOTE && d !== NO_NOTE) {
        cur = d;
      } else if (d !== NO_NOTE && d !== cur) {
        if (d === cand) {
          hold++;
          if (hold >= HOLD) {
            cur = d;
            cand = NO_NOTE;
            hold = 0;
          }
        } else {
          cand = d;
          hold = 1;
        }
      } else if (d === cur) {
        cand = NO_NOTE;
        hold = 0;
      }
      if (cur !== NO_NOTE) {
        const hz = Math.min(high, Math.max(low, noteToHz(cur - 12 * kStar)));
        targets[i] = hz;
        if (hz < minHz) minHz = hz;
        if (hz > maxHz) maxHz = hz;
      }
    }
  } else {
    /* Calm melodic mapping: run-by-run targets like before, but every
     * note is held at or above the band floor. Notes that used to map
     * to 16–25 Hz (inaudible on almost any speaker, and the reason a
     * "29–34 Hz" rebass sounded like 20 Hz or less) now sit AT the
     * floor instead of sinking under it — no octave-fold jumps, just a
     * gentle floor. */
    let lastNote: number | null = null;
    for (const r of runs) {
      const runNote = r.len >= 2 ? r.note : lastNote;
      if (runNote !== null) {
        const hz = Math.max(low, noteToHz(runNote - 12 * kStar));
        for (let f = r.start; f < r.end; f++) targets[f] = hz;
        if (r.len >= 2) {
          lastNote = r.note;
          if (hz < minHz) minHz = hz;
          if (hz > maxHz) maxHz = hz;
        }
      }
    }
  }
  const subRange: [number, number] = maxHz > 0 ? [minHz, maxHz] : [0, 0];

  // fill gaps between runs with the nearest run's frequency so the glide
  // never has to travel from silence
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    if (targets[f] > 0) prev = targets[f];
    else targets[f] = prev;
  }
  // fill any remaining leading gap with the first mapped note
  let next = 0;
  for (let f = frames - 1; f >= 0; f--) {
    if (targets[f] > 0) next = targets[f];
    else if (next > 0) targets[f] = next;
  }

  return {
    targets,
    octaveShift: kStar,
    noteCount: usedNotes.size,
    subRange,
  };
}

/* ------------------------------------------------------------------ */
/* Main processor                                                       */
/* ------------------------------------------------------------------ */

export async function processRebass(
  chs: Channels,
  fs: number,
  opts: RebassOptions,
  onProgress?: ProgressFn
): Promise<{ channels: Channels; info: RebassInfo }> {
  const low = Math.max(16, Math.min(opts.rangeLow, 200));
  const high = Math.max(low + 2, Math.min(opts.rangeHigh, 220));
  const N = chs[0].length;

  /* ---------------- 1. analysis (cached) ---------------- */
  const cache = await getFileCache(chs, fs, onProgress);
  const analysis = cache.analysis;
  const frames = analysis.frames;

  /* ---------------- 2. resolve the removal cutoff ---------------- */
  // "auto" clears the entire detected bassline: p90 of the pitch track
  // plus four semitones of transition-band margin (a 48 dB/oct
  // high-pass leaves a note AT the corner only −12 dB, and the previous
  // two-semitone margin left the top of the bassline just −8…−12 dB
  // down — still loud enough to beat against a sub at the same pitch;
  // +4 semitones pushes the p90 note to ~−27 dB), always at least the
  // top of the target band.
  let cutoffHz: number;
  if (opts.removeBelowHz === "auto") {
    const p90 = analysis.rangeF0[1];
    cutoffHz = Math.min(
      160,
      Math.max(high, p90 > 0 ? p90 * 1.26 : 0, 30)
    );
  } else {
    cutoffHz = Math.max(16, Math.min(opts.removeBelowHz, 250));
  }

  /* ---------------- 3. transcribe to notes ---------------- */
  if (onProgress) await onProgress(0.52, "Mapping bassline");
  const { targets, octaveShift, noteCount, subRange } = mapBasslineNotes(
    analysis,
    low,
    high,
    cutoffHz,
    opts.removeSlope,
    opts.mode
  );

  // per-frame amplitude target (0..1), normalized so p95 of active = 1.
  // The gate uses hysteresis (5 dB) and bridges single-frame pitch
  // dropouts so the sub never stutters when the level or the pitch
  // confidence hovers around the gate boundary.
  const envLin = new Float32Array(frames);
  const envDb = analysis.envDb;
  const nEnv = Math.min(frames, envDb.length);
  let gateOn = false;
  for (let f = 0; f < frames; f++) {
    const envOk =
      f < nEnv && envDb[f] > (gateOn ? cache.gateDb - 5 : cache.gateDb);
    let pitchOk = analysis.f0[f] > 0;
    if (!pitchOk && f > 0 && f + 1 < frames) {
      pitchOk = analysis.f0[f - 1] > 0 && analysis.f0[f + 1] > 0;
    }
    gateOn = envOk && pitchOk;
    envLin[f] =
      gateOn && f < nEnv
        ? Math.min(1, dbToGain(Math.min(0, envDb[f] - cache.envMax)))
        : 0;
  }
  const activeVals: number[] = [];
  for (let f = 0; f < frames; f++) {
    if (envLin[f] > 0.02) activeVals.push(envLin[f]);
  }
  activeVals.sort((a, b) => a - b);
  const p95 =
    activeVals.length > 0
      ? activeVals[Math.floor(activeVals.length * 0.95)]
      : 1;
  const norm = p95 > 0.001 ? 1 / p95 : 1;
  for (let f = 0; f < frames; f++) {
    envLin[f] = Math.min(1.15, envLin[f] * norm);
  }

  /* ---------------- 4. synthesize the sub ---------------- */
  if (onProgress) await onProgress(0.58, "Forging sub-bass");
  const sub = new Float32Array(N);
  // sub presence 0..1 per sample (pre-gain) — drives the sidechain duck
  const envTrack = new Float32Array(N);
  const hopSamples = analysis.hopSec * fs;
  // frame f's estimates describe the CENTER of its analysis window
  // [f·hop, f·hop + 2·centerOffset]. Driving the synth at the window
  // start instead made every note change and envelope movement land
  // roughly half a window (~128 ms) before the actual note.
  const centerSamples = analysis.centerOffsetSec * fs;
  // Note-confirmation delay. Even window-centered, a frame can report a
  // NEW note before its true onset: the 256 ms window straddles the
  // change, and when the old note's tail is quiet the attack transient
  // alone can dominate the autocorrelation — the detected switch then
  // lands up to ~100 ms early and the sub changed pitch before the
  // original bass did. Consuming every frame ~1.5 hops later holds the
  // sub on the old note until the new one is genuinely there (the
  // portamento glide adds its own few ms on top, so the switch lands
  // on the beat, never ahead of it).
  const confirmSamples = Math.min(0.12, analysis.hopSec * 1.5) * fs;

  const times = FOLLOW_TIMES[opts.follow];
  // attack/release never shorter than a fraction of the sub period —
  // faster envelopes amplitude-modulate deep notes and sound shaky
  const periodSec = 1 / Math.max(1, low);
  const atkSec = Math.max(times.atk, periodSec * 0.5);
  const relSec = Math.max(times.rel, periodSec * 2);
  const atkCoef = Math.exp(-1 / (fs * atkSec));
  const relCoef = Math.exp(-1 / (fs * relSec));
  const glideCoef = Math.exp(-1 / (fs * times.glide));

  let logF = Math.log(low);
  let envState = 0;
  let phase = 0;
  let subActive = 0;
  let lastYield = 0;
  // cached while the frequency is steady — avoids two Math calls per sample
  let fCur = low;
  let inc = (2 * Math.PI * fCur) / fs;

  for (let n = 0; n < N; n++) {
    const fpos = Math.max(0, (n - centerSamples - confirmSamples) / hopSamples);
    const i0 = Math.min(frames - 1, Math.floor(fpos));
    const i1 = Math.min(frames - 1, i0 + 1);
    const fr = fpos - i0;

    // glide toward the current note (log-domain portamento). exp() is only
    // needed while the glide is actually converging
    const ta = targets[i0];
    const tb = targets[i1];
    let hz = 0;
    if (ta > 0 && tb > 0) hz = ta + (tb - ta) * fr;
    else if (ta > 0) hz = ta;
    else if (tb > 0) hz = tb;
    if (hz > 0) {
      const delta = (Math.log(hz) - logF) * (1 - glideCoef);
      if (delta !== 0) {
        logF += delta;
        if (Math.abs(delta) > 1e-10) {
          fCur = Math.min(1000, Math.exp(logF));
          inc = (2 * Math.PI * fCur) / fs;
        }
      }
    }

    // smooth per-sample envelope
    const ampT = envLin[i0] + (envLin[i1] - envLin[i0]) * fr;
    envState =
      ampT > envState
        ? atkCoef * envState + (1 - atkCoef) * ampT
        : relCoef * envState + (1 - relCoef) * ampT;

    phase += inc;
    if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;

    sub[n] = synthWaveform(phase, opts.waveform) * envState;
    envTrack[n] = envState;
    if (envState > 0.02) subActive++;

    if (onProgress && (n & 0x1fffff) === 0 && n - lastYield > 900000) {
      lastYield = n;
      await onProgress(0.58 + (n / N) * 0.12, "Forging sub-bass");
    }
  }

  // scale sub level relative to the original bass loudness, with a peak
  // cap that keeps the limiter from riding the sub's own cycles
  let subRms = 0;
  for (let n = 0; n < N; n++) subRms += sub[n] * sub[n];
  subRms = Math.sqrt(subRms / Math.max(1, N));
  const targetRms = cache.bassRms * dbToGain(opts.subLevelDb);
  let subGain = subRms > 1e-6 ? targetRms / subRms : 0;
  const subPeakPre = truePeak([sub]);
  const cap = dbToGain(SUB_PEAK_CAP_DB);
  if (subPeakPre * subGain > cap) subGain = cap / Math.max(subPeakPre, 1e-6);
  for (let n = 0; n < N; n++) sub[n] *= subGain;
  const subPeakDb = gainToDb(truePeak([sub]));

  /* ---------------- 5. remove original bass + mix ---------------- */
  if (onProgress) await onProgress(0.72, "Removing original bass");
  const cascades = Math.max(1, Math.round(opts.removeSlope / 12));
  const hpKey = `${Math.round(cutoffHz * 10)}|${opts.removeSlope}`;
  let dry: Channels;
  if (cache.hpKey === hpKey && cache.hpChannels) {
    dry = cache.hpChannels;
  } else {
    dry = await filterChannels(
      chs,
      fs,
      { type: "highpass", freq: cutoffHz },
      cascades
    );
    cache.hpKey = hpKey;
    cache.hpChannels = dry;
  }
  // Sidechain duck: while the sub sounds, the original's low band dips so
  // the layers never fight (deeper dip when the sub is set louder:
  // subLevelDb −12…+12 → 6…12 dB).
  const duckDbAmt =
    6 + 6 * Math.min(1, Math.max(0, (opts.subLevelDb + 12) / 12));
  const duckDepth = 1 - dbToGain(-duckDbAmt);
  const duckHz = Math.min(
    180,
    Math.max(90, Math.max(low, cutoffHz) * 3)
  );
  // Linkwitz-Riley split (2 cascaded biquads per side = LR4): the low and
  // high paths sum back to an allpass — flat magnitude, no phase-boost
  // artefacts — so the gain applied to the low path is exact at every
  // frequency. (Subtracting a lowpassed copy instead would boost
  // frequencies where the filter's phase lag turns subtraction into
  // addition.)
  const lowPath = await filterChannels(
    dry,
    fs,
    { type: "lowpass", freq: duckHz },
    2
  );
  const highPath = await filterChannels(
    dry,
    fs,
    { type: "highpass", freq: duckHz },
    2
  );

  // highPath is a fresh copy we own — accumulate the ducked low band and
  // the sub straight into it
  const out = highPath;
  for (let c = 0; c < out.length; c++) {
    const ch = out[c];
    const lp = lowPath[c];
    for (let n = 0; n < N; n++) {
      const duck = Math.min(1, envTrack[n]);
      ch[n] += lp[n] * (1 - duckDepth * duck) + sub[n];
    }
  }

  /* ---------------- 5. limiter ---------------- */
  // long release + long lookahead: the gain change per sub cycle stays
  // tiny, so the low end never trembles even when the limiter is working
  if (onProgress) await onProgress(0.85, "Limiting");
  const limiter = await limitChannels(out, fs, {
    ceilingDb: -0.3,
    lookaheadMs: 12,
    releaseMs: 300,
    onProgress: async (f) => {
      if (onProgress) await onProgress(0.85 + f * 0.15, "Limiting");
    },
  });

  /* ---------------- 6. stats ---------------- */
  const info: RebassInfo = {
    analysis,
    cutoffHz,
    subRangeHz: subRange,
    subActivePct: N > 0 ? (subActive / N) * 100 : 0,
    octaveShift,
    subPeakDb,
    limiter,
    lowConfidence: cache.lowConfidence,
    noteCount,
  };
  if (onProgress) await onProgress(1);
  return { channels: out, info };
}

/** helper for tools that just need a mono reference quickly */
export function monoReference(chs: Channels): Float32Array {
  return mixdown(chs);
}

export function rebassDefaults(): RebassOptions {
  return {
    rangeLow: 29,
    rangeHigh: 34,
    removeBelowHz: "auto",
    removeSlope: 48,
    subLevelDb: 6,
    waveform: "saturated",
    follow: "fast",
    mode: "extreme",
  };
}

export { copyChannels };
