"use client";

import { FC, useCallback, useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useReadContract } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { universalErc20Abi } from "~~/utils/Constants";
import { feltToString, formatTokenAmount } from "~~/utils/protocols";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import { truncateAddress } from "~~/utils/address";

// Static animation variants - extracted to module level to avoid recreation
const BUTTON_HOVER = { y: -1 };
const BUTTON_TAP = { scale: 0.98 };
const SELECTED_INDICATOR_INITIAL = { scale: 0 };
const SELECTED_INDICATOR_ANIMATE = { scale: 1 };

// Static fallback icon path
const FALLBACK_ICON = '/logos/x-logo.svg';

interface GasTokenComponentProps {
  address: string;
  decimals?: number;
  isSelected: boolean;
  onSelect: () => void;
}

interface GasToken {
  name: string;
  symbol: string;
  icon: string;
  address: string;
  balance: string;
  isSelectable: boolean;
}

// Tokens that have PNG logos instead of SVGs
const pngLogoMap: Record<string, string> = {
  ekubo: "/logos/ekubo.png",
  zend: "/logos/zend.png",
  dog: "/logos/dog.png",
  cash: "/logos/cash.png",
  brother: "/logos/brother.avif",
  sway: "/logos/sway.avif",
  lyu: "/logos/lyu.png",
};

// Get token icon with PNG overrides and fallback to question mark
const getTokenIcon = (tokenName: string): string => {
  if (!tokenName) return "/logos/x-logo.svg";
  const key = tokenName.toLowerCase().trim();
  const png = pngLogoMap[key];
  if (png) return png;
  return tokenNameToLogo(key);
};

