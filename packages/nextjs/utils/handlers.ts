/**
 * Shared event handler utilities for consistent form handling across components.
 *
 * These utilities eliminate repetitive inline handler patterns and provide
 * type-safe, reusable event handlers for common UI interactions.
 */
import { ChangeEvent, MouseEvent, useCallback } from "react";

// ============================================================================
// Input Change Handlers
// ============================================================================

/**
 * Creates a handler for text input changes that updates state with the input value.
 * Replaces: `onChange={e => setState(e.target.value)}`
 *
 * @param setter - State setter function
 * @returns Change event handler
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState("");
 * <input onChange={createTextChangeHandler(setSearch)} />
 * ```
 */
export function createTextChangeHandler(
  setter: (value: string) => void
): (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void {
  return (e) => setter(e.target.value);
}

/**
 * Creates a handler for checkbox changes that updates state with the checked value.
 * Replaces: `onChange={(e) => setEnabled(e.target.checked)}`
 *
 * @param setter - State setter function
 * @returns Change event handler
 *
 * @example
 * ```tsx
 * const [enabled, setEnabled] = useState(false);
 * <input type="checkbox" onChange={createCheckboxHandler(setEnabled)} />
 * ```
 */
export function createCheckboxHandler(
  setter: (value: boolean) => void
): (e: ChangeEvent<HTMLInputElement>) => void {
  return (e) => setter(e.target.checked);
}

/**
 * Creates a handler for number input changes that parses and updates state.
 * Replaces: `onChange={e => setSlippage(parseFloat(e.target.value))}`
 *
 * @param setter - State setter function
 * @param options - Configuration options
 * @returns Change event handler
 *
 * @example
 * ```tsx
 * const [slippage, setSlippage] = useState(0.5);
 * <input type="number" onChange={createNumberChangeHandler(setSlippage)} />
 * ```
 */
export function createNumberChangeHandler(
  setter: (value: number) => void,
  options: {
    /** Use parseInt instead of parseFloat */
    integer?: boolean;
    /** Minimum allowed value */
    min?: number;
    /** Maximum allowed value */
    max?: number;
    /** Default value if parsing fails */
    defaultValue?: number;
  } = {}
): (e: ChangeEvent<HTMLInputElement>) => void {
  const { integer = false, min, max, defaultValue = 0 } = options;
  return (e) => {
    const parsed = integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
    let value = isNaN(parsed) ? defaultValue : parsed;

    if (min !== undefined) value = Math.max(min, value);
    if (max !== undefined) value = Math.min(max, value);

    setter(value);
  };
}

/**
 * Creates a handler for select element changes with type casting.
 * Replaces: `onChange={(e) => setRouter(e.target.value as RouterType)}`
 *
 * @param setter - State setter function
 * @returns Change event handler
 *
 * @example
 * ```tsx
 * const [router, setRouter] = useState<SwapRouter>("1inch");
 * <select onChange={createSelectHandler<SwapRouter>(setRouter)}>
 * ```
 */
export function createSelectHandler<T extends string>(
  setter: (value: T) => void
): (e: ChangeEvent<HTMLSelectElement>) => void {
  return (e) => setter(e.target.value as T);
}

// ============================================================================
// Click Handlers
// ============================================================================

/**
 * Creates a handler that stops event propagation.
 * Replaces: `onClick={e => e.stopPropagation()}`
 *
 * Useful for preventing click events from bubbling up in nested interactive elements.
 *
 * @returns Click event handler that stops propagation
 *
 * @example
 * ```tsx
 * <div onClick={handleParentClick}>
 *   <button onClick={stopPropagation}>Nested Button</button>
 * </div>
 * ```
 */
export const stopPropagation = (e: MouseEvent): void => {
  e.stopPropagation();
};

/**
 * Creates a handler that both stops propagation and executes a callback.
 * Replaces: `onClick={e => { e.stopPropagation(); handleClick(); }}`
 *
 * @param callback - Function to execute after stopping propagation
 * @returns Click event handler
 *
 * @example
 * ```tsx
 * <button onClick={createStopPropagationHandler(() => setOpen(!open))}>
 *   Toggle
 * </button>
 * ```
 */
export function createStopPropagationHandler(
  callback: () => void
): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation();
    callback();
  };
}

