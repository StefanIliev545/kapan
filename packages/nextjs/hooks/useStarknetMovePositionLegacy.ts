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
  tokenToPrices?: Record<string, bigint>;
};

type LegacyResult = {
  calls: any[];
  isLoadingAuths: boolean;
  sendAsync: (() => Promise<any>) | null;
  error: string | null;
};

const addrKey = (a?: string) => (a ?? "").toLowerCase();
const toOutputPointer = (i: number) => ({ instruction_index: BigInt(i), output_index: 0n });

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
    tokenToPrices,
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
      prices: tokenToPrices
        ? Object.entries(tokenToPrices)
            .map(([k, v]) => [addrKey(k), v.toString()] as const)
            .sort((a, b) => a[0].localeCompare(b[0]))
        : [],
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
    tokenToPrices,
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

    const MAX_UINT = (1n << 256n) - 1n;
    const buf = (x: bigint) => ((x * 101n) / 100n) + 1n;

    const valuationData = entries
      .map(entry => {
        const col = collaterals.find(c => addrKey(c.address) === entry.lower);
        if (!col) return null;
        const amtString = (entry.amt || "").trim();
        let typedRaw: bigint;
        try {
          typedRaw = parseUnits(amtString === "" ? "0" : amtString, col.decimals);
        } catch {
          typedRaw = 0n;
        }
        const mapMax = collateralIsMaxMap[entry.lower] === true;
        const typedIsExactlyMax = typedRaw === col.rawBalance;
        const isMax = mapMax || typedIsExactlyMax;
        if (typedRaw === 0n && !isMax) {
          return null;
        }
        const price = tokenToPrices?.[entry.lower] ?? 0n;
        const weight = price > 0n ? typedRaw * price : typedRaw;
        return { entry, col, typedRaw, price, weight, isMax };
      })
      .filter(Boolean) as Array<{
        entry: { lower: string; amt: string };
        col: { address: string; symbol: string; decimals: number; rawBalance: bigint; balance: number };
        typedRaw: bigint;
        price: bigint;
        weight: bigint;
        isMax: boolean;
      }>;

    if (!valuationData.length) return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };

    const totalWeight = valuationData.reduce((acc, item) => acc + item.weight, 0n);
    let allocations: bigint[] = [];

    if (totalWeight === 0n) {
      const n = BigInt(valuationData.length);
      if (n > 0n) {
        const base = parsed / n;
        let remainder = parsed - base * n;
        allocations = valuationData.map(() => {
          if (remainder > 0n) {
            remainder -= 1n;
            return base + 1n;
          }
          return base;
        });
      }
    } else {
      const weightedShares = valuationData.map(item => {
        const product = parsed * item.weight;
        const share = product / totalWeight;
        const remainder = product % totalWeight;
        return { share, remainder };
      });
      allocations = weightedShares.map(s => s.share);
      let diff = parsed - allocations.reduce((acc, amt) => acc + amt, 0n);
      if (diff > 0n) {
        const order = weightedShares
          .map((s, idx) => ({ idx, remainder: s.remainder }))
          .sort((a, b) => {
            if (a.remainder === b.remainder) return a.idx - b.idx;
            return a.remainder > b.remainder ? -1 : 1;
          });
        for (const entry of order) {
          if (diff === 0n) break;
          allocations[entry.idx] += 1n;
          diff -= 1n;
        }
      }
    }

    if (!allocations.length) {
      return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
    }

    const aggregatedSource: CairoCustomEnum[] = [];
    const aggregatedTarget: CairoCustomEnum[] = [];
    const withdrawAuths: CairoCustomEnum[] = [];
    const reborrowAuths: CairoCustomEnum[] = [];

    const activeEntries = valuationData
      .map((item, idx) => ({ ...item, repayAmt: allocations[idx] ?? 0n }))
      .filter(mapped => mapped.repayAmt > 0n);

    if (activeEntries.length === 0) {
      return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
    }

    activeEntries.forEach((item, index) => {
      const { col, typedRaw, repayAmt, isMax } = item;
      const isLast = index === activeEntries.length - 1;
      const repayAll = isDebtMaxClicked && isLast;

      let srcPool: bigint | null = null;
      if (fromProtocol === "Vesu") {
        srcPool = typeof position.poolId === "string" ? BigInt(position.poolId) : (position.poolId ?? 0n);
      } else if (fromProtocol === "VesuV2") {
        srcPool = BigInt(normalizeStarknetAddress(position.poolId ?? selectedV2PoolAddress));
      }
      const repayCtx =
        srcPool !== null
          ? new CairoOption<bigint[]>(CairoOptionVariant.Some, [srcPool, BigInt(col.address)])
          : new CairoOption<bigint[]>(CairoOptionVariant.None);
      const withdrawCtx =
        srcPool !== null
          ? new CairoOption<bigint[]>(CairoOptionVariant.Some, [srcPool, BigInt(position.tokenAddress)])
          : new CairoOption<bigint[]>(CairoOptionVariant.None);

      const repayPtrIndex = aggregatedSource.length;
      aggregatedSource.push(
        new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: {
            basic: { token: position.tokenAddress, amount: uint256.bnToUint256(repayAmt), user: starkUserAddress },
            repay_all: repayAll,
            context: repayCtx,
          },
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        }),
      );

      const bump = (x: bigint) => ((x * 10001n) / 10000n) + 1n;
      const withAmt = isMax ? bump(col.rawBalance) : typedRaw;
      const withdrawInstruction = new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: {
          basic: { token: col.address, amount: uint256.bnToUint256(withAmt), user: starkUserAddress },
          withdraw_all: isMax,
          context: withdrawCtx,
        },
        Redeposit: undefined,
        Reborrow: undefined,
      });
      const withdrawPtrIndex = aggregatedSource.length;
      aggregatedSource.push(withdrawInstruction);
      withdrawAuths.push(withdrawInstruction);

      let depositCtx: CairoOption<bigint[]> = new CairoOption<bigint[]>(CairoOptionVariant.None);
      let borrowCtx: CairoOption<bigint[]> = new CairoOption<bigint[]>(CairoOptionVariant.None);
      if (toProtocol === "Vesu") {
        if (selectedVersion === "v1") {
          depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [selectedPoolId, BigInt(position.tokenAddress)]);
          borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [selectedPoolId, BigInt(col.address)]);
        } else {
          const dstPool = BigInt(normalizeStarknetAddress(selectedV2PoolAddress));
          depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [dstPool, BigInt(position.tokenAddress)]);
          borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [dstPool, BigInt(col.address)]);
        }
      } else if (toProtocol === "VesuV2") {
        const dstPool = BigInt(normalizeStarknetAddress(selectedV2PoolAddress));
        depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [dstPool, BigInt(position.tokenAddress)]);
        borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [dstPool, BigInt(col.address)]);
      }

      const redepositInstruction = new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: undefined,
        Redeposit: {
          token: col.address,
          target_output_pointer: toOutputPointer(withdrawPtrIndex),
          user: starkUserAddress,
          context: depositCtx,
        },
        Reborrow: undefined,
      });
      aggregatedTarget.push(redepositInstruction);

      const approval = repayAll ? MAX_UINT : buf(repayAmt);
      const reborrowInstruction = new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: undefined,
        Redeposit: undefined,
        Reborrow: {
          token: position.tokenAddress,
          target_output_pointer: toOutputPointer(repayPtrIndex),
          approval_amount: uint256.bnToUint256(approval),
          user: starkUserAddress,
          context: borrowCtx,
        },
      });
      aggregatedTarget.push(reborrowInstruction);
      reborrowAuths.push(reborrowInstruction);
    });

    const pairInstructions = [
      [
        { protocol_name: sourceName, instructions: aggregatedSource },
        { protocol_name: targetName, instructions: aggregatedTarget },
      ],
    ];

    const authInstructions = [
      { protocol_name: sourceName, instructions: withdrawAuths },
      { protocol_name: targetName, instructions: reborrowAuths },
    ];

    const sanitizedAuths = authInstructions.filter(entry => entry.instructions.length > 0);

    return {
      pairInstructions,
      authInstructions: sanitizedAuths,
      authCalldataKey: sanitizedAuths.length
        ? JSON.stringify(CallData.compile({ instructions: sanitizedAuths, rawSelectors: false }))
        : "",
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


