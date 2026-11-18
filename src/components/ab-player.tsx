"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTheme } from "next-themes";
import { Play, Pause, Repeat, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channels } from "@/lib/audio/dsp";
import {
  channelsToAudioBuffer,
  computePeaks,
  formatTime,
  getAudioContext,
} from "@/lib/audio/engine";

export interface Selection {
  start: number;
  end: number;
}

interface ABPlayerProps {
  original: Channels;
  processed?: Channels | null;
  fs: number;
  height?: number;
  labelA?: string;
  labelB?: string;
  /** enable visual region selection (used by the Trim tool) */
  selection?: Selection | null;
  onSelectionChange?: (sel: Selection | null) => void;
  hint?: string;
}

const bufferCache = new WeakMap<Channels, AudioBuffer>();

function getBufferFor(chs: Channels, fs: number): AudioBuffer {
  let buf = bufferCache.get(chs);
  if (!buf || buf.sampleRate !== fs || buf.length !== chs[0].length) {
    buf = channelsToAudioBuffer(chs, fs);
    bufferCache.set(chs, buf);
  }
  return buf;
}

export function ABPlayer({
  original,
  processed = null,
  fs,
  height = 120,
  labelA = "Original",
  labelB = "Processed",
  selection = null,
  onSelectionChange,
  hint,
}: ABPlayerProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const [userMode, setUserMode] = useState<"a" | "b" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const loopRef = useRef(false);
  const modeRef = useRef<"a" | "b">("a");
  const dragRef = useRef<{
    startX: number;
    startTime: number;
    kind: "new" | "start" | "end";
    moved: boolean;
  } | null>(null);

  // derived: show the processed waveform as soon as one exists, until the
  // user explicitly picks a side — no effect needed
  const mode: "a" | "b" = userMode ?? (processed ? "b" : "a");

  const activeCh = mode === "b" && processed ? processed : original;
  const duration = useMemo(
    () => activeCh[0].length / fs,
    [activeCh, fs]
  );
  // selection mode (Trim tool): the canvas always shows the ORIGINAL
  // timeline, so selection coordinates stay stable even while previewing
  // the shorter processed result
  const selMode = !!onSelectionChange;
  const originalDuration = useMemo(
    () => original[0].length / fs,
    [original, fs]
  );
  const timelineDuration = selMode ? originalDuration : duration;
  const peaksA = useMemo(() => computePeaks(original), [original]);
  const peaksB = useMemo(
    () => (processed ? computePeaks(processed) : null),
    [processed]
  );

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const getPos = useCallback((): number => {
    if (!srcRef.current) return Math.min(offsetRef.current, duration);
    const ctx = getAudioContext();
    const t = ctx.currentTime - startedAtRef.current;
    return loopRef.current
      ? ((t % duration) + duration) % duration
      : Math.min(Math.max(t, 0), duration);
  }, [duration]);

  /* ---------------- drawing ---------------- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrap.clientWidth;
    const h = height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);

    // background
    ctx2d.fillStyle = dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)";
    ctx2d.fillRect(0, 0, w, h);

    const mid = h / 2;
    const peaks =
      selMode || modeRef.current !== "b" || !peaksB ? peaksA : peaksB;
    const count = peaks.min.length;

    // center line
    ctx2d.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, mid);
    ctx2d.lineTo(w, mid);
    ctx2d.stroke();

    // waveform bars
    const isB = modeRef.current === "b";
    const fill = isB
      ? dark
        ? "#f97316"
        : "#ea580c"
      : dark
        ? "#71717a"
        : "#a1a1aa";
    ctx2d.fillStyle = fill;
    for (let x = 0; x < w; x++) {
      const b0 = Math.floor((x / w) * count);
      const b1 = Math.max(b0 + 1, Math.floor(((x + 1) / w) * count));
      let lo = 0;
      let hi = 0;
      for (let b = b0; b < b1 && b < count; b++) {
        if (peaks.min[b] < lo) lo = peaks.min[b];
        if (peaks.max[b] > hi) hi = peaks.max[b];
      }
      const y0 = mid - hi * (mid - 4);
      const y1 = mid - lo * (mid - 4);
      ctx2d.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }

    // selection overlay
    if (selection && selection.end > selection.start && timelineDuration > 0) {
      const x0 = (selection.start / timelineDuration) * w;
      const x1 = (selection.end / timelineDuration) * w;
      ctx2d.fillStyle = "rgba(249,115,22,0.16)";
      ctx2d.fillRect(x0, 0, x1 - x0, h);
      ctx2d.fillStyle = "#f97316";
      ctx2d.fillRect(x0 - 1, 0, 2.5, h);
      ctx2d.fillRect(x1 - 1.5, 0, 2.5, h);
      // time labels
      ctx2d.font = "10px ui-monospace, monospace";
      ctx2d.fillStyle = dark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";
      const t0 = formatTime(selection.start);
      const t1 = formatTime(selection.end);
      ctx2d.textBaseline = "top";
      const l0 = Math.min(Math.max(x0 + 3, 3), w - 30);
      const l1 = Math.min(Math.max(x1 - 28, 3), w - 30);
      ctx2d.fillText(t0, l0, 4);
      ctx2d.fillText(t1, l1, 4);
    }

    // playhead — in selection mode, map the playing position onto the
    // original timeline (the processed side spans the selected region)
    const pos = getPos();
    let tlPos = pos;
    if (
      selMode &&
      modeRef.current === "b" &&
      selection &&
      selection.end > selection.start
    ) {
      tlPos =
        selection.start +
        (pos / Math.max(duration, 1e-6)) * (selection.end - selection.start);
    }
    const px = timelineDuration > 0 ? (tlPos / timelineDuration) * w : 0;
    ctx2d.fillStyle = dark ? "#ffffff" : "#18181b";
    ctx2d.shadowColor = dark ? "rgba(255,255,255,0.6)" : "transparent";
    ctx2d.shadowBlur = dark ? 6 : 0;
    ctx2d.fillRect(px - 1, 0, 2, h);
    ctx2d.shadowBlur = 0;

    if (timeRef.current) {
      timeRef.current.textContent = `${formatTime(pos)} / ${formatTime(duration)}`;
    }
  }, [dark, duration, getPos, height, peaksA, peaksB, selection, selMode, timelineDuration]);

  /* ---------------- playback ---------------- */
  const stopSource = useCallback(() => {
    if (srcRef.current) {
      try {
        srcRef.current.onended = null;
        srcRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current.disconnect();
      srcRef.current = null;
    }
  }, []);

  const beginSource = useCallback(
    (offset: number) => {
      const ctx = getAudioContext();
      stopSource();
      const buf = getBufferFor(activeCh, fs);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loopRef.current;
      src.connect(ctx.destination);
      const off = Math.min(Math.max(offset, 0), Math.max(0, duration - 0.005));
      src.start(0, off);
      startedAtRef.current = ctx.currentTime - off;
      offsetRef.current = off;
      srcRef.current = src;
      src.onended = () => {
        if (srcRef.current === src && !loopRef.current) {
          setPlaying(false);
          offsetRef.current = 0;
          stopSource();
          draw();
        }
      };
    },
    [activeCh, duration, draw, fs, stopSource]
  );

  const startAt = useCallback(
    (offset: number) => {
      beginSource(offset);
      setPlaying(true);
    },
    [beginSource]
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      offsetRef.current = getPos();
      stopSource();
      setPlaying(false);
      draw();
    } else {
      startAt(offsetRef.current >= duration - 0.01 ? 0 : offsetRef.current);
    }
  }, [draw, duration, getPos, playing, startAt, stopSource]);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.min(Math.max(t, 0), duration);
      offsetRef.current = clamped;
      if (playing) startAt(clamped);
      else draw();
    },
    [draw, duration, playing, startAt]
  );

  // restart playback when the processed result is replaced while listening
  const prevProcessedRef = useRef<Channels | null>(null);
  useEffect(() => {
    if (
      processed &&
      prevProcessedRef.current &&
      processed !== prevProcessedRef.current &&
      playing &&
      mode === "b"
    ) {
      const ratio = duration > 0 ? getPos() / duration : 0;
      beginSource(ratio * (processed[0].length / fs));
    }
    prevProcessedRef.current = processed ?? null;
  }, [processed]);

  // rAF loop while playing
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, draw]);

  // redraw on state changes + resize
  useEffect(() => {
    draw();
  }, [draw, mode, selection]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // update modeRef + hot-swap the playing source when the view changes
  useEffect(() => {
    modeRef.current = mode;
    if (playing) beginSource(getPos());
  }, [mode]);

  // stop audio on unmount
  useEffect(() => stopSource, [stopSource]);

  /* ---------------- pointer interactions ---------------- */
  const timeFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.min(
      Math.max((x / rect.width) * timelineDuration, 0),
      timelineDuration
    );
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (timelineDuration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = timeFromEvent(e);
    let kind: "new" | "start" | "end" = "new";
    if (onSelectionChange && selection) {
      const pxPerSec = rect.width / timelineDuration;
      const startPx = selection.start * pxPerSec;
      const endPx = selection.end * pxPerSec;
      if (Math.abs(x - startPx) < 10) kind = "start";
      else if (Math.abs(x - endPx) < 10) kind = "end";
    }
    dragRef.current = { startX: x, startTime: t, kind, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // cursor feedback
    if (!dragRef.current && onSelectionChange && selection) {
      const pxPerSec = rect.width / timelineDuration;
      const startPx = selection.start * pxPerSec;
      const endPx = selection.end * pxPerSec;
      const nearEdge = Math.abs(x - startPx) < 10 || Math.abs(x - endPx) < 10;
      e.currentTarget.style.cursor = nearEdge ? "ew-resize" : "crosshair";
    } else if (!dragRef.current) {
      e.currentTarget.style.cursor = "pointer";
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(x - drag.startX) > 4) drag.moved = true;
    const t = timeFromEvent(e);
    if (!onSelectionChange || !selection) return;
    if (drag.kind === "new") {
      onSelectionChange({
        start: Math.min(drag.startTime, t),
        end: Math.max(drag.startTime, t),
      });
    } else if (drag.kind === "start") {
      onSelectionChange({
        start: Math.min(t, selection.end - 0.05),
        end: selection.end,
      });
    } else {
      onSelectionChange({
        start: selection.start,
        end: Math.max(t, selection.start + 0.05),
      });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      // simple click → seek (convert timeline time to the active side)
      let t = timeFromEvent(e);
      if (
        selMode &&
        mode === "b" &&
        selection &&
        selection.end > selection.start
      ) {
        const span = selection.end - selection.start;
        t = ((t - selection.start) / span) * duration;
      }
      seek(t);
    }
  };

  const hasProcessed = !!processed;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="bg-orange-600 flex size-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          {playing ? (
            <Pause className="size-5" />
          ) : (
            <Play className="ml-0.5 size-5" />
          )}
        </button>
        <span
          ref={timeRef}
          className="font-mono text-sm tabular-nums text-muted-foreground"
        >
          0:00 / {formatTime(duration)}
        </span>
        <div
          role="tablist"
          aria-label="Preview source"
          className="ml-auto flex rounded-lg border bg-background p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "a"}
            onClick={() => setUserMode("a")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "a"
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <AudioLines className="size-3.5" />
            {labelA}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "b"}
            disabled={!hasProcessed}
            onClick={() => setUserMode("b")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "b"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              !hasProcessed && "cursor-not-allowed opacity-40"
            )}
          >
            <AudioLines className="size-3.5" />
            {labelB}
          </button>
        </div>
        <button
          type="button"
          aria-label="Toggle loop"
          aria-pressed={loop}
          onClick={() => setLoop((l) => !l)}
          className={cn(
            "rounded-lg border p-2 transition-colors",
            loop
              ? "border-primary/50 bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Repeat className="size-4" />
        </button>
      </div>
      <div ref={wrapRef} className="relative">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="Audio timeline — click to seek, space to play or pause"
          className="block w-full touch-none select-none"
          style={{ height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              togglePlay();
            } else if (e.key === "ArrowLeft") {
              seek(getPos() - 5);
            } else if (e.key === "ArrowRight") {
              seek(getPos() + 5);
            }
          }}
        />
      </div>
      {hint ? (
        <p className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
