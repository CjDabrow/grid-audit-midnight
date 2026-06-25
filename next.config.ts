import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone Midnight auditor. Engine lives in src/engine (framework-free) so it
  // ports into the Grid Audit platform (src/services/agents) later.
  output: "standalone", // lean self-contained server for the Docker image
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
