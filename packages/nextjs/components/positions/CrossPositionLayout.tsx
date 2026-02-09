import { FC, ReactNode } from "react";
import type { PositionGroup, TokenPosition } from "~~/types/positions";
import { TokenRow } from "./TokenRow";

/** Render function signature for custom position row rendering */
type PositionRenderer = (token: TokenPosition, index: number) => ReactNode;

interface CrossPositionLayoutProps {
  group: PositionGroup;
  /** Custom renderer for collateral (supplied) rows. Falls back to TokenRow when not provided. */
  renderCollateral?: PositionRenderer;
  /** Custom renderer for debt (borrowed) rows. Falls back to TokenRow when not provided. */
  renderDebt?: PositionRenderer;
  /** Optional custom header content */
  header?: ReactNode;
  /** Footer content below collateral list (e.g., "Add Supply" / "Add Loop" buttons) */
  collateralFooter?: ReactNode;
  /** Footer content below debt list (e.g., "Add Borrow" button) */
  debtFooter?: ReactNode;
  /** Additional className for the outer container */
  className?: string;
}

/**
 * Two-column grid layout for "cross" topology protocols (Aave, Compound, Venus).
 *
 * In cross topology, any collateral can back any debt, so we display all
 * collaterals in the left column and all debts in the right column.
 *
 * Accepts optional render props so protocol views can pass in their own
 * interactive SupplyPosition/BorrowPosition components while reusing the layout.
 */
export const CrossPositionLayout: FC<CrossPositionLayoutProps> = ({
  group,
  renderCollateral,
  renderDebt,
  header,
  collateralFooter,
  debtFooter,
  className,
}) => {
  return (
    <div className={className}>
      {header}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Collateral column */}
        <div className="flex flex-col space-y-1">
          <h4 className="text-base-content/50 px-3 text-[10px] font-medium uppercase tracking-wider">
            Supplied
          </h4>
          {group.collaterals.length > 0 ? (
            group.collaterals.map((token, idx) =>
              renderCollateral ? renderCollateral(token, idx) : (
                <TokenRow
                  key={token.address}
                  token={token}
                  type="collateral"
                  adlActive={group.automation?.adlActive}
                />
              )
            )
          ) : (
            <p className="text-base-content/30 px-3 py-2 text-xs">No supply positions</p>
          )}
          {collateralFooter && <div className="mt-auto pt-3">{collateralFooter}</div>}
        </div>

        {/* Debt column */}
        <div className="flex flex-col space-y-1">
          <h4 className="text-base-content/50 px-3 text-[10px] font-medium uppercase tracking-wider">
            Borrowed
          </h4>
          {group.debts.length > 0 ? (
            group.debts.map((token, idx) =>
              renderDebt ? renderDebt(token, idx) : (
                <TokenRow
                  key={token.address}
                  token={token}
                  type="debt"
                  adlActive={group.automation?.adlProtected}
                />
              )
            )
          ) : (
            <p className="text-base-content/30 px-3 py-2 text-xs">No borrow positions</p>
          )}
          {debtFooter && <div className="mt-auto pt-3">{debtFooter}</div>}
        </div>
      </div>
    </div>
  );
};
