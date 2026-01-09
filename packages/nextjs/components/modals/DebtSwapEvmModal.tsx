import { FC, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useSendCalls } from "wagmi/experimental";
import { parseAmount } from "~~/utils/validation";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import { useCowLimitOrder, type ChunkInstructions } from "~~/hooks/useCowLimitOrder";
import { useCowQuote, getCowQuoteSellAmount } from "~~/hooks/useCowQuote";
import { 
    FlashLoanProvider,
    ProtocolInstruction,
    createRouterInstruction,
    createProtocolInstruction,
    encodeApprove,
    encodePullToken,
    encodeAdd,
    encodeLendingInstruction,
    LendingOp,
    normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import { 
    CompletionType, 
    getPreferredFlashLoanLender, 
    calculateFlashLoanFee, 
    getCowExplorerAddressUrl,
} from "~~/utils/cow";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";
import {
    ExecutionTypeToggle,
    type ExecutionType,
    MarketSwapStats,
    LimitOrderSection,
} from "./common";
import { WarningDisplay } from "~~/components/common/ErrorDisplay";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { saveOrderNote, createDebtSwapNote } from "~~/utils/orderNotes";

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
}) => {
    const { 
        buildDebtSwapFlow,
        setBatchId,
        setSuppressBatchNotifications,
        isBatchConfirmed,
    } = useKapanRouterV2();

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
        if (swapRouter === "1inch" && !oneInchAvailable) {
            setSwapRouter(pendleAvailable ? "pendle" : "1inch");
        } else if (swapRouter === "pendle" && !pendleAvailable) {
            setSwapRouter(oneInchAvailable ? "1inch" : "pendle");
        }
    }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            const modalOpenProps = {
                network: "evm",
                protocol: protocolName,
                chainId,
                market: context ?? null,
                debtFromToken,
                debtFromName,
                availableAssets: availableAssets?.length ?? null,
            } satisfies Record<string, string | number | boolean | null>;

            track("debt_swap_modal_open", modalOpenProps);
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
    const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
    const [useBatchedTx] = useState<boolean>(false);
    const [lastOrderSalt, setLastOrderSalt] = useState<string | null>(null);
    const [limitOrderNotificationId, setLimitOrderNotificationId] = useState<string | number | null>(null);
    const cowAvailable = isCowProtocolSupported(chainId);

    // Wallet hooks for limit order
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { sendCallsAsync } = useSendCalls();

    // CoW limit order hook
    const { 
        buildOrderCalls: buildLimitOrderCalls, 
        isReady: limitOrderReady, 
        orderManagerAddress 
    } = useCowLimitOrder();

    // Callback for LimitOrderConfig
    const handleLimitOrderConfigChange = useCallback((config: LimitOrderResult) => {
        setLimitOrderConfig(config);
    }, []);

    // Memoize sellToken for LimitOrderConfig
    // For debt swap, we flash loan the NEW DEBT (sellToken)
    const limitOrderSellToken = useMemo(() => selectedTo ? ({
        symbol: selectedTo.symbol,
        decimals: selectedTo.decimals,
        address: selectedTo.address,
    }) : null, [selectedTo]);

    // Ensure "From" is always the debt token
    useEffect(() => {
        if (!selectedFrom || selectedFrom.address !== debtFromToken) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtFromToken, fromAsset]);

    // Filter "To" assets (exclude current debt)
    const toAssets = useMemo(() =>
        (availableAssets || []).filter(a => a.address.toLowerCase() !== debtFromToken.toLowerCase()),
        [availableAssets, debtFromToken]
    );

    // Auto-switch to Pendle when a PT token is involved in the swap
    useEffect(() => {
        const fromIsPT = isPendleToken(debtFromName);
        const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);
        if ((fromIsPT || toIsPT) && pendleAvailable) {
            setSwapRouter("pendle");
        }
    }, [debtFromName, selectedTo, pendleAvailable]);

    // Handle batch confirmation for limit orders
    useEffect(() => {
        if (isBatchConfirmed && executionType === "limit" && orderManagerAddress && lastOrderSalt) {
            if (limitOrderNotificationId) {
                notification.remove(limitOrderNotificationId);
            }
            
            const explorerUrl = getCowExplorerAddressUrl(chainId, orderManagerAddress);
            notification.success(
                <TransactionToast
                    step="confirmed"
                    message="Limit order created!"
                    blockExplorerLink={explorerUrl}
                />
            );
            
            setLastOrderSalt(null);
            setLimitOrderNotificationId(null);
            onClose();
        }
    }, [isBatchConfirmed, executionType, orderManagerAddress, chainId, lastOrderSalt, limitOrderNotificationId, onClose]);

    // Amount to repay in raw
    const repayAmountRaw = useMemo(() => {
        const result = parseAmount(amountIn || "0", debtFromDecimals);
        return result.value ?? 0n;
    }, [amountIn, debtFromDecimals]);

    // Step 1: Get unit quote (1 newDebt -> X currentDebt) to estimate exchange rate
    // Use 1inch on supported chains, Pendle otherwise
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
    // We want to borrow just enough newDebt to swap and get repayAmountRaw of currentDebt
    // The slippage % from UI is used as buffer for price movement between quote and execution
    const { requiredNewDebt, requiredNewDebtFormatted, exchangeRate } = useMemo(() => {
        if (!selectedTo || repayAmountRaw === 0n) {
            return { requiredNewDebt: 0n, requiredNewDebtFormatted: "0", exchangeRate: "0" };
        }

        // Get unit output from whichever quote is available
        let unitOut = 0n;
        if (oneInchUnitQuote) {
            unitOut = BigInt(oneInchUnitQuote.dstAmount);
        } else if (pendleUnitQuote) {
            const outAmount = pendleUnitQuote.data.amountPtOut || pendleUnitQuote.data.amountTokenOut || "0";
            unitOut = BigInt(outAmount);
        }

        if (unitOut === 0n) {
            return { requiredNewDebt: 0n, requiredNewDebtFormatted: "0", exchangeRate: "0" };
        }
        
        // Exchange rate: how much currentDebt per 1 newDebt
        const rate = formatUnits(unitOut, debtFromDecimals);
        
        // requiredNewDebt = repayAmountRaw / rate
        // = repayAmountRaw * 1_newDebt / unitOut
        const unitIn = parseUnits("1", selectedTo.decimals);
        const base = (repayAmountRaw * unitIn) / unitOut;
        
        // Apply slippage buffer from UI (e.g., 1% slippage -> multiply by 1.01)
        // This accounts for price movement between quote fetch and tx execution
        const slippageBps = BigInt(Math.round(slippage * 100)); // 1% -> 100 bps
        const required = (base * (10000n + slippageBps)) / 10000n;
        
        return {
            requiredNewDebt: required,
            requiredNewDebtFormatted: formatUnits(required, selectedTo.decimals),
            exchangeRate: rate,
        };
    }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, repayAmountRaw, debtFromDecimals, slippage]);

    // Flash Loan selection - check liquidity for the NEW debt token we're flash loaning
    // We flash loan `requiredNewDebt` of the new debt token, swap it to current debt, repay, then borrow to cover flash
    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
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
    // For debt swap: KIND_BUY order (exact old debt to receive, max new debt to sell)
    // Quote asks: "To buy exactly X oldDebt, how much newDebt do I need to sell?"
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedTo?.address || "",        // newDebt to sell
        buyToken: debtFromToken,                      // oldDebt to receive (exact)
        buyAmount: repayAmountRaw.toString(),        // Exact old debt amount we need
        kind: "buy",                                  // KIND_BUY: exact buy, max sell
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && repayAmountRaw > 0n && !!selectedTo && !!userAddress && isOpen,
    });

    // ============ Limit Order: New Debt Amount from CoW Quote ============
    const limitOrderNewDebt = useMemo(() => {
        if (!cowQuote || !selectedTo) return 0n;
        
        const baseSellAmount = getCowQuoteSellAmount(cowQuote);
        if (baseSellAmount === 0n) return 0n;
        
        // Apply slippage buffer
        const slippageBps = BigInt(Math.round(slippage * 100));
        const withSlippage = (baseSellAmount * (10000n + slippageBps)) / 10000n;
        
        return withSlippage;
    }, [cowQuote, selectedTo, slippage]);

    // ============ Limit Order: Flash Loan Info ============
    // For debt swap, we flash loan NEW DEBT (sellToken)
    const cowFlashLoanInfo = useMemo(() => {
        if (!limitOrderConfig?.selectedProvider || executionType !== "limit" || !selectedTo || limitOrderNewDebt === 0n) {
            return null;
        }
        const lenderInfo = getPreferredFlashLoanLender(chainId, limitOrderConfig.selectedProvider.provider);
        if (!lenderInfo) return null;
        
        const fee = calculateFlashLoanFee(limitOrderNewDebt, lenderInfo.provider);
        return {
            lender: lenderInfo.address,
            provider: lenderInfo.provider,
            fee,
            amount: limitOrderNewDebt,
            token: selectedTo.address,
        };
    }, [chainId, limitOrderConfig, executionType, limitOrderNewDebt, selectedTo]);

    // ============ Limit Order: Build Chunk Instructions ============
    /**
     * Debt Swap - CoW Limit Order Flow
     * 
     * Order: SELL newDebt -> BUY oldDebt (KIND_BUY: exact oldDebt amount)
     * Flash Loan: newDebt token (sellToken)
     * 
     * PRE-HOOK:
     * - fundOrder moves flash-loaned newDebt to OrderManager
     * - No pre-instructions needed
     * 
     * SWAP: VaultRelayer pulls newDebt from OrderManager, Settlement sends oldDebt to OrderManager
     * 
     * POST-HOOK for KIND_BUY orders:
     * - UTXO[0] = actual sell amount (newDebt sold) - prepended by OM
     * - UTXO[1] = leftover amount (newDebt not sold) - prepended by OM
     * - [0] PullToken: pull oldDebt from OM (exact buyAmount) -> UTXO[2]
     * - [1] Approve oldDebt for protocol -> UTXO[3]
     * - [2] Repay oldDebt using UTXO[2] -> UTXO[4]
     * - [3] Borrow newDebt equal to actual sell (UTXO[0]) -> UTXO[5]
     * - [4] Add: UTXO[5] + UTXO[1] -> UTXO[6] (flash loan repay)
     * - [implicit] PushToken(UTXO[6], adapter)
     */
    const buildCowInstructions = useMemo((): ChunkInstructions[] => {
        if (!selectedTo || !userAddress || repayAmountRaw === 0n || !orderManagerAddress || !cowFlashLoanInfo) {
            return [{ preInstructions: [], postInstructions: [] }];
        }

        const normalizedProtocol = normalizeProtocolName(protocolName);
        const numChunks = limitOrderConfig?.numChunks ?? 1;
        
        // Calculate per-chunk amounts
        const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
        const chunkFlashLoanAmount = cowFlashLoanInfo.amount / BigInt(numChunks);
        
        // PRE-HOOK: Empty - fundOrder handles transfer
        const preInstructions: ProtocolInstruction[] = [];

        const postInstructions: ProtocolInstruction[] = [
            // [0] PullToken: pull oldDebt from OM (per-chunk buyAmount) -> UTXO[2]
            createRouterInstruction(encodePullToken(chunkBuyAmount, debtFromToken, orderManagerAddress)),
            
            // [1] Approve oldDebt for lending protocol (using UTXO[2]) -> UTXO[3]
            createRouterInstruction(encodeApprove(2, normalizedProtocol)),
            
            // [2] Repay user's oldDebt using UTXO[2] -> UTXO[4]
            createProtocolInstruction(
                normalizedProtocol,
                encodeLendingInstruction(LendingOp.Repay, debtFromToken, userAddress, chunkBuyAmount, context || "0x", 2)
            ),
            
            // [3] Borrow newDebt equal to actual sell amount (UTXO[0]) -> UTXO[5]
            createProtocolInstruction(
                normalizedProtocol,
                encodeLendingInstruction(
                    LendingOp.Borrow, 
                    selectedTo.address,
                    userAddress,
                    chunkFlashLoanAmount,  // Per-chunk max borrow for auth calculation
                    context || "0x", 
                    0  // Use UTXO[0] = actual sell amount
                )
            ),
            
            // [4] Add: borrowed (UTXO[5]) + leftover (UTXO[1]) -> UTXO[6]
            createRouterInstruction(encodeAdd(5, 1)),
            
            // Flash loan repay is implicit via flashLoanRepaymentUtxoIndex
        ];

        console.log("[buildCowInstructions] Debt Swap (KIND_BUY):", {
            sellToken: selectedTo.symbol,
            buyToken: debtFromName,
            totalOldDebtToBuy: formatUnits(repayAmountRaw, debtFromDecimals),
            chunkOldDebtToBuy: formatUnits(chunkBuyAmount, debtFromDecimals),
            flashLoanToken: selectedTo.symbol,
            totalFlashLoanAmount: formatUnits(cowFlashLoanInfo.amount, selectedTo.decimals),
            chunkFlashLoanAmount: formatUnits(chunkFlashLoanAmount, selectedTo.decimals),
            numChunks,
            utxoLayout: "UTXO[0]=actualSell, UTXO[1]=leftover, UTXO[5]=borrowed, UTXO[6]=borrowed+leftover",
        });

        // Return N identical chunks - each processes per-chunk amounts
        return Array(numChunks).fill(null).map(() => ({
            preInstructions,
            postInstructions,
            flashLoanRepaymentUtxoIndex: 6,
        }));
    }, [selectedTo, userAddress, repayAmountRaw, orderManagerAddress, protocolName, context, debtFromToken, debtFromName, debtFromDecimals, cowFlashLoanInfo, limitOrderNewDebt, limitOrderConfig?.numChunks]);

    // amountOut = required new debt (what user will borrow)
    const amountOut = executionType === "limit" 
        ? (limitOrderNewDebt > 0n && selectedTo ? formatUnits(limitOrderNewDebt, selectedTo.decimals) : "0")
        : requiredNewDebtFormatted;

    const buildFlow = () => {
        if (!swapQuote || !selectedTo || !hasAdapter || requiredNewDebt === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

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
            swapRouter === "1inch" ? "oneinch" : "pendle",  // map "1inch" -> "oneinch"
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
        if (!selectedTo || !userAddress || !orderManagerAddress || !walletClient || !publicClient) {
            throw new Error("Missing required data for limit order");
        }
        if (!limitOrderConfig?.selectedProvider || !cowFlashLoanInfo) {
            throw new Error("No flash loan provider selected");
        }

        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            executionType: "limit",
            oldDebtToken: debtFromToken,
            oldDebtName: debtFromName,
            newDebtToken: selectedTo.address,
            newDebtName: selectedTo.symbol,
            repayAmount: formatUnits(repayAmountRaw, debtFromDecimals),
            newDebtAmount: formatUnits(limitOrderNewDebt, selectedTo.decimals),
            flashLoanProvider: limitOrderConfig.selectedProvider.name,
        } satisfies Record<string, string | number | boolean | null>;

        setIsLimitSubmitting(true);
        let notificationId: string | number | undefined;

        try {
            track("debt_swap_limit_order_begin", txBeginProps);

            console.log("[Limit Order] Building debt swap order (KIND_BUY):", {
                sellToken: selectedTo.symbol,
                buyToken: debtFromName,
                maxSellAmount: formatUnits(limitOrderNewDebt, selectedTo.decimals),
                exactBuyAmount: formatUnits(repayAmountRaw, debtFromDecimals),
                flashLoanToken: selectedTo.symbol,
                flashLoanAmount: formatUnits(cowFlashLoanInfo.amount, selectedTo.decimals),
                flashLoanLender: cowFlashLoanInfo.lender,
                cowQuoteSellAmount: cowQuote ? formatUnits(getCowQuoteSellAmount(cowQuote), selectedTo.decimals) : "N/A",
            });

            // Build limit order calls
            const numChunks = limitOrderConfig?.numChunks ?? 1;
            const chunkSellAmount = limitOrderNewDebt / BigInt(numChunks);
            const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
            const chunkFlashLoanAmount = cowFlashLoanInfo.amount / BigInt(numChunks);

            const limitOrderResult = await buildLimitOrderCalls({
                sellToken: selectedTo.address as Address,    // newDebt to sell
                buyToken: debtFromToken,                      // oldDebt to receive
                chunkSize: chunkSellAmount,                   // Per-chunk newDebt to sell
                minBuyPerChunk: chunkBuyAmount,               // Per-chunk oldDebt amount needed
                totalAmount: limitOrderNewDebt,               // Total across all chunks
                chunks: buildCowInstructions,
                completion: CompletionType.Iterations,
                targetValue: numChunks,
                minHealthFactor: "1.0",
                seedAmount: 0n,
                flashLoan: {
                    lender: cowFlashLoanInfo.lender as Address,
                    token: selectedTo.address as Address,
                    amount: chunkFlashLoanAmount,
                },
                preOrderInstructions: [],
                isKindBuy: true,
            });

            if (!limitOrderResult) {
                throw new Error("Failed to build limit order calls");
            }

            if (!limitOrderResult.success) {
                const errorMsg = limitOrderResult.error || "Unknown error building order";
                const fullError = limitOrderResult.errorDetails?.apiResponse
                    ? `${errorMsg}\n\nAPI Response: ${limitOrderResult.errorDetails.apiResponse}`
                    : errorMsg;
                console.error("[Limit Order] Build failed:", fullError, limitOrderResult.errorDetails);
                notification.error(
                    <TransactionToast
                        step="failed"
                        message={`CoW API Error: ${errorMsg}`}
                    />
                );
                throw new Error(errorMsg);
            }

            console.log("[Limit Order] Order calls built:", limitOrderResult.calls.length);

            // Save order note for display on orders page
            if (limitOrderResult.salt) {
                saveOrderNote(createDebtSwapNote(
                    limitOrderResult.salt,
                    protocolName,
                    debtFromName,      // old debt being repaid
                    selectedTo.symbol, // new debt being taken on
                    chainId
                ));
            }

            const allCalls = limitOrderResult.calls;
            notificationId = notification.loading(
                <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
            );

            if (useBatchedTx && sendCallsAsync) {
                console.log("[Limit Order] Using batched TX mode (EIP-5792)");
                try {
                    const { id: newBatchId } = await sendCallsAsync({
                        calls: allCalls,
                        experimental_fallback: true,
                    });

                    setSuppressBatchNotifications(true);
                    setBatchId(newBatchId);
                    setLastOrderSalt(limitOrderResult.salt);
                    setLimitOrderNotificationId(notificationId);

                    notification.remove(notificationId);
                    notification.loading(
                        <TransactionToast
                            step="pending"
                            message="Waiting for batch confirmation..."
                        />
                    );

                    track("debt_swap_limit_order_complete", { ...txBeginProps, status: "batched", batchId: newBatchId });
                } catch (batchError) {
                    console.log("[Limit Order] Batch TX failed, falling back to sequential:", batchError);
                    throw batchError;
                }
            } else {
                // Sequential execution
                console.log("[Limit Order] Using sequential TX mode");
                for (let i = 0; i < allCalls.length; i++) {
                    const call = allCalls[i];
                    notification.remove(notificationId);
                    notificationId = notification.loading(
                        <TransactionToast step="pending" message={`Executing step ${i + 1}/${allCalls.length}...`} />
                    );

                    const hash = await walletClient.sendTransaction({
                        to: call.to,
                        data: call.data,
                        chain: walletClient.chain,
                        account: walletClient.account!,
                    });

                    await publicClient.waitForTransactionReceipt({ hash });
                }

                notification.remove(notificationId);
                const explorerUrl = getCowExplorerAddressUrl(chainId, orderManagerAddress);
                notification.success(
                    <TransactionToast
                        step="confirmed"
                        message="Limit order created!"
                        blockExplorerLink={explorerUrl}
                    />
                );

                track("debt_swap_limit_order_complete", { ...txBeginProps, status: "success" });
                onClose();
            }
        } catch (e) {
            if (notificationId) {
                notification.remove(notificationId);
            }
            notification.error(
                <TransactionToast
                    step="failed"
                    message={e instanceof Error ? e.message : "Transaction failed"}
                />
            );
            track("debt_swap_limit_order_complete", {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsLimitSubmitting(false);
        }
    }, [selectedTo, userAddress, orderManagerAddress, walletClient, publicClient, limitOrderConfig, cowFlashLoanInfo, protocolName, chainId, debtFromToken, debtFromName, repayAmountRaw, debtFromDecimals, limitOrderNewDebt, cowQuote, buildCowInstructions, buildLimitOrderCalls, useBatchedTx, sendCallsAsync, setSuppressBatchNotifications, setBatchId, onClose]);

    const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && requiredNewDebt > 0n && hasAdapter;
    const canSubmitLimit = executionType === "limit" && limitOrderReady && !!cowFlashLoanInfo && 
        parseFloat(amountIn) > 0 && !!orderManagerAddress && limitOrderNewDebt > 0n;
    const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

    // USD values from 1inch (if available)
    const srcUSD = swapQuote?.srcUSD ? parseFloat(swapQuote.srcUSD) : null;
    const dstUSD = swapQuote?.dstUSD ? parseFloat(swapQuote.dstUSD) : null;
    
    // Auto-slippage and price impact calculation
    const { priceImpact, priceImpactColorClass, formattedPriceImpact } = useAutoSlippage({
        slippage,
        setSlippage,
        oneInchQuote: oneInchSwapQuote,
        pendleQuote: pendleQuoteData,
        swapRouter,
        resetDep: selectedTo?.address,
    });

    // Memoized extraContent for LimitOrderSection
    const limitOrderExtraContent = useMemo(() => {
        if (!cowQuote || !selectedTo) return null;
        return (
            <div className="text-base-content/60 border-base-300 border-t pt-1 text-xs">
                CoW quote: sell ~{formatUnits(getCowQuoteSellAmount(cowQuote), selectedTo.decimals)} {selectedTo.symbol}
                {limitOrderNewDebt > getCowQuoteSellAmount(cowQuote) && (
                    <span className="text-warning ml-1">
                        (+{slippage}% buffer)
                    </span>
                )}
            </div>
        );
    }, [cowQuote, selectedTo, limitOrderNewDebt, slippage]);

    // Custom stats for debt swap - using shared components
    const customStatsWithToggle = useMemo(() => (
        <div className="space-y-2">
            {/* Execution Type Toggle */}
            <ExecutionTypeToggle
                value={executionType}
                onChange={setExecutionType}
                limitAvailable={cowAvailable}
                limitReady={limitOrderReady}
            />

            {/* Market order stats */}
            {executionType === "market" && (
                <>
                    <MarketSwapStats
                        slippage={slippage}
                        setSlippage={setSlippage}
                        priceImpact={priceImpact}
                        priceImpactClass={priceImpactColorClass}
                        formattedPriceImpact={formattedPriceImpact}
                        exchangeRate={parseFloat(exchangeRate).toFixed(4)}
                        fromSymbol={selectedTo?.symbol}
                        toSymbol={debtFromName}
                        expectedOutput={swapQuote ? parseFloat(expectedOutput).toFixed(4) : undefined}
                        outputCoversRequired={outputCoversRepay}
                    />
                    {/* Show USD values if available */}
                    {srcUSD !== null && dstUSD !== null && (
                        <div className="text-base-content/60 flex justify-between px-1 text-xs">
                            <span>New debt: ~${srcUSD.toFixed(2)}</span>
                            <span>Repaying: ~${dstUSD.toFixed(2)}</span>
                        </div>
                    )}
                </>
            )}

            {/* Limit order stats */}
            {executionType === "limit" && selectedTo && limitOrderSellToken && (
                <LimitOrderSection
                    chainId={chainId}
                    sellToken={limitOrderSellToken}
                    totalAmount={limitOrderNewDebt || requiredNewDebt}
                    onConfigChange={handleLimitOrderConfigChange}
                    limitOrderConfig={limitOrderConfig}
                    isCowQuoteLoading={isCowQuoteLoading}
                    slippage={slippage}
                    setSlippage={setSlippage}
                    showSlippage={true}
                    extraContent={limitOrderExtraContent}
                />
            )}
        </div>
    ), [executionType, setExecutionType, cowAvailable, limitOrderReady, slippage, setSlippage, priceImpact, priceImpactColorClass, formattedPriceImpact, exchangeRate, selectedTo, debtFromName, swapQuote, expectedOutput, outputCoversRepay, srcUSD, dstUSD, chainId, limitOrderSellToken, limitOrderNewDebt, requiredNewDebt, handleLimitOrderConfigChange, limitOrderConfig, isCowQuoteLoading, limitOrderExtraContent]);

    // Info content
    const infoContent = executionType === "market" ? (
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
                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">1</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Flash Loan</h4>
                        <p className="text-base-content/70 text-xs">We borrow the new debt asset via a Flash Loan.</p>
                        <div className="bg-base-200 mt-1 inline-block rounded p-1 text-xs">
                            Provider: {selectedProvider?.name || "Auto"}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">2</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Swap</h4>
                        <p className="text-base-content/70 text-xs">We swap the new debt token for your current debt token using {swapRouter === "1inch" ? "1inch" : "Pendle"}.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">3</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Repay Current Debt</h4>
                        <p className="text-base-content/70 text-xs">Your current debt is repaid with the swapped tokens.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">4</div>
                    </div>
                    <div>
                        <h4 className="text-sm font-medium">Borrow New Debt</h4>
                        <p className="text-base-content/70 text-xs">New debt is borrowed to repay the Flash Loan.</p>
                    </div>
                </div>
            </div>
        </div>
    ) : (
        // Limit order info
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
                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">1</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Create Order</h4>
                        <p className="text-base-content/70 text-xs">Your limit order is created and submitted to CoW Protocol.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">2</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Solver Competition</h4>
                        <p className="text-base-content/70 text-xs">Solvers compete to fill your order at the best price.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">3</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Flash Loan + Swap</h4>
                        <p className="text-base-content/70 text-xs">Solver takes flash loan, swaps new debt for old debt.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">4</div>
                    </div>
                    <div>
                        <h4 className="text-sm font-medium">Repay + Borrow</h4>
                        <p className="text-base-content/70 text-xs">Old debt repaid, new debt borrowed to cover flash loan. All atomic!</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // Warnings
    const warnings = (
        <>
            {executionType === "market" && swapQuote && !outputCoversRepay && (
                <WarningDisplay
                    message={`Swap output (${expectedOutput} ${debtFromName}) may not fully cover repay amount. Consider increasing slippage or reducing amount.`}
                    size="sm"
                />
            )}
            {executionType === "market" && swapRouter === "1inch" && swapQuote && oneInchAdapter && "from" in swapQuote.tx && swapQuote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                <WarningDisplay
                    message="Warning: Quote 'from' address mismatch!"
                    size="sm"
                    breakAll
                />
            )}
            {executionType === "market" && !hasAdapter && isOpen && (
                <WarningDisplay
                    message={`${swapRouter === "1inch" ? "1inch" : "Pendle"} Adapter not found on this network. Swaps unavailable.`}
                    size="sm"
                />
            )}
            {executionType === "limit" && isCowQuoteLoading && (
                <div className="alert alert-info py-2 text-xs">
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Fetching CoW quote...</span>
                </div>
            )}
        </>
    );

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
            isQuoteLoading={executionType === "market" ? isQuoteLoading : isCowQuoteLoading}
            quoteError={executionType === "market" ? quoteError : null}
            slippage={slippage}
            setSlippage={setSlippage}
            flashLoanProviders={executionType === "market" ? flashLoanProviders : undefined}
            selectedProvider={executionType === "market" ? selectedProvider : undefined}
            setSelectedProvider={executionType === "market" ? setSelectedProvider : undefined}
            flashLoanLiquidityData={executionType === "market" ? liquidityData : undefined}
            swapRouter={executionType === "market" ? swapRouter : undefined}
            setSwapRouter={executionType === "market" && oneInchAvailable && pendleAvailable ? setSwapRouter : undefined}
            preferBatching={executionType === "market" ? preferBatching : undefined}
            setPreferBatching={executionType === "market" ? setPreferBatching : undefined}
            onSubmit={executionType === "market" ? handleSwapWrapper : handleLimitOrderSubmit}
            isSubmitting={executionType === "market" ? isSubmitting : isLimitSubmitting}
            canSubmit={canSubmit}
            submitLabel={executionType === "market" ? "Swap Debt" : "Create Limit Order"}
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Repay Debt"
            toLabel="New Debt"
            fromReadOnly={true}
            customStats={customStatsWithToggle}
        />
    );
};
