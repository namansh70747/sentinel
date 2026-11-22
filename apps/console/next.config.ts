import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: process.env.SENTINEL_ISOLATED_TEST_BUILD === 'true' ? '.next-test' : '.next',
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
