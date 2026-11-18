"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Upload,
  SlidersHorizontal,
  Download,
  Lock,
  AudioWaveform,
  Speaker,
  Waves,
  MicOff,
  Clapperboard,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  TOOLS,
  getCategoryLabel,
  type ToolCategory,
  type ToolMeta,
} from "@/lib/tools";
import { toolHref } from "@/components/hash-router";
import { ToolIcon } from "@/components/tool-ui";
import { formatCount } from "@/lib/audio/engine";

/* ------------------------------------------------------------------ */
/* Static spectrum diagram — literally shows what the Rebasser does     */
/* ------------------------------------------------------------------ */

const DEC_MIN = Math.log10(20);
const DEC_MAX = Math.log10(20000);

function SpectrumDiagram() {
  const W = 528;
  const H = 212;
  const padL = 32;
  const padR = 16;
  const top = 36;
  const base = 146;
  const x = (f: number) =>
    padL + ((Math.log10(f) - DEC_MIN) / (DEC_MAX - DEC_MIN)) * (W - padL - padR);
  const y = (v: number) => base - v * (base - top);

  // hand-tuned energy anchors of a bass-heavy song: [Hz, 0..1]
  const anchors: Array<[number, number]> = [
    [20, 0.52],
    [28, 0.7],
    [40, 0.83],
    [55, 0.88],
    [75, 0.77],
    [110, 0.61],
    [180, 0.45],
    [300, 0.36],
    [600, 0.33],
    [1000, 0.41],
    [1800, 0.45],
    [3000, 0.35],
    [5000, 0.24],
    [9000, 0.16],
    [16000, 0.1],
    [20000, 0.07],
  ];

  // sample the curve smoothly in log-frequency space
  const pts: string[] = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const lf = DEC_MIN + (i / N) * (DEC_MAX - DEC_MIN);
    const f = Math.pow(10, lf);
    let v = anchors[anchors.length - 1][1];
    for (let a = 0; a < anchors.length - 1; a++) {
      const [f0, v0] = anchors[a];
      const [f1, v1] = anchors[a + 1];
      if (f >= f0 && f <= f1) {
        const u =
          (Math.log10(f) - Math.log10(f0)) / (Math.log10(f1) - Math.log10(f0));
        const s = u * u * (3 - 2 * u);
        v = v0 + (v1 - v0) * s;
        break;
      }
    }
    pts.push(`${i === 0 ? "M" : "L"}${x(f).toFixed(1)},${y(v).toFixed(1)}`);
  }
  const line = pts.join(" ");
  const area = `${line} L${x(20000).toFixed(1)},${base} L${x(20).toFixed(1)},${base} Z`;

  const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const bands = [
    { label: "SUB", from: 20, to: 60 },
    { label: "BASS", from: 60, to: 250 },
    { label: "MIDS", from: 250, to: 4000 },
    { label: "HIGHS", from: 4000, to: 20000 },
  ];
  const bx0 = x(29);
  const bx1 = x(34);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Frequency spectrum of a song from 20 Hz to 20 kHz, with the 29 to 34 Hz rebass band highlighted"
    >
      {/* band separators */}
      {[60, 250, 4000].map((f) => (
        <line
          key={f}
          x1={x(f)}
          y1={top - 4}
          x2={x(f)}
          y2={base}
          className="stroke-border"
          strokeDasharray="3 4"
        />
      ))}
      {/* silence baseline */}
      <line x1={padL} y1={base} x2={W - padR} y2={base} className="stroke-border" />

      {/* the spectrum itself */}
      <path d={area} className="fill-primary/10" />
      <path d={line} className="stroke-primary" strokeWidth={1.75} fill="none" strokeLinejoin="round" />

      {/* the rebass band */}
      <rect
        x={bx0}
        y={top - 6}
        width={bx1 - bx0}
        height={base - top + 6}
        className="fill-primary/20 stroke-primary"
        strokeWidth={1}
      />
      <text x={bx1 + 6} y={top - 12} className="fill-primary font-mono" fontSize={13}>
        29–34 Hz
      </text>
      <text x={bx1 + 6} y={top + 2} className="fill-foreground/70 font-mono" fontSize={11}>
        your rebass band
      </text>

      {/* frequency ticks */}
      {ticks.map((f) => (
        <g key={f}>
          <line x1={x(f)} y1={base} x2={x(f)} y2={base + 4} className="stroke-border" />
          <text
            x={x(f)}
            y={base + 16}
            textAnchor="middle"
            className="fill-foreground/70 font-mono"
            fontSize={11}
          >
            {f >= 1000 ? `${f / 1000}k` : f}
          </text>
        </g>
      ))}
      {/* band labels */}
      {bands.map((b) => (
        <text
          key={b.label}
          x={(x(b.from) + x(b.to)) / 2}
          y={base + 34}
          textAnchor="middle"
          className="fill-foreground/70"
          fontSize={11}
          letterSpacing={1.2}
        >
          {b.label}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* "What it does" panel                                                */
/* ------------------------------------------------------------------ */

const CAPABILITIES = [
  {
    icon: AudioWaveform,
    text: (
      <>
        Rebass any song into a custom sub band —{" "}
        <span className="font-mono text-primary">29–34 Hz</span> for
        subwoofer builds, <span className="font-mono">45–60 Hz</span> for
        warm systems, or anything else you can dial in.
      </>
    ),
  },
  {
    icon: Speaker,
    text: (
      <>
        Boost the bass you already have by up to{" "}
        <span className="font-mono text-primary">+15 dB</span>. A look-ahead
        limiter keeps it smooth at every setting.
      </>
    ),
  },
  {
    icon: Waves,
    text: <>Slowed + reverb, nightcore, 8D rotation, reverse — the classic edits, done properly.</>,
  },
  {
    icon: Clapperboard,
    text: (
      <>
        Turn any track into a <span className="font-mono text-primary">1080p 60fps</span>{" "}
        visualizer video — bars, waves and rings, fully customizable, in 16:9
        for YouTube or 9:16 for TikTok.
      </>
    ),
  },
  {
    icon: MicOff,
    text: <>Strip vocals for karaoke, isolate an acapella, trim, normalize, convert channels.</>,
  },
];

function WhatItDoes() {
  return (
    <div className="rounded-xl border bg-card p-6 sm:p-7">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        What SubForge does
      </h2>
      <ul className="mt-4 space-y-3.5">
        {CAPABILITIES.map((c, i) => (
          <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
            <c.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-foreground/90">{c.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t pt-4">
        <SpectrumDiagram />
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Runs 100% locally in your browser. Files never get uploaded. Export
        to WAV (16/24/32-bit) or MP3 (up to 320 kbps).
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Featured tool cards                                                 */
/* ------------------------------------------------------------------ */

function FeaturedCard({
  id,
  specs,
}: {
  id: string;
  specs: string[];
}) {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return null;
  return (
    <a
      href={toolHref(id)}
      className="group relative flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-3.5">
        <span className="bg-brand flex size-11 shrink-0 items-center justify-center rounded-lg">
          <ToolIcon name={tool.icon} className="size-5.5 text-white" />
        </span>
        <div>
          <h3 className="text-lg font-bold leading-tight">{tool.name}</h3>
          <p className="text-sm text-muted-foreground">{tool.tagline}</p>
        </div>
        <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {tool.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {specs.map((s) => (
          <span
            key={s}
            className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {s}
          </span>
        ))}
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Compact tool card                                                   */
/* ------------------------------------------------------------------ */

function ToolCard({ tool, uses }: { tool: ToolMeta; uses?: number }) {
  return (
    <a
      href={toolHref(tool.id)}
      className="group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ToolIcon name={tool.icon} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 font-semibold leading-tight">
            {tool.name}
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {tool.description}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
          {getCategoryLabel(tool.category)}
        </span>
        {uses != null && uses > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground/70">
            {formatCount(uses)} {uses === 1 ? "use" : "uses"}
          </span>
        ) : null}
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Home page                                                           */
/* ------------------------------------------------------------------ */

interface Stats {
  totalToolUses: number;
  tools: Record<string, number>;
}

export function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategory | "all">("all");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      tools: filtered.filter((t) => t.category === cat.id),
    })).filter((g) => g.tools.length > 0);
  }, [filtered]);

  return (
    <div>
      {/* ---------------- hero ---------------- */}
      <section className="border-b">
        <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_440px] lg:gap-12">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {TOOLS.length} tools · free · runs locally
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-[2.6rem]">
              The online rebasser for people who care about the low end.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Drop in any song and rebuild its bass from scratch, in whatever
              frequency band you want. Or boost what&apos;s already there by
              up to +15 dB without a hint of distortion. Then render it all
              into a 1080p60 visualizer video for YouTube or TikTok — plus
              slowed + reverb, nightcore, 8D, vocal removal and{" "}
              {TOOLS.length - 3} more tools.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={toolHref("rebasser")}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-orange-600 px-5 font-semibold text-white transition-colors hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
              >
                Open the Rebasser
                <ArrowRight className="size-4" />
              </a>
              <a
                href={toolHref("visualizer")}
                className="inline-flex h-11 items-center gap-2 rounded-lg border bg-card px-5 font-semibold transition-colors hover:border-orange-600/50 hover:text-orange-600 dark:hover:border-orange-500/50 dark:hover:text-orange-500"
              >
                <Clapperboard className="size-4" />
                Make a video
              </a>
              <a
                href="#tools"
                className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-semibold transition-colors hover:border-orange-600/50 hover:text-orange-600 dark:hover:border-orange-500/50 dark:hover:text-orange-500"
              >
                Browse all tools
              </a>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> files stay on your device
              </span>
              <span className="flex items-center gap-1.5">
                <Download className="size-3.5" /> WAV + MP3 export
              </span>
            </p>
          </div>
          <WhatItDoes />
        </div>
      </section>

      {/* ---------------- featured tools ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">Start here</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FeaturedCard
            id="rebasser"
            specs={[
              "18–140 Hz custom band",
              "follows your bassline",
              "sine · saturated · triangle",
            ]}
          />
          <FeaturedCard
            id="bass-booster"
            specs={["0 to +15 dB", "look-ahead limiter", "clean at max"]}
          />
          <div className="md:col-span-2">
            <FeaturedCard
              id="visualizer"
              specs={[
                "1080p 60fps export",
                "16:9 · 9:16 · 1:1 · 4:5",
                "10 presets",
                "live preview",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ---------------- search & filter ---------------- */}
      <div
        id="tools"
        className="sticky top-14 z-30 mt-10 scroll-mt-14 border-b bg-background/85 backdrop-blur-md"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-[240px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools…"
              className="pl-9"
              aria-label="Search tools"
            />
          </div>
          <div
            className="relative flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 lg:pb-0"
            role="tablist"
            aria-label="Tool categories"
          >
            <button
              type="button"
              role="tab"
              aria-selected={category === "all"}
              onClick={() => setCategory("all")}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                category === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  category === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
            <span
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent lg:hidden"
              aria-hidden
            />
          </div>
          {stats && stats.totalToolUses > 0 ? (
            <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground lg:block">
              {formatCount(stats.totalToolUses)} tracks forged so far
            </span>
          ) : null}
        </div>
      </div>

      {/* ---------------- tool grid ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {grouped.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Search className="mx-auto mb-3 size-8 opacity-40" />
            <p>No tools match “{query}”.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map((group) => (
              <div key={group.id}>
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-lg font-bold tracking-tight">{group.label}</h2>
                  <span className="text-sm text-muted-foreground">
                    {group.tools.length} {group.tools.length === 1 ? "tool" : "tools"}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.tools.map((t) => (
                    <ToolCard key={t.id} tool={t} uses={stats?.tools?.[t.id]} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- the short version ---------------- */}
      <section className="border-t bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground sm:flex-row sm:gap-5">
            {[
              { icon: Upload, label: "Drop a file" },
              { icon: SlidersHorizontal, label: "Set your numbers" },
              { icon: Download, label: "Download the result" },
            ].map((s, i) => (
              <Fragment key={s.label}>
                {i > 0 ? (
                  <ChevronRight className="hidden size-4 text-muted-foreground/40 sm:block" />
                ) : null}
                <span className="flex items-center gap-2">
                  <s.icon className="size-4 text-primary" />
                  {s.label}
                </span>
              </Fragment>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground/70">
            Every tool works the same way. Nothing installs, nothing uploads,
            no account needed.
          </p>
        </div>
      </section>
    </div>
  );
}
