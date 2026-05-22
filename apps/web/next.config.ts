import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@codeforge/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
