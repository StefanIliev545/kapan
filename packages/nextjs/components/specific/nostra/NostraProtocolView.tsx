import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useAccount } from "~~/hooks/useAccount";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";
import { BaseModal } from "../../modals/BaseModal";
import { NostraSwitchDebtModal } from "../../modals/stark/NostraSwitchDebtModal";
import { NostraClosePositionModal } from "../../modals/stark/NostraClosePositionModal";
import type { SwitchTokenInfo } from "~~/hooks/useNostraDebtSwitch";
import type { CloseTokenInfo } from "~~/hooks/useNostraClosePosition";

type UserPositionTuple = {
  0: bigint; // underlying token address
  1: bigint; // symbol
  2: bigint; // debt balance
  3: bigint; // collateral balance
};

type InterestState = {
  lending_rate: bigint;
  borrowing_rate: bigint;
  last_update_timestamp: bigint;
  lending_index: bigint;
  borrowing_index: bigint;
};

export const NostraProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  // Use zero address when wallet is not connected
  const queryAddress = connectedAddress ? BigInt(connectedAddress) : 0n;

  // Fetch all supported assets to display even when the user is not connected
  const { data: assetInfos } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  // Get user positions
  const { data: userPositions } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 10000,
  });

  // Map asset info to addresses and symbols
  const { tokenAddresses, symbolMap } = useMemo(() => {
    if (!assetInfos) return { tokenAddresses: [], symbolMap: {} };
    const infos = assetInfos as unknown as any[];
    const tokenAddresses = infos.map(info => `0x${info[0].toString(16).padStart(64, "0")}`);
    const symbolMap = infos.reduce(
      (acc, info) => {
        acc[`0x${info[0].toString(16).padStart(64, "0")}`] = feltToString(info[1]);
        return acc;
      },
      {} as Record<string, string>,
    );
    return { tokenAddresses, symbolMap };
  }, [assetInfos]);

  // Build a map of user positions keyed by token address
  const userPositionMap = useMemo(() => {
    if (!userPositions) return {} as Record<string, UserPositionTuple>;
    const positions = userPositions as unknown as UserPositionTuple[];
    return positions.reduce((acc, position) => {
      const addr = `0x${position[0].toString(16).padStart(64, "0")}`;
      acc[addr] = position;
      return acc;
    }, {} as Record<string, UserPositionTuple>);
  }, [userPositions]);

  // Get interest rates for all supported assets
  const { data: interestRates } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [tokenAddresses],
    refetchInterval: 0,
  });

  const { data: tokenDecimals } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_token_decimals",
    args: [tokenAddresses],
  });

  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [tokenAddresses],
  });

  const { tokenToDecimals, tokenToPrices } = useMemo(() => {
    if (!tokenDecimals) return { tokenToDecimals: {}, tokenToPrices: {} };
    const decimals = tokenDecimals as unknown as bigint[];
    const prices = tokenPrices as unknown as bigint[];
    const tokenToDecimals = decimals.reduce(
      (acc, decimals, index) => {
        acc[tokenAddresses[index]] = Number(decimals);
        return acc;
      },
      {} as Record<string, number>,
    );
    const tokenToPrices =
      prices?.reduce(
        (acc, price, index) => {
          acc[tokenAddresses[index]] = price / 10n ** 10n; // haven't figured out why this works but fuck it.
          return acc;
        },
        {} as Record<string, bigint>,
      ) ?? {};
    return { tokenToDecimals, tokenToPrices };
  }, [tokenDecimals, tokenAddresses, tokenPrices]);

  // Aggregate positions by iterating over all supported tokens
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];
    const rates = interestRates as unknown as InterestState[] | undefined;

    tokenAddresses.forEach((underlying, index) => {
      const position = userPositionMap[underlying];
      const debtBalance = position ? position[2] : 0n;
      const collateralBalance = position ? position[3] : 0n;
      const symbol = symbolMap[underlying];
      const interestRate = rates?.[index];

      // Convert rates from WAD (1e18) to percentage values
      // Divide by 1e16 to account for the 1e2 factor when converting to percent
      const supplyAPY = interestRate ? Number(interestRate.lending_rate) / 1e16 : 0;
      const borrowAPR = interestRate ? Number(interestRate.borrowing_rate) / 1e16 : 0;

      // Convert token amounts to numbers and multiply by USD price to get fiat value
      const decimals = tokenToDecimals[underlying];
      const tokenPrice = tokenToPrices[underlying] ?? 0n;
      const tokenPriceNumber = Number(tokenPrice) / 1e8; // tokenPrice has 8 decimals of precision
      const suppliedAmount = Number(formatUnits(collateralBalance, decimals));
      const borrowedAmount = Number(formatUnits(debtBalance, decimals));

      supplied.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: suppliedAmount * tokenPriceNumber,
        tokenBalance: collateralBalance,
        currentRate: supplyAPY,
        tokenAddress: underlying,
        tokenDecimals: decimals,
        tokenPrice,
      });

      borrowed.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: -borrowedAmount * tokenPriceNumber,
        tokenBalance: debtBalance,
        currentRate: borrowAPR,
        tokenAddress: underlying,
        tokenDecimals: decimals,
        tokenPrice,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [tokenAddresses, userPositionMap, symbolMap, interestRates, tokenToDecimals, tokenToPrices]);

  const [switchDebtSource, setSwitchDebtSource] = useState<ProtocolPosition | null>(null);
  const [isSwitchTokenModalOpen, setIsSwitchTokenModalOpen] = useState(false);
  const [switchTargetAddress, setSwitchTargetAddress] = useState<string | null>(null);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [closeDebtPosition, setCloseDebtPosition] = useState<ProtocolPosition | null>(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const tokenMetadata = useMemo(
    () =>
      tokenAddresses.map(address => {
        const symbol = symbolMap[address] ?? "";
        const decimals = tokenToDecimals[address] ?? 18;
        const borrowInfo = borrowedPositions.find(pos => pos.tokenAddress === address);
        return {
          address,
          symbol,
          decimals,
          borrowAPR: borrowInfo?.currentRate ?? 0,
          icon: tokenNameToLogo(symbol.toLowerCase()),
        };
      }),
    [tokenAddresses, symbolMap, tokenToDecimals, borrowedPositions],
  );

  const selectableTargets = useMemo(
    () => tokenMetadata.filter(meta => meta.address !== (switchDebtSource?.tokenAddress ?? "")),
    [tokenMetadata, switchDebtSource?.tokenAddress],
  );

  const handleOpenSwitch = (position: ProtocolPosition) => {
    setSwitchDebtSource(position);
    setSwitchTargetAddress(null);
    setIsSwitchTokenModalOpen(true);
  };

  const handleCloseSwitchPicker = () => {
    setIsSwitchTokenModalOpen(false);
    setSwitchTargetAddress(null);
    setSwitchDebtSource(null);
  };

  const handleSelectTarget = (address: string) => {
    setSwitchTargetAddress(address);
    setIsSwitchTokenModalOpen(false);
    setIsSwitchModalOpen(true);
  };

  const handleSwitchModalClose = () => {
    setIsSwitchModalOpen(false);
    setSwitchTargetAddress(null);
    setSwitchDebtSource(null);
  };

  const handleOpenClosePosition = (position: ProtocolPosition) => {
    setCloseDebtPosition(position);
    setIsCloseModalOpen(true);
  };

  const handleClosePositionModal = () => {
    setIsCloseModalOpen(false);
    setCloseDebtPosition(null);
  };

  const currentDebtInfo: SwitchTokenInfo | null = useMemo(() => {
    if (!switchDebtSource) return null;
    return {
      name: switchDebtSource.name,
      address: switchDebtSource.tokenAddress,
      decimals: switchDebtSource.tokenDecimals ?? 18,
      icon: switchDebtSource.icon,
    };
  }, [switchDebtSource]);

  const targetDebtInfo: SwitchTokenInfo | null = useMemo(() => {
    if (!switchTargetAddress) return null;
    const meta = tokenMetadata.find(token => token.address === switchTargetAddress);
    if (!meta) return null;
    return {
      name: meta.symbol,
      address: meta.address,
      decimals: meta.decimals,
      icon: meta.icon,
    };
  }, [switchTargetAddress, tokenMetadata]);

  const closeDebtInfo: CloseTokenInfo | null = useMemo(() => {
    if (!closeDebtPosition) return null;
    return {
      name: closeDebtPosition.name,
      address: closeDebtPosition.tokenAddress,
      decimals: closeDebtPosition.tokenDecimals ?? 18,
      icon: closeDebtPosition.icon,
    };
  }, [closeDebtPosition]);

  const switchDebtBalance = switchDebtSource?.tokenBalance ?? 0n;
  const closeDebtBalance = closeDebtPosition?.tokenBalance ?? 0n;

  const enhancedSuppliedPositions = useMemo(
    () =>
      suppliedPositions.map(position => ({
        ...position,
        extraActions: (
          <button
            type="button"
            className="btn btn-sm btn-outline btn-block"
            disabled
            title="Collateral switching coming soon"
          >
            Switch collateral (coming soon)
          </button>
        ),
      })),
    [suppliedPositions],
  );

  const enhancedBorrowedPositions = useMemo(
    () =>
      borrowedPositions.map(position => ({
        ...position,
        availableActions: { ...position.availableActions, move: false },
        extraActions: (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={event => {
                event.stopPropagation();
                handleOpenSwitch(position);
              }}
            >
              Switch debt
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline btn-error"
              onClick={event => {
                event.stopPropagation();
                handleOpenClosePosition(position);
              }}
            >
              Close position
            </button>
          </div>
        ),
      })),
    [borrowedPositions],
  );

  return (
    <>
      <ProtocolView
        protocolName="Nostra"
        protocolIcon="/logos/nostra.svg"
        ltv={75}
        maxLtv={90}
        suppliedPositions={enhancedSuppliedPositions}
        borrowedPositions={enhancedBorrowedPositions}
        forceShowAll={!connectedAddress}
        networkType="starknet"
        disableMoveSupply
      />

      <BaseModal
        isOpen={isSwitchTokenModalOpen}
        onClose={handleCloseSwitchPicker}
        maxWidthClass="max-w-md"
        boxClassName="p-4"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Select new debt token</h3>
            <button className="btn btn-ghost btn-sm" onClick={handleCloseSwitchPicker}>
              Cancel
            </button>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectableTargets.length === 0 ? (
              <div className="text-sm text-base-content/60">No other assets available.</div>
            ) : (
              selectableTargets.map(meta => (
                <button
                  key={meta.address}
                  type="button"
                  className="w-full rounded-md border border-base-300 p-3 flex items-center justify-between hover:border-primary transition-colors"
                  onClick={() => handleSelectTarget(meta.address)}
                >
                  <div className="flex items-center gap-2">
                    <Image src={meta.icon} alt={meta.symbol} width={28} height={28} className="rounded-full" />
                    <div>
                      <div className="font-medium">{meta.symbol}</div>
                      <div className="text-xs text-base-content/60">{meta.borrowAPR.toFixed(2)}% APR</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </BaseModal>

      <NostraSwitchDebtModal
        isOpen={isSwitchModalOpen}
        onClose={handleSwitchModalClose}
        currentDebt={currentDebtInfo}
        targetDebt={targetDebtInfo}
        debtBalance={switchDebtBalance}
      />

      <NostraClosePositionModal
        isOpen={isCloseModalOpen}
        onClose={handleClosePositionModal}
        debt={closeDebtInfo}
        debtBalance={closeDebtBalance}
      />
    </>
  );
};

export default NostraProtocolView;
