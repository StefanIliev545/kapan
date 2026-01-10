import { useEffect, useMemo, useState, useRef } from "react";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { fetchBuildExecuteTransaction, fetchQuotes } from "@avnu/avnu-sdk";
import type { Quote } from "@avnu/avnu-sdk";
import { useLendingAuthorizations, type BaseProtocolInstruction, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildVesuContextOption, createVesuContext, type VesuProtocolKey } from "~~/utils/vesu";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { DEBOUNCE_DELAYS } from "~~/hooks/useDebouncedEffect";

const SLIPPAGE = 0.05;
const BUFFER_BPS = 500n; // 5%
const DEBOUNCE_MS = DEBOUNCE_DELAYS.STANDARD;

const withBuffer = (amount: bigint, bufferBps: bigint = BUFFER_BPS) => {
  if (amount === 0n) return 0n;
  return (amount * (10_000n + bufferBps)) / 10_000n;
};

const toOutputPointer = (
  instructionIndex: number,
  outputIndex = 0,
): { instruction_index: bigint; output_index: bigint } => ({
  instruction_index: BigInt(instructionIndex),
  output_index: BigInt(outputIndex),
});

const toContextOption = (protocolKey: VesuProtocolKey, poolKey: string, counterpartToken: string) =>
  buildVesuContextOption(createVesuContext(protocolKey, poolKey, counterpartToken));

export interface TokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

type SwitchType = "collateral" | "debt";

interface UseVesuSwitchArgs {
  isOpen: boolean;
  type: SwitchType;
  address?: string;
  currentCollateral: TokenInfo;
  currentDebt: TokenInfo;
  targetToken: TokenInfo | null;
  collateralBalance: bigint;
  debtBalance: bigint;
  poolKey: string;
  protocolKey: VesuProtocolKey;
}

