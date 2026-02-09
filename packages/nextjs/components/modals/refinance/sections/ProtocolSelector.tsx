import React, { FC, memo, useCallback, useMemo } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { VesuPoolSelect } from "../../common/VesuPoolSelect";
import { useTabState, useProtocolState, useFlashLoanState } from "../RefinanceContext";
import type { Protocol, FlashLoanProvider, VesuPools } from "../../common/useRefinanceTypes";

/* ------------------------------ Protocol Tile ------------------------------ */

type ProtocolTileProps = {
  protocol: Protocol;
  isSelected: boolean;
  isVesu: boolean;
  vesuPools?: VesuPools;
  selectedVersion: "v1" | "v2";
  sourcePoolName: string | null;
  setSelectedVersion: (v: "v1" | "v2") => void;
  selectedPool?: string;
  setSelectedPool?: (pool: string) => void;
  selectedPoolId?: bigint;
  selectedV2PoolAddress?: string;
  onPoolIdChange: (id: bigint) => void;
  onV2PoolAddressChange: (addr: string) => void;
  onSelect: (name: string) => void;
};

const ProtocolTile = memo<ProtocolTileProps>(({
  protocol,
  isSelected,
  isVesu,
  vesuPools,
  selectedVersion,
  sourcePoolName,
  setSelectedVersion,
  selectedPool,
  setSelectedPool,
  selectedPoolId,
  selectedV2PoolAddress,
  onPoolIdChange,
  onV2PoolAddressChange,
  onSelect,
}) => {
  const shouldExpand = isSelected && isVesu && vesuPools;
  const handleClick = useCallback(() => {
    onSelect(protocol.name);
  }, [onSelect, protocol.name]);

  return (
    <div
      className={`${shouldExpand ? "col-span-2 sm:col-span-3" : "col-span-1"} border p-2 ${isSelected ? "border-primary bg-primary/10" : "border-base-300"} cursor-pointer rounded transition-all`}
      onClick={handleClick}
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <Image src={protocol.logo} alt={protocol.name} width={24} height={24} className="flex-shrink-0 rounded" />
        <span className="flex-shrink-0 whitespace-nowrap text-sm">{protocol.name}</span>

        {(isSelected && isVesu && vesuPools) && (
          selectedPool !== undefined && setSelectedPool ? (
            <VesuPoolSelect
              mode="evm"
              selectedVersion={selectedVersion}
              vesuPools={vesuPools}
              sourcePoolName={sourcePoolName}
              onVersionChange={setSelectedVersion}
              selectedPool={selectedPool}
              onPoolChange={setSelectedPool}
            />
          ) : (
            <VesuPoolSelect
              mode="starknet"
              selectedVersion={selectedVersion}
              vesuPools={vesuPools}
              sourcePoolName={sourcePoolName}
              onVersionChange={setSelectedVersion}
              selectedPoolId={selectedPoolId}
              selectedV2PoolAddress={selectedV2PoolAddress}
              onPoolIdChange={onPoolIdChange}
              onV2PoolAddressChange={onV2PoolAddressChange}
            />
          )
        )}
      </div>
    </div>
  );
});
ProtocolTile.displayName = "ProtocolTile";

/* ------------------------------ Flash Loan Provider Button ------------------------------ */

type FlashLoanProviderButtonProps = {
  provider: FlashLoanProvider;
  isSelected: boolean;
  onSelect: (name: string) => void;
};

const FlashLoanProviderButton = memo<FlashLoanProviderButtonProps>(({
  provider,
  isSelected,
  onSelect,
}) => {
  const displayName = provider.name.replace(/\sV[0-9]+$/i, "");
  const handleClick = useCallback(() => {
    onSelect(provider.name);
  }, [onSelect, provider.name]);

  return (
    <button
      onClick={handleClick}
      className={`rounded border p-2 text-left ${isSelected ? "border-primary bg-primary/10" : "border-base-300"}`}
    >
      <div className="flex items-center gap-2">
        <Image src={provider.icon} alt={provider.name} width={20} height={20} className="rounded" />
        <span className="text-sm">{displayName}</span>
      </div>
    </button>
  );
});
FlashLoanProviderButton.displayName = "FlashLoanProviderButton";

/* ------------------------------ Protocol Selector ------------------------------ */

