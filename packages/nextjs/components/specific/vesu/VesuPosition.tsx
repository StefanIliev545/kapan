import { FC, useState } from "react";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { TokenMetadata, feltToString, formatTokenAmount } from "~~/utils/protocols";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { WithdrawModalStark } from "~~/components/modals/stark/WithdrawModalStark";
import { TokenSelectModalStark } from "~~/components/modals/stark/TokenSelectModalStark";
import { BorrowModalStark } from "~~/components/modals/stark/BorrowModalStark";
import { RepayModalStark } from "~~/components/modals/stark/RepayModalStark";

// Constants
const YEAR_IN_SECONDS = 31536000; // 365 days
const SCALE = 10n ** 18n;

type PositionData = {
  collateral_shares: bigint;
  nominal_debt: bigint;
};

interface VesuPositionProps {
  collateralAsset: string;
  debtAsset: string;
  collateralShares: string;
  collateralAmount: string;
  nominalDebt: string;
  isVtoken: boolean;
  supportedAssets: TokenMetadata[];
}

// Helper: Format BigInt values with a provided number of decimals (for display)
const formatBigInt = (value: bigint, decimals: number): string => {
  try {
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = value / divisor;
    const fractional = value % divisor;

    if (fractional === 0n) {
      return whole.toString();
    }

    const numDecimals = Number(decimals);
    const fractionalStr = fractional.toString().padStart(numDecimals, "0");
    return `${whole}.${fractionalStr}`;
  } catch (error) {
    console.error("Error formatting BigInt:", error);
    return "0";
  }
};

// Helper: Calculate rates based on protocol data (returns numbers)
const calculateRates = (
  interestPerSecond: bigint,
  total_nominal_debt: bigint,
  last_rate_accumulator: bigint,
  reserve: bigint,
  scale: bigint,
) => {
  const borrowAPR = (Number(interestPerSecond) * YEAR_IN_SECONDS) / Number(SCALE);
  const totalBorrowed = Number((total_nominal_debt * last_rate_accumulator) / SCALE);

  // Handle zero scale to avoid division by zero
  const reserveScale = scale === 0n ? 0 : Number((reserve * SCALE) / scale);
  const supplyAPY =
    reserveScale + totalBorrowed === 0 ? 0 : (borrowAPR * totalBorrowed) / (reserveScale + totalBorrowed);

  return { borrowAPR, supplyAPY };
};

