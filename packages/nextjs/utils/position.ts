export class PositionManager {
  suppliedUsd: number;
  borrowedUsd: number;
  /** LTV in basis points (e.g., 7700 = 77%). If 0, defaults to 100% (suppliedUsd = max borrow). */
  ltvBps: number;

  constructor(suppliedUsd: number, borrowedUsd: number, ltvBps = 0) {
    this.suppliedUsd = suppliedUsd;
    this.borrowedUsd = borrowedUsd;
    this.ltvBps = ltvBps;
  }

  static fromPositions(
    supplied: { balance: number }[],
    borrowed: { balance: number; collateralValue?: number }[],
    ltvBps = 0,
  ): PositionManager {
    const suppliedTotal = supplied.reduce((acc, p) => acc + p.balance, 0);
    const collateralTotal = borrowed.reduce((acc, p) => acc + (p.collateralValue || 0), 0);
    const totalSupplied = suppliedTotal + collateralTotal;
    const borrowedTotal = borrowed.reduce((acc, p) => acc + Math.abs(p.balance), 0);
    return new PositionManager(totalSupplied, borrowedTotal, ltvBps);
  }

  clone(): PositionManager {
    return new PositionManager(this.suppliedUsd, this.borrowedUsd, this.ltvBps);
  }

  utilization(snapshot: PositionManager = this): number {
    return snapshot.suppliedUsd > 0
      ? (snapshot.borrowedUsd / snapshot.suppliedUsd) * 100
      : 0;
  }

  healthFactor(snapshot: PositionManager = this): number {
    return snapshot.borrowedUsd > 0
      ? snapshot.suppliedUsd / snapshot.borrowedUsd
      : 10;
  }

  loanToValue(snapshot: PositionManager = this): number {
    return this.utilization(snapshot);
  }

  /** Returns the max borrowing power in USD based on LTV (defaults to 100% if not set). */
  maxBorrowUsd(snapshot: PositionManager = this): number {
    // Default to 100% (10000 bps) if LTV not provided
    const effectiveLtvBps = snapshot.ltvBps > 0 ? snapshot.ltvBps : 10000;
    return (snapshot.suppliedUsd * effectiveLtvBps) / 10000;
  }

  /** Returns remaining borrowing capacity in USD (maxBorrow - currentBorrow). */
  freeBorrowUsd(snapshot: PositionManager = this): number {
    return Math.max(0, this.maxBorrowUsd(snapshot) - snapshot.borrowedUsd);
  }

  apply(
    action: "Borrow" | "Deposit" | "Withdraw" | "Repay",
    usdChange: number,
  ): PositionManager {
    const next = this.clone();
    switch (action) {
      case "Borrow":
        next.borrowedUsd += usdChange;
        break;
      case "Repay":
        next.borrowedUsd = Math.max(0, next.borrowedUsd - usdChange);
        break;
      case "Deposit":
        next.suppliedUsd += usdChange;
        break;
      case "Withdraw":
        next.suppliedUsd = Math.max(0, next.suppliedUsd - usdChange);
        break;
    }
    return next;
  }
}

export interface PositionSnapshot {
  suppliedUsd: number;
  borrowedUsd: number;
}
