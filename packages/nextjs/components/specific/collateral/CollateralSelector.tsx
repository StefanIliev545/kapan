import React, { FC, useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { FiX } from "react-icons/fi";
import { formatUnits, parseUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { CollateralSwitchButton } from "./CollateralSwitchButton";

// Define types for collateral
export interface CollateralToken {
  symbol: string;
  balance: number;
  address: string;
  decimals: number;
  rawBalance: bigint;
  supported: boolean;
}

export interface CollateralWithAmount {
  token: string; // address
  amount: bigint;
  symbol: string;
  decimals: number;
  maxAmount: bigint;
  inputValue?: string; // For in-progress decimal inputs
  supported: boolean;
}

interface CollateralSelectorProps {
  collaterals: CollateralToken[];
  isLoading: boolean;
  selectedProtocol?: string;
  marketToken: string;
  onCollateralSelectionChange: (collaterals: CollateralWithAmount[]) => void;
  onMaxClick?: (collateralToken: string, maxAmount: bigint, formattedMaxAmount: string) => void;
  hideAmounts?: boolean;
  initialSelectedCollaterals?: CollateralWithAmount[];
}

export const CollateralSelector: FC<CollateralSelectorProps> = ({
  collaterals,
  isLoading,
  selectedProtocol,
  marketToken,
  onCollateralSelectionChange,
  onMaxClick,
  hideAmounts = false,
  initialSelectedCollaterals,
}) => {
  // Store selected collaterals with amounts
  const [selectedCollaterals, setSelectedCollaterals] = useState<CollateralWithAmount[]>([]);

  useEffect(() => {
    if (
      initialSelectedCollaterals &&
      initialSelectedCollaterals.length > 0 &&
      selectedCollaterals.length === 0
    ) {
      setSelectedCollaterals(initialSelectedCollaterals);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedCollaterals]);
  
  // Create a memoized version of the collateral support mapping
  const collateralSupportMap = useMemo(() => {
    return collaterals.reduce((acc, collateral) => {
      acc[collateral.address] = collateral.supported;
      return acc;
    }, {} as Record<string, boolean>);
  }, [collaterals]);
  
  // Sort collaterals to show selectable ones first, then by balance, then alphabetically
  const sortedCollaterals = useMemo(() => {
    return [...collaterals].sort((a, b) => {
      const aSelectable = a.supported && a.rawBalance > 0n;
      const bSelectable = b.supported && b.rawBalance > 0n;
      
      // Primary sort: selectable items first
      if (aSelectable && !bSelectable) return -1;
      if (!aSelectable && bSelectable) return 1;
      
      // Secondary sort: if both are selectable, sort by balance (descending)
      if (aSelectable && bSelectable) {
        if (a.balance > b.balance) return -1;
        if (a.balance < b.balance) return 1;
      }
      
      // Tertiary sort: alphabetically by symbol
      return a.symbol.localeCompare(b.symbol);
    });
  }, [collaterals]);
  
  // Format max amount with fewer decimals
  const formatMaxAmount = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0.00";
    // For very small numbers, show limited precision
    if (num > 0 && num < 0.01) return "<0.01";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2, // Limit to 2 decimal places
    }).format(num);
  };

  // Format balance with limited decimal places
  const formatBalance = (balance: number) => {
    // For very small numbers, show more precision
    if (balance > 0 && balance < 0.01) return "<0.01";
    
    // For larger numbers, limit to 2 decimal places
    return balance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Handle selecting a collateral
  const handleCollateralToggle = (collateral: CollateralToken) => {
    // Don't allow selection if the collateral is not supported or has zero balance
    if (!collateral.supported || collateral.rawBalance <= 0n) return;
    
    setSelectedCollaterals(prev => {
      // Check if collateral is already selected
      const existingIndex = prev.findIndex(c => c.token === collateral.address);
      
      if (existingIndex >= 0) {
        // Remove it if already selected
        return prev.filter(c => c.token !== collateral.address);
      } else {
        // Add it with default amount = 0
        return [
          ...prev,
          {
            token: collateral.address,
            amount: 0n,
            symbol: collateral.symbol,
            decimals: collateral.decimals,
            maxAmount: collateral.rawBalance,
            // Track whether this collateral is supported in the current protocol
            supported: collateral.supported
          },
        ];
      }
    });
  };

  // Update selected collaterals when protocol changes
  useEffect(() => {
    if (!selectedProtocol) return;
  
    // Update selected collaterals when collateral support changes
    setSelectedCollaterals(prev => {
      const updated = prev.map(c => ({
        ...c,
        supported: collateralSupportMap[c.token] ?? false,
      }));
  
      // Check if any 'supported' value has changed
      const hasChanged = updated.some((collateral, index) => {
        return collateral.supported !== prev[index].supported;
      });
  
      // Only update state if there's a difference
      return hasChanged ? updated : prev;
    });
  }, [collateralSupportMap, selectedProtocol]);
  
  // Handle amount change for a selected collateral
  const handleAmountChange = (token: string, amountStr: string, decimals: number) => {
    setSelectedCollaterals(prev => {
      return prev.map(c => {
        if (c.token === token) {
          try {
            // Check if the input is empty or in the process of being entered (like "0." or "1.")
            if (amountStr === "" || amountStr === "0" || amountStr === "." || amountStr === "0." || /^\d*\.?\d*$/.test(amountStr)) {
              // For in-progress decimal inputs, keep the string value but set amount to 0 temporarily
              if (amountStr === "." || amountStr === "0." || /^\d+\.$/.test(amountStr)) {
                return { ...c, amount: 0n, inputValue: amountStr };
              }
              
              // For valid numbers, convert to bigint
              try {
                // Check if the amount exceeds max before applying
                let amount = parseUnits(amountStr, decimals);
                
                // If entered amount is greater than max, cap it at maximum
                if (amount > c.maxAmount) {
                  amount = c.maxAmount;
                  // Format the max amount for display
                  const maxAmountStr = formatUnits(c.maxAmount, decimals);
                  // Update inputValue to show max value
                  return { ...c, amount, inputValue: maxAmountStr };
                }
                
                // Otherwise use the entered amount
                return { ...c, amount, inputValue: undefined };
              } catch {
                // If parseUnits fails but the string looks like a number in progress, keep it
                return { ...c, amount: 0n, inputValue: amountStr };
              }
            } else {
              // Invalid input, keep current amount
              return c;
            }
          } catch {
            // If anything goes wrong, keep the current amount
            return c;
          }
        }
        return c;
      });
    });
  };

  // Modify the handleSetMax function to call onMaxClick when provided
  const handleSetMax = (token: string) => {
    const selected = selectedCollaterals.find(c => c.token === token);
    if (selected) {
      const maxAmount = selected.maxAmount;
      const formattedMaxAmount = formatUnits(maxAmount, selected.decimals);
      
      // Update local state
      const updated = selectedCollaterals.map(c =>
        c.token === token ? { ...c, amount: maxAmount, inputValue: formattedMaxAmount } : c
      );
      setSelectedCollaterals(updated);
      onCollateralSelectionChange(updated);
      
      // Call the onMaxClick handler if provided
      if (onMaxClick) {
        onMaxClick(token, maxAmount, formattedMaxAmount);
      }
    }
  };

  // Handle removing a collateral from the selected list
  const handleRemoveCollateral = (token: string) => {
    setSelectedCollaterals(prev => prev.filter(c => c.token !== token));
  };

  // Update the parent component when selection changes
  useEffect(() => {
    onCollateralSelectionChange(selectedCollaterals);
  }, [selectedCollaterals, onCollateralSelectionChange]);

  // Check if a collateral is selected
  const isCollateralSelected = (address: string) => {
    return selectedCollaterals.some(c => c.token === address);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-base-content/80">Select Collateral to Move</label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 bg-base-200/50 rounded-lg">
          <span className="loading loading-spinner loading-md"></span>
          <span className="ml-2 text-base-content/70">Checking collateral support...</span>
        </div>
      ) : sortedCollaterals.length > 0 ? (
        <div className="bg-base-200/30 p-4 rounded-lg">
          <div className="space-y-2">
            {sortedCollaterals.map(collateral => {
              const hasZeroBalance = collateral.rawBalance <= 0n;
              const isDisabled = !collateral.supported || hasZeroBalance;

              return (
                <button
                  key={collateral.address}
                  onClick={() => handleCollateralToggle(collateral)}
                  className={`
                    btn btn-block h-auto py-2 px-3 normal-case flex items-center gap-2 justify-start
                    ${isCollateralSelected(collateral.address) ? "btn-primary" : "btn-outline bg-base-100"}
                    ${isDisabled ? "opacity-50 cursor-not-allowed tooltip" : ""}
                  `}
                  disabled={isDisabled}
                  data-tip={
                    isDisabled
                      ? hasZeroBalance
                        ? "Zero balance"
                        : !collateral.supported
                          ? `Not supported in ${selectedProtocol}`
                          : ""
                      : undefined
                  }
                >
                  <div className="w-6 h-6 relative flex-shrink-0">
                    <Image
                      src={tokenNameToLogo(collateral.symbol)}
                      alt={collateral.symbol}
                      fill
                      className="rounded-full object-contain"
                    />
                  </div>
                  <div className="flex flex-col items-start overflow-hidden">
                    <span className="truncate font-medium w-full">{collateral.symbol}</span>
                    <span className="text-xs opacity-70 tabular-nums">
                      {formatBalance(collateral.balance)}
                    </span>
                  </div>
                  {!collateral.supported && <span className="text-xs px-1 bg-base-300 rounded-full ml-auto">!</span>}
                  {hasZeroBalance && <span className="text-xs px-1 bg-base-300 rounded-full ml-auto">0</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg">
          No collateral available to move
        </div>
      )}

      {/* Vertical list of selected collaterals with amount inputs */}
      {!hideAmounts && selectedCollaterals.length > 0 && (
        <div className="mt-4 space-y-2">
          <label className="block text-lg font-semibold text-center">Collateral</label>
          <div className="bg-base-200/40 p-4 rounded-lg space-y-3">
            {selectedCollaterals.map((collateral) => {
              // Format human-readable amount for display
              const displayAmount = collateral.inputValue 
                ? collateral.inputValue
                : collateral.amount === 0n 
                  ? "" 
                  : formatUnits(collateral.amount, collateral.decimals);
              
              // Format max amount for display
              const maxAmountStr = formatUnits(collateral.maxAmount, collateral.decimals);
              const maxAmount = formatMaxAmount(maxAmountStr);
              
              // Check if this collateral is supported in the current protocol
              const isSupported = collateral.supported;
              
              return (
                <div 
                  key={collateral.token} 
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-md bg-base-100 border border-base-300/50 shadow-sm ${!isSupported ? 'opacity-60' : ''}`}
                >
                  {/* Left side: Token icon and info - fixed width */}
                  <div className="flex items-center gap-2 w-[160px] flex-shrink-0">
                    <div className="w-7 h-7 relative flex-shrink-0">
                      <Image
                        src={tokenNameToLogo(collateral.symbol)}
                        alt={collateral.symbol}
                        fill
                        className={`rounded-full object-contain ${!isSupported ? 'grayscale' : ''}`}
                      />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-medium truncate">{collateral.symbol}</span>
                      <span className="text-xs text-base-content/60">
                        Available: {maxAmount}
                      </span>
                      {!isSupported && (
                        <span className="text-xs text-error/80">Not supported in {selectedProtocol}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Switch button - fixed position */}
                  <div className="flex-shrink-0 relative">
                    <CollateralSwitchButton
                      currentCollateral={{
                        token: collateral.token,
                        symbol: collateral.symbol
                      }}
                      protocol={selectedProtocol || ""}
                      marketToken={marketToken}
                      onCollateralSwitch={(newToken, newSymbol) => {
                        // In a real implementation, this would switch the collateral
                        console.log(`Switch from ${collateral.symbol} to ${newSymbol}`);
                      }}
                    />
                  </div>
                  
                  {/* Input field - takes remaining space */}
                  <div className="flex-1">
                    <div className={`flex items-center bg-base-200/60 rounded-lg border border-base-300 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all ${!isSupported ? 'opacity-50' : ''}`}>
                      <input
                        type="text"
                        value={displayAmount}
                        onChange={(e) => handleAmountChange(collateral.token, e.target.value, collateral.decimals)}
                        className="flex-1 bg-transparent border-none focus:outline-none px-3 py-2 h-10 text-base-content"
                        placeholder="0.00"
                        disabled={!isSupported}
                      />
                      <button
                        className={`mr-2 px-2 py-0.5 text-xs font-medium bg-base-300 hover:bg-primary hover:text-white text-base-content/70 rounded transition-colors duration-200 ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={(e) => {
                          handleSetMax(collateral.token);
                        }}
                        disabled={!isSupported}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {/* Remove button - fixed width */}
                  <div className="flex-shrink-0">
                    <button
                      className="btn btn-ghost btn-sm text-base-content/70 p-1 h-8 w-8 flex items-center justify-center hover:bg-error/10 hover:text-error"
                      onClick={() => handleRemoveCollateral(collateral.token)}
                      title="Remove collateral"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}; 