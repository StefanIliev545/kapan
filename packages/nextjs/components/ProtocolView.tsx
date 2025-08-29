import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BorrowPosition } from "./BorrowPosition";
import { SupplyPosition } from "./SupplyPosition";
import { TokenSelectModal } from "./modals/TokenSelectModal";
import { BorrowModal } from "./modals/BorrowModal";
import { TokenSelectModalStark } from "./modals/stark/TokenSelectModalStark";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { DepositModalStark } from "./modals/stark/DepositModalStark";
import { FiAlertTriangle, FiPlus } from "react-icons/fi";

export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number; // USD value
  tokenBalance: bigint; // Raw token amount
  currentRate: number;
  tokenAddress: string;
  tokenPrice?: bigint; // Token price with 8 decimals of precision
  tokenDecimals?: number; // Token decimals
  tokenSymbol?: string; // Token symbol for price feed selection
  collateralView?: React.ReactNode;
  collateralValue?: number; // Optional collateral value (used by borrowed positions)
}

interface ProtocolViewProps {
  protocolName: string;
  protocolIcon: string;
  ltv: number;
  maxLtv: number;
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  hideUtilization?: boolean;
  forceShowAll?: boolean; // If true, always show all assets regardless of showAll toggle
  networkType: "evm" | "starknet"; // Specify which network this protocol view is for
}

