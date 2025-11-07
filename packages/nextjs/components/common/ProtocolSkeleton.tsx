"use client";

import * as React from "react";

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
  // Position item skeleton - horizontal, not very tall
  const PositionItem = () => (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-base-200/30">
      <div className="skeleton h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="skeleton h-4 w-20 flex-shrink-0" />
    </div>
  );

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
      <div className="card bg-base-100 shadow-lg rounded-lg">
        <div className="card-body p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="flex items-center gap-3">
              <div className="skeleton h-12 w-12 rounded-lg flex-shrink-0" />
              <div className="flex flex-col gap-2">
                <div className="skeleton h-6 w-32" />
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-3 w-20" />
                </div>
              </div>
            </div>
            <div className="skeleton h-8 w-32" />
            <div className="skeleton h-8 w-24 justify-self-end" />
          </div>
        </div>
      </div>

      {/* Positions Container: Two cards side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Supplied Assets Card */}
        <div className="h-full">
          <div className="card bg-base-100 shadow-md h-full rounded-lg">
            <div className="card-body p-4">
              <div className="flex items-center justify-between border-b border-base-200 pb-2 mb-2">
                <div className="skeleton h-5 w-32" />
                <div className="skeleton h-5 w-8 rounded-full" />
              </div>
              <div className="pt-2 space-y-3">
                {Array.from({ length: positionsPerCard }).map((_, i) => (
                  <PositionItem key={`supplied-${i}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Borrowed Assets Card */}
        <div className="h-full">
          <div className="card bg-base-100 shadow-md h-full rounded-lg">
            <div className="card-body p-4">
              <div className="flex items-center justify-between border-b border-base-200 pb-2 mb-2">
                <div className="skeleton h-5 w-32" />
                <div className="skeleton h-5 w-8 rounded-full" />
              </div>
              <div className="pt-2 space-y-3">
                {Array.from({ length: positionsPerCard }).map((_, i) => (
                  <PositionItem key={`borrowed-${i}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}

