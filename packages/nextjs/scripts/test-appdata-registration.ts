/**
 * Test script to debug appData registration with flash loan on CoW API
 * 
 * Run with: npx ts-node scripts/test-appdata-registration.ts
 */

const BASE_API = "https://api.cow.fi/base/api/v1";
const MAINNET_API = "https://api.cow.fi/mainnet/api/v1";
const ARBITRUM_API = "https://api.cow.fi/arbitrum_one/api/v1";

// Test addresses
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const ERC3156_BORROWER = "0x47d71b4B3336AB2729436186C216955F3C27cD04";
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const ORDER_MANAGER = "0x9F0E89B9BF2eAa5390fF06970573f9bed5F01865";

async function testRegister(name: string, appData: any, apiUrl: string = BASE_API): Promise<boolean> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`${"=".repeat(60)}`);
  
  const fullAppDataJson = JSON.stringify(appData);
  console.log("AppData JSON:", fullAppDataJson);
  
  const requestBody = JSON.stringify({ fullAppData: fullAppDataJson });
  console.log("Request body:", requestBody);
  
  try {
    const response = await fetch(`${apiUrl}/app_data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });
    
    const responseText = await response.text();
    console.log(`Response status: ${response.status}`);
    console.log(`Response body: ${responseText}`);
    
    if (response.ok || response.status === 409) {
      console.log("✅ SUCCESS!");
      return true;
    } else {
      console.log("❌ FAILED");
      return false;
    }
  } catch (error) {
    console.log("❌ ERROR:", error);
    return false;
  }
}

async function main() {
  console.log("\n\n🔷 TESTING FLASH LOAN WITH TRANSFER PRE-HOOKS 🔷\n");
  
  // This is what our updated appData.ts now generates:
  // 1. Pre-hook: transferFrom(borrower, orderManager, amount)
  // 2. Pre-hook: OrderManager.executePreHookBySalt()
  // 3. Post-hook: OrderManager.executePostHookBySalt()
  
  // Encode transferFrom(from, to, amount)
  const transferFromCalldata = "0x23b872dd" + // transferFrom selector
    ERC3156_BORROWER.slice(2).padStart(64, '0') + // from
    ORDER_MANAGER.slice(2).padStart(64, '0') + // to
    BigInt("1000000000000000000").toString(16).padStart(64, '0'); // amount
  
  // Test: Flash loan + transfer hook + OrderManager hooks
  await testRegister("Base: Flash loan with transfer pre-hook", {
    version: "1.12.0",
    appCode: "KapanTest",
    metadata: {
      flashloan: {
        liquidityProvider: BALANCER_VAULT,
        protocolAdapter: ERC3156_BORROWER,
        receiver: ORDER_MANAGER,
        token: WETH_BASE,
        amount: "1000000000000000000"
      },
      hooks: {
        pre: [
          // Hook 1: Transfer from borrower to OrderManager
          {
            target: WETH_BASE,
            callData: transferFromCalldata,
            gasLimit: "100000"
          },
          // Hook 2: OrderManager pre-hook (empty in flash loan mode)
          {
            target: ORDER_MANAGER,
            callData: "0x8009fb6a" + "0".repeat(128), // executePreHookBySalt placeholder
            gasLimit: "1000000"
          }
        ],
        post: [
          {
            target: ORDER_MANAGER,
            callData: "0x2fbff5a4" + "0".repeat(128), // executePostHookBySalt placeholder
            gasLimit: "1000000"
          }
        ]
      }
    }
  }, BASE_API);
  
  // Test: Just the minimal flash loan (should still work)
  await testRegister("Base: Minimal flash loan (no hooks)", {
    version: "1.12.0",
    appCode: "KapanTest",
    metadata: {
      flashloan: {
        liquidityProvider: BALANCER_VAULT,
        protocolAdapter: ERC3156_BORROWER,
        receiver: ORDER_MANAGER,
        token: WETH_BASE,
        amount: "1000000000000000000"
      }
    }
  }, BASE_API);
  
  console.log("\n\nDone!");
}

main().catch(console.error);
