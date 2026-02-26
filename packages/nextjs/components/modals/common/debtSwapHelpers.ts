/**
 * Pure helper functions for useDebtSwapConfig to reduce cognitive complexity.
 * These contain no React hooks and no side effects.
 */
import { Address, encodeAbiParameters } from "viem";
import {
  ProtocolInstruction, createRouterInstruction, createProtocolInstruction,
  encodeApprove, encodeFlashLoan, encodeLendingInstruction, encodePushToken,
  encodeToOutput, LendingOp, normalizeProtocolName, encodeEulerContext,
} from "~~/utils/v2/instructionHelpers";
import type { EulerCollateralInfo } from "./useDebtSwapConfig";
import type { SwapRouter } from "../SwapModalShell";

/** Best available swap router when current is unavailable; null if no switch needed. */
export function resolveAvailableRouter(current: SwapRouter, avail: Record<string, boolean>): SwapRouter | null {
  if (avail[current]) return null;
  const order: SwapRouter[] = ["kyber", "1inch", "pendle"];
  return order.find(r => r !== current && avail[r]) ?? null;
}

/** Display name for a swap router. */
export function getRouterDisplayName(r: SwapRouter): string {
  if (r === "kyber") return "Kyber";
  if (r === "1inch") return "1inch";
  return "Pendle";
}

/** Swap protocol identifier from swap router. */
export function resolveSwapProtocol(r: SwapRouter): "oneinch" | "kyber" | "pendle" {
  if (r === "1inch") return "oneinch";
  if (r === "kyber") return "kyber";
  return "pendle";
}

/** Pick trigger context: Morpho/Euler encoded context or generic. */
export function resolveTriggerContext(ctx: string | undefined, isMorpho: boolean, morphoCtx: string | undefined, isEuler: boolean, eulerCtx: string | undefined): `0x${string}` {
  if (isMorpho && morphoCtx) return morphoCtx as `0x${string}`;
  if (isEuler && eulerCtx) return eulerCtx as `0x${string}`;
  return (ctx || "0x") as `0x${string}`;
}

/** Encode swap context for aggregator calls. */
export function encodeSwapCtx(token: string, minOut: bigint, data: `0x${string}`): `0x${string}` {
  return encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }], [token as Address, minOut, data]);
}

/** Morpho conditional post-instructions for isMax (withdraw all collateral).
 * Uses GetSupplyBalance to query the full collateral balance on-chain,
 * then withdraws it all. This adds one instruction vs the chunk version,
 * shifting all subsequent UTXO indices by +1. */
export function buildMorphoMaxConditionalPost(p: string, debt: string, user: string, oldC: string, newC: string, col: string, to: string, mgr: string): ProtocolInstruction[] {
  return [
    createRouterInstruction(encodeApprove(1, p)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.Repay, debt, user, 0n, oldC, 1)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.GetSupplyBalance, col, user, 0n, oldC, 999)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.WithdrawCollateral, col, user, 0n, oldC, 4)),
    createRouterInstruction(encodeApprove(5, p)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.DepositCollateral, col, user, 0n, newC, 5)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.Borrow, to, user, 0n, newC, 0)),
    createRouterInstruction(encodePushToken(7, mgr)),
    createRouterInstruction(encodePushToken(3, user)),
  ];
}

/** Morpho conditional post-instructions for proportional chunks. */
export function buildMorphoChunkConditionalPost(p: string, debt: string, user: string, oldC: string, newC: string, col: string, to: string, mgr: string, chunkCol: bigint): ProtocolInstruction[] {
  return [
    createRouterInstruction(encodeApprove(1, p)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.Repay, debt, user, 0n, oldC, 1)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.WithdrawCollateral, col, user, chunkCol, oldC, 999)),
    createRouterInstruction(encodeApprove(4, p)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.DepositCollateral, col, user, 0n, newC, 4)),
    createProtocolInstruction(p, encodeLendingInstruction(LendingOp.Borrow, to, user, 0n, newC, 0)),
    createRouterInstruction(encodePushToken(6, mgr)),
  ];
}

