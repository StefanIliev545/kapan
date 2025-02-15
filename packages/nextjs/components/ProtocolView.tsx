import { FC, useState, useMemo } from "react";
import Image from "next/image";
import { Position } from "./Position";

export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number;
  currentRate: number;
  tokenAddress: string;
  collateralView?: React.ReactNode;
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
  const [showAll, setShowAll] = useState(false);

  // Calculate net balance.
  const netBalance = useMemo(() => {
    const totalSupplied = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);
    const totalBorrowed = borrowedPositions.reduce((acc, pos) => acc + Math.abs(pos.balance), 0);
    return totalSupplied - totalBorrowed;
  }, [suppliedPositions, borrowedPositions]);

  // Format currency with sign.
  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
    return amount >= 0 ? formatted : `-${formatted}`;
  };

  // Filter positions based on showAll toggle.
  const filteredSuppliedPositions = showAll
    ? suppliedPositions
    : suppliedPositions.filter((p) => p.balance > 0);
  const filteredBorrowedPositions = showAll
    ? borrowedPositions
    : borrowedPositions.filter((p) => p.balance < 0);

  // Assuming tokenNameToLogo is defined elsewhere, we use a fallback here.
  const getProtocolLogo = (protocol: string) => `/logos/${protocol.toLowerCase()}-logo.svg`;

  return (
    <div className="w-full h-full flex flex-col hide-scrollbar p-6 space-y-8">
      {/* Protocol Header Card */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 relative">
                <Image
                  src={protocolIcon}
                  alt={`${protocolName} icon`}
                  layout="fill"
                  className="rounded-full"
                />
              </div>
              <div className="flex flex-col">
                <div className="text-2xl font-bold">{protocolName}</div>
                <div className="text-base-content/70">
                  Balance: {formatCurrency(netBalance)}
                </div>
              </div>
            </div>

            {/* Show All Toggle */}
            <div className="flex items-center gap-2 order-last md:order-none">
              <span className="text-sm text-base-content/70">Show all</span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
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
        </div>
      </div>

      {/* Positions Container: Flex that stacks vertically on small screens and side-by-side on xl */}
      <div className="flex flex-col xl:flex-row gap-8">
        {/* Supplied Assets */}
        <div className="flex-1">
          <div className="card bg-base-100 shadow-xl h-full">
            <div className="card-body">
              <h2 className="card-title justify-center">Supplied Assets</h2>
              {filteredSuppliedPositions.length > 0 ? (
                <div className="space-y-2">
                  {filteredSuppliedPositions.map((position, index) => (
                    // Wrap each Position in a container with a fixed min-height.
                    <div key={`supplied-${position.name}-${index}`} className="min-h-[80px]">
                      <Position
                        {...position}
                        type="supply"
                        protocolName={protocolName}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-base-content/70 text-center p-4 bg-base-200 rounded-lg">
                  {showAll ? "No available assets" : "No supplied assets"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Borrowed Assets */}
        <div className="flex-1">
          <div className="card bg-base-100 shadow-xl h-full">
            <div className="card-body">
              <h2 className="card-title justify-center">Borrowed Assets</h2>
              {filteredBorrowedPositions.length > 0 ? (
                <div className="space-y-2">
                  {filteredBorrowedPositions.map((position, index) => (
                    // Wrap each Position in a container with the same min-height.
                    <div key={`borrowed-${position.name}-${index}`} className="min-h-[80px]">
                      <Position
                        {...position}
                        type="borrow"
                        protocolName={protocolName}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-base-content/70 text-center p-4 bg-base-200 rounded-lg">
                  {showAll ? "No available assets" : "No borrowed assets"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
