"use client";

import { useMemo } from "react";
import Image from "next/image";

export type ProtocolMockPosition = {
  icon: string;
  name: string;
  balanceUsd: number; // positive for supplied, negative for borrowed
  ratePct: number; // APR/APY percentage
};

export interface ProtocolViewMockProps {
  protocolName: string;
  protocolIcon: string;
  utilizationPct?: number;
  suppliedPositions: ProtocolMockPosition[];
  borrowedPositions: ProtocolMockPosition[];
}

const formatCurrency = (amount: number) => {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount >= 0 ? formatted : `-${formatted}`;
};

const ProtocolViewMock = ({
  protocolName,
  protocolIcon,
  utilizationPct = 42,
  suppliedPositions,
  borrowedPositions,
}: ProtocolViewMockProps) => {
  const totalSupplied = suppliedPositions.reduce((acc, p) => acc + Math.max(0, p.balanceUsd), 0);
  const totalBorrowed = borrowedPositions.reduce((acc, p) => acc + Math.abs(Math.min(0, p.balanceUsd)), 0);
  const netBalance = totalSupplied - totalBorrowed;

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");
    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000/app`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;
    return `${protocol}//app.${baseHost}`;
  }, []);

  return (
    <div className="w-full flex flex-col hide-scrollbar p-4 space-y-4">
      {/* Header */}
      <div className="card bg-base-100 shadow-lg rounded-lg">
        <div className="card-body p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 relative rounded-lg bg-base-200 p-1 flex items-center justify-center">
                <Image src={protocolIcon} alt={`${protocolName} icon`} width={36} height={36} className="object-contain" />
              </div>
              <div className="flex flex-col">
                <div className="text-xl font-bold tracking-tight pl-0.5">{protocolName}</div>
                <div className="text-base-content/70 flex gap-3 text-sm">
                  <span className="flex items-center gap-1">
                    <span>Balance:</span>
                    <span className={`font-medium ${netBalance >= 0 ? "text-success" : "text-error"}`}>{formatCurrency(netBalance)}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1 order-3 md:order-2">
              <span className="text-sm text-base-content">Protocol Utilization</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-1.5 bg-base-300 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${utilizationPct < 50 ? "bg-success" : utilizationPct < 70 ? "bg-warning" : "bg-error"}`}
                    style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }}
                  />
                </div>
                <span className="text-xs font-medium">{Math.round(utilizationPct)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-end order-2 md:order-3">
              <a
                href="/app"
                onClick={e => {
                  e.preventDefault();
                  window.location.assign(appUrl);
                }}
              >
                <button className="btn btn-primary btn-sm md:btn-md">Launch App</button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Supplied */}
        <div className="h-full">
          <div className="card bg-base-100 shadow-md h-full rounded-lg">
            <div className="card-body p-4">
              <h2 className="card-title justify-between text-lg border-b border-base-200 pb-2">
                <span>Supplied Assets</span>
                <span className="badge badge-primary badge-outline">{suppliedPositions.length}</span>
              </h2>
              {suppliedPositions.length > 0 ? (
                <div className="pt-2 space-y-3">
                  {suppliedPositions.map((pos, i) => (
                    <div key={`sup-${pos.name}-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-base-200/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 relative rounded-md bg-base-100 p-1">
                          <Image src={pos.icon} alt={`${pos.name} icon`} width={24} height={24} className="object-contain" />
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{pos.name}</span>
                          <span className="text-xs text-base-content/70">APY {pos.ratePct.toFixed(2)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(pos.balanceUsd)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg mt-2">
                  No supplied assets
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Borrowed */}
        <div className="h-full">
          <div className="card bg-base-100 shadow-md h-full rounded-lg">
            <div className="card-body p-4">
              <h2 className="card-title justify-between text-lg border-b border-base-200 pb-2">
                <span>Borrowed Assets</span>
                <span className="badge badge-secondary badge-outline">{borrowedPositions.length}</span>
              </h2>
              {borrowedPositions.length > 0 ? (
                <div className="pt-2 space-y-3">
                  {borrowedPositions.map((pos, i) => (
                    <div key={`bor-${pos.name}-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-base-200/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 relative rounded-md bg-base-100 p-1">
                          <Image src={pos.icon} alt={`${pos.name} icon`} width={24} height={24} className="object-contain" />
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{pos.name}</span>
                          <span className="text-xs text-base-content/70">APR {pos.ratePct.toFixed(2)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-error">{formatCurrency(-Math.abs(pos.balanceUsd))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg mt-2">
                  No borrowed assets
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtocolViewMock;


