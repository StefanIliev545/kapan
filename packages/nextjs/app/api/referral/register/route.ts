import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, referralCodes, referrals } from "~~/lib/db";
import { formatReferralCode, isValidReferralCode, normalizeAddress } from "~~/utils/referral";

/**
 * POST /api/referral/register
 * Registers a referee with a referral code.
 * Body: { refereeWallet: "0x...", referralCode: "KAP-XXXX-XXXX" }
 */
export async function POST(req: NextRequest) {
  let body: { refereeWallet?: string; referralCode?: string };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { refereeWallet, referralCode } = body;

  if (!refereeWallet) {
    return Response.json({ error: "Missing refereeWallet in request body" }, { status: 400 });
  }

  if (!referralCode) {
    return Response.json({ error: "Missing referralCode in request body" }, { status: 400 });
  }

  // Validate code format
  if (!isValidReferralCode(referralCode)) {
    return Response.json({ error: "Invalid referral code format" }, { status: 400 });
  }

  const normalizedReferee = normalizeAddress(refereeWallet);
  const formattedCode = formatReferralCode(referralCode);

  try {
    // Check if referee is already registered
    const [existingReferral] = await db
      .select({ referrerAddress: referrals.referrerAddress, referralCode: referrals.referralCode })
      .from(referrals)
      .where(eq(referrals.refereeAddress, normalizedReferee))
      .limit(1);

    if (existingReferral) {
      return Response.json({
        registered: false,
        reason: "Already registered with a referral code",
        existingCode: existingReferral.referralCode,
      }, { status: 200 });
    }

    // Look up the referral code to get the referrer address
    const [codeData] = await db
      .select({ walletAddress: referralCodes.walletAddress })
      .from(referralCodes)
      .where(eq(referralCodes.code, formattedCode))
      .limit(1);

    if (!codeData) {
      return Response.json({ error: "Referral code not found" }, { status: 404 });
    }

    const referrerAddress = codeData.walletAddress;

    // Prevent self-referral
    if (normalizedReferee === referrerAddress) {
      return Response.json({ error: "Cannot use your own referral code" }, { status: 400 });
    }

    // Register the referral
    try {
      const [inserted] = await db
        .insert(referrals)
        .values({
          referrerAddress,
          refereeAddress: normalizedReferee,
          referralCode: formattedCode,
        })
        .returning({ createdAt: referrals.createdAt });

      return Response.json({
        registered: true,
        referrerAddress,
        createdAt: inserted.createdAt,
      }, { status: 201 });
    } catch (err: unknown) {
      const pgError = err as { code?: string };

      // Handle race condition where referee was registered by another request
      if (pgError.code === "23505") {
        return Response.json({
          registered: false,
          reason: "Already registered with a referral code",
        }, { status: 200 });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error registering referral:", error);
    return Response.json({ error: "Failed to register referral" }, { status: 500 });
  }
}
