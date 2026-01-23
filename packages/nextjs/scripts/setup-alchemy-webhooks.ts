/**
 * Setup Alchemy Webhooks for Order Fill Tracking
 *
 * Run with: yarn webhooks:setup
 *
 * Required env vars:
 * - NEXT_ALCHEMY_AUTH_TOKEN: Your Alchemy Notify auth token
 *   (from https://dashboard.alchemy.com/notify -> top right corner)
 */

import { Alchemy, Network, WebhookType } from "alchemy-sdk";
import deployedContracts from "../contracts/deployedContracts";

const ALCHEMY_AUTH_TOKEN = process.env.NEXT_ALCHEMY_AUTH_TOKEN;
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const WEBHOOK_URL = "https://app.kapan.finance/api/webhooks/order-fill";

// Map chain IDs to Alchemy Network enum
const CHAIN_TO_ALCHEMY_NETWORK: Record<number, Network> = {
  1: Network.ETH_MAINNET,
  42161: Network.ARB_MAINNET,
  8453: Network.BASE_MAINNET,
  10: Network.OPT_MAINNET,
  59144: Network.LINEA_MAINNET,
};

async function main() {
  if (!ALCHEMY_AUTH_TOKEN) {
    console.error("❌ NEXT_ALCHEMY_AUTH_TOKEN env var is required");
    console.log("\nGet it from: https://dashboard.alchemy.com/notify -> top right corner");
    process.exit(1);
  }

  console.log("🔧 Setting up Alchemy webhooks for order fill tracking\n");
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Auth Token: ${ALCHEMY_AUTH_TOKEN?.slice(0, 8)}...${ALCHEMY_AUTH_TOKEN?.slice(-4)} (${ALCHEMY_AUTH_TOKEN?.length} chars)\n`);

  // Initialize Alchemy with auth token and API key
  const alchemy = new Alchemy({
    apiKey: ALCHEMY_API_KEY,
    authToken: ALCHEMY_AUTH_TOKEN,
    network: Network.ETH_MAINNET,
  });

  // Get existing webhooks to avoid duplicates
  const existingWebhooks = await alchemy.notify.getAllWebhooks();
  const existingByNetwork = new Map(
    existingWebhooks.webhooks
      .filter(w => w.url === WEBHOOK_URL)
      .map(w => [w.network, w])
  );

  const signingKeys: string[] = [];

  // Create webhooks for each chain with deployed OrderManager
  for (const [chainIdStr, contracts] of Object.entries(deployedContracts)) {
    const chainId = parseInt(chainIdStr);
    const network = CHAIN_TO_ALCHEMY_NETWORK[chainId];

    if (!network) {
      console.log(`⏭️  Chain ${chainId}: No Alchemy network mapping, skipping`);
      continue;
    }

    const orderManagerAddress = (contracts as { KapanOrderManager?: { address: string } })?.KapanOrderManager?.address;

    if (!orderManagerAddress) {
      console.log(`⏭️  Chain ${chainId} (${network}): No KapanOrderManager deployed, skipping`);
      continue;
    }

    // Check if webhook already exists
    const existing = existingByNetwork.get(network);
    if (existing) {
      console.log(`✅ Chain ${chainId} (${network}): Webhook already exists (${existing.id})`);
      continue;
    }

    try {
      console.log(`📡 Chain ${chainId} (${network}): Creating webhook for ${orderManagerAddress}...`);

      const webhook = await alchemy.notify.createWebhook(
        WEBHOOK_URL,
        WebhookType.ADDRESS_ACTIVITY,
        {
          addresses: [orderManagerAddress],
          network,
        }
      );

      console.log(`   ✅ Created webhook ${webhook.id}`);
      if (webhook.signingKey) {
        signingKeys.push(webhook.signingKey);
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(60));

  if (signingKeys.length > 0) {
    // All webhooks for same URL share the signing key
    console.log("\n🔑 Add this to your .env file:\n");
    console.log(`ALCHEMY_WEBHOOK_SIGNING_KEY=${signingKeys[0]}`);
  }

  console.log("\n✨ Done! Webhooks will POST to your endpoint when ChunkExecuted events fire.");
}

main().catch(console.error);
