import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BorrowModalStark } from "~~/components/modals/stark/BorrowModalStark";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { MovePositionModal } from "~~/components/modals/stark/MovePositionModal";
import { RepayModalStark } from "~~/components/modals/stark/RepayModalStark";
import { TokenSelectModalStark } from "~~/components/modals/stark/TokenSelectModalStark";
import { WithdrawModalStark } from "~~/components/modals/stark/WithdrawModalStark";
import { ClosePositionModalStark } from "~~/components/modals/stark/ClosePositionModalStark";
import { SwitchVesuModalStark, type TokenInfo as SwitchTokenInfo } from "~~/components/modals/stark/SwitchVesuModalStark";
import { CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import { TokenMetadata, feltToString, formatTokenAmount } from "~~/utils/protocols";

// Constants
const YEAR_IN_SECONDS = 31536000; // 365 days
const SCALE = 10n ** 18n;

interface VesuPositionProps {
  collateralAsset: string;
  debtAsset: string;
  collateralShares: string;
  collateralAmount: string;
  nominalDebt: string;
  isVtoken: boolean;
  supportedAssets: TokenMetadata[];
  poolId: bigint;
}

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
  collateralShares: _collateralShares,
  collateralAmount,
  nominalDebt,
  isVtoken,
  supportedAssets,
  poolId,
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isTokenSelectModalOpen, setIsTokenSelectModalOpen] = useState(false);
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<"collateral" | "debt" | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [switchModalState, setSwitchModalState] = useState<{
    type: "collateral" | "debt";
    token: SwitchTokenInfo;
  } | null>(null);

  const formatSupportedAssetAddress = (asset: TokenMetadata) =>
    `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;

  const mapAssetToTokenInfo = useCallback(
    (asset: TokenMetadata): SwitchTokenInfo => {
      const symbol = feltToString(asset.symbol);
      return {
        name: symbol,
        address: formatSupportedAssetAddress(asset),
        decimals: Number(asset.decimals ?? 18),
        icon: tokenNameToLogo(symbol.toLowerCase()),
      };
    },
    [],
  );

  useEffect(() => {
    if (!activeDropdown) return;
    const handleClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeDropdown]);

  // Find metadata for both assets
  const collateralMetadata = supportedAssets.find(asset => formatSupportedAssetAddress(asset) === collateralAsset);
  const debtMetadata = supportedAssets.find(asset => formatSupportedAssetAddress(asset) === debtAsset);

  const collateralUsdPrice =
    collateralMetadata && collateralMetadata.price && collateralMetadata.price.is_valid
      ? Number(collateralMetadata.price.value) / 1e18
      : 0;
  const debtUsdPrice =
    debtMetadata && debtMetadata.price && debtMetadata.price.is_valid ? Number(debtMetadata.price.value) / 1e18 : 0;

  // Calculate USD values - handle price scaling correctly
  const collateralValue = collateralMetadata
    ? (BigInt(collateralAmount) * collateralMetadata.price.value) / 10n ** BigInt(collateralMetadata.decimals)
    : 0n;
  const debtValue = debtMetadata
    ? (BigInt(nominalDebt) * debtMetadata.price.value) / 10n ** BigInt(debtMetadata.decimals)
    : 0n;

  const position = useMemo(
    () => new PositionManager(Number(collateralValue) / 1e18, Number(debtValue) / 1e18),
    [collateralValue, debtValue],
  );

  if (!collateralMetadata) {
    console.error("Collateral metadata not found for asset:", collateralAsset);
    return null;
  }

  const collateralSymbol = feltToString(collateralMetadata.symbol);
  const debtSymbol = debtMetadata ? feltToString(debtMetadata.symbol) : "N/A";

  const collateralTokenInfo: SwitchTokenInfo = {
    name: collateralSymbol,
    address: collateralAsset,
    decimals: Number(collateralMetadata.decimals),
    icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
  };

  const debtTokenInfo: SwitchTokenInfo | null = debtMetadata
    ? {
        name: debtSymbol,
        address: debtAsset,
        decimals: Number(debtMetadata.decimals),
        icon: tokenNameToLogo(debtSymbol.toLowerCase()),
      }
    : null;

  const collateralOptions = supportedAssets
    .filter(asset => formatSupportedAssetAddress(asset) !== collateralAsset)
    .map(mapAssetToTokenInfo);

  const debtOptions = supportedAssets
    .filter(asset => formatSupportedAssetAddress(asset) !== debtAsset)
    .map(mapAssetToTokenInfo);

  const canSwitchDebt = !!debtTokenInfo && nominalDebt !== "0";
  const canSwitchCollateral = !!debtTokenInfo;

  const toggleDropdown = (section: "collateral" | "debt") => {
    setActiveDropdown(prev => (prev === section ? null : section));
  };

  const handleSelectToken = (type: "collateral" | "debt", token: SwitchTokenInfo) => {
    if (!debtTokenInfo) return;
    if (type === "debt" && !canSwitchDebt) return;
    setSwitchModalState({ type, token });
    setActiveDropdown(null);
  };

  const closeSwitchModal = () => setSwitchModalState(null);

  // Format amounts with correct decimals
  const formattedCollateral = formatTokenAmount(collateralAmount, collateralMetadata.decimals);
  const formattedDebt = debtMetadata ? formatTokenAmount(nominalDebt, debtMetadata.decimals) : "0";
  const debtNum = parseFloat(formattedDebt);

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

  // Create a pre-selected collateral for the move position modal - after all conditionals
  const preSelectedCollateral: CollateralWithAmount[] = [
    {
      token: collateralAsset,
      symbol: collateralSymbol,
      amount: BigInt(collateralAmount),
      maxAmount: BigInt(collateralAmount),
      decimals: Number(collateralMetadata.decimals),
      supported: true,
      inputValue: formattedCollateral,
    },
  ];

  return (
    <>
      <div className="card bg-base-100 shadow-md relative">
        {activeDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-12 right-4 z-30 w-72 max-w-[85vw] rounded-xl border border-base-200 bg-base-100 p-3 shadow-xl space-y-4"
          >
            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-gray-500">
                <span>Switch collateral</span>
                {!canSwitchCollateral && (
                  <span className="text-[10px] font-normal text-error">Requires active debt</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {canSwitchCollateral && collateralOptions.length > 0 ? (
                  collateralOptions.map(token => (
                    <button
                      key={token.address}
                      type="button"
                      className="flex items-center gap-2 rounded-lg border border-base-300 px-2 py-2 text-left text-sm transition hover:bg-base-200"
                      onClick={() => handleSelectToken("collateral", token)}
                    >
                      <Image src={token.icon} alt={token.name} width={20} height={20} className="h-5 w-5 rounded-full" />
                      <span className="truncate">{token.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="col-span-2 text-[11px] text-gray-500">
                    {canSwitchCollateral ? "No alternative collateral" : "Open debt position to switch"}
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-base-200 pt-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-gray-500">
                <span>Switch debt</span>
                {!canSwitchDebt && (
                  <span className="text-[10px] font-normal text-gray-400">No active debt</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {canSwitchDebt && debtOptions.length > 0 ? (
                  debtOptions.map(token => (
                    <button
                      key={token.address}
                      type="button"
                      className="flex items-center gap-2 rounded-lg border border-base-300 px-2 py-2 text-left text-sm transition hover:bg-base-200"
                      onClick={() => handleSelectToken("debt", token)}
                    >
                      <Image src={token.icon} alt={token.name} width={20} height={20} className="h-5 w-5 rounded-full" />
                      <span className="truncate">{token.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="col-span-2 text-[11px] text-gray-500">
                    {canSwitchDebt ? "No alternative debt" : "Borrowed balance required"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="card-body p-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <Image
                src={tokenNameToLogo(collateralSymbol.toLowerCase())}
                alt={collateralSymbol}
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <span className="font-medium">{collateralSymbol}</span>
              {isVtoken && <span className="badge badge-sm badge-primary">vToken</span>}
            </div>
            {nominalDebt !== "0" && (
              <div className="flex items-center gap-2">
                <Image
                  src={tokenNameToLogo(debtSymbol.toLowerCase())}
                  alt={debtSymbol}
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
                <span className="font-medium">{debtSymbol}</span>
                <button
                  className="btn btn-circle btn-ghost btn-xs"
                  onClick={() => setIsCloseModalOpen(true)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Collateral Section */}
            <div className="space-y-2">
              <div className="text-2xl font-bold">${(Number(collateralValue) / 1e18).toFixed(3)}</div>
              <button
                type="button"
                onClick={() => toggleDropdown("collateral")}
                className="text-left text-lg text-gray-500 underline decoration-dotted underline-offset-4 transition hover:text-base-content"
              >
                {collateralSymbol === "ETH" ? parseFloat(formattedCollateral).toFixed(3) : formattedCollateral}{" "}
                {collateralSymbol}
              </button>

              <div className="divider my-1"></div>

              <div className="space-y-1">
                <div className="flex justify-between w-full gap-1">
                  <span className="text-sm text-gray-500">Supply APY</span>
                  <span className="text-sm font-medium text-success">
                    {formatPercentage(collateralRates.supplyAPY * 100, 3)}%
                  </span>
                </div>
                <div className="flex justify-end">
                  <span className="text-sm font-medium">${(Number(monthlyYield) / 1e18).toFixed(3)} per month</span>
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
                  <div className="text-2xl font-bold">${(Number(debtValue) / 1e18).toFixed(3)}</div>
                  <button
                    type="button"
                    onClick={() => toggleDropdown("debt")}
                    className="text-left text-lg text-gray-500 underline decoration-dotted underline-offset-4 transition hover:text-base-content"
                  >
                    {debtSymbol === "ETH" ? parseFloat(formattedDebt).toFixed(3) : formattedDebt} {debtSymbol}
                  </button>
                </>
              )}

              <div className="divider my-1"></div>

              <div className="space-y-1">
                {nominalDebt === "0" ? (
                  <div className="flex justify-between w-full gap-1">
                    <span className="text-sm text-gray-400">No debt</span>
                    <span className="text-sm font-medium text-gray-400">-</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between w-full gap-1">
                      <span className="text-sm text-gray-500">Borrow APR</span>
                      <span className="text-sm font-medium text-error">
                        {formatPercentage(debtRates.borrowAPR * 100, 3)}%
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <span className="text-sm font-medium">${(Number(monthlyCost) / 1e18).toFixed(3)} per month</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="divider my-2"></div>

          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500">
              Loan-to-value: <span className="font-medium">{formatPercentage(Number(ltv))}%</span>
            </span>
            {nominalDebt !== "0" && (
              <button className="btn btn-xs btn-outline btn-primary" onClick={() => setIsMoveModalOpen(true)}>
                Move Position
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex">
              <button
                className="btn btn-xs btn-primary rounded-r-none px-2 w-16"
                onClick={() => setIsDepositModalOpen(true)}
              >
                Deposit
              </button>
              <button
                className="btn btn-xs btn-secondary rounded-l-none border-l-0 px-2 w-16"
                onClick={() => setIsWithdrawModalOpen(true)}
              >
                Withdraw
              </button>
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
          usdPrice: collateralUsdPrice,
          decimals: Number(collateralMetadata.decimals),
        }}
        protocolName="Vesu"
        vesuContext={nominalDebt !== "0" ? { poolId, counterpartToken: debtAsset } : undefined}
        position={position}
      />

      <WithdrawModalStark
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        token={{
          name: collateralSymbol,
          icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
          address: collateralAsset,
          currentRate: collateralRates.supplyAPY * 100,
          usdPrice: collateralUsdPrice,
          decimals: Number(collateralMetadata.decimals),
        }}
        protocolName="Vesu"
        supplyBalance={BigInt(collateralAmount)}
        vesuContext={{ poolId, counterpartToken: debtAsset }}
        position={position}
      />

      <TokenSelectModalStark
        isOpen={isTokenSelectModalOpen}
        onClose={() => setIsTokenSelectModalOpen(false)}
        tokens={supportedAssets}
        protocolName="Vesu"
        collateralAsset={collateralAsset}
        isVesu={true}
        vesuContext={{ poolId, counterpartToken: collateralAsset }}
        position={position}
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
              usdPrice: debtUsdPrice,
              decimals: debtMetadata ? Number(debtMetadata.decimals) : 18,
            }}
            protocolName="Vesu"
            currentDebt={debtNum}
            vesuContext={{ poolId, counterpartToken: collateralAsset }}
            position={position}
          />

          <RepayModalStark
            isOpen={isRepayModalOpen}
            onClose={() => setIsRepayModalOpen(false)}
            token={{
              name: debtSymbol,
              icon: tokenNameToLogo(debtSymbol.toLowerCase()),
              address: debtAsset,
              currentRate: debtRates.borrowAPR * 100,
              usdPrice: debtUsdPrice,
              decimals: debtMetadata ? Number(debtMetadata.decimals) : 18,
            }}
            protocolName="Vesu"
            debtBalance={BigInt(nominalDebt)}
            vesuContext={{ poolId, counterpartToken: collateralAsset }}
            position={position}
          />

          <MovePositionModal
            isOpen={isMoveModalOpen}
            onClose={() => setIsMoveModalOpen(false)}
            fromProtocol="Vesu"
            position={{
              name: debtSymbol,
              balance: BigInt(nominalDebt),
              type: "borrow",
              tokenAddress: debtAsset,
              decimals: debtMetadata ? Number(debtMetadata.decimals) : Number(18),
              poolId: poolId,
            }}
            preSelectedCollaterals={preSelectedCollateral}
            disableCollateralSelection={true}
          />

          <ClosePositionModalStark
            isOpen={isCloseModalOpen}
            onClose={() => setIsCloseModalOpen(false)}
            collateral={{
              name: collateralSymbol,
              address: collateralAsset,
              decimals: Number(collateralMetadata.decimals),
              icon: tokenNameToLogo(collateralSymbol.toLowerCase()),
            }}
            debt={{
              name: debtSymbol,
              address: debtAsset,
              decimals: debtMetadata ? Number(debtMetadata.decimals) : 18,
              icon: tokenNameToLogo(debtSymbol.toLowerCase()),
            }}
            collateralBalance={BigInt(collateralAmount)}
            debtBalance={BigInt(nominalDebt)}
            poolId={poolId}
          />
        </>
      )}

      {switchModalState && debtTokenInfo && (
        <SwitchVesuModalStark
          isOpen={!!switchModalState}
          onClose={closeSwitchModal}
          type={switchModalState.type}
          currentCollateral={collateralTokenInfo}
          currentDebt={debtTokenInfo}
          targetToken={switchModalState.token}
          collateralBalance={BigInt(collateralAmount)}
          debtBalance={BigInt(nominalDebt)}
          poolId={poolId}
        />
      )}
    </>
  );
};
