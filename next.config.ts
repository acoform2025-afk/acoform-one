import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run as a normal Node package on the server
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
};

export default nextConfig;
