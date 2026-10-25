import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Office scene files are read from disk at runtime, so ship them with these routes
  outputFileTracingIncludes: {
    "/dashboard": ["./office-studio/**/*"],
    "/api/office-studio/[office]/[seat]/[frame]": ["./office-studio/**/*"],
  },
};

export default nextConfig;
