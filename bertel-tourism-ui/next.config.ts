import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [],
  // Resolve existing src-based imports
  experimental: {
    // Turbopack is default in Next.js 16
  },
};

export default nextConfig;
