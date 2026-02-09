"use client";

import { FC, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Reusable collapsible section with animated expand/collapse.
 * Used by Morpho, Euler, and other protocol views for expandable content.
 */
export interface CollapsibleSectionProps {
  /** Whether the section is currently open */
  isOpen: boolean;
  /** Content to render inside the collapsible section */
  children: ReactNode;
  /** Optional custom card class (default: standard protocol card styling) */
  cardClassName?: string;
  /** Optional custom body class */
  bodyClassName?: string;
}

// Animation constants - extracted for reuse and consistency
const COLLAPSE_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };
const COLLAPSE_INITIAL = { opacity: 0, height: 0 };
const COLLAPSE_ANIMATE = { opacity: 1, height: "auto" };

/**
 * Animated collapsible section component.
 * Provides smooth expand/collapse animation with consistent styling.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * <CollapsibleSection isOpen={isOpen}>
 *   <div>Content here</div>
 * </CollapsibleSection>
 * ```
 */
export const CollapsibleSection: FC<CollapsibleSectionProps> = ({
  isOpen,
  children,
  cardClassName = "card bg-base-200/40 border-base-300/50 rounded-xl border shadow-md",
  bodyClassName = "card-body p-4",
}) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={COLLAPSE_INITIAL}
        animate={COLLAPSE_ANIMATE}
        exit={COLLAPSE_INITIAL}
        transition={COLLAPSE_TRANSITION}
        className="overflow-hidden"
      >
        <div className={cardClassName}>
          <div className={bodyClassName}>{children}</div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Export animation constants for components that need custom animations
export { COLLAPSE_TRANSITION, COLLAPSE_INITIAL, COLLAPSE_ANIMATE };
