"use client";

import { useEffect, useRef, type ReactNode } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getTool, getCategoryLabel } from "@/lib/tools";
import { useAudioStore } from "@/store/audio";
import { formatTime, formatHz } from "@/lib/audio/engine";
import type { Channels } from "@/lib/audio/dsp";
import { FileDrop } from "@/components/file-drop";

/* ------------------------------------------------------------------ */
/* Icon mapping                                                        */
/* ------------------------------------------------------------------ */

export function ToolIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Activity;
  return <Icon className={className} />;
}

/* ------------------------------------------------------------------ */
/* Tool page scaffold                                                  */
/* ------------------------------------------------------------------ */

export function ToolPage({
  toolId,
  children,
  wide = false,
}: {
  toolId: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const tool = getTool(toolId);
  const { channels, meta, clear } = useAudioStore();
  if (!tool) return null;

  return (
    <div className={cn("mx-auto w-full px-4 pb-16 pt-8 sm:px-6", wide ? "max-w-6xl" : "max-w-6xl")}>
      {/* breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <a href="#/" className="transition-colors hover:text-foreground">
          Home
        </a>
        <Icons.ChevronRight className="size-3.5" />
        <span>{getCategoryLabel(tool.category)}</span>
        <Icons.ChevronRight className="size-3.5" />
        <span className="text-foreground">{tool.name}</span>
      </nav>

      {/* header */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="bg-brand flex size-14 shrink-0 items-center justify-center rounded-xl">
          <ToolIcon name={tool.icon} className="size-7 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {tool.name}
            </h1>
            <Badge variant="secondary" className="rounded-full">
              {getCategoryLabel(tool.category)}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{tool.tagline}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground/80">
            {tool.description}
          </p>
        </div>
      </header>

      {channels && meta ? (
        <>
          {/* loaded file summary */}
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3">
            <Icons.FileAudio className="size-4 shrink-0 text-primary" />
            <span className="max-w-[240px] truncate font-medium" title={meta.name}>
              {meta.name}
            </span>
            <span className="text-sm text-muted-foreground">
              · {formatTime(meta.durationSec)} ·{" "}
              {meta.channels >= 2 ? "Stereo" : "Mono"} ·{" "}
              {formatHz(meta.sampleRate)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                clear();
              }}
            >
              <Icons.RotateCcw className="size-3.5" />
              Change file
            </Button>
          </div>
          {children}
        </>
      ) : (
        <div className="mx-auto max-w-2xl">
          <FileDrop />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Everything runs locally in your browser — your file never leaves
            this device.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function ToolGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
      {children}
    </div>
  );
}

export function ControlsCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Control rows                                                        */
/* ------------------------------------------------------------------ */

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  log = false,
  hint,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  log?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const ratio = log
    ? Math.log(value / min) / Math.log(max / min)
    : (value - min) / (max - min);
  const sliderValue = Math.min(1, Math.max(0, isFinite(ratio) ? ratio : 0));

  const handle = (v: number) => {
    if (log) {
      onChange(min * Math.pow(max / min, v));
    } else {
      onChange(min + v * (max - min));
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", disabled && "opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[sliderValue]}
        onValueChange={(vals) => handle(vals[0])}
        min={0}
        max={1}
        step={log ? 0.002 : step / (max - min)}
        disabled={disabled}
        aria-label={label}
      />
      {hint ? <p className="text-xs text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

export function SelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-2", disabled && "opacity-50")}>
      <label className="text-sm font-medium">{label}</label>
      <Select
        value={String(value)}
        onValueChange={(v) => {
          const opt = options.find((o) => String(o.value) === v);
          if (opt) onChange(opt.value);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={String(o.value)} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-50")}>
      <div className="min-w-0">
        <label className="text-sm font-medium">{label}</label>
        {description ? (
          <p className="text-xs text-muted-foreground/80">{description}</p>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export function PresetChips({
  presets,
  active,
}: {
  presets: { label: string; apply: () => void }[];
  active?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={p.apply}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            active === p.label
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Readouts                                                            */
/* ------------------------------------------------------------------ */

export function StatRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          accent ? "font-semibold text-primary" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function InfoBanner({
  children,
  variant = "info",
}: {
  children: ReactNode;
  variant?: "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        variant === "info"
          ? "border-primary/25 bg-primary/5 text-foreground/90"
          : "border-amber-500/30 bg-amber-500/5 text-foreground/90"
      )}
      role="note"
    >
      {variant === "info" ? (
        <Icons.Info className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <Icons.TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live preview status — replaces the old "apply" button               */
/* ------------------------------------------------------------------ */

export function LiveStatus({
  running,
  progress,
  stage,
  idleText = "Live preview — the track updates as you move the controls",
}: {
  running: boolean;
  progress: number;
  stage?: string;
  idleText?: string;
}) {
  if (!running) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground/80">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        {idleText}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 px-1" aria-live="polite">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icons.Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
        <span className="truncate">{stage ? `${stage}…` : "Processing"}</span>
        <span className="ml-auto shrink-0 font-mono tabular-nums">
          {Math.round(progress * 100)}%
        </span>
      </p>
      <Progress value={progress * 100} className="h-1" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live preview driver — debounced re-run on every settings change     */
/* ------------------------------------------------------------------ */

/**
 * Re-runs `apply` immediately when a new file is loaded (or the tool
 * mounts with a file already in the store) and — debounced — whenever
 * any value in `settings` changes. Settings must be a plain object of
 * primitives so it can be compared via JSON.
 */
export function useLivePreview<T extends object>(
  channels: Channels | null,
  settings: T,
  apply: (settings: T) => void,
  delayMs = 250
): void {
  const applyRef = useRef(apply);
  const settingsRef = useRef(settings);

  // keep the latest apply/settings reachable from the debounced timer and
  // the run effects without making them dependencies
  useEffect(() => {
    applyRef.current = apply;
    settingsRef.current = settings;
  });

  const key = JSON.stringify(settings);
  const keyRef = useRef<string | null>(null);
  const fileRef = useRef<Channels | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!channels) {
      fileRef.current = null;
      keyRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (fileRef.current !== channels || keyRef.current === null) {
      // new file, or first mount with a file already loaded → run now
      fileRef.current = channels;
      keyRef.current = key;
      if (timerRef.current) clearTimeout(timerRef.current);
      applyRef.current(settingsRef.current);
      return;
    }
    if (key !== keyRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      const nextKey = key;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        keyRef.current = nextKey;
        applyRef.current(settingsRef.current);
      }, delayMs);
    }
  }, [channels, key, delayMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
}
