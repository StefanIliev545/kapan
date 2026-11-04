import { createDashboardTotalsStore } from "../dashboardTotals";
import { expect, it, vi } from "vitest";

it("replaces a protocol contribution without double counting loaded sources", () => {
  const store = createDashboardTotalsStore(true);
  const publish = store.getState().setProtocolTotals;
  publish("Wallet", 25, 0);
  publish("Morpho", 100, 40);
  publish("Morpho", 80, 20);

  expect(store.getState()).toMatchObject({
    totalSupplied: 105,
    totalBorrowed: 20,
    totalNet: 85,
    loadedProtocolCount: 2,
  });
});

it("counts a successful empty protocol and removes its old amounts", () => {
  const store = createDashboardTotalsStore(true);
  const publish = store.getState().setProtocolTotals;
  publish("Morpho", 100, 40);
  publish("Morpho", 0, 0);

  expect(store.getState()).toMatchObject({
    totalSupplied: 0,
    totalBorrowed: 0,
    totalNet: 0,
    loadedProtocolCount: 1,
  });
});

it("does not notify subscribers when a protocol publishes the same amounts", () => {
  const store = createDashboardTotalsStore(true);
  const notify = vi.fn();
  const unsubscribe = store.subscribe(notify);
  const publish = store.getState().setProtocolTotals;
  publish("Morpho", 100, 40);
  publish("Morpho", 100, 40);
  expect(notify).toHaveBeenCalledOnce();
  unsubscribe();
});
