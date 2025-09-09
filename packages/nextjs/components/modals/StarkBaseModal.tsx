import { FC, ReactNode } from "react";
import { BaseModal } from "./BaseModal";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-stark/useScaffoldWriteContract";
import { useTxWatcher } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";

interface VesuContext {
  pool_id: string;
  position_counterpart_token: string;
}

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
  const { addTx } = useTxWatcher();

  const handleSubmit = async () => {
    try {
      const hash = await sendAsync();
      if (hash) {
        addTx(hash, ["positions", "balances", "markets"]);
      }
      notification.success("Instructions processed successfully");
      onClose();
    } catch (error) {
      console.error("Error processing instructions:", error);
      notification.error("Failed to process instructions");
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass={maxWidthClass}>
      <div className="p-6">
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Submit
          </button>
        </div>
      </div>
    </BaseModal>
  );
}; 