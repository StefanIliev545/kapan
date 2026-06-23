// @ts-check

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/**
 * Common, prod and dev configs are defined separately to keep Vercel from
 * conflating different host rules. We export exactly one based on NODE_ENV.
 */

/** @type {import('next').NextConfig} */
const commonConfig = {
  reactStrictMode: true,
  // reactCompiler disabled: incompatible with styled-jsx (causes hydration mismatch)
  // See: https://github.com/vercel/next.js/issues/65995
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  // NOTE: the `eslint` config key was removed — Next 16 no longer supports it (it logged an
  // "Unrecognized key" warning). Lint runs via `yarn lint`, not the build.

  experimental: {
    // Reduce webpack memory usage during builds (v15+)
    webpackMemoryOptimizations: true,
    // Per-icon barrel-file optimization — prevents parsing the whole icon set
    // for every import site. Big build-memory savings when these libs are used widely.
    optimizePackageImports: [
      "lucide-react",
      "@heroicons/react/24/outline",
      "@heroicons/react/24/solid",
      "@heroicons/react/20/solid",
      "@radix-ui/themes",
      "@tanstack/react-table",
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Build-memory: serialize module compilation instead of N workers in parallel.
    // Tradeoff: slightly slower build, much lower peak RAM. Required to fit Vercel's 8GB cap.
    config.parallelism = 1;
    return config;
  },
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "identicon.starknet.id", pathname: "/**" },
      { protocol: "https", hostname: "img.starkurabu.com", pathname: "/**" },
      // 1inch token images come from various sources
      { protocol: "https", hostname: "tokens-data.1inch.io", pathname: "/**" },
      { protocol: "https", hostname: "tokens.1inch.io", pathname: "/**" },
      { protocol: "https", hostname: "s2.coinmarketcap.com", pathname: "/**" },
      { protocol: "https", hostname: "assets.coingecko.com", pathname: "/**" },
      { protocol: "https", hostname: "asset-images.messari.io", pathname: "/**" },
      { protocol: "https", hostname: "cdn.ondo.finance", pathname: "/**" },
      { protocol: "https", hostname: "raw.githubusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "xstocks-metadata.backed.fi", pathname: "/**" },
    ],
  },
};

/** @type {import('next').NextConfig} */
const prodConfig = {
  ...commonConfig,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "app.kapan.finance" }],
          destination: "/app",
        },
      ],
      afterFiles: [
        {
          source: "/:path((?!app/|api/|_next/|\\.well-known/|orders/|markets/|rates/).*)",
          has: [{ type: "host", value: "app.kapan.finance" }],
          destination: "/app/:path*",
        },
      ],
    };
  },
};

/** @type {import('next').NextConfig} */
const devConfig = {
  ...commonConfig,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "app.localhost:3000" }],
          destination: "/app",
        },
      ],
      afterFiles: [
        {
          source: "/:path((?!app/|api/|_next/|\\.well-known/|orders/|markets/|rates/).*)",
          has: [{ type: "host", value: "app.localhost:3000" }],
          destination: "/app/:path*",
        },
      ],
    };
  },
};

const finalConfig = process.env.NODE_ENV === "production" ? prodConfig : devConfig;

module.exports = withBundleAnalyzer(finalConfig);
