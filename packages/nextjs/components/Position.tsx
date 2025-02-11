import { FC, useState } from "react";
import Image from "next/image";
import { MovePositionModal } from "./modals/MovePositionModal";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { DepositModal } from "./modals/DepositModal";
import { RepayModal } from "./modals/RepayModal";
import { MoveSupplyModal } from "./modals/MoveSupplyModal";

interface PositionProps {
  icon: string;
  name: string;
  balance: number;
  currentRate: number;
  optimalRate?: number; // Optional since we'll fetch it
  type: "supply" | "borrow";
  protocolName: string; // Which protocol the position belongs to
  tokenAddress: string; // To fetch the optimal rate
  collateralView?: React.ReactNode; // Optional collateral view content
}

export const Position: FC<PositionProps> = ({
  icon,
  name,
  balance,
  currentRate,
  type,
  protocolName,
  tokenAddress,
  collateralView,
}) => {
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Check if position has a balance
  const hasBalance = type === "supply" ? balance > 0 : balance < 0;

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
      <div className="relative">
        <div className={`grid grid-cols-1 md:grid-cols-7 items-center w-full p-4 rounded-lg gap-4 ${
          type === "supply" ? "bg-base-200" : "bg-base-200/50"
        }`}>
          {/* Main Content */}
          <div className="flex flex-col md:flex-row md:col-span-5 gap-4">
            {/* Icon, Name, and Info Section */}
            <div className="flex items-center w-[200px]">
              <div className="w-8 h-8 relative min-w-[32px] min-h-[32px]">
                <Image
                  src={icon}
                  alt={`${name} icon`}
                  layout="fill"
                  className="rounded-full"
                />
              </div>
              <div className="flex items-center ml-3">
                <span className="font-semibold text-lg truncate mr-2">{name}</span>
                <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0">
                  <div
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer flex items-center justify-center h-[1.125em]"
                  >
                    <Image
                      src="/logos/info-button.svg"
                      alt="info"
                      width={18}
                      height={18}
                      className="opacity-50 hover:opacity-80 transition-opacity min-w-[1.125em] min-h-[1.125em]"
                    />
                  </div>
                  <div
                    tabIndex={0}
                    className="dropdown-content z-[1] card card-compact p-2 shadow bg-base-100 w-64 max-w-[90vw]"
                    style={{
                      right: "auto",
                      transform: "translateX(-50%)",
                      left: "50%",
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

            {/* Stats Section */}
            <div className="flex md:grid md:grid-cols-3 justify-between items-center gap-4 flex-grow">
              <div className="text-center w-[120px]">
                <div className="text-sm text-base-content/70">Balance</div>
                <div className={`font-medium tabular-nums ${type === "supply" ? "text-green-500" : "text-red-500"}`}>
                  {type === "supply" ? "" : "-"}${formatNumber(Math.abs(balance))}
                </div>
              </div>
              <div className="text-center w-[120px]">
                <div className="text-sm text-base-content/70">Current Rate</div>
                <div className="font-medium tabular-nums">{currentRate.toFixed(2)}%</div>
              </div>
              <div className="text-center w-[120px]">
                <div className="text-sm text-base-content/70">Optimal Rate</div>
                <div className={`font-medium tabular-nums ${
                  optimalProtocol.toLowerCase() !== protocolName.split(" ")[0].toLowerCase() ? "text-primary" : ""
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
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 md:col-span-2">
            {type === "supply" ? (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setIsDepositModalOpen(true)}
              >
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
            {collateralView && (
              <label
                htmlFor={`collateral-${name}`}
                className="swap swap-rotate btn btn-sm btn-circle btn-ghost"
              >
                <svg
                  className="swap-off w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                <svg
                  className="swap-on w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 15l7-7-7-7"
                  />
                </svg>
              </label>
            )}
          </div>
        </div>

        {collateralView && (
          <div className="collapse">
            <input
              type="checkbox"
              id={`collateral-${name}`}
              className="collapse-toggle hidden"
            />
            <div className="collapse-content">
              <div className="grid grid-cols-1 md:grid-cols-7 w-full">
                <div className="md:col-span-7">{collateralView}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Use different move modals based on position type */}
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
          currentSupply={balance}
        />
      ) : (
        <MovePositionModal
          isOpen={isMoveModalOpen}
          onClose={() => setIsMoveModalOpen(false)}
          fromProtocol={protocolName}
          position={{ name, balance, type }}
        />
      )}

      {type === "supply" && (
        <DepositModal
          isOpen={isDepositModalOpen}
          onClose={() => setIsDepositModalOpen(false)}
          token={{
            name,
            icon,
            currentRate,
            address: tokenAddress,
          }}
          protocolName={protocolName}
        />
      )}

      {type === "borrow" && (
        <RepayModal
          isOpen={isRepayModalOpen}
          onClose={() => setIsRepayModalOpen(false)}
          token={{ 
            name, 
            icon, 
            currentRate, 
            address: tokenAddress 
          }}
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
      currentRate={3.5}
      type="supply"
      protocolName="Aave V3"
      tokenAddress="0x0000000000000000000000000000000000000000"
      collateralView={
        <div className="p-4 bg-gray-100">
          This is the collateral view content.
        </div>
      }
    />
  );
};