export const VesuPosition: FC<VesuPositionProps> = ({
  collateralAsset,
  debtAsset,
  collateralShares,
  collateralAmount,
  nominalDebt,
  isVtoken,
  supportedAssets,
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isTokenSelectModalOpen, setIsTokenSelectModalOpen] = useState(false);
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);

  // Find metadata for both assets
  const collateralMetadata = supportedAssets.find(
    asset => `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` === collateralAsset,
  );
  const debtMetadata = supportedAssets.find(
    asset => `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` === debtAsset,
  );

  if (!collateralMetadata) {
    console.error("Collateral metadata not found for asset:", collateralAsset);
    return null;
  }

  // nominal debt seems to be eth decimal scaled rather than token.
  if (debtMetadata) {
    debtMetadata.decimals = 18;
  }

  const collateralSymbol = feltToString(collateralMetadata.symbol);
  const debtSymbol = debtMetadata ? feltToString(debtMetadata.symbol) : "N/A";

  // Format amounts with correct decimals
  const formattedCollateral = formatTokenAmount(collateralAmount, collateralMetadata.decimals);
  const formattedDebt = debtMetadata ? formatTokenAmount(nominalDebt, debtMetadata.decimals) : "0";

  // Calculate USD values - handle price scaling correctly
  const collateralValue =
    (BigInt(collateralAmount) * collateralMetadata.price.value) / 10n ** BigInt(collateralMetadata.decimals);
  const debtValue = debtMetadata
    ? (BigInt(nominalDebt) * debtMetadata.price.value) / 10n ** BigInt(debtMetadata.decimals)
    : 0n;

  // Calculate rates for both assets
  const collateralRates = calculateRates(
    collateralMetadata.fee_rate,
    collateralMetadata.total_nominal_debt,
    collateralMetadata.last_rate_accumulator,
    collateralMetadata.reserve,
    collateralMetadata.scale,
  );

  const debtRates = debtMetadata
    ? calculateRates(
        debtMetadata.fee_rate,
        debtMetadata.total_nominal_debt,
        debtMetadata.last_rate_accumulator,
        debtMetadata.reserve,
        debtMetadata.scale,
      )
    : { borrowAPR: 0, supplyAPY: 0 };

  // Calculate monthly costs and yields using the calculated rates
  const monthlyCost =
    debtValue > 0n ? (debtValue * BigInt(Math.floor(debtRates.borrowAPR * 1e18))) / 10n ** 18n / 12n : 0n;
  const monthlyYield = (collateralValue * BigInt(Math.floor(collateralRates.supplyAPY * 1e18))) / 10n ** 18n / 12n;

  // Calculate LTV - handle division carefully
  const ltv = collateralValue > 0n ? (debtValue * 100n) / collateralValue : 0n;

  return (
    <>
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <img src={tokenNameToLogo(collateralSymbol.toLowerCase())} alt={collateralSymbol} className="w-6 h-6" />
              <span className="font-medium">{collateralSymbol}</span>
              {isVtoken && <span className="badge badge-sm badge-primary">vToken</span>}
            </div>
            {nominalDebt !== "0" && (
              <div className="flex items-center gap-2">
                <img src={tokenNameToLogo(debtSymbol.toLowerCase())} alt={debtSymbol} className="w-6 h-6" />
                <span className="font-medium">{debtSymbol}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Collateral Section */}
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                ${(Number(collateralValue) / 1e18).toFixed(3)}
              </div>
              <div className="text-lg text-gray-500">
                {collateralSymbol === "ETH" ? parseFloat(formattedCollateral).toFixed(3) : formattedCollateral} {collateralSymbol}
              </div>

              <div className="divider my-1"></div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Supply APY</span>
                  <span className="text-sm font-medium text-success">
                    {(collateralRates.supplyAPY * 100).toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Monthly yield</span>
                  <span className="text-sm font-medium">${(Number(monthlyYield) / 1e18).toFixed(3)}</span>
                </div>
              </div>
            </div>

            {/* Debt Section */}
            <div className="space-y-2">
              {nominalDebt === "0" ? (
                <>
                  <div className="text-2xl font-bold text-gray-400">$0.000</div>
                  <div className="text-lg text-gray-400">0 {debtSymbol}</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    ${(Number(debtValue) / 1e18).toFixed(3)}
                  </div>
                  <div className="text-lg text-gray-500">
                    {debtSymbol === "ETH" ? parseFloat(formattedDebt).toFixed(3) : formattedDebt} {debtSymbol}
                  </div>
                </>
              )}

              <div className="divider my-1"></div>

              <div className="space-y-1">
                {nominalDebt === "0" ? (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">No debt</span>
                    <span className="text-sm font-medium text-gray-400">-</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Borrow APR</span>
                      <span className="text-sm font-medium text-error">{(debtRates.borrowAPR * 100).toFixed(3)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Monthly cost</span>
                      <span className="text-sm font-medium">${(Number(monthlyCost) / 1e18).toFixed(3)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="divider my-2"></div>

          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500">Loan-to-value: <span className="font-medium">{Number(ltv).toFixed(2)}%</span></span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex">
              <button className="btn btn-xs btn-primary rounded-r-none px-2 w-16" onClick={() => setIsDepositModalOpen(true)}>Deposit</button>
              <button className="btn btn-xs btn-secondary rounded-l-none border-l-0 px-2 w-16" onClick={() => setIsWithdrawModalOpen(true)}>Withdraw</button>
            </div>
            <div className="flex justify-end">
              <div className="flex">
                <button 
                  className="btn btn-xs btn-primary rounded-r-none px-2 w-16" 
                  onClick={() => {
                    if (nominalDebt === "0") {
                      setIsTokenSelectModalOpen(true);
                    } else if (debtMetadata) {
                      setIsBorrowModalOpen(true);
                    }
                  }}
                >
                  Borrow
                </button>
                <button 
                  className={`btn btn-xs btn-secondary rounded-l-none border-l-0 px-2 w-16 ${nominalDebt === "0" ? "btn-disabled" : ""}`}
                  onClick={() => {
                    if (nominalDebt !== "0" && debtMetadata) {
                      setIsRepayModalOpen(true);
                    }
                  }}
                >
                  Repay
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DepositModalStark
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        token={{
          name: collateralSymbol,
          icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
          address: collateralAsset,
          currentRate: collateralRates.supplyAPY * 100,
        }}
        protocolName="Vesu"
        vesuContext={{
          pool_id: 0n,
          counterpart_token: debtAsset,
        }}
      />

      <WithdrawModalStark
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        token={{
          name: collateralSymbol,
          icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
          address: collateralAsset,
          currentRate: collateralRates.supplyAPY * 100,
        }}
        protocolName="Vesu"
        vesuContext={{
          pool_id: 0n,
          counterpart_token: debtAsset,
        }}
      />

      <TokenSelectModalStark
        isOpen={isTokenSelectModalOpen}
        onClose={() => setIsTokenSelectModalOpen(false)}
        tokens={supportedAssets}
        protocolName="Vesu"
        collateralAsset={collateralAsset}
        isVesu={true}
        vesuContext={{
          pool_id: 0n,
          counterpart_token: collateralAsset,
        }}
      />

      {debtMetadata && (
        <>
          <BorrowModalStark
            isOpen={isBorrowModalOpen}
            onClose={() => setIsBorrowModalOpen(false)}
            token={{
              name: debtSymbol,
              icon: tokenNameToLogo(debtSymbol.toLowerCase()),
              address: debtAsset,
              currentRate: debtRates.borrowAPR * 100,
            }}
            protocolName="Vesu"
            supportedAssets={supportedAssets}
            isVesu={true}
            vesuContext={{
              pool_id: 0n,
              counterpart_token: collateralAsset,
            }}
          />

          <RepayModalStark
            isOpen={isRepayModalOpen}
            onClose={() => setIsRepayModalOpen(false)}
            token={{
              name: debtSymbol,
              icon: tokenNameToLogo(debtSymbol.toLowerCase()),
              address: debtAsset,
              currentRate: debtRates.borrowAPR * 100,
            }}
            protocolName="Vesu"
            vesuContext={{
              pool_id: 0n,
              counterpart_token: collateralAsset,
            }}
          />
        </>
      )}
    </>
  );
};
