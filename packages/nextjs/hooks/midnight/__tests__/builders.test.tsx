import { cleanup, renderHook } from "@testing-library/react";
import { AbiCoder } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTransactionBuilder } from "~~/hooks/kapan-router/useTransactionBuilder";
import fixture from "~~/utils/midnight/__tests__/live-base-fixture.json";
import { encodeMidnightContext } from "~~/utils/midnight/encoding";
import { bookSchema } from "~~/utils/midnight/types";
import { FlashLoanProvider, LendingOp } from "~~/utils/v2/instructionHelpers";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x0000000000000000000000000000000000000001" }),
  usePublicClient: () => ({}),
}));
vi.mock("~~/contracts/externalContracts", () => ({ ERC20ABI: [] }));
vi.mock("~~/utils/flashLoan", async () => {
  const { FlashLoanProvider } = await import("~~/utils/v2/instructionHelpers");
  return {
    FlashLoanProvider,
    versionToProviderEnum: (v: string) => (v === "morpho" ? FlashLoanProvider.Morpho : FlashLoanProvider.BalancerV2),
  };
});
const market = bookSchema.parse(fixture.market),
  context = encodeMidnightContext(market.market_id, 1),
  coder = AbiCoder.defaultAbiCoder();
function instruction(data: string) {
  return coder.decode(
    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
    data,
  )[0];
}
afterEach(cleanup);
describe("Shared builders with Midnight", () => {
  it("deposits collateral without buying lender credit", () => {
    const { result } = renderHook(() => useTransactionBuilder());
    const flow = result.current.buildDepositFlow("Morpho Midnight", market.collaterals[1].token, "1", 6, context);
    const i = instruction(flow[2].data);
    expect(flow[2].protocolName).toBe("morpho-midnight");
    expect(i.op).toBe(BigInt(LendingOp.DepositCollateral));
    expect(i.context).toBe(context);
  });
  it("preserves the Midnight context through leverage deposits and borrowing", () => {
    const { result } = renderHook(() => useTransactionBuilder());
    const flow = result.current.buildMultiplyFlow({
      protocolName: "morpho-midnight",
      collateralToken: market.collaterals[1].token,
      debtToken: market.loan_token,
      initialCollateral: "0",
      flashLoanAmount: "1",
      minCollateralOut: "900000",
      swapData: "0x1234",
      collateralDecimals: 6,
      debtDecimals: 6,
      flashLoanProvider: FlashLoanProvider.Morpho,
      morphoContext: context,
    });
    const lending = flow.filter(i => i.protocolName === "morpho-midnight").map(i => instruction(i.data));
    expect(lending.map(i => i.op)).toEqual([1n, 1n, 3n]);
    expect(lending.every(i => i.context === context)).toBe(true);
    expect(lending.at(-1).input.index).toBe(3n);
  });
  it("honors partial refinance sizing instead of silently reading full debt", () => {
    const { result } = renderHook(() => useTransactionBuilder());
    const builder = result.current.createMoveBuilder();
    builder.buildUnlockDebt({
      fromProtocol: "Morpho Blue",
      debtToken: market.loan_token,
      expectedDebt: "1",
      debtDecimals: 6,
      repayMax: false,
      fromContext: context,
      flash: { version: "morpho" },
    });
    const flow = builder.build();
    expect(flow[0].protocolName).toBe("router");
    const [i] = coder.decode(["tuple(uint256 amount,address token,address user,uint8 instructionType)"], flow[0].data);
    expect(i.amount).toBe(1000000n);
    expect(instruction(flow[3].data).input.index).toBe(0n);
  });
  it("uses the live debt balance for max refinance and keeps destination slot context", () => {
    const { result } = renderHook(() => useTransactionBuilder());
    const builder = result.current.createMoveBuilder();
    builder.buildUnlockDebt({
      fromProtocol: "Morpho Blue",
      debtToken: market.loan_token,
      expectedDebt: "1",
      debtDecimals: 6,
      flash: { version: "morpho" },
    });
    builder.buildMoveCollateral({
      fromProtocol: "Morpho Blue",
      toProtocol: "Morpho Midnight",
      collateralToken: market.collaterals[1].token,
      withdraw: { amount: "1" },
      collateralDecimals: 6,
      toContext: context,
    });
    const flow = builder.build();
    expect(instruction(flow[0].data).op).toBe(BigInt(LendingOp.GetBorrowBalance));
    const deposit = instruction(flow.at(-1)!.data);
    expect(deposit.op).toBe(BigInt(LendingOp.DepositCollateral));
    expect(deposit.context).toBe(context);
    expect(deposit.input.index).toBe(4n);
  });
});
