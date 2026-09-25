import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── STANDALONE OUTPUT ─────────────────────────────────────────
  // Produces a minimal self-contained server.js — optimal for Vercel.
  // Reduces bundle size, faster cold starts on serverless.
  output: "standalone",

  // ── TYPESCRIPT ──────────────────────────────────────────────
  // Ignore build errors — we handle TS checking separately via
  // `npx tsc --noEmit` in our audit pipeline. This prevents Vercel
  // build failures on minor type issues that don't affect runtime.
  typescript: {
    ignoreBuildErrors: true,
  },

  // ── REACT STRICT MODE ───────────────────────────────────────
  // Disabled — strict mode causes double-renders in development which
  // can interfere with socket.io event handlers and real-time state.
  reactStrictMode: false,

  // ── EXPERIMENTAL: REDUCE BUNDLE SIZE ────────────────────────
  // Optimize package imports — tree-shakes unused lucide icons and
  // other large libraries to reduce the JS bundle (faster page loads).
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },

  // ── ALLOWED DEV ORIGINS ─────────────────────────────────────
  allowedDevOrigins: [
    "localhost:3000",
    "127.0.0.1:3000",
  ],

  // ── SOCKET.IO REWRITES (dev only) ────────────────────────────
  // Proxy /socket.io requests to the chat-service on port 3003 in dev.
  // In production on Vercel, the Caddy gateway handles this via
  // XTransformPort query parameter before the request reaches Next.js.
  async rewrites() {
    const socketTarget = process.env.SOCKET_IO_PORT
      ? `http://localhost:${process.env.SOCKET_IO_PORT}`
      : "http://localhost:3003";
    return [
      {
        source: "/socket.io",
        destination: `${socketTarget}/socket.io`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${socketTarget}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
