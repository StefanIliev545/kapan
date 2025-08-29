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
  // Allow toggling SWC minification by env (default on for Next 15)
  swcMinify: process.env.SWC_MINIFY !== "false",
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
};

module.exports = nextConfig;
