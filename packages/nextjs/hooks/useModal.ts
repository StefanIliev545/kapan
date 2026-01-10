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

  return { isOpen, open, close, toggle, setIsOpen };
};

/**
 * Alias of useToggle specifically for modal scenarios.
 */
export const useModal = (initial = false) => useToggle(initial);

/**
 * Modal state hook that manages both open/close state and associated data.
 * Useful when a modal needs to display data that is set when opening.
 *
 * @example
 * const { isOpen, data, openWithData, close } = useModalWithData<{ id: string }>();
 * // Open with data
 * openWithData({ id: "123" });
 * // In modal: data?.id
 */
export function useModalWithData<T>(initial: T | null = null) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(initial);

  const openWithData = useCallback((newData: T) => {
    setData(newData);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const updateData = useCallback((newData: T | null) => {
    setData(newData);
  }, []);

  return { isOpen, data, openWithData, close, updateData };
}

/**
 * Type for a simple modal state (just open/close)
 */
export type ModalState = ReturnType<typeof useModal>;

/**
 * Type for modal state with associated data
 */
export type ModalWithDataState<T> = ReturnType<typeof useModalWithData<T>>;
