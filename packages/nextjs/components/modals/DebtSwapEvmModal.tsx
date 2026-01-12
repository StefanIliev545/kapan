import { FC, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseAmount } from "~~/utils/validation";
import { PositionManager } from "~~/utils/position";
import * as Tooltip from "@radix-ui/react-tooltip";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import { useCowLimitOrder } from "~~/hooks/useCowLimitOrder";
import { useCowQuote } from "~~/hooks/useCowQuote";
import {
    FlashLoanProvider,
    ProtocolInstruction,
    createRouterInstruction,
    createProtocolInstruction,
    encodeApprove,
    encodeFlashLoan,
    encodeLendingInstruction,
    encodePushToken,
    encodePullToken,
    encodeToOutput,
    encodeAdd,
    LendingOp,
    encodeMorphoContext,
    type MorphoMarketContextForEncoding,
} from "~~/utils/v2/instructionHelpers";
import { useMorphoDebtSwapMarkets, marketToContext } from "~~/hooks/useMorphoDebtSwapMarkets";
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { encodeAbiParameters } from "viem";
import { getCowFlashLoanProviders, getPreferredFlashLoanLender, calculateFlashLoanFee } from "~~/utils/cow";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";
import {
    ExecutionTypeToggle,
    type ExecutionType,
} from "./common";
import { WarningDisplay } from "~~/components/common/ErrorDisplay";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import {
    trackModalOpen,
    createLimitOrderAnalyticsProps,
    buildCowFlashLoanInfo,
    buildCowChunkInstructions,
    logLimitOrderBuildStart,
    buildLimitOrderCallParams,
    handleLimitOrderBuildFailure,
    saveLimitOrderNote,
    executeSequentialLimitOrder,
    handleLimitOrderError,
    shouldSwitchSwapRouter,
    calculateRequiredNewDebt,
    calculateLimitOrderNewDebt,
    calculateDustBuffer,
} from "./debtSwapEvmHelpers";

interface DebtSwapEvmModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    chainId: number;
    // Current debt token info (preselected "From")
    debtFromToken: Address;
    debtFromName: string;
    debtFromIcon: string;
    debtFromDecimals: number;
    debtFromPrice?: bigint; // Price in 8 decimals (e.g., from Chainlink)
    currentDebtBalance: bigint;
    // Available assets for "To" selection
    availableAssets: SwapAsset[];
    /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
    context?: string;
    // Position data for health factor / LTV display
    position?: PositionManager;
    // ========================================================================
    // Morpho-specific props (pair-isolated markets require moving collateral)
    // ========================================================================
    /** Morpho: Raw market context for encoding (OLD market) */
    morphoContext?: {
        marketId: string;
        loanToken: string;
        collateralToken: string;
        oracle: string;
        irm: string;
        lltv: bigint;
    };
    /** Morpho: Collateral token address (same across old and new markets) */
    collateralTokenAddress?: Address;
    /** Morpho: Collateral token symbol */
    collateralTokenSymbol?: string;
    /** Morpho: Current collateral balance */
    collateralBalance?: bigint;
    /** Morpho: Collateral decimals */
    collateralDecimals?: number;
}

