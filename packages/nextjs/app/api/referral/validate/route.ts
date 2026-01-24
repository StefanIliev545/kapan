import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, referralCodes } from "~~/lib/db";
import { formatReferralCode, isValidReferralCode } from "~~/utils/referral";

/**
 * GET /api/referral/validate?code=KAP-XXXX-XXXX
 * Validates that a referral code exists and is valid.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return Response.json({ error: "Missing code parameter" }, { status: 400 });
  }

  // First check format validity
  if (!isValidReferralCode(code)) {
    return Response.json({ valid: false, reason: "Invalid code format" }, { status: 200 });
  }

  const formattedCode = formatReferralCode(code);

  try {
    const [row] = await db
      .select({ walletAddress: referralCodes.walletAddress })
      .from(referralCodes)
      .where(eq(referralCodes.code, formattedCode))
      .limit(1);

    if (!row) {
      return Response.json({ valid: false, reason: "Code not found" }, { status: 200 });
    }

    return Response.json({
      valid: true,
      referrerAddress: row.walletAddress,
    }, { status: 200 });
  } catch (error) {
    console.error("Error validating referral code:", error);
    return Response.json({ error: "Failed to validate referral code" }, { status: 500 });
  }
}
