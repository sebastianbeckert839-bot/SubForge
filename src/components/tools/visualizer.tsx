"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Pause, RotateCcw, Clapperboard, Square, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ToolPage,
  ToolGrid,
  ControlsCard,
  SliderRow,
  SelectRow,
  ToggleRow,
  StatRow,
  InfoBanner,
  PresetChips,
} from "@/components/tool-ui";
import { useAudioStore } from "@/store/audio";
import {
  getAudioContext,
  channelsToAudioBuffer,
  formatTime,
  downloadBlob,
} from "@/lib/audio/engine";
import {
  drawFrame,
  videoDims,
  DEFAULT_SETTINGS,
  STYLE_PRESETS,
  type VizSettings,
  type VizPreset,
  type ColorMode,
  type VizFormat,
} from "@/lib/visualizer/render";

/* ------------------------------------------------------------------ */
/* Mime detection                                                      */
/* ------------------------------------------------------------------ */

function pickMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  const cands: [string, string][] = [
    ['video/mp4;codecs="avc1.640028,mp4a.40.2"', "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [m, ext] of cands) {
    if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext };
  }
  return { mime: "", ext: "webm" };
}

/* ------------------------------------------------------------------ */
/* Color input row                                                     */
/* ------------------------------------------------------------------ */

function ColorRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          className="h-8 w-24 rounded-md border bg-transparent px-2 font-mono text-xs"
          aria-label={`${label} hex value`}
        />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 cursor-pointer rounded-md border bg-transparent p-0.5"
          aria-label={`${label} color picker`}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The tool                                                            */
/* ------------------------------------------------------------------ */

interface ExportState {
  running: boolean;
  progress: number;
}

