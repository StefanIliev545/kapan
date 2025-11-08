import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import Image from "next/image";
import { useAccount } from "~~/hooks/useAccount";
import { useReadContract } from "@starknet-react/core";
import { FiAlertTriangle, FiCheck, FiLock } from "react-icons/fi";
import { FaGasPump } from "react-icons/fa";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, num, uint256 } from "starknet";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { formatUnits, parseUnits } from "viem";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { CollateralAmounts } from "~~/components/specific/collateral/CollateralAmounts";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import {
  useDeployedContractInfo,
  useScaffoldMultiWriteContract,
  useScaffoldReadContract,
} from "~~/hooks/scaffold-stark";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import { getProtocolLogo } from "~~/utils/protocol";
import { feltToString } from "~~/utils/protocols";
import { VESU_V1_POOLS, VESU_V2_POOLS, getV1PoolNameFromId, getV2PoolNameFromAddress } from "../../specific/vesu/pools";
import { useLendingAuthorizations, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { normalizeStarknetAddress } from "~~/utils/vesu";

// Format number with thousands separators for display
const formatDisplayNumber = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(num);
};

// Define the step type for tracking the move flow
type MoveStep = "idle" | "executing" | "done";

// Use centralized pools from pools.ts

type OutputPointer = { instruction_index: bigint; output_index: bigint };

const toOutputPointer = (instructionIndex: number): OutputPointer => ({
  instruction_index: BigInt(instructionIndex),
  output_index: 0n,
});

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: "Nostra" | "Vesu" | "VesuV2";
  position: {
    name: string;
    balance: bigint; // USD value (display only)
    type: "supply" | "borrow";
    tokenAddress: string;
    decimals: number; // Add decimals for proper amount parsing
    poolId?: bigint; // Add current pool ID
  };
  preSelectedCollaterals?: CollateralWithAmount[];
  disableCollateralSelection?: boolean;
}

type VesuContextV1 = {
  pool_id: bigint;
  counterpart_token: string;
};

type VesuContextV2 = {
  pool_address: string;
  position_counterpart_token: string;
};

type FlashLoanProvider = {
  name: "Vesu";
  icon: string;
  version: "v1";
};

const FLASH_LOAN_PROVIDER: FlashLoanProvider = {
  name: "Vesu",
  icon: "/logos/vesu.svg",
  version: "v1",
} as const;

// V2 pool selection handled via VESU_V2_POOLS

