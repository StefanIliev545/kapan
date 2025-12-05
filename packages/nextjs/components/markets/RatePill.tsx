import { FC } from "react";
import Image from "next/image";

interface RatePillProps {
  variant: "supply" | "borrow";
  label: string;
  rate: string;
  networkType: "evm" | "starknet";
  protocol: "aave" | "nostra" | "venus" | "vesu" | "compound";
  showIcons?: boolean;
}

const protocolIcons: Record<"aave" | "nostra" | "venus" | "vesu" | "compound", string> = {
  aave: "/logos/aave.svg",
  nostra: "/logos/nostra.svg",
  venus: "/logos/venus.svg",
  vesu: "/logos/vesu.svg",
  compound: "/logos/compound.svg",
};

export const RatePill: FC<RatePillProps> = ({ variant, rate, protocol, showIcons = true }) => {
  const isSupply = variant === "supply";
  
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Label */}
      <span className="text-[9px] uppercase tracking-widest text-base-content/35 font-medium">
        {isSupply ? "Best Supply" : "Best Borrow"}
      </span>
      
      {/* Rate with protocol icon */}
      <div className="flex items-center gap-1.5">
        <span className={`text-lg font-mono font-bold tabular-nums tracking-tight ${
          isSupply ? "text-success" : "text-error"
        }`}>
          {rate}
        </span>
        {showIcons && (
          <div className="w-4 h-4 relative opacity-60">
            <Image src={protocolIcons[protocol]} alt={protocol} fill className="object-contain rounded" />
          </div>
        )}
      </div>
    </div>
  );
};

export default RatePill;