export interface EulerCondParams {
  proto: string; debt: string; user: string; oldCtx: string; borrowVault: string;
  collaterals: EulerCollateralInfo[]; oldSub: number; newSub: number;
  newBorrow: string; to: string; mgr: string; chunks: number; isMax: boolean;
}

/** Euler conditional post-instructions with collateral migration. */
export function buildEulerConditionalPost(e: EulerCondParams): ProtocolInstruction[] {
  const out: ProtocolInstruction[] = [];
  out.push(createRouterInstruction(encodeApprove(1, e.proto)));
  out.push(createProtocolInstruction(e.proto, encodeLendingInstruction(LendingOp.Repay, e.debt, e.user, 0n, e.oldCtx, 1)));
  let u = 4;
  const wU: number[] = [];
  for (const c of e.collaterals) {
    const wC = encodeEulerContext({ borrowVault: e.borrowVault as Address, collateralVault: c.vaultAddress as Address, subAccountIndex: e.oldSub });
    if (e.isMax) {
      out.push(createProtocolInstruction(e.proto, encodeLendingInstruction(LendingOp.GetSupplyBalance, c.tokenAddress, e.user, 0n, wC, 999)));
      const sb = u++;
      out.push(createProtocolInstruction(e.proto, encodeLendingInstruction(LendingOp.WithdrawCollateral, c.tokenAddress, e.user, 0n, wC, sb)));
      wU.push(u++);
    } else {
      out.push(createProtocolInstruction(e.proto, encodeLendingInstruction(LendingOp.WithdrawCollateral, c.tokenAddress, e.user, c.balance / BigInt(e.chunks), wC, 999)));
      wU.push(u++);
    }
  }
  for (let i = 0; i < e.collaterals.length; i++) {
    const c = e.collaterals[i];
    const dC = encodeEulerContext({ borrowVault: e.newBorrow as Address, collateralVault: c.vaultAddress as Address, subAccountIndex: e.newSub });
    out.push(createRouterInstruction(encodeApprove(wU[i], e.proto)));
    u++;
    out.push(createProtocolInstruction(e.proto, encodeLendingInstruction(LendingOp.DepositCollateral, c.tokenAddress, e.user, 0n, dC, wU[i])));
  }
  const bC = encodeEulerContext({ borrowVault: e.newBorrow as Address, collateralVault: e.collaterals.map(c => c.vaultAddress as Address), subAccountIndex: e.newSub });
  out.push(createProtocolInstruction(e.proto, encodeLendingInstruction(LendingOp.Borrow, e.to, e.user, 0n, bC, 0)));
  const bU = u++;
  out.push(createRouterInstruction(encodePushToken(bU, e.mgr)));
  if (e.isMax) out.push(createRouterInstruction(encodePushToken(3, e.user)));
  return out;
}

/** Standard (Aave/Compound/Venus) conditional post-instructions. */
export function buildStandardConditionalPost(proto: string, debt: string, user: string, ctx: string | undefined, to: string, mgr: string, isMax: boolean): ProtocolInstruction[] {
  const c = ctx || "0x";
  const out: ProtocolInstruction[] = [
    createRouterInstruction(encodeApprove(1, proto)),
    createProtocolInstruction(proto, encodeLendingInstruction(LendingOp.Repay, debt, user, 0n, c, 1)),
    createProtocolInstruction(proto, encodeLendingInstruction(LendingOp.Borrow, to, user, 0n, c, 0)),
    createRouterInstruction(encodePushToken(4, mgr)),
  ];
  if (isMax) out.push(createRouterInstruction(encodePushToken(3, user)));
  return out;
}

