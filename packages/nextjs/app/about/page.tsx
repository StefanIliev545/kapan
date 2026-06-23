import type { Metadata } from "next";
import AboutPageContent from "./AboutPageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata: Metadata = getMetadata({
  title: "About Kapan Finance — The Middlelayer for DeFi",
  description: "The middlelayer for DeFi. One interface, every protocol, every action.",
  canonicalPath: "/about",
});

export default function AboutPage() {
  return <AboutPageContent />;
}
