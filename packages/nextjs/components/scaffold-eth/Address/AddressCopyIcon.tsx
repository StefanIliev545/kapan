import { useCallback } from "react";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useCopyToClipboard } from "~~/hooks/common/useCopyToClipboard";

export const AddressCopyIcon = ({ className, address }: { className?: string; address: string }) => {
  const { copy, isCopied } = useCopyToClipboard();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    copy(address);
  }, [copy, address]);

  return (
    <button
      onClick={handleClick}
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
