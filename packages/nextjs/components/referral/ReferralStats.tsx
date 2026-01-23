"use client";

import clsx from "clsx";
import { useReferralStats } from "~~/hooks/useReferral";
import { truncateAddress } from "~~/utils/address";
import { LoadingSpinner } from "~~/components/common/Loading";

interface ReferralStatsProps {
  walletAddress: string;
  className?: string;
}

export function ReferralStats({ walletAddress, className }: ReferralStatsProps) {
  const {
    totalReferrals,
    referredBy,
    recentReferrals,
    isLoading,
    error,
  } = useReferralStats(walletAddress);

  if (isLoading) {
    return (
      <div className={clsx("flex items-center gap-2", className)}>
        <LoadingSpinner size="sm" />
        <span className="text-sm text-base-content/70">Loading stats...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx("text-sm text-error", className)}>
        Failed to load referral stats
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-4", className)}>
      <div className="stats stats-vertical lg:stats-horizontal shadow bg-base-200">
        <div className="stat">
          <div className="stat-title">Total Referrals</div>
          <div className="stat-value text-primary">{totalReferrals}</div>
          <div className="stat-desc">Friends who joined</div>
        </div>

        <div className="stat">
          <div className="stat-title">Referred By</div>
          <div className="stat-value text-lg">
            {referredBy ? truncateAddress(referredBy) : "-"}
          </div>
          <div className="stat-desc">
            {referredBy ? "Your referrer" : "No referrer"}
          </div>
        </div>
      </div>

      {recentReferrals.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-sm">Recent Referrals</h4>
          <div className="overflow-x-auto">
            <table className="table table-sm bg-base-200 rounded-lg">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReferrals.map((referral) => (
                  <tr key={referral.refereeAddress}>
                    <td className="font-mono text-sm">
                      {truncateAddress(referral.refereeAddress)}
                    </td>
                    <td className="text-sm text-base-content/70">
                      {new Date(referral.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
