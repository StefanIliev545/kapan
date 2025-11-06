import { useState, useEffect } from "react";

const STORAGE_KEY = "kapan-batch-transactions-enabled";
const DEFAULT_VALUE = false; // Off by default

/**
 * Hook to manage the cached preference for batching transactions with smart accounts.
 * This preference is stored in localStorage and persists across sessions.
 */
export const useBatchingPreference = () => {
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_VALUE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setEnabled(stored === "true");
      }
    } catch (error) {
      console.warn("Failed to load batching preference from localStorage:", error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage when preference changes
  const setPreference = (value: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
      setEnabled(value);
    } catch (error) {
      console.warn("Failed to save batching preference to localStorage:", error);
    }
  };

  return {
    enabled,
    setEnabled: setPreference,
    isLoaded,
  };
};

