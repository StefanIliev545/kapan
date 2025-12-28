import { FC, ReactNode } from "react";
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
  if (!isOpen) return null;

  return (
    <dialog className="modal modal-open">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className={`modal-box relative bg-base-100 border border-base-300/50 rounded-xl shadow-xl ${maxWidthClass} ${boxClassName}`}>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-200">
            <h3 className="text-lg font-semibold text-base-content">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Close button if no title */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}

        {children}
      </div>
    </dialog>
  );
};