export type ProtocolSelectorProps = {
  /** Currently active tab */
  activeTab: "protocol" | "flashloan";
  /** Callback to change active tab */
  setActiveTab: (tab: "protocol" | "flashloan") => void;
  /** Whether to show flash loan tab */
  showFlashLoanTab: boolean;
  /** Available destination protocols */
  filteredDestinationProtocols: Protocol[];
  /** Currently selected protocol name */
  selectedProtocol: string;
  /** Callback to select a protocol */
  setSelectedProtocol: (protocol: string) => void;
  /** Selected Vesu version */
  selectedVersion: "v1" | "v2";
  /** Callback to change Vesu version */
  setSelectedVersion: (version: "v1" | "v2") => void;
  /** Vesu pool options */
  vesuPools?: VesuPools;
  /** Source pool name for filtering */
  sourcePoolName: string | null;
  /** EVM-specific: selected pool string */
  selectedPool?: string;
  /** EVM-specific: callback to set selected pool */
  setSelectedPool?: (pool: string) => void;
  /** Starknet-specific: selected pool ID */
  selectedPoolId?: bigint;
  /** Starknet-specific: callback to set pool ID */
  setSelectedPoolId?: (id: bigint) => void;
  /** Starknet-specific: selected V2 pool address */
  selectedV2PoolAddress?: string;
  /** Starknet-specific: callback to set V2 pool address */
  setSelectedV2PoolAddress?: (address: string) => void;
  /** Available flash loan providers (EVM only) */
  flashLoanProviders: FlashLoanProvider[];
  /** Currently selected flash loan provider */
  selectedProvider: string;
  /** Callback to select flash loan provider */
  setSelectedProvider: (provider: string) => void;
};

/**
 * Internal component that renders the protocol selector UI
 */