/** Morpho market-order flow (flash loan + swap + collateral migration). */
export function buildMorphoMarketFlow(debt: string, to: string, user: string, reqDebt: bigint, minOut: bigint, swapData: `0x${string}`, prov: number, swapP: string, oldC: string, newC: string, col: string, colBal: bigint): ProtocolInstruction[] {
  const sc = encodeSwapCtx(debt, minOut, swapData);
  return [
    createRouterInstruction(encodeToOutput(reqDebt, to)),
    createRouterInstruction(encodeFlashLoan(prov, 0)),
    createRouterInstruction(encodeApprove(1, swapP)),
    createProtocolInstruction(swapP, encodeLendingInstruction(LendingOp.SwapExactOut, to, user, 0n, sc, 1)),
    createRouterInstruction(encodeApprove(3, "morpho-blue")),
    createProtocolInstruction("morpho-blue", encodeLendingInstruction(LendingOp.Repay, debt, user, 0n, oldC, 3)),
    createProtocolInstruction("morpho-blue", encodeLendingInstruction(LendingOp.WithdrawCollateral, col, user, colBal, oldC, 999)),
    createRouterInstruction(encodeApprove(7, "morpho-blue")),
    createProtocolInstruction("morpho-blue", encodeLendingInstruction(LendingOp.DepositCollateral, col, user, 0n, newC, 7)),
    createProtocolInstruction("morpho-blue", encodeLendingInstruction(LendingOp.Borrow, to, user, 0n, newC, 0)),
    createRouterInstruction(encodePushToken(6, user)),
    createRouterInstruction(encodePushToken(4, user)),
  ];
}

/** Euler market-order flow (flash loan + swap + sub-account migration). */
export function buildEulerMarketFlow(debt: string, to: string, user: string, reqDebt: bigint, minOut: bigint, swapData: `0x${string}`, prov: number, swapP: string, protoName: string, oldCtx: string, cols: EulerCollateralInfo[], bVault: string, oldSub: number, newSub: number, newBorrow: string): ProtocolInstruction[] {
  const sc = encodeSwapCtx(debt, minOut, swapData);
  const np = normalizeProtocolName(protoName);
  const out: ProtocolInstruction[] = [];
  let u = 0;
  out.push(createRouterInstruction(encodeToOutput(reqDebt, to)));
  const bAU = u++;
  out.push(createRouterInstruction(encodeFlashLoan(prov, bAU)));
  const flU = u++;
  out.push(createRouterInstruction(encodeApprove(flU, swapP)));
  u++;
  out.push(createProtocolInstruction(swapP, encodeLendingInstruction(LendingOp.SwapExactOut, to, user, 0n, sc, flU)));
  const odU = u++;
  const srU = u++;
  out.push(createRouterInstruction(encodeApprove(odU, np)));
  u++;
  out.push(createProtocolInstruction(np, encodeLendingInstruction(LendingOp.Repay, debt, user, 0n, oldCtx, odU)));
  const rrU = u++;
  const cU: number[] = [];
  for (const c of cols) {
    const wC = encodeEulerContext({ borrowVault: bVault as Address, collateralVault: c.vaultAddress as Address, subAccountIndex: oldSub });
    out.push(createProtocolInstruction(np, encodeLendingInstruction(LendingOp.GetSupplyBalance, c.tokenAddress, user, 0n, wC, 999)));
    const sb = u++;
    out.push(createProtocolInstruction(np, encodeLendingInstruction(LendingOp.WithdrawCollateral, c.tokenAddress, user, 0n, wC, sb)));
    cU.push(u++);
  }
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const dC = encodeEulerContext({ borrowVault: newBorrow as Address, collateralVault: c.vaultAddress as Address, subAccountIndex: newSub });
    out.push(createRouterInstruction(encodeApprove(cU[i], np)));
    u++;
    out.push(createProtocolInstruction(np, encodeLendingInstruction(LendingOp.DepositCollateral, c.tokenAddress, user, 0n, dC, cU[i])));
  }
  const bC = encodeEulerContext({ borrowVault: newBorrow as Address, collateralVault: cols.map(c => c.vaultAddress as Address), subAccountIndex: newSub });
  out.push(createProtocolInstruction(np, encodeLendingInstruction(LendingOp.Borrow, to, user, 0n, bC, bAU)));
  u++;
  out.push(createRouterInstruction(encodePushToken(rrU, user)));
  out.push(createRouterInstruction(encodePushToken(srU, user)));
  return out;
}
