import { FC } from "react";
import Image from "next/image";
import { Position } from "./Position";

export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number;
  currentRate: number;
  tokenAddress: string;
}

interface ProtocolViewProps {
  protocolName: string;
  protocolIcon: string;
  ltv: number;
  maxLtv: number;
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
}

export const ProtocolView: FC<ProtocolViewProps> = ({
  protocolName,
  protocolIcon,
  ltv,
  maxLtv,
  suppliedPositions,
  borrowedPositions,
}) => {
  return (
    <div className="w-full p-6 space-y-8">
      {/* Protocol Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 relative">
            <Image src={protocolIcon} alt={`${protocolName} icon`} layout="fill" className="rounded-full" />
          </div>
          <div className="text-2xl font-bold">{protocolName}</div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-lg text-base-content/70">Current LTV</span>
            <span className="text-xl font-medium">{ltv}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg text-base-content/70">Max LTV</span>
            <span className="text-xl font-medium">{maxLtv}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Supplied Assets */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4 text-center">Supplied Assets</h2>
          {suppliedPositions.length > 0 ? (
            <div className="space-y-2">
              {suppliedPositions.map((position, index) => (
                <Position 
                  key={`supplied-${position.name}-${index}`} 
                  {...position} 
                  type="supply" 
                  protocolName={protocolName}
                />
              ))}
            </div>
          ) : (
            <div className="text-base-content/70 text-center p-4 bg-base-200 rounded-lg">No supplied assets</div>
          )}
        </div>

        {/* Borrowed Assets */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4 text-center">Borrowed Assets</h2>
          {borrowedPositions.length > 0 ? (
            <div className="space-y-2">
              {borrowedPositions.map((position, index) => (
                <Position 
                  key={`borrowed-${position.name}-${index}`} 
                  {...position} 
                  type="borrow" 
                  protocolName={protocolName}
                />
              ))}
            </div>
          ) : (
            <div className="text-base-content/70 text-center p-4 bg-base-200 rounded-lg">No borrowed assets</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Example usage:
export const ExampleProtocolView: FC = () => {
  const exampleSuppliedPositions: ProtocolPosition[] = [
    {
      icon: "/logos/ethereum-logo.svg",
      name: "ETH",
      balance: 5000.75,
      currentRate: 2.8,
      tokenAddress: "",
    },
  ];

  const exampleBorrowedPositions: ProtocolPosition[] = [
    {
      icon: "/logos/dai-logo.svg",
      name: "DAI",
      balance: -2500.25,
      currentRate: 4.2,
      tokenAddress: "",
    },
    {
      icon: "/logos/usd-coin-usdc-logo.svg",
      name: "USDC",
      balance: -1000.5,
      currentRate: 3.5,
      tokenAddress: "",
    },
  ];

  return (
    <ProtocolView
      protocolName="Aave V3"
      protocolIcon="/logos/aave-logo.svg"
      ltv={65}
      maxLtv={80}
      suppliedPositions={exampleSuppliedPositions}
      borrowedPositions={exampleBorrowedPositions}
    />
  );
};
