"use client";

import { useState } from "react";
import { TokenActionModal, TokenInfo } from "~~/components/modals/TokenActionModal";

export default function ModalExpoPage() {
  const [action, setAction] = useState<"Borrow" | "Deposit" | "Withdraw" | "Repay" | null>(null);
  const token: TokenInfo = {
    name: "ETH",
    icon: "/images/eth-logo.svg",
    address: "0x0",
    currentRate: 0.05,
    usdPrice: 2000,
    decimals: 18,
  };

  return (
    <div className="p-4 space-x-2">
      <button className="btn" onClick={() => setAction("Borrow")}>
        Borrow
      </button>
      <button className="btn" onClick={() => setAction("Deposit")}>
        Deposit
      </button>
      <button className="btn" onClick={() => setAction("Withdraw")}>
        Withdraw
      </button>
      <button className="btn" onClick={() => setAction("Repay")}>
        Repay
      </button>
      {action && (
        <TokenActionModal
          isOpen={true}
          onClose={() => setAction(null)}
          action={action}
          apyLabel="Supply APY"
          apy={5}
          token={token}
          metricLabel={action === "Borrow" || action === "Repay" ? "Total debt" : "Total supplied"}
          before={123}
          balance={BigInt(1e18)}
          max={BigInt(1e18)}
          network="EVM"
        />
      )}
    </div>
  );
}
