import type { Metadata } from "next";
import AboutPageContent from "./AboutPageContent";

export const metadata: Metadata = {
  title: "About | Kapan Finance",
  description: "The middlelayer for DeFi. One interface. Every protocol. Every action.",
};

export default function AboutPage() {
  return <AboutPageContent />;
}
