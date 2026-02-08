import { FC, ReactNode } from "react";
import type { PositionGroup, TokenPosition } from "~~/types/positions";
import { TokenRow } from "./TokenRow";
import { PositionHealthBadge } from "./PositionHealthBadge";

/** Render function signature for custom position row rendering */
type PositionRenderer = (token: TokenPosition, index: number) => ReactNode;

interface IsolatedPositionLayoutProps {
  group: PositionGroup;
  /** Custom renderer for collateral rows. Falls back to TokenRow when not provided. */
  renderCollateral?: PositionRenderer;
  /** Custom renderer for debt rows. Falls back to TokenRow when not provided. */
  renderDebt?: PositionRenderer;
  /**
   * Full custom collateral content. Takes priority over renderCollateral.
   * Use this when the protocol view controls its own iteration over native data.
   */
  collateralContent?: ReactNode;
  /**
   * Full custom debt content. Takes priority over renderDebt.
   * Use this when the protocol view controls its own iteration over native data.
   * Pass null to render nothing in the debt column (e.g. supply-only positions).
   */
  debtContent?: ReactNode;
  /** Optional custom header content (replaces default label + health badge) */
  header?: ReactNode;
  /** Override the grid container className (default: "grid grid-cols-1 gap-2 md:grid-cols-2") */
  gridClassName?: string;
  /** Additional className for the outer container */
  className?: string;
}

/**
 * Layout for "isolated" topology protocols (Morpho, Vesu).
 *
 * In isolated markets, each market has exactly 1 collateral and 1 debt asset.
 * Displays the market label and health badge at the top, with collateral and
 * debt side-by-side below.
 *
 * Supports three rendering modes per column (in priority order):
 * 1. collateralContent/debtContent - Full custom ReactNode content
 * 2. renderCollateral/renderDebt - Render function per token
 * 3. Default TokenRow rendering
 */
export const IsolatedPositionLayout: FC<IsolatedPositionLayoutProps> = ({
  group,
  renderCollateral,
  renderDebt,
  collateralContent,
  debtContent,
  header,
  gridClassName,
  className,
}) => {
  const collateral = group.collaterals[0];
  const debt = group.debts[0];

  // Resolve collateral content (priority: content slot > render function > TokenRow)
  const collateralBody = collateralContent !== undefined ? collateralContent : (
    collateral ? (
      renderCollateral ? renderCollateral(collateral, 0) : (
        <TokenRow
          token={collateral}
          type="collateral"
          adlActive={group.automation?.adlActive}
        />
      )
    ) : (
      <div className="text-base-content/30 px-3 py-2 text-xs">No collateral</div>
    )
  );

  // Resolve debt content (priority: content slot > render function > TokenRow)
  const debtBody = debtContent !== undefined ? debtContent : (
    debt ? (
      renderDebt ? renderDebt(debt, 0) : (
        <TokenRow token={debt} type="debt" adlActive={group.automation?.adlProtected} />
      )
    ) : (
      <div className="text-base-content/30 px-3 py-2 text-xs">No debt</div>
    )
  );

  return (
    <div className={className}>
      {/* Header: either custom or default label + health */}
      {header ?? (
        <div className="flex items-center justify-between px-3 mb-2">
          {group.label && <span className="text-sm font-medium">{group.label}</span>}
          {group.health && <PositionHealthBadge health={group.health} />}
        </div>
      )}

      {/* Side-by-side collateral and debt */}
      <div className={gridClassName ?? "grid grid-cols-1 gap-2 md:grid-cols-2"}>
        {collateralBody}
        {debtBody}
      </div>
    </div>
  );
};
