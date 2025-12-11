import { FC, useState } from "react";
import { Address } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAaveEMode } from "~~/hooks/useAaveEMode";
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
}

export const EModeToggle: FC<EModeToggleProps> = ({ chainId, onEModeChanged }) => {
  const { address: userAddress } = useAccount();
  const { userEModeId, userEMode, emodes, poolAddress, isLoading, refetchUserEMode } = useAaveEMode(chainId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSetEMode = async (categoryId: number) => {
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
  };

  // Refetch user E-Mode after successful transaction
  if (isSuccess && selectedCategoryId !== null) {
    refetchUserEMode();
    onEModeChanged?.();
    setSelectedCategoryId(null);
  }

  if (!userAddress) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/60">
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
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isProcessing}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all
          ${userEModeId > 0 
            ? "bg-primary/10 text-primary hover:bg-primary/20" 
            : "bg-base-200 text-base-content/60 hover:bg-base-300 hover:text-base-content"
          }
          ${isProcessing ? "opacity-50 cursor-wait" : "cursor-pointer"}
        `}
      >
        {isProcessing ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : (
          <Cog6ToothIcon className={`w-4 h-4 ${showDropdown ? "rotate-90" : ""} transition-transform`} />
        )}
        <span>E-Mode</span>
        <svg className={`w-3 h-3 transition-transform ${showDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-base-100 rounded-xl shadow-lg border border-base-300 z-50">
          <div className="p-3 border-b border-base-300">
            <h4 className="font-semibold text-sm">Efficiency Mode (E-Mode)</h4>
            <p className="text-xs text-base-content/60 mt-1">
              E-Mode allows higher LTV for correlated assets within the same category.
            </p>
          </div>

          <div className="p-2 max-h-64 overflow-y-auto">
            {/* Disable E-Mode option */}
            <button
              onClick={() => {
                handleSetEMode(0);
                setShowDropdown(false);
              }}
              disabled={isProcessing || userEModeId === 0}
              className={`
                w-full flex items-center justify-between p-2 rounded-lg text-left text-sm
                ${userEModeId === 0 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-base-200"
                }
                ${isProcessing ? "opacity-50" : ""}
              `}
            >
              <div>
                <span className="font-medium">Disabled</span>
                <p className="text-xs text-base-content/60">Normal LTV parameters</p>
              </div>
              {userEModeId === 0 && <CheckCircleIcon className="w-5 h-5 text-primary" />}
            </button>

            {/* E-Mode categories */}
            {emodes.filter(e => e.id > 0).map(emode => (
              <button
                key={emode.id}
                onClick={() => {
                  handleSetEMode(emode.id);
                  setShowDropdown(false);
                }}
                disabled={isProcessing || userEModeId === emode.id}
                className={`
                  w-full flex items-center justify-between p-2 rounded-lg text-left text-sm mt-1
                  ${userEModeId === emode.id 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-base-200"
                  }
                  ${isProcessing ? "opacity-50" : ""}
                `}
              >
                <div>
                  <span className="font-medium">{emode.label}</span>
                  <p className="text-xs text-base-content/60">
                    LTV: {(emode.ltv / 100).toFixed(0)}% • Liq: {(emode.liquidationThreshold / 100).toFixed(0)}%
                  </p>
                </div>
                {userEModeId === emode.id && <CheckCircleIcon className="w-5 h-5 text-primary" />}
              </button>
            ))}
          </div>

          {/* Warning */}
          <div className="p-3 border-t border-base-300 bg-warning/5">
            <div className="flex gap-2 text-xs text-warning">
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
              <p>
                Switching E-Mode may fail if you have incompatible borrows. 
                Repay non-category loans first.
              </p>
            </div>
          </div>

          {/* Error display */}
          {writeError && (
            <div className="p-3 border-t border-error/30 bg-error/5">
              <p className="text-xs text-error">
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
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

