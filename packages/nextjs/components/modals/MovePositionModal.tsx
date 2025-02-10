import { FC } from "react";

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
  position: {
    name: string;
    balance: number;
    type: "supply" | "borrow";
  };
}

export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position }) => {
  const protocols = ["Aave V3", "Compound V3"];

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg">
          Move {position.type === "supply" ? "Supply" : "Debt"}: {position.name}
        </h3>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm text-base-content/70">From Protocol</label>
            <div className="font-medium">{fromProtocol}</div>
          </div>

          <div>
            <label className="text-sm text-base-content/70">To Protocol</label>
            <select className="select select-bordered w-full">
              {protocols
                .filter(p => p !== fromProtocol)
                .map(protocol => (
                  <option key={protocol} value={protocol}>
                    {protocol}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Move Position</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};
