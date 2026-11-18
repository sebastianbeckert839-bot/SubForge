import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TOOLS } from "@/lib/tools";
import { SITE_URL } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Online Rebasser — Rebuild Any Song's Bass, Free | SubForge",
    template: "%s | SubForge",
  },
  description:
    "SubForge is the free online rebasser: strip a song's original bass and forge a new sub-bass line in any custom frequency band (like 29–34 Hz), following the track's own bassline. Plus a smooth +15 dB bass booster, slowed + reverb, nightcore, 8D audio, vocal remover, visualizer video maker and 15 more audio tools — all in your browser, no uploads, no sign-up.",
  keywords: [
    "online rebasser",
    "rebass a song",
    "rebass tool",
    "sub bass generator",
    "bass booster online",
    "boost bass online free",
    "audio tools",
    "bass booster mp3",
    "slowed reverb maker",
    "nightcore maker",
    "8d audio converter",
    "vocal remover online",
    "karaoke maker",
    "audio visualizer video maker",
    "online audio editor",
    "music editor no download",
  ],
  authors: [{ name: "SubForge" }],
  alternates: { canonical: "/" },
  openGraph: {
    title: "SubForge — Online Rebasser & Free Audio Tools",
    description:
      "Rebass any song into a custom sub band, boost bass +15 dB distortion-free, make slowed + reverb edits, and render 1080p60 visualizer videos. 22 free tools, all local in your browser.",
    siteName: "SubForge",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "SubForge — Online Rebasser & Free Audio Tools",
    description:
      "Rebass any song into a custom sub band, boost bass +15 dB, and much more. Free, no uploads.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  verification: {
    // Google Search Console ownership proof (URL-prefix property)
    google: "-OqhOAtj5Lq0DFIhoa39K1JzsyhI9RC_pZyd2JlVXVg",
  },
};

/* Structured data: site + full tool list (helps Google build sitelinks) */
function structuredData(): string {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SubForge audio tools",
    itemListElement: TOOLS.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "WebApplication",
        name: `${t.name} — free online tool`,
        description: t.description,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any (browser)",
        url: `${SITE_URL}/#/tool/${t.id}`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    })),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "SubForge",
    url: SITE_URL,
    description:
      "Free online audio tools: rebasser, bass booster, slowed + reverb, nightcore, 8D audio, vocal remover, visualizer video maker and more.",
  };

  return JSON.stringify([website, itemList]);
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredData() }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
