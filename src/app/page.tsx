import type { Metadata } from "next";
import { AppPage } from "@/components/app-page";
import { getTool, TOOLS } from "@/lib/tools";

/**
 * Server-rendered metadata per tool. Every tool has an indexable URL of its
 * own — /?tool=rebasser, /?tool=bass-booster, … — with a unique title,
 * description and canonical, all listed in the sitemap. The client swaps
 * the URL to the hash form on load (same page), so people get clean links
 * while Google gets one real, indexable page per tool.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const raw = typeof sp.tool === "string" ? sp.tool : "";
  const tool = raw && /^[a-z0-9-]+$/.test(raw) ? getTool(raw) : null;
  if (!tool) return {};
  return {
    title: `${tool.name} — ${tool.tagline}`,
    description: tool.description,
    alternates: { canonical: `/?tool=${tool.id}` },
    openGraph: {
      title: `${tool.name} — ${tool.tagline}`,
      description: tool.description,
      url: `/?tool=${tool.id}`,
    },
  };
}

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.id }));
}

export default function Page() {
  return <AppPage />;
}
