import Image from "next/image";
import { FC } from "react";

interface RatePillProps {
  label: string;
  rate: string;
  networkType: "evm" | "starknet";
  protocol: "aave" | "nostra" | "venus" | "vesu";
}

const networkIcons: Record<"evm" | "starknet", string> = {
  evm: "/logos/arb.svg",
  starknet: "/logos/starknet.svg",
};

const protocolIcons: Record<"aave" | "nostra" | "venus" | "vesu", string> = {
  aave: "/logos/aave.svg",
  nostra: "/logos/nostra.svg",
  venus: "/logos/venus.svg",
  vesu: "/logos/vesu.svg",
};

export const RatePill: FC<RatePillProps> = ({ label, rate, networkType, protocol }) => {
  const color = label === "supply" ? "bg-success text-success-content" : "bg-warning text-warning-content";
  return (
    <div className="flex items-center rounded-full border border-base-300 text-xs overflow-hidden bg-base-100">
      <span className={`px-2 ${color}`}>{label}</span>
      <span className="px-2 flex items-center gap-1">
        {rate}
        <Image src={networkIcons[networkType]} alt={networkType} width={12} height={12} />
        <Image src={protocolIcons[protocol]} alt={protocol} width={12} height={12} />
      </span>
    </div>
  );
};

export default RatePill;
