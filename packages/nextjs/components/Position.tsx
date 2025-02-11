import { FC, useState } from "react";
import Image from "next/image";
import { MovePositionModal } from "./modals/MovePositionModal";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { DepositModal } from "./modals/DepositModal";
import { RepayModal } from "./modals/RepayModal";

interface PositionProps {
  icon: string;
  name: string;
  balance: number;
  currentRate: number;
  optimalRate?: number; // Optional since we'll fetch it
  type: "supply" | "borrow";
  protocolName: string;  // Which protocol the position belongs to
  tokenAddress: string;  // To fetch the optimal rate
}

export const Position: FC<PositionProps> = ({ 
  icon, 
  name, 
  balance, 
  currentRate, 
  type,
  protocolName,
  tokenAddress,
}) => {
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);

  // Check if position has a balance
  const hasBalance = type === "supply" ? balance > 0 : balance < 0;

  // Fetch optimal rate from the OptimalInterestRateFinder contract.
  // The contract returns a tuple [optimalProtocol, optimalRate] where optimalRate is a fixed-point value.
  const { data: optimalRateData } = useScaffoldReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: type === "supply" ? "findOptimalSupplyRate" : "findOptimalBorrowRate",
    args: [tokenAddress],
  });

  // Debug log to see what we're getting.
  console.log(`Optimal rate data for ${name}: `, optimalRateData);

  // When the contract returns data, assume it is in the form: [string, bigint]
  // optimalRateData is returned in fixed-point representation (8 extra decimals),
  // so we divide by 1e8 to convert back to a percentage.
  let optimalProtocol = "";
  let optimalRateDisplay = 0;
  if (optimalRateData) {
    const [proto, rate] = optimalRateData;
    optimalProtocol = proto;
    // Convert fixed‑point value back to a percentage.
    optimalRateDisplay = Number(rate) / 1e8;
  }

  // Debug log for protocol comparison.
  console.log(
    `Protocol comparison: ${optimalProtocol.toLowerCase()} vs ${protocolName.split(" ")[0].toLowerCase()}`
  );

  // Format numbers using a consistent locale.
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
  };

  // Retrieve protocol logo.
  const getProtocolLogo = (protocol: string) => {
    return tokenNameToLogo(protocol);
  };

  return (
    <>
      <div
        className={`grid ${
          type === "supply" ? "grid-cols-7" : "grid-cols-6"
        } items-center w-full p-4 rounded-lg gap-4 ${
          type === "supply" ? "bg-base-200" : "bg-base-200/50"
        }`}
      >
        {/* Icon, Name, and Info Section */}
        <div className="flex items-center space-x-3 col-span-1">
          <div className="w-8 h-8 relative min-w-[32px] min-h-[32px]">
            <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{name}</span>
            <div className="dropdown dropdown-end dropdown-bottom">
              <label tabIndex={0} className="cursor-pointer flex items-center justify-center h-[1.125em]">
                <Image 
                  src="/logos/info-button.svg" 
                  alt="info" 
                  width={18}
                  height={18}
                  className="opacity-50 hover:opacity-80 transition-opacity min-w-[1.125em] min-h-[1.125em]"
                />
              </label>
              <div 
                tabIndex={0} 
                className="dropdown-content z-[1] card card-compact p-2 shadow bg-base-100 w-64 max-w-[90vw]"
                style={{ 
                  right: 'auto',
                  transform: 'translateX(-50%)',
                  left: '50%',
                }}
              >
                <div className="card-body">
                  <h3 className="card-title text-sm">{name} Details</h3>
                  <div className="text-xs space-y-1">
                    <p className="text-base-content/70">Contract Address:</p>
                    <p className="font-mono break-all">{tokenAddress}</p>
                    <p className="text-base-content/70">Protocol:</p>
                    <p>{protocolName}</p>
                    <p className="text-base-content/70">Type:</p>
                    <p className="capitalize">{type} Position</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
          <div className={`font-medium ${
            optimalProtocol.toLowerCase() !== protocolName.split(" ")[0].toLowerCase()
              ? "text-primary"
              : ""
          }`}>
            {optimalRateDisplay.toFixed(2)}%
            <span className="ml-1 inline-flex items-center">
              <Image
                src={getProtocolLogo(optimalProtocol)}
                alt={optimalProtocol}
                width={18}
                height={18}
                className="inline-block rounded-full min-w-[1.125em] min-h-[1.125em]"
              />
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={`text-center ${type === "supply" ? "col-span-2" : "col-span-1"} flex justify-end gap-2`}>
          {type === "supply" ? (
            <button className="btn btn-sm btn-primary" onClick={() => setIsDepositModalOpen(true)}>
              Deposit
            </button>
          ) : (
            <button 
              className="btn btn-sm btn-primary" 
              onClick={() => setIsRepayModalOpen(true)}
              disabled={!hasBalance}
            >
              Repay
            </button>
          )}
          <button 
            className="btn btn-sm btn-outline" 
            onClick={() => setIsMoveModalOpen(true)}
            disabled={!hasBalance}
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

      {type === "supply" && (
        <DepositModal
          isOpen={isDepositModalOpen}
          onClose={() => setIsDepositModalOpen(false)}
          token={{ name, icon, currentRate }}
          protocolName={protocolName}
        />
      )}

      {type === "borrow" && (
        <RepayModal
          isOpen={isRepayModalOpen}
          onClose={() => setIsRepayModalOpen(false)}
          token={{ name, icon, currentRate }}
          protocolName={protocolName}
        />
      )}
    </>
  );
};

// Example usage:
export const ExamplePosition: FC = () => {
  return (
    <Position
      icon="/logos/usdc-coin-usdc-logo.svg" // Replace with actual token icons.
      name="USDC"
      balance={1000.5}
      currentRate={3.5}
      type="supply"
      protocolName="Aave V3"
      tokenAddress="0x0000000000000000000000000000000000000000"
    />
  );
};
