import { NextRequest } from "next/server";
import { eq, desc, count } from "drizzle-orm";
import { db, referralCodes, referrals } from "~~/lib/db";
import { normalizeAddress } from "~~/utils/referral";

interface ReferralInfo {
  refereeAddress: string;
  createdAt: Date | null;
}

interface ReferralStatsResponse {
  code: string | null;
  totalReferrals: number;
  referredBy: string | null;
  recentReferrals: ReferralInfo[];
}

/**
 * GET /api/referral/stats?wallet=0x...
 * Fetches referral statistics for a wallet address.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return Response.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  const normalizedWallet = normalizeAddress(wallet);

  try {
    // Fetch all data in parallel
    const [codeResult, referredByResult, referralsResult, countResult] = await Promise.all([
      // Get user's referral code
      db
        .select({ code: referralCodes.code })
        .from(referralCodes)
        .where(eq(referralCodes.walletAddress, normalizedWallet))
        .limit(1),

      // Check if user was referred by someone
      db
        .select({ referrerAddress: referrals.referrerAddress })
        .from(referrals)
        .where(eq(referrals.refereeAddress, normalizedWallet))
        .limit(1),

      // Get recent users this wallet has referred
      db
        .select({ refereeAddress: referrals.refereeAddress, createdAt: referrals.createdAt })
        .from(referrals)
        .where(eq(referrals.referrerAddress, normalizedWallet))
        .orderBy(desc(referrals.createdAt))
        .limit(10),

      // Get total count
      db
        .select({ count: count() })
        .from(referrals)
        .where(eq(referrals.referrerAddress, normalizedWallet)),
    ]);

    const code = codeResult[0]?.code ?? null;
    const referredBy = referredByResult[0]?.referrerAddress ?? null;
    const totalReferrals = countResult[0]?.count ?? 0;

    const recentReferrals: ReferralInfo[] = referralsResult.map(r => ({
      refereeAddress: r.refereeAddress,
      createdAt: r.createdAt,
    }));

    const response: ReferralStatsResponse = {
      code,
      totalReferrals,
      referredBy,
      recentReferrals,
    };

    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error("Error fetching referral stats:", error);
    return Response.json({ error: "Failed to fetch referral stats" }, { status: 500 });
  }
}
