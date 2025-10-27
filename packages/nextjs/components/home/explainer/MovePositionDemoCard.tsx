"use client";

import Image from "next/image";
import { Card } from "@radix-ui/themes";

type Proto = {
  name: string;
  icon: string;
};

type Collateral = {
  icon: string;
  name: string;
  amount: string; // formatted units
  usd?: number;
};

type Debt = {
  icon: string;
  name: string;
  amount: string; // formatted units
  usd?: number;
};

export type MovePositionDemoCardProps = {
  from: Proto;
  to: Proto;
  collateral: Collateral;
  debt: Debt;
};

const formatUsd = (value?: number) =>
  value == null ? "-" : (() => { try { return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }); } catch { return `$${value.toFixed(2)}`; } })();

const Row = ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
  <div className="flex items-center justify-between text-[12px] py-1">
    <span className="text-base-content/70">{left}</span>
    <span className="text-base-content/80">{right}</span>
  </div>
);

const MovePositionDemoCard = ({ from, to, collateral, debt }: MovePositionDemoCardProps) => {
  return (
    <Card className="bg-base-100 text-base-content border border-base-300 w-full md:w-[34rem] mx-auto" size="1" variant="classic">
      <div className="p-3 space-y-3">
        {/* Header from → to (match modal summary row style) */}
        <div className="flex items-center justify-between bg-base-200/40 p-2 rounded">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 relative">
              <Image src={from.icon} alt={from.name} fill className="object-contain" />
            </div>
            <div className="text-sm font-medium">{from.name}</div>
          </div>
          <div className="text-base-content/50">→</div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 relative">
              <Image src={to.icon} alt={to.name} fill className="object-contain" />
            </div>
            <div className="text-sm font-medium">{to.name}</div>
          </div>
        </div>

        {/* Body: Collateral (single) and Debt - styled like modal rows */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-base-content/70">Collateral</div>
          <div className="flex items-center justify-between bg-base-200/30 px-2 py-1.5 rounded">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 relative flex-shrink-0">
                <Image src={collateral.icon} alt={collateral.name} fill className="object-contain" />
              </div>
              <div className="text-sm truncate">{collateral.amount} {collateral.name}</div>
            </div>
            <div className="text-xs text-base-content/60 ml-3">{formatUsd(collateral.usd)}</div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wide text-base-content/70">Debt</div>
          <div className="flex items-center justify-between bg-base-200/30 px-2 py-1.5 rounded">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 relative flex-shrink-0">
                <Image src={debt.icon} alt={debt.name} fill className="object-contain" />
              </div>
              <div className="text-sm truncate">{debt.amount} {debt.name}</div>
            </div>
            <div className="text-xs text-base-content/60 ml-3">{formatUsd(debt.usd)}</div>
          </div>
        </div>

        {/* Footer summary */}
        <div className="pt-2 border-t border-base-200 space-y-1">
          <Row left="Steps" right="Redeploy collateral · Reborrow debt" />
          <Row left="Route" right={`${from.name} → ${to.name}`} />
        </div>
      </div>
    </Card>
  );
};

export default MovePositionDemoCard;


