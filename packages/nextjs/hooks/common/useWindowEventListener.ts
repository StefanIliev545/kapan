import { useEffect, useCallback } from "react";

/**
 * Hook to attach an event listener to the window with proper cleanup.
 *
 * @param eventName - The event name to listen for
 * @param handler - The event handler function
 * @param enabled - Whether the listener should be active (default: true)
 * @param options - Event listener options (e.g., { capture: true })
 *
 * @example
 * // Listen for scroll events
 * useWindowEventListener("scroll", handleScroll);
 *
 * @example
 * // Conditional listener
 * useWindowEventListener("resize", updatePosition, isOpen);
 *
 * @example
 * // With capture option for scroll
 * useWindowEventListener("scroll", updatePosition, isOpen, { capture: true });
 */
export function useWindowEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  enabled = true,
  options?: boolean | AddEventListenerOptions
): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    window.addEventListener(eventName, handler, options);
    return () => {
      window.removeEventListener(eventName, handler, options);
    };
  }, [eventName, handler, enabled, options]);
}

/**
 * Hook to listen for scroll and resize events and call an update function.
 * Commonly used for positioning dropdowns and tooltips.
 *
 * @param updatePosition - Function to call when scroll or resize occurs
 * @param enabled - Whether the listeners should be active
 *
 * @example
 * const updatePosition = useCallback(() => {
 *   if (!triggerRef.current) return;
 *   const rect = triggerRef.current.getBoundingClientRect();
 *   setPosition({ top: rect.bottom, left: rect.left });
 * }, []);
 *
 * useScrollResizeListener(updatePosition, isOpen);
 */
export function useScrollResizeListener(
  updatePosition: () => void,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;

    // Call immediately when enabled
    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition, enabled]);
}

/**
 * Hook to handle clicks outside of specified elements.
 * Useful for closing dropdowns and modals when clicking outside.
 *
 * @param refs - Array of refs to elements that should not trigger the callback
 * @param onClickOutside - Callback to run when clicking outside all refs
 * @param enabled - Whether the listener should be active
 *
 * @example
 * useClickOutside(
 *   [triggerRef, dropdownRef],
 *   () => {
 *     setIsOpen(false);
 *     setSearchTerm("");
 *   },
 *   isOpen
 * );
 */
export function useClickOutside(
  refs: React.RefObject<HTMLElement | null>[],
  onClickOutside: () => void,
  enabled = true
): void {
  const handleClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutside = refs.every(
        ref => !ref.current || !ref.current.contains(target)
      );
      if (isOutside) {
        onClickOutside();
      }
    },
    [refs, onClickOutside]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [handleClick, enabled]);
}
