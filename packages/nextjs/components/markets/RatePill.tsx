import { FC } from "react";
import Image from "next/image";

interface RatePillProps {
  variant: "supply" | "borrow";
  label: string;
  rate: string;
  networkType: "evm" | "starknet";
  protocol: "aave" | "nostra" | "venus" | "vesu" | "compound";
  showIcons?: boolean;
  poolName?: string;
}

const protocolIcons: Record<"aave" | "nostra" | "venus" | "vesu" | "compound", string> = {
  aave: "/logos/aave.svg",
  nostra: "/logos/nostra.svg",
  venus: "/logos/venus.svg",
  vesu: "/logos/vesu.svg",
  compound: "/logos/compound.svg",
};

export const RatePill: FC<RatePillProps> = ({ variant, rate, protocol, showIcons = true, poolName }) => {
  const isSupply = variant === "supply";

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Label */}
      <span className="text-base-content/35 text-[9px] font-medium uppercase tracking-widest">
        {isSupply ? "Best Supply" : "Best Borrow"}
      </span>
      
      {/* Rate with protocol icon */}
      <div className="flex items-center gap-1.5">
        <span className={`font-mono text-lg font-bold tabular-nums tracking-tight ${
          isSupply ? "text-success" : "text-error"
        }`}>
          {rate}
        </span>
        {showIcons && (
          <div className="relative size-4 opacity-60">
            <Image src={protocolIcons[protocol]} alt={protocol} fill className="rounded object-contain" />
          </div>
        )}
      </div>
      {poolName && (
        <span className="text-base-content/50 text-[10px] leading-none">{poolName}</span>
      )}
    </div>
  );
};

export default RatePill;
