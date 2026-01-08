import { FC, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address, type Hex, encodeFunctionData } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage, SLIPPAGE_OPTIONS } from "~~/hooks/useAutoSlippage";
import { useCowLimitOrder, type ChunkInstructions } from "~~/hooks/useCowLimitOrder";
import { useCowQuote, getCowQuoteBuyAmount, getCowQuoteSellAmount } from "~~/hooks/useCowQuote";
import { 
    FlashLoanProvider,
    ProtocolInstruction,
    createRouterInstruction,
    createProtocolInstruction,
    encodeApprove,
    encodePullToken,
    encodePushToken,
    encodeToOutput,
    encodeSubtract,
    encodeAdd,
    encodeLendingInstruction,
    LendingOp,
    normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import { CompletionType, getPreferredFlashLoanLender, calculateFlashLoanFee, getCowExplorerAddressUrl, getKapanCowAdapter } from "~~/utils/cow";
import { is1inchSupported, isPendleSupported, getBestSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { ExclamationTriangleIcon, InformationCircleIcon, Cog6ToothIcon, ClockIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import { LimitOrderConfig, type LimitOrderResult } from "~~/components/LimitOrderConfig";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { useSendCalls } from "wagmi/experimental";
import { saveOrderNote, createClosePositionNote } from "~~/utils/orderNotes";

// Aave flash loan fee: 5 bps (0.05%)
// We add a small buffer (10 bps total) to ensure swap covers repayment
const AAVE_FLASH_LOAN_FEE_BPS = 10n;

interface CloseWithCollateralEvmModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    chainId: number;
    // Debt token info (preselected "From" - what we're repaying, user inputs amount)
    debtToken: Address;
    debtName: string;
    debtIcon: string;
    debtDecimals: number;
    debtPrice?: bigint; // Price in 8 decimals (e.g., from Chainlink)
    debtBalance: bigint;
    // Available collateral assets for "To" selection (collateral to sell)
    availableCollaterals: SwapAsset[];
    /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
    context?: string;
}

export const CloseWithCollateralEvmModal: FC<CloseWithCollateralEvmModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtToken,
    debtName,
    debtIcon,
    debtPrice,
    debtDecimals,
    debtBalance,
    availableCollaterals,
    context,
}) => {
    const { 
        buildCloseWithCollateralFlow,
        setBatchId,
        setSuppressBatchNotifications,
        isBatchConfirmed,
    } = useKapanRouterV2();

    // Check swap router availability and get adapter info directly from deployed contracts
    const oneInchAvailable = is1inchSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const oneInchAdapter = getOneInchAdapterInfo(chainId);
    const pendleAdapter = getPendleAdapterInfo(chainId);

    // Swap router selection - default based on chain and token availability
    const [swapRouter, setSwapRouter] = useState<SwapRouter>("1inch");

    // Update swap router based on chain and token availability
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
                debtToken: debtToken,
                debtName,
                chainId,
                market: context ?? null,
                availableCollaterals: availableCollaterals?.length ?? null,
            } satisfies Record<string, string | number | boolean | null>;

            track("close_with_collateral_modal_open", modalOpenProps);
        }

        wasOpenRef.current = isOpen;
    }, [availableCollaterals?.length, chainId, debtName, debtToken, isOpen, context, protocolName]);

    // Flash Loan Providers
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: { name: debtName, tokenAddress: debtToken, decimals: debtDecimals, type: "borrow" },
    });

    // "From" is fixed (debt to repay) - user inputs how much debt to repay
    const fromAsset: SwapAsset = useMemo(() => ({
        symbol: debtName,
        address: debtToken,
        decimals: debtDecimals,
        rawBalance: debtBalance,
        balance: parseFloat(formatUnits(debtBalance, debtDecimals)),
        icon: debtIcon,
        price: debtPrice,
    }), [debtName, debtToken, debtDecimals, debtBalance, debtIcon, debtPrice]);

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null); // Collateral to sell
    const [slippage, setSlippage] = useState<number>(0.1); // Managed by useAutoSlippage after quotes
    const [amountIn, setAmountIn] = useState(""); // Amount of debt to repay
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ============ Limit Order State ============
    type ExecutionType = "market" | "limit";
    const [executionType, setExecutionType] = useState<ExecutionType>("market");
    const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
    const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
    // Batched TX mode: when ON, uses EIP-5792 sendCalls (may not work with all wallets like MetaMask)
    // When OFF, executes each call sequentially (more compatible but slower)
    const [useBatchedTx, setUseBatchedTx] = useState<boolean>(false);
    // Track last order salt for CoW Explorer link after batch confirmation
    const [lastOrderSalt, setLastOrderSalt] = useState<string | null>(null);
    // Track notification ID to update it when batch confirms
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
        buildRouterCall, 
        isReady: limitOrderReady, 
        orderManagerAddress 
    } = useCowLimitOrder();
    
    // Callback for LimitOrderConfig
    const handleLimitOrderConfigChange = useCallback((config: LimitOrderResult) => {
        setLimitOrderConfig(config);
    }, []);

    // Memoize sellToken for LimitOrderConfig to prevent infinite re-renders
    // For close-with-collateral, we flash loan the COLLATERAL (sellToken), not debt
    const limitOrderSellToken = useMemo(() => selectedTo ? ({
        symbol: selectedTo.symbol,
        decimals: selectedTo.decimals,
        address: selectedTo.address,
    }) : null, [selectedTo]);

    // Ensure "From" is always the debt token
    useMemo(() => {
        if (!selectedFrom || selectedFrom.address !== debtToken) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtToken, fromAsset]);

    // Filter "To" assets (collaterals with balance, exclude debt token)
    const toAssets = useMemo(() =>
        (availableCollaterals || []).filter(a => a.rawBalance > 0n && a.address.toLowerCase() !== debtToken.toLowerCase()),
        [availableCollaterals, debtToken]
    );

    // Auto-switch to Pendle when a PT token is selected as collateral
    useEffect(() => {
        if (selectedTo && isPendleToken(selectedTo.symbol) && pendleAvailable) {
            setSwapRouter("pendle");
        }
    }, [selectedTo, pendleAvailable]);

    // Handle batch confirmation for limit orders
    useEffect(() => {
        if (isBatchConfirmed && executionType === "limit" && orderManagerAddress && lastOrderSalt) {
            // Show success notification with CoW Explorer link
            if (limitOrderNotificationId) {
                notification.remove(limitOrderNotificationId);
            }
            
            const explorerUrl = getCowExplorerAddressUrl(chainId, orderManagerAddress);
            notification.success(
                <TransactionToast
                    step="confirmed"
                    message="Limit order created! Position will close when order fills."
                    blockExplorerLink={explorerUrl}
                />
            );
            
            console.log("[Limit Order] Batch confirmed, salt:", lastOrderSalt);
            
            // Check if order appears in CoW orderbook
            setTimeout(async () => {
                try {
                    const { checkOrderInOrderbook } = await import("~~/utils/cow");
                    const appDataHash = lastOrderSalt; // We'd need to store appDataHash too
                    // For now just log that batch confirmed
                    console.log("[Limit Order] Batch confirmed - check CoW Explorer for order status");
                } catch (e) {
                    console.error("[Limit Order] Failed to check orderbook:", e);
                }
            }, 5000);
            
            // Reset state
            setLastOrderSalt(null);
            setLimitOrderNotificationId(null);
            setIsLimitSubmitting(false);
            
            // Close modal
            onClose();
        }
    }, [isBatchConfirmed, executionType, orderManagerAddress, chainId, lastOrderSalt, limitOrderNotificationId, onClose]);

    // Amount of debt to repay in raw
    const repayAmountRaw = useMemo(() => {
        try {
            return amountIn ? parseUnits(amountIn, debtDecimals) : 0n;
        } catch {
            return 0n;
        }
    }, [amountIn, debtDecimals]);

    // Flash Loan selection - we flash loan the DEBT token to repay, then withdraw collateral
    // and swap it to repay the flash loan
    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: debtToken,      // We flash loan the DEBT token
        amount: repayAmountRaw,       // Amount of debt to flash loan and repay
        chainId,
    });

    // Step 1: Get unit quote (1 collateral -> X debt) to estimate exchange rate
    // Use 1inch on supported chains, Pendle otherwise
    const unitQuoteAmount = useMemo(() => {
        if (!selectedTo) return "0";
        return parseUnits("1", selectedTo.decimals).toString();
    }, [selectedTo]);

    // 1inch unit quote (only fetch when 1inch router is selected)
    const { data: oneInchUnitQuote, isLoading: isOneInchUnitQuoteLoading } = use1inchQuoteOnly({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtToken,
        amount: unitQuoteAmount,
        enabled: oneInchAvailable && swapRouter === "1inch" && !!selectedTo && isOpen,
    });

    // Pendle unit quote (only fetch when Pendle router is selected)
    const { data: pendleUnitQuote, isLoading: isPendleUnitQuoteLoading } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedTo?.address as Address,
        tokensOut: debtToken,
        amountsIn: unitQuoteAmount,
        slippage: 0.03, // 3% for unit quote
        enabled: pendleAvailable && swapRouter === "pendle" && !!selectedTo && !!pendleAdapter && isOpen && unitQuoteAmount !== "0",
    });

    const isUnitQuoteLoading = swapRouter === "1inch" ? isOneInchUnitQuoteLoading : isPendleUnitQuoteLoading;

    // Calculate required collateral based on debt to repay
    // We want to sell just enough collateral to get repayAmountRaw of debt token
    // The slippage % from UI is used as buffer for price movement between quote and execution
    const { requiredCollateral, requiredCollateralFormatted, exchangeRate } = useMemo(() => {
        if (!selectedTo || repayAmountRaw === 0n) {
            return { requiredCollateral: 0n, requiredCollateralFormatted: "0", exchangeRate: "0" };
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
            return { requiredCollateral: 0n, requiredCollateralFormatted: "0", exchangeRate: "0" };
        }
        
        // Exchange rate: how much debt per 1 collateral
        const rate = formatUnits(unitOut, debtDecimals);
        
        // requiredCollateral = repayAmountRaw * 1_collateral / unitOut
        const unitIn = parseUnits("1", selectedTo.decimals);
        const base = (repayAmountRaw * unitIn) / unitOut;
        
        // Apply slippage buffer from UI (e.g., 3% slippage -> multiply by 1.03)
        // This accounts for price movement between quote fetch and tx execution
        const slippageBps = BigInt(Math.round(slippage * 100)); // 3% -> 300 bps
        const required = (base * (10000n + slippageBps)) / 10000n;
        
        return {
            requiredCollateral: required,
            requiredCollateralFormatted: formatUnits(required, selectedTo.decimals),
            exchangeRate: rate,
        };
    }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, repayAmountRaw, debtDecimals, slippage]);

    // Check if user has enough collateral
    const hasEnoughCollateral = selectedTo ? requiredCollateral <= selectedTo.rawBalance : false;

    // Step 2: Get actual swap quote with the required collateral amount (needs `from` for tx.data)
    const minSwapAmount = selectedTo ? parseUnits("0.0001", selectedTo.decimals) : 0n;
    const oneInchSwapEnabled = oneInchAvailable && swapRouter === "1inch" && requiredCollateral > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen;
    const pendleSwapEnabled = pendleAvailable && swapRouter === "pendle" && requiredCollateral > minSwapAmount && !!selectedTo && !!pendleAdapter && isOpen;

    // 1inch quote
    const { data: oneInchSwapQuote, isLoading: is1inchSwapQuoteLoading, error: oneInchQuoteError } = use1inchQuote({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtToken,
        amount: requiredCollateral.toString(),
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
        tokensOut: debtToken,
        amountsIn: requiredCollateral.toString(),
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

    // amountOut = required collateral (what user will sell)
    const amountOut = requiredCollateralFormatted;

    // ============ Limit Order: CoW Quote ============
    // For close-with-collateral: KIND_BUY order (exact debt to receive, max collateral to sell)
    // Quote asks: "To buy exactly X debt, how much collateral do I need to sell?"
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedTo?.address || "",       // Collateral to sell
        buyToken: debtToken,                         // Debt to receive
        buyAmount: repayAmountRaw.toString(),       // Exact debt amount we need
        kind: "buy",                                 // KIND_BUY: exact buy, max sell
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && repayAmountRaw > 0n && !!selectedTo && !!userAddress && isOpen,
    });

    // ============ Limit Order: Collateral from CoW Quote ============
    // For KIND_BUY orders, the CoW quote tells us how much collateral we need to sell.
    // We add slippage buffer to ensure the order can fill even with price movement.
    const limitOrderCollateral = useMemo(() => {
        if (!cowQuote || !selectedTo) return 0n;
        
        // Get the sellAmount from CoW quote (how much collateral needed for exact buyAmount)
        const baseSellAmount = getCowQuoteSellAmount(cowQuote);
        if (baseSellAmount === 0n) return 0n;
        
        // Apply slippage buffer (e.g., 3% -> multiply by 1.03)
        // For KIND_BUY, higher sellAmount = more willing to pay = better chance to fill
        const slippageBps = BigInt(Math.round(slippage * 100));
        const withSlippage = (baseSellAmount * (10000n + slippageBps)) / 10000n;
        
        return withSlippage;
    }, [cowQuote, selectedTo, slippage]);

    // Check if user has enough collateral for limit order (uses CoW quote-based calculation)
    const hasEnoughCollateralForLimit = selectedTo && limitOrderCollateral > 0n 
        ? limitOrderCollateral <= selectedTo.rawBalance 
        : hasEnoughCollateral;  // Fall back to market order check if quote not ready

    // ============ Limit Order: Flash Loan Info ============
    // For close-with-collateral, we flash loan COLLATERAL (sellToken)
    // This way CoW's balance check sees the sellToken balance override
    const cowFlashLoanInfo = useMemo(() => {
        if (!limitOrderConfig?.selectedProvider || executionType !== "limit" || !selectedTo || limitOrderCollateral === 0n) {
            return null;
        }
        const lenderInfo = getPreferredFlashLoanLender(chainId, limitOrderConfig.selectedProvider.provider);
        if (!lenderInfo) return null;
        
        const fee = calculateFlashLoanFee(limitOrderCollateral, lenderInfo.provider);
        return {
            lender: lenderInfo.address,
            provider: lenderInfo.provider,
            fee,
            amount: limitOrderCollateral,  // Flash loan the COLLATERAL (sellToken) - from CoW quote + slippage
            token: selectedTo.address,     // Collateral token address
        };
    }, [chainId, limitOrderConfig, executionType, limitOrderCollateral, selectedTo]);

    // ============ Limit Order: Build Chunk Instructions ============
    /**
     * Close with Collateral - CoW Limit Order Flow (NEW: Flash Loan Collateral)
     * 
     * Order: SELL collateral → BUY debt (KIND_BUY: exact debt amount)
     * Flash Loan: COLLATERAL token (sellToken) - CoW sees balance override for sellToken!
     * 
     * PRE-HOOK:
     * - fundOrder already moves flash-loaned collateral to OrderManager
     * - No pre-instructions needed! Collateral ready for VaultRelayer
     * 
     * SWAP: VaultRelayer pulls collateral from OrderManager, Settlement sends debt to OrderManager
     * 
     * POST-HOOK:
     * - UTXO[0] = swap output (debt from selling collateral) - auto-prepended
     * - [0] PullToken(debt from OrderManager) → UTXO[1]
     * - [1] Approve(1, protocol)
     * - [2] Repay debt using UTXO[1] - unlocks original collateral
     * - [3] Withdraw original collateral → UTXO[3]
     * - [4] ToOutput(flashLoanRepayAmount, collateral) → UTXO[4]
     * - [5] Subtract(3, 4) → UTXO[5] = surplus collateral
     * - [6] PushToken(5, user) → surplus to user
     * - [hook appends] PushToken(4, adapter) → repay flash loan (collateral)
     */
    const buildCowInstructions = useMemo((): ChunkInstructions[] => {
        if (!selectedTo || !userAddress || repayAmountRaw === 0n || !orderManagerAddress || !cowFlashLoanInfo) {
            return [{ preInstructions: [], postInstructions: [] }];
        }

        const normalizedProtocol = normalizeProtocolName(protocolName);
        const numChunks = limitOrderConfig?.numChunks ?? 1;
        
        // Calculate per-chunk amounts
        const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
        const chunkSellAmount = limitOrderCollateral / BigInt(numChunks);
        
        // PRE-HOOK: Empty! fundOrder already moves flash-loaned collateral to OrderManager
        const preInstructions: ProtocolInstruction[] = [];

        // POST-HOOK for KIND_BUY orders:
        // OrderManager prepends TWO UTXOs and transfers leftover to router:
        //   UTXO[0] = actual sell amount (Y) - what we paid
        //   UTXO[1] = leftover amount (X - Y) - tokens already at router
        // Instructions indices shift by 2!
        
        const postInstructions: ProtocolInstruction[] = [
            // UTXO[0] = actual sell (Y) - prepended by OrderManager
            // UTXO[1] = leftover (X - Y) - prepended by OrderManager, tokens at router
            
            // [0] PullToken: pull debt from OM (per-chunk buyAmount) → UTXO[2]
            createRouterInstruction(encodePullToken(chunkBuyAmount, debtToken, orderManagerAddress)),
            
            // [1] Approve debt for lending protocol (using UTXO[2]) → UTXO[3] (empty)
            createRouterInstruction(encodeApprove(2, normalizedProtocol)),
            
            // [2] Repay user's debt using UTXO[2] - unlocks original collateral → UTXO[4]
            createProtocolInstruction(
                normalizedProtocol,
                encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, chunkBuyAmount, context || "0x", 2)
            ),
            
            // [3] Withdraw collateral equal to actual sell amount (UTXO[0] = Y) → UTXO[5]
            createProtocolInstruction(
                normalizedProtocol,
                encodeLendingInstruction(
                    LendingOp.WithdrawCollateral, 
                    selectedTo.address, 
                    userAddress,
                    selectedTo.rawBalance,  // User's full collateral for auth calculation
                    context || "0x", 
                    0  // Use UTXO[0] = actual sell amount
                )
            ),
            
            // [4] Add: withdrawn (UTXO[5] = Y) + leftover (UTXO[1] = X-Y) → UTXO[6] = X (flash loan repay)
            createRouterInstruction(encodeAdd(5, 1)),
            
            // Flash loan repay is implicit via flashLoanRepaymentUtxoIndex
        ];

        console.log("[buildCowInstructions] Close with Collateral (KIND_BUY):", {
            sellToken: selectedTo.symbol,
            buyToken: debtName,
            totalDebtToBuy: formatUnits(repayAmountRaw, debtDecimals),
            chunkDebtToBuy: formatUnits(chunkBuyAmount, debtDecimals),
            flashLoanToken: selectedTo.symbol,
            flashLoanAmount: formatUnits(cowFlashLoanInfo.amount, selectedTo.decimals),
            numChunks,
            utxoLayout: "UTXO[0]=actualSell(Y), UTXO[1]=leftover(X-Y), UTXO[5]=withdrawn(Y), UTXO[6]=Y+(X-Y)=X",
            flow: "pullDebt → approve → repay → withdraw(Y) → add(Y, X-Y) → implicit:push(X→adapter)",
        });

        // Return N identical chunks - each processes per-chunk amounts
        return Array(numChunks).fill(null).map(() => ({
            preInstructions,
            postInstructions,
            flashLoanRepaymentUtxoIndex: 6, // UTXO[6] = X (flash loan amount to repay)
        }));
    }, [selectedTo, userAddress, repayAmountRaw, orderManagerAddress, protocolName, context, debtToken, debtName, debtDecimals, cowFlashLoanInfo, limitOrderCollateral, limitOrderConfig?.numChunks]);

    const buildFlow = () => {
        if (!swapQuote || !selectedTo || !hasAdapter || requiredCollateral === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        // For Aave flash loans, the swap needs to output enough to cover the flash loan repayment
        // (principal + 0.05% fee). We add a buffer to be safe.
        // For Balancer/others (no fee), we just use the exact debt amount.
        const isAave = providerEnum === FlashLoanProvider.Aave || providerEnum === FlashLoanProvider.ZeroLend;
        const swapMinAmountOut = isAave
            ? repayAmountRaw + (repayAmountRaw * AAVE_FLASH_LOAN_FEE_BPS / 10000n)
            : repayAmountRaw;

        // For close with collateral (with flash loan):
        // 1. Flash loan debt token (use GetBorrowBalance if isMax for exact amount)
        // 2. Repay debt (unlocks collateral) - uses Output[0], the actual debt
        // 3. Withdraw collateral
        // 4. Swap collateral to debt token - must output >= flash loan repayment
        // 5. Flash loan repays itself from swap output
        return buildCloseWithCollateralFlow(
            protocolName,
            selectedTo.address,      // collateral to sell
            debtToken,               // debt to repay
            requiredCollateral,      // max collateral to sell (with buffer)
            swapMinAmountOut,        // minAmountOut for swap (includes Aave fee if applicable)
            swapQuote.tx.data,       // swap data
            providerEnum,            // flash loan provider
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
        successMessage: "Position closed successfully!",
        emptyFlowErrorMessage: "Failed to build close instructions",
        simulateWhenBatching: true,
    });

    const handleSwapWrapper = async () => {
        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            debtToken: debtToken,
            debtName,
            collateralToken: selectedTo?.address ?? null,
            collateralName: selectedTo?.symbol ?? null,
            amountIn,
            isMax,
            slippage,
            preferBatching,
            flashLoanProvider: selectedProvider?.name ?? null,
            swapRouter,
            market: context ?? null,
        } satisfies Record<string, string | number | boolean | null>;

        try {
            setIsSubmitting(true);
            track("close_with_collateral_tx_begin", txBeginProps);
            await handleSwap(amountIn, isMax);
            track("close_with_collateral_tx_complete", { ...txBeginProps, status: "success" });
        } catch (e) {
            track("close_with_collateral_tx_complete", {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============ Limit Order: Submit Handler ============
    const handleLimitOrderSubmit = async () => {
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
            debtToken: debtToken,
            debtName,
            collateralToken: selectedTo.address,
            collateralName: selectedTo.symbol,
            repayAmount: formatUnits(repayAmountRaw, debtDecimals),
            collateralAmount: formatUnits(limitOrderCollateral || requiredCollateral, selectedTo.decimals),
            flashLoanProvider: limitOrderConfig.selectedProvider.name,
        } satisfies Record<string, string | number | boolean | null>;

        setIsLimitSubmitting(true);
        let notificationId: string | number | undefined;

        try {
            track("close_with_collateral_limit_order_begin", txBeginProps);

            // For KIND_BUY orders:
            // - buyAmount (minBuyPerChunk) = EXACT amount of debt we need = repayAmountRaw
            // - sellAmount (chunkSize) = MAX collateral we're willing to sell = limitOrderCollateral (from CoW quote + slippage)
            // Slippage is already applied to limitOrderCollateral, so we can fill even if price moves against us.
            
            console.log("[Limit Order] Building close-with-collateral order (KIND_BUY):", {
                sellToken: selectedTo.symbol,
                buyToken: debtName,
                maxSellAmount: formatUnits(limitOrderCollateral, selectedTo.decimals),
                exactBuyAmount: formatUnits(repayAmountRaw, debtDecimals),
                flashLoanToken: selectedTo.symbol,
                flashLoanAmount: formatUnits(cowFlashLoanInfo.amount, selectedTo.decimals),
                flashLoanLender: cowFlashLoanInfo.lender,
                cowQuoteSellAmount: cowQuote ? formatUnits(getCowQuoteSellAmount(cowQuote), selectedTo.decimals) : "N/A",
            });

            // Build limit order calls
            // Use KIND_BUY: exact buyAmount (debt needed), max sellAmount (collateral willing to spend)
            const numChunks = limitOrderConfig?.numChunks ?? 1;
            const chunkSellAmount = limitOrderCollateral / BigInt(numChunks);
            const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
            const chunkFlashLoanAmount = cowFlashLoanInfo.amount / BigInt(numChunks);

            const limitOrderResult = await buildLimitOrderCalls({
                sellToken: selectedTo.address as Address,   // Collateral to sell
                buyToken: debtToken,                         // Debt to receive
                chunkSize: chunkSellAmount,                  // Per-chunk collateral to sell
                minBuyPerChunk: chunkBuyAmount,              // Per-chunk debt amount needed
                totalAmount: limitOrderCollateral,           // Total across all chunks
                chunks: buildCowInstructions,
                completion: CompletionType.Iterations,
                targetValue: numChunks,
                minHealthFactor: "1.0",
                seedAmount: 0n,                              // No seed - flash loan provides funds
                flashLoan: {
                    lender: cowFlashLoanInfo.lender as Address,
                    token: selectedTo.address as Address,    // Flash loan COLLATERAL (sellToken!)
                    amount: chunkFlashLoanAmount,            // Per-chunk flash loan amount
                },
                preOrderInstructions: [],                    // Empty - fundOrder handles collateral transfer
                isKindBuy: true,                             // KIND_BUY: exact buyAmount, max sellAmount
            });

            if (!limitOrderResult) {
                throw new Error("Failed to build limit order calls");
            }

            // Check for AppData registration errors
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
                saveOrderNote(createClosePositionNote(
                    limitOrderResult.salt,
                    protocolName,
                    selectedTo.symbol, // collateral being sold
                    debtName,          // debt being repaid
                    chainId
                ));
            }

            const allCalls = limitOrderResult.calls;
            notificationId = notification.loading(
                <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
            );

            if (useBatchedTx && sendCallsAsync) {
                // EIP-5792 Batched execution (may not work with all wallets)
                console.log("[Limit Order] Using batched TX mode (EIP-5792)");
                try {
                    const { id: newBatchId } = await sendCallsAsync({
                        calls: allCalls,
                        experimental_fallback: true,
                    });

                    // Store salt for CoW Explorer link in confirmation toast
                    setLastOrderSalt(limitOrderResult.salt);
                    
                    // Suppress hook's generic notifications - we'll show custom ones
                    setSuppressBatchNotifications(true);
                    
                    // Set batch ID to trigger status tracking
                    setBatchId(newBatchId);

                    notification.remove(notificationId);
                    
                    // Show loading notification while waiting for confirmation
                    const loadingId = notification.loading(
                        <TransactionToast
                            step="sent"
                            message="Limit order submitted — waiting for confirmation..."
                        />
                    );
                    setLimitOrderNotificationId(loadingId);
                    
                    console.log("[Limit Order] Batch submitted:", newBatchId);
                    console.log("[Limit Order] Salt:", limitOrderResult.salt);
                    console.log("[Limit Order] AppData Hash:", limitOrderResult.appDataHash);
                    
                    track("close_with_collateral_limit_order_complete", { ...txBeginProps, status: "submitted", mode: "batched" });
                    // Don't close modal yet - useEffect will close when batch confirms
                } catch (batchError) {
                    notification.remove(notificationId);
                    throw batchError;
                }
            } else {
                // Sequential execution (more compatible with wallets like MetaMask)
                console.log("[Limit Order] Using sequential TX mode");
                
                for (let i = 0; i < allCalls.length; i++) {
                    const call = allCalls[i];
                    notification.remove(notificationId);
                    notificationId = notification.loading(
                        <TransactionToast step="pending" message={`Simulating step ${i + 1}/${allCalls.length}...`} />
                    );

                    // Simulate first to get better error messages
                    try {
                        await publicClient.call({
                            account: userAddress,
                            to: call.to as `0x${string}`,
                            data: call.data as `0x${string}`,
                        });
                        console.log(`[Limit Order] Step ${i + 1} simulation passed`);
                    } catch (simError: any) {
                        console.error(`[Limit Order] Step ${i + 1} simulation FAILED:`, simError);
                        const errorMsg = simError?.message || simError?.shortMessage || String(simError);
                        const revertMatch = errorMsg.match(/reverted with.*?['"]([^'"]+)['"]/i) 
                            || errorMsg.match(/reason:\s*([^\n]+)/i)
                            || errorMsg.match(/error:\s*([^\n]+)/i);
                        const revertReason = revertMatch ? revertMatch[1] : errorMsg;
                        notification.remove(notificationId);
                        notification.error(`Step ${i + 1} would fail: ${revertReason}`);
                        throw new Error(`Transaction simulation failed at step ${i + 1}: ${revertReason}`);
                    }

                    notification.remove(notificationId);
                    notificationId = notification.loading(
                        <TransactionToast step="pending" message={`Executing step ${i + 1}/${allCalls.length}...`} />
                    );

                    const hash = await walletClient.sendTransaction({
                        to: call.to as Address,
                        data: call.data as Hex,
                        account: userAddress,
                    });
                    await publicClient.waitForTransactionReceipt({ hash });
                    console.log(`[Limit Order] Step ${i + 1} complete:`, hash);
                }

                notification.remove(notificationId);
                
                // Log order details for debugging
                console.log("[Limit Order] Order created successfully");
                console.log("[Limit Order] Salt:", limitOrderResult.salt);
                console.log("[Limit Order] AppData Hash:", limitOrderResult.appDataHash);
                console.log("[Limit Order] OrderManager:", orderManagerAddress);
                
                // Check if order appears in CoW orderbook (give it a moment)
                setTimeout(async () => {
                    try {
                        const { checkOrderInOrderbook } = await import("~~/utils/cow");
                        const checkResult = await checkOrderInOrderbook(
                            chainId,
                            orderManagerAddress,
                            limitOrderResult.appDataHash
                        );
                        
                        if (checkResult.found) {
                            console.log("[Limit Order] Order found in CoW orderbook:", checkResult.order);
                        } else {
                            console.warn("[Limit Order] Order NOT found in CoW orderbook yet.", checkResult.error || "");
                            console.warn("[Limit Order] WatchTower may need time to pick up the order, or there may be an issue.");
                        }
                    } catch (e) {
                        console.error("[Limit Order] Failed to check orderbook:", e);
                    }
                }, 5000); // Check after 5 seconds
                
                const explorerUrl = getCowExplorerAddressUrl(chainId, userAddress);
                notification.success(
                    <TransactionToast 
                        step="confirmed" 
                        message="Limit order created! Position will close when order fills."
                        blockExplorerLink={explorerUrl}
                    />
                );

                track("close_with_collateral_limit_order_complete", { ...txBeginProps, status: "success", mode: "sequential" });
                onClose();
            }
        } catch (e) {
            if (notificationId) notification.remove(notificationId);
            notification.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
            track("close_with_collateral_limit_order_complete", {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsLimitSubmitting(false);
        }
    };

    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

    // Can submit based on execution type
    const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && hasEnoughCollateral && hasAdapter;
    const canSubmitLimit = executionType === "limit" && limitOrderReady && !!cowFlashLoanInfo && 
        parseFloat(amountIn) > 0 && hasEnoughCollateralForLimit && !!orderManagerAddress && limitOrderCollateral > 0n;
    const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

    // What the swap will actually produce
    const expectedOutput = swapQuote 
        ? formatUnits(BigInt(swapQuote.dstAmount), debtDecimals)
        : "0";
    
    // Is the expected output enough to cover the repay?
    const outputCoversRepay = swapQuote 
        ? BigInt(swapQuote.dstAmount) >= repayAmountRaw
        : false;

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

    // Custom stats for close with collateral
    const customStats = (
        <div className="space-y-2">
            {/* Execution Type Toggle */}
            {cowAvailable && (
                <div className="flex gap-2 mb-2">
                    <button
                        className={`btn btn-xs flex-1 ${executionType === "market" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setExecutionType("market")}
                    >
                        Market Order
                    </button>
                    <button
                        className={`btn btn-xs flex-1 ${executionType === "limit" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => {
                            setExecutionType("limit");
                            // Set higher default slippage for limit orders (1% minimum for better fill rates)
                            if (slippage < 1) setSlippage(1);
                        }}
                    >
                        <ClockIcon className="w-3 h-3 mr-1" />
                        Limit Order
                    </button>
                </div>
            )}

            {/* Limit Order Config */}
            {executionType === "limit" && selectedTo && limitOrderSellToken && (
                <div className="bg-base-200/30 rounded p-2 mb-2">
                    <LimitOrderConfig
                        chainId={chainId}
                        sellToken={limitOrderSellToken}
                        totalAmount={limitOrderCollateral || requiredCollateral}
                        onConfigChange={handleLimitOrderConfigChange}
                        showChunksInput={true}
                        showFlashLoanToggle={false}
                        compact={true}
                    />
                    {/* Chunk Info - shown when multi-chunk */}
                    {(limitOrderConfig?.numChunks ?? 1) > 1 && (
                        <div className="flex items-start gap-1.5 mt-2 text-[10px]">
                            <svg className="w-3 h-3 shrink-0 mt-0.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <div>
                                <span className="text-info font-medium">Multi-chunk: {limitOrderConfig?.numChunks} iterations</span>
                                <p className="text-base-content/50 mt-0.5">
                                    ~30 min between chunks for price discovery.
                                </p>
                            </div>
                        </div>
                    )}
                    {isCowQuoteLoading && (
                        <div className="flex items-center gap-2 text-xs text-base-content/60 mt-2">
                            <span className="loading loading-spinner loading-xs" />
                            Fetching CoW quote...
                        </div>
                    )}
                    
                    {/* Batched TX Toggle */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                        <div className="flex items-center gap-1.5">
                            <span className="text-base-content/60 text-xs">Batched TX</span>
                            <span className="text-[10px] text-base-content/40">(EIP-5792)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-base-content/40">
                                {useBatchedTx ? "faster" : "compatible"}
                            </span>
                            <input
                                type="checkbox"
                                checked={useBatchedTx}
                                onChange={e => setUseBatchedTx(e.target.checked)}
                                className="toggle toggle-xs toggle-primary"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Market order stats */}
            {executionType === "market" && (
                <div className="grid grid-cols-4 gap-3 text-center bg-base-200/50 p-3 rounded text-xs">
                    <div>
                        <div className="text-base-content/70 flex items-center justify-center gap-1">
                            Slippage
                            <div className="dropdown dropdown-top dropdown-hover">
                                <label tabIndex={0} className="cursor-pointer hover:text-primary">
                                    <Cog6ToothIcon className="w-3 h-3" />
                                </label>
                                <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-32 text-xs mb-1">
                                    {SLIPPAGE_OPTIONS.map((s) => (
                                        <li key={s}>
                                            <a
                                                className={slippage === s ? "active" : ""}
                                                onClick={() => setSlippage(s)}
                                            >
                                                {s}%
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="font-medium">{slippage}%</div>
                    </div>
                    <div>
                        <div className="text-base-content/70">Price Impact</div>
                        <div className={`font-medium ${priceImpactColorClass}`}>
                            {formattedPriceImpact}
                        </div>
                    </div>
                    <div>
                        <div className="text-base-content/70">Swap Rate</div>
                        <div className="font-medium">
                            1 {selectedTo?.symbol || "?"} ≈ {parseFloat(exchangeRate).toFixed(2)} {debtName}
                        </div>
                    </div>
                    <div>
                        <div className="text-base-content/70">Swap Output</div>
                        <div className={`font-medium ${outputCoversRepay ? "text-success" : "text-warning"}`}>
                            {swapQuote ? `${parseFloat(expectedOutput).toFixed(4)} ${debtName}` : "-"}
                        </div>
                    </div>
                </div>
            )}

            {/* Limit order stats */}
            {executionType === "limit" && cowQuote && (
                <div className="grid grid-cols-4 gap-3 text-center bg-base-200/50 p-3 rounded text-xs">
                    <div>
                        <div className="text-base-content/70 flex items-center justify-center gap-1">
                            Slippage
                            <div className="dropdown dropdown-top dropdown-hover">
                                <label tabIndex={0} className="cursor-pointer hover:text-primary">
                                    <Cog6ToothIcon className="w-3 h-3" />
                                </label>
                                <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-32 text-xs mb-1">
                                    {SLIPPAGE_OPTIONS.map((s) => (
                                        <li key={s}>
                                            <a
                                                className={slippage === s ? "active" : ""}
                                                onClick={() => setSlippage(s)}
                                            >
                                                {s}%
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="font-medium">{slippage}%</div>
                    </div>
                    <div>
                        <div className="text-base-content/70">Swap Rate</div>
                        <div className="font-medium">
                            1 {selectedTo?.symbol || "?"} ≈ {parseFloat(exchangeRate).toFixed(2)} {debtName}
                        </div>
                    </div>
                    <div>
                        <div className="text-base-content/70">Expected Output</div>
                        <div className="font-medium text-success">
                            {formatUnits(getCowQuoteBuyAmount(cowQuote), debtDecimals)} {debtName}
                        </div>
                    </div>
                    <div>
                        <div className="text-base-content/70">Flash Loan Fee</div>
                        <div className="font-medium">
                            {cowFlashLoanInfo?.fee && selectedTo ? formatUnits(cowFlashLoanInfo.fee, selectedTo.decimals) : "0"} {selectedTo?.symbol || ""}
                        </div>
                    </div>
                </div>
            )}

            {/* Show USD values if available (market order only) */}
            {executionType === "market" && srcUSD !== null && dstUSD !== null && (
                <div className="flex justify-between text-xs text-base-content/60 px-1">
                    <span>Selling: ~${srcUSD.toFixed(2)}</span>
                    <span>Receiving: ~${dstUSD.toFixed(2)}</span>
                </div>
            )}
        </div>
    );

    // Info content
    const infoContent = (
        <div className="space-y-4 py-2">
            <div className="alert alert-info bg-info/10 border-info/20 text-sm">
                <InformationCircleIcon className="w-5 h-5 flex-shrink-0" />
                <span>
                    <strong>How Close with Collateral Works</strong>
                    <br />
                    This feature allows you to repay your debt by selling collateral, closing your position in one transaction.
                </span>
            </div>

            <div className="space-y-4 px-2">
                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">1</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Withdraw Collateral</h4>
                        <p className="text-xs text-base-content/70">Your collateral is withdrawn from the protocol.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">2</div>
                        <div className="w-0.5 h-full bg-base-300 my-1"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="font-medium text-sm">Swap</h4>
                        <p className="text-xs text-base-content/70">Collateral is swapped for the debt token using {swapRouter === "1inch" ? "1inch" : "Pendle"}.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">3</div>
                    </div>
                    <div>
                        <h4 className="font-medium text-sm">Repay Debt</h4>
                        <p className="text-xs text-base-content/70">Your debt is repaid with the swapped tokens.</p>
                    </div>
                </div>
            </div>

            <div className="text-xs text-base-content/60 mt-4">
                Total debt: {formatUnits(debtBalance, debtDecimals)} {debtName}
            </div>
        </div>
    );

    // Warnings
    const warnings = (
        <>
            {!hasEnoughCollateral && requiredCollateral > 0n && selectedTo && (
                <div className="alert alert-warning text-xs py-2">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    <span>
                        Insufficient collateral. Need ~{requiredCollateralFormatted} {selectedTo.symbol}, 
                        but you only have {formatUnits(selectedTo.rawBalance, selectedTo.decimals)} {selectedTo.symbol}.
                    </span>
                </div>
            )}
            {swapRouter === "1inch" && swapQuote && oneInchAdapter && "from" in swapQuote.tx && swapQuote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                <div className="alert alert-warning text-xs py-2">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    <span className="break-all">Warning: Quote &apos;from&apos; address mismatch!</span>
                </div>
            )}
            {!hasAdapter && isOpen && (
                <div className="alert alert-warning text-xs py-2">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    <span>{swapRouter === "1inch" ? "1inch" : "Pendle"} Adapter not found on this network. Swaps unavailable.</span>
                </div>
            )}
        </>
    );

    // Hide dropdown when there's only one collateral option (e.g., Morpho isolated pairs)
    const singleCollateral = toAssets.length === 1;

    return (
        <SwapModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Close with Collateral"
            protocolName={protocolName}
            fromAssets={[fromAsset]}
            toAssets={toAssets}
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
            submitLabel={executionType === "market" ? "Close Position" : "Create Limit Order"}
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Debt to Repay"
            toLabel="Collateral to Sell"
            fromReadOnly={true}
            toReadOnly={singleCollateral}
            customStats={customStats}
        />
    );
};
