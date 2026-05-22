import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@codeforge/shared'],
  // Required for multi-stage Docker builds: produces .next/standalone/
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
