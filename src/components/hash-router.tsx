"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Minimal hash-based router. Every tool is its own page at `#/tool/<id>`.
 * Uses hash routing so the whole app lives on the single `/` route.
 *
 * IMPORTANT: never navigate these routes with next/link — the App Router
 * handles same-page hash changes via history.pushState, which does NOT fire
 * the `hashchange` event this router listens to. Always use plain <a href>
 * or the navigate() helper below.
 */

export function parseToolId(hash: string): string | null {
  const m = hash.match(/^#\/tool\/([a-z0-9-]+)\/?$/);
  return m ? m[1] : null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getSnapshot = () => window.location.hash;
const getServerSnapshot = () => "";

export function useHashRoute(): string {
  // getServerSnapshot keeps SSR and the hydration pass consistent (always
  // Home); right after mount React re-renders with the real hash if the
  // user deep-linked straight into a tool page.
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function navigate(hash: string) {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

export function useNavigate() {
  return useCallback((hash: string) => navigate(hash), []);
}

export function toolHref(id: string): string {
  return `#/tool/${id}`;
}
