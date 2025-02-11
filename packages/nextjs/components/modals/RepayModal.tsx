import { FC } from "react";
import Image from "next/image";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    currentRate: number;
  };
  protocolName: string;
}

export const RepayModal: FC<RepayModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
          Repay {token.name}
        </h3>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm text-base-content/70">Protocol</label>
            <div className="font-medium">{protocolName}</div>
          </div>

          <div>
            <label className="text-sm text-base-content/70">Amount</label>
            <input type="number" className="input input-bordered w-full" placeholder="0.00" />
          </div>

          <div className="text-sm">
            <span className="text-base-content/70">Borrow APY:</span>
            <span className="ml-2 font-medium">{token.currentRate.toFixed(2)}%</span>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Repay</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}; 