export default function VisualizerTool() {
  const { channels, fs, meta, baseName } = useAudioStore();

  const [settings, setSettings] = useState<VizSettings>(() => ({
    ...DEFAULT_SETTINGS,
    titleText: baseName || "",
  }));
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [exportState, setExportState] = useState<ExportState>({
    running: false,
    progress: 0,
  });
  const [activeStyle, setActiveStyle] = useState<string>("forge");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const peaksRef = useRef<Float32Array>(new Float32Array(0));
  const freqRef = useRef<Uint8Array>(new Uint8Array(0));
  const timeRef = useRef<Uint8Array>(new Uint8Array(0));
  const cancelExportRef = useRef(false);
  const posRef = useRef(0);
  const lastPosUiRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // keep the title in sync when a new file is loaded
  useEffect(() => {
    if (baseName) {
      setSettings((s) => ({ ...s, titleText: baseName }));
    }
  }, [baseName]);

  const dims = useMemo(() => videoDims(settings), [settings]);

  // size the preview canvas whenever the format/resolution changes
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = dims.w;
    c.height = dims.h;
  }, [dims]);

  const duration = meta?.durationSec ?? 0;

  /* --------------------------- playback ---------------------------- */

  const stopSource = useCallback(() => {
    const ctx = getAudioContext();
    if (srcRef.current) {
      try {
        srcRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current.disconnect();
      srcRef.current = null;
    }
    void ctx;
  }, []);

  const play = useCallback(
    (fromOffset?: number) => {
      if (!channels) return;
      const ctx = getAudioContext();
      stopSource();
      const offset = Math.max(
        0,
        Math.min(duration - 0.05, fromOffset ?? offsetRef.current)
      );
      if (duration > 0 && offset >= duration - 0.05) offsetRef.current = 0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = settingsRef.current.smoothing;
      const src = ctx.createBufferSource();
      src.buffer = channelsToAudioBuffer(channels, fs);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeRef.current = new Uint8Array(analyser.fftSize);
      src.onended = () => {
        if (srcRef.current === src) {
          srcRef.current = null;
          setPlaying(false);
          offsetRef.current = 0;
          posRef.current = 0;
          setPosition(0);
        }
      };
      src.start(0, offset);
      srcRef.current = src;
      startAtRef.current = ctx.currentTime;
      offsetRef.current = offset;
      setPlaying(true);
    },
    [channels, fs, duration, stopSource]
  );

  const pause = useCallback(() => {
    const ctx = getAudioContext();
    if (srcRef.current) {
      offsetRef.current += ctx.currentTime - startAtRef.current;
      stopSource();
    }
    setPlaying(false);
  }, [stopSource]);

  // keep analyser smoothing in sync live
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = settings.smoothing;
    }
  }, [settings.smoothing]);

  /* --------------------------- render loop ------------------------- */

  useEffect(() => {
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const c = canvasRef.current;
      const s = settingsRef.current;
      if (!c) return;
      const ctx2d = c.getContext("2d");
      if (!ctx2d) return;
      const dt = lastFrameRef.current ? Math.min(0.1, (ts - lastFrameRef.current) / 1000) : 0.016;
      lastFrameRef.current = ts;

      const analyser = analyserRef.current;
      if (analyser && srcRef.current) {
        analyser.getByteFrequencyData(freqRef.current);
        analyser.getByteTimeDomainData(timeRef.current);
        const actx = getAudioContext();
        posRef.current =
          offsetRef.current + (actx.currentTime - startAtRef.current);
        if (ts - lastPosUiRef.current > 250) {
          lastPosUiRef.current = ts;
          setPosition(posRef.current);
        }
      }

      drawFrame({
        ctx: ctx2d,
        w: c.width,
        h: c.height,
        freq: freqRef.current,
        time: timeRef.current,
        sampleRate: fs,
        settings: s,
        t: ts / 1000,
        progress: duration > 0 ? posRef.current / duration : 0,
        peaks: peaksRef.current,
        dt,
      });
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
     
  }, [fs, duration]);

  // cleanup on unmount / file change
  useEffect(() => {
    return () => {
      stopSource();
    };
  }, [stopSource, channels]);

  useEffect(() => {
    stopSource();
    setPlaying(false);
    offsetRef.current = 0;
    posRef.current = 0;
    setPosition(0);
  }, [channels, stopSource]);

  /* --------------------------- helpers ----------------------------- */

  const set = useCallback(<K extends keyof VizSettings>(key: K, v: VizSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: v }));
  }, []);

  const applyStylePreset = useCallback((id: string) => {
    const p = STYLE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setActiveStyle(id);
    setSettings((s) => ({ ...s, ...p.settings }));
  }, []);

  const togglePlay = () => (playing ? pause() : play());
  const restart = () => {
    offsetRef.current = 0;
    posRef.current = 0;
    play(0);
  };

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = frac * duration;
    if (playing) play(target);
    else {
      offsetRef.current = target;
      posRef.current = target;
      setPosition(target);
    }
  };

  /* --------------------------- export ------------------------------ */

  const exportVideo = useCallback(async () => {
    if (!channels || exportState.running) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      toast.error("Your browser can't record video. Try Chrome or Edge.");
      return;
    }
    const { mime, ext } = pickMime();
    if (!mime) {
      toast.error("No supported video encoder found in this browser.");
      return;
    }

    pause();
    cancelExportRef.current = false;
    setExportState({ running: true, progress: 0 });

    try {
      const s = settingsRef.current;
      const { w, h } = videoDims(s);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c2d = canvas.getContext("2d");
      if (!c2d) throw new Error("Could not create the render canvas");

      const audioCtx = getAudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = s.smoothing;
      const src = audioCtx.createBufferSource();
      src.buffer = channelsToAudioBuffer(channels, fs);
      src.connect(analyser);
      analyser.connect(dest);

      const freq = new Uint8Array(analyser.frequencyBinCount);
      const time = new Uint8Array(analyser.fftSize);
      const peaks = new Float32Array(s.preset === "wave" ? 0 : s.barCount);

      const stream = canvas.captureStream(s.fps);
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: s.bitrateMbps * 1_000_000,
        audioBitsPerSecond: 192_000,
      });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const totalSec =
        s.exportLength === "full"
          ? duration
          : Math.min(duration, s.exportLength as number);

      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      });

      rec.start(500);
      const t0 = audioCtx.currentTime;
      src.start(0, 0, totalSec);

      let lastUi = 0;
      await new Promise<void>((resolve) => {
        const loop = (ts: number) => {
          const elapsed = audioCtx.currentTime - t0;
          analyser.getByteFrequencyData(freq);
          analyser.getByteTimeDomainData(time);
          const dt = 1 / s.fps;
          drawFrame({
            ctx: c2d,
            w,
            h,
            freq,
            time,
            sampleRate: fs,
            settings: settingsRef.current,
            t: ts / 1000,
            progress: totalSec > 0 ? elapsed / totalSec : 0,
            peaks,
            dt,
          });
          if (ts - lastUi > 250) {
            lastUi = ts;
            setExportState({
              running: true,
              progress: Math.min(0.999, elapsed / totalSec),
            });
          }
          if (cancelExportRef.current || elapsed >= totalSec) {
            resolve();
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      rec.stop();
      const blob = await done;
      for (const t of stream.getTracks()) t.stop();
      analyser.disconnect();
      dest.disconnect();

      if (cancelExportRef.current) {
        toast.info("Export cancelled.");
      } else {
        downloadBlob(blob, `${baseName || "track"}-visualizer.${ext}`);
        toast.success(
          `Video exported — ${ext.toUpperCase()}, ${w}×${h} @ ${s.fps}fps, ` +
            `${(blob.size / (1024 * 1024)).toFixed(1)} MB`
        );
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "visualizer" }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Export failed — try a shorter clip or 720p."
      );
    } finally {
      setExportState({ running: false, progress: 0 });
    }
  }, [channels, fs, duration, exportState.running, pause, baseName]);

  /* --------------------------- render ------------------------------ */

  const isBarPreset =
    settings.preset === "bars" || settings.preset === "mirror" || settings.preset === "radial";

  return (
    <ToolPage toolId="visualizer" wide>
      <ToolGrid>
        <div className="flex flex-col gap-6">
          <ControlsCard
            title="Style presets"
            description="Ten looks, one click each — then tweak anything below."
          >
            <PresetChips
              presets={STYLE_PRESETS.map((p) => ({
                label: p.label,
                apply: () => applyStylePreset(p.id),
              }))}
              active={STYLE_PRESETS.find((p) => p.id === activeStyle)?.label}
            />
            <SelectRow<VizPreset>
              label="Visualizer type"
              value={settings.preset}
              onChange={(v) => set("preset", v)}
              options={[
                { value: "bars", label: "Frequency bars" },
                { value: "mirror", label: "Mirror bars" },
                { value: "radial", label: "Radial ring" },
                { value: "freq-wave", label: "Frequency wave (spectrum curve)" },
                { value: "wave", label: "Waveform (oscilloscope)" },
              ]}
            />
            <SelectRow<ColorMode>
              label="Color mode"
              value={settings.colorMode}
              onChange={(v) => set("colorMode", v)}
              options={[
                { value: "solid", label: "Solid" },
                { value: "gradient", label: "Gradient (two colors)" },
                { value: "rainbow", label: "Rainbow (animated)" },
              ]}
            />
            <ColorRow
              label={settings.colorMode === "solid" ? "Bar / line color" : "Color 1"}
              value={settings.color1}
              onChange={(v) => set("color1", v)}
              disabled={settings.colorMode === "rainbow"}
            />
            <ColorRow
              label="Color 2"
              value={settings.color2}
              onChange={(v) => set("color2", v)}
              disabled={settings.colorMode === "solid" || settings.colorMode === "rainbow"}
            />
            <ColorRow label="Background" value={settings.bg} onChange={(v) => set("bg", v)} />
            <SliderRow
              label="Glow"
              value={settings.glow}
              min={0}
              max={100}
              step={1}
              onChange={(v) => set("glow", Math.round(v))}
              format={(v) => `${Math.round(v)}%`}
            />
          </ControlsCard>

          <ControlsCard title="Shape & motion" description="Everything updates live in the preview.">
            {isBarPreset ? (
              <>
                <SliderRow
                  label={settings.preset === "radial" ? "Bars in the ring" : "Number of bars"}
                  value={settings.barCount}
                  min={8}
                  max={settings.preset === "radial" ? 240 : 200}
                  step={1}
                  onChange={(v) => set("barCount", Math.round(v))}
                  format={(v) => `${Math.round(v)}`}
                />
                <SliderRow
                  label="Bar gap"
                  value={settings.barGap}
                  min={0}
                  max={0.8}
                  step={0.01}
                  onChange={(v) => set("barGap", v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <ToggleRow
                  label="Rounded bars"
                  checked={settings.roundedBars}
                  onChange={(v) => set("roundedBars", v)}
                />
                <ToggleRow
                  label="Peak caps"
                  description="Floating dots that mark each bar's recent peak"
                  checked={settings.capDots}
                  onChange={(v) => set("capDots", v)}
                />
              </>
            ) : (
              <SliderRow
                label="Line width"
                value={settings.lineWidth}
                min={1}
                max={14}
                step={0.5}
                onChange={(v) => set("lineWidth", v)}
                format={(v) => `${v.toFixed(1)} px`}
              />
            )}
            {settings.preset === "freq-wave" ? (
              <ToggleRow
                label="Fill the wave"
                description="Semi-transparent fill under both curves"
                checked={settings.fillWave}
                onChange={(v) => set("fillWave", v)}
              />
            ) : null}
            {settings.preset === "radial" ? (
              <SliderRow
                label="Rotation speed"
                value={settings.rotateSpeed}
                min={0}
                max={2}
                step={0.05}
                onChange={(v) => set("rotateSpeed", v)}
                format={(v) => `${v.toFixed(2)}×`}
              />
            ) : null}
            <SliderRow
              label="Sensitivity"
              value={settings.sensitivity}
              min={0.4}
              max={3}
              step={0.05}
              onChange={(v) => set("sensitivity", v)}
              format={(v) => `${v.toFixed(2)}×`}
              hint="How hard the music drives the visuals"
            />
            <SliderRow
              label="Smoothing"
              value={settings.smoothing}
              min={0}
              max={0.95}
              step={0.05}
              onChange={(v) => set("smoothing", v)}
              format={(v) => `${Math.round(v * 100)}%`}
              hint="Higher = calmer, more fluid motion"
            />
          </ControlsCard>

          <ControlsCard title="Overlays">
            <ToggleRow
              label="Show title"
              checked={settings.showTitle}
              onChange={(v) => set("showTitle", v)}
            />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Title text</label>
              <Input
                value={settings.titleText}
                onChange={(e) => set("titleText", e.target.value)}
                placeholder={baseName || "Track title"}
                maxLength={80}
                aria-label="Title text"
                disabled={!settings.showTitle}
              />
            </div>
            <ToggleRow
              label="Show progress bar"
              description="Thin bar at the bottom that fills with the track"
              checked={settings.showProgress}
              onChange={(v) => set("showProgress", v)}
            />
          </ControlsCard>
        </div>

        {/* ------------------ right column ------------------ */}
        <div className="flex flex-col gap-6">
          <ControlsCard
            title="Live preview"
            description="Click the canvas to seek. Every setting applies instantly."
          >
            <div className="overflow-hidden rounded-lg border bg-black">
              <canvas
                ref={canvasRef}
                onClick={seek}
                className="block w-full cursor-pointer"
                style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
                aria-label="Visualizer live preview"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={togglePlay} size="icon" aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button
                onClick={restart}
                size="icon"
                variant="outline"
                aria-label="Restart from the beginning"
              >
                <RotateCcw className="size-4" />
              </Button>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {formatTime(position)} / {formatTime(duration)}
              </span>
              <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {dims.w}×{dims.h}
              </span>
            </div>
          </ControlsCard>

          <ControlsCard
            title="Video export"
            description="Rendered in real time with the music — keep this tab visible while it records."
          >
            <SelectRow<VizFormat>
              label="Format"
              value={settings.format}
              onChange={(v) => set("format", v)}
              options={[
                { value: "16:9", label: "16:9 — YouTube" },
                { value: "9:16", label: "9:16 — TikTok / Shorts / Reels" },
                { value: "1:1", label: "1:1 — Square post" },
                { value: "4:5", label: "4:5 — Instagram feed" },
              ]}
            />
            <SelectRow<string>
              label="Resolution"
              value={settings.res720 ? "720" : "1080"}
              onChange={(v) => set("res720", v === "720")}
              options={[
                { value: "1080", label: "1080p (Full HD)" },
                { value: "720", label: "720p (faster, smaller file)" },
              ]}
            />
            <SelectRow<string>
              label="Frame rate"
              value={String(settings.fps)}
              onChange={(v) => set("fps", v === "60" ? 60 : 30)}
              options={[
                { value: "60", label: "60 fps" },
                { value: "30", label: "30 fps" },
              ]}
            />
            <SelectRow<string>
              label="Export length"
              value={String(settings.exportLength)}
              onChange={(v) =>
                set(
                  "exportLength",
                  v === "full" ? "full" : (Number(v) as 15 | 30 | 60)
                )
              }
              options={[
                { value: "full", label: "Full track" },
                { value: "15", label: "First 15 seconds" },
                { value: "30", label: "First 30 seconds" },
                { value: "60", label: "First 60 seconds" },
              ]}
            />
            <SliderRow
              label="Video quality"
              value={settings.bitrateMbps}
              min={4}
              max={32}
              step={2}
              onChange={(v) => set("bitrateMbps", Math.round(v))}
              format={(v) => `${Math.round(v)} Mbps`}
              hint="Higher = better quality, bigger file"
            />

            {exportState.running ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Film className="size-4 animate-pulse text-primary" />
                    Rendering… {Math.round(exportState.progress * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      cancelExportRef.current = true;
                    }}
                  >
                    <Square className="size-3.5" />
                    Cancel
                  </Button>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${exportState.progress * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <Button onClick={() => void exportVideo()} className="w-full" size="lg">
                <Clapperboard className="size-4" />
                Export video
              </Button>
            )}
          </ControlsCard>

          <ControlsCard title="Output summary">
            <StatRow label="Resolution" value={`${dims.w} × ${dims.h}`} />
            <StatRow label="Frame rate" value={`${settings.fps} fps`} />
            <StatRow
              label="Length"
              value={
                settings.exportLength === "full"
                  ? formatTime(duration)
                  : formatTime(Math.min(duration, Number(settings.exportLength)))
              }
            />
            <StatRow
              label="Container"
              value={pickMime().ext.toUpperCase()}
              accent
            />
          </ControlsCard>

          <InfoBanner>
            Export records in real time, so a 3-minute song takes 3 minutes —
            and the tab needs to stay in the foreground. Browsers that support
            MP4 recording get an MP4; others get WebM, which YouTube, TikTok
            and every major editor accept too.
          </InfoBanner>
        </div>
      </ToolGrid>
    </ToolPage>
  );
}
