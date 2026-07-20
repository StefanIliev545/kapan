"use client";

import * as React from "react";
import { SkeletonCircle, SkeletonLine, SkeletonRow } from "./Loading";

type SkeletonCardProps = {
  /** Unique key prefix for skeleton rows */
  keyPrefix: string;
  /** Number of skeleton rows to display */
  rowCount: number;
};

function SkeletonCard({ keyPrefix, rowCount }: SkeletonCardProps) {
  return (
    <div className="h-full">
      <div className="card bg-base-100 h-full rounded-lg shadow-md">
        <div className="card-body p-4">
          <div className="border-base-200 mb-2 flex items-center justify-between border-b pb-2">
            <SkeletonLine width="w-32" height="h-5" />
            <SkeletonCircle size="w-8 h-5" />
          </div>
          <div className="space-y-3 pt-2">
            {Array.from({ length: rowCount }).map((_, i) => (
              <SkeletonRow key={`${keyPrefix}-${i}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type ProtocolSkeletonProps = {
  /** Centre the whole skeleton (useful for very small panes) */
  centered?: boolean;
  /** Adjust how many position items to mock per card */
  positionsPerCard?: number;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Protocol name shown in the placeholder heading while its client chunk loads. */
  protocolName?: string;
  /** Match the eventual protocol layout to reduce perceived layout shift. */
  variant?: "lending" | "liquidity" | "wallet";
  className?: string;
};

const ProtocolHeaderSkeleton = ({ protocolName }: { protocolName?: string }) => (
  <div className="card bg-base-200/35 border-base-content/[0.08] border shadow-sm">
    <div className="card-body p-4">
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-3">
          <SkeletonCircle size="size-10" className="ring-base-content/[0.08] ring-1" />
          <div className="flex flex-col gap-2">
            {protocolName ? (
              <span className="text-base-content/45 text-sm font-semibold">{protocolName}</span>
            ) : (
              <SkeletonLine width="w-32" height="h-5" />
            )}
            <div className="flex gap-2">
              <SkeletonLine width="w-20" height="h-3" />
              <SkeletonLine width="w-16" height="h-3" />
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-6 sm:flex">
          {["w-20", "w-16", "w-14"].map(width => (
            <SkeletonLine key={width} width={width} height="h-5" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const LiquiditySkeleton = () => (
  <div className="border-base-content/[0.08] bg-base-100/35 space-y-4 border p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          <SkeletonCircle size="size-7" />
          <SkeletonCircle size="size-7" />
        </div>
        <SkeletonLine width="w-28" height="h-4" />
      </div>
      <SkeletonLine width="w-20" height="h-5" rounded />
    </div>
    <div className="border-base-content/[0.08] space-y-3 border p-3">
      <SkeletonLine width="w-36" height="h-3" />
      <SkeletonLine width="w-full" height="h-2" />
      <div className="flex justify-between">
        <SkeletonLine width="w-16" height="h-3" />
        <SkeletonLine width="w-16" height="h-3" />
      </div>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {["token-0", "token-1"].map(key => (
        <div key={key} className="border-base-content/[0.08] space-y-3 border p-3">
          <div className="flex items-center gap-2">
            <SkeletonCircle size="size-6" />
            <SkeletonLine width="w-16" height="h-4" />
          </div>
          <SkeletonLine width="w-20" height="h-4" />
          <SkeletonLine width="w-28" height="h-3" />
        </div>
      ))}
    </div>
  </div>
);

export function ProtocolSkeleton({
  centered = false,
  positionsPerCard = 3,
  ariaLabel = "Loading protocol data",
  protocolName,
  variant = "lending",
  className = "",
}: ProtocolSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      aria-live="polite"
      className={[
        "w-full flex flex-col hide-scrollbar",
        centered ? "grid place-items-center p-6" : "p-4 space-y-4",
        className,
      ].join(" ")}
    >
      <ProtocolHeaderSkeleton protocolName={protocolName} />

      {variant === "wallet" ? (
        <SkeletonCard keyPrefix="wallet" rowCount={2} />
      ) : variant === "liquidity" ? (
        <LiquiditySkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SkeletonCard keyPrefix="supplied" rowCount={positionsPerCard} />
          <SkeletonCard keyPrefix="borrowed" rowCount={positionsPerCard} />
        </div>
      )}

      <span className="sr-only">Loading...</span>
    </div>
  );
}
