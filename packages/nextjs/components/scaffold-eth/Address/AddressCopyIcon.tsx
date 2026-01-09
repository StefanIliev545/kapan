import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useCopyToClipboard } from "~~/hooks/common/useCopyToClipboard";

export const AddressCopyIcon = ({ className, address }: { className?: string; address: string }) => {
  const { copy, isCopied } = useCopyToClipboard();

  return (
    <button
      onClick={e => {
        e.stopPropagation();
        copy(address);
      }}
      type="button"
    >
      {isCopied ? (
        <CheckCircleIcon className={className} aria-hidden="true" />
      ) : (
        <DocumentDuplicateIcon className={className} aria-hidden="true" />
      )}
    </button>
  );
};
