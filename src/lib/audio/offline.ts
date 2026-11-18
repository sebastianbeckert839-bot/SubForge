/**
 * Effects rendered with the native Web Audio graph via OfflineAudioContext —
 * convolution reverb (room/hall), feedback echo, and 8D rotation.
 * Native rendering keeps these fast even for long files.
 */

import type { Channels, ProgressFn } from "./dsp";

function channelsToBuffer(ctx: BaseAudioContext, chs: Channels, fs: number): AudioBuffer {
  const buf = ctx.createBuffer(chs.length, chs[0].length, fs);
  for (let c = 0; c < chs.length; c++) buf.getChannelData(c).set(chs[c]);
  return buf;
}

function bufferToChannels(buf: AudioBuffer): Channels {
  const out: Channels = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.push(buf.getChannelData(c).slice());
  }
  return out;
}

export interface ReverbOptions {
  mode: "room" | "hall" | "echo";
  /** decay in seconds (room/hall) */
  decaySec: number;
  /** 0..1 — high-frequency damping (higher = darker tail) */
  damping: number;
  /** 0..1 wet/dry mix (equal-power) */
  mix: number;
  /** echo mode: delay between repeats in seconds */
  echoDelaySec?: number;
  /** echo mode: 0..0.9 feedback amount */
  echoFeedback?: number;
}

/** generate a decaying-noise impulse response with one-pole damping */
function makeIR(
  ctx: OfflineAudioContext,
  fs: number,
  decaySec: number,
  damping: number,
  predelaySec: number
): AudioBuffer {
  const predelay = Math.round(predelaySec * fs);
  const len = Math.max(fs / 20, Math.round(decaySec * fs)) + predelay;
  const ir = ctx.createBuffer(2, len, fs);
  const cutoff = 15000 * Math.pow(0.13, damping); // 15 kHz → ~2 kHz
  const lpCoef = Math.exp((-2 * Math.PI * cutoff) / fs);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    let lpState = 0;
    for (let i = 0; i < len; i++) {
      const t = (i - predelay) / fs;
      if (t < 0) {
        data[i] = 0;
        continue;
      }
      const noise = Math.random() * 2 - 1;
      lpState = lpState * lpCoef + noise * (1 - lpCoef);
      data[i] = lpState * Math.exp((-3.2 * t) / decaySec);
    }
  }
  return ir;
}

export async function renderReverb(
  chs: Channels,
  fs: number,
  opts: ReverbOptions,
  onProgress?: ProgressFn
): Promise<Channels> {
  const N = chs[0].length;
  // ensure stereo output
  const input =
    chs.length === 1 ? [chs[0], chs[0].slice()] : chs.slice(0, 2);

  let total: number;
  let ctx: OfflineAudioContext;
  const src = () => {
    const s = ctx.createBufferSource();
    s.buffer = channelsToBuffer(ctx, input, fs);
    return s;
  };

  if (opts.mode === "echo") {
    const delaySec = Math.min(2, Math.max(0.02, opts.echoDelaySec ?? 0.25));
    const fb = Math.min(0.9, Math.max(0, opts.echoFeedback ?? 0.45));
    const repeats = Math.max(1, Math.ceil(Math.log(0.001) / Math.log(Math.max(fb, 0.05))));
    total = Math.ceil(N + delaySec * repeats * fs + 0.1 * fs);
    ctx = new OfflineAudioContext(2, total, fs);
    const source = src();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delay = ctx.createDelay(2.5);
    delay.delayTime.value = delaySec;
    const fbGain = ctx.createGain();
    fbGain.gain.value = fb;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 4500;
    source.connect(dry).connect(ctx.destination);
    source.connect(delay);
    delay.connect(wet).connect(ctx.destination);
    delay.connect(fbGain).connect(damp).connect(delay);
    dry.gain.value = Math.cos((opts.mix * Math.PI) / 2);
    wet.gain.value = Math.sin((opts.mix * Math.PI) / 2) * 1.1;
    source.start(0);
  } else {
    const decay = Math.min(8, Math.max(0.15, opts.decaySec));
    const predelay = opts.mode === "hall" ? 0.022 : 0.008;
    total = Math.ceil(N + decay * fs + 0.1 * fs);
    ctx = new OfflineAudioContext(2, total, fs);
    const source = src();
    const conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, fs, decay, opts.damping, predelay);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    source.connect(dry).connect(ctx.destination);
    source.connect(conv).connect(wet).connect(ctx.destination);
    dry.gain.value = Math.cos((opts.mix * Math.PI) / 2);
    wet.gain.value = Math.sin((opts.mix * Math.PI) / 2);
    source.start(0);
  }

  if (onProgress) await onProgress(0.4, "Rendering reverb");
  const rendered = await ctx.startRendering();
  if (onProgress) await onProgress(1);
  return bufferToChannels(rendered);
}

export interface EightDOptions {
  /** seconds for a full rotation around the head */
  periodSec: number;
  /** 0..1 — how wide the rotation swings */
  width: number;
  /** 0..1 — amount of room reverb blended in */
  roomMix: number;
}

export async function render8d(
  chs: Channels,
  fs: number,
  opts: EightDOptions,
  onProgress?: ProgressFn
): Promise<Channels> {
  const N = chs[0].length;
  const total = Math.ceil(N + 0.05 * fs);
  const ctx = new OfflineAudioContext(2, total, fs);

  const source = ctx.createBufferSource();
  source.buffer = channelsToBuffer(ctx, chs, fs);
  // collapse to mono first so the rotation is clean and constant-power
  source.channelCount = 1;
  source.channelCountMode = "explicit";
  source.channelInterpretation = "speakers";

  const panner = ctx.createStereoPanner();
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 1 / Math.max(1, opts.periodSec);
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = Math.min(1, Math.max(0, opts.width));
  lfo.connect(lfoGain).connect(panner.pan);

  const dry = ctx.createGain();
  dry.gain.value = 1 - opts.roomMix * 0.4;
  source.connect(panner).connect(dry).connect(ctx.destination);

  if (opts.roomMix > 0.01) {
    const conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, fs, 0.9, 0.55, 0.012);
    const wet = ctx.createGain();
    wet.gain.value = opts.roomMix * 0.7;
    source.connect(conv).connect(wet).connect(ctx.destination);
  }

  lfo.start(0);
  source.start(0);
  if (onProgress) await onProgress(0.4, "Rendering 8D");
  const rendered = await ctx.startRendering();
  if (onProgress) await onProgress(1);
  return bufferToChannels(rendered);
}
