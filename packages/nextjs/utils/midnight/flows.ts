import {
  FlashLoanProvider,
  LendingOp,
  type ProtocolInstruction,
  encodeApprove,
  encodeFlashLoan,
  encodePullToken,
  encodePushToken,
  encodeSubtract,
  encodeToOutput,
  encodeLendingInstruction as lending,
  createProtocolInstruction as protocol,
  createRouterInstruction as router,
} from "../v2/instructionHelpers";
import { collateralIndex, encodeMidnightContext } from "./encoding";
import { type MidnightMarket, MIDNIGHT_PROTOCOL as P } from "./types";
import { type Address, type Hex, encodeAbiParameters } from "viem";

/** Exact-in aggregator swaps. Only zero-fee flash providers are accepted in these flows. */
export function buildMidnightSwap({
  mode,
  user,
  market,
  destination,
  collateralsToMove,
  tokenIn,
  tokenOut,
  amount,
  minOut,
  repay,
  swapData,
  swapRouter,
  provider,
}: {
  mode: "deleverage" | "collateral" | "debt";
  user: Address;
  market: MidnightMarket;
  destination?: { market: MidnightMarket; context: Hex };
  collateralsToMove?: Address[];
  tokenIn: Address;
  tokenOut: Address;
  amount: bigint;
  minOut: bigint;
  repay: bigint;
  swapData: Hex;
  swapRouter: "oneinch" | "kyber" | "pendle";
  provider: FlashLoanProvider;
}): ProtocolInstruction[] {
  if (
    provider !== FlashLoanProvider.Morpho &&
    provider !== FlashLoanProvider.BalancerV2 &&
    provider !== FlashLoanProvider.BalancerV3
  )
    throw new Error("This fixed-loan swap requires a zero-fee flash loan.");
  if (amount <= 0n || minOut <= 0n) throw new Error("Invalid swap amount.");
  const debtContext = encodeMidnightContext(market.market_id, 0);
  const swapContext = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
    [tokenOut, minOut, swapData],
  );
  const op = (operation: LendingOp, token: Address, context: Hex, index: number) =>
    protocol(P, lending(operation, token, user, 0n, context, index));
  if (mode === "deleverage") {
    if (repay <= 0n || minOut < repay || tokenOut.toLowerCase() !== market.loan_token.toLowerCase())
      throw new Error("The swap does not cover repayment.");
    const context = encodeMidnightContext(market.market_id, collateralIndex(market, tokenIn));
    return [
      router(encodeToOutput(repay, tokenOut)),
      router(encodeFlashLoan(provider, 0)),
      router(encodeApprove(0, P)),
      op(LendingOp.Repay, tokenOut, debtContext, 0), // refund[3]
      router(encodeToOutput(amount, tokenIn)),
      op(LendingOp.WithdrawCollateral, tokenIn, context, 4),
      router(encodeApprove(5, swapRouter)),
      protocol(swapRouter, lending(LendingOp.Swap, tokenIn, user, 0n, swapContext, 5)), // out[7], refund[8]
      router(encodeSubtract(7, 1)),
      router(encodePushToken(9, user)),
      router(encodePushToken(8, user)),
      router(encodePushToken(3, user)),
    ];
  }
  if (mode === "collateral") {
    const from = encodeMidnightContext(market.market_id, collateralIndex(market, tokenIn)),
      to = encodeMidnightContext(market.market_id, collateralIndex(market, tokenOut));
    return [
      router(encodeToOutput(amount, tokenIn)),
      router(encodeFlashLoan(provider, 0)),
      router(encodeApprove(0, swapRouter)),
      protocol(swapRouter, lending(LendingOp.Swap, tokenIn, user, 0n, swapContext, 0)), // out[3],refund[4]
      router(encodeApprove(3, P)),
      op(LendingOp.DepositCollateral, tokenOut, to, 3),
      op(LendingOp.WithdrawCollateral, tokenIn, from, 1),
      router(encodePushToken(4, user)),
    ];
  }
  if (
    !destination ||
    repay <= 0n ||
    minOut < repay ||
    destination.market.loan_token.toLowerCase() !== tokenIn.toLowerCase() ||
    market.loan_token.toLowerCase() !== tokenOut.toLowerCase()
  )
    throw new Error("Invalid fixed-loan debt switch.");
  if (destination.market.market_id === market.market_id) throw new Error("Choose a different fixed market.");
  const flow = [
    router(encodeToOutput(amount, tokenIn)),
    router(encodeFlashLoan(provider, 0)),
    router(encodeApprove(0, swapRouter)),
    protocol(swapRouter, lending(LendingOp.Swap, tokenIn, user, 0n, swapContext, 0)), // out[3],refund[4]
    router(encodeApprove(3, P)),
    op(LendingOp.Repay, tokenOut, debtContext, 3),
  ]; // refund[6]
  let output = 7;
  for (const token of collateralsToMove ?? market.collaterals.map(c => c.token)) {
    const c = { token };
    const from = encodeMidnightContext(market.market_id, collateralIndex(market, c.token));
    const to = encodeMidnightContext(destination.market.market_id, collateralIndex(destination.market, c.token));
    flow.push(
      op(LendingOp.GetSupplyBalance, c.token, from, 999),
      op(LendingOp.WithdrawCollateral, c.token, from, output),
      router(encodeApprove(output + 1, P)),
      op(LendingOp.DepositCollateral, c.token, to, output + 1),
    );
    output += 3;
  }
  flow.push(
    op(LendingOp.Borrow, tokenIn, destination.context, 1),
    router(encodePushToken(6, user)),
    router(encodePushToken(4, user)),
  );
  return flow;
}
export function buildMidnightRepay(user: Address, market: MidnightMarket, amount: bigint) {
  if (amount <= 0n) throw new Error("Enter a repayment amount.");
  return [
    router(encodePullToken(amount, market.loan_token, user)),
    router(encodeApprove(0, P)),
    protocol(P, lending(LendingOp.Repay, market.loan_token, user, 0n, encodeMidnightContext(market.market_id, 0), 0)),
    router(encodePushToken(2, user)),
  ];
}
