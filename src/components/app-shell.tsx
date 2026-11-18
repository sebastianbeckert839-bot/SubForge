"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { AudioWaveform, Sun, Moon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, TOOLS } from "@/lib/tools";
import { toolHref } from "@/components/hash-router";

const emptySubscribe = () => () => {};

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // false during SSR, true on the client — without hydration mismatch
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "light" ? (
        <Moon className="size-4.5" />
      ) : (
        <Sun className="size-4.5" />
      )}
    </Button>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="#/" className="flex items-center gap-2.5" aria-label="SubForge home">
          <span className="bg-brand flex size-8 items-center justify-center rounded-lg">
            <AudioWaveform className="size-4.5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight">SubForge</span>
        </a>
        <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Main">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href="#/">All tools</a>
          </Button>
          <ThemeToggle />
          <Button
            size="sm"
            variant="outline"
            asChild
            className="hidden font-semibold sm:inline-flex"
          >
            <a href={toolHref("visualizer")}>Video Visualizer</a>
          </Button>
          <Button
            size="sm"
            asChild
            className="bg-orange-600 font-semibold text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            <a href={toolHref("rebasser")}>Rebasser</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-card/50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-brand flex size-7 items-center justify-center rounded-md">
                <AudioWaveform className="size-4 text-white" />
              </span>
              <span className="font-bold">SubForge</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Browser audio tools, built for the low end. Rebass, boost,
              slow, spin, strip, and export without installing anything.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/70">
              <Lock className="size-3" />
              Every tool runs locally. Your files never leave this device.
            </p>
          </div>
          {CATEGORIES.slice(0, 2).map((cat) => (
            <div key={cat.id}>
              <h3 className="text-sm font-semibold">{cat.label}</h3>
              <ul className="mt-3 space-y-2">
                {TOOLS.filter((t) => t.category === cat.id).map((t) => (
                  <li key={t.id}>
                    <a
                      href={toolHref(t.id)}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="text-sm font-semibold">Visuals</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href={toolHref("visualizer")}
                  className="text-sm font-medium text-primary transition-colors hover:text-foreground"
                >
                  Video Visualizer
                </a>
              </li>
              <li className="text-sm text-muted-foreground/80">
                1080p60 bars, waves &amp; rings — 16:9, 9:16, 1:1, 4:5
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground/70 sm:flex-row">
          <span>© {new Date().getFullYear()} SubForge</span>
          <span>{TOOLS.length} tools · WAV + MP3 export · free, no sign-up</span>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
