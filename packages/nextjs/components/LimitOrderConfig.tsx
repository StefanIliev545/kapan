import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseAbi, Address } from "viem";
import { usePublicClient } from "wagmi";
import { 
  getCowFlashLoanProviders, 
  getPreferredFlashLoanLender,
  type CowFlashLoanProvider,
  calculateFlashLoanFee,
  MORPHO_BLUE,
  AAVE_V3_POOLS,
} from "~~/utils/cow";

// Balancer Vault addresses (same on all chains)
const BALANCER_V2_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const BALANCER_V3_VAULT = "0xbA1333333333a1BA1108E8412f11850A5C319bA9";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const AAVE_POOL_ABI = parseAbi([
  "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
]);

interface ProviderLiquidity {
  provider: CowFlashLoanProvider;
  liquidity: bigint;
  hasLiquidity: boolean;
  isLoading: boolean;
}

/**
 * Token info for display
 */
export interface LimitOrderToken {
  symbol: string;
  decimals: number;
  address: string;
}

/**
 * Result of limit order configuration
 */
export interface LimitOrderResult {
  /** Selected flash loan provider */
  selectedProvider: CowFlashLoanProvider | null;
  /** Whether to use flash loan mode */
  useFlashLoan: boolean;
  /** Number of chunks */
  numChunks: number;
  /** Size of each chunk (last chunk may be larger due to remainder) */
  chunkSize: bigint;
  /** All chunk sizes (accounts for remainder) */
  chunkSizes: bigint[];
  /** Flash loan lender address */
  flashLoanLender: string | null;
  /** Flash loan fee per chunk */
  flashLoanFee: bigint;
  /** Explanation text */
  explanation: string;
}

export interface LimitOrderConfigProps {
  /** Chain ID */
  chainId: number;
  /** Token being sold (flash loaned) */
  sellToken: LimitOrderToken;
  /** Total amount to process */
  totalAmount: bigint;
  /** Callback when configuration changes */
  onConfigChange: (config: LimitOrderResult) => void;
  /** Controlled: use flash loan state */
  useFlashLoan?: boolean;
  /** Controlled: set use flash loan callback */
  setUseFlashLoan?: (value: boolean) => void;
  /** Controlled: number of chunks */
  numChunks?: number;
  /** Controlled: set number of chunks callback */
  setNumChunks?: (value: number) => void;
  /** Show flash loan toggle (default: true) */
  showFlashLoanToggle?: boolean;
  /** Show chunks input (default: true) */
  showChunksInput?: boolean;
  /** Show provider selector (default: true) */
  showProviderSelect?: boolean;
  /** Default use flash loan - only used if not controlled (default: true) */
  defaultUseFlashLoan?: boolean;
  /** Default number of chunks - only used if not controlled (default: 1) */
  defaultChunks?: number;
  /** Compact mode - less padding/margins */
  compact?: boolean;
}

/**
 * Reusable limit order configuration component.
 * Handles flash loan provider selection, chunking, and displays relevant info.
 * 
 * Can be used as controlled or uncontrolled:
 * - Controlled: Pass useFlashLoan/setUseFlashLoan and numChunks/setNumChunks
 * - Uncontrolled: Omit these props, component manages its own state
 */
