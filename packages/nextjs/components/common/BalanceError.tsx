"use client";

type BalanceErrorProps = {
  className?: string;
};

/**
 * A reusable error display component for balance fetch failures.
 * Used across scaffold-eth and scaffold-stark Balance components.
 */
export const BalanceError = ({ className = "" }: BalanceErrorProps) => {
  return (
    <div
      className={`border-base-content/30 flex max-w-fit cursor-pointer flex-col items-center rounded-md border-2 px-2 ${className}`}
    >
      <div className="text-warning">Error</div>
    </div>
  );
};
