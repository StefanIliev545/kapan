"use client";

/**
 * A reusable loading skeleton component for balance displays.
 * Used across scaffold-eth and scaffold-stark Balance and Address components.
 */
export const BalanceSkeleton = () => {
  return (
    <div className="flex animate-pulse space-x-4">
      <div className="size-6 rounded-md bg-slate-300"></div>
      <div className="flex items-center space-y-6">
        <div className="h-2 w-28 rounded bg-slate-300"></div>
      </div>
    </div>
  );
};
