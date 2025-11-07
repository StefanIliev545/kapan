import { PropsWithChildren, useEffect, useRef, useState } from "react";

type StableAreaProps = PropsWithChildren<{
  /**
   * Minimum height to reserve for the wrapped area. Accepts a number (pixels) or any CSS length string.
   * Defaults to 20rem which matches the approximate size of protocol cards on desktop.
   */
  minHeight?: number | string;
  /** Optional class applied to the outer wrapper element. */
  className?: string;
  /** Optional class applied to the inner element that actually reserves the height. */
  innerClassName?: string;
  /**
   * Element to render as the wrapper. Defaults to a div so that the component can be used inside flex/grid layouts
   * without introducing semantic issues.
   */
  as?: keyof JSX.IntrinsicElements;
}>;

/**
 * Utility wrapper that reserves a predictable block of space so that client-only components can hydrate without
 * causing cumulative layout shift. This is particularly useful when using `next/dynamic` with `ssr: false`, where
 * the server initially renders nothing and the client later mounts a much taller component.
 * 
 * When content loads and is shorter than the reserved space, it smoothly animates to fit the actual content height.
 */
export const StableArea = ({
  minHeight = "20rem",
  className,
  innerClassName,
  as: Component = "div",
  children,
}: StableAreaProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isContentLoaded, setIsContentLoaded] = useState(false);
  const [actualHeight, setActualHeight] = useState<number | null>(null);

  useEffect(() => {
    // Check if content has loaded (children are present)
    if (children && contentRef.current) {
      // Use ResizeObserver to detect when content size changes
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.contentRect.height;
          if (height > 0) {
            setActualHeight(height);
            // Mark as loaded after a small delay to allow initial render
            if (!isContentLoaded) {
              setTimeout(() => setIsContentLoaded(true), 100);
            }
          }
        }
      });

      resizeObserver.observe(contentRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [children, isContentLoaded]);

  const minHeightValue = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  const combinedInnerClassName = ["w-full transition-all duration-500 ease-in-out", innerClassName]
    .filter(Boolean)
    .join(" ");

  // Convert minHeight to pixels for comparison (handle rem by assuming 16px base)
  const minHeightPx = typeof minHeight === "number" 
    ? minHeight 
    : minHeight.endsWith("rem") 
      ? parseFloat(minHeight) * 16 
      : parseFloat(minHeight) || 0;

  // Use actual height if content is loaded and shorter than minHeight, otherwise use minHeight
  const style: React.CSSProperties = {
    minHeight: isContentLoaded && actualHeight && actualHeight < minHeightPx 
      ? `${actualHeight}px` 
      : minHeightValue,
    transition: "min-height 0.5s ease-in-out",
  };

  return (
    <Component className={className}>
      <div ref={contentRef} className={combinedInnerClassName} style={style}>
        {children}
      </div>
    </Component>
  );
};

export default StableArea;
