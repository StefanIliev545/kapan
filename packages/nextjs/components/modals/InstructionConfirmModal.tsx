"use client";

import React from "react";
import { InstructionExplorer, type InstructionPreview } from "~~/components/debug/InstructionExplorer";

type InstructionConfirmModalProps = {
  isOpen: boolean;
  steps: InstructionPreview[];
  onClose: () => void;
  onConfirm: () => void;
};

export const InstructionConfirmModal: React.FC<InstructionConfirmModalProps> = ({
  isOpen,
  steps,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-5 text-base shadow-2xl dark:border-base-300/60 dark:bg-base-200"
        onClick={handleContainerClick}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-base-content">Review instruction plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close instruction confirmation"
          >
            ✕
          </button>
        </div>

        <InstructionExplorer steps={steps} />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm sm:btn-md"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm sm:btn-md border border-transparent bg-black text-white hover:bg-black/90"
            onClick={onConfirm}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
