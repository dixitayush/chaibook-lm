import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  serverExternalPackages: ["postgres", "unpdf", "sharp", "mem0ai", "@modelcontextprotocol/sdk", "redis"],
};

export default nextConfig;
