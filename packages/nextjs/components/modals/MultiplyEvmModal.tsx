import { FC, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import Image from "next/image";
import { Address, formatUnits, parseUnits } from "viem";
import { FiAlertTriangle, FiSettings } from "react-icons/fi";

import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { SwapAsset } from "./SwapModalShell";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { formatBps } from "~~/utils/risk";

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
}

const SAFETY_BUFFER = 0.90;

// Protocol default max LTVs (conservative estimates for major assets)
const PROTOCOL_DEFAULT_LTV: Record<string, number> = {
  aave: 8000,      // 80%
  compound: 7500,  // 75%
  venus: 7500,     // 75%
  euler: 8500,     // 85%
  default: 7500,   // 75% fallback
};

const getProtocolDefaultLtv = (protocolName: string): bigint => {
  const key = protocolName.toLowerCase();
  for (const [protocol, ltv] of Object.entries(PROTOCOL_DEFAULT_LTV)) {
    if (key.includes(protocol)) return BigInt(ltv);
  }
  return BigInt(PROTOCOL_DEFAULT_LTV.default);
};

const calculateMaxLeverage = (ltvBps: bigint, protocolName: string): number => {
  // Use passed LTV if reasonable (>50%), otherwise use protocol default
  // This handles cases where current LTV is 0 (no position yet)
  const minReasonableLtv = 5000n; // 50%
  const effectiveLtvBps = ltvBps >= minReasonableLtv ? ltvBps : getProtocolDefaultLtv(protocolName);
  const effectiveLtv = (Number(effectiveLtvBps) / 10000) * SAFETY_BUFFER;
  if (effectiveLtv >= 0.95) return 2;
  const max = 1 / (1 - effectiveLtv);
  return Math.round(Math.min(max, 6) * 100) / 100;
};

const calculateFlashLoanAmount = (
  marginCollateral: bigint,
  leverage: number,
  collateralPrice: bigint,
  debtPrice: bigint,
  collateralDecimals: number,
  debtDecimals: number
): bigint => {
  if (leverage <= 1 || marginCollateral === 0n || collateralPrice === 0n || debtPrice === 0n) return 0n;
  const marginUsd = (marginCollateral * collateralPrice) / BigInt(10 ** collateralDecimals);
  const leverageMultiplier = Math.round((leverage - 1) * 10000);
  const additionalExposureUsd = (marginUsd * BigInt(leverageMultiplier)) / 10000n;
  return (additionalExposureUsd * BigInt(10 ** debtDecimals)) / debtPrice;
};

