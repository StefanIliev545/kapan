import { useMemo, useState, useEffect } from "react";
import { useAccount } from "~~/hooks/useAccount";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { useDeployedContractInfo, useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { useLendingAuthorizations, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { VESU_V1_POOLS, VESU_V2_POOLS } from "~~/components/specific/vesu/pools";
import { normalizeStarknetAddress } from "~~/utils/vesu";
import { parseUnits } from "viem";
import type { NetworkType } from "~~/hooks/useMovePositionData";
import { useDeepCompareMemo } from "./useDeepCompareMemo";

export type StarknetMoveParams = {
  isOpen: boolean;
  fromProtocol: string;
  toProtocol: string;
  selectedVersion: "v1" | "v2";
  debtAmount: string;
  isDebtMaxClicked: boolean;
  position: {
    tokenAddress: string;
    decimals: number;
    poolId?: bigint | string;
  };
  addedCollaterals: Record<string, string>;
  collateralIsMaxMap: Record<string, boolean>;
  collaterals: Array<{
    address: string;
    symbol: string;
    decimals: number;
    rawBalance: bigint;
    balance: number;
  }>;
  selectedPoolId: bigint;
  selectedV2PoolAddress: string;
};

export type StarknetMoveResult = {
  calls: any[];
  isLoadingAuths: boolean;
  sendAsync: (() => Promise<any>) | null;
  error: string | null;
};

const toOutputPointer = (instructionIndex: number) => ({
  instruction_index: BigInt(instructionIndex),
  output_index: 0n,
});

const addrKey = (a?: string) => (a ?? "").toLowerCase();

export const useStarknetMovePosition = (params: StarknetMoveParams): StarknetMoveResult => {
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
    const sortedAddedCollaterals = Object.entries(addedCollaterals)
      .map(([address, amount]) => [addrKey(address), amount] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const sortedCollateralMaxMap = Object.entries(collateralIsMaxMap)
      .map(([address, isMax]) => [addrKey(address), isMax] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const sortedCollaterals = collaterals
      .map(c => ({
        address: addrKey(c.address),
        symbol: c.symbol,
        decimals: c.decimals,
        rawBalance: c.rawBalance.toString(),
        balance: c.balance,
      }))
      .sort((a, b) => a.address.localeCompare(b.address));

    return JSON.stringify({
      isOpen,
      debtAmount,
      starkUserAddress,
      routerGatewayAddress: routerGateway?.address,
      fromProtocol,
      toProtocol,
      selectedVersion,
      positionToken: position.tokenAddress,
      positionDecimals: position.decimals,
      positionPoolId:
        position.poolId === undefined || position.poolId === null
          ? null
          : typeof position.poolId === "string"
            ? position.poolId.toLowerCase()
            : position.poolId.toString(),
      addedCollaterals: sortedAddedCollaterals,
      collateralMaxMap: sortedCollateralMaxMap,
      collaterals: sortedCollaterals,
      selectedPoolId: selectedPoolId !== undefined ? selectedPoolId.toString() : null,
      selectedV2PoolAddress,
      isDebtMaxClicked,
    });
  }, [
    isOpen,
    debtAmount,
    starkUserAddress,
    routerGateway?.address,
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
  ]);

  // Build Starknet instructions
  const { pairInstructions, authInstructions, authCalldataKey } = useDeepCompareMemo(() => {
    if (!isOpen || !debtAmount || !starkUserAddress || !routerGateway?.address) {
      return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
    }

    const tokenDecimals = position.decimals;
    const parsedAmount = parseUnits(debtAmount, tokenDecimals);
    
    // Normalize protocol names for Starknet
    const sourceProtocolName = fromProtocol === "VesuV2" ? "vesu_v2" : fromProtocol.toLowerCase();
    const targetProtocolName = toProtocol === "Vesu" 
      ? (selectedVersion === "v2" ? "vesu_v2" : "vesu")
      : toProtocol.toLowerCase();

    // Build contexts based on protocols
    let repayContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let withdrawContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let borrowContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let depositContext = new CairoOption<bigint[]>(CairoOptionVariant.None);

    const hasCollaterals = Object.keys(addedCollaterals).length > 0;

    // Source protocol context - always use position.poolId for source, never fall back to destination
    if (fromProtocol === "Vesu" && hasCollaterals) {
      if (!position.poolId) {
        console.error("Source pool ID is required for Vesu V1 positions");
        return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
      }
      const currentPoolId = typeof position.poolId === "string" ? BigInt(position.poolId) : position.poolId;
      const firstCollateral = Object.keys(addedCollaterals)[0];
      repayContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [currentPoolId, BigInt(firstCollateral)]);
      withdrawContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [currentPoolId, BigInt(position.tokenAddress)]);
    } else if (fromProtocol === "VesuV2" && hasCollaterals) {
      if (!position.poolId) {
        console.error("Source pool address is required for Vesu V2 positions");
        return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
      }
      const sourcePoolAddress = normalizeStarknetAddress(position.poolId);
      const firstCollateral = Object.keys(addedCollaterals)[0];
      repayContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [BigInt(sourcePoolAddress), BigInt(firstCollateral)]);
      withdrawContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [BigInt(sourcePoolAddress), BigInt(position.tokenAddress)]);
    }

    // Destination protocol context
    if (toProtocol === "Vesu" && hasCollaterals) {
      const firstCollateral = Object.keys(addedCollaterals)[0];
      if (selectedVersion === "v1") {
        borrowContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [selectedPoolId, BigInt(firstCollateral)]);
        depositContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [selectedPoolId, BigInt(position.tokenAddress)]);
      } else {
        borrowContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [BigInt(selectedV2PoolAddress), BigInt(firstCollateral)]);
        depositContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [BigInt(selectedV2PoolAddress), BigInt(position.tokenAddress)]);
      }
    } else if (toProtocol === "VesuV2" && hasCollaterals) {
      const firstCollateral = Object.keys(addedCollaterals)[0];
      borrowContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [BigInt(selectedV2PoolAddress), BigInt(firstCollateral)]);
      depositContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [BigInt(selectedV2PoolAddress), BigInt(position.tokenAddress)]);
    }

    const applyMaxBuffer = (amount: bigint, isMax: boolean) =>
      isMax ? (amount * BigInt(101)) / BigInt(100) : amount;
    const MAX_UINT256 = (1n << 256n) - 1n;
    // Match legacy behavior: +1.0% borrow allowance buffer (plus +1 to counter truncation)
    const addBorrowBuffer = (amount: bigint) => ((amount * 101n) / 100n) + 1n; // ~+1.0% buffer

    // MULTI-COLLATERAL: build per-pair instructions with correct contexts and pointers
    const entryList = Object.entries(addedCollaterals)
      .map(([addr, amt]) => ({ addrLower: addrKey(addr), amt }))
      .sort((a, b) => a.addrLower.localeCompare(b.addrLower));
    if (entryList.length > 1) {
      const n = BigInt(entryList.length);
      const share = parsedAmount / n;
      const remainder = parsedAmount - share * n;

      const pairs = entryList.map((e, idx) => {
        const meta = collaterals.find(c => addrKey(c.address) === e.addrLower);
        if (!meta) return null;
        const isLast = idx === entryList.length - 1;
        const repayAll = isDebtMaxClicked && isLast;
        const thisRepay = isLast ? (repayAll ? parsedAmount - share * BigInt(entryList.length - 1) : share + remainder) : share;

        // Source contexts per collateral on Vesu/V2
        let srcPool: bigint | null = null;
        if (fromProtocol === "Vesu") {
          const currentPoolId = typeof position.poolId === "string" ? BigInt(position.poolId) : (position.poolId ?? 0n);
          srcPool = currentPoolId;
        } else if (fromProtocol === "VesuV2") {
          const sourcePoolAddress = BigInt(normalizeStarknetAddress(position.poolId ?? selectedV2PoolAddress));
          srcPool = sourcePoolAddress;
        }
        const repayCtx =
          srcPool !== null
            ? new CairoOption<bigint[]>(CairoOptionVariant.Some, [srcPool, BigInt(meta.address)])
            : new CairoOption<bigint[]>(CairoOptionVariant.None);
        const withdrawCtx =
          srcPool !== null
            ? new CairoOption<bigint[]>(CairoOptionVariant.Some, [srcPool, BigInt(position.tokenAddress)])
            : new CairoOption<bigint[]>(CairoOptionVariant.None);

        const repayInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: {
            basic: {
              token: position.tokenAddress,
              amount: uint256.bnToUint256(thisRepay),
              user: starkUserAddress,
            },
            repay_all: repayAll,
            context: repayCtx,
          },
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        });

        const isMax = collateralIsMaxMap[e.addrLower] === true;
        const requested = isMax ? meta.rawBalance : parseUnits(e.amt || "0", meta.decimals);
        const upped = applyMaxBuffer(requested, isMax);
        const withdrawInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: {
            basic: {
              token: meta.address,
              amount: uint256.bnToUint256(upped),
              user: starkUserAddress,
            },
            withdraw_all: isMax,
            context: withdrawCtx,
          },
          Redeposit: undefined,
          Reborrow: undefined,
        });

        // Target (Nostra) contexts none
        const depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.None);
        const borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.None);

        const repayPtr = toOutputPointer(0);   // within this pair
        const withdrawPtr = toOutputPointer(1);

        const redepositInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: {
            token: meta.address,
            target_output_pointer: withdrawPtr,
            user: starkUserAddress,
            context: depositCtx,
          },
          Reborrow: undefined,
        });

        // Reborrow approval must allow slight interest/rounding; use MAX on repay_all, else apply small buffer
        const approval = repayAll ? MAX_UINT256 : addBorrowBuffer(thisRepay);
        const reborrowInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: {
            token: position.tokenAddress,
            target_output_pointer: repayPtr,
            approval_amount: uint256.bnToUint256(approval),
            user: starkUserAddress,
            context: borrowCtx,
          },
        });

        return [
          { protocol_name: sourceProtocolName, instructions: [repayInstruction, withdrawInstruction] },
          { protocol_name: targetProtocolName, instructions: [redepositInstruction, reborrowInstruction] },
        ];
      }).filter(Boolean) as Array<{ protocol_name: string; instructions: CairoCustomEnum[] }[]>;

      // Build auths from the same constructed instructions to preserve approval_amounts
      const auths = pairs.flatMap(pair => {
        const src = pair[0].instructions;
        const dst = pair[1].instructions;
        const withdrawInstr = src[1]; // [Repay, Withdraw]
        const reborrowInstr = dst[1]; // [Redeposit, Reborrow]
        return [
          { protocol_name: sourceProtocolName, instructions: [withdrawInstr] },
          { protocol_name: targetProtocolName, instructions: [reborrowInstr] },
        ];
      });

      return {
        pairInstructions: pairs,
        authInstructions: auths,
        authCalldataKey: JSON.stringify(CallData.compile({ instructions: auths, rawSelectors: false })),
      };
    }

    // Build repay instruction (single-collateral)
    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: {
          token: position.tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: starkUserAddress,
        },
        repay_all: isDebtMaxClicked,
        context: repayContext,
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
    });

    // Build withdraw instructions for collaterals
    const withdrawInstructions = Object.entries(addedCollaterals)
      .map(([addr, amt]) => {
        const meta = collaterals.find(c => addrKey(c.address) === addrKey(addr));
        if (!meta) return null;
        
        const isMax = collateralIsMaxMap[addr] === true;
        const amount = isMax ? meta.rawBalance : parseUnits(amt, meta.decimals);
        const uppedAmount = applyMaxBuffer(amount, isMax);
        
        return new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: {
            basic: {
              token: addr,
              amount: uint256.bnToUint256(uppedAmount),
              user: starkUserAddress,
            },
            withdraw_all: isMax,
            context: withdrawContext,
          },
          Redeposit: undefined,
          Reborrow: undefined,
        });
      })
      .filter(Boolean) as CairoCustomEnum[];

    // Build deposit instructions
    const depositInstructions = Object.keys(addedCollaterals).map((addr, index) => {
      return new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: undefined,
        Redeposit: {
          token: addr,
          target_output_pointer: toOutputPointer(1 + index),
          user: starkUserAddress,
          context: depositContext,
        },
        Reborrow: undefined,
      });
    });

    // Build borrow instruction
    const borrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: {
        token: position.tokenAddress,
        target_output_pointer: toOutputPointer(0),
        approval_amount: uint256.bnToUint256(isDebtMaxClicked ? MAX_UINT256 : addBorrowBuffer(parsedAmount)),
        user: starkUserAddress,
        context: borrowContext,
      },
    });

    const instructions = [
      {
        protocol_name: sourceProtocolName,
        instructions: [repayInstruction, ...withdrawInstructions],
      },
      {
        protocol_name: targetProtocolName,
        instructions: [...depositInstructions, borrowInstruction],
      },
    ];

    const authInstructions = [
      {
        protocol_name: sourceProtocolName,
        instructions: withdrawInstructions,
      },
      {
        protocol_name: targetProtocolName,
        instructions: [borrowInstruction],
      },
    ];

    return {
      pairInstructions: [instructions],
      authInstructions,
      authCalldataKey: JSON.stringify(CallData.compile({ instructions: authInstructions, rawSelectors: false })),
    };
  }, [paramsKey]);

  // Fetch authorizations
  useEffect(() => {
    if (!isOpen || !isAuthReady || !authInstructions || authInstructions.length === 0 || !authCalldataKey) {
      setFetchedAuthorizations([]);
      setAuthError(null);
      setIsLoadingAuths(false);
      return;
    }

    let cancelled = false;
    const fetchAuths = async () => {
      try {
        setIsLoadingAuths(true);
        setAuthError(null);
        const auths = await getAuthorizations(authInstructions as any);
        if (!cancelled) {
          setFetchedAuthorizations(auths);
        }
      } catch (e: any) {
        if (!cancelled) {
          setFetchedAuthorizations([]);
          setAuthError(e.message || "Failed to fetch authorizations");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAuths(false);
        }
      }
    };

    fetchAuths();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, authInstructions, authCalldataKey]);

  // Build calls
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

