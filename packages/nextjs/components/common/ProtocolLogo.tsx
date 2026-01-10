import { FC, memo } from "react";
import Image from "next/image";
import { getProtocolLogo } from "~~/utils/protocol";

/**
 * Size variants for the protocol logo
 */
export type ProtocolLogoSize = "xs" | "sm" | "md" | "lg";

/**
 * Props for the ProtocolLogo component
 */
export interface ProtocolLogoProps {
  /** Protocol name (e.g., "Aave V3", "Compound V3") */
  protocolName: string;
  /** Optional custom logo URL - will use getProtocolLogo if not provided */
  logoUrl?: string;
  /** Size variant */
  size?: ProtocolLogoSize;
  /** Whether to show a rounded style */
  rounded?: "full" | "md" | "none";
  /** Additional className for the container */
  className?: string;
}

const sizeMap: Record<ProtocolLogoSize, { container: string; dimension: number }> = {
  xs: { container: "size-4", dimension: 16 },
  sm: { container: "size-6", dimension: 24 },
  md: { container: "size-10", dimension: 40 },
  lg: { container: "size-12", dimension: 48 },
};

const roundedMap: Record<"full" | "md" | "none", string> = {
  full: "rounded-full",
  md: "rounded",
  none: "",
};

/**
 * ProtocolLogo - A unified component for displaying protocol logos
 *
 * Supports multiple size variants and can be used anywhere protocol logos are needed.
 * Automatically fetches the logo URL from getProtocolLogo if not provided.
 *
 * @example
 * // Small logo in a list
 * <ProtocolLogo protocolName="Aave V3" size="sm" />
 *
 * @example
 * // Large logo with custom styling
 * <ProtocolLogo protocolName="Compound" size="lg" rounded="full" className="border" />
 */
export const ProtocolLogo: FC<ProtocolLogoProps> = memo(({
  protocolName,
  logoUrl,
  size = "sm",
  rounded = "full",
  className = "",
}) => {
  const { container, dimension } = sizeMap[size];
  const roundedClass = roundedMap[rounded];
  const src = logoUrl || getProtocolLogo(protocolName);

  return (
    <div className={`${container} relative flex-shrink-0 overflow-hidden ${roundedClass} ${className}`}>
      <Image
        src={src}
        alt={protocolName}
        width={dimension}
        height={dimension}
        className={`object-cover ${roundedClass} min-w-[${dimension}px]`}
      />
    </div>
  );
});

ProtocolLogo.displayName = "ProtocolLogo";

export default ProtocolLogo;
