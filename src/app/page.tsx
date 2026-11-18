"use client";

import { Suspense, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, AudioWaveform } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Home } from "@/components/home";
import { StatsDashboard } from "@/components/stats-dashboard";
import { useHashRoute, parseToolId, toolHref } from "@/components/hash-router";
import { TOOL_COMPONENTS } from "@/lib/tool-components";
import { getTool } from "@/lib/tools";
import { Button } from "@/components/ui/button";

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

function NotFoundTool({ id }: { id: string }) {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-6xl flex-col items-center justify-center px-4 text-center">
      <span className="bg-brand mb-5 flex size-14 items-center justify-center rounded-2xl">
        <AudioWaveform className="size-7 text-white" />
      </span>
      <h1 className="text-2xl font-bold">Tool not found</h1>
      <p className="mt-2 text-muted-foreground">
        Nothing is registered at <code className="font-mono">#/tool/{id}</code>.
      </p>
      <Button asChild className="mt-6">
        <a href="#/">Back to all tools</a>
      </Button>
    </div>
  );
}

function ToolRoute({ id }: { id: string }) {
  const tool = getTool(id);
  const Component = TOOL_COMPONENTS[id];
  if (!tool || !Component) return <NotFoundTool id={id} />;
  return <Component />;
}

export default function Page() {
  const hash = useHashRoute();
  const toolId = parseToolId(hash);
  const isStats = /^#\/stats\/?$/.test(hash);

  // count one visit per browser session (best-effort)
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("sf-view-counted")) {
        sessionStorage.setItem("sf-view-counted", "1");
        fetch("/api/view", { method: "POST" }).catch(() => {});
      }
    } catch {
      // private mode etc. — ignore
    }
  }, []);

  // scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [toolId, isStats]);

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={toolId ?? (isStats ? "stats" : "home")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {toolId ? (
            <Suspense fallback={<PageFallback />}>
              <ToolRoute id={toolId} />
            </Suspense>
          ) : isStats ? (
            <StatsDashboard />
          ) : (
            <Home />
          )}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
