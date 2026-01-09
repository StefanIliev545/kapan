import { FC, useEffect, useState } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAccount, useWriteContract } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

// ABI for Comptroller enterMarkets function
const COMPTROLLER_ABI = [
  {
    inputs: [
      {
        internalType: "address[]",
        name: "vTokens",
        type: "address[]"
      }
    ],
    name: "enterMarkets",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vToken",
        type: "address"
      }
    ],
    name: "exitMarket",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

interface VenusMarketEntryProps {
  vTokenAddress: string;
  comptrollerAddress: string;
  tokenSymbol: string;
}

export const VenusMarketEntry: FC<VenusMarketEntryProps> = ({
  vTokenAddress,
  comptrollerAddress,
  tokenSymbol,
}) => {
  const { address: userAddress } = useAccount();
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Check membership status using VenusGateway
  const { data: membershipStatus, isLoading: isCheckingMembership, refetch: refetchMembership } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "checkMembership",
    args: [userAddress || "0x0000000000000000000000000000000000000000", vTokenAddress || "0x0000000000000000000000000000000000000000"],
  });

  // Set up direct Comptroller contract call for enterMarkets and exitMarket using wagmi
  const { writeContractAsync, isPending } = useWriteContract();

  // Update local state when membership data changes
  useEffect(() => {
    if (membershipStatus !== undefined) {
      setIsMember(membershipStatus);
    }
  }, [membershipStatus]);

  // Handle the market entry action
  const handleMarketEntry = async () => {
    if (!userAddress || isMember || isEntering || !comptrollerAddress) return;
    
    try {
      setIsEntering(true);
      await writeContractAsync({
        address: comptrollerAddress as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: 'enterMarkets',
        args: [[vTokenAddress]]
      });
      await refetchMembership();
    } catch (error) {
      console.error("Failed to enter market:", error);
    } finally {
      setIsEntering(false);
    }
  };

  // Handle the market exit action
  const handleMarketExit = async () => {
    if (!userAddress || !isMember || isExiting || !comptrollerAddress) return;
    
    try {
      setIsExiting(true);
      await writeContractAsync({
        address: comptrollerAddress as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: 'exitMarket',
        args: [vTokenAddress]
      });
      await refetchMembership();
    } catch (error) {
      console.error("Failed to exit market:", error);
    } finally {
      setIsExiting(false);
    }
  };

  // If we're still loading or no wallet is connected, show a neutral state
  if (isCheckingMembership || !userAddress) {
    return (
      <div className="ml-2 cursor-not-allowed opacity-50">
        <div className="bg-base-300 flex size-5 items-center justify-center rounded-full">
          <span className="text-xs">?</span>
        </div>
      </div>
    );
  }

  // If the user is a member, show a clickable green checkmark
  if (isMember) {
    const tip = `${tokenSymbol}: Enabled as collateral.\nClick to disable (exit market).`;
    return (
      <div 
        className="tooltip ml-2 flex cursor-pointer items-center"
        onClick={handleMarketExit}
        aria-label={tip}
      >
        <div className={`size-5 rounded-full${isExiting || isPending ? 'bg-warning/20' : 'bg-success/20'} ${isExiting || isPending ? 'text-warning' : 'text-success'} hover:bg-base-300 flex items-center justify-center transition-colors`}>
          {isExiting || isPending ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </div>
      </div>
    );
  }

  // If not a member, show an actionable red X
  const tip = `${tokenSymbol}: Not enabled as collateral.\nClick to enable (enter market).`;
  return (
    <div 
      className="tooltip ml-2 flex cursor-pointer items-center"
      onClick={handleMarketEntry}
      aria-label={tip}
    >
      <div className={`size-5 rounded-full${isEntering || isPending ? 'bg-warning/20' : 'bg-error/20'} ${isEntering || isPending ? 'text-warning' : 'text-error'} hover:bg-base-300 flex items-center justify-center transition-colors`}>
        {isEntering || isPending ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : (
          <XMarkIcon className="size-3.5" />
        )}
      </div>
    </div>
  );
}; 