// Health status indicator component that shows utilization percentage
const HealthStatus: FC<{ utilizationPercentage: number }> = ({ utilizationPercentage }) => {
  // Determine color based on utilization percentage
  const getColor = () => {
    if (utilizationPercentage < 50) return "bg-success";
    if (utilizationPercentage < 70) return "bg-warning";
    return "bg-error";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-32 h-1.5 bg-base-300 rounded-full overflow-hidden">
        <div className={`h-full ${getColor()}`} style={{ width: `${utilizationPercentage}%` }} />
      </div>
      <span className="text-xs font-medium">{utilizationPercentage.toFixed(0)}%</span>
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
  forceShowAll = false,
  networkType,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [isTokenSelectModalOpen, setIsTokenSelectModalOpen] = useState(false);
  const [isTokenBorrowModalOpen, setIsTokenBorrowModalOpen] = useState(false);
  const [isTokenBorrowSelectModalOpen, setIsTokenBorrowSelectModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ProtocolPosition | null>(null);
  // For Starknet supply modal
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [selectedSupplyToken, setSelectedSupplyToken] = useState<{
    name: string;
    icon: string;
    address: string;
    currentRate: number;
    tokenPrice?: bigint;
  } | null>(null);

  // Update showAll when forceShowAll prop changes
  useEffect(() => {
    if (forceShowAll) {
      setShowAll(true);
    }
  }, [forceShowAll]);

  // Calculate net balance.
  const netBalance = useMemo(() => {
    const totalSupplied = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);

    // Include collateral values in total balance calculation
    let totalBorrowed = 0;
    let totalCollateral = 0;

    borrowedPositions.forEach(pos => {
      // Add up the absolute borrowed value
      totalBorrowed += Math.abs(pos.balance);

      // Add up the collateral value if available
      if (pos.collateralValue) {
        totalCollateral += pos.collateralValue;
      }
    });

    // Net balance = supplied + collateral - borrowed
    return totalSupplied + totalCollateral - totalBorrowed;
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

  // Use effective showAll state (component state OR forced from props)
  const effectiveShowAll = showAll || forceShowAll;

  // Filter positions based on showAll toggle.
  const filteredSuppliedPositions = effectiveShowAll ? suppliedPositions : suppliedPositions.filter(p => p.balance > 0);

  // For borrowed positions:
  // - If not showing all, only show positions with actual debt (negative balance)
  // - If showing all, show everything in the borrowedPositions array
  const filteredBorrowedPositions = effectiveShowAll
    ? borrowedPositions // Show all potential borrowable tokens
    : borrowedPositions.filter(p => p.balance < 0); // Only show positions with debt

  // Assuming tokenNameToLogo is defined elsewhere, we use a fallback here.
  const getProtocolLogo = (protocol: string) => `/logos/${protocol.toLowerCase()}-logo.svg`;

  // Handle opening the token select modal for supply
  const handleAddSupply = () => {
    setIsTokenSelectModalOpen(true);
  };

  // Handle closing the token select modal for supply
  const handleCloseTokenSelectModal = () => {
    setIsTokenSelectModalOpen(false);
  };

  // Handle opening the token select modal for borrowing
  const handleAddBorrow = () => {
    setIsTokenBorrowSelectModalOpen(true);
  };

  // Handle closing the token select modal for borrowing
  const handleCloseBorrowSelectModal = () => {
    setIsTokenBorrowSelectModalOpen(false);
  };

  // Handle opening the borrow modal directly (obsolete, but keeping for reference)
  const handleOpenBorrowModal = () => {
    setIsTokenBorrowModalOpen(true);
  };

  // Handle closing the borrow modal
  const handleCloseBorrowModal = () => {
    setIsTokenBorrowModalOpen(false);
    setSelectedToken(null);
  };

  // Get all possible supply positions by using showAll setting
  // This ensures we include all tokens, even those with zero balance
  const allSupplyPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (effectiveShowAll) return suppliedPositions;

    // Otherwise, temporarily get all positions for the token modal
    return suppliedPositions;
  }, [suppliedPositions, effectiveShowAll]);

  // Get all possible borrow positions by using showAll setting
  const allBorrowPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (effectiveShowAll) return borrowedPositions;

    // Otherwise, temporarily get all positions for the token modal
    return borrowedPositions;
  }, [borrowedPositions, effectiveShowAll]);

  // Handle supply token selection for Starknet
  const handleSelectSupplyToken = (token: ProtocolPosition) => {
    setSelectedSupplyToken({
      name: token.name,
      icon: token.icon,
      address: token.tokenAddress,
      currentRate: token.currentRate,
      tokenPrice: token.tokenPrice,
    });
    setIsTokenSelectModalOpen(false);
    setIsDepositModalOpen(true);
  };

  // Handle deposit modal close
  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    setSelectedSupplyToken(null);
  };

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
                  <span className={`text-sm font-medium ${netBalance >= 0 ? "text-success" : "text-error"}`}>
                    {formatCurrency(netBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Utilization Section - Only show if not hidden */}
            {!hideUtilization && (
              <div className="flex flex-col items-start gap-1 order-3 md:order-2">
                <span className="text-sm text-base-content">Protocol Utilization</span>
                <HealthStatus utilizationPercentage={utilizationPercentage} />
              </div>
            )}

            {/* Show All Toggle - Hide if forceShowAll is true */}
            <div
              className={`flex items-center justify-end gap-2 order-2 md:order-3 ${hideUtilization ? "md:col-span-2" : ""}`}
            >
              {!forceShowAll && (
                <>
                  <span className="text-sm text-base-content/70">Show all assets</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={showAll}
                    onChange={e => setShowAll(e.target.checked)}
                  />
                </>
              )}
              {forceShowAll && <span className="text-sm text-primary">Connect wallet to view your positions</span>}
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
                <span className="badge badge-primary badge-outline">{filteredSuppliedPositions.length}</span>
              </h2>
              {filteredSuppliedPositions.length > 0 ? (
                <div className=" pt-2 space-y-3">
                  {filteredSuppliedPositions.map((position, index) => (
                    <div key={`supplied-${position.name}-${index}`} className="min-h-[60px]">
                      <SupplyPosition {...position} protocolName={protocolName} networkType={networkType} />
                    </div>
                  ))}

                  {/* "Add Supply" button */}
                  <button className="btn btn-sm btn-outline btn-block mt-2" onClick={handleAddSupply}>
                    <FiPlus className="w-4 h-4 mr-1" />
                    Add Supply
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg mt-2">
                  <FiAlertTriangle className="w-10 h-10 mb-2 opacity-50" />
                  <p>{effectiveShowAll ? "No available assets" : "No supplied assets"}</p>
                  <button className="btn btn-sm btn-primary mt-3" onClick={handleAddSupply}>
                    <FiPlus className="w-4 h-4 mr-1" />
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
                <span className="badge badge-secondary badge-outline">{filteredBorrowedPositions.length}</span>
              </h2>
              {filteredBorrowedPositions.length > 0 ? (
                <div className="pt-2 space-y-3">
                  {filteredBorrowedPositions.map((position, index) => (
                    <div key={`borrowed-${position.name}-${index}`} className="min-h-[60px]">
                      <BorrowPosition {...position} protocolName={protocolName} networkType={networkType} />
                    </div>
                  ))}
                  
                  {/* "Add Borrow" button */}
                  <button className="btn btn-sm btn-outline btn-block mt-2" onClick={handleAddBorrow}>
                    <FiPlus className="w-4 h-4 mr-1" />
                    Borrow
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg mt-2">
                  <FiAlertTriangle className="w-10 h-10 mb-2 opacity-50" />
                  <p>{effectiveShowAll ? "No available assets" : "No borrowed assets"}</p>
                  <button className="btn btn-sm btn-primary mt-3" onClick={handleAddBorrow}>
                    <FiPlus className="w-4 h-4 mr-1" />
                    Borrow Assets
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals - Conditional based on network type */}
      {networkType === "starknet" ? (
        <>
          {/* Supply action using a custom token selector for Starknet */}
          {isTokenSelectModalOpen && (
            <div className="modal modal-open">
              <div className="modal-box max-w-4xl bg-base-100">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-xl tracking-tight">Select a Token to Supply</h3>
                  <button 
                    className="btn btn-sm btn-circle btn-ghost" 
                    onClick={handleCloseTokenSelectModal}
                  >
                    ✕
                  </button>
                </div>
                
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                  {allSupplyPositions.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {allSupplyPositions.map((position, index) => (
                        <div 
                          key={`supply-${position.tokenAddress}-${index}`} 
                          className="bg-base-200 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 
                            shadow-md hover:shadow-lg border-transparent border transform hover:scale-105"
                          onClick={() => handleSelectSupplyToken(position)}
                        >
                          <div className="avatar mb-3">
                            <div className="w-16 h-16 rounded-full bg-base-100 p-1 ring-2 ring-base-300 dark:ring-base-content/20">
                              <Image 
                                src={position.icon} 
                                alt={position.name} 
                                width={64} 
                                height={64} 
                                className="object-contain"
                              />
                            </div>
                          </div>
                          <span className="font-bold text-lg mb-1">{position.name}</span>
                          <div className="badge badge-outline p-3 font-medium">
                            {position.currentRate.toFixed(2)}% APR
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-base-content/70 bg-base-200/50 rounded-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-12 h-12 mx-auto mb-4 opacity-50">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <p className="text-lg">No tokens available to supply</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-backdrop" onClick={handleCloseTokenSelectModal}>
                <button>close</button>
              </div>
            </div>
          )}

          {/* Token Select Modal for Borrow - Starknet */}
          <TokenSelectModalStark
            isOpen={isTokenBorrowSelectModalOpen}
            onClose={handleCloseBorrowSelectModal}
            tokens={allBorrowPositions.map(pos => ({
              address: BigInt(pos.tokenAddress),
              symbol: BigInt("0x" + Buffer.from(pos.name).toString('hex')), // Convert name to felt format
              decimals: pos.tokenDecimals || 18,
              rate_accumulator: BigInt(0),
              utilization: BigInt(0),
              fee_rate: BigInt(Math.floor(pos.currentRate * 1e18 / (365 * 24 * 60 * 60))), // Convert APR to per-second rate
              price: {
                value: BigInt(pos.tokenPrice || 0),
                is_valid: true
              },
              total_nominal_debt: BigInt(0),
              last_rate_accumulator: BigInt(0),
              reserve: BigInt(0),
              scale: BigInt(0),
              borrowAPR: pos.currentRate,
              supplyAPY: pos.currentRate * 0.7  // Approximate supply APY as 70% of borrow APR
            }))}
            protocolName={protocolName}
          />

          {/* Deposit Modal for Starknet */}
          {selectedSupplyToken && 
            <DepositModalStark
              isOpen={isDepositModalOpen}
              onClose={handleCloseDepositModal}
              token={selectedSupplyToken}
              protocolName={protocolName}
            />
          }

          {/* Borrow Modal for Starknet */}
          {isTokenBorrowModalOpen &&
            <BorrowModalStark
              isOpen={isTokenBorrowModalOpen}
              onClose={handleCloseBorrowModal}
              token={
                selectedToken
                  ? {
                      name: selectedToken.name,
                      icon: selectedToken.icon,
                      currentRate: selectedToken.currentRate,
                      address: selectedToken.tokenAddress,
                      tokenPrice: selectedToken.tokenPrice,
                    }
                  : {
                      name: borrowedPositions[0]?.name || "",
                      icon: borrowedPositions[0]?.icon || "",
                      currentRate: borrowedPositions[0]?.currentRate || 0,
                      address: borrowedPositions[0]?.tokenAddress || "",
                      tokenPrice: borrowedPositions[0]?.tokenPrice,
                    }
              }
              protocolName={protocolName}
            />
          }
        </>
      ) : (
        <>
          {/* Token Select Modal for Supply - EVM */}
          <TokenSelectModal
            isOpen={isTokenSelectModalOpen}
            onClose={handleCloseTokenSelectModal}
            tokens={allSupplyPositions}
            protocolName={protocolName}
            isBorrow={false}
          />

          {/* Token Select Modal for Borrow - EVM */}
          <TokenSelectModal
            isOpen={isTokenBorrowSelectModalOpen}
            onClose={handleCloseBorrowSelectModal}
            tokens={allBorrowPositions}
            protocolName={protocolName}
            isBorrow={true}
          />

          {/* Borrow Modal - EVM */}
          {isTokenBorrowModalOpen && (
            <BorrowModal
              isOpen={isTokenBorrowModalOpen}
              onClose={handleCloseBorrowModal}
              token={
                selectedToken
                  ? {
                      name: selectedToken.name,
                      icon: selectedToken.icon,
                      address: selectedToken.tokenAddress,
                      currentRate: selectedToken.currentRate,
                      tokenPrice: selectedToken.tokenPrice,
                    }
                  : {
                      name: borrowedPositions[0]?.name || "",
                      icon: borrowedPositions[0]?.icon || "",
                      address: borrowedPositions[0]?.tokenAddress || "",
                      currentRate: borrowedPositions[0]?.currentRate || 0,
                      tokenPrice: borrowedPositions[0]?.tokenPrice,
                    }
              }
              protocolName={protocolName}
            />
          )}
        </>
      )}
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
      networkType="evm"
    />
  );
};

ExampleProtocolView.displayName = "ExampleProtocolView";
