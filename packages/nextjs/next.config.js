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

  // 1) Canonical redirects
  async redirects() {
    const PROD = process.env.NODE_ENV === "production";

    return [
      // A) On the apex, send /app → app subdomain (keeps a single canonical host for the app)
      {
        source: "/app",
        has: [{ type: "host", key: "host", value: "kapan.finance" }],
        destination: "https://app.kapan.finance",
        permanent: PROD, // 308 in prod, 307 in dev/preview
      },
      {
        source: "/app/:path*",
        has: [{ type: "host", key: "host", value: "kapan.finance" }],
        destination: "https://app.kapan.finance/:path*",
        permanent: PROD,
      },

      // B) On the subdomain, strip the /app prefix so URLs stay clean (no /app in the path)
      {
        source: "/app",
        has: [{ type: "host", key: "host", value: "app.kapan.finance" }],
        destination: "/",
        permanent: PROD,
      },
      {
        source: "/app/:path*",
        has: [{ type: "host", key: "host", value: "app.kapan.finance" }],
        destination: "/:path*",
        permanent: PROD,
      },

      // --- Optional: local-dev convenience (see notes below) ---
      // Add these if you want to test with app.localhost/kapan.localhost at :3000
      ...(process.env.NODE_ENV === "development"
        ? [
            {
              source: "/app",
              has: [{ type: "host", key: "host", value: "kapan.localhost:3000" }],
              destination: "http://app.localhost:3000",
              permanent: false,
            },
            {
              source: "/app/:path*",
              has: [{ type: "host", key: "host", value: "kapan.localhost:3000" }],
              destination: "http://app.localhost:3000/:path*",
              permanent: false,
            },
            {
              source: "/app",
              has: [{ type: "host", key: "host", value: "app.localhost:3000" }],
              destination: "/",
              permanent: false,
            },
            {
              source: "/app/:path*",
              has: [{ type: "host", key: "host", value: "app.localhost:3000" }],
              destination: "/:path*",
              permanent: false,
            },
          ]
        : []),
    ];
  },

  // 2) Host-based rewrites (keep these as you had them, but with catch-all in afterFiles)
  async rewrites() {
    return {
      // Only map the subdomain root early: app.kapan.finance/ → /app (internal; no URL change)
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", key: "host", value: "app.kapan.finance" }],
          destination: "/app",
        },
        // Optional dev mirror for app.localhost:3000
        ...(process.env.NODE_ENV === "development"
          ? [
              {
                source: "/",
                has: [{ type: "host", key: "host", value: "app.localhost:3000" }],
                destination: "/app",
              },
            ]
          : []),
      ],

      // Let Next serve files/_next/api first, then internally map the rest to /app/:path*
      afterFiles: [
        {
          source: "/:path((?!app/|api/|_next/|\\.well-known/).*)",
          has: [{ type: "host", key: "host", value: "app.kapan.finance" }],
          destination: "/app/:path*",
        },
        // Optional dev mirror for app.localhost:3000
        ...(process.env.NODE_ENV === "development"
          ? [
              {
                source: "/:path((?!app/|api/|_next/|\\.well-known/).*)",
                has: [{ type: "host", key: "host", value: "app.localhost:3000" }],
                destination: "/app/:path*",
              },
            ]
          : []),
      ],
    };
  },
};


module.exports = nextConfig;
