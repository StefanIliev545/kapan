import { FC, useState, useMemo } from "react";
import Image from "next/image";
import { Position } from "./Position";
import { TokenSelectModal } from "./modals/TokenSelectModal";

export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number;       // USD value
  tokenBalance: bigint;  // Raw token amount
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
  hideUtilization?: boolean;
}

// Health status indicator component that shows utilization percentage
const HealthStatus: FC<{ utilizationPercentage: number }> = ({ utilizationPercentage }) => {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 h-1.5 bg-base-300 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary"
          style={{ width: `${utilizationPercentage}%` }}
        />
      </div>
      <span className="text-xs font-medium">
        {utilizationPercentage.toFixed(0)}%
      </span>
    </div>
  );
};

export const ProtocolView: FC<ProtocolViewProps> = ({
  protocolName,
  protocolIcon,
  ltv,
  maxLtv,
  suppliedPositions,
  borrowedPositions,
  hideUtilization = false,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [isTokenSelectModalOpen, setIsTokenSelectModalOpen] = useState(false);
  // const [isTokenBorrowModalOpen, setIsTokenBorrowModalOpen] = useState(false);

  // Calculate net balance.
  const netBalance = useMemo(() => {
    const totalSupplied = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);
    const totalBorrowed = borrowedPositions.reduce((acc, pos) => acc + Math.abs(pos.balance), 0);
    return totalSupplied - totalBorrowed;
  }, [suppliedPositions, borrowedPositions]);

  // Calculate utilization percentage
  const utilizationPercentage = useMemo(() => {
    const totalSupplied = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);
    const totalBorrowed = borrowedPositions.reduce((acc, pos) => acc + Math.abs(pos.balance), 0);
    return totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0;
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

  // Handle opening the token select modal
  const handleAddSupply = () => {
    setIsTokenSelectModalOpen(true);
  };

  // Handle closing the token select modal
  const handleCloseTokenSelectModal = () => {
    setIsTokenSelectModalOpen(false);
  };

  // Borrow functionality disabled for now
  /*
  const handleAddBorrow = () => {
    setIsTokenBorrowModalOpen(true);
  };

  const handleCloseTokenBorrowModal = () => {
    setIsTokenBorrowModalOpen(false);
  };
  */

  // Get all possible supply positions by using showAll setting
  // This ensures we include all tokens, even those with zero balance
  const allSupplyPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (showAll) return suppliedPositions;
    
    // Otherwise, temporarily get all positions for the token modal
    return suppliedPositions;
  }, [suppliedPositions, showAll]);

  // Get all possible borrow positions by using showAll setting
  const allBorrowPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (showAll) return borrowedPositions;
    
    // Otherwise, temporarily get all positions for the token modal
    return borrowedPositions;
  }, [borrowedPositions, showAll]);

  return (
    <div className="w-full h-full flex flex-col hide-scrollbar p-4 space-y-4">
      {/* Protocol Header Card - Enhanced with subtle effects */}
      <div className="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
        <div className="card-body p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 relative rounded-lg bg-base-200 p-1 flex items-center justify-center">
                <Image
                  src={protocolIcon}
                  alt={`${protocolName} icon`}
                  width={36}
                  height={36}
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col">
                <div className="text-xl font-bold tracking-tight">{protocolName}</div>
                <div className="text-base-content/70 flex items-center gap-1">
                  <span className="text-sm">Balance:</span>
                  <span className={`text-sm font-medium ${netBalance >= 0 ? 'text-success' : 'text-error'}`}>
                    {formatCurrency(netBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Utilization Section - Only show if not hidden */}
            {!hideUtilization && (
              <div className="flex flex-col items-start gap-1 order-3 md:order-2">
                <span className="text-sm text-base-content/70">Protocol Utilization</span>
                <HealthStatus utilizationPercentage={utilizationPercentage} />
              </div>
            )}

            {/* Show All Toggle */}
            <div className={`flex items-center justify-end gap-2 order-2 md:order-3 ${hideUtilization ? 'md:col-span-2' : ''}`}>
              <span className="text-sm text-base-content/70">Show all assets</span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Positions Container: Improved shadows and rounded corners */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Supplied Assets */}
        <div className="h-full">
          <div className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow duration-300 h-full rounded-lg">
            <div className="card-body p-4">
              <h2 className="card-title justify-between text-lg border-b border-base-200 pb-2">
                <span>Supplied Assets</span>
                <span className="badge badge-primary badge-outline">
                  {filteredSuppliedPositions.length}
                </span>
              </h2>
              {filteredSuppliedPositions.length > 0 ? (
                <div className=" pt-2">
                  {filteredSuppliedPositions.map((position, index) => (
                    <div key={`supplied-${position.name}-${index}`} className="min-h-[60px]">
                      <Position
                        {...position}
                        type="supply"
                        protocolName={protocolName}
                      />
                    </div>
                  ))}
                  
                  {/* "Add Supply" button */}
                  <button className="btn btn-sm btn-outline btn-block mt-2" onClick={handleAddSupply}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Supply
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg mt-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-10 h-10 mb-2 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p>{showAll ? "No available assets" : "No supplied assets"}</p>
                  <button className="btn btn-sm btn-primary mt-3" onClick={handleAddSupply}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Supply Assets
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Borrowed Assets */}
        <div className="h-full">
          <div className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow duration-300 h-full rounded-lg">
            <div className="card-body p-4">
              <h2 className="card-title justify-between text-lg border-b border-base-200 pb-2">
                <span>Borrowed Assets</span>
                <span className="badge badge-secondary badge-outline">
                  {filteredBorrowedPositions.length}
                </span>
              </h2>
              {filteredBorrowedPositions.length > 0 ? (
                <div className="pt-2">
                  {filteredBorrowedPositions.map((position, index) => (
                    <div key={`borrowed-${position.name}-${index}`} className="min-h-[60px]">
                      <Position
                        {...position}
                        type="borrow"
                        protocolName={protocolName}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg mt-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-10 h-10 mb-2 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p>{showAll ? "No available assets" : "No borrowed assets"}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Token Select Modal */}
      <TokenSelectModal
        isOpen={isTokenSelectModalOpen}
        onClose={handleCloseTokenSelectModal}
        tokens={allSupplyPositions}
        protocolName={protocolName}
      />
    </div>
  );
};

// Added display name to fix linting issue
HealthStatus.displayName = "HealthStatus";
ProtocolView.displayName = "ProtocolView";

export const ExampleProtocolView: FC = () => {
  const exampleSuppliedPositions: ProtocolPosition[] = [
    {
      icon: "/logos/ethereum-logo.svg",
      name: "ETH",
      balance: 5000.75,
      tokenBalance: BigInt(2.5 * 10 ** 18),
      currentRate: 2.8,
      tokenAddress: "0x0000000000000000000000000000000000000000",
    },
  ];

  const exampleBorrowedPositions: ProtocolPosition[] = [
    {
      icon: "/logos/dai-logo.svg",
      name: "DAI",
      balance: -2500.25,
      tokenBalance: BigInt(2500.25 * 10 ** 18),
      currentRate: 4.2,
      tokenAddress: "0x0000000000000000000000000000000000000000",
    },
    {
      icon: "/logos/usdc-logo.svg",
      name: "USDC",
      balance: -1000.5,
      tokenBalance: BigInt(1000.5 * 10 ** 6), // USDC has 6 decimals
      currentRate: 3.5,
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
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

ExampleProtocolView.displayName = "ExampleProtocolView";
