import React, { FC, useState, useEffect, useMemo, createRef, RefObject } from "react";
import Image from "next/image";
import { FiRefreshCw, FiSearch, FiCheck } from "react-icons/fi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { Abi } from "abitype";

// Define types for collateral
export interface CollateralToken {
  symbol: string;
  balance: number;
  address: string;
  decimals: number;
  rawBalance: bigint;
  supported: boolean;
}

interface CollateralSwitchButtonProps {
  currentCollateral: {
    token: string;
    symbol: string;
  };
  protocol: string;
  marketToken: string; // Debt token address
  onCollateralSwitch: (tokenAddress: string, symbol: string) => void;
}

interface TokenSwitcherDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  targetCollateral: string;
  availableTokens: CollateralToken[];
  onSelectToken: (tokenAddress: string, symbol: string) => void;
  anchorRef: RefObject<HTMLButtonElement>;
  isLoading?: boolean;
  error?: string | null;
}

// Token Switcher Dropdown Component
const TokenSwitcherDropdown: FC<TokenSwitcherDropdownProps> = ({
  isOpen,
  onClose,
  targetCollateral,
  availableTokens,
  onSelectToken,
  anchorRef,
  isLoading = false,
  error = null,
}) => {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  
  // Calculate position on mount
  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    
    // Get button position and modal boundaries
    const buttonRect = anchorRef.current.getBoundingClientRect();
    const modalElement = anchorRef.current.closest('.modal-box') as HTMLElement;
    
    if (modalElement) {
      const modalRect = modalElement.getBoundingClientRect();
      
      // Estimate dropdown height
      const estimatedDropdownHeight = Math.min(
        350,
        availableTokens.length * 70 + 100
      );
      
      // Check available space below
      const spaceBelow = modalRect.bottom - buttonRect.bottom;
      
      // If not enough space below, position above
      if (spaceBelow < estimatedDropdownHeight) {
        setPosition('top');
      } else {
        setPosition('bottom');
      }
    }
  }, [isOpen, anchorRef, availableTokens.length]);
  
  // Filter tokens based on search input
  const filteredTokens = useMemo(() => {
    if (!search.trim()) return availableTokens;
    
    const searchLower = search.toLowerCase();
    return availableTokens.filter(token => 
      token.symbol.toLowerCase().includes(searchLower)
    );
  }, [availableTokens, search]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (
        anchorRef.current && 
        !anchorRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest('.token-switcher-dropdown')
      ) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);
  
  if (!isOpen) return null;
  
  // Compute styles based on position
  const dropdownStyles = position === 'top' 
    ? { 
        position: 'absolute' as const,
        bottom: '100%',
        left: 0,
        marginBottom: '8px',
      }
    : {
        position: 'absolute' as const,
        top: '100%',
        left: 0,
        marginTop: '8px',
      };
  
  return (
    <div 
      className="token-switcher-dropdown absolute z-50 bg-base-100 rounded-lg shadow-xl border border-base-300 w-[280px] max-h-[350px] overflow-hidden flex flex-col"
      style={dropdownStyles}
    >
      <div className="p-3 border-b border-base-200">
        <h3 className="font-medium mb-2">Switch Collateral</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search tokens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input input-sm input-bordered w-full pl-8"
            autoFocus
          />
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
        </div>
      </div>
      
      <div className="overflow-y-auto flex-1 p-2">
        {isLoading ? (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <span className="loading loading-spinner loading-md"></span>
            <span className="text-sm text-base-content/60 mt-2">Loading tokens...</span>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-error flex flex-col items-center justify-center">
            <div className="text-sm mb-1">{error}</div>
            <div className="text-xs text-base-content/50">
              Protocol: {targetCollateral ? targetCollateral.substring(0, 8) + "..." : "None"}
            </div>
          </div>
        ) : availableTokens.length === 0 ? (
          <div className="py-8 text-center text-base-content/50">
            No supported tokens found for this market
          </div>
        ) : filteredTokens.length > 0 ? (
          <div className="space-y-1">
            {filteredTokens.map(token => (
              <button
                key={token.address}
                className={`w-full py-2 px-3 rounded-md flex items-center gap-2 hover:bg-base-200 transition-colors ${
                  token.address === targetCollateral ? 'bg-primary/10 text-primary' : ''
                }`}
                onClick={() => {
                  onSelectToken(token.address, token.symbol);
                  onClose();
                }}
              >
                <div className="w-6 h-6 relative flex-shrink-0">
                  <Image
                    src={tokenNameToLogo(token.symbol)}
                    alt={token.symbol}
                    fill
                    className="rounded-full object-contain"
                  />
                </div>
                <div className="flex-1 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{token.symbol}</div>
                    <div className="text-xs text-base-content/60">
                      {token.balance > 0 ? `Balance: ${token.balance.toFixed(2)}` : 'No balance'}
                    </div>
                  </div>
                  {token.address === targetCollateral && (
                    <FiCheck className="text-primary" />
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-base-content/50">
            No tokens found matching &quot;{search}&quot;
          </div>
        )}
      </div>
      
      <div className="p-2 border-t border-base-200">
        <button
          className="btn btn-sm btn-block btn-ghost"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// Main Collateral Switch Button Component
export const CollateralSwitchButton: FC<CollateralSwitchButtonProps> = ({
  currentCollateral,
  protocol,
  marketToken,
  onCollateralSwitch,
}) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [selectedCollateral, setSelectedCollateral] = useState<{ token: string; symbol: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = createRef<HTMLButtonElement>();
  const { address: userAddress } = useAccount();
  
  // Validate parameters
  const isValidMarketToken = useMemo(() => {
    if (!marketToken) return false;
    // Basic validation to check if it's a valid Ethereum address
    // Should be a string starting with 0x and followed by 40 hex chars
    return /^0x[a-fA-F0-9]{40}$/.test(marketToken);
  }, [marketToken]);
  
  // Reset selectedCollateral when currentCollateral changes
  useEffect(() => {
    setSelectedCollateral(null);
  }, [currentCollateral.token]);
  
  // Reset error when dropdown opens/closes
  useEffect(() => {
    setError(null);
    
    // Set error if market token is invalid
    if (switcherOpen && !isValidMarketToken) {
      setError(`Invalid market token address: ${marketToken || 'undefined'}`);
    }
  }, [switcherOpen, isValidMarketToken, marketToken]);
  
  // Fetch supported collaterals from RouterGateway based on protocol and market
  const { data: supportedCollaterals, isLoading: isLoadingCollaterals, error: collatError } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getSupportedCollaterals",
    args: [protocol.toLowerCase(), marketToken],
    query: {
      enabled: switcherOpen && isValidMarketToken,
    },
  });

  // For testing/development: Uncomment to use mock data when marketToken is invalid
  // const mockCollaterals = useMemo(() => {
  //   if (isValidMarketToken) return undefined;
  //   return ["0x1234567890123456789012345678901234567890", "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"];
  // }, [isValidMarketToken]);
  
  // const supportedCollateralsToUse = isValidMarketToken ? supportedCollaterals : mockCollaterals;
  // const isLoadingCollateralsActual = isValidMarketToken ? isLoadingCollaterals : false;

  // Log collateral results for debugging
  useEffect(() => {
    if (switcherOpen) {
      console.log("[CollateralSwitchButton] Protocol:", protocol);
      console.log("[CollateralSwitchButton] MarketToken:", marketToken);
      console.log("[CollateralSwitchButton] Is valid market token:", isValidMarketToken);
      console.log("[CollateralSwitchButton] Collaterals fetched:", supportedCollaterals);
      console.log("[CollateralSwitchButton] Collateral error:", collatError);
    }
  }, [switcherOpen, supportedCollaterals, collatError, protocol, marketToken, isValidMarketToken]);
  
  // Set error if we have no collaterals but loading is done
  useEffect(() => {
    if (!isValidMarketToken && switcherOpen) {
      // Already handled above
    } else if (!isLoadingCollaterals && collatError) {
      setError("Error fetching supported collaterals");
    } else if (!isLoadingCollaterals && (!supportedCollaterals || supportedCollaterals.length === 0)) {
      setError("No supported collaterals found for this market");
    }
  }, [isLoadingCollaterals, supportedCollaterals, collatError, isValidMarketToken, switcherOpen]);

  // Fetch token metadata once we have the addresses
  const { data: tokenData, isLoading: isLoadingTokenData, error: tokenError } = useReadContracts({
    contracts: (supportedCollaterals || []).flatMap(address => [
      {
        address: address as `0x${string}`,
        abi: ERC20ABI as Abi,
        functionName: 'symbol',
      },
      {
        address: address as `0x${string}`,
        abi: ERC20ABI as Abi,
        functionName: 'decimals',
      },
      {
        address: address as `0x${string}`,
        abi: ERC20ABI as Abi,
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`],
      }
    ]),
    query: {
      enabled: switcherOpen && !!supportedCollaterals && supportedCollaterals.length > 0 && !!userAddress,
    },
  });
  
  // Log token data results for debugging
  useEffect(() => {
    if (switcherOpen && supportedCollaterals && supportedCollaterals.length > 0) {
      console.log("[CollateralSwitchButton] Token data:", tokenData);
      console.log("[CollateralSwitchButton] Token error:", tokenError);
    }
  }, [switcherOpen, tokenData, tokenError, supportedCollaterals]);
  
  // Set error if we have collaterals but token data failed
  useEffect(() => {
    if (!isLoadingTokenData && tokenError && supportedCollaterals && supportedCollaterals.length > 0) {
      setError("Error fetching token information");
    }
  }, [isLoadingTokenData, tokenError, supportedCollaterals]);
  
  // Format the collaterals into the expected format
  const formattedCollaterals = useMemo(() => {
    if (!supportedCollaterals) return [];
    
    const result: CollateralToken[] = [];
    
    // Handle case where token data isn't loaded yet but we have addresses
    if (!tokenData) {
      // Return partial data with placeholders
      return supportedCollaterals.map(address => ({
        symbol: "Loading...",
        balance: 0,
        address,
        decimals: 18,
        rawBalance: 0n,
        supported: true
      }));
    }
    
    for (let i = 0; i < supportedCollaterals.length; i++) {
      const address = supportedCollaterals[i];
      // Each token has 3 pieces of data (symbol, decimals, balance)
      const dataIndex = i * 3;
      
      if (dataIndex + 2 < tokenData.length) {
        const symbol = tokenData[dataIndex].result as string || "Unknown";
        const decimals = tokenData[dataIndex + 1].result as number || 18;
        const rawBalance = tokenData[dataIndex + 2].result as bigint || 0n;
        const balance = rawBalance ? Number(formatUnits(rawBalance, decimals)) : 0;
        
        result.push({
          symbol,
          balance,
          address,
          decimals,
          rawBalance,
          supported: true
        });
      } else {
        // Handle partial data
        result.push({
          symbol: "Unknown",
          balance: 0,
          address,
          decimals: 18,
          rawBalance: 0n,
          supported: true
        });
      }
    }
    
    // Log the final formatted collaterals
    console.log("[CollateralSwitchButton] Formatted collaterals:", result);
    
    return result;
  }, [supportedCollaterals, tokenData]);
  
  // Check if we're still loading data
  const isLoading = isLoadingCollaterals || isLoadingTokenData;
  
  // Handle selecting a collateral
  const handleCollateralSelect = (tokenAddress: string, symbol: string) => {
    setSelectedCollateral({ token: tokenAddress, symbol });
    onCollateralSwitch(tokenAddress, symbol);
  };
  
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        className={`btn btn-square btn-sm ${selectedCollateral ? 'p-0 overflow-hidden' : 'btn-ghost bg-base-200/80 text-base-content/70 hover:bg-primary/20 hover:text-primary'} transition-all opacity-50 cursor-not-allowed`}
        title="Collateral switching coming soon"
        onClick={() => { /* Feature not implemented yet */ }}
        disabled={true} // Always disabled
      >
        {selectedCollateral ? (
          <div className="relative w-full h-full">
            <Image
              src={tokenNameToLogo(selectedCollateral.symbol)}
              alt={selectedCollateral.symbol}
              fill
              className="rounded object-contain"
            />
            <div className="absolute top-0 right-0 bg-base-100 rounded-full p-0.5 shadow-sm">
              <FiRefreshCw className="w-2.5 h-2.5 text-primary" />
            </div>
          </div>
        ) : (
          <FiRefreshCw className="w-4 h-4" />
        )}
      </button>
      
      {switcherOpen && (
        <TokenSwitcherDropdown
          isOpen={true}
          onClose={() => setSwitcherOpen(false)}
          targetCollateral={currentCollateral.token}
          availableTokens={formattedCollaterals.filter(c => c.address !== currentCollateral.token)}
          onSelectToken={handleCollateralSelect}
          anchorRef={buttonRef}
          isLoading={isLoading}
          error={error}
        />
      )}
    </div>
  );
};

export default CollateralSwitchButton; 