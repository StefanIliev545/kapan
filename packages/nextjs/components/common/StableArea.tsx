import React, { PropsWithChildren, useMemo } from "react";

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
  as?: React.ElementType;
}>;

/**
 * Utility wrapper that reserves a predictable block of space so that client-only components can hydrate without
 * causing cumulative layout shift. This is particularly useful when using `next/dynamic` with `ssr: false`, where
 * the server initially renders nothing and the client later mounts a much taller component.
 *
 * Keep the reservation stable after content loads. Measuring every protocol card with
 * a ResizeObserver caused the dashboard to repeatedly animate its layout while live
 * positions and prices updated, which made the page feel slower than the data was.
 */
export const StableArea = ({
  minHeight = "20rem",
  className,
  innerClassName,
  as: Component = "div",
  children,
}: StableAreaProps) => {
  const minHeightValue = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  const combinedInnerClassName = ["w-full", innerClassName].filter(Boolean).join(" ");

  const style = useMemo<React.CSSProperties>(() => ({ minHeight: minHeightValue }), [minHeightValue]);

  // `React.createElement` avoids a React 19 / TS regression where JSX can't
  // infer the `children` prop type on a dynamic `ElementType` tag.
  return React.createElement(
    Component,
    { className },
    <div className={combinedInnerClassName} style={style}>
      {children}
    </div>,
  );
};

export default StableArea;
