import { TransactionReceipt } from "viem";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { ObjectFieldDisplay } from "~~/app/debug/_components/contract";
import { useCopyToClipboard } from "~~/hooks/common/useCopyToClipboard";
import { replacer } from "~~/utils/scaffold-eth/common";

export const TxReceipt = ({ txResult }: { txResult: TransactionReceipt }) => {
  const { copy, isCopied: txResultCopied } = useCopyToClipboard();

  return (
    <div className="bg-secondary flex min-h-0 rounded-3xl py-0 text-sm peer-checked:rounded-b-none">
      <div className="mt-1 pl-2">
        <button
          onClick={() => copy(JSON.stringify(txResult, replacer, 2))}
          className="cursor-pointer border-0 bg-transparent p-0"
          type="button"
        >
          {txResultCopied ? (
            <CheckCircleIcon
              className="text-base-content ml-1.5 size-5 text-xl font-normal"
              aria-hidden="true"
            />
          ) : (
            <DocumentDuplicateIcon
              className="ml-1.5 size-5 text-xl font-normal"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
      <div className="collapse-arrow collapse flex-wrap">
        <input type="checkbox" className="peer min-h-0" />
        <div className="collapse-title min-h-0 py-1.5 pl-1 text-sm after:!top-4">
          <strong>Transaction Receipt</strong>
        </div>
        <div className="collapse-content bg-secondary overflow-auto rounded-3xl rounded-t-none !pl-0">
          <pre className="text-xs">
            {Object.entries(txResult).map(([k, v]) => (
              <ObjectFieldDisplay name={k} value={v} size="xs" leftPad={false} key={k} />
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
};