export const DebtSwapEvmModal: FC<DebtSwapEvmModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtFromToken,
    debtFromName,
    debtFromIcon,
    debtFromDecimals,
    debtFromPrice,
    currentDebtBalance,
    availableAssets,
    context,
    // Morpho-specific props
    morphoContext,
    collateralTokenAddress,
    collateralTokenSymbol: _collateralTokenSymbol,
    collateralBalance,
    collateralDecimals: _collateralDecimals,
}) => {
    // Prefixed with _ to indicate intentionally unused (reserved for future display)
    void _collateralTokenSymbol;
    void _collateralDecimals;
    const {
        buildDebtSwapFlow,
    } = useKapanRouterV2();

    // ========================================================================
    // Morpho Detection & Market Discovery
    // ========================================================================
    const isMorpho = protocolName.toLowerCase().includes("morpho");
    const { address: userAddress } = useAccount();

    // Fetch compatible Morpho markets (same collateral, different debt)
    const { targetMarkets: morphoTargetMarkets } = useMorphoDebtSwapMarkets({
        chainId,
        collateralTokenAddress: collateralTokenAddress || "",
        currentDebtAddress: debtFromToken,
        enabled: isMorpho && isOpen && !!collateralTokenAddress,
    });

    // Track selected new Morpho market
    const [selectedMorphoMarket, setSelectedMorphoMarket] = useState<MorphoMarket | null>(null);

    // Encode OLD market context (current position)
    const oldMorphoContextEncoded = useMemo(() => {
        if (!isMorpho || !morphoContext) return undefined;
        return encodeMorphoContext(morphoContext as MorphoMarketContextForEncoding);
    }, [isMorpho, morphoContext]);

    // Encode NEW market context (selected target)
    const newMorphoContext = useMemo(() => {
        if (!selectedMorphoMarket) return undefined;
        return marketToContext(selectedMorphoMarket);
    }, [selectedMorphoMarket]);

    const newMorphoContextEncoded = useMemo(() => {
        if (!newMorphoContext) return undefined;
        return encodeMorphoContext(newMorphoContext as MorphoMarketContextForEncoding);
    }, [newMorphoContext]);

    // Check swap router availability and get adapter info directly from deployed contracts
    const oneInchAvailable = is1inchSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const oneInchAdapter = getOneInchAdapterInfo(chainId);
    const pendleAdapter = getPendleAdapterInfo(chainId);
    const defaultRouter = getDefaultSwapRouter(chainId);

    // Swap router selection - default based on chain availability
    const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");

    // Update swap router if chain changes and current router is not available
    useEffect(() => {
        const newRouter = shouldSwitchSwapRouter(swapRouter, oneInchAvailable, pendleAvailable);
        if (newRouter) {
            setSwapRouter(newRouter as SwapRouter);
        }
    }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

    const wasOpenRef = useRef(false);

    useEffect(() => {
        const modalJustOpened = isOpen && !wasOpenRef.current;
        if (modalJustOpened) {
            trackModalOpen(
                protocolName,
                chainId,
                context,
                debtFromToken,
                debtFromName,
                availableAssets?.length ?? null
            );
        }
        wasOpenRef.current = isOpen;
    }, [availableAssets?.length, chainId, debtFromName, debtFromToken, isOpen, context, protocolName]);

    // Flash Loan Providers
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: { name: debtFromName, tokenAddress: debtFromToken, decimals: debtFromDecimals, type: "borrow" },
    });

    // "From" is fixed (current debt to repay)
    const fromAsset: SwapAsset = useMemo(() => ({
        symbol: debtFromName,
        address: debtFromToken,
        decimals: debtFromDecimals,
        rawBalance: currentDebtBalance,
        balance: parseFloat(formatUnits(currentDebtBalance, debtFromDecimals)),
        icon: debtFromIcon,
        price: debtFromPrice,
    }), [debtFromName, debtFromToken, debtFromDecimals, currentDebtBalance, debtFromIcon, debtFromPrice]);

    // Memoized array for fromAssets prop
    const fromAssets = useMemo(() => [fromAsset], [fromAsset]);

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
    const [slippage, setSlippage] = useState<number>(0.1); // Start with minimum, will auto-adjust
    const [amountIn, setAmountIn] = useState(""); // Amount of current debt to repay
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ============ Limit Order State ============
    const [executionType, setExecutionType] = useState<ExecutionType>("market");
    const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
    const [numChunks, setNumChunks] = useState(1);
    const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
    const cowAvailable = isCowProtocolSupported(chainId);
    // Custom buy amount for limit orders (user-editable)
    const [customBuyAmount, setCustomBuyAmount] = useState<string>("");
    const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);

    // Wallet hooks for limit order
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();

    // CoW limit order hook
    const {
        buildOrderCalls: buildLimitOrderCalls,
        isReady: limitOrderReady,
        orderManagerAddress
    } = useCowLimitOrder();


    // Initialize limitOrderConfig with default provider when switching to limit mode
    useEffect(() => {
        if (executionType !== "limit" || limitOrderConfig?.selectedProvider) return;

        const providers = getCowFlashLoanProviders(chainId);
        if (providers.length === 0) return;

        // Default to Morpho if available, otherwise first provider
        const morphoProvider = providers.find(p => p.provider === "morpho");
        const defaultProvider = morphoProvider || providers[0];
        const lenderInfo = getPreferredFlashLoanLender(chainId, defaultProvider.provider);

        setLimitOrderConfig({
            selectedProvider: defaultProvider,
            useFlashLoan: true,
            numChunks: 1,
            chunkSize: 0n,
            chunkSizes: [0n],
            flashLoanLender: lenderInfo?.address || null,
            flashLoanFee: calculateFlashLoanFee(0n, defaultProvider.provider),
            explanation: "Single tx execution",
        });
    }, [executionType, chainId, limitOrderConfig?.selectedProvider]);

    // Sync numChunks state to limitOrderConfig
    useEffect(() => {
        if (limitOrderConfig && limitOrderConfig.numChunks !== numChunks) {
            setLimitOrderConfig({ ...limitOrderConfig, numChunks });
        }
    }, [numChunks, limitOrderConfig]);

    // Ensure "From" is always the debt token
    useEffect(() => {
        const fromMismatch = !selectedFrom || selectedFrom.address !== debtFromToken;
        if (fromMismatch) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtFromToken, fromAsset]);

    // Filter "To" assets (exclude current debt)
    // For Morpho: derive from compatible target markets (same collateral, different debt)
    const toAssets = useMemo(() => {
        if (isMorpho && morphoTargetMarkets.length > 0) {
            // Build SwapAsset array from Morpho target markets
            // Markets are already sorted by borrow APY
            const seenAddresses = new Set<string>();
            return morphoTargetMarkets
                .filter(m => {
                    const addr = m.loanAsset?.address?.toLowerCase();
                    if (!addr || seenAddresses.has(addr)) return false;
                    seenAddresses.add(addr);
                    return true;
                })
                .map(m => ({
                    symbol: m.loanAsset?.symbol || "???",
                    address: (m.loanAsset?.address || "") as Address,
                    decimals: m.loanAsset?.decimals || 18,
                    rawBalance: 0n,
                    balance: 0,
                    icon: tokenNameToLogo(m.loanAsset?.symbol?.toLowerCase() || ""),
                    price: m.loanAsset?.priceUsd
                        ? BigInt(Math.round(Number(m.loanAsset.priceUsd) * 1e8))
                        : undefined,
                    borrowApy: m.state.borrowApy,
                    marketId: m.uniqueKey,
                } as SwapAsset));
        }
        return (availableAssets || []).filter(a => a.address.toLowerCase() !== debtFromToken.toLowerCase());
    }, [isMorpho, morphoTargetMarkets, availableAssets, debtFromToken]);

    // Sync selectedMorphoMarket when user selects a "to" asset
    useEffect(() => {
        if (!isMorpho || !selectedTo) {
            setSelectedMorphoMarket(null);
            return;
        }
        const market = morphoTargetMarkets.find(
            m => m.loanAsset?.address?.toLowerCase() === selectedTo.address.toLowerCase()
        );
        setSelectedMorphoMarket(market || null);
    }, [isMorpho, selectedTo, morphoTargetMarkets]);

    // Auto-switch to Pendle when a PT token is involved in the swap
    useEffect(() => {
        const fromIsPT = isPendleToken(debtFromName);
        const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);
        const shouldSwitchToPendle = (fromIsPT || toIsPT) && pendleAvailable;
        if (shouldSwitchToPendle) {
            setSwapRouter("pendle");
        }
    }, [debtFromName, selectedTo, pendleAvailable]);

    // Amount to repay in raw
    const repayAmountRaw = useMemo(() => {
        const result = parseAmount(amountIn || "0", debtFromDecimals);
        return result.value ?? 0n;
    }, [amountIn, debtFromDecimals]);

    // For limit orders with max: apply dust buffer to buy slightly more than current debt
    // This accounts for interest accrual between order creation and execution
    const limitOrderBuyAmount = useMemo(() => {
        if (executionType !== "limit" || !isMax) {
            return repayAmountRaw;
        }
        // Apply dust buffer (~1 hour of interest) for max repayments
        return calculateDustBuffer(repayAmountRaw);
    }, [executionType, isMax, repayAmountRaw]);

    // Step 1: Get unit quote (1 newDebt -> X currentDebt) to estimate exchange rate
    const unitQuoteAmount = useMemo(() => {
        if (!selectedTo) return "0";
        return parseUnits("1", selectedTo.decimals).toString();
    }, [selectedTo]);

    // 1inch unit quote (only fetch when 1inch router is selected)
    const { data: oneInchUnitQuote, isLoading: isOneInchUnitQuoteLoading } = use1inchQuoteOnly({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtFromToken,
        amount: unitQuoteAmount,
        enabled: oneInchAvailable && swapRouter === "1inch" && !!selectedTo && isOpen && executionType === "market",
    });

    // Pendle unit quote (only fetch when Pendle router is selected)
    const { data: pendleUnitQuote, isLoading: isPendleUnitQuoteLoading } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedTo?.address as Address,
        tokensOut: debtFromToken,
        amountsIn: unitQuoteAmount,
        slippage: 0.03, // 3% for unit quote
        enabled: pendleAvailable && swapRouter === "pendle" && !!selectedTo && !!pendleAdapter && isOpen && unitQuoteAmount !== "0" && executionType === "market",
    });

    const isUnitQuoteLoading = swapRouter === "1inch" ? isOneInchUnitQuoteLoading : isPendleUnitQuoteLoading;

    // Calculate required newDebt input based on unit quote
    const { requiredNewDebt, requiredNewDebtFormatted, exchangeRate } = useMemo(() => {
        return calculateRequiredNewDebt({
            selectedTo,
            repayAmountRaw,
            oneInchUnitQuote,
            pendleUnitQuote,
            debtFromDecimals,
            slippage,
        });
    }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, repayAmountRaw, debtFromDecimals, slippage]);

    // Flash Loan selection - check liquidity for the NEW debt token we're flash loaning
    const { selectedProvider, setSelectedProvider } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: selectedTo?.address,  // NEW debt token (what we flash loan)
        amount: requiredNewDebt,            // Amount of new debt to flash loan (calculated above)
        chainId,
    });

    // Step 2: Get actual swap quote with the required amount
    const minSwapAmount = selectedTo ? parseUnits("0.001", selectedTo.decimals) : 0n;
    const oneInchSwapEnabled = oneInchAvailable && swapRouter === "1inch" && requiredNewDebt > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen && executionType === "market";
    const pendleSwapEnabled = pendleAvailable && swapRouter === "pendle" && requiredNewDebt > minSwapAmount && !!selectedTo && !!pendleAdapter && isOpen && executionType === "market";

    // 1inch quote
    const { data: oneInchSwapQuote, isLoading: is1inchSwapQuoteLoading, error: oneInchQuoteError } = use1inchQuote({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtFromToken,
        amount: requiredNewDebt.toString(),
        from: oneInchAdapter?.address || ("" as Address),
        slippage,
        enabled: oneInchSwapEnabled,
    });

    // Pendle quote
    const { data: pendleQuoteData, isLoading: isPendleQuoteLoading, error: pendleQuoteError } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        slippage: slippage / 100, // Pendle uses decimal (0.03 = 3%)
        tokensIn: selectedTo?.address as Address,
        tokensOut: debtFromToken,
        amountsIn: requiredNewDebt.toString(),
        enableAggregator: true,
        enabled: pendleSwapEnabled,
    });

    // Combine quote data based on selected router
    const swapQuote = useMemo(() => {
        if (swapRouter === "pendle" && pendleQuoteData) {
            const outAmount = pendleQuoteData.data.amountPtOut || pendleQuoteData.data.amountTokenOut || "0";
            return {
                dstAmount: outAmount,
                tx: { data: pendleQuoteData.transaction.data },
                srcUSD: null,
                dstUSD: null,
            };
        }
        return oneInchSwapQuote;
    }, [swapRouter, pendleQuoteData, oneInchSwapQuote]);

    const isSwapQuoteLoading = swapRouter === "1inch" ? is1inchSwapQuoteLoading : isPendleQuoteLoading;
    const quoteError = swapRouter === "1inch" ? oneInchQuoteError : pendleQuoteError;
    const isQuoteLoading = isUnitQuoteLoading || isSwapQuoteLoading;

    // Check adapter availability
    const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;

    // What the swap will actually produce (from the real quote)
    const expectedOutput = swapQuote
        ? formatUnits(BigInt(swapQuote.dstAmount), debtFromDecimals)
        : "0";

    // Is the expected output enough to cover the repay?
    const outputCoversRepay = swapQuote
        ? BigInt(swapQuote.dstAmount) >= repayAmountRaw
        : false;

    // ============ Limit Order: CoW Quote ============
    // Use limitOrderBuyAmount which includes dust buffer when isMax is true
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedTo?.address || "",        // newDebt to sell
        buyToken: debtFromToken,                      // oldDebt to receive (exact)
        buyAmount: limitOrderBuyAmount.toString(),   // Buffered amount when isMax (covers interest accrual)
        kind: "buy",                                  // KIND_BUY: exact buy, max sell
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && limitOrderBuyAmount > 0n && !!selectedTo && !!userAddress && isOpen,
    });

    // ============ Limit Order: New Debt Amount from CoW Quote ============
    const limitOrderNewDebt = useMemo(() => {
        return calculateLimitOrderNewDebt(cowQuote, selectedTo, slippage);
    }, [cowQuote, selectedTo, slippage]);

    // ============ Limit Order: Effective New Debt (custom or quote) ============
    // When user modifies the price, use their custom amount instead of the quote
    const effectiveLimitOrderNewDebt = useMemo(() => {
        if (useCustomBuyAmount && customBuyAmount && selectedTo) {
            const parsed = parseAmount(customBuyAmount, selectedTo.decimals);
            if (parsed.value && parsed.value > 0n) {
                return parsed.value;
            }
        }
        return limitOrderNewDebt;
    }, [useCustomBuyAmount, customBuyAmount, selectedTo, limitOrderNewDebt]);

    // ============ Limit Order: Flash Loan Info ============
    const cowFlashLoanInfo = useMemo(() => {
        return buildCowFlashLoanInfo(chainId, limitOrderConfig, executionType, selectedTo, effectiveLimitOrderNewDebt);
    }, [chainId, limitOrderConfig, executionType, effectiveLimitOrderNewDebt, selectedTo]);

    // ============ Limit Order: Build Chunk Instructions ============
    const buildCowInstructions = useMemo(() => {
        if (!selectedTo || !userAddress || !orderManagerAddress || !cowFlashLoanInfo) {
            return [{ preInstructions: [], postInstructions: [] }];
        }

        // ========================================================================
        // MORPHO (Pair-Isolated): Must move collateral between markets
        // ========================================================================
        if (isMorpho && oldMorphoContextEncoded && newMorphoContextEncoded && collateralTokenAddress && collateralBalance) {
            const numChunks = limitOrderConfig?.numChunks ?? 1;
            const chunkCollateralAmount = collateralBalance / BigInt(numChunks);
            const chunkBuyAmount = limitOrderBuyAmount / BigInt(numChunks);

            return Array(numChunks).fill(null).map(() => {
                /**
                 * Morpho Pair-Isolated Debt Swap (Limit Order) - KIND_BUY:
                 *
                 * UTXO Layout (hook prepends implicit UTXOs for buy orders):
                 * [0] = actual sell amount used (newDebt, from fundOrder ToOutput)
                 * [1] = leftover from flash loan (newDebt refund)
                 * --- Post-hook instructions start here ---
                 * [2] PullToken(oldDebt from OM) -> pulled oldDebt
                 * [3] Approve(2, morpho) -> dummy
                 * [4] Repay(input=2, OLD_MARKET) -> refund
                 * [5] WithdrawCollateral(OLD_MARKET) -> collateral
                 * [6] Approve(5, morpho) -> dummy
                 *     DepositCollateral(input=5, NEW_MARKET) -> NO OUTPUT
                 * [7] Borrow(input=0, NEW_MARKET) -> newDebt for flash loan repay
                 * [8] Add(7, 1) -> borrowed + leftover for flash loan repay
                 * flashLoanRepaymentUtxoIndex: 8
                 */
                const postInstructions: ProtocolInstruction[] = [
                    // 1. PullToken: pull oldDebt from OrderManager -> [2]
                    createRouterInstruction(encodePullToken(chunkBuyAmount, debtFromToken as Address, orderManagerAddress as Address)),

                    // 2. Approve oldDebt for Morpho gateway -> [3]
                    createRouterInstruction(encodeApprove(2, "morpho-blue")),

                    // 3. Repay oldDebt on OLD market (input=2) -> [4] (refund)
                    createProtocolInstruction(
                        "morpho-blue",
                        encodeLendingInstruction(LendingOp.Repay, debtFromToken, userAddress, 0n, oldMorphoContextEncoded, 2)
                    ),

                    // 4. Withdraw collateral from OLD market -> [5]
                    createProtocolInstruction(
                        "morpho-blue",
                        encodeLendingInstruction(LendingOp.WithdrawCollateral, collateralTokenAddress, userAddress, chunkCollateralAmount, oldMorphoContextEncoded, 999)
                    ),

                    // 5. Approve collateral for Morpho gateway -> [6]
                    createRouterInstruction(encodeApprove(5, "morpho-blue")),

                    // 6. Deposit collateral to NEW market (input=5) -> NO OUTPUT
                    createProtocolInstruction(
                        "morpho-blue",
                        encodeLendingInstruction(LendingOp.DepositCollateral, collateralTokenAddress, userAddress, 0n, newMorphoContextEncoded, 5)
                    ),

                    // 7. Borrow newDebt from NEW market (amount from [0]) -> [7]
                    createProtocolInstruction(
                        "morpho-blue",
                        encodeLendingInstruction(LendingOp.Borrow, selectedTo.address, userAddress, 0n, newMorphoContextEncoded, 0)
                    ),

                    // 8. Add: borrowed ([7]) + leftover ([1]) -> [8] for flash loan repay
                    createRouterInstruction(encodeAdd(7, 1)),
                ];

                // For max repayments: Push any refund from Repay ([4]) back to user
                if (isMax) {
                    postInstructions.push(
                        createRouterInstruction(encodePushToken(4, userAddress))
                    );
                }

                return {
                    preInstructions: [],
                    postInstructions,
                    flashLoanRepaymentUtxoIndex: 8, // [8] = Add output (borrowed + leftover)
                };
            });
        }

        // ========================================================================
        // Standard flow (Aave, Compound, Venus) - shared pool model
        // ========================================================================
        return buildCowChunkInstructions({
            selectedTo,
            userAddress,
            repayAmountRaw: limitOrderBuyAmount,  // Use buffered amount for max repayments
            orderManagerAddress,
            protocolName,
            context,
            debtFromToken,
            debtFromName,
            debtFromDecimals,
            cowFlashLoanInfo,
            limitOrderConfig,
            isMax,  // Enable dust clearing (refund to user) when max is selected
        });
    }, [selectedTo, userAddress, limitOrderBuyAmount, orderManagerAddress, protocolName, context, debtFromToken, debtFromName, debtFromDecimals, cowFlashLoanInfo, limitOrderConfig, isMax, isMorpho, oldMorphoContextEncoded, newMorphoContextEncoded, collateralTokenAddress, collateralBalance]);

    // amountOut = required new debt (what user will borrow)
    const amountOut = useMemo(() => {
        // For limit orders, use custom buy amount if user has set one
        if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
            return customBuyAmount;
        }
        return executionType === "limit"
            ? (limitOrderNewDebt > 0n && selectedTo ? formatUnits(limitOrderNewDebt, selectedTo.decimals) : "0")
            : requiredNewDebtFormatted;
    }, [executionType, useCustomBuyAmount, customBuyAmount, limitOrderNewDebt, selectedTo, requiredNewDebtFormatted]);

    const buildFlow = (): ProtocolInstruction[] => {
        if (!swapQuote || !selectedTo || !hasAdapter || requiredNewDebt === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;
        const swapProtocol = swapRouter === "1inch" ? "oneinch" : "pendle";

        // ========================================================================
        // MORPHO (Pair-Isolated): Must move collateral between markets
        // ========================================================================
        if (isMorpho && oldMorphoContextEncoded && newMorphoContextEncoded && collateralTokenAddress && collateralBalance) {
            const minAmountOutBigInt = repayAmountRaw; // For SwapExactOut, this is the exact output we want
            const swapContext = encodeAbiParameters(
                [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
                [debtFromToken as Address, minAmountOutBigInt, swapQuote.tx.data as `0x${string}`]
            );

            /**
             * Morpho Pair-Isolated Debt Swap (Market Order):
             *
             * UTXO Layout:
             * [0] ToOutput(maxNewDebt) -> amount ref
             * [1] FlashLoan(0) -> new debt tokens
             * [2] Approve(1, swap) -> dummy
             * [3],[4] SwapExactOut(1) -> oldDebt, newDebt refund
             * [5] Approve(3, morpho) -> dummy
             * [6] Repay(3, OLD_MARKET) -> repay refund
             * [7] WithdrawCollateral(collateralBalance, OLD_MARKET) -> collateral
             * [8] Approve(7, morpho) -> dummy
             *     DepositCollateral(7, NEW_MARKET) -> NO OUTPUT
             * [9] Borrow(0, NEW_MARKET) -> to repay flash loan
             */
            const instructions: ProtocolInstruction[] = [];

            // 0. ToOutput(maxNewDebt) -> [0]
            instructions.push(
                createRouterInstruction(encodeToOutput(requiredNewDebt, selectedTo.address))
            );

            // 1. FlashLoan(0) -> [1]
            instructions.push(
                createRouterInstruction(encodeFlashLoan(providerEnum, 0))
            );

            // 2. Approve swap protocol for new debt ([1]) -> [2]
            instructions.push(
                createRouterInstruction(encodeApprove(1, swapProtocol))
            );

            // 3. SwapExactOut new debt -> old debt (input=1) -> [3] oldDebt, [4] newDebt refund
            instructions.push(
                createProtocolInstruction(
                    swapProtocol,
                    encodeLendingInstruction(LendingOp.SwapExactOut, selectedTo.address, userAddress!, 0n, swapContext, 1)
                )
            );

            // 4. Approve Morpho for old debt ([3]) -> [5]
            instructions.push(
                createRouterInstruction(encodeApprove(3, "morpho-blue"))
            );

            // 5. Repay old debt on OLD market (input=3) -> [6]
            instructions.push(
                createProtocolInstruction(
                    "morpho-blue",
                    encodeLendingInstruction(LendingOp.Repay, debtFromToken, userAddress!, 0n, oldMorphoContextEncoded, 3)
                )
            );

            // 6. Withdraw ALL collateral from OLD market -> [7]
            instructions.push(
                createProtocolInstruction(
                    "morpho-blue",
                    encodeLendingInstruction(LendingOp.WithdrawCollateral, collateralTokenAddress, userAddress!, collateralBalance, oldMorphoContextEncoded, 999)
                )
            );

            // 7. Approve Morpho for collateral ([7]) -> [8]
            instructions.push(
                createRouterInstruction(encodeApprove(7, "morpho-blue"))
            );

            // 8. Deposit collateral to NEW market (input=7) -> NO OUTPUT
            instructions.push(
                createProtocolInstruction(
                    "morpho-blue",
                    encodeLendingInstruction(LendingOp.DepositCollateral, collateralTokenAddress, userAddress!, 0n, newMorphoContextEncoded, 7)
                )
            );

            // 9. Borrow new debt from NEW market (amount from [0]) -> stays in router for flash loan repay
            instructions.push(
                createProtocolInstruction(
                    "morpho-blue",
                    encodeLendingInstruction(LendingOp.Borrow, selectedTo.address, userAddress!, 0n, newMorphoContextEncoded, 0)
                )
            );

            // 10. Push refunds to user
            instructions.push(
                createRouterInstruction(encodePushToken(6, userAddress!)) // repay refund
            );
            instructions.push(
                createRouterInstruction(encodePushToken(4, userAddress!)) // swap refund
            );

            return instructions;
        }

        // ========================================================================
        // Standard flow (Aave, Compound, Venus) - shared pool model
        // ========================================================================
        return buildDebtSwapFlow(
            protocolName,
            debtFromToken,           // currentDebt (to repay)
            selectedTo.address,      // newDebt (to borrow)
            repayAmountRaw,          // amount of currentDebt to repay
            requiredNewDebt,         // max amount of newDebt to borrow
            swapQuote.tx.data,       // swap data
            providerEnum,
            context,
            isMax,                   // if true, uses GetBorrowBalance for exact debt amount on-chain
            swapProtocol,
        );
    };

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Debt Swapped successfully!",
        emptyFlowErrorMessage: "Failed to build swap instructions",
        simulateWhenBatching: true,
    });

    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

    const handleSwapWrapper = useCallback(async () => {
        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            market: context ?? null,
            fromToken: debtFromToken,
            fromName: debtFromName,
            toToken: selectedTo?.address ?? null,
            toName: selectedTo?.symbol ?? null,
            amountIn,
            isMax,
            slippage,
            preferBatching,
            flashLoanProvider: selectedProvider?.name ?? null,
            swapRouter,
        } satisfies Record<string, string | number | boolean | null>;

        try {
            setIsSubmitting(true);
            track("debt_swap_tx_begin", txBeginProps);
            await handleSwap(amountIn, isMax);
            track("debt_swap_tx_complete", { ...txBeginProps, status: "success" });
        } catch (e) {
            track("debt_swap_tx_complete", {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsSubmitting(false);
        }
    }, [protocolName, chainId, context, debtFromToken, debtFromName, selectedTo?.address, selectedTo?.symbol, amountIn, isMax, slippage, preferBatching, selectedProvider?.name, swapRouter, handleSwap]);

    // ============ Limit Order: Submit Handler ============
    const handleLimitOrderSubmit = useCallback(async () => {
        // Validate required data
        if (!selectedTo || !userAddress || !orderManagerAddress || !walletClient || !publicClient) {
            throw new Error("Missing required data for limit order");
        }
        if (!limitOrderConfig?.selectedProvider || !cowFlashLoanInfo) {
            throw new Error("No flash loan provider selected");
        }

        const analyticsProps = createLimitOrderAnalyticsProps({
            protocolName,
            chainId,
            debtFromToken,
            debtFromName,
            selectedTo,
            repayAmountRaw,
            debtFromDecimals,
            limitOrderNewDebt: effectiveLimitOrderNewDebt,
            flashLoanProviderName: limitOrderConfig.selectedProvider.name,
        });

        setIsLimitSubmitting(true);
        let notificationId: string | number | undefined;

        try {
            track("debt_swap_limit_order_begin", analyticsProps);

            logLimitOrderBuildStart({
                selectedTo,
                debtFromName,
                limitOrderNewDebt: effectiveLimitOrderNewDebt,
                repayAmountRaw,
                debtFromDecimals,
                cowFlashLoanInfo,
                cowQuote,
            });

            // Build limit order calls
            // Use limitOrderBuyAmount which includes dust buffer when isMax
            const callParams = buildLimitOrderCallParams({
                selectedTo,
                debtFromToken,
                limitOrderNewDebt: effectiveLimitOrderNewDebt,
                repayAmountRaw: limitOrderBuyAmount,
                cowFlashLoanInfo,
                buildCowInstructions,
                limitOrderConfig,
                protocolName,
            });

            const limitOrderResult = await buildLimitOrderCalls(callParams);

            if (!limitOrderResult) {
                throw new Error("Failed to build limit order calls");
            }

            if (!limitOrderResult.success) {
                handleLimitOrderBuildFailure(limitOrderResult, analyticsProps);
            }

            console.log("[Limit Order] Order calls built:", limitOrderResult.calls.length);

            // Save order note for display on orders page
            saveLimitOrderNote(
                limitOrderResult.salt,
                protocolName,
                debtFromName,
                selectedTo.symbol,
                chainId
            );

            const allCalls = limitOrderResult.calls;
            notificationId = notification.loading(
                <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
            );

            // Always use sequential execution for limit orders
            // MetaMask has issues with approvals in batched calls that may go unused
            await executeSequentialLimitOrder({
                allCalls,
                walletClient,
                publicClient,
                chainId,
                orderManagerAddress,
                analyticsProps,
                onClose,
                notificationId,
            });
        } catch (e) {
            handleLimitOrderError(e, notificationId, analyticsProps);
            throw e;
        } finally {
            setIsLimitSubmitting(false);
        }
    }, [selectedTo, userAddress, orderManagerAddress, walletClient, publicClient, limitOrderConfig, cowFlashLoanInfo, protocolName, chainId, debtFromToken, debtFromName, repayAmountRaw, debtFromDecimals, effectiveLimitOrderNewDebt, cowQuote, buildCowInstructions, buildLimitOrderCalls, onClose, limitOrderBuyAmount]);

    const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && requiredNewDebt > 0n && hasAdapter;
    const canSubmitLimit = executionType === "limit" && limitOrderReady && !!cowFlashLoanInfo &&
        parseFloat(amountIn) > 0 && !!orderManagerAddress && effectiveLimitOrderNewDebt > 0n;
    const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

    // Calculate USD values from token prices for price impact fallback
    // (1inch v6.0 API doesn't return srcUSD/dstUSD, so we compute from token prices)
    // Swap is: newDebt (selectedTo) → oldDebt (debtFromToken)
    const srcUsdFallback = useMemo(() => {
        if (!selectedTo?.price || requiredNewDebt === 0n) return undefined;
        const amount = parseFloat(formatUnits(requiredNewDebt, selectedTo.decimals));
        if (amount <= 0) return undefined;
        return amount * Number(formatUnits(selectedTo.price, 8));
    }, [selectedTo?.price, selectedTo?.decimals, requiredNewDebt]);

    const dstUsdFallback = useMemo(() => {
        if (!debtFromPrice || !expectedOutput) return undefined;
        const parsed = parseFloat(expectedOutput);
        if (isNaN(parsed) || parsed <= 0) return undefined;
        return parsed * Number(formatUnits(debtFromPrice, 8));
    }, [debtFromPrice, expectedOutput]);

    // Auto-slippage and price impact calculation
    const { priceImpact, formattedPriceImpact } = useAutoSlippage({
        slippage,
        setSlippage,
        oneInchQuote: oneInchSwapQuote,
        pendleQuote: pendleQuoteData,
        swapRouter,
        resetDep: selectedTo?.address,
        srcUsdFallback,
        dstUsdFallback,
    });

    // Right panel for debt swap - Market/Limit settings
    const rightPanel = useMemo(() => (
        <div className="space-y-3">
            {/* Execution Type Toggle */}
            <ExecutionTypeToggle
                value={executionType}
                onChange={setExecutionType}
                limitAvailable={cowAvailable}
                limitReady={limitOrderReady}
            />

            {/* Market Order Settings */}
            {executionType === "market" && (
                <div className="space-y-2 text-xs">
                    {/* Dropdowns */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-base-content/50">Slippage</span>
                            <select
                                className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                value={slippage}
                                onChange={(e) => setSlippage(parseFloat(e.target.value))}
                            >
                                {[0.05, 0.1, 0.3, 0.5, 1, 2, 3, 5].map(s => (
                                    <option key={s} value={s}>{s}%</option>
                                ))}
                            </select>
                        </div>
                        {oneInchAvailable && pendleAvailable && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Router</span>
                                <select
                                    className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                    value={swapRouter}
                                    onChange={(e) => setSwapRouter(e.target.value as SwapRouter)}
                                >
                                    <option value="1inch">1inch</option>
                                    <option value="pendle">Pendle</option>
                                </select>
                            </div>
                        )}
                        {flashLoanProviders && flashLoanProviders.length > 1 && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Flash Loan</span>
                                <select
                                    className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                    value={selectedProvider?.name || ""}
                                    onChange={(e) => {
                                        const p = flashLoanProviders.find(provider => provider.name === e.target.value);
                                        if (p) setSelectedProvider(p);
                                    }}
                                >
                                    {flashLoanProviders.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="border-base-300/30 space-y-1 border-t pt-2">
                        {priceImpact !== undefined && priceImpact !== null && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Price Impact</span>
                                <span className={priceImpact > 1 ? "text-warning" : priceImpact > 3 ? "text-error" : "text-base-content/80"}>
                                    {formattedPriceImpact || `${priceImpact.toFixed(2)}%`}
                                </span>
                            </div>
                        )}
                        {exchangeRate && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Rate</span>
                                <span className="text-base-content/80">
                                    1:{parseFloat(exchangeRate).toFixed(4)}
                                </span>
                            </div>
                        )}
                        {swapQuote && expectedOutput && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Output</span>
                                <span className={outputCoversRepay === false ? "text-warning" : outputCoversRepay === true ? "text-success" : "text-base-content/80"}>
                                    {parseFloat(expectedOutput).toFixed(4)} {debtFromName}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Limit Order Settings */}
            {executionType === "limit" && selectedTo && (
                <div className="space-y-2 text-xs">
                    {/* Order Type Indicator */}
                    <div className="flex items-center justify-between">
                        <span className="text-base-content/50">Order Type</span>
                        <Tooltip.Provider delayDuration={200}>
                            <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                    <span className="text-primary flex cursor-help items-center gap-1 font-medium">
                                        Buy Order
                                        <InformationCircleIcon className="size-3.5" />
                                    </span>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        className="bg-base-300 text-base-content z-50 max-w-[280px] rounded-lg px-3 py-2 text-xs shadow-lg"
                                        sideOffset={5}
                                    >
                                        You are buying new debt tokens by selling repayment tokens. The order executes when someone is willing to sell you the new debt tokens at your specified price or better.
                                        <Tooltip.Arrow className="fill-base-300" />
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Tooltip.Provider>
                    </div>

                    {/* Flash Loan Provider */}
                    {limitOrderConfig?.selectedProvider && (
                        <div className="flex items-center justify-between">
                            <span className="text-base-content/50">Flash Loan</span>
                            <span className="text-base-content/80 font-medium">
                                {limitOrderConfig.selectedProvider.provider}
                            </span>
                        </div>
                    )}

                    {/* Limit Price vs Market comparison */}
                    {selectedTo && effectiveLimitOrderNewDebt > 0n && repayAmountRaw > 0n && (
                        <div className="bg-base-200/50 space-y-1 rounded p-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Limit Price</span>
                                <span className="text-base-content/80 font-medium">
                                    {isCowQuoteLoading ? (
                                        <span className="loading loading-dots loading-xs" />
                                    ) : (
                                        `1 ${debtFromName} = ${(Number(formatUnits(effectiveLimitOrderNewDebt, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtFromDecimals))).toFixed(4)} ${selectedTo.symbol}`
                                    )}
                                </span>
                            </div>
                            {exchangeRate && (
                                <div className="text-center text-[10px]">
                                    {(() => {
                                        const limitRate = Number(formatUnits(effectiveLimitOrderNewDebt, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtFromDecimals));
                                        const marketRate = parseFloat(exchangeRate);
                                        const pctDiff = ((limitRate - marketRate) / marketRate) * 100;
                                        const isAbove = pctDiff > 0;
                                        const absDiff = Math.abs(pctDiff);
                                        if (absDiff < 0.01) return <span className="text-base-content/40">at market price</span>;
                                        return (
                                            <span className={isAbove ? "text-warning" : "text-success"}>
                                                {absDiff.toFixed(2)}% {isAbove ? "above" : "below"} market
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Chunks */}
                    {selectedTo && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Chunks</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    className="border-base-300 bg-base-200 text-base-content/80 w-14 rounded border px-2 py-0.5 text-right text-xs font-medium"
                                    value={numChunks}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 1;
                                        setNumChunks(Math.max(1, Math.min(100, val)));
                                    }}
                                />
                            </div>
                            {numChunks > 1 && effectiveLimitOrderNewDebt > 0n && (
                                <div className="text-base-content/50 text-[10px]">
                                    Max {formatUnits(effectiveLimitOrderNewDebt / BigInt(numChunks), selectedTo.decimals).slice(0, 8)} {selectedTo.symbol} per chunk
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}
        </div>
    ), [executionType, setExecutionType, cowAvailable, limitOrderReady, slippage, setSlippage, priceImpact, formattedPriceImpact, exchangeRate, selectedTo, debtFromName, swapQuote, expectedOutput, outputCoversRepay, flashLoanProviders, selectedProvider, setSelectedProvider, oneInchAvailable, pendleAvailable, swapRouter, setSwapRouter, limitOrderConfig, numChunks, setNumChunks, effectiveLimitOrderNewDebt, isCowQuoteLoading, repayAmountRaw, debtFromDecimals]);

    // Info content
    const infoContent = executionType === "market" ? (
        <MarketOrderInfoContent swapRouter={swapRouter} selectedProviderName={selectedProvider?.name} />
    ) : (
        <LimitOrderInfoContent />
    );

    // Memoize warnings JSX to avoid re-creating on each render
    const warnings = useMemo(
        () => (
            <DebtSwapWarnings
                executionType={executionType}
                swapQuote={swapQuote}
                outputCoversRepay={outputCoversRepay}
                expectedOutput={expectedOutput}
                debtFromName={debtFromName}
                swapRouter={swapRouter}
                oneInchAdapter={oneInchAdapter}
                hasAdapter={hasAdapter}
                isOpen={isOpen}
                isCowQuoteLoading={isCowQuoteLoading}
            />
        ),
        [executionType, swapQuote, outputCoversRepay, expectedOutput, debtFromName, swapRouter, oneInchAdapter, hasAdapter, isOpen, isCowQuoteLoading],
    );

    // Pre-compute execution type dependent props to reduce cognitive complexity in JSX
    const isMarketExecution = executionType === "market";
    const quoteLoadingProp = isMarketExecution ? isQuoteLoading : isCowQuoteLoading;
    const quoteErrorProp = isMarketExecution ? quoteError : null;
    const preferBatchingProp = isMarketExecution ? preferBatching : undefined;
    const setPreferBatchingProp = isMarketExecution ? setPreferBatching : undefined;
    const onSubmitHandler = isMarketExecution ? handleSwapWrapper : handleLimitOrderSubmit;
    const isSubmittingProp = isMarketExecution ? isSubmitting : isLimitSubmitting;
    const submitLabelProp = isMarketExecution ? "Swap Debt" : "Create Limit Order";

    // Handler for when user edits the output amount (limit orders)
    const handleAmountOutChange = useCallback((value: string) => {
        setCustomBuyAmount(value);
        setUseCustomBuyAmount(true);
    }, []);

    // Limit price adjustment buttons (shown below "New Debt" for limit orders)
    const limitPriceButtons = useMemo(() => {
        if (executionType !== "limit" || !selectedTo || limitOrderNewDebt === 0n) return null;

        const marketAmount = Number(formatUnits(limitOrderNewDebt, selectedTo.decimals));

        const adjustByPercent = (delta: number) => {
            const newAmount = marketAmount * (1 + delta / 100);
            setCustomBuyAmount(newAmount.toFixed(6));
            setUseCustomBuyAmount(true);
        };

        const resetToMarket = () => {
            // Set to exact market quote (no slippage adjustment)
            const exactMarket = formatUnits(limitOrderNewDebt, selectedTo.decimals);
            setCustomBuyAmount(exactMarket);
            setUseCustomBuyAmount(true);
        };

        return (
            <div className="flex flex-wrap items-center justify-center gap-1 py-1">
                {[-1, -0.5, -0.1].map(delta => (
                    <button
                        key={delta}
                        onClick={() => adjustByPercent(delta)}
                        className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]"
                    >
                        {delta}%
                    </button>
                ))}
                <button
                    onClick={resetToMarket}
                    className="bg-primary/20 text-primary hover:bg-primary/30 rounded px-2 py-0.5 text-[10px] font-medium"
                >
                    Market
                </button>
                {[0.1, 0.5, 1].map(delta => (
                    <button
                        key={delta}
                        onClick={() => adjustByPercent(delta)}
                        className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]"
                    >
                        +{delta}%
                    </button>
                ))}
            </div>
        );
    }, [executionType, selectedTo, limitOrderNewDebt]);

    // Prefer Morpho for limit orders
    useEffect(() => {
        if (executionType === "limit" && flashLoanProviders && flashLoanProviders.length > 0) {
            const morphoProvider = flashLoanProviders.find(p => p.name.toLowerCase().includes("morpho"));
            if (morphoProvider && selectedProvider?.name !== morphoProvider.name) {
                setSelectedProvider(morphoProvider);
            }
        }
    }, [executionType, flashLoanProviders, selectedProvider, setSelectedProvider]);

    return (
        <SwapModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Swap Debt"
            protocolName={protocolName}
            fromAssets={fromAssets}
            toAssets={toAssets}
            initialFromAddress={debtFromToken}
            selectedFrom={selectedFrom}
            setSelectedFrom={setSelectedFrom}
            selectedTo={selectedTo}
            setSelectedTo={setSelectedTo}
            amountIn={amountIn}
            setAmountIn={setAmountIn}
            isMax={isMax}
            setIsMax={setIsMax}
            amountOut={amountOut}
            isQuoteLoading={quoteLoadingProp}
            quoteError={quoteErrorProp}
            slippage={slippage}
            setSlippage={setSlippage}
            preferBatching={preferBatchingProp}
            setPreferBatching={setPreferBatchingProp}
            onSubmit={onSubmitHandler}
            isSubmitting={isSubmittingProp}
            canSubmit={canSubmit}
            submitLabel={submitLabelProp}
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Repay Debt"
            toLabel="New Debt"
            fromReadOnly={true}
            hideDefaultStats={true}
            rightPanel={rightPanel}
            onAmountOutChange={executionType === "limit" ? handleAmountOutChange : undefined}
            limitPriceButtons={limitPriceButtons}
        />
    );
};

// ============ Sub-components to reduce main component complexity ============

interface MarketOrderInfoContentProps {
    swapRouter: SwapRouter;
    selectedProviderName?: string;
}

const MarketOrderInfoContent: FC<MarketOrderInfoContentProps> = ({ swapRouter, selectedProviderName }) => (
    <div className="space-y-4 py-2">
        <div className="alert alert-info bg-info/10 border-info/20 text-sm">
            <InformationCircleIcon className="size-5 flex-shrink-0" />
            <span>
                <strong>How Debt Swap Works</strong>
                <br />
                This feature allows you to change your debt asset without closing your collateral position.
            </span>
        </div>

        <div className="space-y-4 px-2">
            <InfoStep step={1} title="Flash Loan" isLast={false}>
                <p className="text-base-content/70 text-xs">We borrow the new debt asset via a Flash Loan.</p>
                <div className="bg-base-200 mt-1 inline-block rounded p-1 text-xs">
                    Provider: {selectedProviderName || "Auto"}
                </div>
            </InfoStep>

            <InfoStep step={2} title="Swap" isLast={false}>
                <p className="text-base-content/70 text-xs">
                    We swap the new debt token for your current debt token using {swapRouter === "1inch" ? "1inch" : "Pendle"}.
                </p>
            </InfoStep>

            <InfoStep step={3} title="Repay Current Debt" isLast={false}>
                <p className="text-base-content/70 text-xs">Your current debt is repaid with the swapped tokens.</p>
            </InfoStep>

            <InfoStep step={4} title="Borrow New Debt" isLast={true}>
                <p className="text-base-content/70 text-xs">New debt is borrowed to repay the Flash Loan.</p>
            </InfoStep>
        </div>
    </div>
);

const LimitOrderInfoContent: FC = () => (
    <div className="space-y-4 py-2">
        <div className="alert alert-info bg-info/10 border-info/20 text-sm">
            <InformationCircleIcon className="size-5 flex-shrink-0" />
            <span>
                <strong>How Limit Order Debt Swap Works</strong>
                <br />
                Your order waits for CoW solvers to find the best price, then executes atomically.
            </span>
        </div>

        <div className="space-y-4 px-2">
            <InfoStep step={1} title="Create Order" isLast={false}>
                <p className="text-base-content/70 text-xs">Your limit order is created and submitted to CoW Protocol.</p>
            </InfoStep>

            <InfoStep step={2} title="Solver Competition" isLast={false}>
                <p className="text-base-content/70 text-xs">Solvers compete to fill your order at the best price.</p>
            </InfoStep>

            <InfoStep step={3} title="Flash Loan + Swap" isLast={false}>
                <p className="text-base-content/70 text-xs">Solver takes flash loan, swaps new debt for old debt.</p>
            </InfoStep>

            <InfoStep step={4} title="Repay + Borrow" isLast={true}>
                <p className="text-base-content/70 text-xs">Old debt repaid, new debt borrowed to cover flash loan. All atomic!</p>
            </InfoStep>
        </div>
    </div>
);

interface InfoStepProps {
    step: number;
    title: string;
    isLast: boolean;
    children: React.ReactNode;
}

const InfoStep: FC<InfoStepProps> = ({ step, title, isLast, children }) => (
    <div className="flex gap-3">
        <div className="flex flex-col items-center">
            <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">
                {step}
            </div>
            {!isLast && <div className="bg-base-300 my-1 h-full w-0.5"></div>}
        </div>
        <div className={isLast ? "" : "pb-4"}>
            <h4 className="text-sm font-medium">{title}</h4>
            {children}
        </div>
    </div>
);

interface DebtSwapWarningsProps {
    executionType: ExecutionType;
    swapQuote: { dstAmount: string; tx: { data: string; from?: string }; srcUSD?: string | null; dstUSD?: string | null } | null | undefined;
    outputCoversRepay: boolean;
    expectedOutput: string;
    debtFromName: string;
    swapRouter: SwapRouter;
    oneInchAdapter: { address: string } | null | undefined;
    hasAdapter: boolean;
    isOpen: boolean;
    isCowQuoteLoading: boolean;
}

const DebtSwapWarnings: FC<DebtSwapWarningsProps> = ({
    executionType,
    swapQuote,
    outputCoversRepay,
    expectedOutput,
    debtFromName,
    swapRouter,
    oneInchAdapter,
    hasAdapter,
    isOpen,
    isCowQuoteLoading,
}) => {
    const showOutputWarning = executionType === "market" && swapQuote && !outputCoversRepay;
    const showFromMismatchWarning = executionType === "market" && swapRouter === "1inch" && swapQuote && oneInchAdapter && "from" in swapQuote.tx && swapQuote.tx.from?.toLowerCase() !== oneInchAdapter.address.toLowerCase();
    const showNoAdapterWarning = executionType === "market" && !hasAdapter && isOpen;
    const showCowQuoteLoading = executionType === "limit" && isCowQuoteLoading;

    return (
        <>
            {showOutputWarning && (
                <WarningDisplay
                    message={`Swap output (${expectedOutput} ${debtFromName}) may not fully cover repay amount. Consider increasing slippage or reducing amount.`}
                    size="sm"
                />
            )}
            {showFromMismatchWarning && (
                <WarningDisplay
                    message="Warning: Quote 'from' address mismatch!"
                    size="sm"
                    breakAll
                />
            )}
            {showNoAdapterWarning && (
                <WarningDisplay
                    message={`${swapRouter === "1inch" ? "1inch" : "Pendle"} Adapter not found on this network. Swaps unavailable.`}
                    size="sm"
                />
            )}
            {showCowQuoteLoading && (
                <div className="alert alert-info py-2 text-xs">
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Fetching CoW quote...</span>
                </div>
            )}
        </>
    );
};
