import type { Metadata } from "next";
import ContractsPageContent from "./ContractsPageContent";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata: Metadata = getMetadata({
  title: "Deployed Contracts — Kapan Finance",
  description:
    "Kapan Finance smart-contract addresses by network — KapanRouter and protocol gateways across Arbitrum, Base, Ethereum, Optimism, Linea and more.",
  canonicalPath: "/contracts",
});

export default function ContractsPage() {
  return <ContractsPageContent />;
}
