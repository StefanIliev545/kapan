import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Metadata } from "next";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

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

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
