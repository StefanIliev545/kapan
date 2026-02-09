import { useEffect, useState, useCallback } from "react";
import { Address, parseAbi, keccak256, toHex } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { FlashLoanProvider } from "~~/utils/flashLoan";
import { usePublicClient } from "wagmi";

export interface FlashLoanLiquidity {
    provider: FlashLoanProvider;
    liquidity: bigint;
    hasLiquidity: boolean;
}

const ERC20_ABI = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
]);

const AAVE_POOL_ABI = parseAbi([
    "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
]);

const ROUTER_ABI = parseAbi([
    "function balancerV2Vault() view returns (address)",
    "function balancerV3Vault() view returns (address)",
    "function aaveCompatiblePools(bytes32 key) view returns (address)",
    "function morphoBlue() view returns (address)",
]);

// Keys used in KapanRouter for aaveCompatiblePools mapping
const AAVE_POOL_KEY = keccak256(toHex("aave"));
const ZEROLEND_POOL_KEY = keccak256(toHex("zerolend"));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlashLoanPublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

/** Check if a provider address is valid (non-null, non-zero) */
function isValidProviderAddress(addr: unknown): addr is string {
    return typeof addr === "string" && addr !== ZERO_ADDRESS && addr.length > 0;
}

/** Build a FlashLoanLiquidity result entry */
function makeLiquidityResult(provider: FlashLoanProvider, liquidity: bigint, amount: bigint): FlashLoanLiquidity {
    return { provider, liquidity, hasLiquidity: liquidity >= amount };
}

/** Build a zero-liquidity result (used on errors) */
function makeZeroLiquidity(provider: FlashLoanProvider): FlashLoanLiquidity {
    return { provider, liquidity: 0n, hasLiquidity: false };
}

/** Fetch ERC20 balance at a given holder address */
async function fetchTokenBalance(client: FlashLoanPublicClient, token: Address, holder: string): Promise<bigint> {
    return await client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [holder as Address],
    }) as bigint;
}

/** Check liquidity for a simple balance-based provider (Balancer V2, V3, Morpho) */
async function checkBalanceBasedLiquidity(
    client: FlashLoanPublicClient,
    tokenAddress: Address,
    providerAddr: string,
    provider: FlashLoanProvider,
    amount: bigint,
): Promise<{ result: FlashLoanLiquidity; balance?: bigint }> {
    try {
        const balance = await fetchTokenBalance(client, tokenAddress, providerAddr);
        return { result: makeLiquidityResult(provider, balance, amount), balance };
    } catch {
        return { result: makeZeroLiquidity(provider) };
    }
}

/** Check Aave-compatible pool liquidity via aToken balance. */
async function checkAaveCompatibleLiquidity(
    client: FlashLoanPublicClient, tokenAddress: Address,
    poolAddr: string, provider: FlashLoanProvider, amount: bigint,
): Promise<FlashLoanLiquidity> {
    try {
        const reserveData = await client.readContract({
            address: poolAddr as Address, abi: AAVE_POOL_ABI,
            functionName: "getReserveData", args: [tokenAddress],
        }) as readonly unknown[];
        const balance = await fetchTokenBalance(client, tokenAddress, reserveData[8] as Address);
        return makeLiquidityResult(provider, balance, amount);
    } catch (err) {
        console.error(`${FlashLoanProvider[provider]} check failed`, err);
        return makeZeroLiquidity(provider);
    }
}

/** V3 fallback to V2 balance when V3 insufficient. */
function applyBalancerV3Fallback(
    v3Result: FlashLoanLiquidity, v3Bal: bigint | undefined,
    v2Bal: bigint | undefined, amount: bigint,
): FlashLoanLiquidity {
    if (v3Bal !== undefined && v3Bal < amount && v2Bal !== undefined && v2Bal >= amount) {
        return makeLiquidityResult(FlashLoanProvider.BalancerV3, v2Bal, amount);
    }
    return v3Result;
}

