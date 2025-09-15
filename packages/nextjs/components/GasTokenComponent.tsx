"use client";

import { FC, useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useReadContract } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { universalErc20Abi } from "~~/utils/Constants";
import { feltToString, formatTokenAmount } from "~~/utils/protocols";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";

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
}

// Get token icon with fallback to question mark
const getTokenIcon = (tokenName: string): string => {
  if (!tokenName) return "/logos/question-mark.svg";
  
  try {
    return tokenNameToLogo(tokenName);
  } catch {
    return "/logos/question-mark.svg";
  }
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

    const name = decodeFelt(nameRaw) || "";
    const symbol = decodeFelt(symbolRaw) || name || "";
    const balanceBig = balanceRaw ? toBigInt(balanceRaw) : 0n;
    const formattedBalance = formatTokenAmount(balanceBig.toString(), decimals);

    return {
      name: name || symbol || "Token",
      symbol: symbol || name || "TKN",
      icon: getTokenIcon(symbol || name || "tkn"),
      address,
      balance: formattedBalance,
    };
  }, [nameRaw, symbolRaw, balanceRaw, address, decimals]);

  const handleSelect = () => {
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
  };

  // Show loading state if still fetching data
  if (isLoading) {
    return (
      <div className="flex flex-col items-center p-2 rounded-lg border bg-base-200 border-base-300/30">
        <div className="w-6 h-6 mb-1 flex items-center justify-center">
          <span className="loading loading-spinner loading-xs"></span>
        </div>
        <div className="text-xs font-medium text-base-content/50 mb-1">
          Loading...
        </div>
        <div className="text-xs text-base-content/30">
          {address.slice(0, 6)}...
        </div>
      </div>
    );
  }

  // Show error state if failed to load
  if (hasError) {
    return (
      <div className="flex flex-col items-center p-2 rounded-lg border bg-error/10 border-error/30">
        <div className="w-6 h-6 mb-1 flex items-center justify-center text-error">
          ⚠️
        </div>
        <div className="text-xs font-medium text-error mb-1">
          Error
        </div>
        <div className="text-xs text-error/70">
          {address.slice(0, 6)}...
        </div>
      </div>
    );
  }

  return (
    <motion.button
      className={`
        flex flex-col items-center p-2 rounded-lg border transition-all duration-200 hover:scale-[1.02]
        ${isSelected 
          ? 'bg-primary/10 border-primary/30 shadow-sm' 
          : 'bg-base-200 border-base-300/30 hover:bg-base-300'
        }
      `}
      onClick={handleSelect}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Token Icon */}
      <div className="w-6 h-6 relative mb-1">
        <Image
          src={token.icon}
          alt={token.name}
          fill
          className="object-contain"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/logos/question-mark.svg';
          }}
        />
      </div>

      {/* Token Name */}
      <div className="text-xs font-medium text-base-content mb-1">
        {token.symbol}
      </div>

      {/* Balance */}
      <div className="text-xs text-base-content/60">
        {token.balance}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full"
        />
      )}
    </motion.button>
  );
};
