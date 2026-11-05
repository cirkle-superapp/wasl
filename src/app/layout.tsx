import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/wasl/theme-provider";
import { ColorThemeProvider } from "@/components/wasl/color-theme-provider";
import { LanguageProvider } from "@/components/wasl/language-provider";

// ──────────────────────────────────────────────────────────────────────────
// Font loading note (Task 90.1 fix)
// ──────────────────────────────────────────────────────────────────────────
// Previously we used `next/font/google` to load Geist, Geist_Mono, Fraunces,
// Inter, and Tajawal at build time. In sandboxed/restricted-network
// environments (and on some Vercel build configurations), Turbopack cannot
// reach fonts.gstatic.com and fails with:
//   Module not found: Can't resolve
//   '@vercel/turbopack-next/internal/font/google/font'
//
// Rather than depend on Google Fonts being reachable, we switched to system
// fonts entirely. The CSS variables (--font-sans, --font-display,
// --font-mono, --font-arabic) are defined in globals.css with high-quality
// system font stacks that preserve the visual design:
//   • Body sans-serif:    ui-sans-serif, system-ui, Segoe UI, Roboto…
//   • Display serif:      Iowan Old Style, Baskerville, Georgia…
//   • Monospace:          ui-monospace, SF Mono, Menlo…
//   • Arabic:             Geeza Pro, Damascus, Noto Naskh Arabic…
//
// This is the "we are the API" approach — Wasl no longer depends on
// external font CDNs. The fonts ship with the user's OS, so they're
// always available, never rate-limited, never blocked, and load
// instantaneously (no network round-trip, no layout shift).
// ──────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  metadataBase: new URL("https://cirkle-wasl.vercel.app"),
  title: "Wasl — Simple. Secure. Connected.",
  description: "Wasl is a fast, simple and secure messaging app that connects you with the people who matter. End-to-end encrypted, real-time messaging with verified agreements.",
  keywords: ["Wasl", "Cirkle", "chat", "messaging", "real-time", "secure", "encrypted", "commit", "agreements", "business"],
  authors: [{ name: "Wasl" }],
  creator: "Cirkle",
  publisher: "Cirkle",
  // Prevent stale cached versions from being served
  other: {
    "cache-control": "no-cache, no-store, must-revalidate",
    "pragma": "no-cache",
    "expires": "0",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/wasl-favicon.svg", type: "image/svg+xml" },
      { url: "/cirkle-favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/wasl-favicon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Wasl",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Wasl — Simple. Secure. Connected.",
    description: "End-to-end encrypted messaging with verified agreements. Real-time chat, business accounts, and AI-powered features.",
    siteName: "Wasl",
    type: "website",
    url: "https://cirkle-wasl.vercel.app",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Wasl — Simple. Secure. Connected.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wasl — Simple. Secure. Connected.",
    description: "End-to-end encrypted messaging with verified agreements.",
    images: ["/og-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Viewport export — Next.js 16 requires themeColor here, not in metadata
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#009588" },
    { media: "(prefers-color-scheme: dark)", color: "#1a4a5a" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Minimal FOUC seed (Aurora v2).
// The previous "critical CSS" block was a full hand-written stylesheet that
// poisoned the whole app: its unlayered `*{margin:0;padding:0}` reset beat
// Tailwind's layered utilities (killing p-4/py-2/pt-*/…), its hardcoded
// `[data-theme=cirkle]` token block overrode the design system's live tokens
// (locking the beige canvas), and its `input` / `button[type=…]` element
// selectors fought shadcn/ui components (gold borders everywhere).
//
// In Next.js App Router the stylesheet <link> is render-blocking in <head>,
// so real FOUC risk is tiny. We keep ONLY the two genuinely safe seeds:
// a sane pre-CSS page color and the button cursor nicety. Everything else
// must come from globals.css so there is exactly ONE source of truth.
const criticalCSS = `
  html{background:#f7f9fa}
  @media (prefers-color-scheme: dark){html{background:#0d1418}}
  button{cursor:pointer;font-family:inherit}
`;

// Inline script to apply the saved color theme BEFORE hydration, preventing
// a flash of the default theme. Defaults to Cirkle (gold/teal/cream) when no
// preference is stored, so the app loads with the Cirkle brand colors by default.
const colorThemeScript = `(function(){try{var t=localStorage.getItem('wasl-color-theme');if(t==='wasl'){document.documentElement.removeAttribute('data-theme');}else{document.documentElement.setAttribute('data-theme','cirkle');}}catch(e){document.documentElement.setAttribute('data-theme','cirkle');}})();`;

// Register the PWA service worker + request notification permission
const swScript = `(function(){if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}if('Notification'in window&&Notification.permission==='default'){window.addEventListener('load',function(){setTimeout(function(){Notification.requestPermission().catch(function(){});},3000);});}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Cache-busting meta tags — prevent the preview panel and browsers
            from serving stale HTML after a new deployment. The chunk URLs in
            the HTML change with every build, so caching HTML = stale chunks
            = ChunkLoadError = "Wasl is reloading…" error page. */}
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />

        {/* ── PWA / Mobile App meta tags (Task 93) ─────────────────────────
            * These tags let users install Wasl directly from their phone's
            * browser — no App Store or Google Play needed. The manifest
            * defines the installable app shell; the apple-mobile-web-app-*
            * tags make iOS treat an "Add to Home Screen" install as a
            * standalone app (no Safari chrome).
            */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="application-name" content="Wasl" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Wasl" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Apple touch icons (for the iOS home screen) */}
        <link rel="apple-touch-icon" href="/wasl-favicon.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/wasl-favicon.svg" />
        <link rel="icon" type="image/svg+xml" href="/wasl-favicon.svg" />
        <link rel="mask-icon" href="/wasl-favicon.svg" color="#009588" />

        <style dangerouslySetInnerHTML={{ __html: criticalCSS }} />
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body
        className="antialiased bg-background text-foreground"
        style={{
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* SVG gradient defs for custom duotone icons (Task 95) — must be in
            <body>, not <head>, per HTML spec. This invisible SVG defines
            gradient fills that are referenced by url(#id) from icon SVGs. */}
        <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden>
          <defs>
            <linearGradient id="wasl-icon-grad-teal" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#009588" />
              <stop offset="100%" stopColor="#00C897" />
            </linearGradient>
            <linearGradient id="wasl-icon-grad-gold" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C2A060" />
              <stop offset="100%" stopColor="#E5C98A" />
            </linearGradient>
            <linearGradient id="wasl-icon-grad-rose" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E8466E" />
              <stop offset="100%" stopColor="#F5708C" />
            </linearGradient>
            <linearGradient id="wasl-icon-grad-blue" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#60A5FA" />
            </linearGradient>
          </defs>
        </svg>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ColorThemeProvider>
            <LanguageProvider>
              {children}
              <Toaster
                position="bottom-right"
                richColors
                toastOptions={{
                  className: 'wasl-toast-anim',
                  style: {
                    borderRadius: '14px',
                    boxShadow: 'var(--wasl-shadow-lg)',
                    border: '1px solid color-mix(in oklab, var(--foreground) 8%, transparent)',
                  },
                }}
              />
            </LanguageProvider>
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
