import { FC, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FaGasPump } from "react-icons/fa";
import { FiAlertTriangle, FiLock } from "react-icons/fi";
import { formatUnits } from "viem";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { CollateralAmounts } from "~~/components/specific/collateral/CollateralAmounts";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { ERC20ABI, tokenNameToLogo } from "~~/contracts/externalContracts";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useBatchingPreference } from "~~/hooks/useBatchingPreference";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { getProtocolLogo } from "~~/utils/protocol";

// Define the step type for tracking the move flow
type MoveStep = "idle" | "executing" | "done";

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
  position: {
    name: string;
    balance: number; // USD value (display only)
    type: "supply" | "borrow";
    tokenAddress: string;
    decimals: number;
  };
  chainId?: number;
}

type FlashLoanProvider = {
  name: "Balancer V2" | "Balancer V3" | "Aave V3";
  icon: string;
  version: "v2" | "v3" | "aave";
  providerEnum: 0 | 1 | 2; // FlashLoanProvider enum: BalancerV2=0, BalancerV3=1, AaveV3=2
};

const ALL_FLASH_LOAN_PROVIDERS: FlashLoanProvider[] = [
  { name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2", providerEnum: 0 },
  { name: "Balancer V3", icon: "/logos/balancer.svg", version: "v3", providerEnum: 1 },
  { name: "Aave V3", icon: "/logos/aave.svg", version: "aave", providerEnum: 2 },
] as const;

// Extend the collateral type with rawBalance
export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position, chainId }) => {
  const { address: userAddress, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  // Linea (59144): ZeroLend replaces Venus
  // Base (8453): Show both ZeroLend and Venus
  // Other chains: Show Venus only
  const isLinea = chainId === 59144;
  const isBase = chainId === 8453;
  const protocols = [
    { name: "Aave V3" },
    { name: "Compound V3" },
    ...(isLinea
      ? [{ name: "ZeroLend" }]
      : isBase
        ? [{ name: "ZeroLend" }, { name: "Venus" }]
        : [{ name: "Venus" }]
    ),
  ];

  const [selectedProtocol, setSelectedProtocol] = useState(protocols.find(p => p.name !== fromProtocol)?.name || "");
  const [amount, setAmount] = useState("");
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] = useState<CollateralWithAmount[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRepayingAll, setIsRepayingAll] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Check which flash loan providers are available on the router using enabled functions
  // These are view functions in FlashLoanConsumerBase that check if addresses are non-zero
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter", chainId: chainId as any });

  const { data: balancerV2Enabled, isLoading: isLoadingBalancerV2 } = useReadContract({
    address: routerContract?.address as `0x${string}` | undefined,
    abi: routerContract?.abi,
    functionName: "balancerV2Enabled",
    query: { enabled: isOpen && !!chainId && !!routerContract?.address },
  });

  const { data: balancerV3Enabled, isLoading: isLoadingBalancerV3 } = useReadContract({
    address: routerContract?.address as `0x${string}` | undefined,
    abi: routerContract?.abi,
    functionName: "balancerV3Enabled",
    query: { enabled: isOpen && !!chainId && !!routerContract?.address },
  });

  const { data: aaveEnabled, isLoading: isLoadingAave } = useReadContract({
    address: routerContract?.address as `0x${string}` | undefined,
    abi: routerContract?.abi,
    functionName: "aaveEnabled",
    query: { enabled: isOpen && !!chainId && !!routerContract?.address },
  });

  // Chain-based provider availability (from deployment script)
  // Balancer is only available on Arbitrum, Base, and Optimism
  // Aave V3 is available on Arbitrum, Base, Optimism, Linea, and Plasma
  const BALANCER_CHAINS = [42161, 8453, 10, 31337]; // Arbitrum, Base, Optimism, Hardhat
  const AAVE_CHAINS = [42161, 8453, 10, 59144, 9745, 31337]; // Arbitrum, Base, Optimism, Linea, Plasma, Hardhat

  // Filter available flash loan providers based on what's enabled AND chain support
  // Only include providers once we've finished loading their status
  const availableFlashLoanProviders = useMemo(() => {
    const providers: FlashLoanProvider[] = [];

    // Only check if we're not loading (to avoid showing providers that will be filtered out)
    // Also check chain support - Balancer is not available on Linea
    if (!isLoadingBalancerV2 && balancerV2Enabled === true && chainId && BALANCER_CHAINS.includes(chainId)) {
      providers.push(ALL_FLASH_LOAN_PROVIDERS[0]);
    }

    if (!isLoadingBalancerV3 && balancerV3Enabled === true && chainId && BALANCER_CHAINS.includes(chainId)) {
      providers.push(ALL_FLASH_LOAN_PROVIDERS[1]);
    }

    if (!isLoadingAave && aaveEnabled === true && chainId && AAVE_CHAINS.includes(chainId)) {
      providers.push(ALL_FLASH_LOAN_PROVIDERS[2]);
    }

    return providers;
  }, [balancerV2Enabled, balancerV3Enabled, aaveEnabled, isLoadingBalancerV2, isLoadingBalancerV3, isLoadingAave, chainId]);

  // Set default selected provider (first available)
  const [selectedFlashLoanProvider, setSelectedFlashLoanProvider] = useState<FlashLoanProvider | null>(null);

  useEffect(() => {
    if (availableFlashLoanProviders.length > 0) {
      // Update selected provider if current one is not available, or set first available if none selected
      if (!selectedFlashLoanProvider || !availableFlashLoanProviders.includes(selectedFlashLoanProvider)) {
        setSelectedFlashLoanProvider(availableFlashLoanProviders[0]);
      }
    } else {
      setSelectedFlashLoanProvider(null);
    }
  }, [availableFlashLoanProviders, selectedFlashLoanProvider]);

  // Fetch collaterals from the contract.
  const { collaterals: fetchedCollaterals, isLoading: isLoadingCollaterals } = useCollaterals(
    position.tokenAddress,
    fromProtocol,
    userAddress || "0x0000000000000000000000000000000000000000",
    isOpen,
  );

  // Memoize the collateral addresses to prevent recreation on every render.
  const collateralAddresses = useMemo(
    () => fetchedCollaterals.map((collateral: any) => collateral.address),
    // Stable dependency - stringify the addresses to avoid reference comparisons
    [JSON.stringify(fetchedCollaterals.map((c: any) => c.address))],
  );

  // Use the hook to check collateral support.
  const { isLoading: isLoadingCollateralSupport, supportedCollaterals } = useCollateralSupport(
    selectedProtocol,
    position.tokenAddress,
    collateralAddresses,
    isOpen,
  );

  // Combine fetched collaterals with support status.
  const collateralsForSelector = useMemo(() => {
    return fetchedCollaterals.map(
      (collateral: { symbol: string; balance: number; address: string; decimals: number; rawBalance: bigint }) => {
        return {
          ...collateral,
          supported: supportedCollaterals[collateral.address] === true,
        };
      },
    );
  }, [fetchedCollaterals, supportedCollaterals]);

  // Fetch USD prices for debt token and selected collaterals using EVM helper
  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [[...collateralsForSelector.map(c => c.address), position.tokenAddress]],
    query: { enabled: isOpen },
  });

  const { tokenToPrices } = useMemo(() => {
    if (!tokenPrices) return { tokenToPrices: {} as Record<string, bigint> };
    const prices = tokenPrices as unknown as bigint[];
    const addresses = [...collateralsForSelector.map(c => c.address), position.tokenAddress];
    return {
      tokenToPrices: prices.reduce(
        (acc, price, index) => {
          acc[addresses[index].toLowerCase()] = price / 10n ** 10n;
          return acc;
        },
        {} as Record<string, bigint>,
      ),
    };
  }, [tokenPrices, collateralsForSelector, position.tokenAddress]);

  // Move position hook with modular builder
  const { createMoveBuilder, executeFlowBatchedIfPossible } = useKapanRouterV2();
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = useBatchingPreference();
  const [revokePermissions, setRevokePermissions] = useState(false);

  // Auto-enable revoke permissions when batching is enabled
  useEffect(() => {
    if (preferBatching) {
      setRevokePermissions(true);
    }
  }, [preferBatching]);

  // Map protocol names to gateway view contract names
  const PROTOCOL_TO_GATEWAY_MAP: Record<string, "AaveGatewayView" | "CompoundGatewayView" | "VenusGatewayView"> = {
    aave: "AaveGatewayView",
    compound: "CompoundGatewayView",
    venus: "VenusGatewayView",
  };

  // Read on-chain borrow balance using gateway view contract
  const normalizedFromProtocol = fromProtocol.toLowerCase().replace(/\s+v\d+$/i, "").replace(/\s+/g, "");
  const gatewayContractName = PROTOCOL_TO_GATEWAY_MAP[normalizedFromProtocol] || "AaveGatewayView"; // Default fallback

  const { data: tokenBalance } = useScaffoldReadContract({
    contractName: gatewayContractName,
    functionName: "getBorrowBalance",
    args: [
      position.tokenAddress,
      userAddress || "0x0000000000000000000000000000000000000000",
    ],
    query: {
      enabled: isOpen,
    },
  });

  // Read token decimals.
  const { data: decimals } = useReadContract({
    address: position.tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
    query: {
      enabled: isOpen,
    },
  });

  // Note: Flash loan provider balance check removed - the new builder handles flash loans internally
  // Flash loan availability is managed by the router contract

  // Reset the state when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setError(null);
      setStep("idle");
      setLoading(false);
      setIsRepayingAll(false);
      setSelectedCollateralsWithAmounts([]);
    }
  }, [isOpen]);

  // Ensure wallet is on the correct EVM network when modal opens
  useEffect(() => {
    if (!isOpen || !chainId) return;
    if (chain?.id !== chainId) {
      try {
        switchChain?.({ chainId });
      } catch (e) {
        console.warn("Auto network switch failed", e);
      }
    }
  }, [isOpen, chainId, chain?.id, switchChain]);

  // Note: Flash loan provider balance check removed - handled by router

  // Memoize formatted token balance.
  const formattedTokenBalance = useMemo(() => {
    if (!tokenBalance || !decimals) return "0";
    return formatUnits(tokenBalance, decimals as number);
  }, [tokenBalance, decimals]);

  // Format number with thousands separators for display
  const formatDisplayNumber = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0.00";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  };

  const debtUsdValue = useMemo(() => {
    if (!amount) return 0;
    const price = tokenToPrices[position.tokenAddress.toLowerCase()];
    const usdPerToken = price
      ? Number(formatUnits(price, 8))
      : position.balance / parseFloat(formattedTokenBalance || "1");
    return parseFloat(amount) * usdPerToken;
  }, [amount, tokenToPrices, position.tokenAddress, position.balance, formattedTokenBalance]);

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

  const handleSetMaxAmount = () => {
    setAmount(formattedTokenBalance);
    setIsRepayingAll(true);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setIsRepayingAll(false);
  };

  const handleMoveDebt = async () => {
    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          setError("Please switch to the selected network to proceed");
          return;
        }
      }
      if (!userAddress) throw new Error("Wallet not connected");
      if (!decimals) throw new Error("Token decimals not loaded");
      if (!selectedProtocol) throw new Error("Please select a destination protocol");
      setLoading(true);
      setError(null);
      setStep("executing");

      // Create the modular builder
      const builder = createMoveBuilder();

      // Normalize protocol names for comparison
      const normalizedSelectedProtocol = selectedProtocol.toLowerCase().replace(/\s+v\d+$/i, "").replace(/\s+/g, "");
      const normalizedFromProtocol = fromProtocol.toLowerCase().replace(/\s+v\d+$/i, "").replace(/\s+/g, "");

      // For Compound, set the market (debt token = base token = market)
      if (normalizedSelectedProtocol === "compound" || normalizedFromProtocol === "compound") {
        builder.setCompoundMarket(position.tokenAddress as `0x${string}`);
      }

      if (position.type === "borrow") {
        // Calculate debt amount
        const debtAmountStr = isRepayingAll
          ? formatUnits(tokenBalance as bigint, decimals as number)
          : amount;

        // Validate debt amount
        if (!debtAmountStr || debtAmountStr === "0" || debtAmountStr === "0.0" || parseFloat(debtAmountStr) <= 0) {
          throw new Error("Invalid debt amount. Please enter a valid amount or ensure you have outstanding debt.");
        }

        // Validate token balance for max repay
        if (isRepayingAll && (!tokenBalance || tokenBalance === 0n)) {
          throw new Error("No outstanding debt found. Cannot move position.");
        }

        // 1) Unlock debt using flash loan
        if (!selectedFlashLoanProvider) {
          throw new Error("No flash loan provider available");
        }
        builder.buildUnlockDebt({
          fromProtocol,
          debtToken: position.tokenAddress as `0x${string}`,
          expectedDebt: debtAmountStr,
          debtDecimals: decimals as number,
          flash: {
            version: selectedFlashLoanProvider.version,
            premiumBps: 9, // TODO: Fetch from on-chain for Aave v3
            bufferBps: 10, // Small buffer for interest accrual
          },
        });

        // 2) Move each collateral from source to target protocol
        for (const collateral of selectedCollateralsWithAmounts) {
          // Check if user selected max by comparing amount to maxAmount
          const isMax = collateral.amount === collateral.maxAmount;
          builder.buildMoveCollateral({
            fromProtocol,
            toProtocol: selectedProtocol,
            collateralToken: collateral.token as `0x${string}`,
            withdraw: isMax ? { max: true } : { amount: formatUnits(collateral.amount, collateral.decimals) },
            collateralDecimals: collateral.decimals,
          });
        }

        // 3) Borrow to cover flash loan repayment
        builder.buildBorrow({
          mode: "coverFlash",
          toProtocol: selectedProtocol,
          token: position.tokenAddress as `0x${string}`,
          decimals: decimals as number,
          extraBps: 5, // Small extra headroom
          approveToRouter: true,
        });

        // Execute the flow with automatic approvals (batched when supported)
        await executeFlowBatchedIfPossible(builder.build(), preferBatching, { revokePermissions });

        setStep("done");
        // Close modal after a short delay on success
        setTimeout(() => onClose(), 2000);
      } else {
        setError("Supply move not implemented yet");
        console.log("Supply move not implemented yet");
      }
    } catch (err: any) {
      console.error("Move debt failed:", err);
      setError(err.message || "Move position failed");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  };

  // Get action button text based on current step
  const getActionButtonText = () => {
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
  };

  // Get action button class based on current step
  const getActionButtonClass = () => {
    if (step === "done") {
      return "btn-success";
    }
    return "btn-primary";
  };

  // Handler for collateral selection and amount changes
  const handleCollateralSelectionChange = useCallback((collaterals: CollateralWithAmount[]) => {
    setSelectedCollateralsWithAmounts(collaterals);
  }, []);

  const isActionDisabled =
    loading ||
    !selectedProtocol ||
    !amount ||
    !!(tokenBalance && decimals && parseFloat(amount) > parseFloat(formattedTokenBalance)) ||
    !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
    step !== "idle";

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-5xl max-h-[90vh] min-h-[360px] p-6 rounded-none flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 h-full flex-grow">
          {/* FROM SECTION */}
          <div className="space-y-6 md:col-span-3">
            <div>
              <label className="text-sm font-medium text-base-content/80">From</label>
              <div className="flex items-center gap-3 h-14 border-b-2 border-base-300 px-1">
                <Image
                  src={getProtocolLogo(fromProtocol)}
                  alt={fromProtocol}
                  width={32}
                  height={32}
                  className="rounded-full min-w-[32px]"
                />
                <span className="truncate font-semibold text-lg">{fromProtocol}</span>
              </div>
            </div>
            {position.type === "borrow" && (
              <div className="mt-6">
                <CollateralSelector
                  collaterals={collateralsForSelector}
                  isLoading={isLoadingCollaterals || isLoadingCollateralSupport}
                  selectedProtocol={selectedProtocol}
                  onCollateralSelectionChange={handleCollateralSelectionChange}
                  marketToken={position.tokenAddress}
                  hideAmounts
                />
              </div>
            )}
          </div>

          {/* AMOUNTS SECTION */}
          <div className="space-y-6 md:col-span-6">
            <div>
              <div className="text-center mb-2">
                <label className="block text-lg font-semibold flex items-center justify-center gap-1">
                  Debt
                  {position.type === "supply" && <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />}
                </label>
                <div className="text-xs text-base-content/60">
                  Available: {formatDisplayNumber(formattedTokenBalance)} {position.name}
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
                  onClick={handleSetMaxAmount}
                  disabled={loading || step !== "idle"}
                >
                  MAX
                </button>
              </div>
            </div>
            {position.type === "borrow" && (
              <CollateralAmounts
                collaterals={selectedCollateralsWithAmounts}
                onChange={setSelectedCollateralsWithAmounts}
                selectedProtocol={selectedProtocol}
              />
            )}

            {error && (
              <div className="alert alert-error shadow-lg">
                <FiAlertTriangle className="w-6 h-6" />
                <div className="text-sm flex-1">{error}</div>
              </div>
            )}

            <div className="flex justify-between text-sm text-base-content/70">
              <span>Debt Value: ${formatDisplayNumber(debtUsdValue)}</span>
              {position.type === "borrow" && <span>Collateral Value: ${formatDisplayNumber(totalCollateralUsd)}</span>}
            </div>
          </div>

          {/* TO SECTION */}
          <div className="space-y-6 md:col-span-3">
            <div>
              <label className="text-sm font-medium text-base-content/80">To</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="border-b-2 border-base-300 py-3 px-1 flex items-center justify-between cursor-pointer h-14"
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
                    .filter(p => p.name !== fromProtocol)
                    .map(protocol => (
                      <li key={protocol.name}>
                        <button
                          className="flex items-center gap-3 py-2"
                          onClick={() => setSelectedProtocol(protocol.name)}
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

            {availableFlashLoanProviders.length > 0 && (
              <div>
                <label className="text-sm font-medium text-base-content/80">Flash Loan Provider</label>
                {availableFlashLoanProviders.length === 1 ? (
                  // Show as static display if only one provider available
                  <div className="flex items-center gap-3 h-14 border-b-2 border-base-300 px-1">
                    {selectedFlashLoanProvider && (
                      <>
                        <Image
                          src={selectedFlashLoanProvider.icon}
                          alt={selectedFlashLoanProvider.name}
                          width={32}
                          height={32}
                          className="rounded-full min-w-[32px]"
                        />
                        <span className="truncate font-semibold text-lg">{selectedFlashLoanProvider.name}</span>
                      </>
                    )}
                  </div>
                ) : (
                  // Show dropdown if multiple providers available
                  <div className="dropdown w-full">
                    <div
                      tabIndex={0}
                      className="border-b-2 border-base-300 py-3 px-1 flex items-center justify-between cursor-pointer h-14"
                    >
                      <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                        {selectedFlashLoanProvider && (
                          <>
                            <Image
                              src={selectedFlashLoanProvider.icon}
                              alt={selectedFlashLoanProvider.name}
                              width={32}
                              height={32}
                              className="rounded-full min-w-[32px]"
                            />
                            <span className="truncate font-semibold text-lg">{selectedFlashLoanProvider.name}</span>
                          </>
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
                      {availableFlashLoanProviders.map(provider => (
                        <li key={provider.name}>
                          <button
                            className="flex items-center gap-3 py-2"
                            onClick={() => setSelectedFlashLoanProvider(provider)}
                          >
                            <Image
                              src={provider.icon}
                              alt={provider.name}
                              width={32}
                              height={32}
                              className="rounded-full min-w-[32px]"
                            />
                            <span className="truncate text-lg">{provider.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 pt-6 mt-auto">
          {isPreferenceLoaded && (
            <div className="pb-1 flex flex-col items-end gap-1">
              <label className="label cursor-pointer gap-2 justify-end p-0">
                <input
                  type="checkbox"
                  checked={preferBatching}
                  onChange={(e) => setPreferBatching(e.target.checked)}
                  className="checkbox checkbox-sm"
                />
                <span className="label-text text-xs">Batch Transactions with Smart Account</span>
              </label>
              <label className="label cursor-pointer gap-2 justify-end p-0">
                <input
                  type="checkbox"
                  checked={revokePermissions}
                  onChange={(e) => setRevokePermissions(e.target.checked)}
                  className="checkbox checkbox-sm"
                />
                <span className="label-text text-xs">Revoke permissions after execution</span>
              </label>
            </div>
          )}
          <button
            className={`btn ${getActionButtonClass()} btn-lg w-60 h-14 flex justify-between shadow-md ${loading ? "animate-pulse" : ""
              }`}
            onClick={step === "done" ? onClose : handleMoveDebt}
            disabled={step === "done" ? false : isActionDisabled}
          >
            <span>
              {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
              {getActionButtonText()}
            </span>
            <span className="flex items-center gap-1 text-xs">
              <FaGasPump className="text-gray-400" />
            </span>
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