export const useVesuSwitch = ({
  isOpen,
  type,
  address,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  poolKey,
  protocolKey,
}: UseVesuSwitchArgs) => {
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();

  // ⚙️ Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [protocolInstructions, setProtocolInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [authInstructions, setAuthInstructions] = useState<BaseProtocolInstruction[]>([]);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<LendingAuthorization[]>([]);

  // 🔒 Stabilized primitives for deps (avoid object identity churn)
  const currentCollateralAddr = currentCollateral?.address;
  const currentDebtAddr = currentDebt?.address;
  const targetTokenAddr = targetToken?.address ?? null;

  // 🧠 Internal refs to control request storms
  // Track the currently in-flight request key to dedupe only while active.
  const inflightKeyRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0); // increment to invalidate previous runs
  const pendingCountRef = useRef(0); // number of active async runs

  // 🔗 stabilize getAuthorizations usage
  const getAuthRef = useRef(getAuthorizations);
  useEffect(() => {
    getAuthRef.current = getAuthorizations;
  }, [getAuthorizations]);

  // 🔄 Reset per open/type/target change
  useEffect(() => {
    setSelectedQuote(null);
    setProtocolInstructions([]);
    setFetchedAuthorizations([]);
    setAuthInstructions([]);
    setError(null);
    inflightKeyRef.current = null; // ensure no stale dedupe blocks
    setLoading(false); // avoid inheriting a stuck spinner when reopening
  }, [isOpen, type, targetTokenAddr]);

  // 🔎 Fetch quote + AVNU calldata (debounced, deduped, cancel-safe)
  useEffect(() => {
    if (!isOpen || !address || !targetTokenAddr) {
      // nothing to do, guarantee not loading
      setLoading(false);
      return;
    }

    // Determine the "business" inputs as primitives
    const repayAmount = debtBalance > 0n ? debtBalance : 0n;
    const withdrawAmount = collateralBalance > 0n ? collateralBalance : 0n;

    // Nothing meaningful to do — avoid noisy requests
    const amount = type === "collateral" ? withdrawAmount : repayAmount;
    if (amount === 0n) {
      setSelectedQuote(null);
      setProtocolInstructions([]);
      setAuthInstructions([]);
      setLoading(false);
      return;
    }

    const sellTokenAddress = type === "collateral" ? currentCollateralAddr : targetTokenAddr;
    const buyTokenAddress = type === "collateral" ? targetTokenAddr : currentDebtAddr;

    if (!sellTokenAddress || !buyTokenAddress) return;

    // Use a primitive-only key so identical inputs dedupe properly
    const requestKey = `${sellTokenAddress}-${buyTokenAddress}-${amount.toString()}-${address}-${poolKey}-${protocolKey}-${type}`;

    // If an identical request is already in-flight, skip scheduling another
    if (inflightKeyRef.current === requestKey) {
      return;
    }

    // Debounce to avoid burst calls during typing / fast prop changes
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      const myRunId = ++runIdRef.current; // invalidate prior runs
      inflightKeyRef.current = requestKey;
      pendingCountRef.current += 1;
      setLoading(true);
      setError(null);

      try {
        // Build quote request with minimal stable fields
        const quoteRequest =
          type === "collateral"
            ? { sellTokenAddress, buyTokenAddress, sellAmount: amount, takerAddress: address }
            : { sellTokenAddress, buyTokenAddress, buyAmount: amount, takerAddress: address };

        const quotes = await fetchQuotes(quoteRequest as any);
        if (!quotes || quotes.length === 0) throw new Error("Unable to fetch AVNU quote");

        const quote = quotes[0];
        if (runIdRef.current !== myRunId) return; // outdated

        const tx = await fetchBuildExecuteTransaction(quote.quoteId, address, SLIPPAGE, false);
        const swapCall = tx.calls?.find((call: any) =>
          ["swap_exact_token_to", "multi_route_swap", "swap_exact_in"].includes(call.entrypoint),
        );
        if (!swapCall) throw new Error("Failed to extract AVNU calldata");

        const calldata = (swapCall.calldata as any[]).map(v => BigInt(v.toString()));

        // Build protocol instructions (pure; safe to run multiple times)
        // targetToken is guaranteed to exist due to early return on !targetTokenAddr above
        if (!targetToken) return;

        const instructions =
          type === "collateral"
            ? buildCollateralSwitchInstructions({
                address,
                poolKey,
                currentCollateral,
                currentDebt,
                targetToken,
                collateralBalance,
                debtBalance,
                quote,
                avnuData: calldata,
                protocolKey,
              })
            : buildDebtSwitchInstructions({
                address,
                poolKey,
                currentCollateral,
                currentDebt,
                targetToken,
                collateralBalance,
                debtBalance,
                quote,
                avnuData: calldata,
                protocolKey,
              });

        if (runIdRef.current !== myRunId) return; // outdated

        setSelectedQuote(quote);
        setProtocolInstructions(instructions);

        // Build minimal authorization instruction set
        if (type === "collateral") {
          const withdrawOnly = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: {
              basic: {
                token: currentCollateral.address,
                amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)),
                user: address,
              },
              withdraw_all: true,
              context: toContextOption(protocolKey, poolKey, currentDebt.address),
            },
            Redeposit: undefined,
            Reborrow: undefined,
            Swap: undefined,
            SwapExactIn: undefined,
            Reswap: undefined,
            ReswapExactIn: undefined,
          });
          setAuthInstructions([{ protocol_name: protocolKey, instructions: [withdrawOnly] }]);
        } else {
          const withdrawOnly = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: {
              basic: {
                token: currentCollateral.address,
                amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)),
                user: address,
              },
              withdraw_all: true,
              context: toContextOption(protocolKey, poolKey, currentDebt.address),
            },
            Redeposit: undefined,
            Reborrow: undefined,
            Swap: undefined,
            SwapExactIn: undefined,
            Reswap: undefined,
            ReswapExactIn: undefined,
          });
          const borrowAmount = withBuffer(quote.sellAmount, BUFFER_BPS);
          const borrowOnly = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: {
              basic: { token: targetToken.address, amount: uint256.bnToUint256(borrowAmount), user: address },
              context: toContextOption(protocolKey, poolKey, currentCollateral.address),
            },
            Repay: undefined,
            Withdraw: undefined,
            Redeposit: undefined,
            Reborrow: undefined,
            Swap: undefined,
            SwapExactIn: undefined,
            Reswap: undefined,
            ReswapExactIn: undefined,
          });
          setAuthInstructions([{ protocol_name: protocolKey, instructions: [withdrawOnly, borrowOnly] }]);
        }
      } catch (e: any) {
        // Always surface the latest error; stale ones are harmless
        if (runIdRef.current === myRunId) {
          setError(e?.message ?? "Failed to prepare switch instructions");
        }
      } finally {
        // Clear in-flight key if it belongs to this run
        if (inflightKeyRef.current === requestKey) inflightKeyRef.current = null;
        // Decrement pending and update loading accordingly (prevents stuck spinner)
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
        if (pendingCountRef.current === 0) setLoading(false);
      }
    }, DEBOUNCE_MS);

    // Cleanup: cancel scheduled work and invalidate previous run
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Invalidate any in-flight async completions
      runIdRef.current++;
    };
    // ✅ Only primitive deps here (objects removed to avoid identity churn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, address, type, targetTokenAddr, currentCollateralAddr, currentDebtAddr, collateralBalance, debtBalance, poolKey, protocolKey]);

  // 🔐 Fetch authorizations only when needed (stable getAuthorizations)
  useEffect(() => {
    if (!isOpen || !isAuthReady || authInstructions.length === 0) {
      setFetchedAuthorizations([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const auths = await getAuthRef.current(authInstructions as any);
        if (active) setFetchedAuthorizations(auths);
      } catch {
        if (active) setFetchedAuthorizations([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen, isAuthReady, authInstructions]);

  // 📞 Build final calls (auths + move_debt)
  const calls = useMemo(() => {
    if (protocolInstructions.length === 0) return [];
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(fetchedAuthorizations);
    return [
      ...(fetchedAuthorizations as any),
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: CallData.compile({ instructions: protocolInstructions }),
      },
      ...(revokeAuthorizations as any),
    ];
  }, [protocolInstructions, fetchedAuthorizations]);

  const swapSummary = useMemo(() => {
    if (!selectedQuote || !targetToken) return null as
      | null
      | {
          sellToken: TokenInfo;
          buyToken: TokenInfo;
          sellAmount: bigint;
          buyAmount: bigint;
        };
    if (type === "collateral") {
      return {
        sellToken: currentCollateral,
        buyToken: targetToken,
        sellAmount: selectedQuote.sellAmount,
        buyAmount: selectedQuote.buyAmount,
      };
    }
    return {
      sellToken: targetToken,
      buyToken: currentDebt,
      sellAmount: selectedQuote.sellAmount,
      buyAmount: selectedQuote.buyAmount,
    };
  }, [selectedQuote, type, currentCollateral, targetToken, currentDebt]);

  return {
    loading,
    error,
    selectedQuote,
    swapSummary,
    authInstructions,
    protocolInstructions,
    fetchedAuthorizations,
    calls,
  } as const;
};

/* ---------- the two builders remain unchanged below ---------- */

// ... keep buildCollateralSwitchInstructions and buildDebtSwitchInstructions as in your original file


interface BuildInstructionArgs {
  address: string;
  poolKey: string;
  currentCollateral: TokenInfo;
  currentDebt: TokenInfo;
  targetToken: TokenInfo;
  collateralBalance: bigint;
  debtBalance: bigint;
  quote: Quote;
  avnuData: bigint[];
  protocolKey: VesuProtocolKey;
}

const buildCollateralSwitchInstructions = ({
  address,
  poolKey,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  quote,
  avnuData,
  protocolKey,
}: BuildInstructionArgs): BaseProtocolInstruction[] => {
  const instructions: BaseProtocolInstruction[] = [];
  const vesuFirst: CairoCustomEnum[] = [];
  const vesuSecond: CairoCustomEnum[] = [];

  let currentIndex = 0;
  let repayIndex: number | null = null;
  const reswapIndex: number = debtBalance > 0n ? 2 : 1;

  if (debtBalance > 0n) {
    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: { token: currentDebt.address, amount: uint256.bnToUint256(debtBalance), user: address },
        repay_all: true,
        context: toContextOption(protocolKey, poolKey, currentCollateral.address),
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
      ReswapExactIn: undefined,
    });
    vesuFirst.push(repayInstruction);
    repayIndex = currentIndex;
    currentIndex += 1;
  }

  const withdrawInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: {
      basic: { token: currentCollateral.address, amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)), user: address },
      withdraw_all: true,
      context: toContextOption(protocolKey, poolKey, currentDebt.address),
    },
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuFirst.push(withdrawInstruction);
  const withdrawIndex = currentIndex;
  currentIndex += 1;

  const minOut = quote.buyAmount - (quote.buyAmount * BigInt(Math.floor(SLIPPAGE * 10_000))) / 10_000n;
  const reswapExactIn = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: {
      exact_in: toOutputPointer(withdrawIndex),
      min_out: uint256.bnToUint256(minOut > 0n ? minOut : quote.buyAmount),
      token_out: targetToken.address,
      user: address,
      should_pay_out: false,
      should_pay_in: false,
      context: new CairoOption(CairoOptionVariant.Some, avnuData),
    },
  });
  const avnuInstructions = [reswapExactIn];

  const redepositInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: {
      token: targetToken.address,
      target_output_pointer: toOutputPointer(reswapIndex, 1),
      user: address,
      context: toContextOption(protocolKey, poolKey, currentDebt.address),
    },
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuSecond.push(redepositInstruction);
  currentIndex += 1;

  if (debtBalance > 0n) {
    const approvalAmount = withBuffer(debtBalance, BUFFER_BPS);
    const reborrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: {
        token: currentDebt.address,
        target_output_pointer: toOutputPointer(repayIndex ?? 0),
        approval_amount: uint256.bnToUint256(approvalAmount),
        user: address,
        context: toContextOption(protocolKey, poolKey, targetToken.address),
      },
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
      ReswapExactIn: undefined,
    });
    vesuSecond.push(reborrowInstruction);
  }

  if (vesuFirst.length > 0) instructions.push({ protocol_name: protocolKey, instructions: vesuFirst });
  instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });
  if (vesuSecond.length > 0) instructions.push({ protocol_name: protocolKey, instructions: vesuSecond });

  return instructions;
};

