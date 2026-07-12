import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/PDF-Editor" : "",
  experimental: {
    lockDistDir: false,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/PDF-Editor" : "",
  },
};

export default nextConfig;
