"use client";

import { useState } from "react";
import clsx from "clsx";
import { useReferralCode, useCreateReferralCode } from "~~/hooks/useReferral";
import { LoadingSpinner } from "~~/components/common/Loading";

interface ReferralCodeDisplayProps {
  walletAddress: string;
  className?: string;
}

export function ReferralCodeDisplay({ walletAddress, className }: ReferralCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const { code, isLoading, error, refetch } = useReferralCode(walletAddress);
  const { createCode, isLoading: isCreating, error: createError } = useCreateReferralCode();

  const handleCopy = async () => {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateCode = () => {
    createCode(walletAddress, {
      onSuccess: () => {
        refetch();
      },
    });
  };

  if (isLoading) {
    return (
      <div className={clsx("flex items-center gap-2", className)}>
        <LoadingSpinner size="sm" />
        <span className="text-base-content/70 text-sm">Loading referral code...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx("text-error text-sm", className)}>
        Failed to load referral code
      </div>
    );
  }

  if (!code) {
    return (
      <div className={clsx("flex flex-col gap-2", className)}>
        <p className="text-base-content/70 text-sm">
          Generate your referral code to share with friends
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleCreateCode}
          disabled={isCreating}
        >
          {isCreating ? (
            <>
              <LoadingSpinner size="sm" />
              Generating...
            </>
          ) : (
            "Generate Referral Code"
          )}
        </button>
        {createError && (
          <p className="text-error text-xs">{createError}</p>
        )}
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <p className="text-base-content/70 text-sm">Your referral code</p>
      <div className="flex items-center gap-2">
        <code className="bg-base-200 rounded-lg px-4 py-2 font-mono text-lg tracking-wider">
          {code}
        </code>
        <button
          className={clsx(
            "btn btn-sm btn-ghost",
            copied && "btn-success"
          )}
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
