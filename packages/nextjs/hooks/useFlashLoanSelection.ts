import { useState, useEffect, useRef, useCallback } from "react";
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
    const [selectedProvider, setSelectedProviderInternal] = useState<FlashLoanProviderOption | undefined>(undefined);
    // Track if user has manually selected a provider (don't auto-override)
    const userHasSelected = useRef(false);
    // Track the token to reset manual selection when token changes
    const prevTokenRef = useRef<string | undefined>(undefined);

    // Reset manual selection flag when token changes
    useEffect(() => {
        if (tokenAddress !== prevTokenRef.current) {
            userHasSelected.current = false;
            prevTokenRef.current = tokenAddress;
        }
    }, [tokenAddress]);

    // Wrap setSelectedProvider to track manual selection
    const setSelectedProvider = useCallback((provider: FlashLoanProviderOption) => {
        userHasSelected.current = true;
        setSelectedProviderInternal(provider);
    }, []);

    // Initialize with default or initial
    useEffect(() => {
        if (!selectedProvider && !userHasSelected.current) {
            if (initialProviderName) {
                const found = flashLoanProviders.find(p => p.name === initialProviderName);
                if (found) {
                    setSelectedProviderInternal(found);
                    return;
                }
            }
            if (defaultProvider) {
                setSelectedProviderInternal(defaultProvider);
            }
        }
    }, [flashLoanProviders, defaultProvider, initialProviderName, selectedProvider]);

    // Fetch liquidity
    const { liquidityData, isLoading } = useFlashLoanLiquidity(tokenAddress, amount, chainId);

    // Auto-select based on liquidity (only if user hasn't manually selected)
    useEffect(() => {
        // Don't auto-select if user has manually chosen
        if (userHasSelected.current) return;
        if (!liquidityData.length || amount === 0n) return;

        // Priority: Zero-fee providers first, then by reliability
        // Fees: BalancerV2=0%, Morpho=0%, BalancerV3=0%, Aave=0.05%, ZeroLend=0.05%
        const priority = [
            FlashLoanProvider.BalancerV2,  // 0% fee, most liquid
            FlashLoanProvider.Morpho,      // 0% fee
            FlashLoanProvider.BalancerV3,  // 0% fee
            FlashLoanProvider.Aave,        // 0.05% fee
            FlashLoanProvider.ZeroLend,    // 0.05% fee (Aave fork)
        ];

        // Find the best provider with sufficient liquidity
        const bestProviderEnum = priority.find(p => {
            const data = liquidityData.find(d => d.provider === p);
            return data && data.hasLiquidity;
        });

        if (bestProviderEnum !== undefined) {
            const providerOption = flashLoanProviders.find(p => p.providerEnum === bestProviderEnum);
            if (providerOption && providerOption.name !== selectedProvider?.name) {
                setSelectedProviderInternal(providerOption);
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
