"use client";

import React from "react";

export type InstructionOutputPointer = {
  kind: "output_ptr";
  instr: number;
  index: number;
  u256?: boolean;
};

export type InstructionValue = string | number | bigint | InstructionOutputPointer | null | undefined;

export type InstructionPreview = {
  kind: string;
  to?: `0x${string}`;
  entrypoint?: string;
  token?: `0x${string}`;
  amount?: InstructionValue;
  amountPtr?: InstructionOutputPointer;
  calldata?: InstructionValue[];
  meta?: Record<string, InstructionValue>;
};

type InstructionExplorerProps = {
  steps: InstructionPreview[];
  footer?: React.ReactNode;
};

const kindToLabel = (kind: string) => {
  const normalized = kind.toLowerCase();
  switch (normalized) {
    case "repay":
      return "Repay";
    case "withdraw":
      return "Withdraw";
    case "swap":
      return "Swap";
    case "approve":
      return "Approve";
    case "deposit":
      return "Deposit";
    case "borrow":
      return "Borrow";
    case "redeposit":
      return "Redeposit";
    case "reborrow":
      return "Reborrow";
    default:
      return kind;
  }
};

const shortenAddress = (value: string) => {
  if (!value.startsWith("0x")) return value;
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const renderValue = (value: InstructionValue) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") {
    return value.startsWith("0x") ? shortenAddress(value) : value;
  }
  if (typeof value === "object" && value.kind === "output_ptr") {
    const suffix = value.u256 ? " (u256)" : "";
    return <code>{`out[${value.instr}][${value.index}]${suffix}`}</code>;
  }
  return String(value);
};

const Field = ({ label, value }: { label: string; value: InstructionValue }) => (
  <div className="flex items-center gap-2">
    <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-base-content/60">{label}</span>
    <span className="break-all text-sm text-base-content">{renderValue(value)}</span>
  </div>
);

export const InstructionExplorer: React.FC<InstructionExplorerProps> = ({ steps, footer }) => {
  const stepCount = steps.length;
  const copyDebugJson = () => {
    void navigator.clipboard?.writeText(JSON.stringify(steps, null, 2));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm font-medium text-base-content/70">
        {stepCount === 1 ? "1 step" : `${stepCount} steps`}
      </div>

      {stepCount === 0 ? (
        <div className="rounded-lg border border-base-300 bg-base-200/60 p-4 text-sm text-base-content/70 dark:border-base-300/60 dark:bg-base-300/20">
          No instructions to review.
        </div>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={`${step.kind}-${index}`} className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm dark:border-base-300/60 dark:bg-base-200">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-base-300 text-xs font-semibold text-base-content/70">
                  {index}
                </span>
                <span className="text-sm font-semibold text-base-content">{kindToLabel(step.kind)}</span>
                {step.entrypoint && (
                  <span className="text-xs text-base-content/60">· {step.entrypoint}</span>
                )}
              </div>

              <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {step.to && <Field label="to" value={step.to} />}
                {step.token && <Field label="token" value={step.token} />}
                {step.amount !== undefined && <Field label="amount" value={step.amount} />}
                {step.amountPtr && <Field label="amount ptr" value={step.amountPtr} />}
                {step.meta &&
                  Object.entries(step.meta).map(([key, value]) => (
                    <Field key={key} label={key} value={value} />
                  ))}
              </div>

              {Array.isArray(step.calldata) && step.calldata.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-base-content/60">calldata</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-base-200/60 p-2 text-xs text-base-content/80 dark:bg-base-300/30">
                    {JSON.stringify(step.calldata, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm border border-base-300 text-sm"
          onClick={copyDebugJson}
          disabled={stepCount === 0}
        >
          Copy debug JSON
        </button>
        {footer}
      </div>
    </div>
  );
};
