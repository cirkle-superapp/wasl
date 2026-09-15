import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Wasl — Simple. Secure. Connected.",
  description: "Wasl is a fast, simple and secure messaging app that connects you with the people who matter. End-to-end encrypted, real-time messaging with verified agreements.",
  keywords: ["Wasl", "Cirkle", "chat", "messaging", "real-time", "secure", "encrypted", "commit", "agreements", "business"],
  authors: [{ name: "Wasl" }],
  creator: "Cirkle",
  publisher: "Cirkle",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#009588" },
    { media: "(prefers-color-scheme: dark)", color: "#1a4a5a" },
  ],
};

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
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
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
              <Toaster position="top-center" richColors />
            </LanguageProvider>
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
