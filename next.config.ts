import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the current source-based deployment unchanged until the image is verified.
  output: process.env.EIP_CONTAINER_BUILD === "1" ? "standalone" : undefined,
  assetPrefix: process.env.NODE_ENV === "production" ? "/service/assets" : undefined,
  async rewrites() { return [
    { source: "/service/assets/_next/static/:path*", destination: "/_next/static/:path*" },
    { source: "/service/assets/brand/:path*", destination: "/brand/:path*" },
  ]; },
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
