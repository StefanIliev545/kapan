import { FC, useState } from "react";
import { BaseTokenModal } from "./BaseTokenModal";
import { TokenMetadata } from "~~/utils/protocols";
import { feltToString } from "~~/utils/protocols";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

interface BorrowModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string;
    currentRate: number;
  };
  protocolName: string;
  supportedAssets?: TokenMetadata[];
  isVesu?: boolean;
  vesuContext?: {
    pool_id: bigint;
    counterpart_token: string;
  };
}

export const BorrowModalStark: FC<BorrowModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supportedAssets = [],
  isVesu = false,
  vesuContext,
}) => {
  const [selectedDebtAsset, setSelectedDebtAsset] = useState<TokenMetadata | null>(null);

  // Filter out the collateral asset from supported assets if provided
  const availableDebtAssets = supportedAssets.filter(
    asset => !vesuContext || `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` !== vesuContext.counterpart_token
  );

  // Set initial selected debt asset if not set
  if (!selectedDebtAsset && availableDebtAssets.length > 0) {
    setSelectedDebtAsset(availableDebtAssets[0]);
  }

  return (
    <BaseTokenModal
      isOpen={isOpen}
      onClose={onClose}
      token={token}
      protocolName={protocolName}
      actionType="borrow"
      actionLabel="Borrow"
      vesuContext={vesuContext}
    >
      {availableDebtAssets.length > 0 ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-base-content/80">Select Debt Asset</label>
          <select
            className="select select-bordered w-full"
            value={selectedDebtAsset ? `0x${BigInt(selectedDebtAsset.address).toString(16).padStart(64, "0")}` : ""}
            onChange={(e) => {
              const asset = availableDebtAssets.find(
                asset => `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` === e.target.value
              );
              setSelectedDebtAsset(asset || null);
            }}
          >
            {availableDebtAssets.map((asset) => {
              const address = `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;
              const symbol = feltToString(asset.symbol);
              return (
                <option key={address} value={address}>
                  {symbol}
                </option>
              );
            })}
          </select>
        </div>
      ) : (
        <div className="text-sm text-base-content/80">
          No debt assets available for this position.
        </div>
      )}
    </BaseTokenModal>
  );
}; 