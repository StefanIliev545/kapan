import "@rainbow-me/rainbowkit/styles.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import "@radix-ui/themes/styles.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { QueryProvider } from "~~/app/providers/QueryProvider";
import { RedactedAnalytics } from "~~/components/RedactedAnalytics";

const baseMetadata = getMetadata({
  title: "Kapan Finance | Manage Your DeFi Positions",
  description:
    "View, compare, and manage your lending and borrowing positions across Aave, Compound, Morpho, and Venus — on Arbitrum, Base, Ethereum and more. See the best rates and act on them in one place.",
});

export const metadata: Metadata = {
  ...baseMetadata,
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
  display: "swap",
});

// Static object for dangerouslySetInnerHTML to avoid creating new object on each render
const themeScript = {
  __html: `
    (function() {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'kapan');
    })();
  `,
};

// NOTE: this layout must stay free of dynamic functions (headers()/cookies()) — using them here
// opts EVERY route into per-request dynamic rendering, which blocks SSG/ISR for the programmatic
// /rates pages. Host detection now happens client-side in ScaffoldEthAppWithProviders.
const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning data-theme="kapan" className="dark">
      <head>
        {/* Preconnect to external APIs - saves 100-300ms per connection */}
        <link rel="preconnect" href="https://blue-api.morpho.org" />
        <link rel="preconnect" href="https://api.coingecko.com" />
        <link rel="preconnect" href="https://api.1inch.io" />
        <link rel="preconnect" href="https://api-v2.pendle.finance" />
        <link rel="preconnect" href="https://yields.llama.fi" />
        <link rel="dns-prefetch" href="https://blue-api.morpho.org" />
        <link rel="dns-prefetch" href="https://api.coingecko.com" />
        <link rel="dns-prefetch" href="https://api.1inch.io" />
        
        {/* Inline script to ensure kapan theme is always applied */}
        <script dangerouslySetInnerHTML={themeScript} />
      </head>
      <body className={`${inter.className}`}>
        <ThemeProvider>
          <QueryProvider>
            <ScaffoldEthAppWithProviders>
              {children}
            </ScaffoldEthAppWithProviders>
          </QueryProvider>
        </ThemeProvider>
        <SpeedInsights />
        <RedactedAnalytics />
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
