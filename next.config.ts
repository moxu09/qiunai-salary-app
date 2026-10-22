import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the current source-based deployment unchanged until the image is verified.
  output: process.env.EIP_CONTAINER_BUILD === "1" ? "standalone" : undefined,
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
