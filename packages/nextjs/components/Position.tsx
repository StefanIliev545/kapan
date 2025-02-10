import { FC, useState } from "react";
import Image from "next/image";
import { MovePositionModal } from "./modals/MovePositionModal";

interface PositionProps {
  icon: string;
  name: string;
  balance: number;
  currentRate: number;
  optimalRate: number;
  type: "supply" | "borrow";
  protocolName: string;  // Add this to know which protocol the position belongs to
}

export const Position: FC<PositionProps> = ({ 
  icon, 
  name, 
  balance, 
  currentRate, 
  optimalRate, 
  type,
  protocolName,
}) => {
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  // Format number with consistent locale
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
  };

  return (
    <>
      <div
        className={`grid grid-cols-6 items-center w-full p-4 rounded-lg gap-4 ${
          type === "supply" ? "bg-base-200" : "bg-base-200/50"
        }`}
      >
        {/* Icon and Name Section */}
        <div className="flex items-center space-x-3 col-span-1">
          <div className="w-8 h-8 relative">
            <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
          </div>
          <span className="font-semibold text-lg">{name}</span>
        </div>

        {/* Balance Section */}
        <div className="text-center col-span-1">
          <div className="text-sm text-base-content/70">Balance</div>
          <div className={`font-medium ${type === "supply" ? "text-green-500" : "text-red-500"}`}>
            {type === "supply" ? "" : "-"}${formatNumber(Math.abs(balance))}
          </div>
        </div>

        {/* Current Rate Section */}
        <div className="text-center col-span-1">
          <div className="text-sm text-base-content/70">Current Rate</div>
          <div className="font-medium">{currentRate.toFixed(2)}%</div>
        </div>

        {/* Optimal Rate Section */}
        <div className="text-center col-span-1">
          <div className="text-sm text-base-content/70">Optimal Rate</div>
          <div className="font-medium">{optimalRate.toFixed(2)}%</div>
        </div>

        {/* New Move button column */}
        <div className="text-center col-span-1">
          <button 
            className="btn btn-sm btn-outline" 
            onClick={() => setIsMoveModalOpen(true)}
          >
            Move
          </button>
        </div>
      </div>

      <MovePositionModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        fromProtocol={protocolName}
        position={{ name, balance, type }}
      />
    </>
  );
};

// Example usage:
export const ExamplePosition: FC = () => {
  return (
    <Position
      icon="/logos/usdc-coin-usdc-logo.svg" // You'll need to add actual token icons
      name="USDC"
      balance={1000.5}
      currentRate={3.5}
      optimalRate={4.2}
      type="supply"
      protocolName="Aave V3"
    />
  );
};

