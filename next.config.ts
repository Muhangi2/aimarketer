import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Office scene files are read from disk at runtime, so ship them with these routes
  outputFileTracingIncludes: {
    "/": ["./office-studio/**/*"],
    "/dashboard": ["./office-studio/**/*"],
    "/api/office-studio/[office]/[seat]/[frame]": ["./office-studio/**/*"],
  },
  // Landing page photos
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
