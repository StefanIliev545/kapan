/**
 * Test the webhook endpoint locally by simulating an Alchemy webhook payload
 *
 * Run with: yarn webhook:test
 *
 * Make sure your dev server is running (yarn dev)
 */

// Simulate a ChunkExecuted event from KapanOrderManager
const mockWebhookPayload = {
  webhookId: "wh_test123",
  id: "evt_test456",
  createdAt: new Date().toISOString(),
  type: "ADDRESS_ACTIVITY",
  event: {
    network: "ARB_MAINNET",
    activity: [
      {
        fromAddress: "0x0000000000000000000000000000000000000000",
        toAddress: "0x1234567890123456789012345678901234567890",
        blockNum: "0x1234567",
        hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        log: {
          // This should be a KapanOrderManager address - update if needed
          address: "0x1234567890123456789012345678901234567890",
          // ChunkExecuted(bytes32 indexed orderHash, uint256 chunkIndex, uint256 sellAmount, uint256 buyAmount)
          // Topic 0 is the event signature, Topic 1 is the indexed orderHash
          topics: [
            "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", // placeholder event sig
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // orderHash
          ],
          // ABI encoded: chunkIndex (0), sellAmount (1000000), buyAmount (500000000000000000)
          data: "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000006f05b59d3b20000",
          blockNumber: "0x1234567",
          transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          transactionIndex: "0x0",
          blockHash: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          logIndex: "0x0",
          removed: false,
        },
      },
    ],
  },
};

async function main() {
  const baseUrl = process.env.WEBHOOK_TEST_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/webhooks/order-fill`;

  console.log(`🧪 Testing webhook endpoint: ${url}\n`);

  // Test 1: Health check (GET)
  console.log("1️⃣  Testing health check (GET)...");
  try {
    const healthRes = await fetch(url);
    const healthData = await healthRes.json();
    console.log(`   Status: ${healthRes.status}`);
    console.log(`   Response:`, healthData);
  } catch (error) {
    console.log(`   ❌ Failed: ${error}`);
  }

  console.log("");

  // Test 2: POST without signature (should work in dev mode)
  console.log("2️⃣  Testing webhook POST (no signature - dev mode)...");
  try {
    const postRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mockWebhookPayload),
    });
    const postData = await postRes.json();
    console.log(`   Status: ${postRes.status}`);
    console.log(`   Response:`, postData);
  } catch (error) {
    console.log(`   ❌ Failed: ${error}`);
  }

  console.log("");

  // Test 3: POST with mock signature (should fail signature check if key is set)
  console.log("3️⃣  Testing webhook POST (with mock signature)...");
  try {
    const postRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-alchemy-signature": "mock_signature_12345",
      },
      body: JSON.stringify(mockWebhookPayload),
    });
    const postData = await postRes.json();
    console.log(`   Status: ${postRes.status}`);
    console.log(`   Response:`, postData);
  } catch (error) {
    console.log(`   ❌ Failed: ${error}`);
  }

  console.log("\n✨ Done!");
  console.log("\nNote: The webhook will only update orders that exist in your database.");
  console.log("To fully test, first create an order, then update the mock payload with the correct orderHash.");
}

main().catch(console.error);
