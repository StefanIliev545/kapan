import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, referralCodes } from "~~/lib/db";
import { generateReferralCode, normalizeAddress } from "~~/utils/referral";

/**
 * GET /api/referral/code?wallet=0x...
 * Fetches the existing referral code for a wallet address.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return Response.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  const normalizedWallet = normalizeAddress(wallet);

  try {
    const [row] = await db
      .select({ code: referralCodes.code, createdAt: referralCodes.createdAt })
      .from(referralCodes)
      .where(eq(referralCodes.walletAddress, normalizedWallet))
      .limit(1);

    if (!row) {
      return Response.json({ code: null }, { status: 200 });
    }

    return Response.json({ code: row.code, createdAt: row.createdAt }, { status: 200 });
  } catch (error) {
    console.error("Error fetching referral code:", error);
    return Response.json({ error: "Failed to fetch referral code" }, { status: 500 });
  }
}

/**
 * POST /api/referral/code
 * Creates a new referral code for a wallet address.
 * Body: { wallet: "0x..." }
 */
export async function POST(req: NextRequest) {
  let body: { wallet?: string };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wallet = body.wallet;

  if (!wallet) {
    return Response.json({ error: "Missing wallet in request body" }, { status: 400 });
  }

  const normalizedWallet = normalizeAddress(wallet);

  try {
    // Check if wallet already has a code
    const [existing] = await db
      .select({ code: referralCodes.code })
      .from(referralCodes)
      .where(eq(referralCodes.walletAddress, normalizedWallet))
      .limit(1);

    if (existing) {
      return Response.json({ code: existing.code, created: false }, { status: 200 });
    }

    // Generate a unique code with retry logic
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const code = generateReferralCode();

      try {
        const [inserted] = await db
          .insert(referralCodes)
          .values({ walletAddress: normalizedWallet, code })
          .returning({ code: referralCodes.code, createdAt: referralCodes.createdAt });

        return Response.json({ code: inserted.code, createdAt: inserted.createdAt, created: true }, { status: 201 });
      } catch (err: unknown) {
        const pgError = err as { code?: string; constraint?: string };

        // If unique constraint violation on code, retry with a new code
        if (pgError.code === "23505" && pgError.constraint?.includes("code")) {
          attempts++;
          continue;
        }

        // If unique constraint violation on wallet, it was created by another request
        if (pgError.code === "23505" && pgError.constraint?.includes("wallet")) {
          const [justCreated] = await db
            .select({ code: referralCodes.code })
            .from(referralCodes)
            .where(eq(referralCodes.walletAddress, normalizedWallet))
            .limit(1);

          if (justCreated) {
            return Response.json({ code: justCreated.code, created: false }, { status: 200 });
          }
        }

        throw err;
      }
    }

    return Response.json({ error: "Failed to generate unique code" }, { status: 500 });
  } catch (error) {
    console.error("Error creating referral code:", error);
    return Response.json({ error: "Failed to create referral code" }, { status: 500 });
  }
}