const ProtocolSelectorUI: FC<{
  activeTab: "protocol" | "flashloan";
  showFlashLoanTab: boolean;
  filteredDestinationProtocols: Protocol[];
  selectedProtocol: string;
  selectedVersion: "v1" | "v2";
  vesuPools?: VesuPools;
  sourcePoolName: string | null;
  selectedPool?: string;
  setSelectedPool?: (pool: string) => void;
  selectedPoolId?: bigint;
  selectedV2PoolAddress?: string;
  flashLoanProviders: FlashLoanProvider[];
  selectedProvider: string;
  onTabClick: (tab: "protocol" | "flashloan") => void;
  onProtocolSelect: (name: string) => void;
  onVersionChange: (v: "v1" | "v2") => void;
  onPoolIdChange: (id: bigint) => void;
  onV2PoolAddressChange: (addr: string) => void;
  onProviderSelect: (name: string) => void;
}> = memo(({
  activeTab,
  showFlashLoanTab,
  filteredDestinationProtocols,
  selectedProtocol,
  selectedVersion,
  vesuPools,
  sourcePoolName,
  selectedPool,
  setSelectedPool,
  selectedPoolId,
  selectedV2PoolAddress,
  flashLoanProviders,
  selectedProvider,
  onTabClick,
  onProtocolSelect,
  onVersionChange,
  onPoolIdChange,
  onV2PoolAddressChange,
  onProviderSelect,
}) => {
  // Motion animation constants
  const motionInitial = useMemo(() => ({ opacity: 0, x: -12 }), []);
  const motionAnimate = useMemo(() => ({ opacity: 1, x: 0 }), []);
  const motionExit = useMemo(() => ({ opacity: 0, x: 12 }), []);
  const motionTransition = useMemo(() => ({ duration: 0.15 }), []);

  const handleProtocolTabClick = useCallback(() => {
    onTabClick("protocol");
  }, [onTabClick]);

  const handleFlashLoanTabClick = useCallback(() => {
    onTabClick("flashloan");
  }, [onTabClick]);

  return (
    <div className="space-y-2">
      <div className="border-base-300 flex items-center gap-6 border-b">
        <button
          className={`mb-[-1px] border-b-2 pb-2 ${activeTab === "protocol" ? "border-primary" : "text-base-content/60 border-transparent"}`}
          onClick={handleProtocolTabClick}
        >
          Destination Protocol
        </button>
        {showFlashLoanTab && (
          <button
            className={`mb-[-1px] border-b-2 pb-2 ${activeTab === "flashloan" ? "border-primary" : "text-base-content/60 border-transparent"}`}
            onClick={handleFlashLoanTabClick}
          >
            Flash Loan Provider
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "protocol" ? (
          <motion.div
            key="protocol"
            initial={motionInitial}
            animate={motionAnimate}
            exit={motionExit}
            transition={motionTransition}
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {filteredDestinationProtocols.map(p => (
              <ProtocolTile
                key={p.name}
                protocol={p}
                isSelected={selectedProtocol === p.name}
                isVesu={p.name === "Vesu"}
                vesuPools={vesuPools}
                selectedVersion={selectedVersion}
                sourcePoolName={sourcePoolName}
                setSelectedVersion={onVersionChange}
                selectedPool={selectedPool}
                setSelectedPool={setSelectedPool}
                selectedPoolId={selectedPoolId}
                selectedV2PoolAddress={selectedV2PoolAddress}
                onPoolIdChange={onPoolIdChange}
                onV2PoolAddressChange={onV2PoolAddressChange}
                onSelect={onProtocolSelect}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="flashloan"
            initial={motionInitial}
            animate={motionAnimate}
            exit={motionExit}
            transition={motionTransition}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5"
          >
            {flashLoanProviders.map(p => (
              <FlashLoanProviderButton
                key={`${p.name}-${p.version}`}
                provider={p}
                isSelected={selectedProvider === p.name}
                onSelect={onProviderSelect}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
ProtocolSelectorUI.displayName = "ProtocolSelectorUI";

/**
 * ProtocolSelector handles destination protocol and flash loan provider selection
 * with animated tab switching.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const ProtocolSelector: FC<Partial<ProtocolSelectorProps>> = memo((props) => {
  // Check if we have all required props
  const hasAllProps = props.activeTab !== undefined &&
    props.setActiveTab !== undefined &&
    props.showFlashLoanTab !== undefined &&
    props.filteredDestinationProtocols !== undefined &&
    props.selectedProtocol !== undefined &&
    props.setSelectedProtocol !== undefined &&
    props.selectedVersion !== undefined &&
    props.setSelectedVersion !== undefined &&
    props.sourcePoolName !== undefined &&
    props.flashLoanProviders !== undefined &&
    props.selectedProvider !== undefined &&
    props.setSelectedProvider !== undefined;

  let tabState: {
    activeTab: "protocol" | "flashloan";
    setActiveTab: (tab: "protocol" | "flashloan") => void;
    showFlashLoanTab: boolean;
  };

  let protocolState: {
    filteredDestinationProtocols: Protocol[];
    selectedProtocol: string;
    setSelectedProtocol: (protocol: string) => void;
    selectedVersion: "v1" | "v2";
    setSelectedVersion: (version: "v1" | "v2") => void;
    vesuPools?: VesuPools;
    sourcePoolName: string | null;
    selectedPool?: string;
    setSelectedPool?: (pool: string) => void;
    selectedPoolId?: bigint;
    setSelectedPoolId?: (id: bigint) => void;
    selectedV2PoolAddress?: string;
    setSelectedV2PoolAddress?: (address: string) => void;
  };

  let flashLoanState: {
    providers: FlashLoanProvider[];
    selectedProvider: string;
    setSelectedProvider: (provider: string) => void;
  };

  if (hasAllProps) {
    // Use props directly
    tabState = {
      activeTab: props.activeTab!,
      setActiveTab: props.setActiveTab!,
      showFlashLoanTab: props.showFlashLoanTab!,
    };
    protocolState = {
      filteredDestinationProtocols: props.filteredDestinationProtocols!,
      selectedProtocol: props.selectedProtocol!,
      setSelectedProtocol: props.setSelectedProtocol!,
      selectedVersion: props.selectedVersion!,
      setSelectedVersion: props.setSelectedVersion!,
      vesuPools: props.vesuPools,
      sourcePoolName: props.sourcePoolName!,
      selectedPool: props.selectedPool,
      setSelectedPool: props.setSelectedPool,
      selectedPoolId: props.selectedPoolId,
      setSelectedPoolId: props.setSelectedPoolId,
      selectedV2PoolAddress: props.selectedV2PoolAddress,
      setSelectedV2PoolAddress: props.setSelectedV2PoolAddress,
    };
    flashLoanState = {
      providers: props.flashLoanProviders!,
      selectedProvider: props.selectedProvider!,
      setSelectedProvider: props.setSelectedProvider!,
    };
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tabState = useTabState();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    protocolState = useProtocolState();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    flashLoanState = useFlashLoanState();
  }

  const { activeTab, setActiveTab, showFlashLoanTab } = tabState;
  const {
    filteredDestinationProtocols,
    selectedProtocol,
    setSelectedProtocol,
    selectedVersion,
    setSelectedVersion,
    vesuPools,
    sourcePoolName,
    selectedPool,
    setSelectedPool,
    selectedPoolId,
    setSelectedPoolId,
    selectedV2PoolAddress,
    setSelectedV2PoolAddress,
  } = protocolState;
  const { providers: flashLoanProviders, selectedProvider, setSelectedProvider } = flashLoanState;

  // Handler for Vesu pool selection (Starknet mode)
  const handlePoolIdChange = useCallback(
    (id: bigint) => {
      setSelectedPoolId?.(id);
    },
    [setSelectedPoolId],
  );

  const handleV2PoolAddressChange = useCallback(
    (addr: string) => {
      setSelectedV2PoolAddress?.(addr);
    },
    [setSelectedV2PoolAddress],
  );

  return (
    <ProtocolSelectorUI
      activeTab={activeTab}
      showFlashLoanTab={showFlashLoanTab}
      filteredDestinationProtocols={filteredDestinationProtocols}
      selectedProtocol={selectedProtocol}
      selectedVersion={selectedVersion}
      vesuPools={vesuPools}
      sourcePoolName={sourcePoolName}
      selectedPool={selectedPool}
      setSelectedPool={setSelectedPool}
      selectedPoolId={selectedPoolId}
      selectedV2PoolAddress={selectedV2PoolAddress}
      flashLoanProviders={flashLoanProviders}
      selectedProvider={selectedProvider}
      onTabClick={setActiveTab}
      onProtocolSelect={setSelectedProtocol}
      onVersionChange={setSelectedVersion}
      onPoolIdChange={handlePoolIdChange}
      onV2PoolAddressChange={handleV2PoolAddressChange}
      onProviderSelect={setSelectedProvider}
    />
  );
});

ProtocolSelector.displayName = "ProtocolSelector";
