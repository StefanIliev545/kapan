import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database client for server-side operations.
 *
 * Uses Supabase's connection pooler (port 6543) for serverless compatibility.
 * The connection string should use the "Transaction" pooler mode for Vercel.
 *
 * IMPORTANT: Only import this in server components or API routes.
 */

const connectionString = process.env.DATABASE_URL || process.env.NEXT_DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or NEXT_DATABASE_URL environment variable is not set");
}

// For serverless, use connection pooling settings
const client = postgres(connectionString, {
  prepare: false, // Required for Supabase transaction pooler
  max: 1, // Serverless: one connection per invocation
});

export const db = drizzle(client, { schema });

// Re-export schema for convenience
export * from "./schema";
