import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Options for useLocalStorage hook
 */
export interface UseLocalStorageOptions<T> {
  /** Serialize function (defaults to JSON.stringify) */
  serialize?: (value: T) => string;
  /** Deserialize function (defaults to JSON.parse) */
  deserialize?: (value: string) => T;
  /** Sync across browser tabs (default: true) */
  syncTabs?: boolean;
}

/**
 * Type-safe localStorage hook with SSR support, error handling, and cross-tab sync.
 *
 * @param key - The localStorage key
 * @param defaultValue - Default value when key doesn't exist
 * @param options - Optional configuration
 * @returns [value, setValue, { isLoaded, remove }]
 *
 * @example
 * // Simple string storage
 * const [name, setName] = useLocalStorage("user-name", "");
 *
 * @example
 * // Object storage with type safety
 * interface Settings { theme: string; notifications: boolean }
 * const [settings, setSettings] = useLocalStorage<Settings>("settings", { theme: "dark", notifications: true });
 *
 * @example
 * // Boolean preference
 * const [enabled, setEnabled, { isLoaded }] = useLocalStorage("feature-enabled", false);
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, (value: T | ((prev: T) => T)) => void, { isLoaded: boolean; remove: () => void }] {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    syncTabs = true,
  } = options;

  const [storedValue, setStoredValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use ref to track if this is initial mount to avoid unnecessary localStorage reads
  const initializedRef = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      const item = localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(deserialize(item));
      }
    } catch (error) {
      console.warn(`[useLocalStorage] Failed to read "${key}":`, error);
    } finally {
      setIsLoaded(true);
    }
  }, [key, deserialize]);

  // Handle cross-tab sync
  useEffect(() => {
    if (!syncTabs) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== key) return;

      try {
        if (e.newValue === null) {
          setStoredValue(defaultValue);
        } else {
          setStoredValue(deserialize(e.newValue));
        }
      } catch (error) {
        console.warn(`[useLocalStorage] Failed to sync "${key}" from storage event:`, error);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key, defaultValue, deserialize, syncTabs]);

  // Setter function that also persists to localStorage
  const setValue = useCallback(
    (valueOrFn: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = typeof valueOrFn === "function"
          ? (valueOrFn as (prev: T) => T)(prev)
          : valueOrFn;

        try {
          localStorage.setItem(key, serialize(newValue));
        } catch (error) {
          console.warn(`[useLocalStorage] Failed to save "${key}":`, error);
        }

        return newValue;
      });
    },
    [key, serialize]
  );

  // Remove function to clear the key
  const remove = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setStoredValue(defaultValue);
    } catch (error) {
      console.warn(`[useLocalStorage] Failed to remove "${key}":`, error);
    }
  }, [key, defaultValue]);

  return [storedValue, setValue, { isLoaded, remove }];
}

/**
 * Read-only localStorage hook for cases where you only need to read a value.
 * Useful when the value is set elsewhere (e.g., in a utility function).
 *
 * @param key - The localStorage key
 * @param defaultValue - Default value when key doesn't exist
 * @returns { value, isLoaded, refetch }
 */
export function useLocalStorageValue<T>(
  key: string,
  defaultValue: T,
  options: Pick<UseLocalStorageOptions<T>, "deserialize" | "syncTabs"> = {}
): { value: T; isLoaded: boolean; refetch: () => void } {
  const { deserialize = JSON.parse, syncTabs = true } = options;

  const [value, setValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  const refetch = useCallback(() => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) {
        setValue(deserialize(item));
      } else {
        setValue(defaultValue);
      }
    } catch (error) {
      console.warn(`[useLocalStorageValue] Failed to read "${key}":`, error);
      setValue(defaultValue);
    }
  }, [key, defaultValue, deserialize]);

  useEffect(() => {
    refetch();
    setIsLoaded(true);
  }, [refetch]);

  useEffect(() => {
    if (!syncTabs) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== key) return;
      refetch();
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key, syncTabs, refetch]);

  return { value, isLoaded, refetch };
}

// ============================================================================
// Storage utility functions for non-hook contexts
// ============================================================================

/**
 * Safely get a value from localStorage with type coercion.
 * Use this in utility functions, event handlers, or class methods where hooks cannot be used.
 *
 * @param key - The localStorage key
 * @param defaultValue - Default value if key doesn't exist or parse fails
 * @param deserialize - Custom deserializer (defaults to JSON.parse)
 * @returns The stored value or default
 *
 * @example
 * const theme = getStorageItem("theme", "dark");
 * const settings = getStorageItem<Settings>("settings", { notifications: true });
 */
export function getStorageItem<T>(
  key: string,
  defaultValue: T,
  deserialize: (value: string) => T = JSON.parse
): T {
  if (typeof window === "undefined") return defaultValue;

  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return deserialize(item);
  } catch (error) {
    console.warn(`[getStorageItem] Failed to read "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Safely set a value in localStorage.
 * Use this in utility functions, event handlers, or class methods where hooks cannot be used.
 *
 * @param key - The localStorage key
 * @param value - Value to store
 * @param serialize - Custom serializer (defaults to JSON.stringify)
 * @returns true if successful, false otherwise
 *
 * @example
 * setStorageItem("theme", "dark");
 * setStorageItem("settings", { notifications: true });
 */
export function setStorageItem<T>(
  key: string,
  value: T,
  serialize: (value: T) => string = JSON.stringify
): boolean {
  if (typeof window === "undefined") return false;

  try {
    localStorage.setItem(key, serialize(value));
    return true;
  } catch (error) {
    console.warn(`[setStorageItem] Failed to save "${key}":`, error);
    return false;
  }
}

/**
 * Safely remove a key from localStorage.
 *
 * @param key - The localStorage key to remove
 * @returns true if successful, false otherwise
 */
export function removeStorageItem(key: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`[removeStorageItem] Failed to remove "${key}":`, error);
    return false;
  }
}

// ============================================================================
// Specialized serializers for common types
// ============================================================================

/**
 * String serializer (no JSON wrapper)
 */
export const stringSerializer = {
  serialize: (value: string) => value,
  deserialize: (value: string) => value,
};

/**
 * Boolean serializer (string "true"/"false")
 */
export const booleanSerializer = {
  serialize: (value: boolean) => String(value),
  deserialize: (value: string) => value === "true",
};

/**
 * Number serializer
 */
export const numberSerializer = {
  serialize: (value: number) => String(value),
  deserialize: (value: string) => Number(value),
};
