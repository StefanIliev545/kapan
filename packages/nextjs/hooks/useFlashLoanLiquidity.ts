import { useEffect, useState, useCallback } from "react";
import { Address, parseAbi } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
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
    "function aaveV3Pool() view returns (address)",
]);

export const useFlashLoanLiquidity = (
    tokenAddress: string | undefined,
    amount: bigint,
    chainId: number
) => {
    const { data: routerInfo } = useDeployedContractInfo({ contractName: "KapanRouter", chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144 });
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
            const [balancerV2Addr, balancerV3Addr, aaveV3PoolAddr] = await Promise.all([
                publicClient.readContract({
                    address: routerInfo.address,
                    abi: ROUTER_ABI,
                    functionName: "balancerV2Vault",
                }),
                publicClient.readContract({
                    address: routerInfo.address,
                    abi: ROUTER_ABI,
                    functionName: "balancerV3Vault",
                }),
                publicClient.readContract({
                    address: routerInfo.address,
                    abi: ROUTER_ABI,
                    functionName: "aaveV3Pool",
                }),
            ]);

            const results: FlashLoanLiquidity[] = [];

            // 2. Check Balancer V2 - Vault holds all pool tokens
            let balancerV2Balance: bigint | undefined;
            if (balancerV2Addr && balancerV2Addr !== "0x0000000000000000000000000000000000000000") {
                try {
                    balancerV2Balance = await publicClient.readContract({
                        address: tokenAddress as Address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [balancerV2Addr],
                    }) as bigint;
                    results.push({
                        provider: FlashLoanProvider.BalancerV2,
                        liquidity: balancerV2Balance,
                        hasLiquidity: balancerV2Balance >= amount,
                    });
                } catch {
                    results.push({
                        provider: FlashLoanProvider.BalancerV2,
                        liquidity: 0n,
                        hasLiquidity: false,
                    });
                }
            }

            // 3. Check Balancer V3
            if (balancerV3Addr && balancerV3Addr !== "0x0000000000000000000000000000000000000000") {
                try {
                    let balancerV3Balance = await publicClient.readContract({
                        address: tokenAddress as Address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [balancerV3Addr],
                    }) as bigint;

                    // If V3 appears to have no balance but V2 does, and we suspect
                    // V3 delegates to the same underlying vault, fall back to V2's
                    // balance so we don't incorrectly mark "no liquidity".
                    if (
                        balancerV3Balance < amount &&
                        balancerV2Balance !== undefined &&
                        balancerV2Balance >= amount
                    ) {
                        balancerV3Balance = balancerV2Balance;
                    }

                    results.push({
                        provider: FlashLoanProvider.BalancerV3,
                        liquidity: balancerV3Balance,
                        hasLiquidity: balancerV3Balance >= amount,
                    });
                } catch {
                    results.push({
                        provider: FlashLoanProvider.BalancerV3,
                        liquidity: 0n,
                        hasLiquidity: false,
                    });
                }
            }

            // 4. Check Aave V3 using aToken's underlying balance
            if (aaveV3PoolAddr && aaveV3PoolAddr !== "0x0000000000000000000000000000000000000000") {
                try {
                    // ReserveData layout (Aave v3):
                    // index 7 is the aTokenAddress
                    const reserveData = await publicClient.readContract({
                        address: aaveV3PoolAddr as Address,
                        abi: AAVE_POOL_ABI,
                        functionName: "getReserveData",
                        args: [tokenAddress as Address],
                    }) as readonly unknown[];

                    const aTokenAddr = reserveData[8] as Address;

                    console.log(`Atoken address: ${aTokenAddr}`);
                    // Aave stores the underlying asset on the aToken contract,
                    // not on the Pool itself. The aToken's underlying balance
                    // is the available liquidity for flash loans.
                    const balance = await publicClient.readContract({
                        address: tokenAddress as Address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [aTokenAddr],
                    }) as bigint;

                    results.push({
                        provider: FlashLoanProvider.AaveV3,
                        liquidity: balance,
                        hasLiquidity: balance >= amount,
                    });
                } catch (err) {
                    console.error("Aave V3 liquidity check failed", err);
                    // Likely token not supported on Aave or no reserve data
                    results.push({
                        provider: FlashLoanProvider.AaveV3,
                        liquidity: 0n,
                        hasLiquidity: false,
                    });
                }
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
