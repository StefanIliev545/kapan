import "@rainbow-me/rainbowkit/styles.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Metadata } from "next";
import { Inter } from "next/font/google";
import { Theme } from "@radix-ui/themes";
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
  weight: ["400", "500", "600", "700"],
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body className={`${inter.className}`}>
        <ThemeProvider>
          <QueryProvider>
            <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
          </QueryProvider>
        </ThemeProvider>
        <SpeedInsights />
        <RedactedAnalytics />
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
