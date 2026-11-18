"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { Channels, ProgressFn } from "@/lib/audio/dsp";

export interface ProcessResult<I = unknown> {
  channels: Channels;
  info?: I;
}

export type ProcessorStatus = "idle" | "running" | "done" | "error";

/**
 * Shared processing hook for every tool page.
 * Runs an async processing function with progress reporting, keeps the
 * result, and tracks usage in the backend (fire-and-forget).
 */
export function useProcessor<I = unknown>(toolId: string) {
  const [status, setStatus] = useState<ProcessorStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult<I> | null>(null);
  const runIdRef = useRef(0);

  const run = useCallback(
    async (fn: (report: ProgressFn) => Promise<ProcessResult<I>>) => {
      const runId = ++runIdRef.current;
      setStatus("running");
      setProgress(0);
      setStage("");
      setError(null);

      let lastYield = 0;
      const report: ProgressFn = async (frac, stageLabel) => {
        const now = Date.now();
        if (now - lastYield < 45 && frac < 1) return;
        lastYield = now;
        if (runIdRef.current !== runId) return;
        setProgress(Math.max(0, Math.min(1, frac)));
        if (stageLabel) setStage(stageLabel);
        // yield to the event loop so the UI can repaint
        await new Promise((r) => setTimeout(r, 0));
      };

      try {
        const res = await fn(report);
        if (runIdRef.current !== runId) return;
        setResult(res);
        setStatus("done");
        setProgress(1);
        // usage tracking (best-effort)
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: toolId }),
        }).catch(() => {});
      } catch (e) {
        if (runIdRef.current !== runId) return;
        const message =
          e instanceof Error ? e.message : "Processing failed unexpectedly";
        setError(message);
        setStatus("error");
        toast.error(message);
      }
    },
    [toolId]
  );

  const reset = useCallback(() => {
    runIdRef.current++;
    setStatus("idle");
    setProgress(0);
    setStage("");
    setError(null);
    setResult(null);
  }, []);

  return {
    status,
    progress,
    stage,
    error,
    result,
    run,
    reset,
    isRunning: status === "running",
    isDone: status === "done",
  };
}