// Helper hook for Vesu pool management
export const useVesuPools = (networkType: NetworkType, fromProtocol: string, positionPoolId?: bigint | string) => {
  const [selectedPoolId, setSelectedPoolId] = useState<bigint>(VESU_V1_POOLS["Genesis"]);
  const [selectedV2PoolAddress, setSelectedV2PoolAddress] = useState<string>(VESU_V2_POOLS["Prime"]);

  // Normalize current V2 pool address
  const normalizedCurrentV2PoolAddress = useMemo(() => {
    if (fromProtocol !== "VesuV2" || !positionPoolId) return undefined;
    try {
      return normalizeStarknetAddress(positionPoolId);
    } catch {
      return undefined;
    }
  }, [fromProtocol, positionPoolId]);

  // Initialize pool selections
  useEffect(() => {
    if (networkType !== "starknet") return;

    if (fromProtocol === "VesuV2" && normalizedCurrentV2PoolAddress) {
      setSelectedV2PoolAddress(prev =>
        prev === normalizedCurrentV2PoolAddress ? prev : normalizedCurrentV2PoolAddress,
      );
    }
  }, [networkType, fromProtocol, normalizedCurrentV2PoolAddress]);

  return {
    selectedPoolId,
    setSelectedPoolId,
    selectedV2PoolAddress,
    setSelectedV2PoolAddress,
    normalizedCurrentV2PoolAddress,
    vesuPools: {
      v1Pools: Object.entries(VESU_V1_POOLS).map(([name, id]) => ({ name: name as keyof typeof VESU_V1_POOLS, id })),
      v2Pools: Object.entries(VESU_V2_POOLS).map(([name, address]) => ({ name: name as keyof typeof VESU_V2_POOLS, address })),
    },
  };
};