export const GasTokenComponent: FC<GasTokenComponentProps> = ({
  address,
  decimals = 18,
  isSelected,
  onSelect,
}) => {
  const { address: accountAddress } = useAccount();
  const { updateSelectedToken } = useSelectedGasToken();

  // Fetch token name
  const { data: nameRaw, error: nameError, isLoading: nameLoading } = useReadContract({
    address: address as `0x${string}`,
    abi: universalErc20Abi,
    functionName: "name",
    args: [],
  });

  // Fetch token symbol
  const { data: symbolRaw, error: symbolError, isLoading: symbolLoading } = useReadContract({
    address: address as `0x${string}`,
    abi: universalErc20Abi,
functionName: "symbol",
    args: [],
  });

  // Fetch balance for connected account
  const { data: balanceRaw, error: balanceError, isLoading: balanceLoading } = useReadContract({
    address: address as `0x${string}`,
    abi: universalErc20Abi,
    functionName: "balance_of",
    args: accountAddress ? [accountAddress] : undefined,
    enabled: !!accountAddress,
  });

  const isLoading = nameLoading || symbolLoading || balanceLoading;
  const hasError = nameError || symbolError || balanceError;

  const token: GasToken = useMemo(() => {
    const decodeFelt = (v: unknown): string => {
      if (typeof v === "string") return v;
      if (typeof v === "bigint") return feltToString(v);
      if (Array.isArray(v) && v.length > 0) return feltToString(BigInt(v[0]));
      try { return String(v); } catch { return ""; }
    };

    const toBigInt = (v: any): bigint => {
      if (typeof v === "bigint") return v;
      if (typeof v === "number") return BigInt(v);
      if (typeof v === "string") return BigInt(v);
      if (Array.isArray(v) && v.length >= 2) {
        // u256 as [low, high]
        const low = BigInt(v[0]);
        const high = BigInt(v[1] || 0);
        return (high << 128n) + low;
      }
      if (v && typeof v === "object" && "low" in v && "high" in v) {
        const low = BigInt((v as any).low);
        const high = BigInt((v as any).high);
        return (high << 128n) + low;
      }
      return 0n;
    };

    let name = decodeFelt(nameRaw) || "";
    let symbol = decodeFelt(symbolRaw) || name || "";
    const normalizedAddress = (address || "").toLowerCase();
    if (normalizedAddress === "0x040e81cfeb176bfdbc5047bbc55eb471cfab20a6b221f38d8fda134e1bfffca4") {
      name = "dog";
      symbol = "dog";
    }
    const isNameMissing = !name || name.trim() === "";
    const balanceBig = balanceRaw ? toBigInt(balanceRaw) : 0n;
    const formattedBalance = formatTokenAmount(balanceBig.toString(), decimals);

    const finalName = isNameMissing ? "unknown" : (name || symbol || "Token");
    const finalSymbol = isNameMissing ? "unknown" : (symbol || name || "TKN");

    return {
      name: finalName,
      symbol: finalSymbol,
      icon: getTokenIcon(finalSymbol || finalName || "tkn"),
      address,
      balance: formattedBalance,
      isSelectable: !isNameMissing,
    };
  }, [nameRaw, symbolRaw, balanceRaw, address, decimals]);

  const handleSelect = useCallback(() => {
    const newToken = {
      address,
      symbol: token.symbol,
      name: token.name,
      icon: token.icon,
      balance: token.balance,
    };
    // Update the global selected token
    updateSelectedToken(newToken);
    // Call the local onSelect callback
    onSelect();
  }, [address, token.symbol, token.name, token.icon, token.balance, updateSelectedToken, onSelect]);

  // Memoized image error handler
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = FALLBACK_ICON;
  }, []);

  // Memoized animation variants based on token selectability
  const whileHover = token.isSelectable ? BUTTON_HOVER : undefined;
  const whileTap = token.isSelectable ? BUTTON_TAP : undefined;
  const handleClick = token.isSelectable ? handleSelect : undefined;

  // Show loading state if still fetching data
  if (isLoading) {
    return (
      <div className="bg-base-200 border-base-300/30 flex flex-col items-center rounded-lg border p-2">
        <div className="mb-1 flex size-6 items-center justify-center">
          <span className="loading loading-spinner loading-xs"></span>
        </div>
        <div className="text-base-content/50 mb-1 text-xs font-medium">
          Loading...
        </div>
        <div className="text-base-content/30 text-xs">
          {truncateAddress(address, 6, 0)}
        </div>
      </div>
    );
  }

  // Show error state if failed to load
  if (hasError) {
    return (
      <div className="bg-error/10 border-error/30 flex flex-col items-center rounded-lg border p-2">
        <div className="text-error mb-1 flex size-6 items-center justify-center">
          ⚠️
        </div>
        <div className="text-error mb-1 text-xs font-medium">
          Error
        </div>
        <div className="text-error/70 text-xs">
          {truncateAddress(address, 6, 0)}
        </div>
      </div>
    );
  }

  return (
    <motion.button
      className={`
        flex flex-col items-center rounded-lg border p-2 transition-all duration-200 ${token.isSelectable ? 'hover:scale-[1.02]' : ''}
        ${isSelected
          ? 'bg-primary/10 border-primary/30 shadow-sm'
          : token.isSelectable ? 'bg-base-200 border-base-300/30 hover:bg-base-300' : 'bg-base-200 border-base-300/30 cursor-not-allowed opacity-60'
        }
      `}
      onClick={handleClick}
      disabled={!token.isSelectable}
      whileHover={whileHover}
      whileTap={whileTap}
    >
      {/* Token Icon */}
      <div className="relative mb-1 size-6">
        <Image
          src={token.icon}
          alt={token.name}
          fill
          className="object-contain"
          onError={handleImageError}
        />
      </div>

      {/* Token Name */}
      <div className="text-base-content mb-1 text-xs font-medium">
        {token.symbol}
      </div>

      {/* Balance */}
      <div className="text-base-content/60 text-xs">
        {token.balance}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <motion.div
          initial={SELECTED_INDICATOR_INITIAL}
          animate={SELECTED_INDICATOR_ANIMATE}
          className="bg-primary absolute right-1 top-1 size-2 rounded-full"
        />
      )}
    </motion.button>
  );
};
