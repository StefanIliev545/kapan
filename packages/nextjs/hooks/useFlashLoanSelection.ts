import { useState, useEffect, useMemo } from "react";
import { parseUnits } from "viem";
import { FlashLoanProviderOption } from "./useMovePositionData";
import { useFlashLoanLiquidity } from "./useFlashLoanLiquidity";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";

interface UseFlashLoanSelectionProps {
    flashLoanProviders: FlashLoanProviderOption[];
    defaultProvider?: FlashLoanProviderOption;
    tokenAddress?: string;
    amount: bigint;
    chainId: number;
    initialProviderName?: string;
}

export const useFlashLoanSelection = ({
    flashLoanProviders,
    defaultProvider,
    tokenAddress,
    amount,
    chainId,
    initialProviderName
}: UseFlashLoanSelectionProps) => {
    const [selectedProvider, setSelectedProvider] = useState<FlashLoanProviderOption | undefined>(undefined);

    // Initialize with default or initial
    useEffect(() => {
        if (!selectedProvider) {
            if (initialProviderName) {
                const found = flashLoanProviders.find(p => p.name === initialProviderName);
                if (found) {
                    setSelectedProvider(found);
                    return;
                }
            }
            if (defaultProvider) {
                setSelectedProvider(defaultProvider);
            }
        }
    }, [flashLoanProviders, defaultProvider, initialProviderName, selectedProvider]);

    // Fetch liquidity
    const { liquidityData, isLoading } = useFlashLoanLiquidity(tokenAddress, amount, chainId);

    // Auto-select based on liquidity
    useEffect(() => {
        if (!liquidityData.length || amount === 0n) return;

        // Priority: Balancer V3 > Balancer V2 > Aave V3
        const priority = [
            FlashLoanProvider.BalancerV3,
            FlashLoanProvider.BalancerV2,
            FlashLoanProvider.AaveV3
        ];

        // Find the best provider with sufficient liquidity
        const bestProviderEnum = priority.find(p => {
            const data = liquidityData.find(d => d.provider === p);
            return data && data.hasLiquidity;
        });

        if (bestProviderEnum !== undefined) {
            const providerOption = flashLoanProviders.find(p => p.providerEnum === bestProviderEnum);
            // Only switch if the current selection is different (and we want to enforce "best" available)
            // Or maybe we only switch if the *current* one is NOT sufficient?
            // The user requested "auto pick one that has [balance]".
            // Let's stick to the logic: if we find a better one (higher priority with liquidity), pick it.
            // But we should respect manual selection if it's valid?
            // For now, let's keep the aggressive auto-select which ensures success.
            if (providerOption && providerOption.name !== selectedProvider?.name) {
                setSelectedProvider(providerOption);
            }
        }
    }, [liquidityData, amount, flashLoanProviders, selectedProvider]);

    return {
        selectedProvider,
        setSelectedProvider,
        liquidityData,
        isLoading
    };
};
