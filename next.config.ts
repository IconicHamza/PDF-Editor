import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  experimental: {
    lockDistDir: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
