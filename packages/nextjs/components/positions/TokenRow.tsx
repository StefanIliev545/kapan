import { FC } from "react";
import Image from "next/image";
import type { TokenPosition } from "~~/types/positions";
import { formatCurrency } from "~~/utils/formatNumber";
import { formatUnits } from "viem";
import formatPercentage from "~~/utils/formatPercentage";

interface TokenRowProps {
  token: TokenPosition;
  type: "collateral" | "debt";
  /** Show ADL indicator via a colored side border */
  adlActive?: boolean;
}

/**
 * A simple, read-only row for displaying a single TokenPosition.
 * Much simpler than BasePosition -- no actions, no expansion, just data display.
 *
 * Layout: [icon + symbol + balance] ... [USD value + rate]
 *
 * ADL indicator shows a left border (collateral) or right border (debt) in green.
 *
 * TODO: Once the modal bridge layer is wired, consider adding an onClick prop
 * so individual token rows can open position-specific actions.
 */
export const TokenRow: FC<TokenRowProps> = ({ token, type, adlActive }) => {
  const formattedBalance = Number(formatUnits(token.rawBalance, token.decimals));
  const isDebt = type === "debt";

  return (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-lg ${
        adlActive
          ? isDebt
            ? "border-r-2 border-success"
            : "border-l-2 border-success"
          : ""
      }`}
    >
      {/* Left: Token icon + name */}
      <div className="flex items-center gap-2 min-w-0">
        <Image src={token.icon} alt={token.symbol} width={24} height={24} className="rounded-full" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{token.symbol}</span>
          <span className="text-base-content/50 text-xs">
            {formattedBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        </div>
      </div>

      {/* Right: USD value + rate */}
      <div className="flex flex-col items-end shrink-0">
        <span className={`text-sm font-medium ${isDebt ? "text-error" : ""}`}>
          {isDebt ? "-" : ""}
          {formatCurrency(token.usdValue)}
        </span>
        <span className="text-base-content/50 text-xs">
          {formatPercentage(token.rate)}% {token.rateLabel || "APY"}
        </span>
      </div>
    </div>
  );
};
