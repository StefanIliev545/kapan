import { useLocalStorage, booleanSerializer } from "./useLocalStorage";

const STORAGE_KEY = "kapan-batch-transactions-enabled";
const DEFAULT_VALUE = false; // Off by default

/**
 * Hook to manage the cached preference for batching transactions with smart accounts.
 * This preference is stored in localStorage and persists across sessions.
 */
export const useBatchingPreference = () => {
  const [enabled, setEnabled, { isLoaded }] = useLocalStorage<boolean>(
    STORAGE_KEY,
    DEFAULT_VALUE,
    booleanSerializer
  );

  return {
    enabled,
    setEnabled,
    isLoaded,
  };
};

