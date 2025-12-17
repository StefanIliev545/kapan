import { FC, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import Image from "next/image";
import { Address, formatUnits, parseUnits } from "viem";
import { FiCheck } from "react-icons/fi";

import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { SwapAsset, SwapRouter, SWAP_ROUTER_OPTIONS } from "./SwapModalShell";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { formatBps } from "~~/utils/risk";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter } from "~~/utils/chainFeatures";

interface MultiplyEvmModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  collaterals: SwapAsset[];
  debtOptions: SwapAsset[];
  market?: Address;
  maxLtvBps?: bigint;
  lltvBps?: bigint;
  supplyApyMap?: Record<string, number>; // address -> APY %
  borrowApyMap?: Record<string, number>; // address -> APY %
}

const SAFETY_BUFFER = 0.90;

const PROTOCOL_DEFAULT_LTV: Record<string, number> = {
  aave: 8000, compound: 7500, venus: 7500, euler: 8500, default: 7500,
};

const getProtocolDefaultLtv = (protocolName: string): bigint => {
  const key = protocolName.toLowerCase();
  for (const [protocol, ltv] of Object.entries(PROTOCOL_DEFAULT_LTV)) {
    if (key.includes(protocol)) return BigInt(ltv);
  }
  return BigInt(PROTOCOL_DEFAULT_LTV.default);
};

const calculateMaxLeverage = (ltvBps: bigint, protocolName: string): number => {
  const minReasonableLtv = 5000n;
  const effectiveLtvBps = ltvBps >= minReasonableLtv ? ltvBps : getProtocolDefaultLtv(protocolName);
  const effectiveLtv = (Number(effectiveLtvBps) / 10000) * SAFETY_BUFFER;
  if (effectiveLtv >= 0.95) return 2;
  return Math.round(Math.min(1 / (1 - effectiveLtv), 10) * 100) / 100;
};

const calculateFlashLoanAmount = (
  marginCollateral: bigint, leverage: number, collateralPrice: bigint,
  debtPrice: bigint, collateralDecimals: number, debtDecimals: number
): bigint => {
  if (leverage <= 1 || marginCollateral === 0n || collateralPrice === 0n || debtPrice === 0n) return 0n;
  const marginUsd = (marginCollateral * collateralPrice) / BigInt(10 ** collateralDecimals);
  const leverageMultiplier = Math.round((leverage - 1) * 10000);
  const additionalExposureUsd = (marginUsd * BigInt(leverageMultiplier)) / 10000n;
  return (additionalExposureUsd * BigInt(10 ** debtDecimals)) / debtPrice;
};

