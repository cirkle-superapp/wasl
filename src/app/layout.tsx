import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/wasl/theme-provider";
import { ColorThemeProvider } from "@/components/wasl/color-theme-provider";

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
  description: "Wasl is a fast, simple and secure messaging app that connects you with the people who matter.",
  keywords: ["Wasl", "chat", "messaging", "real-time", "WhatsApp-like", "commit"],
  authors: [{ name: "Wasl" }],
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
    title: "Wasl",
    description: "Simple. Secure. Connected.",
    siteName: "Wasl",
    type: "website",
  },
};

// Inline script to apply the saved color theme BEFORE hydration, preventing
// a flash of the default theme. Defaults to Cirkle (gold/teal/cream) when no
// preference is stored, so the app loads with the Cirkle brand colors by default.
const colorThemeScript = `(function(){try{var t=localStorage.getItem('wasl-color-theme');if(t==='wasl'){document.documentElement.removeAttribute('data-theme');}else{document.documentElement.setAttribute('data-theme','cirkle');}}catch(e){document.documentElement.setAttribute('data-theme','cirkle');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
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
            {children}
            <Toaster position="top-center" richColors />
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
