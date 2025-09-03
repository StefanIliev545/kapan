import { FC, ReactNode } from "react";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}

export const BaseModal: FC<BaseModalProps> = ({ isOpen, onClose, children, maxWidthClass = "max-w-md" }) => {
  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className={`modal-box ${maxWidthClass}`}>
        {children}
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}; 