import { FC, useState } from "react";
import Image from "next/image";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { BaseModal } from "./BaseModal";
import { useProtocolRates } from "~~/hooks/kapan/useProtocolRates";
import { notification } from "~~/utils/scaffold-eth";

interface MoveSupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    currentRate: number;
    address: string;
  };
  fromProtocol: string;
}

export const MoveSupplyModal: FC<MoveSupplyModalProps> = ({ isOpen, onClose, token, fromProtocol }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<string | null>(null);

  // Get rates from all protocols
  const { data: rates, isLoading: ratesLoading } = useProtocolRates(token.address);

  const handleMove = async () => {
    if (!selectedProtocol) return;

    try {
      setIsLoading(true);
      notification.success("Position moved successfully!");
      onClose();
    } catch (error) {
      console.error("Error moving position:", error);
      notification.error("Failed to move position");
    } finally {
      setIsLoading(false);
    }
  };

  const formatRate = (rate: number) => `${rate.toFixed(2)}%`;

  const protocols = rates
    ?.filter(rate => rate.protocol !== fromProtocol)
    .sort((a, b) => b.supplyRate - a.supplyRate);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold">Move Supply Position</h3>
          <div className="flex items-center gap-2">
            <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
            <span className="font-semibold">{token.name}</span>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base-content/70">Current Protocol</span>
            <span className="font-medium">{fromProtocol}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-base-content/70">Current Rate</span>
            <span className="font-medium">{formatRate(token.currentRate)}</span>
          </div>
        </div>

        <div className="divider">
          <ArrowsRightLeftIcon className="w-5 h-5" />
        </div>

        <div className="space-y-4 mb-6">
          <h4 className="font-semibold mb-2">Available Protocols</h4>
          {ratesLoading ? (
            <div className="flex justify-center">
              <span className="loading loading-spinner loading-md"></span>
            </div>
          ) : protocols?.length === 0 ? (
            <div className="text-center text-base-content/70">
              No other protocols available
            </div>
          ) : (
            protocols?.map(({ protocol, supplyRate, isOptimal }) => (
              <div
                key={protocol}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedProtocol === protocol
                    ? "border-primary bg-primary/10"
                    : isOptimal 
                      ? "border-success bg-success/5 hover:border-success"
                      : "border-base-300 hover:border-primary"
                }`}
                onClick={() => setSelectedProtocol(protocol)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{protocol}</span>
                    {isOptimal && (
                      <span className="badge badge-success badge-sm">Best Rate</span>
                    )}
                  </div>
                  <span className={`${supplyRate > token.currentRate ? "text-success" : ""}`}>
                    {formatRate(supplyRate)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          className="btn btn-primary w-full"
          onClick={handleMove}
          disabled={!selectedProtocol || isLoading}
        >
          {isLoading ? (
            <span className="loading loading-spinner loading-sm"></span>
          ) : (
            "Move Position"
          )}
        </button>
      </div>
    </BaseModal>
  );
};
