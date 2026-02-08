import { FC } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

/**
 * Dashed-border "Add" button used under position columns.
 * Matches the style from the original ProtocolView.
 *
 * - primary (default): green hover — used for "Add Supply", "Add Collateral"
 * - secondary: purple hover — used for "Add Loop"
 */
export const AddButton: FC<{
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "secondary";
}> = ({ onClick, label, disabled, title, variant = "primary" }) => {
  const enabledClasses = variant === "primary"
    ? "border-base-300 hover:border-primary/50 bg-base-200/30 hover:bg-primary/5 text-base-content/60 hover:text-primary"
    : "border-base-300 hover:border-secondary/50 bg-base-200/30 hover:bg-secondary/5 text-base-content/60 hover:text-secondary";
  const disabledClasses = "border-base-300/50 bg-base-200/20 text-base-content/30 cursor-not-allowed";

  return (
    <button
      className={`group flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${disabled ? disabledClasses : enabledClasses}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      type="button"
    >
      <PlusIcon className="size-3.5 transition-transform duration-200 group-hover:rotate-90" />
      <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
};
