"use client";

import * as React from "react";
import { SkeletonLine, SkeletonCircle, SkeletonRow } from "./Loading";

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
  className?: string;
};

export function ProtocolSkeleton({
  centered = false,
  positionsPerCard = 4,
  ariaLabel = "Loading protocol data",
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
      {/* Protocol Header Card - Full width */}
      <div className="card bg-base-100 rounded-lg shadow-lg">
        <div className="card-body p-4">
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <SkeletonLine width="w-12" height="h-12" className="flex-shrink-0 rounded-lg" />
              <div className="flex flex-col gap-2">
                <SkeletonLine width="w-32" height="h-6" />
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <SkeletonLine width="w-24" height="h-3" />
                  <SkeletonLine width="w-24" height="h-3" />
                  <SkeletonLine width="w-20" height="h-3" />
                </div>
              </div>
            </div>
            <SkeletonLine width="w-32" height="h-8" />
            <SkeletonLine width="w-24" height="h-8" className="justify-self-end" />
          </div>
        </div>
      </div>

      {/* Positions Container: Two cards side by side */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Supplied Assets Card */}
        <SkeletonCard keyPrefix="supplied" rowCount={positionsPerCard} />
        {/* Borrowed Assets Card */}
        <SkeletonCard keyPrefix="borrowed" rowCount={positionsPerCard} />
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  );
}