export const useFlashLoanLiquidity = (
    tokenAddress: string | undefined,
    amount: bigint,
    chainId: number
) => {
    // Note: chainId cast includes all supported EVM chains
    const { data: routerInfo } = useDeployedContractInfo({ contractName: "KapanRouter", chainId: chainId as 1 | 31337 | 42161 | 10 | 8453 | 59144 | 9745 });
    const publicClient = usePublicClient({ chainId });

    const [liquidityData, setLiquidityData] = useState<FlashLoanLiquidity[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Reset liquidity data when token changes to avoid showing stale data
    useEffect(() => {
        setLiquidityData([]);
    }, [tokenAddress, chainId]);

    const fetchLiquidity = useCallback(async () => {
        if (!tokenAddress || !routerInfo || !publicClient || amount === 0n) return;

        setIsLoading(true);
        try {
            // 1. Get Provider Addresses from Router
            const [balancerV2Addr, balancerV3Addr, aaveV3PoolAddr, zeroLendPoolAddr, morphoBlueAddr] = await Promise.all([
                publicClient.readContract({ address: routerInfo.address, abi: ROUTER_ABI, functionName: "balancerV2Vault" }).catch(() => ZERO_ADDRESS),
                publicClient.readContract({ address: routerInfo.address, abi: ROUTER_ABI, functionName: "balancerV3Vault" }).catch(() => ZERO_ADDRESS),
                publicClient.readContract({ address: routerInfo.address, abi: ROUTER_ABI, functionName: "aaveCompatiblePools", args: [AAVE_POOL_KEY] }).catch(() => ZERO_ADDRESS),
                publicClient.readContract({ address: routerInfo.address, abi: ROUTER_ABI, functionName: "aaveCompatiblePools", args: [ZEROLEND_POOL_KEY] }).catch(() => ZERO_ADDRESS),
                publicClient.readContract({ address: routerInfo.address, abi: ROUTER_ABI, functionName: "morphoBlue" }).catch(() => ZERO_ADDRESS),
            ]);

            const token = tokenAddress as Address;
            const results: FlashLoanLiquidity[] = [];

            // 2. Check Balancer V2
            let v2Balance: bigint | undefined;
            if (isValidProviderAddress(balancerV2Addr)) {
                const v2 = await checkBalanceBasedLiquidity(publicClient, token, balancerV2Addr, FlashLoanProvider.BalancerV2, amount);
                v2Balance = v2.balance;
                results.push(v2.result);
            }

            // 3. Check Balancer V3 (with V2 fallback for shared vaults)
            if (isValidProviderAddress(balancerV3Addr)) {
                const v3 = await checkBalanceBasedLiquidity(publicClient, token, balancerV3Addr, FlashLoanProvider.BalancerV3, amount);
                results.push(applyBalancerV3Fallback(v3.result, v3.balance, v2Balance, amount));
            }

            // 4. Check Aave V3
            if (isValidProviderAddress(aaveV3PoolAddr)) {
                results.push(await checkAaveCompatibleLiquidity(publicClient, token, aaveV3PoolAddr, FlashLoanProvider.Aave, amount));
            }

            // 5. Check ZeroLend (Aave fork)
            if (isValidProviderAddress(zeroLendPoolAddr)) {
                results.push(await checkAaveCompatibleLiquidity(publicClient, token, zeroLendPoolAddr, FlashLoanProvider.ZeroLend, amount));
            }

            // 6. Check Morpho Blue
            if (isValidProviderAddress(morphoBlueAddr)) {
                const morpho = await checkBalanceBasedLiquidity(publicClient, token, morphoBlueAddr, FlashLoanProvider.Morpho, amount);
                results.push(morpho.result);
            }

            setLiquidityData(results);

        } catch (error) {
            console.error("Error fetching flash loan liquidity:", error);
        } finally {
            setIsLoading(false);
        }
    }, [tokenAddress, routerInfo, publicClient, amount]);

    // Re-fetch when token or amount changes
    useEffect(() => {
        fetchLiquidity();
    }, [fetchLiquidity, tokenAddress, amount]);

    return { liquidityData, isLoading, refetch: fetchLiquidity };
};
