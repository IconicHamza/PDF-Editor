import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/PDF-Editor",
  experimental: {
    lockDistDir: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