/**
 * Creates a toggle handler for boolean state.
 * Replaces: `onClick={() => setIsOpen(!isOpen)}`
 *
 * @param setter - State setter function that accepts a callback
 * @returns Click event handler
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * <button onClick={createToggleHandler(setIsOpen)}>Toggle</button>
 * ```
 */
export function createToggleHandler(
  setter: (updater: (prev: boolean) => boolean) => void
): () => void {
  return () => setter((prev) => !prev);
}

/**
 * Creates a setter handler for setting a specific value.
 * Replaces: `onClick={() => setValue(newValue)}`
 *
 * @param setter - State setter function
 * @param value - Value to set
 * @returns Click event handler
 *
 * @example
 * ```tsx
 * <button onClick={createSetterHandler(setMode, "dark")}>Dark Mode</button>
 * ```
 */
export function createSetterHandler<T>(
  setter: (value: T) => void,
  value: T
): () => void {
  return () => setter(value);
}

// ============================================================================
// Compound Handlers
// ============================================================================

/**
 * Creates a handler for amount input with optional max flag reset.
 * Common pattern in token input fields.
 * Replaces:
 * ```tsx
 * onChange={(e) => {
 *   setAmount(e.target.value);
 *   setIsMax(false);
 * }}
 * ```
 *
 * @param setAmount - Amount state setter
 * @param setIsMax - Optional max flag state setter
 * @returns Change event handler
 *
 * @example
 * ```tsx
 * <input onChange={createAmountInputHandler(setAmount, setIsMax)} />
 * ```
 */
export function createAmountInputHandler(
  setAmount: (value: string) => void,
  setIsMax?: (value: boolean) => void
): (e: ChangeEvent<HTMLInputElement>) => void {
  return (e) => {
    setAmount(e.target.value);
    if (setIsMax) {
      setIsMax(false);
    }
  };
}

// ============================================================================
// React Hooks for Handlers
// ============================================================================

/**
 * Hook that returns a memoized text change handler.
 *
 * @param setter - State setter function
 * @returns Memoized change event handler
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState("");
 * const handleSearchChange = useTextChangeHandler(setSearch);
 * <input onChange={handleSearchChange} />
 * ```
 */
export function useTextChangeHandler(
  setter: (value: string) => void
): (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void {
  return useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setter(e.target.value);
  }, [setter]);
}

/**
 * Hook that returns a memoized checkbox change handler.
 *
 * @param setter - State setter function
 * @returns Memoized change event handler
 *
 * @example
 * ```tsx
 * const [enabled, setEnabled] = useState(false);
 * const handleEnabledChange = useCheckboxHandler(setEnabled);
 * <input type="checkbox" onChange={handleEnabledChange} />
 * ```
 */
export function useCheckboxHandler(
  setter: (value: boolean) => void
): (e: ChangeEvent<HTMLInputElement>) => void {
  return useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setter(e.target.checked);
  }, [setter]);
}

/**
 * Hook that returns a memoized toggle handler.
 *
 * @param setter - State setter function that accepts a callback
 * @returns Memoized click handler
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * const handleToggle = useToggleHandler(setIsOpen);
 * <button onClick={handleToggle}>Toggle</button>
 * ```
 */
export function useToggleHandler(
  setter: (updater: (prev: boolean) => boolean) => void
): () => void {
  return useCallback(() => {
    setter((prev) => !prev);
  }, [setter]);
}

// ============================================================================
// Form Submission Helpers
// ============================================================================

/**
 * Creates a form submission handler that prevents default and executes callback.
 *
 * @param callback - Async or sync function to execute on submit
 * @returns Form submit event handler
 *
 * @example
 * ```tsx
 * <form onSubmit={createSubmitHandler(async () => {
 *   await submitData();
 * })}>
 * ```
 */
export function createSubmitHandler(
  callback: () => void | Promise<void>
): (e: React.FormEvent) => void {
  return (e) => {
    e.preventDefault();
    callback();
  };
}