export const MultiplyEvmModal: FC<MultiplyEvmModalProps> = ({
  isOpen,
  onClose,
  protocolName,
  chainId,
  collaterals,
  debtOptions,
  market,
  maxLtvBps = 8000n,
  lltvBps = 8500n,
}) => {
  const wasOpenRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"loop" | "config" | "info">("loop");
  
  const [collateral, setCollateral] = useState<SwapAsset | undefined>(collaterals[0]);
  const [debt, setDebt] = useState<SwapAsset | undefined>(debtOptions[0]);
  const [marginAmount, setMarginAmount] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(1);
  const [leverageInput, setLeverageInput] = useState<string>("1.00");
  const [slippage, setSlippage] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate max leverage first (uses protocol defaults if passed LTV is too low)
  const maxLeverage = useMemo(() => calculateMaxLeverage(maxLtvBps, protocolName), [maxLtvBps, protocolName]);
  
  // Get effective LTV being used for display
  const effectiveLtvPercent = useMemo(() => {
    const minReasonableLtv = 5000n;
    const effectiveLtvBps = maxLtvBps >= minReasonableLtv ? maxLtvBps : getProtocolDefaultLtv(protocolName);
    return Number(effectiveLtvBps) / 100;
  }, [maxLtvBps, protocolName]);

  // Sync leverage input when leverage changes from slider
  const updateLeverage = (val: number) => {
    const clamped = Math.min(Math.max(1, val), maxLeverage);
    setLeverage(clamped);
    setLeverageInput(clamped.toFixed(2));
  };

  // Fetch actual wallet balances
  const { balances: walletBalances } = useWalletTokenBalances({
    tokens: collaterals.map(c => ({ address: c.address, decimals: c.decimals })),
    network: "evm",
    chainId,
  });

  // Merge wallet balances with collaterals
  const collateralsWithWalletBalance = useMemo(() => {
    return collaterals.map(c => {
      const key = c.address.toLowerCase();
      const walletInfo = walletBalances[key];
      return {
        ...c,
        walletBalance: walletInfo?.balance ?? 0n,
      };
    });
  }, [collaterals, walletBalances]);

  // Get current collateral with wallet balance
  const currentCollateral = useMemo(() => {
    if (!collateral) return undefined;
    return collateralsWithWalletBalance.find(c => c.address === collateral.address);
  }, [collateral, collateralsWithWalletBalance]);

  const walletBalance = currentCollateral?.walletBalance ?? 0n;

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setMarginAmount("");
      setLeverage(1);
      setLeverageInput("1.00");
      setActiveTab("loop");
      track("multiply_modal_open", { protocol: protocolName, chainId });
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, protocolName, chainId]);

  useEffect(() => {
    if (collaterals.length > 0 && !collateral) setCollateral(collaterals[0]);
    if (debtOptions.length > 0 && !debt) setDebt(debtOptions[0]);
  }, [collaterals, debtOptions, collateral, debt]);

  const { data: oneInchAdapter } = useDeployedContractInfo({
    contractName: "OneInchAdapter",
    chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144,
  });

  const marginAmountRaw = useMemo(() => {
    try {
      return collateral ? parseUnits(marginAmount || "0", collateral.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [collateral, marginAmount]);

  const flashLoanAmountRaw = useMemo(() => {
    if (!collateral || !debt || leverage <= 1 || marginAmountRaw === 0n) return 0n;
    return calculateFlashLoanAmount(
      marginAmountRaw, leverage,
      collateral.price ?? 0n, debt.price ?? 0n,
      collateral.decimals, debt.decimals
    );
  }, [collateral, debt, leverage, marginAmountRaw]);

  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen,
    networkType: "evm",
    fromProtocol: protocolName,
    chainId,
    position: collateral
      ? { name: collateral.symbol, tokenAddress: collateral.address, decimals: collateral.decimals, type: "supply" }
      : { name: "", tokenAddress: "0x0000000000000000000000000000000000000000", decimals: 18, type: "supply" },
  });

  const providerOptions = useMemo(() => {
    if (flashLoanProviders?.length) return flashLoanProviders;
    if (defaultFlashLoanProvider) return [defaultFlashLoanProvider];
    return [{ name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2", providerEnum: FlashLoanProvider.BalancerV2 }];
  }, [defaultFlashLoanProvider, flashLoanProviders]);

  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders: providerOptions,
    defaultProvider: defaultFlashLoanProvider ?? providerOptions[0],
    tokenAddress: debt?.address as Address,
    amount: flashLoanAmountRaw,
    chainId,
  });

  const { data: swapQuote, isLoading: isSwapQuoteLoading } = use1inchQuote({
    chainId,
    src: (debt?.address as Address) || "0x0000000000000000000000000000000000000000",
    dst: (collateral?.address as Address) || "0x0000000000000000000000000000000000000000",
    amount: flashLoanAmountRaw.toString(),
    from: (oneInchAdapter?.address as Address) || "0x0000000000000000000000000000000000000000",
    slippage,
    enabled: isOpen && !!collateral && !!debt && flashLoanAmountRaw > 0n && !!oneInchAdapter,
  });

  const minCollateralOut = useMemo(() => {
    if (!swapQuote || !collateral) return { raw: 0n, formatted: "0" };
    const quoted = BigInt(swapQuote.dstAmount || "0");
    if (quoted === 0n) return { raw: 0n, formatted: "0" };
    const bufferBps = BigInt(Math.round(slippage * 100));
    const buffered = (quoted * (10000n - bufferBps)) / 10000n;
    return { raw: buffered, formatted: formatUnits(buffered, collateral.decimals) };
  }, [collateral, slippage, swapQuote]);

  // Position metrics
  const metrics = useMemo(() => {
    if (!collateral || !debt || marginAmountRaw === 0n) {
      return { totalCollateralUsd: 0, debtUsd: 0, ltv: 0, liquidationPrice: null, healthFactor: Infinity };
    }
    const collateralPrice = Number(formatUnits(collateral.price ?? 0n, 8));
    const debtPrice = Number(formatUnits(debt.price ?? 0n, 8));
    const marginUsd = Number(formatUnits(marginAmountRaw, collateral.decimals)) * collateralPrice;
    const swapCollateralUsd = Number(minCollateralOut.formatted) * collateralPrice;
    const totalCollateralUsd = marginUsd + swapCollateralUsd;
    const debtUsd = Number(formatUnits(flashLoanAmountRaw, debt.decimals)) * debtPrice;
    const ltv = totalCollateralUsd > 0 ? (debtUsd / totalCollateralUsd) * 100 : 0;
    const lltv = Number(lltvBps) / 10000;
    const healthFactor = debtUsd > 0 ? (totalCollateralUsd * lltv) / debtUsd : Infinity;
    const collateralAmount = totalCollateralUsd / collateralPrice;
    const liquidationPrice = debtUsd > 0 && collateralAmount > 0 ? debtUsd / (collateralAmount * lltv) : null;
    return { totalCollateralUsd, debtUsd, ltv, liquidationPrice, healthFactor };
  }, [collateral, debt, marginAmountRaw, minCollateralOut.formatted, flashLoanAmountRaw, lltvBps]);

  const { buildMultiplyFlow } = useKapanRouterV2();

  const buildFlow = () => {
    if (!collateral || !debt || !swapQuote?.tx?.data || flashLoanAmountRaw === 0n) return [];
    return buildMultiplyFlow({
      protocolName,
      collateralToken: collateral.address as Address,
      debtToken: debt.address as Address,
      initialCollateral: marginAmount || "0",
      flashLoanAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
      minCollateralOut: minCollateralOut.formatted,
      swapData: swapQuote.tx.data,
      collateralDecimals: collateral.decimals,
      debtDecimals: debt.decimals,
      flashLoanProvider: selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2,
      market,
    });
  };

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen, chainId, onClose, buildFlow,
    successMessage: "Loop position opened!",
    emptyFlowErrorMessage: "Unable to build loop instructions",
    simulateWhenBatching: true,
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      track("multiply_tx_begin", {
        protocol: protocolName, chainId,
        collateral: collateral?.symbol ?? "unknown",
        debt: debt?.symbol ?? "unknown",
        marginAmount, leverage,
        flashLoanProvider: selectedProvider?.name ?? "unknown",
      });
      await handleConfirm(marginAmount);
      track("multiply_tx_complete", { status: "success" });
    } catch (e) {
      track("multiply_tx_complete", { status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && !!swapQuote && !isSwapQuoteLoading;
  const formatUsd = (val: number) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const marginUsd = collateral && marginAmount ? Number(marginAmount) * Number(formatUnits(collateral.price ?? 0n, 8)) : 0;
  const walletBalanceFormatted = collateral ? Number(formatUnits(walletBalance, collateral.decimals)) : 0;

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-box relative bg-base-100 max-w-md p-0 rounded-xl border border-base-300/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-semibold text-base">Loop Position</h3>
          <div className="flex items-center gap-2">
            <div className="flex bg-base-200/50 rounded-lg p-0.5 text-xs">
              {(["loop", "config", "info"] as const).map(tab => (
                <button
                  key={tab}
                  className={`px-2.5 py-1 rounded-md transition-colors capitalize ${activeTab === tab ? "bg-base-100 shadow-sm" : "text-base-content/50"}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "config" ? <FiSettings className="w-3.5 h-3.5" /> : tab}
                </button>
              ))}
            </div>
            <button className="p-1 rounded text-base-content/40 hover:text-base-content" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="px-4 pb-4">
          {activeTab === "info" ? (
            <div className="space-y-4 py-2">
              <div className="bg-info/10 border border-info/20 rounded-lg p-3 text-sm">
                <div className="font-semibold mb-2">How Looping Works</div>
                <p className="text-xs text-base-content/70 leading-relaxed">
                  Looping (or leveraged yield farming) amplifies your exposure to an asset using flash loans. 
                  It&apos;s similar to margin trading but executed atomically in a single transaction.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">1</div>
                  <div>
                    <div className="font-medium">Deposit Margin</div>
                    <div className="text-base-content/60">Your initial collateral is deposited into {protocolName}.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">2</div>
                  <div>
                    <div className="font-medium">Flash Loan & Swap</div>
                    <div className="text-base-content/60">Borrow debt token via flash loan, swap to more collateral via 1inch.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">3</div>
                  <div>
                    <div className="font-medium">Deposit & Borrow</div>
                    <div className="text-base-content/60">Deposit additional collateral, borrow to repay the flash loan.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center text-[10px] font-bold text-success shrink-0">✓</div>
                  <div>
                    <div className="font-medium">Leveraged Position</div>
                    <div className="text-base-content/60">You now have {leverage.toFixed(1)}x exposure to {collateral?.symbol || "collateral"}.</div>
                  </div>
                </div>
              </div>

              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs">
                <div className="flex items-start gap-2">
                  <FiAlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-warning">Risk Warning</div>
                    <ul className="text-base-content/60 mt-1 space-y-0.5 list-disc list-inside">
                      <li>Max leverage based on ~{effectiveLtvPercent}% LTV with 10% safety buffer</li>
                      <li>Higher leverage = higher liquidation risk</li>
                      <li>Monitor health factor - liquidation occurs when it drops below 1</li>
                      <li>Price movements are amplified by your leverage multiplier</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "config" ? (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs text-base-content/60 mb-1.5 block">Slippage Tolerance</label>
                <div className="flex gap-2">
                  {[0.5, 1, 2, 3].map(s => (
                    <button
                      key={s}
                      onClick={() => setSlippage(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${slippage === s ? "bg-primary text-primary-content" : "bg-base-200 hover:bg-base-300"}`}
                    >
                      {s}%
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-base-content/60 mb-1.5 block">Flash Loan Provider</label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={selectedProvider?.name}
                  onChange={e => {
                    const p = providerOptions.find(p => p.name === e.target.value);
                    if (p) setSelectedProvider(p);
                  }}
                >
                  {providerOptions.map(p => {
                    const liq = liquidityData.find(l => l.provider === p.providerEnum);
                    return (
                      <option key={p.name} value={p.name}>
                        {p.name} {liq ? (liq.hasLiquidity ? "✓" : "⚠️") : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Margin Input */}
              <div className="bg-base-200/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs text-base-content/60 mb-2">
                  <span>Margin collateral</span>
                  <span>{protocolName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={marginAmount}
                    onChange={e => setMarginAmount(e.target.value)}
                    placeholder="0"
                    className="flex-1 bg-transparent text-xl font-medium outline-none min-w-0"
                  />
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-sm btn-ghost gap-1.5 px-2">
                      {collateral && <Image src={collateral.icon} alt="" width={18} height={18} className="rounded-full" />}
                      <span className="text-sm">{collateral?.symbol || "?"}</span>
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-50 menu p-1 shadow-lg bg-base-100 rounded-lg w-40 border border-base-300">
                      {collateralsWithWalletBalance.map(c => (
                        <li key={c.address}>
                          <a onClick={() => setCollateral(c)} className={`text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                            <Image src={c.icon} alt="" width={16} height={16} className="rounded-full" />
                            {c.symbol}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs mt-1.5">
                  <span className="text-base-content/50">≈ {formatUsd(marginUsd)}</span>
                  <button
                    className="text-primary hover:underline"
                    onClick={() => collateral && setMarginAmount(formatUnits(walletBalance, collateral.decimals))}
                  >
                    Wallet: {walletBalanceFormatted.toFixed(4)}
                  </button>
                </div>
              </div>

              {/* Leverage Slider */}
              <div className="bg-base-200/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-base-content/60">Multiplier</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={leverageInput}
                      onChange={e => {
                        setLeverageInput(e.target.value);
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) updateLeverage(val);
                      }}
                      onBlur={() => setLeverageInput(leverage.toFixed(2))}
                      className="w-14 bg-base-300/50 rounded px-1.5 py-0.5 text-sm text-center outline-none"
                    />
                    <span className="text-xs text-base-content/50">x</span>
                  </div>
                </div>
                <input
                  type="range" min="1" max={maxLeverage} step="0.01" value={leverage}
                  onChange={e => updateLeverage(parseFloat(e.target.value))}
                  className="range range-primary range-xs w-full"
                />
                <div className="flex justify-between text-[10px] text-base-content/40 mt-1">
                  <span>1x</span>
                  <span>Safe Max ({maxLeverage.toFixed(1)}x)</span>
                </div>
              </div>

              {/* Long/Short */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-success/10 rounded-lg p-2.5 border border-success/20">
                  <div className="text-[10px] text-success/70 uppercase tracking-wider">Long</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-sm font-bold text-success">{marginUsd > 0 ? formatUsd(marginUsd * leverage) : "$0"}</span>
                    {collateral && <Image src={collateral.icon} alt="" width={14} height={14} className="rounded-full" />}
                  </div>
                </div>
                <div className="bg-error/10 rounded-lg p-2.5 border border-error/20">
                  <div className="text-[10px] text-error/70 uppercase tracking-wider">Short</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-sm font-bold text-error">{metrics.debtUsd > 0 ? formatUsd(metrics.debtUsd) : "$0"}</span>
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="flex items-center gap-0.5 cursor-pointer hover:opacity-80">
                        {debt && <Image src={debt.icon} alt="" width={14} height={14} className="rounded-full" />}
                        <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content z-50 menu p-1 shadow-lg bg-base-100 rounded-lg w-36 border border-base-300">
                        {debtOptions.map(d => (
                          <li key={d.address}>
                            <a onClick={() => setDebt(d)} className={`text-sm ${debt?.address === d.address ? "active" : ""}`}>
                              <Image src={d.icon} alt="" width={14} height={14} className="rounded-full" />
                              {d.symbol}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="bg-base-200/30 rounded-lg p-2.5 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-base-content/50">Liquidation price</span>
                  <span className={metrics.liquidationPrice ? "text-warning" : ""}>{metrics.liquidationPrice ? formatUsd(metrics.liquidationPrice) : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/50">Your LTV / LLTV</span>
                  <span>{metrics.ltv > 0 ? `${metrics.ltv.toFixed(1)}%` : "-"} / {formatBps(lltvBps)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/50">Health factor</span>
                  <span className={metrics.healthFactor < 1.5 ? "text-error" : metrics.healthFactor < 2 ? "text-warning" : "text-success"}>
                    {Number.isFinite(metrics.healthFactor) && metrics.healthFactor > 0 ? metrics.healthFactor.toFixed(2) : "-"}
                  </span>
                </div>
                {flashLoanAmountRaw > 0n && (
                  <div className="flex justify-between border-t border-base-300/50 pt-1.5 mt-1.5">
                    <span className="text-base-content/50">Swap</span>
                    <span className="text-base-content/70">
                      {isSwapQuoteLoading ? "..." : `${Number(formatUnits(flashLoanAmountRaw, debt?.decimals || 18)).toFixed(2)} ${debt?.symbol} → ${Number(minCollateralOut.formatted).toFixed(4)} ${collateral?.symbol}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Warning */}
              {metrics.healthFactor < 1.2 && metrics.healthFactor > 0 && (
                <div className="flex items-center gap-2 text-xs text-error bg-error/10 rounded-lg p-2">
                  <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>High liquidation risk!</span>
                </div>
              )}

              {/* Info hint */}
              <div className="text-[10px] text-base-content/40 leading-relaxed">
                Max {maxLeverage}x (est. {effectiveLtvPercent}% LTV) • Slippage: {slippage}% • {selectedProvider?.name || "Balancer"}
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs shrink-0">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary"
                    checked={preferBatching}
                    onChange={e => setPreferBatching(e.target.checked)}
                  />
                  <span className="text-base-content/60">Batch</span>
                </label>
                <SegmentedActionBar
                  className="flex-1"
                  autoCompact
                  actions={[{
                    key: "multiply",
                    label: isSubmitting ? "Processing..." : isSwapQuoteLoading ? "Loading..." : "Open Loop",
                    icon: isSubmitting ? <span className="loading loading-spinner loading-xs" /> : undefined,
                    onClick: handleSubmit,
                    disabled: !canSubmit || isSubmitting,
                    variant: "ghost",
                  }]}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};

export default MultiplyEvmModal;
