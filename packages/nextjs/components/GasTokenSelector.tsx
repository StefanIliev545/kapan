"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { usePaymasterGasTokens } from "@starknet-react/core";

import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { GasTokenComponent } from "./GasTokenComponent";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import {
  useVesuGasSources,
  type VesuGasBorrowOption,
  type VesuGasCollateralOption,
  type VesuGasOptionPair,
} from "~~/hooks/useVesuGasSources";

const DEFAULT_GAS_TOKEN = {
  name: "STRK",
  symbol: "STRK",
  icon: "/logos/strk.svg",
  address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  balance: "0.00",
};

interface TokenInfo {
  address: string;
  decimals: number;
}

const normalizeAddress = (value?: string | null) => (value ? value.toLowerCase() : "");

interface VesuStrategyHalfProps {
  option?: VesuGasCollateralOption | VesuGasBorrowOption;
  variant: "collateral" | "borrow";
  isSelected: boolean;
  onSelect: (option: VesuGasCollateralOption | VesuGasBorrowOption) => void;
}

const VesuStrategyHalf = ({ option, variant, isSelected, onSelect }: VesuStrategyHalfProps) => {
  const isCollateral = variant === "collateral";
  const label = isCollateral ? "Collateral" : "Debt";

  const handleClick = () => {
    if (!option) return;
    onSelect(option);
  };

  const formattedBalance = (() => {
    if (!option) return "-";
    if (isCollateral) {
      return (option as VesuGasCollateralOption).formattedBalance;
    }
    const outstanding = (option as VesuGasBorrowOption).formattedOutstanding;
    return outstanding.startsWith("-") ? outstanding : `-${outstanding}`;
  })();

  const estimatedAmount = option
    ? isCollateral
      ? (option as VesuGasCollateralOption).formattedEstimate
      : (option as VesuGasBorrowOption).formattedEstimate
    : undefined;

  const counterpart = option?.counterpartSymbol;
  const icon = option?.icon;
  const tokenSymbol = option?.tokenSymbol;

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={!option}
      whileHover={option ? { y: -1 } : undefined}
      className={`flex h-full w-full flex-col items-center gap-2 p-3 transition-all duration-200 ${
        option
          ? isSelected
            ? "bg-primary/10"
            : "hover:bg-base-300/60"
          : "opacity-50"
      }`}
    >
      <div className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
        <span>{label}</span>
        {tokenSymbol && <span className="text-base-content/60">{tokenSymbol}</span>}
      </div>

      <div className="flex w-full items-center justify-between text-[10px] text-base-content/40">
        <span>{counterpart ? `↔ ${counterpart}` : ""}</span>
        {estimatedAmount && <span>≈ {estimatedAmount}</span>}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="relative h-9 w-9">
          {icon ? (
            <Image src={icon} alt={`${tokenSymbol ?? label} icon`} fill className="rounded-md object-contain" />
          ) : (
            <div className="h-full w-full rounded-md bg-base-300" />
          )}
        </div>
        <div className="text-sm font-semibold text-base-content">{formattedBalance}</div>
      </div>
    </motion.button>
  );
};

interface VesuStrategyPairCardProps {
  pair: VesuGasOptionPair;
  onCollateralSelect: (option: VesuGasCollateralOption) => void;
  onDebtSelect: (option: VesuGasBorrowOption) => void;
  isCollateralSelected: boolean;
  isDebtSelected: boolean;
}

const VesuStrategyPairCard = ({
  pair,
  onCollateralSelect,
  onDebtSelect,
  isCollateralSelected,
  isDebtSelected,
}: VesuStrategyPairCardProps) => {
  const { collateral, debt } = pair;

  return (
    <div
      className={`grid h-full grid-cols-2 divide-x divide-base-300/40 overflow-hidden rounded-xl border transition-all duration-200 ${
        isCollateralSelected || isDebtSelected ? "border-primary/60 shadow" : "border-base-300/40 bg-base-200/60"
      }`}
    >
      <VesuStrategyHalf
        option={collateral}
        variant="collateral"
        isSelected={isCollateralSelected}
        onSelect={option => onCollateralSelect(option as VesuGasCollateralOption)}
      />
      <VesuStrategyHalf
        option={debt}
        variant="borrow"
        isSelected={isDebtSelected}
        onSelect={option => onDebtSelect(option as VesuGasBorrowOption)}
      />
    </div>
  );
};