export const MovePositionModal: FC<MovePositionModalProps> = ({
  isOpen,
  onClose,
  fromProtocol,
  position,
  preSelectedCollaterals,
  disableCollateralSelection,
}) => {
  const { address: userAddress } = useAccount();
  const protocols = useMemo(() => [{ name: "Nostra" }, { name: "Vesu" }, { name: "VesuV2" }], []);
  const { tokenAddress, decimals, type, name, balance, poolId: currentPoolId } = position;

  const [selectedProtocol, setSelectedProtocol] = useState(
    () => protocols.find(p => p.name !== fromProtocol)?.name || "",
  );
  const [selectedPoolId, setSelectedPoolId] = useState<bigint>(VESU_V1_POOLS["Genesis"]);
  const [selectedV2PoolAddress, setSelectedV2PoolAddress] = useState<string>(VESU_V2_POOLS["Prime"]);
  const [amount, setAmount] = useState("");
  const [isAmountMaxClicked, setIsAmountMaxClicked] = useState(false);
  const amountRef = useRef("");

  const normalizedCurrentV2PoolAddress = useMemo(() => {
    if (fromProtocol !== "VesuV2" || currentPoolId === undefined) {
      return undefined;
    }

    try {
      return normalizeStarknetAddress(currentPoolId);
    } catch (error) {
      console.error("Failed to normalize current V2 pool address", error);
      return undefined;
    }
  }, [fromProtocol, currentPoolId]);
  
  // Preserve amount value across re-renders caused by collateral data changes
  useEffect(() => {
    if (amount) {
      amountRef.current = amount;
    }
  }, [amount]);
  
  // Restore amount from ref if it gets reset unexpectedly
  useEffect(() => {
    if (!amount && amountRef.current && isOpen) {
      setAmount(amountRef.current);
    }
  }, [isOpen, amount]);
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] =
    useState<CollateralWithAmount[]>([]);
  const [maxClickedCollaterals, setMaxClickedCollaterals] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<LendingAuthorization[]>([]);

  const { collaterals: sourceCollaterals, isLoading: isLoadingSourceCollaterals } = useCollateral({
    protocolName: fromProtocol as "Vesu" | "VesuV2" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !(disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu"),
  });

  const { collaterals: targetCollaterals, isLoading: isLoadingTargetCollaterals } = useCollateral({
    protocolName: selectedProtocol as "Vesu" | "VesuV2" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !!selectedProtocol,
  });

  // Track first load completion (never reset) to avoid spinner after initial data is shown
  const firstCollateralsReadyRef = useRef(false);
  useEffect(() => {
    if (
      (disableCollateralSelection && preSelectedCollaterals && (fromProtocol === "Vesu" || fromProtocol === "VesuV2")) ||
      (!isLoadingSourceCollaterals && !isLoadingTargetCollaterals)
    ) {
      firstCollateralsReadyRef.current = true;
    }
  }, [
    disableCollateralSelection,
    preSelectedCollaterals,
    fromProtocol,
    isLoadingSourceCollaterals,
    isLoadingTargetCollaterals,
  ]);

  const collateralsForSelector = useMemo(() => {
    if (disableCollateralSelection && preSelectedCollaterals && (fromProtocol === "Vesu" || fromProtocol === "VesuV2")) {
      return preSelectedCollaterals.map(collateral => ({
        symbol: collateral.symbol,
        balance: Number(collateral.inputValue || collateral.amount.toString()),
        address: collateral.token,
        decimals: collateral.decimals,
        rawBalance: collateral.amount,
        supported: true,
      }));
    }

    let filtered = sourceCollaterals.filter(c => c.balance > 0);
    if (fromProtocol === "Nostra" && (selectedProtocol === "Vesu" || selectedProtocol === "VesuV2") && type === "borrow") {
      filtered = filtered.filter(c => c.address.toLowerCase() !== tokenAddress.toLowerCase());
    }

    return targetCollaterals.length > 0
      ? filtered.map(collateral => ({
          ...collateral,
          supported: targetCollaterals.some(tc => tc.address.toLowerCase() === collateral.address.toLowerCase()),
        }))
      : filtered;
  }, [
    sourceCollaterals,
    targetCollaterals,
    preSelectedCollaterals,
    disableCollateralSelection,
    fromProtocol,
    selectedProtocol,
    type,
    tokenAddress,
  ]);

  const { data: tokenPrices } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [[...collateralsForSelector.map(c => c.address), tokenAddress]],
    refetchInterval: 30000, // Reduced from 5s to 30s
    enabled: !!collateralsForSelector.length && isOpen,
  });

  const { tokenToPrices } = useMemo(() => {
    if (!tokenPrices) return { tokenToPrices: {} };
    const prices = tokenPrices as unknown as bigint[];
    const addresses = [...collateralsForSelector.map(c => c.address), tokenAddress];
    return {
      tokenToPrices: prices.reduce(
        (acc, price, index) => ({
          ...acc,
          [addresses[index]]: price / 10n ** 10n,
        }),
        {} as Record<string, bigint>,
      ),
    };
  }, [tokenPrices, collateralsForSelector, tokenAddress]);

  const debtUsdValue = useMemo(() => {
    if (!amount) return 0;
    const price = tokenToPrices[tokenAddress.toLowerCase()];
    const usdPerToken = price ? Number(formatUnits(price, 8)) : 0;
    return parseFloat(amount) * usdPerToken;
  }, [amount, tokenToPrices, tokenAddress]);

  const totalCollateralUsd = useMemo(
    () =>
      selectedCollateralsWithAmounts.reduce((sum, c) => {
        const price = tokenToPrices[c.token.toLowerCase()];
        const normalized = Number(formatUnits(c.amount, c.decimals));
        const usd = price ? normalized * Number(formatUnits(price, 8)) : 0;
        return sum + usd;
      }, 0),
    [selectedCollateralsWithAmounts, tokenToPrices],
  );

  // Spinner only before first successful data render
  const isLoadingCollaterals =
    !firstCollateralsReadyRef.current && (isLoadingSourceCollaterals || isLoadingTargetCollaterals);
  // Construct instruction based on current state
  const { authInstructions, authCalldataKey, pairInstructions } = useMemo(() => {
    if (!amount || !userAddress || !routerGateway?.address)
      return { authInstructions: [], authCalldataKey: "", pairInstructions: [] };

    const tokenDecimals = position.decimals ?? 18; // Use position decimals if available, otherwise default to 18
    const parsedAmount = parseUnits(amount, tokenDecimals);
    const lowerProtocolName = fromProtocol === "VesuV2" ? "vesu_v2" : fromProtocol.toLowerCase();
    const destProtocolName = selectedProtocol === "VesuV2" ? "vesu_v2" : selectedProtocol.toLowerCase();

    // Calculate proportions for multiple collaterals
    if (selectedCollateralsWithAmounts.length > 1) {
      // Calculate USD values for each collateral using actual token prices from tokenToPrices
      const collateralUsdValues = selectedCollateralsWithAmounts.map(collateral => {
        // Convert BigInt amount to a normalized value based on decimals
        const tokenDecimals = collateral.decimals || 18;
        const normalizedAmount = Number(formatUnits(collateral.amount, tokenDecimals));

        // Get token price from tokenToPrices
        const tokenPrice = tokenToPrices[collateral.token.toLowerCase()];

        // Calculate actual USD value using price if available
        let usdValue = normalizedAmount; // Fallback to normalized amount
        if (tokenPrice) {
          // According to the implementation, tokenPrice is already normalized (divided by 10^10)
          usdValue = normalizedAmount * Number(formatUnits(tokenPrice, 8));
        }

        return {
          token: collateral.token,
          symbol: collateral.symbol,
          amount: collateral.amount,
          decimals: tokenDecimals,
          price: tokenPrice || 0n,
          usdValue: usdValue,
        };
      });

      // Calculate total USD value
      const totalUsdValue = collateralUsdValues.reduce((sum, collateral) => sum + collateral.usdValue, 0);

      // Store original debt amount
      const totalDebtAmount = parsedAmount;

      // Calculate proportion for each collateral based on USD values
      const proportions = collateralUsdValues.map(collateral => {
        // Calculate proportion with high precision (as basis points - 1/10000)
        const proportionBps = totalUsdValue > 0 ? Math.floor((collateral.usdValue / totalUsdValue) * 10000) : 0;

        // Calculate debt amount for this collateral based on proportion
        const debtAmountForCollateral =
          totalUsdValue > 0 ? (totalDebtAmount * BigInt(proportionBps)) / BigInt(10000) : 0n;

        return {
          token: collateral.token,
          symbol: collateral.symbol,
          proportionBps,
          proportion: proportionBps / 10000,
          priceUsd: collateral.price ? Number(formatUnits(collateral.price, 8)) : 0,
          usdValue: collateral.usdValue,
          debtAmount: debtAmountForCollateral,
          debtAmountFormatted: formatUnits(debtAmountForCollateral, tokenDecimals),
        };
      });

      // Ensure we allocate 100% of the debt by assigning any remainder to the first collateral
      const allocatedDebtSum = proportions.reduce((sum, p) => sum + p.debtAmount, 0n);
      const remainder = parsedAmount - allocatedDebtSum;

      if (remainder > 0 && proportions.length > 0) {
        proportions[0].debtAmount += remainder;
        proportions[0].debtAmountFormatted = formatUnits(proportions[0].debtAmount, tokenDecimals);
      }
    }

    // Function to generate Vesu instructions with proportional debt allocation
    const generateVesuInstructions = () => {
      // Only generate proportional instructions if we have multiple collaterals
      if (selectedCollateralsWithAmounts.length <= 1) {
        return null;
      }

      // Calculate USD values and proportions for each collateral
      const collateralUsdValues = selectedCollateralsWithAmounts.map(collateral => {
        const tokenDecimals = collateral.decimals || 18;
        const normalizedAmount = Number(formatUnits(collateral.amount, tokenDecimals));
        const tokenPrice = tokenToPrices[collateral.token.toLowerCase()];

        let usdValue = normalizedAmount;
        if (tokenPrice) {
          usdValue = normalizedAmount * Number(formatUnits(tokenPrice, 8));
        }

        return {
          token: collateral.token,
          amount: collateral.amount,
          decimals: tokenDecimals,
          usdValue,
        };
      });

      const totalUsdValue = collateralUsdValues.reduce((sum, c) => sum + c.usdValue, 0);

      // Calculate debt allocation based on proportions
      const debtAllocations = collateralUsdValues.map(collateral => {
        const proportionBps = totalUsdValue > 0 ? Math.floor((collateral.usdValue / totalUsdValue) * 10000) : 0;

        return {
          token: collateral.token,
          proportionBps,
          debtAmount: totalUsdValue > 0 ? (parsedAmount * BigInt(proportionBps)) / BigInt(10000) : 0n,
        };
      });

      // Ensure 100% allocation
      const totalAllocated = debtAllocations.reduce((sum, a) => sum + a.debtAmount, 0n);
      const remainder = parsedAmount - totalAllocated;

      if (remainder > 0 && debtAllocations.length > 0) {
        debtAllocations[0].debtAmount += remainder;
      }

      // For each collateral and its debt allocation, create redeposit + reborrow instructions
      const instructions = debtAllocations.map((allocation, index) => {
        // Skip if no debt allocated
        if (allocation.debtAmount <= 0n) return [];

        // Find the corresponding collateral from selectedCollateralsWithAmounts
        const collateral = selectedCollateralsWithAmounts.find(c => c.token === allocation.token);
        if (!collateral) return [];

        const isCollateralMaxClicked = maxClickedCollaterals[collateral.token] || false;
        const uppedAmount = isCollateralMaxClicked
          ? (collateral.amount * BigInt(101)) / BigInt(100)
          : collateral.amount;

        // Create context with paired tokens for Vesu (V1 or V2)
        const poolIdOrAddress = selectedProtocol === "VesuV2" ? BigInt(selectedV2PoolAddress) : 0n;
        const contextRedeposit = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          poolIdOrAddress,
          BigInt(position.tokenAddress),
        ]);
        const contextReborrow = new CairoOption<bigint[]>(CairoOptionVariant.Some, [poolIdOrAddress, BigInt(collateral.token)]);
        const repayAll = isAmountMaxClicked && index === debtAllocations.length - 1;
        const nostraInstructions = [
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: {
              basic: {
                token: position.tokenAddress,
                amount: uint256.bnToUint256(allocation.debtAmount),
                user: userAddress,
              },
              repay_all: repayAll,
              context: new CairoOption<bigint[]>(CairoOptionVariant.None),
            },
            Withdraw: undefined,
            Redeposit: undefined,
            Reborrow: undefined,
          }),
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: {
              basic: {
                token: collateral.token,
                amount: uint256.bnToUint256(uppedAmount),
                user: userAddress,
              },
              withdraw_all: isCollateralMaxClicked,
              context: new CairoOption<bigint[]>(CairoOptionVariant.None),
            },
            Redeposit: undefined,
            Reborrow: undefined,
          }),
        ];

        const vesuInstructions = [
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: undefined,
            Redeposit: {
              token: collateral.token,
              target_output_pointer: toOutputPointer(1), // Point to corresponding withdraw instruction (offset by repay instruction)
              user: userAddress,
              context: contextRedeposit,
            },
            Reborrow: undefined,
          }),
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: undefined,
            Redeposit: undefined,
            Reborrow: {
              token: position.tokenAddress,
              target_output_pointer: toOutputPointer(0), // Point to repay instruction
              approval_amount: uint256.bnToUint256((allocation.debtAmount * BigInt(101)) / BigInt(100)), // Add 1% buffer
              user: userAddress,
              context: contextReborrow,
            },
          }),
        ];
        return [
          {
            protocol_name: lowerProtocolName,
            instructions: nostraInstructions,
          },
          {
            protocol_name: destProtocolName,
            instructions: vesuInstructions,
          },
        ];
      });
      // Compile the instructions
      const fullInstructionData = CallData.compile({
        instructions: instructions.flat(),
      });

      const filteredForAuth = instructions.flat().map(protocolInstruction => {
        const filteredInstructions = protocolInstruction.instructions.filter(instruction => {
          if (instruction.activeVariant() === "Withdraw" || instruction.activeVariant() === "Reborrow") {
            return true;
          }
          return false;
        });
        return { protocol_name: protocolInstruction.protocol_name, instructions: filteredInstructions };
      });

      const authInstructionData = CallData.compile({
        instructions: filteredForAuth,
        rawSelectors: false,
      });

      return {
        authInstructions: filteredForAuth,
        authCalldataKey: JSON.stringify(authInstructionData),
        pairInstructions: instructions,
      };
    };

    // If target protocol is Vesu (V1 or V2) and we have multiple collaterals, use proportional allocation
    if ((selectedProtocol === "Vesu" || selectedProtocol === "VesuV2") && selectedCollateralsWithAmounts.length > 1) {
      const result = generateVesuInstructions() || {
        authInstructions: [],
        authCalldataKey: "",
        pairInstructions: [],
      };
      return result;
    }

    // Otherwise, use the original approach for other protocols or single collateral
    let repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    
    // Handle V1 Vesu context
    if (fromProtocol === "Vesu" && selectedCollateralsWithAmounts.length > 0) {
      repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        currentPoolId || 0n,
        BigInt(selectedCollateralsWithAmounts[0].token),
      ]);
      withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        currentPoolId || 0n,
        BigInt(position.tokenAddress),
      ]);
    }
    
    // Handle V2 Vesu context
    if (fromProtocol === "VesuV2" && selectedCollateralsWithAmounts.length > 0) {
      const sourcePoolAddress = normalizedCurrentV2PoolAddress ?? selectedV2PoolAddress;
      repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(sourcePoolAddress),
        BigInt(selectedCollateralsWithAmounts[0].token),
      ]);
      withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(sourcePoolAddress),
        BigInt(position.tokenAddress),
      ]);
    }

    let borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);

    // Handle V1 Vesu target context
    if (selectedProtocol === "Vesu" && selectedCollateralsWithAmounts.length > 0) {
      borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        selectedPoolId,
        BigInt(selectedCollateralsWithAmounts[0].token),
      ]);
      depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        selectedPoolId,
        BigInt(position.tokenAddress),
      ]);
    }
    
    // Handle V2 Vesu target context
    if (selectedProtocol === "VesuV2" && selectedCollateralsWithAmounts.length > 0) {
      borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(selectedV2PoolAddress),
        BigInt(selectedCollateralsWithAmounts[0].token),
      ]);
      depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(selectedV2PoolAddress),
        BigInt(position.tokenAddress),
      ]);
    }

    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: {
          token: position.tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: userAddress,
        },
        repay_all: isAmountMaxClicked,
        context: repayInstructionContext,
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
    });

    // Auth instructions only need withdraw and borrow
    const withdrawInstructions = selectedCollateralsWithAmounts.map(collateral => {
      // Check if MAX was clicked for this collateral
      const isCollateralMaxClicked = maxClickedCollaterals[collateral.token] || false;
      // Add 1% buffer if MAX was clicked for this collateral
      const uppedAmount = isCollateralMaxClicked ? (collateral.amount * BigInt(101)) / BigInt(100) : collateral.amount;
      const amount = uint256.bnToUint256(uppedAmount);

      return new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: {
          basic: {
            token: collateral.token,
            amount: amount,
            user: userAddress,
          },
          withdraw_all: isCollateralMaxClicked,
          context: withdrawInstructionContext,
        },
        Redeposit: undefined,
        Reborrow: undefined,
      });
    });

    const depositInstructions = selectedCollateralsWithAmounts.map((collateral, index) => {
      return new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: undefined,
        Redeposit: {
          token: collateral.token,
          target_output_pointer: toOutputPointer(1 + index),
          user: userAddress,
          context: depositInstructionContext,
        },
        Reborrow: undefined,
      });
    });

    const borrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: {
        token: position.tokenAddress,
        target_output_pointer: toOutputPointer(0),
        approval_amount: uint256.bnToUint256((parsedAmount * BigInt(101)) / BigInt(100)),
        user: userAddress,
        context: borrowInstructionContext,
      },
    });

    const instructions = [
      {
        protocol_name: lowerProtocolName,
        instructions: [repayInstruction, ...withdrawInstructions],
      },
      {
        protocol_name: destProtocolName,
        instructions: [...depositInstructions, borrowInstruction],
      },
    ]

    // Complete set of instructions for execution
    const fullInstructionData = CallData.compile({
      instructions: instructions,
    });

    const authInstructions = [
      {
        protocol_name: lowerProtocolName,
        instructions: [...withdrawInstructions],
      },
      
      {
        protocol_name: destProtocolName,
        instructions: [borrowInstruction],
      },
    ];
    if (isOpen) {
      console.log("authInstructions", authInstructions);
      console.log("fullInstructions", instructions);
    }
    
    // Only withdraw and borrow instructions for authorization
    const authInstructionData = CallData.compile({
      instructions: authInstructions,
      rawSelectors: false,
    });

    return {
      authInstructions: authInstructions,
      authCalldataKey: JSON.stringify(authInstructionData),
      // Wrap instructions in an array so that callers always
      // receive a list of instruction pairs. This ensures we
      // execute a single move_debt call when moving between
      // Vesu and Nostra while still supporting multiple calls
      // for scenarios that require it (e.g. Nostra -> Vesu with
      // several collaterals).
      pairInstructions: [instructions],
    };
  }, [amount, userAddress, routerGateway?.address, position.decimals, position.tokenAddress, fromProtocol, selectedProtocol, selectedCollateralsWithAmounts, isAmountMaxClicked, tokenToPrices, maxClickedCollaterals, currentPoolId, selectedPoolId, normalizedCurrentV2PoolAddress, selectedV2PoolAddress, isOpen]);

  const vesuPairings = useMemo(() => {
    if (
      fromProtocol !== "Nostra" ||
      selectedProtocol !== "Vesu" ||
      !amount ||
      selectedCollateralsWithAmounts.length === 0
    ) {
      return [] as (CollateralWithAmount & { debtAmount: bigint })[];
    }

    try {
      const tokenDecimals = position.decimals ?? 18;
      const parsedAmount = parseUnits(amount, tokenDecimals);

      const collateralUsdValues = selectedCollateralsWithAmounts.map(collateral => {
        const tokenDecimals = collateral.decimals || 18;
        const normalizedAmount = Number(formatUnits(collateral.amount, tokenDecimals));
        const tokenPrice = tokenToPrices[collateral.token.toLowerCase()];

        let usdValue = normalizedAmount;
        if (tokenPrice) {
          usdValue = normalizedAmount * Number(formatUnits(tokenPrice, 8));
        }

        return {
          ...collateral,
          usdValue,
        };
      });

      const totalUsdValue = collateralUsdValues.reduce((sum, c) => sum + c.usdValue, 0);

      const allocations = collateralUsdValues.map(collateral => {
        const proportionBps = totalUsdValue > 0 ? Math.floor((collateral.usdValue / totalUsdValue) * 10000) : 0;
        const debtAmount = totalUsdValue > 0 ? (parsedAmount * BigInt(proportionBps)) / BigInt(10000) : 0n;
        return { ...collateral, debtAmount };
      });

      const allocatedSum = allocations.reduce((sum, a) => sum + a.debtAmount, 0n);
      const remainder = parsedAmount - allocatedSum;
      if (remainder > 0n && allocations.length > 0) {
        allocations[0].debtAmount += remainder;
      }

      return allocations;
    } catch {
      return [] as (CollateralWithAmount & { debtAmount: bigint })[];
    }
  }, [fromProtocol, selectedProtocol, amount, selectedCollateralsWithAmounts, tokenToPrices, position.decimals]);

  // Get authorizations for the instructions
  useEffect(() => {
    let cancelled = false;
    const fetchAuths = async () => {
      try {
        if (!isOpen || !isAuthReady || !authInstructions || (Array.isArray(authInstructions) && authInstructions.length === 0) || !authCalldataKey) {
          setFetchedAuthorizations([]);
          return;
        }
        const auths = await getAuthorizations(authInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch (e) {
        if (!cancelled) setFetchedAuthorizations([]);
        if (isOpen) {
          console.log("authInstructions", authInstructions);
          console.log("error", e);
        }
      }
    };
    fetchAuths();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, authCalldataKey, authInstructions]);
  
  // Construct calls based on current state
  const calls = useMemo(() => {
    if (!pairInstructions || pairInstructions.length === 0) return [];

    const authorizations = fetchedAuthorizations ?? [];
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(authorizations);
    const moveCalls = pairInstructions.map(instructions => ({
      contractName: "RouterGateway" as const,
      functionName: "move_debt" as const,
      args: CallData.compile({ instructions: instructions }),
    }));

    return [
      ...(authorizations as any),
      ...moveCalls,
      ...(revokeAuthorizations as any),
    ];
  }, [fetchedAuthorizations, pairInstructions]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const estimateCalls = useMemo(() => {
    if (!routerGateway?.address || !pairInstructions || pairInstructions.length === 0)
      return null;
    const authorizations = fetchedAuthorizations ?? [];
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(authorizations);
    const moveCalls = pairInstructions.map(instructions => ({
      contractAddress: routerGateway.address,
      entrypoint: "move_debt",
      calldata: CallData.compile({ instructions }),
    }));
    return [
      ...(authorizations as any),
      ...moveCalls,
      ...(revokeAuthorizations as any),
    ];
  }, [routerGateway?.address, fetchedAuthorizations, pairInstructions]);

  useGasEstimate({
    enabled: isOpen,
    buildCalls: () => estimateCalls ?? null,
    currency: "STRK",
  });

  // Reset the modal state when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      amountRef.current = "";
      setError(null);
      setStep("idle");
      setLoading(false);
      setSelectedCollateralsWithAmounts([]);
      setMaxClickedCollaterals({});
      setIsAmountMaxClicked(false);
    }
  }, [isOpen]);

  // Initialize selected collaterals when preselected ones are provided
  useEffect(() => {
    if (isOpen && preSelectedCollaterals && preSelectedCollaterals.length > 0) {
      setSelectedCollateralsWithAmounts(prev => {
        if (prev.length === 0) {
          return preSelectedCollaterals.map(c => ({ ...c, amount: 0n, inputValue: "" }));
        }

        const existing = new Map(prev.map(c => [c.token.toLowerCase(), c]));
        const merged = preSelectedCollaterals.map(c => {
          const key = c.token.toLowerCase();
          return existing.get(key) || { ...c, amount: 0n, inputValue: "" };
        });
        const others = prev.filter(
          c => !preSelectedCollaterals.some(p => p.token.toLowerCase() === c.token.toLowerCase()),
        );
        return [...merged, ...others];
      });
    }
  }, [isOpen, preSelectedCollaterals]);

  // Handler for collateral selection and amount changes - wrap in useCallback
  const handleCollateralSelectionChange = useCallback((collaterals: CollateralWithAmount[]) => {
    // Update the selected collaterals
    setSelectedCollateralsWithAmounts(collaterals);

    // When collateral selection changes, reset MAX clicked states for any removed collaterals
    setMaxClickedCollaterals(prevState => {
      const updatedMaxClicked = { ...prevState };
      const newTokens = new Set(collaterals.map(c => c.token));

      // Remove entries for tokens that are no longer selected
      Object.keys(updatedMaxClicked).forEach(token => {
        if (!newTokens.has(token)) {
          delete updatedMaxClicked[token];
        }
      });

      return updatedMaxClicked;
    });
  }, []);

  // Handle MAX click for a specific collateral - wrap in useCallback
  const handleCollateralMaxClick = useCallback(
    (collateralToken: string, maxAmount: bigint, formattedMaxAmount: string) => {
      // Update the collateral amount to max
      setSelectedCollateralsWithAmounts(prev =>
        prev.map(c => (c.token === collateralToken ? { ...c, amount: maxAmount, inputValue: formattedMaxAmount } : c)),
      );

      // Mark this collateral as having MAX clicked
      setMaxClickedCollaterals(prev => ({
        ...prev,
        [collateralToken]: true,
      }));
    },
    [],
  );

  // Add this new useCallback for amount handling
  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setIsAmountMaxClicked(false); // Reset MAX state when value is manually changed
  }, []);

  const handleMaxClick = useCallback(() => {
    try {
      // Convert BigInt to string for formatUnits
      if (!position.balance) {
        setAmount("0");
        return;
      }

      const formattedMaxValue = formatUnits(position.balance, position.decimals);
      const maxValue = parseFloat(formattedMaxValue);

      if (!isNaN(maxValue) && isFinite(maxValue)) {
        // Ensure proper string formatting based on decimals
        setAmount(formattedMaxValue);
        setIsAmountMaxClicked(true); // Track that MAX was clicked
      } else {
        setAmount("0");
        console.error("Invalid position balance:", position.balance);
      }
    } catch (error) {
      console.error("Error setting max amount:", error);
      setAmount("0");
    }
  }, [position.balance, position.decimals]);

  // Modify the protocol selection handler
  const handleProtocolSelection = (protocolName: string) => {
    setSelectedProtocol(protocolName);
    // Reset pool selection when changing protocols
    if (protocolName !== "Vesu" && protocolName !== "VesuV2") {
      setSelectedPoolId(VESU_V1_POOLS["Genesis"]);
    }
    if (protocolName === "VesuV2") {
      setSelectedV2PoolAddress(
        fromProtocol === "VesuV2" && normalizedCurrentV2PoolAddress
          ? normalizedCurrentV2PoolAddress
          : VESU_V2_POOLS["Prime"],
      );
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (fromProtocol === "VesuV2" && normalizedCurrentV2PoolAddress) {
      setSelectedV2PoolAddress(normalizedCurrentV2PoolAddress);
    }
  }, [isOpen, fromProtocol, normalizedCurrentV2PoolAddress]);

  const handleMovePosition = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setStep("executing");

      // Execute the transaction
      await sendAsync();

      setStep("done");
      // Close modal after a short delay on success
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error("Move position failed:", err);
      setError(err.message || "Move position failed");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  };

  // Get action button text based on current step
  const actionButtonText = useMemo(() => {
    if (loading) {
      switch (step) {
        case "executing":
          return "Moving...";
        default:
          return "Processing...";
      }
    }

    if (step === "done") {
      return "Done!";
    }

    return "Migrate";
  }, [loading, step]);


  // Helper function to safely format the balance
  const getFormattedBalance = useMemo(() => {
    try {
      if (!balance) return "0.00";
      return formatDisplayNumber(Number(formatUnits(balance, decimals)));
    } catch (error) {
      return "0.00";
    }
  }, [balance, decimals]);

  const isActionDisabled =
    loading ||
    !selectedProtocol ||
    !amount ||
    !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
    step !== "idle" ||
    // Disable V1 -> V1 when target pool equals current pool id
    (fromProtocol === "Vesu" && selectedProtocol === "Vesu" && selectedPoolId === currentPoolId) ||
    (fromProtocol === "VesuV2" &&
      selectedProtocol === "VesuV2" &&
      normalizedCurrentV2PoolAddress !== undefined &&
      normalizedCurrentV2PoolAddress === normalizeStarknetAddress(selectedV2PoolAddress));

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-5xl max-h-[90vh] min-h-[360px] p-6 rounded-none flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-grow overflow-y-auto">
            {/* FROM SECTION */}
            <div className="space-y-6 md:col-span-3">
              <label className="text-sm font-medium text-base-content/80">From</label>
              <div className="flex items-center gap-3 h-12 border-b-2 border-base-300 px-1">
                <Image
                  src={getProtocolLogo(fromProtocol)}
                  alt={fromProtocol}
                  width={32}
                  height={32}
                  className="rounded-full min-w-[32px]"
                />
                <span className="truncate font-semibold text-lg">{fromProtocol}</span>
              </div>
              {position.type === "borrow" && (
                isLoadingCollaterals ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <span className="loading loading-spinner loading-md mb-2"></span>
                    <span className="text-base-content/70 text-xs">Loading collaterals...</span>
                  </div>
                ) : (
                  <div className="mt-6">
                    <CollateralSelector
                      collaterals={collateralsForSelector}
                      isLoading={false}
                      selectedProtocol={selectedProtocol}
                      onCollateralSelectionChange={handleCollateralSelectionChange}
                      marketToken={position.tokenAddress}
                      onMaxClick={handleCollateralMaxClick}
                      hideAmounts
                      initialSelectedCollaterals={selectedCollateralsWithAmounts}
                    />
                  </div>
                )
              )}
            </div>

            {/* AMOUNTS SECTION */}
            <div className="space-y-6 md:col-span-6">
              <div className="text-center mb-2">
                <label className="block text-lg font-semibold flex items-center justify-center gap-1">
                  Debt
                  {position.type === "supply" && (
                    <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />
                  )}
                </label>
                <div className="text-xs text-base-content/60">
                  Available: {getFormattedBalance} {position.name}
        </div>
      </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <div className="w-6 h-6 relative">
                    <Image
                      src={tokenNameToLogo(position.name)}
                      alt={position.name}
                      fill
                      className="rounded-full object-contain"
                    />
                  </div>
                  <span className="truncate font-medium">{position.name}</span>
                </div>
                <input
                  type="text"
                  className="flex-1 border-b-2 border-base-300 focus:border-primary bg-transparent px-2 h-14 text-lg text-right"
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                  disabled={loading || step !== "idle"}
                />
                <button
                  className="text-xs font-medium px-2 py-1"
                  onClick={handleMaxClick}
                  disabled={loading || step !== "idle"}
                >
                  MAX
                </button>
              </div>
              {position.type === "borrow" && (
                <>
                  <CollateralAmounts
                    collaterals={selectedCollateralsWithAmounts}
                    onChange={setSelectedCollateralsWithAmounts}
                    selectedProtocol={selectedProtocol}
                    onMaxClick={(token, isMax) =>
                      setMaxClickedCollaterals(prev => ({ ...prev, [token]: isMax }))
                    }
                  />
                  {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
                    <div className="text-xs text-base-content/70 mt-2 p-2 bg-info/10 rounded">
                      <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this
                      collateral cannot be changed.
                    </div>
                  )}
                </>
              )}
              {error && (
                <div className="alert alert-error shadow-lg">
                  <FiAlertTriangle className="w-6 h-6" />
                  <div className="text-sm flex-1">{error}</div>
                </div>
              )}

              <div className="flex justify-between text-sm text-base-content/70">
                <span>Debt Value: ${formatDisplayNumber(debtUsdValue)}</span>
                {position.type === "borrow" && (
                  <span>Collateral Value: ${formatDisplayNumber(totalCollateralUsd)}</span>
                )}
              </div>

            </div>

            {/* TO SECTION */}
            <div className="flex flex-col md:col-span-3 h-full">
              <div className="space-y-6 flex-1">
                <div>
                  <label className="text-sm font-medium text-base-content/80">To</label>
                  <div className="dropdown w-full">
                    <div
                      tabIndex={0}
                      className="border-b-2 border-base-300 py-2 px-1 flex items-center justify-between cursor-pointer h-12"
                    >
                      <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                        {selectedProtocol ? (
                          <>
                            <Image
                              src={getProtocolLogo(selectedProtocol)}
                              alt={selectedProtocol}
                              width={32}
                              height={32}
                              className="rounded-full min-w-[32px]"
                            />
                            <span className="truncate font-semibold text-lg">{selectedProtocol}</span>
                          </>
                        ) : (
                          <span className="text-base-content/50">Select protocol</span>
                        )}
                      </div>
                      <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <ul
                      tabIndex={0}
                      className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                    >
                      {protocols
                        .filter(p => p.name !== fromProtocol || (p.name === "Vesu" && fromProtocol === "Vesu") || (p.name === "VesuV2" && fromProtocol === "VesuV2"))
                        .map(protocol => (
                          <li key={protocol.name}>
                            <button
                              className="flex items-center gap-3 py-2"
                              onClick={() => handleProtocolSelection(protocol.name)}
                            >
                              <Image
                                src={getProtocolLogo(protocol.name)}
                                alt={protocol.name}
                                width={32}
                                height={32}
                                className="rounded-full min-w-[32px]"
                              />
                              <span className="truncate text-lg">{protocol.name}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>

                {selectedProtocol === "Vesu" && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-base-content/80">Target Pool</label>
                    {fromProtocol === "Vesu" && (
                      <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                        <span className="text-base-content/70">Current Pool:</span>
                        <span className="font-medium ml-1">{currentPoolId !== undefined ? getV1PoolNameFromId(currentPoolId) : "Unknown"}</span>
                      </div>
                    )}
                  </div>
                  <div className="dropdown w-full">
                    <div
                      tabIndex={0}
                      className="border-b-2 border-base-300 py-2 px-1 flex items-center justify-between cursor-pointer h-12"
                    >
                      <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                        {Object.entries(VESU_V1_POOLS).map(([name, id]) =>
                          id === selectedPoolId ? (
                            <span key={name} className="truncate font-semibold text-lg">
                              {name}
                            </span>
                          ) : null,
                        )}
                      </div>
                      <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <ul
                      tabIndex={0}
                      className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                    >
                      {Object.entries(VESU_V1_POOLS)
                        .filter(([, id]) => fromProtocol !== "Vesu" || id !== currentPoolId)
                        .map(([name, id]) => (
                          <li key={name}>
                            <button className="flex items-center gap-3 py-2" onClick={() => setSelectedPoolId(id as bigint)}>
                              <Image
                                src="/logos/vesu.svg"
                                alt="Vesu"
                                width={32}
                                height={32}
                                className="rounded-full min-w-[32px]"
                              />
                              <span className="truncate text-lg">{name}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                )}

                {selectedProtocol === "VesuV2" && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-base-content/80">Target Pool</label>
                      <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                        <span className="text-base-content/70">V2 Pool:</span>
                        <span className="font-medium ml-1">{getV2PoolNameFromAddress(selectedV2PoolAddress)}</span>
                      </div>
                    </div>
                    <div className="dropdown w-full">
                      <div
                        tabIndex={0}
                        className="border-b-2 border-base-300 py-2 px-1 flex items-center justify-between cursor-pointer h-12"
                      >
                        <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                          {Object.entries(VESU_V2_POOLS).map(([name, addr]) =>
                            addr.toLowerCase() === selectedV2PoolAddress.toLowerCase() ? (
                              <span key={name} className="truncate font-semibold text-lg">
                                {name}
                              </span>
                            ) : null,
                          )}
                        </div>
                        <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <ul
                        tabIndex={0}
                        className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                      >
                        {Object.entries(VESU_V2_POOLS).map(([name, addr]) => (
                          <li key={name}>
                            <button className="flex items-center gap-3 py-2" onClick={() => setSelectedV2PoolAddress(addr)}>
                              <Image
                                src="/logos/vesu.svg"
                                alt="VesuV2"
                                width={32}
                                height={32}
                                className="rounded-full min-w-[32px]"
                              />
                              <span className="truncate text-lg">{name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {fromProtocol === "Nostra" && selectedProtocol === "Vesu" && vesuPairings.length > 0 && (
                  <div className="bg-base-200/40 p-2 rounded space-y-1">
                    {vesuPairings.map(p => (
                      <div key={p.token} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          <Image
                            src={tokenNameToLogo(p.symbol)}
                            alt={p.symbol}
                            width={16}
                            height={16}
                            className="rounded-full"
                          />
                          <span>{p.symbol}</span>
                          <span>
                            {Number(formatUnits(p.amount, p.decimals)).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Image
                            src={tokenNameToLogo(position.name)}
                            alt={position.name}
                            width={16}
                            height={16}
                            className="rounded-full"
                          />
                          <span>{position.name}</span>
                          <span>
                            {Number(formatUnits(p.debtAmount, position.decimals)).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="pt-2">
                <button
                  className={`btn btn-ghost w-full h-10 ${loading ? "animate-pulse" : ""}`}
                  onClick={step === "done" ? onClose : handleMovePosition}
                  disabled={step === "done" ? false : isActionDisabled}
                >
                  {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
                  {actionButtonText}
                </button>
              </div>
            </div>
          </div>
      </div>

      <form
        method="dialog"
        className="modal-backdrop backdrop-blur-sm bg-black/20"
        onClick={loading ? undefined : onClose}
      >
        <button disabled={loading}>close</button>
      </form>
    </dialog>
  );
};
