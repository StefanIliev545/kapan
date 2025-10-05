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
  productionBrowserSourceMaps: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "identicon.starknet.id", pathname: "/**" },
      { protocol: "https", hostname: "img.starkurabu.com", pathname: "/**" },
    ],
  },

  // 2) Host-based rewrites (keep these as you had them, but with catch-all in afterFiles)
  async rewrites() {
    return {
      // Only map the subdomain root early: app.kapan.finance/ → /app (internal; no URL change)
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "app.kapan.finance" }],
          destination: "/app",
        },
      ],

      // Let Next serve files/_next/api first, then internally map the rest to /app/:path*
      afterFiles: [
        {
          source: "/:path((?!app/|api/|_next/|\\.well-known/).*)",
          has: [{ type: "host", value: "app.kapan.finance" }],
          destination: "/app/:path*",
        },
      ],
    };
  },
};


module.exports = nextConfig;
