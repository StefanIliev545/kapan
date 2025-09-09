import { describe, it, expect } from "vitest";
import { weiToEth, friToStrk } from "../lib/feeUnits";

describe("fee unit conversions", () => {
  it("weiToEth", () => {
    expect(weiToEth(1000000000000000n)).toBeCloseTo(0.001);
  });
  it("friToStrk", () => {
    expect(friToStrk(1000000000000000000n)).toBeCloseTo(1);
  });
});
