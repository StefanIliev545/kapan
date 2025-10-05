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
      beforeFiles: [
        {
          // Handle the app subdomain root explicitly so / maps to /app without relying on catch-alls.
          source: "/",
          has: [{ type: "host", value: "app.kapan.finance" }],
          destination: "/app",
        },
        {
          // For any other request on app.kapan.finance, serve the matching /app/:path* page.
          // Skip Next internals, API routes, .well-known entries, and already-prefixed /app paths.
          source:
            "/:path((?!_next/|api/|\\.well-known/|app/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
          has: [{ type: "host", value: "app.kapan.finance" }],
          destination: "/app/:path*",
        },
      ],
    };
  },
};

module.exports = nextConfig;
