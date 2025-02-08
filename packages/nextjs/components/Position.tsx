import { FC } from "react";
import Image from "next/image";

interface PositionProps {
  icon: string;
  name: string;
  balance: number;
  currentRate: number;
  optimalRate: number;
}

export const Position: FC<PositionProps> = ({ icon, name, balance, currentRate, optimalRate }) => {
  // Format number with consistent locale
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
  };

  return (
    <div className="grid grid-cols-5 items-center w-full p-4 bg-base-200 rounded-lg gap-4">
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
        <div className={`font-medium ${balance >= 0 ? "text-green-500" : "text-red-500"}`}>
          {balance >= 0 ? "+" : "-"}${formatNumber(balance)}
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
    </div>
  );
};

// Example usage:
export const ExamplePosition: FC = () => {
  return (
    <Position
      icon="/logos/usdc-coin-usdc-logo.svg" // You'll need to add actual token icons
      name="USDC"
      balance={1000.50}
      currentRate={3.5}
      optimalRate={4.2}
    />
  );
};
