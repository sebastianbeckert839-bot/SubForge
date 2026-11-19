/**
 * Canonical public URL of the site, used by the sitemap, robots.txt,
 * canonical tags, Open Graph and structured data so they always match
 * the URL visitors actually use.
 *
 * Priority:
 *  1. NEXT_PUBLIC_SITE_URL — explicit override. Set this in Vercel
 *     (Project → Settings → Environment Variables) when you attach a
 *     custom domain, e.g. https://subforge.com
 *  2. VERCEL_PROJECT_PRODUCTION_URL — provided automatically by Vercel
 *     on every deployment (e.g. subforge-abc123.vercel.app), so a fresh
 *     project's SEO tags are correct out of the box with zero config.
 *  3. https://subforge.app — development fallback.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://subforge.app");
