"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline";

const examples = {
  deleverage: {
    label: "Reduce leverage",
    trigger: "Above 70% LTV",
    action: "Sell some collateral to repay debt.",
    explanation: "If debt grows relative to collateral, the rule targets a lower LTV.",
    icon: ArrowDownIcon,
  },
  leverage: {
    label: "Increase leverage",
    trigger: "Below 40% LTV",
    action: "Borrow to add more collateral.",
    explanation: "If LTV falls, the rule can increase exposure toward your chosen target.",
    icon: ArrowUpIcon,
  },
};

type ExampleMode = keyof typeof examples;

export function AutomationExample() {
  const [mode, setMode] = useState<ExampleMode>("deleverage");
  const example = examples[mode];
  const Icon = example.icon;

  return (
    <div className="mx-auto max-w-xl text-left">
      <p className="mb-5 text-center text-sm leading-relaxed text-base-content/70 sm:text-base">
        Set when to adjust leverage, and the loan-to-value ratio to aim for.
      </p>
      <div className="card-surface overflow-hidden">
        <div className="flex border-b border-base-content/10">
          {Object.entries(examples).map(([id, option]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id as ExampleMode)}
              className={`flex-1 px-4 py-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                mode === id ? "bg-base-content/5 text-base-content" : "text-base-content/55 hover:text-base-content"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="space-y-5 p-5 sm:p-6" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-xs text-base-content/55">Trigger</p>
              <p className="whitespace-nowrap font-mono text-sm font-semibold sm:text-lg">{example.trigger}</p>
            </div>
            <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="text-right">
              <p className="mb-1 text-xs text-base-content/55">Target</p>
              <p className="whitespace-nowrap font-mono text-sm font-semibold sm:text-lg text-accent">55% LTV</p>
            </div>
          </div>
          <div className="relative h-2 rounded-full bg-base-content/10" aria-hidden="true">
            <div className="absolute inset-y-0 left-[40%] w-[30%] rounded-full bg-accent/25" />
            <div className="absolute -top-1 left-[55%] h-4 w-0.5 bg-accent" />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">{example.action}</p>
            <p className="text-sm leading-relaxed text-base-content/60">{example.explanation}</p>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs leading-relaxed text-base-content/60">
        Recurring rules on supported markets. Execution depends on liquidity and your limits; liquidation risk remains.
      </p>
    </div>
  );
}
