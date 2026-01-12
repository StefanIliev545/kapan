import { FC, useState, useCallback } from "react";
import { Address } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAaveLikeEMode, AaveLikeViewContractName, AaveLikeWriteContractName } from "~~/hooks/useAaveEMode";
import { CheckCircleIcon, ExclamationTriangleIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";

// Aave V3 Pool ABI for setUserEMode
const POOL_ABI = [
  {
    inputs: [{ internalType: "uint8", name: "categoryId", type: "uint8" }],
    name: "setUserEMode",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

interface EModeToggleProps {
  chainId?: number;
  onEModeChanged?: () => void;
  viewContractName?: AaveLikeViewContractName;
  writeContractName?: AaveLikeWriteContractName;
}

// Sub-component for E-Mode option button
interface EModeOptionButtonProps {
  id: number;
  label: string;
  description: string;
  isActive: boolean;
  isProcessing: boolean;
  onSelect: (id: number) => void;
}

const EModeOptionButton: FC<EModeOptionButtonProps> = ({
  id,
  label,
  description,
  isActive,
  isProcessing,
  onSelect,
}) => {
  const handleClick = useCallback(() => {
    onSelect(id);
  }, [onSelect, id]);

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing || isActive}
      className={`
        ${id === 0 ? '' : 'mt-1'} flex w-full items-center justify-between rounded-lg p-2 text-left text-sm
        ${isActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-base-200"
        }
        ${isProcessing ? "opacity-50" : ""}
      `}
    >
      <div>
        <span className="font-medium">{label}</span>
        <p className="text-base-content/60 text-xs">{description}</p>
      </div>
      {isActive && <CheckCircleIcon className="text-primary size-5" />}
    </button>
  );
};

export const EModeToggle: FC<EModeToggleProps> = ({
  chainId,
  onEModeChanged,
  viewContractName = "AaveGatewayView",
  writeContractName = "AaveGatewayWrite"
}) => {
  const { address: userAddress } = useAccount();
  const { userEModeId, emodes, poolAddress, isLoading, refetchUserEMode } = useAaveLikeEMode(chainId, viewContractName, writeContractName);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSetEMode = useCallback(async (categoryId: number) => {
    if (!poolAddress || !userAddress) return;

    try {
      setSelectedCategoryId(categoryId);
      writeContract({
        address: poolAddress as Address,
        abi: POOL_ABI,
        functionName: "setUserEMode",
        args: [categoryId],
      });
    } catch (e) {
      console.error("Failed to set E-Mode:", e);
    }
  }, [poolAddress, userAddress, writeContract]);

  // Refetch user E-Mode after successful transaction
  if (isSuccess && selectedCategoryId !== null) {
    refetchUserEMode();
    onEModeChanged?.();
    setSelectedCategoryId(null);
  }

  const toggleDropdown = useCallback(() => {
    setShowDropdown(prev => !prev);
  }, []);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
  }, []);

  const handleSelectEMode = useCallback((categoryId: number) => {
    handleSetEMode(categoryId);
    setShowDropdown(false);
  }, [handleSetEMode]);

  if (!userAddress) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="text-base-content/60 flex items-center gap-2 text-sm">
        <span className="loading loading-spinner loading-xs"></span>
        Loading E-Mode...
      </div>
    );
  }

  const isProcessing = isPending || isConfirming;

  return (
    <div className="relative">
      {/* E-Mode button */}
      <button
        onClick={toggleDropdown}
        disabled={isProcessing}
        className={`
          flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all
          ${userEModeId > 0
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "bg-base-200 text-base-content/60 hover:bg-base-300 hover:text-base-content"
          }
          ${isProcessing ? "cursor-wait opacity-50" : "cursor-pointer"}
        `}
      >
        {isProcessing ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : (
          <Cog6ToothIcon className={`size-4 ${showDropdown ? "rotate-90" : ""} transition-transform`} />
        )}
        <span>E-Mode</span>
        <svg className={`size-3 transition-transform${showDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="bg-base-100 border-base-300 absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border shadow-lg">
          <div className="border-base-300 border-b p-3">
            <h4 className="text-sm font-semibold">Efficiency Mode (E-Mode)</h4>
            <p className="text-base-content/60 mt-1 text-xs">
              E-Mode allows higher LTV for correlated assets within the same category.
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {/* Disable E-Mode option */}
            <EModeOptionButton
              id={0}
              label="Disabled"
              description="Normal LTV parameters"
              isActive={userEModeId === 0}
              isProcessing={isProcessing}
              onSelect={handleSelectEMode}
            />

            {/* E-Mode categories */}
            {emodes.filter(e => e.id > 0).map(emode => (
              <EModeOptionButton
                key={emode.id}
                id={emode.id}
                label={emode.label}
                description={`LTV: ${(emode.ltv / 100).toFixed(0)}% - Liq: ${(emode.liquidationThreshold / 100).toFixed(0)}%`}
                isActive={userEModeId === emode.id}
                isProcessing={isProcessing}
                onSelect={handleSelectEMode}
              />
            ))}
          </div>

          {/* Warning */}
          <div className="border-base-300 bg-warning/5 border-t p-3">
            <div className="text-warning flex gap-2 text-xs">
              <ExclamationTriangleIcon className="size-4 flex-shrink-0" />
              <p>
                Switching E-Mode may fail if you have incompatible borrows.
                Repay non-category loans first.
              </p>
            </div>
          </div>

          {/* Error display */}
          {writeError && (
            <div className="border-error/30 bg-error/5 border-t p-3">
              <p className="text-error text-xs">
                {writeError.message.includes("revert")
                  ? "Transaction failed - you may have incompatible borrows"
                  : writeError.message
                }
              </p>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeDropdown}
        />
      )}
    </div>
  );
};
