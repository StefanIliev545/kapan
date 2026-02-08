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

/** Look up an existing referral code for a wallet. Returns null if none exists. */
async function findExistingCode(normalizedWallet: string): Promise<string | null> {
  const [existing] = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.walletAddress, normalizedWallet))
    .limit(1);
  return existing?.code ?? null;
}

/** Handle a Postgres unique constraint violation during code insertion.
 *  Returns a Response if the violation is recoverable, or null to signal retry/re-throw. */
async function handleInsertConflict(
  err: unknown,
  normalizedWallet: string,
): Promise<Response | null> {
  const pgError = err as { code?: string; constraint?: string };
  if (pgError.code !== "23505") return null;

  // Code collision - caller should retry with a new code
  if (pgError.constraint?.includes("code")) return null;

  // Wallet collision - another request created the code concurrently
  if (pgError.constraint?.includes("wallet")) {
    const existingCode = await findExistingCode(normalizedWallet);
    if (existingCode) {
      return Response.json({ code: existingCode, created: false }, { status: 200 });
    }
  }

  return null;
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

  if (!body.wallet) {
    return Response.json({ error: "Missing wallet in request body" }, { status: 400 });
  }

  const normalizedWallet = normalizeAddress(body.wallet);

  try {
    const existingCode = await findExistingCode(normalizedWallet);
    if (existingCode) {
      return Response.json({ code: existingCode, created: false }, { status: 200 });
    }

    const maxAttempts = 5;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const code = generateReferralCode();
      try {
        const [inserted] = await db
          .insert(referralCodes)
          .values({ walletAddress: normalizedWallet, code })
          .returning({ code: referralCodes.code, createdAt: referralCodes.createdAt });

        return Response.json({ code: inserted.code, createdAt: inserted.createdAt, created: true }, { status: 201 });
      } catch (err: unknown) {
        const conflictResponse = await handleInsertConflict(err, normalizedWallet);
        if (conflictResponse) return conflictResponse;

        // Code collision (pgError.code === "23505" && constraint includes "code") => retry
        const pgError = err as { code?: string; constraint?: string };
        if (pgError.code === "23505" && pgError.constraint?.includes("code")) continue;

        throw err;
      }
    }

    return Response.json({ error: "Failed to generate unique code" }, { status: 500 });
  } catch (error) {
    console.error("Error creating referral code:", error);
    return Response.json({ error: "Failed to create referral code" }, { status: 500 });
  }
}
