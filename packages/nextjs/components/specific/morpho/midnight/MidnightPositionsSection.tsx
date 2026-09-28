"use client";

import { useState } from "react";
import { FixedLoanCard } from "./FixedLoanCard";
import { type MidnightAction, MidnightActionModal } from "./MidnightActionModal";
import { type Address } from "viem";
import { RefinanceModalEvm } from "~~/components/modals/RefinanceModalEvm";
import type { MidnightPositionRow, useMidnightPositions } from "~~/hooks/midnight/useMidnight";
import { collateralIndex, encodeMidnightContext } from "~~/utils/midnight/encoding";

export function MidnightPositionsSection({
  positions,
  chainId,
}: {
  positions: ReturnType<typeof useMidnightPositions>;
  chainId: number;
}) {
  const [action, setAction] = useState<{ row: MidnightPositionRow; kind: MidnightAction; token?: Address }>();
  const [refinance, setRefinance] = useState<MidnightPositionRow>();
  const { rows, tokens } = positions;
  return (
    <div className="space-y-3 mt-3">
      {positions.isLoading && (
        <p className="px-3 text-xs text-base-content/60" role="status">
          Loading fixed loans…
        </p>
      )}
      {positions.error && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-base-200 p-3 text-xs">
          <span>Fixed loans could not be loaded. {positions.error.message}</span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => void positions.refetch()}>
            Retry
          </button>
        </div>
      )}
      {rows.map(row => (
        <FixedLoanCard
          key={row.market_id}
          row={row}
          tokens={tokens}
          onAction={(kind, token) => setAction({ row, kind, token })}
          onRefinance={() => setRefinance(row)}
        />
      ))}
      {action && (
        <MidnightActionModal
          key={`${action.row.market_id}:${action.kind}:${action.token}`}
          onClose={() => setAction(undefined)}
          chainId={chainId}
          market={action.row.market}
          row={action.row}
          tokens={tokens}
          action={action.kind}
          initialToken={action.token}
        />
      )}
      {refinance && (
        <RefinanceModalEvm
          isOpen
          onClose={() => setRefinance(undefined)}
          fromProtocol="Morpho Midnight"
          chainId={chainId}
          position={{
            name: tokens[refinance.loan_token.toLowerCase()].symbol,
            tokenAddress: refinance.loan_token,
            decimals: tokens[refinance.loan_token.toLowerCase()].decimals,
            balance: BigInt(refinance.debt),
            type: "borrow",
          }}
          fromContext={encodeMidnightContext(refinance.market_id, 0)}
          fromContexts={Object.fromEntries(
            refinance.market.collaterals.map(c => [
              c.token.toLowerCase(),
              encodeMidnightContext(refinance.market_id, collateralIndex(refinance.market, c.token)),
            ]),
          )}
          preSelectedCollaterals={refinance.collaterals
            .filter(c => BigInt(c.amount) > 0n)
            .map(c => ({
              token: c.token,
              symbol: tokens[c.token.toLowerCase()].symbol,
              decimals: tokens[c.token.toLowerCase()].decimals,
              amount: BigInt(c.amount),
              maxAmount: BigInt(c.amount),
            }))}
          disableCollateralSelection
        />
      )}
    </div>
  );
}
