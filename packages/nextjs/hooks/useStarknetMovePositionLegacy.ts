import { useMemo, useState, useEffect } from "react";
import { useAccount } from "~~/hooks/useAccount";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { useDeployedContractInfo, useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { useLendingAuthorizations, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { normalizeStarknetAddress } from "~~/utils/vesu";
import { parseUnits } from "viem";
// No NetworkType import needed here

type LegacyParams = {
  isOpen: boolean;
  fromProtocol: string;
  toProtocol: string;
  selectedVersion: "v1" | "v2";
  debtAmount: string;
  isDebtMaxClicked: boolean;
  position: { tokenAddress: string; decimals: number; poolId?: bigint | string };
  addedCollaterals: Record<string, string>;
  collateralIsMaxMap: Record<string, boolean>;
  collaterals: Array<{ address: string; symbol: string; decimals: number; rawBalance: bigint; balance: number }>;
  selectedPoolId: bigint;
  selectedV2PoolAddress: string;
};

type LegacyResult = {
  calls: any[];
  isLoadingAuths: boolean;
  sendAsync: (() => Promise<any>) | null;
  error: string | null;
};

import { addrKey } from "~~/utils/address";
const toOutputPointer = (i: number) => ({ instruction_index: BigInt(i), output_index: 0n });

/** Resolve the source pool ID for Vesu/VesuV2, or null for non-Vesu protocols. */
function resolveSourcePool(
  fromProtocol: string,
  poolId: bigint | string | undefined,
  fallbackAddress: string,
): bigint | null {
  if (fromProtocol === "Vesu") {
    return typeof poolId === "string" ? BigInt(poolId) : (poolId ?? 0n);
  }
  if (fromProtocol === "VesuV2") {
    return BigInt(normalizeStarknetAddress(poolId ?? fallbackAddress));
  }
  return null;
}

/** Build a CairoOption context for source protocol operations. */
function buildSourceContext(srcPool: bigint | null, pairAddress: string): CairoOption<bigint[]> {
  if (srcPool === null) return new CairoOption<bigint[]>(CairoOptionVariant.None);
  return new CairoOption<bigint[]>(CairoOptionVariant.Some, [srcPool, BigInt(pairAddress)]);
}

/** Build deposit/borrow CairoOption contexts for the destination protocol. */
function buildDestinationContexts(
  toProtocol: string,
  selectedVersion: "v1" | "v2",
  selectedPoolId: bigint,
  selectedV2PoolAddress: string,
  debtTokenAddress: string,
  colAddress: string,
): { depositCtx: CairoOption<bigint[]>; borrowCtx: CairoOption<bigint[]> } {
  const none = () => new CairoOption<bigint[]>(CairoOptionVariant.None);
  const some = (pool: bigint, token: string) =>
    new CairoOption<bigint[]>(CairoOptionVariant.Some, [pool, BigInt(token)]);

  if (toProtocol === "Vesu" && selectedVersion === "v1") {
    return { depositCtx: some(selectedPoolId, debtTokenAddress), borrowCtx: some(selectedPoolId, colAddress) };
  }
  if (toProtocol === "Vesu" || toProtocol === "VesuV2") {
    const dstPool = BigInt(normalizeStarknetAddress(selectedV2PoolAddress));
    return { depositCtx: some(dstPool, debtTokenAddress), borrowCtx: some(dstPool, colAddress) };
  }
  return { depositCtx: none(), borrowCtx: none() };
}

export const useStarknetMovePositionLegacy = (params: LegacyParams): LegacyResult => {
  const {
    isOpen,
    fromProtocol,
    toProtocol,
    selectedVersion,
    debtAmount,
    isDebtMaxClicked,
    position,
    addedCollaterals,
    collateralIsMaxMap,
    collaterals,
    selectedPoolId,
    selectedV2PoolAddress,
  } = params;

  const { address: starkUserAddress } = useAccount();
  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<LendingAuthorization[]>([]);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const paramsKey = useMemo(() => {
    const entries = Object.entries(addedCollaterals).map(([a, v]) => [addrKey(a), v] as const).sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify({
      isOpen,
      debtAmount,
      fromProtocol,
      toProtocol,
      selectedVersion,
      positionToken: position.tokenAddress,
      positionDecimals: position.decimals,
      positionPoolId:
        position.poolId == null ? null : typeof position.poolId === "string" ? position.poolId.toLowerCase() : position.poolId.toString(),
      entries,
      maxMap: Object.entries(collateralIsMaxMap)
        .map(([k, v]) => [addrKey(k), Boolean(v)] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
      colls: collaterals.map(c => ({ a: addrKey(c.address), d: c.decimals, r: c.rawBalance.toString() })).sort((a, b) => a.a.localeCompare(b.a)),
      selectedPoolId: selectedPoolId?.toString(),
      selectedV2PoolAddress,
      isDebtMaxClicked,
      starkUserAddress,
      router: routerGateway?.address,
    });
  }, [
    isOpen,
    debtAmount,
    fromProtocol,
    toProtocol,
    selectedVersion,
    position.tokenAddress,
    position.decimals,
    position.poolId,
    addedCollaterals,
    collateralIsMaxMap,
    collaterals,
    selectedPoolId,
    selectedV2PoolAddress,
    isDebtMaxClicked,
    starkUserAddress,
    routerGateway?.address,
  ]);

  const { pairInstructions, authInstructions, authCalldataKey } = useMemo(() => {
    if (!isOpen || !debtAmount || !starkUserAddress || !routerGateway?.address) {
      return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
    }
    const parsed = parseUnits(debtAmount, position.decimals);
    const sourceName = fromProtocol === "VesuV2" ? "vesu_v2" : fromProtocol.toLowerCase();
    const targetName = toProtocol === "Vesu" ? (selectedVersion === "v2" ? "vesu_v2" : "vesu") : toProtocol.toLowerCase();

    const entries = Object.entries(addedCollaterals).map(([a, v]) => ({ lower: addrKey(a), amt: v })).sort((a, b) => a.lower.localeCompare(b.lower));
    if (entries.length === 0) return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };

    const n = BigInt(entries.length);
    const share = parsed / n;
    const remainder = parsed - share * n;

    const MAX_UINT = (1n << 256n) - 1n;
    const buf = (x: bigint) => ((x * 101n) / 100n) + 1n;

    const pairs = entries.map((e, i) => {
      const col = collaterals.find(c => addrKey(c.address) === e.lower);
      if (!col) return null;
      const isLast = i === entries.length - 1;
      const repayAll = isDebtMaxClicked && isLast;
      const repayAmt = isLast ? (repayAll ? parsed - share * BigInt(entries.length - 1) : share + remainder) : share;

      const srcPool = resolveSourcePool(fromProtocol, position.poolId, selectedV2PoolAddress);
      const repayCtx = buildSourceContext(srcPool, col.address);
      const withdrawCtx = buildSourceContext(srcPool, position.tokenAddress);

      const repay = new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: { basic: { token: position.tokenAddress, amount: uint256.bnToUint256(repayAmt), user: starkUserAddress }, repay_all: repayAll, context: repayCtx },
        Withdraw: undefined, Redeposit: undefined, Reborrow: undefined,
      });

      const mapMax = collateralIsMaxMap[e.lower] === true;
      const typedRaw = parseUnits(e.amt || "0", col.decimals);
      const typedIsExactlyMax = typedRaw === col.rawBalance;
      const isMax = mapMax || typedIsExactlyMax;
      // If Vesu source and treated as MAX, slightly bump to cover rounding (0.01% + 1)
      const bump = (x: bigint) => ((x * 10001n) / 10000n) + 1n;
      const withAmt = isMax ? bump(col.rawBalance) : typedRaw;
      const withdraw = new CairoCustomEnum({
        Deposit: undefined, Borrow: undefined, Repay: undefined,
        Withdraw: { basic: { token: col.address, amount: uint256.bnToUint256(withAmt), user: starkUserAddress }, withdraw_all: isMax, context: withdrawCtx },
        Redeposit: undefined, Reborrow: undefined,
      });

      const repayPtr = toOutputPointer(0);
      const withdrawPtr = toOutputPointer(1);

      // Target contexts: if Vesu target, encode pool and pair tokens; otherwise None (e.g., Nostra)
      const { depositCtx, borrowCtx } = buildDestinationContexts(
        toProtocol, selectedVersion, selectedPoolId, selectedV2PoolAddress,
        position.tokenAddress, col.address,
      );

      const redeposit = new CairoCustomEnum({
        Deposit: undefined, Borrow: undefined, Repay: undefined, Withdraw: undefined,
        Redeposit: { token: col.address, target_output_pointer: withdrawPtr, user: starkUserAddress, context: depositCtx },
        Reborrow: undefined,
      });

      const approval = repayAll ? MAX_UINT : buf(repayAmt);
      const reborrow = new CairoCustomEnum({
        Deposit: undefined, Borrow: undefined, Repay: undefined, Withdraw: undefined, Redeposit: undefined,
        Reborrow: { token: position.tokenAddress, target_output_pointer: repayPtr, approval_amount: uint256.bnToUint256(approval), user: starkUserAddress, context: borrowCtx },
      });

      return [
        { protocol_name: sourceName, instructions: [repay, withdraw] },
        { protocol_name: targetName, instructions: [redeposit, reborrow] },
      ];
    }).filter(Boolean) as Array<{ protocol_name: string; instructions: CairoCustomEnum[] }[]>;

    const auths = pairs.flatMap(pair => {
      const src = pair[0].instructions;
      const dst = pair[1].instructions;
      return [
        { protocol_name: sourceName, instructions: [src[1]] }, // Withdraw
        { protocol_name: targetName, instructions: [dst[1]] }, // Reborrow
      ];
    });

    return {
      pairInstructions: pairs,
      authInstructions: auths,
      authCalldataKey: JSON.stringify(CallData.compile({ instructions: auths, rawSelectors: false })),
    };
  }, [paramsKey]);

  // Fetch authorizations (legacy)
  useEffect(() => {
    if (!isOpen || !isAuthReady || !authInstructions || authInstructions.length === 0 || !authCalldataKey) {
      setFetchedAuthorizations([]);
      setAuthError(null);
      setIsLoadingAuths(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setIsLoadingAuths(true);
        setAuthError(null);
        const auths = await getAuthorizations(authInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch (e: any) {
        if (!cancelled) {
          setFetchedAuthorizations([]);
          setAuthError(e.message || "Failed to fetch authorizations");
        }
      } finally {
        if (!cancelled) setIsLoadingAuths(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isOpen, isAuthReady, getAuthorizations, authInstructions, authCalldataKey]);

  const calls = useMemo(() => {
    if (!pairInstructions || pairInstructions.length === 0) return [];
    const authorizations = fetchedAuthorizations ?? [];
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(authorizations);
    const moveCalls = pairInstructions.map(instructions => ({
      contractName: "RouterGateway" as const,
      functionName: "move_debt" as const,
      args: CallData.compile({ instructions }),
    }));
    return [
      ...(authorizations as any),
      ...moveCalls,
      ...(revokeAuthorizations as any),
    ];
  }, [pairInstructions, fetchedAuthorizations]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  return {
    calls,
    isLoadingAuths,
    sendAsync: sendAsync || null,
    error: authError,
  };
};


