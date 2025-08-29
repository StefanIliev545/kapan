import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import Image from "next/image";
import { useAccount } from "~~/hooks/useAccount";
import { useReadContract } from "@starknet-react/core";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiArrowRightCircle,
  FiCheck,
  FiDollarSign,
  FiLock,
  FiMinusCircle,
  FiPlusCircle,
  FiTrendingUp,
} from "react-icons/fi";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, num, uint256 } from "starknet";
import { formatUnits, parseUnits } from "viem";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
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

// Define pool IDs
const POOL_IDS = {
  Genesis: 0n,
  "Re7 USDC": 3592370751539490711610556844458488648008775713878064059760995781404350938653n,
  "Alterscope wstETH": 2612229586214495842527551768232431476062656055007024497123940017576986139174n,
} as const;

// Helper function to get pool name from ID
const getPoolNameFromId = (poolId: bigint): string => {
  const entry = Object.entries(POOL_IDS).find(([_, id]) => id === poolId);
  return entry ? entry[0] : "Unknown Pool";
};

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
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

type VesuContext = {
  pool_id: bigint;
  counterpart_token: string;
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

export const MovePositionModal: FC<MovePositionModalProps> = ({
  isOpen,
  onClose,
  fromProtocol,
  position,
  preSelectedCollaterals,
  disableCollateralSelection,
}) => {
  const { address: userAddress } = useAccount();
  const protocols = useMemo(() => [{ name: "Nostra" }, { name: "Vesu" }], []);
  const { tokenAddress, decimals, type, name, balance, poolId: currentPoolId } = position;

  const [selectedProtocol, setSelectedProtocol] = useState(
    () => protocols.find(p => p.name !== fromProtocol)?.name || "",
  );
  const [selectedPoolId, setSelectedPoolId] = useState<bigint>(POOL_IDS["Genesis"]);
  const [amount, setAmount] = useState("");
  const [isAmountMaxClicked, setIsAmountMaxClicked] = useState(false);
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] = useState<CollateralWithAmount[]>(
    preSelectedCollaterals || [],
  );
  const [maxClickedCollaterals, setMaxClickedCollaterals] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");

  const { collaterals: sourceCollaterals, isLoading: isLoadingSourceCollaterals } = useCollateral({
    protocolName: fromProtocol as "Vesu" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !(disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu"),
  });

  const { collaterals: targetCollaterals, isLoading: isLoadingTargetCollaterals } = useCollateral({
    protocolName: selectedProtocol as "Vesu" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !!selectedProtocol,
  });

  // Track first load completion (never reset) to avoid spinner after initial data is shown
  const firstCollateralsReadyRef = useRef(false);
  useEffect(() => {
    if (
      (disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu") ||
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
    if (disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu") {
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
    if (fromProtocol === "Nostra" && selectedProtocol === "Vesu" && type === "borrow") {
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

  // Spinner only before first successful data render
  const isLoadingCollaterals =
    !firstCollateralsReadyRef.current && (isLoadingSourceCollaterals || isLoadingTargetCollaterals);
  // Construct instruction based on current state
  const { fullInstruction, authInstruction, pairInstructions } = useMemo(() => {
    if (!amount || !userAddress || !routerGateway?.address)
      return { fullInstruction: { instructions: [] }, authInstruction: { instructions: [] }, pairInstructions: [] };

    const tokenDecimals = position.decimals ?? 18; // Use position decimals if available, otherwise default to 18
    const parsedAmount = parseUnits(amount, tokenDecimals);
    const lowerProtocolName = fromProtocol.toLowerCase();
    const destProtocolName = selectedProtocol.toLowerCase();

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

        // Create context with paired tokens for Vesu
        const contextRedeposit = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          0n,
          BigInt(position.tokenAddress),
        ]);
        const contextReborrow = new CairoOption<bigint[]>(CairoOptionVariant.Some, [0n, BigInt(collateral.token)]);
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
              target_instruction_index: 1, // Point to corresponding withdraw instruction (offset by repay instruction)
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
              target_instruction_index: 0, // Point to repay instruction
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

      const authInstructionData = CallData.compile({
        instructions: instructions.flat().map(protocolInstruction => {
          const filteredInstructions = protocolInstruction.instructions.filter(instruction => {
            if (instruction.activeVariant() === "Withdraw" || instruction.activeVariant() === "Reborrow") {
              return true;
            }
            return false;
          });
          return { protocol_name: protocolInstruction.protocol_name, instructions: filteredInstructions };
        }),
        rawSelectors: false,
      });

      return {
        fullInstruction: fullInstructionData,
        authInstruction: authInstructionData,
        pairInstructions: instructions,
      };
    };

    // If target protocol is Vesu and we have multiple collaterals, use proportional allocation
    if (selectedProtocol === "Vesu" && selectedCollateralsWithAmounts.length > 1) {
      return (
        generateVesuInstructions() || {
          fullInstruction: { instructions: [] },
          authInstruction: { instructions: [] },
          pairInstructions: [],
        }
      );
    }

    // Otherwise, use the original approach for other protocols or single collateral
    let repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
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

    let borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);

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
          target_instruction_index: 1 + index,
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
        target_instruction_index: 0,
        approval_amount: uint256.bnToUint256((parsedAmount * BigInt(101)) / BigInt(100)),
        user: userAddress,
        context: borrowInstructionContext,
      },
    });

    // Complete set of instructions for execution
    const fullInstructionData = CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [repayInstruction, ...withdrawInstructions],
        },
        {
          protocol_name: destProtocolName,
          instructions: [...depositInstructions, borrowInstruction],
        },
      ],
    });

    // Only withdraw and borrow instructions for authorization
    const authInstructionData = CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [...withdrawInstructions],
        },
        {
          protocol_name: destProtocolName,
          instructions: [borrowInstruction],
        },
      ],
      rawSelectors: false,
    });

    return {
      fullInstruction: fullInstructionData,
      authInstruction: authInstructionData,
      pairInstructions: [],
    };
  }, [amount, userAddress, routerGateway?.address, position.decimals, position.tokenAddress, fromProtocol, selectedProtocol, selectedCollateralsWithAmounts, isAmountMaxClicked, tokenToPrices, maxClickedCollaterals, currentPoolId, selectedPoolId]);

  // Get authorizations for the instructions

  const { data: protocolInstructions, error: protocolInstructionsError } = useScaffoldReadContract({
    contractName: "RouterGateway" as const,
    functionName: "get_authorizations_for_instructions" as const,
    args: [authInstruction],
    enabled: !!authInstruction && isOpen,
    refetchInterval: 1000,
  } as any);

  // Construct calls based on current state
  const calls = useMemo(() => {
    if (!fullInstruction) return [];

    const authorizations = [];
    if (protocolInstructions) {
      // Use explicit type for instruction
      const instructionsArray = protocolInstructions as unknown as [bigint, bigint, bigint[]][];
      for (const instruction of instructionsArray) {
        const address = num.toHexString(instruction[0]);
        const entrypoint = feltToString(instruction[1]);
        authorizations.push({
          contractAddress: address,
          entrypoint: entrypoint,
          calldata: (instruction[2] as bigint[]).map(f => num.toHexString(f)),
        });
      }
    }

    return [
      ...(authorizations as any),
      ...pairInstructions.map(instructions => {
        return {
          contractName: "RouterGateway" as const,
          functionName: "move_debt" as const,
          args: CallData.compile({ instructions: instructions }),
        }
      }),
    ];
  }, [fullInstruction, protocolInstructions, pairInstructions]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  // Reset the modal state when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
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
      setSelectedCollateralsWithAmounts(preSelectedCollaterals);
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
    if (protocolName !== "Vesu") {
      setSelectedPoolId(POOL_IDS["Genesis"]);
    }
  };

  const handleMovePosition = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setStep("executing");

      // Execute the transaction
      const tx = await sendAsync();

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

    return "Move Position";
  }, [loading, step]);

  // Get action button class based on current step
  const actionButtonClass = useMemo(() => {
    if (step === "done") {
      return "btn-success";
    }
    return "btn-primary";
  }, [step]);

  // Helper function to safely format the balance
  const getFormattedBalance = useMemo(() => {
    try {
      if (!balance) return "0.00";
      return formatDisplayNumber(Number(formatUnits(balance, decimals)));
    } catch (error) {
      return "0.00";
    }
  }, [balance, decimals]);

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-2xl max-h-[100vh] h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header with gradient background, reduced height */}
        <div className="relative p-3 bg-gradient-to-r from-base-200 to-base-300">
          <div className="absolute top-2 right-2">
            <button className="btn btn-xs btn-circle btn-ghost" onClick={onClose} disabled={loading && step !== "done"}>
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="avatar">
                <div className="w-10 h-10 rounded-full ring-2 ring-base-content/5 p-1 bg-base-100 shadow-md">
                  <Image
                    src={tokenNameToLogo(position.name)}
                    alt={position.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                </div>
              </div>
              <div className="absolute -right-1 -bottom-1 bg-base-100 rounded-full p-0.5 shadow-md">
                {position.type === "borrow" ? (
                  <FiArrowRightCircle className="text-primary w-5 h-5" />
                ) : (
                  <FiTrendingUp className="text-emerald-500 w-5 h-5" />
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span
                  className={`font-extrabold bg-gradient-to-r ${
                    position.type === "borrow"
                      ? "from-purple-500 via-primary to-blue-500 bg-clip-text text-transparent dark:from-purple-300 dark:via-primary-300 dark:to-blue-300"
                      : "from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent dark:from-emerald-300 dark:via-teal-300 dark:to-cyan-300"
                  }`}
                >
                  Move {position.type === "supply" ? "Supply" : "Debt"}
                </span>
                <span className="text-base-content">{position.name}</span>
              </h3>
              <div className="text-xs opacity-70 flex items-center gap-1">
                {position.type === "borrow" ? (
                  <>
                    <FiMinusCircle className="w-4 h-4 text-primary" />
                    <span>Moving debt from {fromProtocol} to another protocol</span>
                  </>
                ) : (
                  <>
                    <FiPlusCircle className="w-4 h-4 text-emerald-500" />
                    <span>Moving supply from {fromProtocol} to another protocol</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content area - scrollable with NO button inside */}
        <div className="p-2 space-y-3 flex-1 overflow-y-auto">
          {/* Protocol Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* From Protocol */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-base-content/80">From Protocol</label>
              <div className="bg-base-200/60 py-2 px-3 rounded-lg flex items-center justify-between h-[40px]">
                <div className="flex items-center gap-2 truncate">
                  <Image
                    src={getProtocolLogo(fromProtocol)}
                    alt={fromProtocol}
                    width={20}
                    height={20}
                    className="rounded-full min-w-[20px]"
                  />
                  <span className="truncate font-medium text-sm">{fromProtocol}</span>
                </div>
              </div>
            </div>

            {/* To Protocol */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-base-content/80">To Protocol</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="bg-base-200/60 hover:bg-base-200 transition-colors py-2 px-3 rounded-lg flex items-center justify-between cursor-pointer h-[40px]"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    {selectedProtocol ? (
                      <>
                        <Image
                          src={getProtocolLogo(selectedProtocol)}
                          alt={selectedProtocol}
                          width={20}
                          height={20}
                          className="rounded-full min-w-[20px]"
                        />
                        <span className="truncate font-medium text-sm">{selectedProtocol}</span>
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
                    .filter(p => p.name !== fromProtocol || (p.name === "Vesu" && fromProtocol === "Vesu"))
                    .map(protocol => (
                      <li key={protocol.name}>
                        <button
                          className="flex items-center gap-2 py-1"
                          onClick={() => handleProtocolSelection(protocol.name)}
                        >
                          <Image
                            src={getProtocolLogo(protocol.name)}
                            alt={protocol.name}
                            width={20}
                            height={20}
                            className="rounded-full min-w-[20px]"
                          />
                          <span className="truncate text-sm">{protocol.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Add Pool Selection for Vesu to Vesu */}
          {selectedProtocol === "Vesu" && (
            <div className="space-y-1">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-base-content/80">Target Pool</label>
                {fromProtocol === "Vesu" && (
                  <div className="text-xs bg-base-200/60 py-1 px-2 rounded-lg flex items-center">
                    <span className="text-base-content/70">Current Pool:</span>
                    <span className="font-medium ml-1">
                      {currentPoolId !== undefined ? getPoolNameFromId(currentPoolId) : "Unknown"}
                    </span>
                  </div>
                )}
              </div>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="bg-base-200/60 hover:bg-base-200 transition-colors py-2 px-3 rounded-lg flex items-center justify-between cursor-pointer h-[40px]"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    {Object.entries(POOL_IDS).map(
                      ([name, id]) =>
                        id === selectedPoolId && (
                          <span key={name} className="truncate font-medium text-sm">
                            {name}
                          </span>
                        ),
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
                  {Object.entries(POOL_IDS)
                    .filter(([_, id]) => fromProtocol !== "Vesu" || id !== currentPoolId) // Only filter out current pool if source is Vesu
                    .map(([name, id]) => (
                      <li key={name}>
                        <button className="flex items-center gap-2 py-1" onClick={() => setSelectedPoolId(id)}>
                          {name === "Genesis" && (
                            <Image
                              src="/logos/vesu.svg"
                              alt="Vesu"
                              width={20}
                              height={20}
                              className="rounded-full min-w-[20px]"
                            />
                          )}
                          {name === "Re7 USDC" && (
                            <Image
                              src="/logos/re7.svg"
                              alt="Re7"
                              width={20}
                              height={20}
                              className="rounded-full min-w-[20px]"
                            />
                          )}
                          {name === "Alterscope wstETH" && (
                            <>
                              <Image
                                src="/logos/alterscope_symbol_black.svg"
                                alt="Alterscope"
                                width={20}
                                height={20}
                                className="rounded-full min-w-[20px] dark:hidden"
                              />
                              <Image
                                src="/logos/alterscope_symbol_white.svg"
                                alt="Alterscope"
                                width={20}
                                height={20}
                                className="rounded-full min-w-[20px] hidden dark:block"
                              />
                            </>
                          )}
                          <span className="truncate text-sm">{name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-1">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-base-content/80 flex items-center gap-1">
                Amount
                {position.type === "supply" && <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />}
              </label>
              <div className="text-xs bg-base-200/60 py-1 px-2 rounded-lg flex items-center">
                <span className="text-base-content/70">Available:</span>
                <span className="font-medium ml-1">
                  {getFormattedBalance} {position.name}
                </span>
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                className="input input-bordered w-full pr-20 h-10 text-base focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                disabled={loading || step !== "idle"}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-xs btn-outline h-7"
                onClick={handleMaxClick}
                disabled={loading || step !== "idle"}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Loading state for collaterals */}
          {position.type === "borrow" && isLoadingCollaterals ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] py-8">
              <span className="loading loading-spinner loading-md mb-3"></span>
              <span className="text-base-content/70">Loading collaterals...</span>
            </div>
          ) : position.type === "borrow" && collateralsForSelector.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-1">
                <CollateralSelector
                  collaterals={collateralsForSelector}
                  isLoading={false}
                  selectedProtocol={selectedProtocol}
                  onCollateralSelectionChange={handleCollateralSelectionChange}
                  marketToken={position.tokenAddress}
                  onMaxClick={handleCollateralMaxClick}
                />

                {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
                  <div className="text-xs text-base-content/70 mt-2 p-2 bg-info/10 rounded">
                    <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this
                    collateral cannot be changed.
                  </div>
                )}
              </div>
            </div>
          ) : position.type === "borrow" ? (
            <div className="alert alert-info shadow-sm">
              <div className="text-sm">No collaterals available with balance greater than 0.</div>
            </div>
          ) : null}

          {/* Error message */}
          {error && (
            <div className="alert alert-error shadow-lg">
              <FiAlertTriangle className="w-6 h-6" />
              <div className="text-sm flex-1">{error}</div>
            </div>
          )}
        </div>

        {/* Button positioned at the bottom of the modal, outside the scrollable area */}
        <div className="p-4 border-t border-base-200 bg-base-100">
          <button
            className={`btn ${actionButtonClass} btn-md w-full h-12 transition-all duration-300 shadow-md ${loading ? "animate-pulse" : ""}`}
            onClick={handleMovePosition}
            disabled={
              loading ||
              !selectedProtocol ||
              !amount ||
              !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
              step !== "idle" ||
              (fromProtocol === "Vesu" && selectedProtocol === "Vesu" && selectedPoolId === currentPoolId) // Prevent same pool selection
            }
          >
            {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
            {actionButtonText}
            {!loading &&
              step === "idle" &&
              (position.type === "supply" ? (
                <FiTrendingUp className="w-5 h-5 ml-1" />
              ) : (
                <FiArrowRight className="w-5 h-5 ml-1" />
              ))}
          </button>
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
