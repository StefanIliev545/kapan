import { FC, useState } from "react";
import Image from "next/image";
import { SelectableCollateralView } from "../specific/collateral/SelectableCollateralView";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { useMoveDebtScaffold } from "~~/hooks/kapan/moveDebt";

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
  position: {
    name: string;
    balance: number; // USD value
    tokenBalance: number; // Token amount in human-readable units
    type: "supply" | "borrow";
    tokenAddress: string;
  };
}

export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position }) => {
  const { address: userAddress } = useAccount();
  const protocols = [
    { name: "Aave V3", icon: "/logos/aave.svg" },
    { name: "Compound V3", icon: "/logos/compound.svg" },
  ];

  const [selectedProtocol, setSelectedProtocol] = useState(protocols.find(p => p.name !== fromProtocol)?.name || "");
  const [amount, setAmount] = useState("");
  const [selectedCollaterals, setSelectedCollaterals] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch collaterals from the contract
  const { collaterals: fetchedCollaterals, isLoading: isLoadingCollaterals } = useCollaterals(
    position.tokenAddress,
    fromProtocol,
    userAddress || "0x0000000000000000000000000000000000000000", // Fallback address if not connected
  );

  // Map fetched collaterals to the format expected by SelectableCollateralView
  const collaterals = fetchedCollaterals.map(
    (collateral: { symbol: string; balance: number; address: string; decimals: number }) => ({
      ...collateral,
      selected: selectedCollaterals.has(collateral.symbol),
    }),
  );

  const handleCollateralToggle = (symbol: string) => {
    setSelectedCollaterals(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // Import the moveDebt hook that handles approvals and the moveDebt transaction.
  const { moveDebt, error } = useMoveDebtScaffold();

  const handleMoveDebt = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");

      setLoading(true);

      // Assume token has 18 decimals; adjust if needed.
      const tokenDecimals = 18;
      const debtAmount = parseUnits(amount, tokenDecimals);

      // Build collateral array from selected collaterals.
      // We assume each collateral's entire balance will be moved.
      const selectedCollateralArray = collaterals
        .filter(c => selectedCollaterals.has(c.symbol))
        .map(c => ({
          token: c.address,
          // Convert the collateral balance (assumed to be in human-readable format) to base units.
          amount: parseUnits(c.balance.toString(), c.decimals.toString()),
        }));

      // Only handle debt moves; if it's a supply, you might want a different flow.
      if (position.type === "borrow") {
        await moveDebt({
          user: userAddress,
          debtToken: position.tokenAddress,
          debtAmount,
          collaterals: selectedCollateralArray,
          fromProtocol: fromProtocol.toLowerCase(),
          toProtocol: selectedProtocol.toLowerCase(),
        });
      } else {
        console.log("Supply move not implemented in this hook");
      }

      onClose();
    } catch (err) {
      console.error("Move debt failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg">
          Move {position.type === "supply" ? "Supply" : "Debt"}: {position.name}
        </h3>

        <div className="py-4 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {/* From Protocol */}
            <div>
              <label className="text-sm text-base-content/70">From Protocol</label>
              <div className="btn btn-outline w-full flex items-center justify-between mt-3 !h-12 px-4">
                <div className="flex items-center gap-2 truncate">
                  <Image
                    src={protocols.find(p => p.name === fromProtocol)?.icon || ""}
                    alt={fromProtocol}
                    width={20}
                    height={20}
                    className="rounded-full min-w-[20px]"
                  />
                  <span className="truncate">{fromProtocol}</span>
                </div>
              </div>
            </div>

            {/* To Protocol */}
            <div>
              <label className="text-sm text-base-content/70">To Protocol</label>
              <div className="dropdown w-full">
                <label
                  tabIndex={0}
                  className="btn btn-outline w-full flex items-center justify-between mt-3 !h-12 px-4"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    {selectedProtocol && (
                      <>
                        <Image
                          src={protocols.find(p => p.name === selectedProtocol)?.icon || ""}
                          alt={selectedProtocol}
                          width={20}
                          height={20}
                          className="rounded-full min-w-[20px]"
                        />
                        <span className="truncate">{selectedProtocol}</span>
                      </>
                    )}
                  </div>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </label>
                <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full">
                  {protocols
                    .filter(p => p.name !== fromProtocol)
                    .map(protocol => (
                      <li key={protocol.name}>
                        <a className="flex items-center gap-2" onClick={() => setSelectedProtocol(protocol.name)}>
                          <Image
                            src={protocol.icon}
                            alt={protocol.name}
                            width={20}
                            height={20}
                            className="rounded-full min-w-[20px]"
                          />
                          <span className="truncate">{protocol.name}</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            {/* Flash Loan Provider */}
            <div>
              <label className="text-sm text-base-content/70">Flash Loan Provider</label>
              <div className="dropdown w-full">
                <label
                  tabIndex={0}
                  className="btn btn-outline w-full flex items-center justify-between mt-3 !h-12 px-4"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    <Image
                      src="/logos/balancer.svg"
                      alt="Balancer"
                      width={20}
                      height={20}
                      className="rounded-full min-w-[20px]"
                    />
                    <span className="truncate">Balancer</span>
                  </div>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </label>
                <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full">
                  <li>
                    <a className="flex items-center gap-2">
                      <Image
                        src="/logos/balancer.svg"
                        alt="Balancer"
                        width={20}
                        height={20}
                        className="rounded-full min-w-[20px]"
                      />
                      <span className="truncate">Balancer</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="max-w-l">
            <label className="text-sm text-base-content/70">
              Amount{" "}
              <span className="float-right">
                Available: {Math.abs(position.tokenBalance).toFixed(4)} {position.name}
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                className="input input-bordered w-full pr-16"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                max={Math.abs(position.tokenBalance)}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 underline cursor-pointer hover:opacity-80 text-sm"
                onClick={() => setAmount(Math.abs(position.tokenBalance).toString())}
              >
                Max
              </span>
            </div>
          </div>

          {/* Collateral Selection */}
          {position.type === "borrow" && (
            <div>
              <label className="text-sm text-base-content/70 mb-2 block">Select Collateral to Move</label>
              {isLoadingCollaterals ? (
                <div className="flex items-center justify-center py-4">
                  <span className="loading loading-spinner loading-md"></span>
                </div>
              ) : collaterals.length > 0 ? (
                <SelectableCollateralView collaterals={collaterals} onCollateralToggle={handleCollateralToggle} />
              ) : (
                <div className="text-base-content/70 text-center p-4 bg-base-200 rounded-lg">
                  No collateral available to move
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleMoveDebt}
            disabled={
              loading ||
              !selectedProtocol ||
              !amount ||
              Number(amount) <= 0 ||
              Number(amount) > Math.abs(position.tokenBalance) ||
              (position.type === "borrow" && selectedCollaterals.size === 0)
            }
          >
            {loading ? "Moving..." : "Move Position"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};
