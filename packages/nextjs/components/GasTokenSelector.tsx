"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { usePaymasterGasTokens } from "@starknet-react/core";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { GasTokenComponent } from "./GasTokenComponent";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import { formatUnits, parseUnits } from "viem";

// Default gas token (STRK)
const DEFAULT_GAS_TOKEN = {
  name: "STRK",
  symbol: "STRK", 
  icon: "/logos/strk.svg",
  address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK mainnet address
  balance: "0.00"
};


interface TokenInfo {
  address: string;
  decimals: number;
}

const CUSTOM_PROTOCOL_OPTIONS = [
  { value: "kapan", label: "Kapan Router" },
  { value: "vesu", label: "Vesu" },
];

export const GasTokenSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { selectedToken, updateTokenMetadata } = useSelectedGasToken();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modeInput, setModeInput] = useState<"default" | "sponsored" | "collateral" | "borrow">(
    selectedToken.mode ?? "default",
  );
  const [protocolInput, setProtocolInput] = useState(selectedToken.protocol ?? "");
  const [amountInput, setAmountInput] = useState("");
  const [useMaxInput, setUseMaxInput] = useState<boolean>(Boolean(selectedToken.useMax));
  const [vesuPoolIdInput, setVesuPoolIdInput] = useState(selectedToken.vesuContext?.poolId ?? "");
  const [vesuCounterpartInput, setVesuCounterpartInput] = useState(
    selectedToken.vesuContext?.counterpartToken ?? "",
  );
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const selectedDecimals = selectedToken.decimals ?? 18;

  // Fetch available gas tokens from paymaster
  // Note: This may fail if no paymaster is configured, which is expected
  const { data: paymasterTokens, error, isLoading } = usePaymasterGasTokens({
    enabled: true, // Enable the query
  });

  useOutsideClick(dropdownRef, () => setIsOpen(false));

  // Normalize token list from paymaster to get addresses and decimals
  const availableTokens: TokenInfo[] = useMemo(() => {
    const paymaster = (paymasterTokens || []).map((token: any) => ({
      address: token.token_address || "",
      decimals: Number(token.decimals ?? 18),
    })).filter(t => t.address);

    // If no paymaster tokens, default to STRK
    return paymaster.length > 0 
      ? paymaster 
      : [{ address: DEFAULT_GAS_TOKEN.address, decimals: 18 }];
  }, [paymasterTokens]);

  useEffect(() => {
    setModeInput(selectedToken.mode ?? "default");
    setProtocolInput(selectedToken.protocol ?? "");
    setUseMaxInput(Boolean(selectedToken.useMax));

    if (selectedToken.amount) {
      try {
        const formatted = formatUnits(BigInt(selectedToken.amount), selectedDecimals);
        setAmountInput(formatted);
      } catch {
        setAmountInput("");
      }
    } else {
      setAmountInput("");
    }

    setVesuPoolIdInput(selectedToken.vesuContext?.poolId ?? "");
    setVesuCounterpartInput(selectedToken.vesuContext?.counterpartToken ?? "");
  }, [selectedToken, selectedDecimals]);

  useEffect(() => {
    if (selectedToken.mode === "collateral" || selectedToken.mode === "borrow") {
      setShowAdvanced(true);
    }
  }, [selectedToken.mode]);

  const handleTokenSelect = () => {
    setIsOpen(false);
  };

  const isCustomMode = modeInput === "collateral" || modeInput === "borrow";
  const protocolIsVesu = protocolInput.toLowerCase() === "vesu";
  const advancedActive =
    selectedToken.mode === "collateral" || selectedToken.mode === "borrow";

  const handleApplyCustomStrategy = () => {
    const errors: string[] = [];

    if (!isCustomMode) {
      updateTokenMetadata({ mode: modeInput });
      setFormErrors([]);
      setFormNotice(
        modeInput === "sponsored"
          ? "Attempting sponsored transactions when available."
          : "Gas strategy reset to default.",
      );
      return;
    }

    if (!protocolInput) {
      errors.push("Select a lending protocol to source gas from.");
    }

    let parsedAmount: string | undefined;
    if (!amountInput || Number(amountInput) <= 0) {
      errors.push("Enter a positive token amount to source.");
    } else {
      try {
        const atomicAmount = parseUnits(amountInput, selectedDecimals);
        if (atomicAmount <= 0n) {
          errors.push("Amount must be greater than zero.");
        } else {
          parsedAmount = atomicAmount.toString();
        }
      } catch {
        errors.push("Unable to parse the amount. Check the number format.");
      }
    }

    if (protocolIsVesu) {
      if (!vesuPoolIdInput) {
        errors.push("Vesu pool ID is required for this strategy.");
      }
      if (!vesuCounterpartInput) {
        errors.push("Provide the counterpart token address for Vesu.");
      }
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      setFormNotice(null);
      return;
    }

    setFormErrors([]);
    const vesuContext = protocolIsVesu
      ? { poolId: vesuPoolIdInput, counterpartToken: vesuCounterpartInput }
      : null;

    updateTokenMetadata({
      mode: modeInput,
      protocol: protocolInput,
      amount: parsedAmount,
      useMax: modeInput === "collateral" ? useMaxInput : false,
      vesuContext,
    });

    setFormNotice("Custom gas strategy saved.");
  };

  const handleResetStrategy = () => {
    setModeInput("default");
    setProtocolInput("");
    setAmountInput("");
    setUseMaxInput(false);
    setVesuPoolIdInput("");
    setVesuCounterpartInput("");
    setFormErrors([]);
    updateTokenMetadata({ mode: "default" });
    setFormNotice("Gas strategy reset to default.");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Gas Token Button */}
      <motion.button
        className="flex items-center gap-2 hover:bg-base-300/50 transition-colors duration-200 rounded p-1"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Gas Icon */}
        <div className="w-4 h-4 text-base-content/70">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3h1c.55 0 1 .45 1 1v3.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5z"/>
          </svg>
        </div>

        {/* Selected Token Icon (no text) */}
        <div className="w-4 h-4 relative">
          <Image
            src={selectedToken.icon}
            alt={selectedToken.name}
            fill
            className="object-contain"
            onError={(e) => {
              // Fallback to a default icon if the token icon fails to load
              const target = e.target as HTMLImageElement;
              target.src = '/logos/strk.svg';
            }}
          />
        </div>

        {/* Dropdown Arrow */}
        <ChevronDownIcon 
          className={`w-4 h-4 text-base-content/50 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 right-0 z-50 bg-base-100 border border-base-300/50 rounded-lg shadow-xl min-w-[360px] max-h-[400px] overflow-auto"
          >
            <div className="p-3">
              <div className="text-sm font-medium text-base-content/70 mb-3 px-2">
                Select Gas Token
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span className="ml-2 text-sm text-base-content/60">Loading tokens...</span>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="text-sm text-error px-2 py-4 text-center">
                  Failed to load gas tokens
                </div>
              )}

              {/* Token Grid */}
              <div className="grid grid-cols-3 gap-2">
                {availableTokens.map((tokenInfo, index) => (
                  <GasTokenComponent
                    key={`${tokenInfo.address}-${index}`}
                    address={tokenInfo.address}
                    decimals={tokenInfo.decimals}
                    isSelected={selectedToken.address === tokenInfo.address}
                    onSelect={handleTokenSelect}
                  />
                ))}
              </div>

              {/* Advanced configuration */}
              <div className="mt-4 pt-3 border-t border-base-300/30 space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md bg-base-200/60 px-3 py-2 text-xs font-medium text-base-content/80 hover:bg-base-200"
                  onClick={() => setShowAdvanced(prev => !prev)}
                >
                  <span>Advanced gas strategy</span>
                  <span className="flex items-center gap-2">
                    {advancedActive && (
                      <span className="badge badge-success badge-outline text-[10px] uppercase">Active</span>
                    )}
                    <ChevronDownIcon
                      className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {showAdvanced && (
                  <div className="space-y-3 rounded-md border border-base-300/40 bg-base-200/40 p-3 text-xs">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                          Mode
                        </span>
                        <select
                          className="select select-bordered select-sm"
                          value={modeInput}
                          onChange={event => {
                            const value = event.target.value as typeof modeInput;
                            setModeInput(value);
                            if (value !== "collateral") {
                              setUseMaxInput(false);
                            }
                            if (value === "default" || value === "sponsored") {
                              setProtocolInput("");
                              setAmountInput("");
                              setVesuPoolIdInput("");
                              setVesuCounterpartInput("");
                            }
                          }}
                        >
                          <option value="default">Default (wallet pays)</option>
                          <option value="sponsored">Sponsored (dApp pays)</option>
                          <option value="collateral">Use collateral (withdraw)</option>
                          <option value="borrow">Borrow for gas</option>
                        </select>
                      </label>

                      {isCustomMode && (
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                            Protocol
                          </span>
                          <select
                            className="select select-bordered select-sm"
                            value={protocolInput}
                            onChange={event => {
                              const value = event.target.value;
                              setProtocolInput(value);
                              if (value.toLowerCase() !== "vesu") {
                                setVesuPoolIdInput("");
                                setVesuCounterpartInput("");
                              }
                            }}
                          >
                            <option value="">Select a protocol</option>
                            {CUSTOM_PROTOCOL_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>

                    {isCustomMode && (
                      <>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                            Amount ({selectedToken.symbol || "token"})
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={amountInput}
                            onChange={event => setAmountInput(event.target.value)}
                            placeholder="0.0"
                            className="input input-bordered input-sm"
                          />
                          <span className="text-[10px] text-base-content/50">
                            Converted using {selectedDecimals} decimals when saved.
                          </span>
                        </label>

                        {modeInput === "collateral" && (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="toggle toggle-xs"
                              checked={useMaxInput}
                              onChange={event => setUseMaxInput(event.target.checked)}
                            />
                            <span>Withdraw entire balance before paying gas</span>
                          </label>
                        )}

                        {protocolIsVesu && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                                Vesu Pool ID
                              </span>
                              <input
                                type="text"
                                className="input input-bordered input-sm"
                                value={vesuPoolIdInput}
                                onChange={event => setVesuPoolIdInput(event.target.value)}
                                placeholder="Pool identifier"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                                Counterpart token
                              </span>
                              <input
                                type="text"
                                className="input input-bordered input-sm"
                                value={vesuCounterpartInput}
                                onChange={event => setVesuCounterpartInput(event.target.value)}
                                placeholder="0x..."
                              />
                            </label>
                            <span className="sm:col-span-2 text-[10px] text-base-content/50">
                              Provide Starknet-formatted values from your Vesu position.
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {formErrors.length > 0 && (
                      <div className="rounded-md border border-error/40 bg-error/10 p-2 text-[11px] text-error">
                        <ul className="list-inside list-disc space-y-1">
                          {formErrors.map((errorMessage, index) => (
                            <li key={`${errorMessage}-${index}`}>{errorMessage}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {formNotice && formErrors.length === 0 && (
                      <div className="rounded-md border border-success/40 bg-success/10 p-2 text-[11px] text-success">
                        {formNotice}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={handleResetStrategy}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={handleApplyCustomStrategy}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-base-content/60">
                  Gas fees are settled with the selected token or sourced via the configured strategy.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
