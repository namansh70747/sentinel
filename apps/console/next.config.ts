import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: [
    "@sentinel/contracts",
    "@sentinel/db",
    "@sentinel/auth",
    "@sentinel/engine",
    "@sentinel/policy",
    "@sentinel/fixtures",
    "@sentinel/connectors",
  ],
};

export default nextConfig;
