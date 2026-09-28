import { FixedLoanCard } from "../FixedLoanCard";
import { FixedLoanTerms } from "../FixedLoanTerms";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MidnightPositionRow } from "~~/hooks/midnight/useMidnight";
import type { MidnightFinancing } from "~~/hooks/midnight/useMidnightFinancing";
import fixture from "~~/utils/midnight/__tests__/live-base-fixture.json";
import { type MidnightToken, bookSchema } from "~~/utils/midnight/types";

const market = bookSchema.parse(fixture.market);
const tokens: Record<string, MidnightToken> = {
  [market.loan_token]: { address: market.loan_token, symbol: "USDC", decimals: 6 },
  [market.collaterals[0].token]: { address: market.collaterals[0].token, symbol: "cbETH", decimals: 18 },
};
const row: MidnightPositionRow = {
  market,
  market_id: market.market_id,
  chain_id: 8453,
  user_address: "0x0000000000000000000000000000000000000001",
  loan_token: market.loan_token,
  maturity: market.maturity,
  credit: "0",
  debt: "102500000",
  pending_fee: "0",
  type: "borrow",
  effective_rate_wad: "50000000000000000",
  collateralValue: 200000000n,
  capacity: 172000000n,
  collaterals: [
    {
      token: market.collaterals[0].token,
      amount: "100000000000000000",
      value: 200000000n,
      capacity: 172000000n,
      oraclePrice: 2000000000000000000000000000n,
    },
  ],
};
afterEach(cleanup);
describe("Morpho fixed-loan card", () => {
  it("marks each position header as a fixed loan and shows face debt, entry rate and UTC maturity", () => {
    render(
      <FixedLoanCard
        row={row}
        tokens={tokens}
        onAction={vi.fn()}
        onRefinance={vi.fn()}
        now={market.maturity - 10000}
      />,
    );
    expect(screen.getByText("Fixed loan").closest("header")).not.toBeNull();
    expect(screen.getByText("Debt due")).toBeInTheDocument();
    expect(screen.getByText("5.00%")).toBeInTheDocument();
    expect(screen.getByText(/UTC/)).toBeInTheDocument();
    expect(screen.getByText("1.68")).toBeInTheDocument();
  });
  it("routes collateral actions with the token's address", () => {
    const action = vi.fn();
    render(
      <FixedLoanCard row={row} tokens={tokens} onAction={action} onRefinance={vi.fn()} now={market.maturity - 10000} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(action).toHaveBeenCalledWith("withdraw", market.collaterals[0].token);
  });
  it("keeps repayment and refinance available after maturity and hides borrowing", () => {
    const refinance = vi.fn();
    render(
      <FixedLoanCard row={row} tokens={tokens} onAction={vi.fn()} onRefinance={refinance} now={market.maturity + 1} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("matured");
    expect(screen.queryByRole("button", { name: "Borrow" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repay" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Refinance/ }));
    expect(refinance).toHaveBeenCalledOnce();
  });
  it("does not invent an entry rate when the indexer has none", () => {
    render(
      <FixedLoanCard
        row={{ ...row, effective_rate_wad: null }}
        tokens={tokens}
        onAction={vi.fn()}
        onRefinance={vi.fn()}
        now={market.maturity - 10000}
      />,
    );
    expect(screen.getByText("Entry rate unavailable")).toBeInTheDocument();
  });
  it("explains absent matching markets and an undeployed gateway", () => {
    const f = {
      markets: { isLoading: false },
      candidates: [],
      maxAprInput: "20",
      setMaxAprInput: vi.fn(),
      gateway: { ready: false, isLoading: false },
      risk: {},
      quote: {},
    } as unknown as MidnightFinancing;
    render(<FixedLoanTerms financing={f} symbol="USDC" decimals={6} />);
    expect(screen.getByText(/No active fixed market/)).toBeInTheDocument();
    expect(screen.getByText(/not enabled on this network/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Maximum fixed APR" })).toHaveValue("20");
  });
});
