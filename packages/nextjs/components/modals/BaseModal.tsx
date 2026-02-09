import type { FC, ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  maxWidthClass?: string;
  boxClassName?: string;
}

export const BaseModal: FC<BaseModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  maxWidthClass = "max-w-md",
  boxClassName = ""
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <dialog className="modal modal-open">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className={`modal-box bg-base-100 border-base-300/50 relative rounded-xl border shadow-xl ${maxWidthClass} ${boxClassName}`}>
        {/* Header */}
        {title && (
          <div className="border-base-200 mb-4 flex items-center justify-between border-b pb-3">
            <h3 className="text-base-content text-lg font-semibold">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1.5 transition-colors"
            >
              <XMarkIcon className="size-5" />
            </button>
          </div>
        )}

        {/* Close button if no title */}
        {!title && (
          <button
            type="button"
            onClick={onClose}
            className="text-base-content/40 hover:text-base-content hover:bg-base-200 absolute right-3 top-3 rounded-lg p-1.5 transition-colors"
          >
            <XMarkIcon className="size-5" />
          </button>
        )}

        {children}
      </div>
    </dialog>
  );
};