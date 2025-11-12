import { useMemo, useState, useEffect } from "react";
import { CallData } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { useDeployedContractInfo, useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { useLendingAuthorizations, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { parseUnits } from "viem";
import { useSelectedCollaterals } from "~~/hooks/kapan/useSelectedCollaterals";
import { usePriceMap } from "~~/hooks/kapan/usePrices";
import { useDebtAllocations } from "~~/hooks/kapan/useDebtAllocations";
import { buildMoveInstructions } from "~~/hooks/kapan/buildMoveInstructions";

type LegacyParams = {
  /** Whether the modal/dialog is currently open - used to enable/disable contract reads */
  isOpen: boolean;
  /** Source protocol name (e.g., "Vesu", "VesuV2", "Nostra") - where the debt position currently exists */
  fromProtocol: string;
  /** Target protocol name (e.g., "Vesu", "VesuV2", "Nostra") - where the debt will be moved to */
  toProtocol: string;
  /** Selected version for Vesu protocol ("v1" or "v2") - determines which pool structure to use */
  selectedVersion: "v1" | "v2";
  /** Debt amount as a string (e.g., "1000.5") - the amount of debt to move, in human-readable format */
  debtAmount: string;
  /** Whether the user clicked "MAX" for debt amount - if true, moves all available debt */
  isDebtMaxClicked: boolean;
  /** Current debt position information */
  position: {
    /** Address of the debt token (e.g., USDC, DAI) */
    tokenAddress: string;
    /** Number of decimals for the debt token (e.g., 18 for ETH, 6 for USDC) */
    decimals: number;
    /** Pool ID for Vesu protocols (v1 uses bigint, v2 uses address string) */
    poolId?: bigint | string;
  };
  /**
   * Map of collateral addresses to their amounts (as strings).
   * Key: collateral token address (case-insensitive, normalized to lowercase)
   * Value: amount string in human-readable format (e.g., "100.5")
   * 
   * Example: { "0x123...": "100.5", "0x456...": "50.0" }
   * Represents the collaterals the user wants to move along with the debt.
   */
  addedCollaterals: Record<string, string>;
  /**
   * Map indicating which collaterals have "MAX" clicked.
   * Key: collateral token address (case-insensitive, normalized to lowercase)
   * Value: true if user clicked MAX for this collateral, false otherwise
   * 
   * When true, the hook will:
   * - Use the full rawBalance for that collateral
   * - Apply a 1% buffer to counter truncation errors
   * - Set withdraw_all flag to true in the contract call
   * 
   * Example: { "0x123...": true, "0x456...": false }
   */
  collateralIsMaxMap: Record<string, boolean>;
  /**
   * Array of all available collateral tokens with their metadata.
   * Used to look up token details (decimals, balances) when processing addedCollaterals.
   * Each collateral includes:
   * - address: token contract address
   * - symbol: token symbol (e.g., "ETH", "USDC")
   * - decimals: number of decimals for the token
   * - rawBalance: full precision balance as bigint (e.g., 1000000000000000000n for 1 ETH)
   * - balance: human-readable balance as number (e.g., 1.0)
   */
  collaterals: Array<{ address: string; symbol: string; decimals: number; rawBalance: bigint; balance: number }>;
  /** Selected pool ID for Vesu v1 - the pool where debt will be moved to */
  selectedPoolId: bigint;
  /** Selected pool address for Vesu v2 - the pool contract address where debt will be moved to */
  selectedV2PoolAddress: string;
};

type LegacyResult = {
  calls: any[];
  isLoadingAuths: boolean;
  sendAsync: (() => Promise<any>) | null;
  error: string | null;
};

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

  // 1) Filter and normalize selected collaterals
  const selected = useSelectedCollaterals(
    addedCollaterals,
    collateralIsMaxMap,
    collaterals,
    toProtocol,
    position.tokenAddress,
  );

  // 2) Fetch prices for selected collaterals + debt token
  const priceAddrs = useMemo(
    () => [...selected.map(s => s.address), position.tokenAddress],
    [selected, position.tokenAddress],
  );

  const { priceByAddress } = usePriceMap(
    priceAddrs,
    isOpen,
    30000,
  );

  // 3) Calculate debt allocations
  const parsedDebt = parseUnits(debtAmount || "0", position.decimals);
  const { rows, lastNonZeroIndex } = useDebtAllocations(
    selected,
    priceByAddress,
    parsedDebt,
    isDebtMaxClicked,
  );

  // 4) Pure function: Cairo-specific instruction building
  const { pairInstructions, authInstructions, authCalldataKey } = useMemo(() => {
    if (!isOpen || !debtAmount || !starkUserAddress || !routerGateway?.address || rows.length === 0) {
      return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
    }

    return buildMoveInstructions({
      rows,
      lastNonZeroIndex,
      fromProtocol,
      toProtocol,
      selectedVersion,
      position,
      selectedPoolId,
      selectedV2PoolAddress,
      starkUserAddress,
      isDebtMaxClicked,
    });
  }, [
    isOpen,
    debtAmount,
    starkUserAddress,
    routerGateway?.address,
    rows,
    lastNonZeroIndex,
    fromProtocol,
    toProtocol,
    selectedVersion,
    position,
    selectedPoolId,
    selectedV2PoolAddress,
    isDebtMaxClicked,
  ]);

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
    const combinedInstructions = pairInstructions.flat();
    const moveCalls = [
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: CallData.compile({ instructions: combinedInstructions }),
      }
    ];
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


