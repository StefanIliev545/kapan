import { FC, ReactNode } from "react";
import type { PositionGroup, TokenPosition } from "~~/types/positions";
import { TokenRow } from "./TokenRow";
import { PositionHealthBadge } from "./PositionHealthBadge";

/** Render function signature for custom position row rendering */
type PositionRenderer = (token: TokenPosition, index: number) => ReactNode;

interface MultiPositionLayoutProps {
  group: PositionGroup;
  /** Custom renderer for collateral rows. Falls back to TokenRow when not provided. */
  renderCollateral?: PositionRenderer;
  /** Custom renderer for debt rows. Falls back to TokenRow when not provided. */
  renderDebt?: PositionRenderer;
  /**
   * Full custom collateral column content. Takes priority over renderCollateral.
   * Use this when the protocol view controls its own iteration over native data.
   */
  collateralContent?: ReactNode;
  /**
   * Full custom debt column content. Takes priority over renderDebt.
   * Use this when the protocol view controls its own iteration over native data.
   */
  debtContent?: ReactNode;
  /** Optional custom header content (replaces default label + health badge) */
  header?: ReactNode;
  /** Optional footer for the collateral column (e.g. "Add Collateral" button) */
  collateralFooter?: ReactNode;
  /** Optional footer for the debt column (e.g. "Borrow" button when no debt) */
  debtFooter?: ReactNode;
  /** Additional className for the outer container */
  className?: string;
}

/**
 * Layout for "multi" topology protocols (Euler sub-accounts).
 *
 * In multi topology, a sub-account has N collateral vaults backing 1 debt.
 * Displays a sub-account label with health badge, then two columns:
 * multiple collateral rows on the left, debt row(s) on the right.
 *
 * Supports three rendering modes (in priority order):
 * 1. collateralContent/debtContent - Full custom ReactNode content
 * 2. renderCollateral/renderDebt - Render function per token
 * 3. Default TokenRow rendering
 */
export const MultiPositionLayout: FC<MultiPositionLayoutProps> = ({
  group,
  renderCollateral,
  renderDebt,
  collateralContent,
  debtContent,
  header,
  collateralFooter,
  debtFooter,
  className,
}) => {
  // Resolve collateral column content
  const collateralBody = collateralContent ?? (
    group.collaterals.length > 0 ? (
      <div className="space-y-2">
        {group.collaterals.map((token, idx) =>
          renderCollateral ? renderCollateral(token, idx) : (
            <TokenRow
              key={token.vaultAddress || token.address}
              token={token}
              type="collateral"
              adlActive={group.automation?.adlActive}
            />
          )
        )}
      </div>
    ) : (
      <div className="text-base-content/40 text-sm italic">None</div>
    )
  );

  // Resolve debt column content
  const debtBody = debtContent ?? (
    group.debts.length > 0 ? (
      group.debts.map((token, idx) =>
        renderDebt ? renderDebt(token, idx) : (
          <TokenRow
            key={token.vaultAddress || token.address}
            token={token}
            type="debt"
            adlActive={group.automation?.adlProtected}
          />
        )
      )
    ) : (
      <p className="text-base-content/30 px-3 py-2 text-xs">No debt</p>
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

      {/* Two columns: collaterals left, debt right */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Collateral column */}
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-base-content/50 px-3 text-[10px] font-semibold uppercase tracking-wider">
            Collateral ({group.collaterals.length})
          </h4>
          {collateralBody}
          {collateralFooter}
        </div>

        {/* Divider */}
        <div className="bg-base-content/10 hidden w-px self-stretch sm:block" />
        <div className="bg-base-content/10 h-px w-full sm:hidden" />

        {/* Debt column */}
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-base-content/50 px-3 text-[10px] font-semibold uppercase tracking-wider">
            Debt
          </h4>
          {debtBody}
          {debtFooter}
        </div>
      </div>
    </div>
  );
};
