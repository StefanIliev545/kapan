// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  // Improve build-time debuggability
  productionBrowserSourceMaps: true,
  webpack: config => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  images: {
    remotePatterns: [
      // External image source for StarkNet ID identicons
      {
        protocol: "https",
        hostname: "identicon.starknet.id",
        pathname: "/**", // Allows all paths under this domain
      },
      // External image source for images hosted on Starkurabu
      {
        protocol: "https",
        hostname: "img.starkurabu.com",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return {
      // Handle ONLY the subdomain root early:
      // app.kapan.finance/  →  /app
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: 'app.kapan.finance' }],
          destination: '/app',
        },
      ],
      // Let Next serve real files first (public/, _next/static/, etc.),
      // then rewrite everything else on the subdomain to /app/:path*
      afterFiles: [
        {
          source: '/:path((?!_next/|api/|\\.well-known/|app/).*)',
          has: [{ type: 'host', value: 'app.kapan.finance' }],
          destination: '/app/:path*',
        },
      ],
      // no fallback rules needed
    };
  },
};

module.exports = nextConfig;