const buildDebtSwitchInstructions = ({
  address,
  poolKey,
  currentCollateral,
  currentDebt,
  targetToken,
  collateralBalance,
  debtBalance,
  quote,
  avnuData,
  protocolKey,
}: BuildInstructionArgs): BaseProtocolInstruction[] => {
  const instructions: BaseProtocolInstruction[] = [];
  const vesuFirst: CairoCustomEnum[] = [];
  const vesuSecond: CairoCustomEnum[] = [];

  let currentIndex = 0;

  const repayInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: {
      basic: { token: currentDebt.address, amount: uint256.bnToUint256(debtBalance), user: address },
      repay_all: true,
      context: toContextOption(protocolKey, poolKey, currentCollateral.address),
    },
    Withdraw: undefined,
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuFirst.push(repayInstruction);
  const repayIndex = currentIndex;
  currentIndex += 1;

  const withdrawInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: {
      basic: { token: currentCollateral.address, amount: uint256.bnToUint256(withBuffer(collateralBalance, 100n)), user: address },
      withdraw_all: true,
      context: toContextOption(protocolKey, poolKey, currentDebt.address),
    },
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuFirst.push(withdrawInstruction);
  const withdrawIndex = currentIndex;
  currentIndex += 1;

  const redepositInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: {
      token: currentCollateral.address,
      target_output_pointer: toOutputPointer(withdrawIndex),
      user: address,
      context: toContextOption(protocolKey, poolKey, targetToken.address),
    },
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuSecond.push(redepositInstruction);
  currentIndex += 1;

  const borrowAmount = withBuffer(quote.sellAmount, BUFFER_BPS);
  const borrowInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: {
      basic: { token: targetToken.address, amount: uint256.bnToUint256(borrowAmount), user: address },
      context: toContextOption(protocolKey, poolKey, currentCollateral.address),
    },
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: undefined,
    ReswapExactIn: undefined,
  });
  vesuSecond.push(borrowInstruction);
  const borrowIndex = currentIndex;
  currentIndex += 1;

  const reswapInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
    Redeposit: undefined,
    Reborrow: undefined,
    Swap: undefined,
    SwapExactIn: undefined,
    Reswap: {
      exact_out: toOutputPointer(repayIndex),
      max_in: toOutputPointer(borrowIndex),
      user: address,
      should_pay_out: false,
      should_pay_in: true,
      context: new CairoOption(CairoOptionVariant.Some, avnuData),
    },
    ReswapExactIn: undefined,
  });
  const avnuInstructions = [reswapInstruction];

  instructions.push({ protocol_name: protocolKey, instructions: vesuFirst });
  instructions.push({ protocol_name: protocolKey, instructions: vesuSecond });
  instructions.push({ protocol_name: "avnu", instructions: avnuInstructions });

  return instructions;
};


