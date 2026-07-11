import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/PDF-Editor",  // <--- Change this line!
  experimental: {
    lockDistDir: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
