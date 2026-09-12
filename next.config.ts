import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the preview proxy to load chunks cross-origin.
  // The ChunkLoadError happens because Turbopack rejects chunk requests
  // from the preview proxy domain (preview-*.space-z.ai).
  allowedDevOrigins: [
    "preview-chat-88a019e4-c6f8-4893-a2a0-a85489b1bb49.space-z.ai",
    "*.space-z.ai",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
  // Proxy /socket.io requests to the chat-service on port 3003 in dev mode.
  // In production, Caddy (port 81) handles this via the XTransformPort query
  // parameter before the request reaches Next.js. But in local dev (browser →
  // port 3000), Next.js needs to forward these requests itself, otherwise
  // socket.io polling returns 404 and the real-time features (typing, presence,
  // instant message delivery) break.
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
