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
};

export default nextConfig;
