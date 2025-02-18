import { FC, ReactNode } from "react";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export const BaseModal: FC<BaseModalProps> = ({ isOpen, onClose, children }) => {
  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        {children}
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}; 