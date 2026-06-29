import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deployed on Vercel (Next-native build). The engine lives in src/engine
  // (framework-free) so it can be reused outside the web app.
  async redirects() {
    // /admin was the old operator-console URL; the tool is now the user-facing /audit.
    return [{ source: "/admin", destination: "/audit", permanent: true }];
  },
  turbopack: {
    resolveAlias: {
      // The Midnight indexer provider imports a named `WebSocket` from isomorphic-ws,
      // which its browser build doesn't expose. Point it at a shim over the native one.
      "isomorphic-ws": "./src/midnight/ws-shim.js",
    },
  },
};

export default nextConfig;