export const MultiplyEvmModal: FC<MultiplyEvmModalProps> = ({
  isOpen, onClose, protocolName, chainId, collaterals, debtOptions, market,
  maxLtvBps = 8000n, lltvBps = 8500n, supplyApyMap = {}, borrowApyMap = {},
}) => {
  const wasOpenRef = useRef(false);
  const [collateral, setCollateral] = useState<SwapAsset | undefined>(collaterals[0]);
  const [debt, setDebt] = useState<SwapAsset | undefined>(debtOptions[0]);
  const [marginAmount, setMarginAmount] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(1);
  const [leverageInput, setLeverageInput] = useState<string>("1.00");
  const [slippage, setSlippage] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Check swap router availability for this chain
  const oneInchAvailable = is1inchSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const defaultRouter = getDefaultSwapRouter(chainId);
  
  // Swap router selection - default based on chain availability
  const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");
  
  // Update swap router if chain changes and current router is not available
  useEffect(() => {
    if (swapRouter === "1inch" && !oneInchAvailable) {
      setSwapRouter(pendleAvailable ? "pendle" : "1inch");
    } else if (swapRouter === "pendle" && !pendleAvailable) {
      setSwapRouter(oneInchAvailable ? "1inch" : "pendle");
    }
  }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);
  
  // Zap mode: deposit debt token instead of collateral (e.g., USDe → PT-USDe)
  const [zapMode, setZapMode] = useState(false);

  const maxLeverage = useMemo(() => calculateMaxLeverage(maxLtvBps, protocolName), [maxLtvBps, protocolName]);

  const updateLeverage = (val: number) => {
    const clamped = Math.min(Math.max(1, val), maxLeverage);
    setLeverage(clamped);
    setLeverageInput(clamped.toFixed(2));
  };

  // Fetch wallet balances for both collaterals and debt options (for zap mode)
  const allTokens = useMemo(() => {
    const tokens = [...collaterals.map(c => ({ address: c.address, decimals: c.decimals }))];
    debtOptions.forEach(d => {
      if (!tokens.find(t => t.address.toLowerCase() === d.address.toLowerCase())) {
        tokens.push({ address: d.address, decimals: d.decimals });
      }
    });
    return tokens;
  }, [collaterals, debtOptions]);

  const { balances: walletBalances } = useWalletTokenBalances({
    tokens: allTokens, network: "evm", chainId,
  });

  const collateralsWithWalletBalance = useMemo(() => collaterals.map(c => ({
    ...c, walletBalance: walletBalances[c.address.toLowerCase()]?.balance ?? 0n,
  })), [collaterals, walletBalances]);

  const debtWithWalletBalance = useMemo(() => debtOptions.map(d => ({
    ...d, walletBalance: walletBalances[d.address.toLowerCase()]?.balance ?? 0n,
  })), [debtOptions, walletBalances]);

  const currentCollateral = useMemo(() =>
    collateral ? collateralsWithWalletBalance.find(c => c.address === collateral.address) : undefined,
    [collateral, collateralsWithWalletBalance]);

  const currentDebt = useMemo(() =>
    debt ? debtWithWalletBalance.find(d => d.address === debt.address) : undefined,
    [debt, debtWithWalletBalance]);

  // In zap mode, wallet balance is the debt token; otherwise collateral
  const walletBalance = zapMode ? (currentDebt?.walletBalance ?? 0n) : (currentCollateral?.walletBalance ?? 0n);
  const depositToken = zapMode ? debt : collateral;
  const depositDecimals = depositToken?.decimals ?? 18;

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setMarginAmount(""); setLeverage(1); setLeverageInput("1.00");
      track("multiply_modal_open", { protocol: protocolName, chainId });
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, protocolName, chainId]);

  useEffect(() => {
    if (collaterals.length > 0 && !collateral) setCollateral(collaterals[0]);
    if (debtOptions.length > 0 && !debt) setDebt(debtOptions[0]);
  }, [collaterals, debtOptions, collateral, debt]);

  const { data: oneInchAdapter } = useDeployedContractInfo({
    contractName: "OneInchAdapter", chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144 | 9745,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendleAdapter } = useDeployedContractInfo("PendleAdapter" as any);

  // In zap mode, margin is in debt token terms; otherwise collateral
  const marginAmountRaw = useMemo(() => {
    try { return depositToken ? parseUnits(marginAmount || "0", depositDecimals) : 0n; }
    catch { return 0n; }
  }, [depositToken, depositDecimals, marginAmount]);

  const flashLoanAmountRaw = useMemo(() => {
    if (!collateral || !debt || leverage <= 1 || marginAmountRaw === 0n) return 0n;
    
    if (zapMode) {
      // In zap mode, margin is in debt terms, so calculate flash loan differently
      // marginAmount is in debt tokens, flash loan = margin * (leverage - 1)
      const leverageMultiplier = Math.round((leverage - 1) * 10000);
      return (marginAmountRaw * BigInt(leverageMultiplier)) / 10000n;
    }
    
    return calculateFlashLoanAmount(marginAmountRaw, leverage, collateral.price ?? 0n, debt.price ?? 0n, collateral.decimals, debt.decimals);
  }, [collateral, debt, leverage, marginAmountRaw, zapMode]);

  // Total amount to swap in zap mode (deposit + flash loan)
  const totalSwapAmount = useMemo(() => {
    if (!zapMode) return flashLoanAmountRaw;
    return marginAmountRaw + flashLoanAmountRaw;
  }, [zapMode, marginAmountRaw, flashLoanAmountRaw]);

  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen, networkType: "evm", fromProtocol: protocolName, chainId,
    position: collateral ? { name: collateral.symbol, tokenAddress: collateral.address, decimals: collateral.decimals, type: "supply" }
      : { name: "", tokenAddress: "0x0000000000000000000000000000000000000000", decimals: 18, type: "supply" },
  });

  const providerOptions = useMemo(() => {
    if (flashLoanProviders?.length) return flashLoanProviders;
    if (defaultFlashLoanProvider) return [defaultFlashLoanProvider];
    return [{ name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2", providerEnum: FlashLoanProvider.BalancerV2 }];
  }, [defaultFlashLoanProvider, flashLoanProviders]);

  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders: providerOptions, defaultProvider: defaultFlashLoanProvider ?? providerOptions[0],
    tokenAddress: debt?.address as Address, amount: flashLoanAmountRaw, chainId,
  });

  // Swap amount: in zap mode, swap everything (deposit + flash loan); otherwise just flash loan
  const swapQuoteAmount = zapMode ? totalSwapAmount : flashLoanAmountRaw;

  // 1inch Quote
  const { data: oneInchQuote, isLoading: is1inchLoading } = use1inchQuote({
    chainId, src: (debt?.address as Address) || "0x0000000000000000000000000000000000000000",
    dst: (collateral?.address as Address) || "0x0000000000000000000000000000000000000000",
    amount: swapQuoteAmount.toString(), from: (oneInchAdapter?.address as Address) || "0x0000000000000000000000000000000000000000",
    slippage, enabled: swapRouter === "1inch" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!oneInchAdapter,
  });

  // Pendle Quote
  const { data: pendleQuote, isLoading: isPendleLoading } = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    tokensIn: debt?.address as Address,
    tokensOut: collateral?.address as Address,
    amountsIn: swapQuoteAmount.toString(),
    slippage: slippage / 100, // Pendle uses decimal slippage
    enabled: swapRouter === "pendle" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!pendleAdapter,
  });

  // Unified loading state
  const isSwapQuoteLoading = swapRouter === "1inch" ? is1inchLoading : isPendleLoading;

  const minCollateralOut = useMemo(() => {
    if (!collateral) return { raw: 0n, formatted: "0" };
    
    let quoted = 0n;
    if (swapRouter === "1inch" && oneInchQuote) {
      quoted = BigInt(oneInchQuote.dstAmount || "0");
    } else if (swapRouter === "pendle" && pendleQuote) {
      const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
      quoted = BigInt(outAmount);
    }
    
    if (quoted === 0n) return { raw: 0n, formatted: "0" };
    const bufferBps = BigInt(Math.round(slippage * 100));
    const buffered = (quoted * (10000n - bufferBps)) / 10000n;
    return { raw: buffered, formatted: formatUnits(buffered, collateral.decimals) };
  }, [collateral, slippage, swapRouter, oneInchQuote, pendleQuote]);

  const metrics = useMemo(() => {
    if (!collateral || !debt || marginAmountRaw === 0n) {
      return { totalCollateralUsd: 0, debtUsd: 0, ltv: 0, liquidationPrice: null, healthFactor: Infinity, totalCollateralTokens: 0 };
    }
    const cPrice = Number(formatUnits(collateral.price ?? 0n, 8));
    const dPrice = Number(formatUnits(debt.price ?? 0n, 8));

    // In zap mode, all collateral comes from the swap; otherwise margin + swap
    let totalCollateralTokens: number;
    if (zapMode) {
      // All collateral is from the swap (deposit + flash loan → collateral)
      totalCollateralTokens = Number(minCollateralOut.formatted);
    } else {
      // Initial margin (in collateral) + swapped collateral
      const marginTokens = Number(formatUnits(marginAmountRaw, collateral.decimals));
      const swappedTokens = Number(minCollateralOut.formatted);
      totalCollateralTokens = marginTokens + swappedTokens;
    }
    const totalCollateralUsd = totalCollateralTokens * cPrice;

    const debtTokens = Number(formatUnits(flashLoanAmountRaw, debt.decimals));
    const debtUsd = debtTokens * dPrice;

    const ltv = totalCollateralUsd > 0 ? (debtUsd / totalCollateralUsd) * 100 : 0;
    const lltv = Number(lltvBps) / 10000;
    const healthFactor = debtUsd > 0 ? (totalCollateralUsd * lltv) / debtUsd : Infinity;

    // Liquidation price: price at which collateral * lltv = debt
    const liquidationPrice = debtUsd > 0 && totalCollateralTokens > 0
      ? debtUsd / (totalCollateralTokens * lltv)
      : null;

    return { totalCollateralUsd, debtUsd, ltv, liquidationPrice, healthFactor, totalCollateralTokens };
  }, [collateral, debt, marginAmountRaw, minCollateralOut.formatted, flashLoanAmountRaw, lltvBps, zapMode]);

  // Net APY calculation
  const netApy = useMemo(() => {
    if (!collateral || !debt || metrics.totalCollateralUsd === 0) return null;
    const supplyApy = supplyApyMap[collateral.address.toLowerCase()] ?? 0;
    const borrowApy = borrowApyMap[debt.address.toLowerCase()] ?? 0;

    // Weighted: (collateral * supplyAPY - debt * borrowAPY) / equity
    const equity = metrics.totalCollateralUsd - metrics.debtUsd;
    if (equity <= 0) return null;

    const earnedYield = (metrics.totalCollateralUsd * supplyApy) / 100;
    const paidInterest = (metrics.debtUsd * borrowApy) / 100;
    const netYieldUsd = earnedYield - paidInterest;

    return (netYieldUsd / equity) * 100; // as percentage
  }, [collateral, debt, metrics, supplyApyMap, borrowApyMap]);

  const { buildMultiplyFlow } = useKapanRouterV2();

  const buildFlow = () => {
    if (!collateral || !debt || flashLoanAmountRaw === 0n) return [];
    
    // Get swap data based on selected router
    let swapData: string;
    let minOut: string;
    
    if (swapRouter === "1inch") {
      if (!oneInchQuote || !oneInchAdapter) return [];
      swapData = oneInchQuote.tx.data;
      minOut = minCollateralOut.formatted;
    } else {
      if (!pendleQuote || !pendleAdapter) return [];
      swapData = pendleQuote.transaction.data;
      minOut = pendleQuote.data.minPtOut || pendleQuote.data.minTokenOut || minCollateralOut.formatted;
    }
    
    const flowParams = {
      protocolName, collateralToken: collateral.address as Address, debtToken: debt.address as Address,
      initialCollateral: zapMode ? "0" : (marginAmount || "0"), // In zap mode, no initial collateral
      flashLoanAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
      minCollateralOut: minOut, swapData,
      collateralDecimals: collateral.decimals, debtDecimals: debt.decimals,
      flashLoanProvider: selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2, market,
      swapRouter: (swapRouter === "1inch" ? "oneinch" : "pendle") as "oneinch" | "pendle",
      zapMode,
      depositAmount: zapMode ? marginAmount : undefined, // In zap mode, margin is the deposit amount
    };
    
    const flow = buildMultiplyFlow(flowParams);
    console.log("[MultiplyEvmModal] buildFlow result:", flow.length, "instructions");
    return flow;
  };

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen, chainId, onClose, buildFlow, successMessage: "Loop position opened!",
    emptyFlowErrorMessage: "Unable to build loop instructions", simulateWhenBatching: false, // Disabled for now - zap mode has complex flows
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      track("multiply_tx_begin", { protocol: protocolName, chainId, collateral: collateral?.symbol ?? "unknown", debt: debt?.symbol ?? "unknown", marginAmount, leverage, flashLoanProvider: selectedProvider?.name ?? "unknown", swapRouter });
      await handleConfirm(marginAmount);
      track("multiply_tx_complete", { status: "success" });
    } catch (e) {
      track("multiply_tx_complete", { status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally { setIsSubmitting(false); }
  };

  const hasQuote = swapRouter === "1inch" ? !!oneInchQuote : !!pendleQuote;
  const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;
  const canSubmit = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && hasQuote && hasAdapter && !isSwapQuoteLoading;
  // In zap mode, margin is in debt terms; otherwise collateral terms
  const marginUsd = depositToken && marginAmount 
    ? Number(marginAmount) * Number(formatUnits(depositToken.price ?? 0n, 8)) 
    : 0;
  const walletBalanceFormatted = depositToken ? Number(formatUnits(walletBalance, depositDecimals)) : 0;
  const collateralPrice = collateral ? Number(formatUnits(collateral.price ?? 0n, 8)) : 0;
  const shortAmount = debt ? Number(formatUnits(flashLoanAmountRaw, debt.decimals)) : 0;

  // Slider tick marks (simplified)
  const ticks = [1, (1 + maxLeverage) / 2, maxLeverage];

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-box relative bg-base-100 max-w-2xl p-0 rounded-2xl border border-base-300/30">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-300/30">
          <h3 className="text-lg font-semibold">Loop Position</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-base-content/50">{protocolName}</span>
            <button className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="p-5">
          {/* Two Column Layout: Collateral | Borrow */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Deposit section */}
            <div className="bg-base-200/40 rounded-xl p-4 border border-base-300/20">
              <div className="flex items-center justify-between text-sm text-base-content/60 mb-2">
                <span>Deposit</span>
                <button
                  className="hover:text-primary transition-colors text-xs"
                  onClick={() => depositToken && setMarginAmount(formatUnits(walletBalance, depositDecimals))}
                >
                  Bal: {walletBalanceFormatted.toFixed(2)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={marginAmount}
                  onChange={e => setMarginAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-xl font-medium outline-none min-w-0 placeholder:text-base-content/30"
                />
                {/* In zap mode, show debt token selector (deposit = debt); otherwise show collateral selector */}
                {zapMode ? (
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-xs gap-1.5 bg-primary/10 border-0 hover:bg-primary/20 rounded-lg px-2">
                      {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="font-medium text-xs">{debt?.symbol || "?"}</span>
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                      {debtWithWalletBalance.map(d => {
                        const bal = Number(formatUnits(d.walletBalance, d.decimals));
                        return (
                          <li key={d.address}>
                            <a onClick={() => setDebt(d)} className={`flex items-center justify-between text-sm ${debt?.address === d.address ? "active" : ""}`}>
                              <div className="flex items-center gap-2">
                                <Image src={d.icon} alt="" width={18} height={18} className="rounded-full" />
                                {d.symbol}
                              </div>
                              <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-xs gap-1.5 bg-primary/10 border-0 hover:bg-primary/20 rounded-lg px-2">
                      {collateral && <Image src={collateral.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="font-medium text-xs">{collateral?.symbol || "?"}</span>
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                      {collateralsWithWalletBalance.map(c => {
                        const bal = Number(formatUnits(c.walletBalance, c.decimals));
                        return (
                          <li key={c.address}>
                            <a onClick={() => setCollateral(c)} className={`flex items-center justify-between text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                              <div className="flex items-center gap-2">
                                <Image src={c.icon} alt="" width={18} height={18} className="rounded-full" />
                                {c.symbol}
                              </div>
                              <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              {/* In zap mode, show collateral selector and swap arrow */}
              {zapMode && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                  <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                    <span>↓ swap to</span>
                  </div>
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-xs gap-1.5 bg-success/10 border-0 hover:bg-success/20 rounded-lg px-2">
                      {collateral && <Image src={collateral.icon} alt="" width={14} height={14} className="rounded-full" />}
                      <span className="font-medium text-xs">{collateral?.symbol || "?"}</span>
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                      {collaterals.map(c => (
                        <li key={c.address}>
                          <a onClick={() => setCollateral(c)} className={`flex items-center gap-2 text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                            <Image src={c.icon} alt="" width={18} height={18} className="rounded-full" />
                            {c.symbol}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {/* Show total after leverage inline */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                <span className="text-xs text-base-content/50">≈ ${marginUsd.toFixed(2)}</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-base-content/40">→</span>
                  <span className="text-success font-medium">{metrics.totalCollateralTokens.toFixed(4)} {collateral?.symbol}</span>
                  <span className="text-base-content/50">(${metrics.totalCollateralUsd.toFixed(2)})</span>
                </div>
              </div>
            </div>

            {/* Borrow */}
            <div className="bg-base-200/40 rounded-xl p-4 border border-base-300/20">
              <div className="text-sm text-base-content/60 mb-2">Borrow</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-xl font-medium text-error truncate">
                  {shortAmount > 0 ? shortAmount.toFixed(4) : "0"}
                </div>
                <div className="dropdown dropdown-end">
                  <label tabIndex={0} className="btn btn-xs gap-1.5 bg-base-300/30 border-0 hover:bg-base-300/50 rounded-lg px-2 cursor-pointer">
                    {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                    <span className="font-medium text-xs">{debt?.symbol || "?"}</span>
                    <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </label>
                  <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                    {debtOptions.map(d => {
                      const bal = Number(formatUnits(d.rawBalance, d.decimals));
                      return (
                        <li key={d.address}>
                          <a onClick={() => setDebt(d)} className={`flex items-center justify-between text-sm ${debt?.address === d.address ? "active" : ""}`}>
                            <div className="flex items-center gap-2">
                              <Image src={d.icon} alt="" width={18} height={18} className="rounded-full" />
                              {d.symbol}
                            </div>
                            <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              <div className="text-xs text-base-content/50 mt-2 pt-2 border-t border-base-300/30">≈ ${metrics.debtUsd.toFixed(2)}</div>
            </div>
          </div>

          {/* Multiplier Slider */}
          <div className="bg-base-200/40 rounded-xl p-4 border border-base-300/20 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Leverage</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={leverageInput}
                  onChange={e => { setLeverageInput(e.target.value); const val = parseFloat(e.target.value); if (!isNaN(val)) updateLeverage(val); }}
                  onBlur={() => setLeverageInput(leverage.toFixed(2))}
                  className="w-14 bg-base-300/50 rounded-lg px-2 py-1 text-sm text-right outline-none font-medium"
                />
                <span className="text-base-content/50 text-sm">×</span>
              </div>
            </div>
            <input
              type="range" min="1" max={maxLeverage} step="0.01" value={leverage}
              onChange={e => updateLeverage(parseFloat(e.target.value))}
              className="range range-primary range-sm w-full"
            />
            <div className="flex justify-between text-xs text-base-content/40 mt-1.5">
              {ticks.map((t, i) => (
                <span key={i}>{i === ticks.length - 1 ? `Max ${t.toFixed(1)}×` : `${t.toFixed(1)}×`}</span>
              ))}
            </div>

            {/* Zap Mode Toggle - for PT loops (deposit underlying → swap to PT collateral) */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-base-300/30">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-base-content/60">Zap Mode</span>
                <span className="text-[10px] text-base-content/40">(deposit → swap → collateral)</span>
              </div>
              <input
                type="checkbox"
                checked={zapMode}
                onChange={e => setZapMode(e.target.checked)}
                className="toggle toggle-primary toggle-xs"
              />
            </div>

            {/* Swap Router Row - only show if multiple routers available */}
            {oneInchAvailable && pendleAvailable ? (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-base-content/60">Swap Router</span>
                <div className="flex gap-1">
                  {SWAP_ROUTER_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSwapRouter(opt.value)}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${swapRouter === opt.value ? "bg-primary text-primary-content" : "bg-base-300/50 hover:bg-base-300"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-base-content/60">Swap Router</span>
                <span className="text-xs">{swapRouter === "pendle" ? "Pendle" : "1inch"}</span>
              </div>
            )}

            {/* Slippage Row */}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-base-content/60">Slippage</span>
              <div className="flex gap-1">
                {[0.5, 1, 2, 3].map(s => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${slippage === s ? "bg-primary text-primary-content" : "bg-base-300/50 hover:bg-base-300"}`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {/* Flash Loan Provider Row */}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-base-content/60">Flash Loan</span>
              <div className="flex gap-1">
                {providerOptions.map(p => {
                  const liq = liquidityData.find(l => l.provider === p.providerEnum);
                  const hasLiquidity = liq?.hasLiquidity ?? true; // Default true if no data yet
                  const isSelected = selectedProvider?.name === p.name;
                  return (
                    <button
                      key={p.name}
                      onClick={() => setSelectedProvider(p)}
                      className={`px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 ${isSelected ? "bg-primary text-primary-content" : "bg-base-300/50 hover:bg-base-300"}`}
                    >
                      {p.name}
                      {liq && (hasLiquidity ? <span className="text-success">✓</span> : <span className="text-warning">⚠</span>)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Metrics - Horizontal Grid */}
          <div className="grid grid-cols-4 gap-2 mb-4 text-sm">
            <div className="bg-base-200/40 rounded-lg p-2.5 border border-base-300/20">
              <div className="text-base-content/50 text-xs mb-0.5">LTV / Max</div>
              <div className="font-medium text-sm">{metrics.ltv > 0 ? `${metrics.ltv.toFixed(1)}%` : "-"} / {formatBps(lltvBps)}%</div>
            </div>
            <div className="bg-base-200/40 rounded-lg p-2.5 border border-base-300/20">
              <div className="text-base-content/50 text-xs mb-0.5">{collateral?.symbol} Price</div>
              <div className="font-medium text-sm">{collateralPrice > 0 ? `$${collateralPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"}</div>
            </div>
            <div className="bg-base-200/40 rounded-lg p-2.5 border border-base-300/20">
              <div className="text-base-content/50 text-xs mb-0.5">{debt?.symbol} Price</div>
              <div className="font-medium text-sm">{debt ? `$${Number(formatUnits(debt.price ?? 0n, 8)).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"}</div>
            </div>
            <div className="bg-base-200/40 rounded-lg p-2.5 border border-base-300/20">
              <div className="text-base-content/50 text-xs mb-0.5">Net APY</div>
              <div className={`font-medium text-sm ${netApy !== null && netApy > 0 ? "text-success" : netApy !== null && netApy < 0 ? "text-error" : ""}`}>
                {netApy !== null ? `${netApy > 0 ? "+" : ""}${netApy.toFixed(2)}%` : "-"}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="bg-base-200/40 rounded-lg p-3 border border-base-300/20 mb-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Swap Route ({swapRouter === "pendle" ? "Pendle" : "1inch"})</span>
              <span className="font-medium">
                {isSwapQuoteLoading ? <span className="loading loading-dots loading-xs" /> :
                  flashLoanAmountRaw > 0n ? `${shortAmount.toFixed(4)} ${debt?.symbol} → ${Number(minCollateralOut.formatted).toFixed(4)} ${collateral?.symbol}` : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Min. Received</span>
              <span>{flashLoanAmountRaw > 0n ? `${Number(minCollateralOut.formatted).toFixed(4)} ${collateral?.symbol}` : "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Flash Loan Fee</span>
              <span>{selectedProvider?.name.includes("Balancer") ? "0%" : selectedProvider?.name.includes("Aave") ? "0.05%" : "~0.05%"}</span>
            </div>
            <div className="flex items-center justify-between border-t border-base-300/30 pt-2 mt-2">
              <span className="text-base-content/60">Supply APY ({collateral?.symbol})</span>
              <span className="text-success">{collateral ? `+${(supplyApyMap[collateral.address.toLowerCase()] ?? 0).toFixed(2)}%` : "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Borrow APY ({debt?.symbol})</span>
              <span className="text-error">{debt ? `-${(borrowApyMap[debt.address.toLowerCase()] ?? 0).toFixed(2)}%` : "-"}</span>
            </div>
            <div className="flex items-center justify-between border-t border-base-300/30 pt-2 mt-2">
              <span className="text-base-content/60">Total Position</span>
              <span className="font-medium">${metrics.totalCollateralUsd.toFixed(2)} ({leverage.toFixed(2)}×)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setPreferBatching(!preferBatching)}
              className={`text-xs inline-flex items-center gap-1 cursor-pointer hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"}`}
            >
              <FiCheck className={`w-4 h-4 ${preferBatching ? "" : "opacity-40"}`} />
              Batch transactions
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="btn btn-ghost btn-sm text-primary disabled:text-base-content/30"
            >
              {isSubmitting ? <span className="loading loading-spinner loading-sm" /> : isSwapQuoteLoading ? "Loading..." : "Loop it"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default MultiplyEvmModal;
