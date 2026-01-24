"use client";

import { useState, useCallback } from "react";
import {
  CheckCircleIcon,
  DocumentDuplicateIcon,
  UserGroupIcon,
  UserPlusIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";
import { useReferral } from "~~/contexts/ReferralContext";
import { truncateAddress } from "~~/utils/address";
import { LoadingSpinner } from "~~/components/common/Loading";

interface ReferralDropdownSectionProps {
  onClose?: () => void;
}

export function ReferralDropdownSection({ onClose }: ReferralDropdownSectionProps) {
  const {
    myReferralCode,
    isLoadingMyCode,
    referralLink,
    totalReferrals,
    referredBy,
    generateMyCode,
    isGeneratingCode,
  } = useReferral();

  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = referralLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink]);

  const handleShare = useCallback(async () => {
    if (!referralLink) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Kapan Finance",
          text: "Optimize your DeFi borrowing costs with Kapan Finance",
          url: referralLink,
        });
        onClose?.();
      } catch {
        // User cancelled or share failed, fall back to copy
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  }, [referralLink, onClose, handleCopyLink]);

  const handleGenerateCode = useCallback(() => {
    generateMyCode();
  }, [generateMyCode]);

  return (
    <div className="border-base-200 border-t py-2">
      {/* Section Header */}
      <div className="px-4 py-1">
        <span className="text-base-content/50 text-xs font-semibold uppercase tracking-wider">
          Referrals
        </span>
      </div>

      {isLoadingMyCode ? (
        <div className="flex items-center gap-2 px-4 py-2">
          <LoadingSpinner size="sm" />
          <span className="text-base-content/60 text-sm">Loading...</span>
        </div>
      ) : myReferralCode ? (
        <>
          {/* Referral Code Display */}
          <div className="px-4 py-2">
            <div className="bg-base-200 flex items-center justify-between rounded-lg px-3 py-2">
              <code className="font-mono text-sm tracking-wide">{myReferralCode}</code>
              <div className="flex gap-1">
                <button
                  onClick={handleCopyLink}
                  className="btn btn-ghost btn-xs"
                  title="Copy referral link"
                >
                  {copied ? (
                    <CheckCircleIcon className="text-success size-4" />
                  ) : (
                    <DocumentDuplicateIcon className="size-4" />
                  )}
                </button>
                <button
                  onClick={handleShare}
                  className="btn btn-ghost btn-xs"
                  title="Share referral link"
                >
                  <ShareIcon className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex items-center gap-2">
              <UserGroupIcon className="text-primary size-4" />
              <span className="text-sm">
                <span className="font-semibold">{totalReferrals}</span>
                <span className="text-base-content/60"> referred</span>
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Generate Code Button */
        <button
          onClick={handleGenerateCode}
          disabled={isGeneratingCode}
          className="hover:bg-base-200 flex w-full items-center gap-3 px-4 py-2.5 transition-colors disabled:opacity-50"
        >
          {isGeneratingCode ? (
            <LoadingSpinner size="sm" />
          ) : (
            <UserPlusIcon className="text-base-content/60 size-5" />
          )}
          <span className="text-sm">
            {isGeneratingCode ? "Generating..." : "Get Referral Code"}
          </span>
        </button>
      )}

      {/* Referred By */}
      {referredBy && (
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="text-base-content/50 text-xs">Referred by:</span>
          <span className="font-mono text-xs">{truncateAddress(referredBy)}</span>
        </div>
      )}
    </div>
  );
}
