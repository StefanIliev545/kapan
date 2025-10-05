// @ts-check

/**
 * Common, prod and dev configs are defined separately to keep Vercel from
 * conflating different host rules. We export exactly one based on NODE_ENV.
 */

/** @type {import('next').NextConfig} */
const commonConfig = {
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
};

/** @type {import('next').NextConfig} */
const prodConfig = {
  ...commonConfig,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", key: "host", value: "app.kapan.finance" }],
          destination: "/app",
        },
      ],
      afterFiles: [
        {
          source: "/:path((?!app/|api/|_next/|\\.well-known/).*)",
          has: [{ type: "host", key: "host", value: "app.kapan.finance" }],
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
          has: [{ type: "host", key: "host", value: "app.localhost:3000" }],
          destination: "/app",
        },
      ],
      afterFiles: [
        {
          source: "/:path((?!app/|api/|_next/|\\.well-known/).*)",
          has: [{ type: "host", key: "host", value: "app.localhost:3000" }],
          destination: "/app/:path*",
        },
      ],
    };
  },
};

const finalConfig = process.env.NODE_ENV === "production" ? prodConfig : devConfig;

module.exports = finalConfig;
