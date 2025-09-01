export class PositionManager {
  suppliedUsd: number;
  borrowedUsd: number;

  constructor(suppliedUsd: number, borrowedUsd: number) {
    this.suppliedUsd = suppliedUsd;
    this.borrowedUsd = borrowedUsd;
  }

  static fromPositions(
    supplied: { balance: number }[],
    borrowed: { balance: number }[],
  ): PositionManager {
    const suppliedTotal = supplied.reduce((acc, p) => acc + p.balance, 0);
    const borrowedTotal = borrowed.reduce((acc, p) => acc + Math.abs(p.balance), 0);
    return new PositionManager(suppliedTotal, borrowedTotal);
  }

  clone(): PositionManager {
    return new PositionManager(this.suppliedUsd, this.borrowedUsd);
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

  freeBorrowUsd(snapshot: PositionManager = this): number {
    return Math.max(0, snapshot.suppliedUsd - snapshot.borrowedUsd);
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
