import { useCallback, useState } from "react";

/**
 * Generic toggle hook that can be used for modal open/close state.
 * Returns the current state and helper functions to open, close, or toggle.
 */
export const useToggle = (initial = false) => {
  const [isOpen, setIsOpen] = useState(initial);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return { isOpen, open, close, toggle };
};

/**
 * Alias of useToggle specifically for modal scenarios.
 */
export const useModal = (initial = false) => useToggle(initial);

