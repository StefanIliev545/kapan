import { PropsWithChildren } from "react";

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
 */
export const StableArea = ({
  minHeight = "20rem",
  className,
  innerClassName,
  as: Component = "div",
  children,
}: StableAreaProps) => {
  const style =
    typeof minHeight === "number"
      ? { minHeight: `${minHeight}px` }
      : { minHeight };
  const combinedInnerClassName = ["w-full", innerClassName].filter(Boolean).join(" ");

  return (
    <Component className={className}>
      <div className={combinedInnerClassName} style={style}>
        {children}
      </div>
    </Component>
  );
};

export default StableArea;
