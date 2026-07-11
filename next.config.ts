import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/pdf-suite", // <-- ADD THIS LINE (use your exact repo name)
  experimental: {
    lockDistDir: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
