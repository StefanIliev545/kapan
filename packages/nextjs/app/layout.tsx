import "@rainbow-me/rainbowkit/styles.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import "@radix-ui/themes/styles.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { QueryProvider } from "~~/app/providers/QueryProvider";
import { RedactedAnalytics } from "~~/components/RedactedAnalytics";

const baseMetadata = getMetadata({
  title: "Kapan Finance | DeFi Lending Aggregator",
  description: "Optimize your DeFi APY rates by transferring your debt between protocols",
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

const ScaffoldEthApp = async ({ children }: { children: React.ReactNode }) => {
  const headersList = await headers();
  const initialHost = headersList.get("host");

  return (
    <html suppressHydrationWarning data-theme="kapan" className="dark">
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
            <ScaffoldEthAppWithProviders initialHost={initialHost}>
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
