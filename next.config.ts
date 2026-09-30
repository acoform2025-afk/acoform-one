import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run as a normal Node package on the server
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
  webpack: (config, { isServer }) => {
    // the DWG reader (LibreDWG WebAssembly) runs in the browser; its Node-only branches are never used there
    if (!isServer) config.resolve.fallback = { ...(config.resolve.fallback ?? {}), module: false, fs: false, path: false, url: false, crypto: false };
    return config;
  },
};

export default nextConfig;
