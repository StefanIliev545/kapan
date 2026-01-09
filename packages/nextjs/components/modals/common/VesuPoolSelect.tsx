import React, { FC } from "react";
import type { VesuPools, VesuV1Pool, VesuV2Pool } from "./useRefinanceTypes";

/* ------------------------------ Types ------------------------------ */

export type VesuPoolSelectProps = {
  /** Currently selected Vesu version */
  selectedVersion: "v1" | "v2";
  /** Available Vesu pools */
  vesuPools: VesuPools;
  /** Pool name to exclude from selection (source pool) */
  sourcePoolName: string | null;
  /** Callback when version changes */
  onVersionChange: (version: "v1" | "v2") => void;
} & (
  | {
      /** EVM mode: use pool name strings */
      mode: "evm";
      selectedPool: string;
      onPoolChange: (poolName: string) => void;
    }
  | {
      /** Starknet mode: use pool ID/address */
      mode: "starknet";
      selectedPoolId?: bigint;
      selectedV2PoolAddress?: string;
      onPoolIdChange: (id: bigint) => void;
      onV2PoolAddressChange: (address: string) => void;
    }
);

/* ------------------------------ Helpers ------------------------------ */

/**
 * Filter pools excluding the source pool
 */
function filterPools<T extends { name: string }>(pools: T[], sourcePoolName: string | null): T[] {
  if (!sourcePoolName) return pools;
  return pools.filter(pool => pool.name !== sourcePoolName);
}

/**
 * Get pool options for rendering
 */
function getPoolOptions(
  vesuPools: VesuPools,
  selectedVersion: "v1" | "v2",
  sourcePoolName: string | null
): Array<{ name: string; value: string }> {
  const pools = selectedVersion === "v1" ? vesuPools.v1Pools : vesuPools.v2Pools;
  return filterPools(pools, sourcePoolName).map(pool => ({
    name: pool.name,
    value: pool.name,
  }));
}

/* ------------------------------ Component ------------------------------ */

/**
 * Vesu pool version toggle and pool selector
 *
 * Supports both EVM mode (string pool names) and Starknet mode (pool IDs/addresses)
 */
export const VesuPoolSelect: FC<VesuPoolSelectProps> = props => {
  const { selectedVersion, vesuPools, sourcePoolName, onVersionChange } = props;

  const poolOptions = getPoolOptions(vesuPools, selectedVersion, sourcePoolName);

  // Get current selected value for display
  const getCurrentValue = (): string => {
    if (props.mode === "evm") {
      return props.selectedPool;
    }
    // Starknet mode - find pool name from ID/address
    if (selectedVersion === "v1") {
      return vesuPools.v1Pools.find(p => p.id === props.selectedPoolId)?.name || "";
    }
    return vesuPools.v2Pools.find(p => p.address === props.selectedV2PoolAddress)?.name || "";
  };

  // Handle pool selection change
  const handlePoolChange = (poolName: string) => {
    if (props.mode === "evm") {
      props.onPoolChange(poolName);
    } else {
      // Starknet mode - convert pool name to ID/address
      if (selectedVersion === "v1") {
        const pool = vesuPools.v1Pools.find(p => p.name === poolName) as VesuV1Pool | undefined;
        if (pool?.id != null) {
          props.onPoolIdChange(pool.id);
        }
      } else {
        const pool = vesuPools.v2Pools.find(p => p.name === poolName) as VesuV2Pool | undefined;
        if (pool?.address) {
          props.onV2PoolAddressChange(pool.address);
        }
      }
    }
  };

  // Handle version toggle
  const handleVersionClick = (version: "v1" | "v2", e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedVersion === version) return;

    onVersionChange(version);

    // Auto-select first pool of new version (for Starknet mode)
    if (props.mode === "starknet") {
      if (version === "v1" && vesuPools.v1Pools[0]?.id) {
        props.onPoolIdChange(vesuPools.v1Pools[0].id);
      } else if (version === "v2" && vesuPools.v2Pools[0]?.address) {
        props.onV2PoolAddressChange(vesuPools.v2Pools[0].address);
      }
    }
  };

  return (
    <div className="ml-auto flex flex-shrink-0 flex-nowrap items-center gap-1">
      {/* Version toggle */}
      <div className="join join-xs flex-shrink-0">
        <button
          className={`btn btn-ghost btn-xs join-item ${selectedVersion === "v1" ? "btn-active" : ""}`}
          onClick={e => handleVersionClick("v1", e)}
        >
          V1
        </button>
        <button
          className={`btn btn-ghost btn-xs join-item ${selectedVersion === "v2" ? "btn-active" : ""}`}
          onClick={e => handleVersionClick("v2", e)}
        >
          V2
        </button>
      </div>

      {/* Pool select */}
      <select
        className="select select-bordered select-xs w-auto min-w-[100px] max-w-[140px] flex-shrink-0 text-xs"
        value={getCurrentValue()}
        onChange={e => {
          e.stopPropagation();
          handlePoolChange(e.target.value);
        }}
      >
        {poolOptions.map(pool => (
          <option key={pool.name} value={pool.value}>
            {pool.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default VesuPoolSelect;
