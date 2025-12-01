import { useEffect, useState, useCallback } from "react";
import { Address, createPublicClient, http, parseAbi } from "viem";
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
    const { data: routerInfo } = useDeployedContractInfo({ contractName: "KapanRouter", chainId });
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

            const checks: Promise<FlashLoanLiquidity>[] = [];

            // 2. Check Balancer V2
            if (balancerV2Addr && balancerV2Addr !== "0x0000000000000000000000000000000000000000") {
                checks.push(
                    publicClient.readContract({
                        address: tokenAddress as Address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [balancerV2Addr],
                    }).then(balance => ({
                        provider: FlashLoanProvider.BalancerV2,
                        liquidity: balance,
                        hasLiquidity: balance >= amount,
                    })).catch(() => ({
                        provider: FlashLoanProvider.BalancerV2,
                        liquidity: 0n,
                        hasLiquidity: false,
                    }))
                );
            }

            // 3. Check Balancer V3
            if (balancerV3Addr && balancerV3Addr !== "0x0000000000000000000000000000000000000000") {
                checks.push(
                    publicClient.readContract({
                        address: tokenAddress as Address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [balancerV3Addr],
                    }).then(balance => ({
                        provider: FlashLoanProvider.BalancerV3,
                        liquidity: balance,
                        hasLiquidity: balance >= amount,
                    })).catch(() => ({
                        provider: FlashLoanProvider.BalancerV3,
                        liquidity: 0n,
                        hasLiquidity: false,
                    }))
                );
            }

            // 4. Check Aave V3
            if (aaveV3PoolAddr && aaveV3PoolAddr !== "0x0000000000000000000000000000000000000000") {
                checks.push(
                    (async () => {
                        try {
                            // Get aToken address
                            const reserveData = await publicClient.readContract({
                                address: aaveV3PoolAddr,
                                abi: AAVE_POOL_ABI,
                                functionName: "getReserveData",
                                args: [tokenAddress as Address],
                            });

                            // reserveData[7] is aTokenAddress
                            const aTokenAddress = reserveData[7];

                            // Check balance of aToken (which holds the underlying)
                            const balance = await publicClient.readContract({
                                address: tokenAddress as Address,
                                abi: ERC20_ABI,
                                functionName: "balanceOf",
                                args: [aTokenAddress],
                            });

                            return {
                                provider: FlashLoanProvider.AaveV3,
                                liquidity: balance,
                                hasLiquidity: balance >= amount,
                            };
                        } catch (e) {
                            // Likely token not supported on Aave
                            return {
                                provider: FlashLoanProvider.AaveV3,
                                liquidity: 0n,
                                hasLiquidity: false,
                            };
                        }
                    })()
                );
            }

            const results = await Promise.all(checks);
            setLiquidityData(results);

        } catch (error) {
            console.error("Error fetching flash loan liquidity:", error);
        } finally {
            setIsLoading(false);
        }
    }, [tokenAddress, routerInfo, publicClient, amount, chainId]);

    // Re-fetch when token or amount changes
    useEffect(() => {
        fetchLiquidity();
    }, [fetchLiquidity, tokenAddress, amount]);

    return { liquidityData, isLoading, refetch: fetchLiquidity };
};