export const GasTokenSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { selectedToken, updateSelectedToken } = useSelectedGasToken();
  const { data: paymasterTokens, error: paymasterError, isLoading } = usePaymasterGasTokens({ enabled: true });
  const { pairs: vesuPairs, isLoading: vesuLoading, error: vesuError } = useVesuGasSources();

  useOutsideClick(dropdownRef, () => setIsOpen(false));

  const availableTokens = useMemo(() => {
    const list: TokenInfo[] = (paymasterTokens || [])
      .map((token: any) => {
        const address = token?.token_address;
        if (!address) return null;
        const decimalsRaw = Number(token?.decimals ?? 18);
        const decimals = Number.isFinite(decimalsRaw) ? decimalsRaw : 18;
        return { address, decimals } as TokenInfo;
      })
      .filter((token): token is TokenInfo => token !== null);

    if (list.length === 0) {
      return [{ address: DEFAULT_GAS_TOKEN.address, decimals: 18 }];
    }

    const deduped = new Map<string, TokenInfo>();
    list.forEach(token => {
      deduped.set(token.address.toLowerCase(), token);
    });
    return Array.from(deduped.values());
  }, [paymasterTokens]);

  const handleDefaultTokenSelect = () => {
    setIsOpen(false);
  };

  const handleCollateralSelect = (option: VesuGasCollateralOption) => {
    updateSelectedToken({
      address: option.tokenAddress,
      symbol: option.tokenSymbol,
      name: option.tokenSymbol,
      icon: option.icon,
      balance: option.formattedBalance,
      decimals: option.tokenDecimals,
      mode: "collateral",
      protocol: "vesu",
      amount: option.estimateAmount.toString(),
      useMax: false,
      vesuContext: {
        poolId: option.poolIdString,
        counterpartToken: option.counterpartToken,
      },
    });
    setIsOpen(false);
  };

  const handleBorrowSelect = (option: VesuGasBorrowOption) => {
    updateSelectedToken({
      address: option.tokenAddress,
      symbol: option.tokenSymbol,
      name: option.tokenSymbol,
      icon: option.icon,
      balance: option.formattedOutstanding,
      decimals: option.tokenDecimals,
      mode: "borrow",
      protocol: "vesu",
      amount: option.estimateAmount.toString(),
      vesuContext: {
        poolId: option.poolIdString,
        counterpartToken: option.counterpartToken,
      },
    });
    setIsOpen(false);
  };

  const protocolKey = selectedToken.protocol?.toLowerCase();
  const selectedMode = selectedToken.mode ?? "default";

  const isCollateralSelected = (option: VesuGasCollateralOption) => {
    if (selectedMode !== "collateral" || protocolKey !== "vesu") return false;
    return (
      normalizeAddress(selectedToken.address) === normalizeAddress(option.tokenAddress) &&
      normalizeAddress(selectedToken.vesuContext?.counterpartToken) === normalizeAddress(option.counterpartToken) &&
      selectedToken.vesuContext?.poolId === option.poolIdString
    );
  };

  const isBorrowSelected = (option: VesuGasBorrowOption) => {
    if (selectedMode !== "borrow" || protocolKey !== "vesu") return false;
    return (
      normalizeAddress(selectedToken.address) === normalizeAddress(option.tokenAddress) &&
      normalizeAddress(selectedToken.vesuContext?.counterpartToken) === normalizeAddress(option.counterpartToken) &&
      selectedToken.vesuContext?.poolId === option.poolIdString
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        type="button"
        className="flex items-center gap-2 rounded p-1 transition-colors duration-200 hover:bg-base-300/50"
        onClick={() => setIsOpen(previous => !previous)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="h-4 w-4 text-base-content/70">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3h1c.55 0 1 .45 1 1v3.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5z" />
          </svg>
        </div>

        <div className="relative h-4 w-4">
          <Image src={selectedToken.icon} alt={selectedToken.name} fill className="object-contain" />
        </div>

        <ChevronDownIcon
          className={`h-4 w-4 text-base-content/50 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 z-50 mt-2 max-h-[480px] min-w-[360px] overflow-auto rounded-lg border border-base-300/50 bg-base-100 p-3 shadow-xl"
          >
            <div className="text-sm font-medium text-base-content/70">Select Gas Token</div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {availableTokens.map((tokenInfo, index) => (
                <GasTokenComponent
                  key={`${tokenInfo.address}-${index}`}
                  address={tokenInfo.address}
                  decimals={tokenInfo.decimals}
                  isSelected={normalizeAddress(selectedToken.address) === normalizeAddress(tokenInfo.address)}
                  onSelect={handleDefaultTokenSelect}
                />
              ))}
            </div>

            {isLoading && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-base-content/60">
                <span className="loading loading-spinner loading-xs" /> Fetching supported tokens…
              </div>
            )}

            {paymasterError && (
              <div className="mt-2 rounded-md border border-error/40 bg-error/10 p-2 text-[11px] text-error">
                Failed to load paymaster tokens.
              </div>
            )}

            <div className="mt-5 space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-base-content/60">Vesu</div>
                <div className="mt-1 h-px bg-base-300/40" />
              </div>

              {vesuLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-base-content/60">
                  <span className="loading loading-spinner loading-xs" /> Loading Vesu positions…
                </div>
              ) : vesuError ? (
                <div className="rounded-md border border-error/40 bg-error/10 p-2 text-[11px] text-error">
                  Unable to load Vesu positions.
                </div>
              ) : vesuPairs.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {vesuPairs.map(pair => (
                    <VesuStrategyPairCard
                      key={pair.id}
                      pair={pair}
                      onCollateralSelect={handleCollateralSelect}
                      onDebtSelect={handleBorrowSelect}
                      isCollateralSelected={pair.collateral ? isCollateralSelected(pair.collateral) : false}
                      isDebtSelected={pair.debt ? isBorrowSelected(pair.debt) : false}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-base-300/30 bg-base-200/40 p-3 text-[11px] text-base-content/60">
                  No eligible collateral positions found.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
