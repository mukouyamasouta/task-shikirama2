/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@shikirama/db"],
  experimental: {
    optimizePackageImports: ["@shikirama/db"],
  },
};

export default nextConfig;
