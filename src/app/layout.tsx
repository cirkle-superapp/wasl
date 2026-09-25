import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, Inter, Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/wasl/theme-provider";
import { ColorThemeProvider } from "@/components/wasl/color-theme-provider";
import { LanguageProvider } from "@/components/wasl/language-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Cirkle brand fonts (from the Cirkle reference repo)
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const tajawal = Tajawal({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700"],
});

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

// Inline critical CSS to prevent FOUC (Flash of Unstyled Content).
// This ensures the page has basic styling even before the external CSS
// file loads, preventing the "raw HTML" look users see during slow loads.
const criticalCSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  html{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fdfcf9;color:#1a1a14}
  body{min-height:100vh}
  .min-h-screen{min-height:100vh}
  .flex{display:flex}
  .flex-col{flex-direction:column}
  .items-center{align-items:center}
  .justify-center{justify-content:center}
  .text-center{text-align:center}
  .text-white{color:#fff}
  .w-full{width:100%}
  .max-w-md{max-width:28rem}
  .mx-auto{margin-left:auto;margin-right:auto}
  .py-6{padding-top:1.5rem;padding-bottom:1.5rem}
  .px-6{padding-left:1.5rem;padding-right:1.5rem}
  .py-8{padding-top:2rem;padding-bottom:2rem}
  .p-7{padding:1.75rem}
  .p-1{padding:0.25rem}
  .space-y-3>*+*{margin-top:0.75rem}
  .space-y-5>*+*{margin-top:1.25rem}
  .space-y-4>*+*{margin-top:1rem}
  .space-y-2>*+*{margin-top:0.5rem}
  .space-y-1\.5>*+*{margin-top:0.375rem}
  .rounded-2xl{border-radius:1rem}
  .rounded-xl{border-radius:0.75rem}
  .rounded-lg{border-radius:0.5rem}
  .rounded-md{border-radius:0.375rem}
  .shadow-xl{box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1)}
  .border{border-width:1px;border-style:solid;border-color:#e5e0d5}
  .border-border{border-color:#e5e0d5}
  .bg-white{background:#fff}
  .bg-background{background:#fdfcf9}
  .text-foreground{color:#1a1a14}
  .text-muted-foreground{color:#6b7280}
  .text-sm{font-size:0.875rem}
  .text-xs{font-size:0.75rem}
  .text-3xl{font-size:1.875rem}
  .text-2xl{font-size:1.5rem}
  .font-bold{font-weight:700}
  .font-semibold{font-weight:600}
  .font-medium{font-weight:500}
  .tracking-tight{letter-spacing:-0.025em}
  .leading-relaxed{line-height:1.625}
  input{width:100%;padding:0.5rem 0.75rem;border:1px solid #d1ccc1;border-radius:0.375rem;font-size:0.875rem;outline:none;background:#fff}
  input:focus{border-color:#009588;box-shadow:0 0 0 2px rgba(0,149,136,0.2)}
  button{cursor:pointer;font-family:inherit}
  button[type=submit]{background:linear-gradient(135deg,#e5c98a,#9a7a3e);color:#1a1a14;font-weight:500;padding:0.5rem 1rem;border-radius:0.375rem;border:none;width:100%;font-size:0.875rem}
  button[type=button]{background:#fff;border:1px solid #c2a060;color:#9a7a3e;padding:0.5rem 1rem;border-radius:0.375rem;font-size:0.875rem}
  label{font-size:0.875rem;font-weight:500;display:block;margin-bottom:0.25rem}
  .wasl-gradient-hero-cirkle{background:linear-gradient(135deg,#1a4a5a 0%,#2a6b7e 50%,#c2a060 100%)}
  .wasl-text-gradient-cirkle{background:linear-gradient(135deg,#e5c98a,#9a7a3e);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
  [data-theme=cirkle]{--wasl-teal:#1a4a5a;--wasl-green:#009588;--wasl-teal-dark:#123843;--wasl-chat-bg:#f0ebe0;--wasl-sidebar-bg:#fdfcf9;--cirkle-steel:#2a6b7e;--cirkle-gold:#c2a060;--cirkle-rose:#c25a6e;--cirkle-charcoal:#1a1a14;--cirkle-cream:#fdfcf9;--background:#fdfcf9;--foreground:#1a1a14}
  a{color:#009588;text-decoration:none}
  .hidden{display:none}
  .gap-4{gap:1rem}
  .gap-2{gap:0.5rem}
  .gap-1\.5{gap:0.375rem}
  .mt-3{margin-top:0.75rem}
  .mb-2{margin-bottom:0.5rem}
  .relative{position:relative}
  .absolute{position:absolute}
  .inline-flex{display:inline-flex}
  .justify-center{justify-content:center}
  .items-center{align-items:center}
  .flex-1{flex:1}
  footer{padding:0.75rem 1.5rem;text-align:center;font-size:0.75rem;background:#1a4a5a;color:rgba(255,255,255,0.8)}
  svg{display:inline-block;vertical-align:middle}
  .lucide{width:1rem;height:1rem;display:inline-block;vertical-align:middle}
  .w-3{width:0.75rem}.h-3{height:0.75rem}
  .w-4{width:1rem}.h-4{height:1rem}
  .w-5{width:1.25rem}.h-5{height:1.25rem}
  .left-3{left:0.75rem}.right-3{right:0.75rem}
  .top-1\/2{top:50%}.-translate-y-1\/2{transform:translateY(-50%)}
  .pl-9{padding-left:2.25rem}.pr-9{padding-right:2.25rem}
  .text-\\[10px\\]{font-size:10px}
  .text-white\/70{color:rgba(255,255,255,0.7)}
  .text-white\/85{color:rgba(255,255,255,0.85)}
  .text-white\/80{color:rgba(255,255,255,0.8)}
  .border-t{border-top-width:1px}
  .uppercase{text-transform:uppercase}
  .gap-1{gap:0.25rem}
  .inset-0{inset:0}
  .w-full{width:100%}
  .h-9{height:2.25rem}
  .h-8{height:2rem}
  .px-3{padding-left:0.75rem;padding-right:0.75rem}
  .py-2\.5{padding-top:0.625rem;padding-bottom:0.625rem}
  .py-1{padding-top:0.25rem;padding-bottom:0.25rem}
  .py-3{padding-top:0.75rem;padding-bottom:0.75rem}
  .transition-all{transition:all 0.2s}
  .bg-muted\/50{background:rgba(0,0,0,0.03)}
  .border-border\/60{border-color:rgba(229,224,213,0.6)}
  .rounded-full{border-radius:9999px}
  .overflow-hidden{overflow:hidden}
  .shrink-0{flex-shrink:0}
  .gap-2\.5{gap:0.625rem}
  .gap-3{gap:0.75rem}
  .items-start{align-items:flex-start}
  .grid{display:grid}
  .grid-cols-2{grid-template-columns:repeat(2,1fr)}
  .text-left{text-align:left}
  .p-2\.5{padding:0.625rem}
  .p-2{padding:0.5rem}
  .border-b{border-bottom-width:1px}
  .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .min-w-0{min-width:0}
  .cursor-pointer{cursor:pointer}
  .select-none{user-select:none}
  .break-words{word-wrap:break-word}
  .whitespace-pre-wrap{white-space:pre-wrap}
  .leading-tight{line-height:1.25}
  .text-\\[11px\\]{font-size:11px}
  .font-bold{font-weight:700}
  .tracking-wide{letter-spacing:0.025em}
  .opacity-50{opacity:0.5}
  .disabled\\:opacity-50{opacity:0.5}
  .pointer-events-none{pointer-events:none}
  .cursor-not-allowed{cursor:not-allowed}
  .transition-colors{transition:color 0.2s,background-color 0.2s}
  .hover\\:text-foreground:hover{color:#1a1a14}
  .hover\\:bg-muted\\/40:hover{background:rgba(0,0,0,0.03)}
  .hover\\:bg-primary\\/90:hover{background:rgba(0,149,136,0.9)}
  .hover\\:opacity-90:hover{opacity:0.9}
  .hover\\:bg-\\[var\\(--wasl-green\\)\\]\\/10:hover{background:rgba(0,149,136,0.1)}
  .hover\\:text-\\[var\\(--wasl-green\\)\\]:hover{color:#009588}
  .hover\\:bg-\\[var\\(--wasl-green-dark\\)\\]:hover{background:#0d6e63}
  .focus\\:border-\\[var\\(--wasl-green\\)\\]\\/40:focus{border-color:rgba(0,149,136,0.4)}
  .z-10{z-index:10}
  .relative{position:relative}
  .gap-1{gap:0.25rem}
  .text-amber-500{color:#f59e0b}
  .bg-amber-500{background:#f59e0b}
  .text-\\[10px\\]{font-size:10px}
  .text-\\[11px\\]{font-size:11px}
  .text-green-500{color:#22c55e}
  .text-red-500{color:#ef4444}
  .text-blue-500{color:#3b82f6}
  .text-yellow-500{color:#eab308}
  .text-purple-500{color:#a855f7}
  .bg-red-500{background:#ef4444}
  .bg-green-500{background:#22c55e}
  .bg-blue-500{background:#3b82f6}
  .bg-yellow-500{background:#eab308}
  .bg-purple-500{background:#a855f7}
  .bg-gray-400{background:#9ca3af}
  .bg-gray-500{background:#6b7280}
  .bg-amber-400{background:#fbbf24}
  .bg-amber-500{background:#f59e0b}
  .bg-amber-600{background:#d97706}
  .text-gray-400{color:#9ca3af}
  .text-gray-500{color:#6b7280}
  .text-gray-600{color:#4b5563}
  .text-gray-700{color:#374151}
  .text-gray-800{color:#1f2937}
  .text-gray-900{color:#111827}
  .bg-gray-50{background:#f9fafb}
  .bg-gray-100{background:#f3f4f6}
  .bg-gray-200{background:#e5e7eb}
  .bg-gray-300{background:#d1d5db}
  .bg-gray-400{background:#9ca3af}
  .bg-gray-500{background:#6b7280}
  .bg-gray-600{background:#4b5563}
  .bg-gray-700{background:#374151}
  .bg-gray-800{background:#1f2937}
  .bg-gray-900{background:#111827}
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
        <style dangerouslySetInnerHTML={{ __html: criticalCSS }} />
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${inter.variable} ${tajawal.variable} antialiased bg-background text-foreground`}
      >
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
