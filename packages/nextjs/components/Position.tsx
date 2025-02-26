import { FC, useState } from "react";
import Image from "next/image";
import { DepositModal } from "./modals/DepositModal";
import { MovePositionModal } from "./modals/MovePositionModal";
import { MoveSupplyModal } from "./modals/MoveSupplyModal";
import { RepayModal } from "./modals/RepayModal";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface PositionProps {
  icon: string;
  name: string;
  balance: number; // USD value
  tokenBalance: bigint; // Raw token amount
  currentRate: number;
  optimalRate?: number;
  type: "supply" | "borrow";
  protocolName: string;
  tokenAddress: string;
  collateralView?: React.ReactNode;
}

export const Position: FC<PositionProps> = ({
  icon,
  name,
  balance,
  tokenBalance,
  currentRate,
  optimalRate,
  type,
  protocolName,
  tokenAddress,
  collateralView,
}) => {
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Check if position has a balance - for borrow positions, we want to check if there is debt
  const hasBalance = type === "supply" ? tokenBalance > 0 : tokenBalance > 0; // Changed from tokenBalance < 0 since borrow balance is positive

  // Fetch optimal rate from the OptimalInterestRateFinder contract.
  const { data: optimalRateData } = useScaffoldReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: type === "supply" ? "findOptimalSupplyRate" : "findOptimalBorrowRate",
    args: [tokenAddress],
  });

  let optimalProtocol = "";
  let optimalRateDisplay = 0;
  if (optimalRateData) {
    const [proto, rate] = optimalRateData;
    optimalProtocol = proto;
    optimalRateDisplay = Number(rate) / 1e8;
  }

  const formatNumber = (num: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

  return (
    <>
      {/* Outer container uses grid that becomes a single column on mobile */}
      <div className={`w-full p-3 rounded-md bg-base-200 grid grid-cols-1 lg:grid-cols-7`}>
        {/* Header: Icon and Title */}
        <div className="order-1 lg:order-none lg:col-span-2 flex items-center">
          <div className="w-7 h-7 relative min-w-[28px] min-h-[28px]">
            <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
          </div>
          <span className="ml-2 font-semibold text-lg truncate">{name}</span>
          <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0 ml-1">
            <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
              <Image
                src="/logos/info-button.svg"
                alt="info"
                width={16}
                height={16}
                className="opacity-50 hover:opacity-80 transition-opacity min-w-[1em] min-h-[1em]"
              />
            </div>
            <div
              tabIndex={0}
              className="dropdown-content z-[1] card card-compact p-2 shadow bg-base-100 w-64 max-w-[90vw]"
              style={{
                right: "auto",
                transform: "translateX(-50%)",
                left: "50%",
                borderRadius: "4px",
              }}
            >
              <div className="card-body p-3">
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

        {/* Stats: Rates */}
        <div className="order-2 lg:order-none lg:col-span-3 grid grid-cols-3 gap-0 items-center">
          <div className="px-2 border-r border-base-300">
            <div className="text-sm text-base-content/70 overflow-hidden h-6">Balance</div>
            <div className={`font-medium h-6 line-clamp-1 ${type === "supply" ? "text-green-500" : "text-red-500"}`}>
              {type === "supply" ? "" : "-"}${formatNumber(Math.abs(balance))}
            </div>
          </div>
          <div className="px-2 border-r border-base-300">
            <div className="text-sm text-base-content/70 overflow-hidden h-6">Current Rate</div>
            <div className="font-medium tabular-nums whitespace-nowrap text-ellipsis h-6 line-clamp-1">
              {currentRate.toFixed(2)}%
            </div>
          </div>
          <div className="px-2">
            <div className="text-sm text-base-content/70 overflow-hidden h-6">Optimal Rate</div>
            <div className="font-medium flex items-center h-6">
              <span className="tabular-nums whitespace-nowrap text-ellipsis min-w-0 line-clamp-1">
                {optimalRateDisplay.toFixed(2)}%
              </span>
              <Image
                src={getProtocolLogo(optimalProtocol)}
                alt={optimalProtocol}
                width={16}
                height={16}
                className="flex-shrink-0 rounded-full ml-1"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="order-3 lg:order-none lg:col-span-2 flex items-center justify-end gap-1">
          {type === "supply" ? (
            <button className="btn btn-sm btn-primary" onClick={() => setIsDepositModalOpen(true)}>
              Deposit
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => setIsRepayModalOpen(true)} disabled={!hasBalance}>
              Repay
            </button>
          )}
          <button 
            className="btn btn-sm btn-outline" 
            onClick={() => setIsMoveModalOpen(true)} 
            disabled={!hasBalance || type === "supply"}
            title={type === "supply" ? "Moving supply positions is not yet implemented" : ""}
          >
            Move
          </button>
          {collateralView && (
            <label htmlFor={`collateral-${name}`} className="swap swap-rotate btn btn-sm btn-circle btn-ghost">
              <svg className="swap-off w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <svg className="swap-on w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15l7-7-7-7" />
              </svg>
            </label>
          )}
        </div>
      </div>

      {collateralView && (
        <div className="collapse">
          <input type="checkbox" id={`collateral-${name}`} className="collapse-toggle hidden" />
          <div className="collapse-content">
            <div className="grid grid-cols-1 md:grid-cols-7 w-full">
              <div className="md:col-span-7">{collateralView}</div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {type === "supply" ? (
        <MoveSupplyModal
          isOpen={isMoveModalOpen}
          onClose={() => setIsMoveModalOpen(false)}
          token={{
            name,
            icon,
            currentRate,
            address: tokenAddress,
          }}
          fromProtocol={protocolName}
        />
      ) : (
        <MovePositionModal
          isOpen={isMoveModalOpen}
          onClose={() => setIsMoveModalOpen(false)}
          fromProtocol={protocolName}
          position={{
            name,
            balance,
            type,
            tokenAddress,
          }}
        />
      )}

      {type === "supply" && (
        <DepositModal
          isOpen={isDepositModalOpen}
          onClose={() => setIsDepositModalOpen(false)}
          token={{ name, icon, currentRate, address: tokenAddress }}
          protocolName={protocolName}
        />
      )}

      {type === "borrow" && (
        <RepayModal
          isOpen={isRepayModalOpen}
          onClose={() => setIsRepayModalOpen(false)}
          token={{ name, icon, currentRate, address: tokenAddress }}
          protocolName={protocolName}
        />
      )}
    </>
  );
};

export const ExamplePosition: FC = () => {
  return (
    <Position
      icon="/logos/usdc-coin-usdc-logo.svg"
      name="USDC"
      balance={1000.5}
      tokenBalance={BigInt(1000.5)}
      currentRate={3.5}
      type="supply"
      protocolName="Aave V3"
      tokenAddress="0x0000000000000000000000000000000000000000"
      collateralView={<div className="p-4 bg-gray-100">This is the collateral view content.</div>}
    />
  );
};
