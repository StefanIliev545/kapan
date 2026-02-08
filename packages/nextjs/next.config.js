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
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },

  experimental: {
    // Reduce webpack memory usage during builds (v15+)
    webpackMemoryOptimizations: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
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
          source: "/:path((?!app/|api/|_next/|\\.well-known/|orders/|markets/).*)",
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
          source: "/:path((?!app/|api/|_next/|\\.well-known/|orders/|markets/).*)",
          has: [{ type: "host", value: "app.localhost:3000" }],
          destination: "/app/:path*",
        },
      ],
    };
  },
};

const finalConfig = process.env.NODE_ENV === "production" ? prodConfig : devConfig;

module.exports = withBundleAnalyzer(finalConfig);
