import { FC, ReactNode } from "react";
import { BaseModal } from "./BaseModal";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-stark/useScaffoldWriteContract";
import { notification } from "~~/utils/scaffold-stark";

interface StarkBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
  instructions: Array<{
    protocol: string;
    instruction: {
      type: string;
      basic: {
        token: string;
        amount: string;
      };
      context?: {
        pool_id: string;
        position_counterpart_token: string;
      };
    };
  }>;
}

export const StarkBaseModal: FC<StarkBaseModalProps> = ({
  isOpen,
  onClose,
  children,
  maxWidthClass = "max-w-md",
  instructions,
}) => {
  const { sendAsync } = useScaffoldWriteContract({
    contractName: "VesuGateway",
    functionName: "process_instructions",
    args: [instructions.map(instruction => ({
      protocol: instruction.protocol,
      instruction: {
        type: instruction.instruction.type,
        basic: {
          token: instruction.instruction.basic.token,
          amount: BigInt(instruction.instruction.basic.amount),
        },
        context: instruction.instruction.context
          ? [BigInt(instruction.instruction.context.pool_id), instruction.instruction.context.position_counterpart_token]
          : undefined,
      },
    }))],
  });

  const handleSubmit = async () => {
    try {
      await sendAsync();
      notification.success("Instructions processed successfully");
      onClose();
    } catch (error) {
      console.error("Error processing instructions:", error);
      notification.error("Failed to process instructions");
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass={maxWidthClass}>
      <div className="p-4">
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="text-base-content/60 hover:text-base-content px-4 py-2 text-sm font-medium transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="bg-base-content text-base-100 hover:bg-base-content/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            onClick={handleSubmit}
          >
            Submit
          </button>
        </div>
      </div>
    </BaseModal>
  );
};