export const LimitOrderConfig: FC<LimitOrderConfigProps> = ({
  chainId,
  sellToken,
  totalAmount,
  onConfigChange,
  useFlashLoan: controlledUseFlashLoan,
  setUseFlashLoan: controlledSetUseFlashLoan,
  numChunks: controlledNumChunks,
  setNumChunks: controlledSetNumChunks,
  showFlashLoanToggle = true,
  showChunksInput = true,
  showProviderSelect = true,
  defaultUseFlashLoan = true,
  defaultChunks = 1,
  compact = false,
}) => {
  // Get available providers for this chain
  const providers = useMemo(() => getCowFlashLoanProviders(chainId), [chainId]);
  const publicClient = usePublicClient({ chainId });
  
  // Internal state (used when not controlled)
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [internalUseFlashLoan, setInternalUseFlashLoan] = useState(defaultUseFlashLoan);
  const [internalNumChunks, setInternalNumChunks] = useState(defaultChunks);
  const [liquidityData, setLiquidityData] = useState<ProviderLiquidity[]>([]);
  const [isLoadingLiquidity, setIsLoadingLiquidity] = useState(false);
  
  // Track if user has manually selected a provider
  const userHasSelected = useRef(false);
  // Track token to reset selection when it changes
  const prevTokenRef = useRef<string | undefined>(undefined);

  // Reset manual selection when token changes
  useEffect(() => {
    if (sellToken.address !== prevTokenRef.current) {
      userHasSelected.current = false;
      prevTokenRef.current = sellToken.address;
    }
  }, [sellToken.address]);

  // Determine if controlled or uncontrolled
  const isControlled = controlledUseFlashLoan !== undefined && controlledSetUseFlashLoan !== undefined;
  
  // Use controlled or internal state
  const useFlashLoan = isControlled ? controlledUseFlashLoan : internalUseFlashLoan;
  const setUseFlashLoan = isControlled ? controlledSetUseFlashLoan : setInternalUseFlashLoan;
  const numChunks = controlledNumChunks !== undefined ? controlledNumChunks : internalNumChunks;
  const setNumChunks = controlledSetNumChunks || setInternalNumChunks;

  // Fetch liquidity for all providers
  useEffect(() => {
    const fetchLiquidity = async () => {
      if (!publicClient || totalAmount === 0n || providers.length === 0) {
        setLiquidityData([]);
        return;
      }

      setIsLoadingLiquidity(true);
      const results: ProviderLiquidity[] = [];

      for (const provider of providers) {
        try {
          let liquidity = 0n;

          if (provider.provider === "morpho") {
            // Morpho: check token balance at Morpho singleton
            const morphoAddr = MORPHO_BLUE[chainId];
            if (morphoAddr) {
              liquidity = await publicClient.readContract({
                address: sellToken.address as Address,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [morphoAddr as Address],
              }) as bigint;
            }
          } else if (provider.provider === "balancerV2") {
            // Balancer V2: check token balance at Vault
            liquidity = await publicClient.readContract({
              address: sellToken.address as Address,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [BALANCER_V2_VAULT as Address],
            }) as bigint;
          } else if (provider.provider === "balancerV3") {
            // Balancer V3: check token balance at Vault
            liquidity = await publicClient.readContract({
              address: sellToken.address as Address,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [BALANCER_V3_VAULT as Address],
            }) as bigint;
          } else if (provider.provider === "aaveV3") {
            // Aave: get aToken address and check underlying balance
            const aavePool = AAVE_V3_POOLS[chainId];
            if (aavePool) {
              try {
                const reserveData = await publicClient.readContract({
                  address: aavePool as Address,
                  abi: AAVE_POOL_ABI,
                  functionName: "getReserveData",
                  args: [sellToken.address as Address],
                }) as readonly unknown[];
                const aTokenAddr = reserveData[8] as Address;
                liquidity = await publicClient.readContract({
                  address: sellToken.address as Address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [aTokenAddr],
                }) as bigint;
              } catch {
                // Token not supported on Aave
                liquidity = 0n;
              }
            }
          }

          results.push({
            provider,
            liquidity,
            hasLiquidity: liquidity >= totalAmount,
            isLoading: false,
          });
        } catch (err) {
          console.warn(`Failed to fetch liquidity for ${provider.name}:`, err);
          results.push({
            provider,
            liquidity: 0n,
            hasLiquidity: false,
            isLoading: false,
          });
        }
      }

      setLiquidityData(results);
      setIsLoadingLiquidity(false);
    };

    fetchLiquidity();
  }, [publicClient, sellToken.address, totalAmount, chainId, providers]);

  // Auto-select provider with sufficient liquidity (if user hasn't manually selected)
  useEffect(() => {
    if (userHasSelected.current) return;
    if (liquidityData.length === 0 || totalAmount === 0n) return;

    // Priority: 0% fee providers first (Morpho, Balancer V2/V3), then Aave
    const priority = ["morpho", "balancerV2", "balancerV3", "aaveV3"];
    
    const bestProvider = priority.find(p => {
      const data = liquidityData.find(d => d.provider.provider === p);
      return data && data.hasLiquidity;
    });

    if (bestProvider) {
      const idx = providers.findIndex(p => p.provider === bestProvider);
      if (idx !== -1 && idx !== selectedProviderIndex) {
        setSelectedProviderIndex(idx);
      }
    }
  }, [liquidityData, totalAmount, providers, selectedProviderIndex]);

  // Handle manual provider selection
  const handleProviderSelect = useCallback((idx: number) => {
    userHasSelected.current = true;
    setSelectedProviderIndex(idx);
  }, []);

  // Selected provider
  const selectedProvider = useMemo(() => {
    if (providers.length === 0) return null;
    return providers[selectedProviderIndex] || providers[0];
  }, [providers, selectedProviderIndex]);

  // Get liquidity status for selected provider
  const selectedProviderLiquidity = useMemo(() => {
    if (!selectedProvider) return null;
    return liquidityData.find(d => d.provider.address === selectedProvider.address);
  }, [selectedProvider, liquidityData]);

  // Calculate chunk sizes
  const { chunkSize, chunkSizes, flashLoanFee, explanation } = useMemo(() => {
    if (totalAmount === 0n || !useFlashLoan) {
      return {
        chunkSize: totalAmount,
        chunkSizes: [totalAmount],
        flashLoanFee: 0n,
        explanation: "Standard execution",
      };
    }

    const baseChunkSize = totalAmount / BigInt(numChunks);
    const remainder = totalAmount % BigInt(numChunks);
    
    // Build chunk sizes array - last chunk gets remainder
    const sizes = Array(numChunks).fill(baseChunkSize).map((size, i) => 
      i === numChunks - 1 ? size + remainder : size
    ) as bigint[];

    // Calculate fee
    const fee = selectedProvider 
      ? calculateFlashLoanFee(baseChunkSize, selectedProvider.provider)
      : 0n;

    const exp = numChunks === 1
      ? (fee > 0n 
          ? `Single tx execution (fee: ${formatUnits(fee, sellToken.decimals)} ${sellToken.symbol})`
          : "Single tx execution (no fee)")
      : `${numChunks} flash loan transactions (~30 min between chunks)`;

    return {
      chunkSize: baseChunkSize,
      chunkSizes: sizes,
      flashLoanFee: fee,
      explanation: exp,
    };
  }, [totalAmount, numChunks, useFlashLoan, selectedProvider, sellToken]);

  // Notify parent of config changes
  useEffect(() => {
    const lenderInfo = selectedProvider 
      ? getPreferredFlashLoanLender(chainId, selectedProvider.provider)
      : null;

    onConfigChange({
      selectedProvider,
      useFlashLoan,
      numChunks,
      chunkSize,
      chunkSizes,
      flashLoanLender: lenderInfo?.address || null,
      flashLoanFee,
      explanation,
    });
  }, [selectedProvider, useFlashLoan, numChunks, chunkSize, chunkSizes, flashLoanFee, explanation, chainId, onConfigChange]);

  // No providers available
  if (providers.length === 0) {
    return (
      <div className={`text-warning text-xs ${compact ? "" : "p-2"}`}>
        Flash loans not available on this chain for limit orders
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${compact ? "" : "p-2"}`}>
      {/* Provider Selector */}
      {showProviderSelect && providers.length > 1 && (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1">
            <span className="text-base-content/60 text-xs">Flash Loan Provider</span>
            {isLoadingLiquidity && (
              <span className="loading loading-spinner loading-xs opacity-50" />
            )}
          </div>
          <div className="flex gap-1">
            {providers.map((provider, idx) => {
              const liq = liquidityData.find(d => d.provider.address === provider.address);
              const hasLiquidity = liq?.hasLiquidity ?? true; // Assume yes if unknown
              const noLiquidity = liq && !liq.hasLiquidity;
              
              return (
                <button
                  key={provider.address}
                  onClick={() => handleProviderSelect(idx)}
                  className={`btn btn-xs ${
                    selectedProviderIndex === idx 
                      ? noLiquidity ? "btn-warning" : "btn-primary"
                      : noLiquidity 
                        ? "btn-ghost opacity-40 line-through" 
                        : "btn-ghost opacity-60 hover:opacity-100"
                  }`}
                  title={`${provider.name} - ${provider.feeBps === 0 ? "No fee" : `${provider.feeBps / 100}% fee`}${noLiquidity ? " (insufficient liquidity)" : ""}`}
                >
                  {provider.name.replace(" Blue", "").replace(" V2", "").replace(" V3", "")}
                  {provider.feeBps === 0 && hasLiquidity && (
                    <span className="ml-1 text-success text-[9px]">0%</span>
                  )}
                  {noLiquidity && (
                    <span className="ml-1 text-warning text-[9px]">!</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Single provider display */}
      {showProviderSelect && providers.length === 1 && selectedProvider && (
        <div className="flex justify-between items-center">
          <span className="text-base-content/60 text-xs">Flash Loan Provider</span>
          <span className="text-xs">
            {selectedProvider.name}
            {selectedProvider.feeBps === 0 && (
              <span className="ml-1 text-success">(0% fee)</span>
            )}
          </span>
        </div>
      )}

      {/* Liquidity warning */}
      {selectedProviderLiquidity && !selectedProviderLiquidity.hasLiquidity && totalAmount > 0n && (
        <div className="flex items-start gap-1.5 text-[10px] text-warning">
          <svg className="w-3 h-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            {selectedProvider?.name} may not have enough {sellToken.symbol} liquidity. 
            Try another provider.
          </span>
        </div>
      )}

      {/* Flash Loan Toggle */}
      {showFlashLoanToggle && (
        <div className="flex justify-between items-center">
          <span className="text-base-content/60 text-xs">Use Flash Loan</span>
          <input
            type="checkbox"
            checked={useFlashLoan}
            onChange={e => setUseFlashLoan(e.target.checked)}
            className="toggle toggle-primary toggle-xs"
          />
        </div>
      )}

      {/* Chunks Input */}
      {showChunksInput && useFlashLoan && (
        <div className="flex justify-between items-center">
          <span className="text-base-content/60 text-xs">Chunks</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={999}
              value={numChunks}
              onChange={e => setNumChunks(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              className="input input-bordered input-xs w-16 text-right"
            />
            {numChunks > 1 && (
              <span className="text-[10px] text-base-content/50">
                ~{formatUnits(chunkSize, sellToken.decimals)} {sellToken.symbol}/chunk
              </span>
            )}
          </div>
        </div>
      )}

      {/* Explanation */}
      {useFlashLoan && (
        <div className="flex items-start gap-1.5 text-[10px]">
          <svg className="w-3 h-3 shrink-0 mt-0.5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <span className="text-success font-medium">
              {numChunks === 1 ? "Single transaction execution" : `${numChunks} flash loan transactions`}
            </span>
            <p className="text-base-content/50 mt-0.5">
              {numChunks === 1 
                ? "Solver takes flash loan, swaps, you borrow to repay. All in one tx."
                : "Each chunk executes as independent flash loan. ~30 min between chunks for price discovery."
              }
              {flashLoanFee === 0n && " No flash loan fee."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LimitOrderConfig;
