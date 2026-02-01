/**
 * Check order state and handler output for debugging watchtower issues
 *
 * Usage: npx hardhat run scripts/check-order-state.ts --network arbitrum
 *        USER=0x... SALT=0x... npx hardhat run scripts/check-order-state.ts --network arbitrum
 */
import { ethers } from "hardhat";
import { formatUnits, AbiCoder } from "ethers";

const ORDER_CONFIG = {
  user: process.env.USER || "0xdedb4d230d8b1e9268fd46779a8028d5daaa8fa3",
  salt: process.env.SALT || "0x6845e24848bbe506cd5ec51c3b774e87aff3444415e403d842ab2ba3cd6ceb48",
  orderManager: process.env.ORDER_MANAGER || "0xEBe83a05f3622CE2B8933dAee4C81Db8a726ddab",
  orderHandler: process.env.ORDER_HANDLER || "0xd6c10c27CB0fCd815C5A8f3C0c77D7A6cd7EFBe9",
  sellDecimals: parseInt(process.env.SELL_DECIMALS || "18"),
  buyDecimals: parseInt(process.env.BUY_DECIMALS || "18"),
};

// GPv2Order kind constants
const KIND_SELL = "0xf3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee346775";
const KIND_BUY = "0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc";

async function main() {
  console.log("\n========================================");
  console.log("   Order State & Handler Debug");
  console.log("========================================\n");

  console.log("Config:");
  console.log("  User:", ORDER_CONFIG.user);
  console.log("  Salt:", ORDER_CONFIG.salt);
  console.log("  Manager:", ORDER_CONFIG.orderManager);
  console.log("  Handler:", ORDER_CONFIG.orderHandler);
  console.log("");

  // Get order manager with correct ABI (isKindBuy is in params)
  const orderManager = await ethers.getContractAt(
    [
      "function orders(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
      "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function orderHandler() view returns (address)",
      "function chunkWindow() view returns (uint256)",
    ],
    ORDER_CONFIG.orderManager
  );

  // Get order hash using the correct mapping name
  const orderHash = await orderManager.userSaltToOrderHash(ORDER_CONFIG.user, ORDER_CONFIG.salt);
  console.log("Order hash:", orderHash);

  if (orderHash === ethers.ZeroHash) {
    console.log("❌ Order not found!");
    console.log("   Check that USER and SALT are correct.");
    return;
  }

  // Get order details
  const order = await orderManager.getOrder(orderHash);
  const statusStr = order.status === 1n ? "Active" : order.status === 0n ? "None" : "Completed/Cancelled";

  console.log("\n========== Order State ==========");
  console.log("  Status:", order.status.toString(), `(${statusStr})`);
  console.log("  User:", order.params.user);
  console.log("  Trigger:", order.params.trigger);
  console.log("  SellToken:", order.params.sellToken);
  console.log("  BuyToken:", order.params.buyToken);
  console.log("  MaxIterations:", order.params.maxIterations.toString());
  console.log("  IterationCount:", order.iterationCount.toString());
  console.log("  CreatedAt:", new Date(Number(order.createdAt) * 1000).toISOString());
  console.log("  isKindBuy:", order.params.isKindBuy);
  console.log("  AppDataHash:", order.params.appDataHash);

  // Decode trigger params if LimitPriceTrigger
  console.log("\n========== Trigger Params Decode ==========");
  try {
    const abiCoder = new AbiCoder();
    const decoded = abiCoder.decode(
      [
        "bytes4 protocolId",
        "bytes protocolContext",
        "address sellToken",
        "address buyToken",
        "uint8 sellDecimals",
        "uint8 buyDecimals",
        "uint256 limitPrice",
        "bool triggerAbovePrice",
        "uint256 totalSellAmount",
        "uint256 totalBuyAmount",
        "uint8 numChunks",
        "uint256 maxSlippageBps",
        "bool isKindBuy"
      ],
      order.params.triggerStaticData
    );

    console.log("  protocolId:", decoded[0]);
    console.log("  sellToken:", decoded[2]);
    console.log("  buyToken:", decoded[3]);
    console.log("  sellDecimals:", decoded[4].toString());
    console.log("  buyDecimals:", decoded[5].toString());
    console.log("  limitPrice:", decoded[6].toString(), "(8 decimals)");
    console.log("  triggerAbovePrice:", decoded[7]);
    console.log("  totalSellAmount:", formatUnits(decoded[8], Number(decoded[4])));
    console.log("  totalBuyAmount:", formatUnits(decoded[9], Number(decoded[5])));
    console.log("  numChunks:", decoded[10].toString());
    console.log("  maxSlippageBps:", decoded[11].toString());
    console.log("  isKindBuy (in trigger):", decoded[12]);

    // Verify consistency
    if (decoded[12] !== order.params.isKindBuy) {
      console.log("\n  ⚠️ MISMATCH: isKindBuy in trigger params differs from order params!");
      console.log("     Trigger:", decoded[12], "Order:", order.params.isKindBuy);
    } else {
      console.log("\n  ✅ isKindBuy consistent between trigger and order params");
    }
  } catch (e) {
    console.log("  Could not decode as LimitPriceTrigger params:", (e as Error).message);
  }

  // Check trigger
  const trigger = await ethers.getContractAt(
    [
      "function shouldExecute(bytes calldata staticData, address owner) view returns (bool, string memory)",
      "function calculateExecution(bytes calldata staticData, address owner, uint256 iterationCount) view returns (uint256 sellAmount, uint256 minBuyAmount)",
      "function triggerName() view returns (string memory)",
      "function isComplete(bytes calldata staticData, address owner, uint256 iterationCount) view returns (bool)",
    ],
    order.params.trigger
  );

  const triggerName = await trigger.triggerName();
  console.log("\n========== Trigger State ==========");
  console.log("  Trigger name:", triggerName);

  // Check if should execute
  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
  console.log("  Should execute:", shouldExec);
  console.log("  Reason:", reason);

  // Check if complete
  let isComplete = false;
  try {
    isComplete = await trigger.isComplete(order.params.triggerStaticData, order.params.user, order.iterationCount);
    console.log("  Is complete:", isComplete);

    if (isComplete) {
      console.log("\n⚠️ Trigger says order is COMPLETE. Watchtower will return PollNever.");
    }
  } catch (e: any) {
    console.log("  Is complete: ERROR -", e.message);
  }

  if (!shouldExec && !isComplete) {
    console.log("\n⚠️ Trigger says should NOT execute. Order won't fill until condition is met.");
  }

  // Calculate amounts (with iterationCount)
  let sellAmount = 0n;
  let minBuyAmount = 0n;
  try {
    [sellAmount, minBuyAmount] = await trigger.calculateExecution(
      order.params.triggerStaticData,
      order.params.user,
      order.iterationCount
    );

    console.log("\n========== Calculated Amounts ==========");
    console.log("  Sell amount:", formatUnits(sellAmount, ORDER_CONFIG.sellDecimals));
    console.log("  Buy amount:", formatUnits(minBuyAmount, ORDER_CONFIG.buyDecimals));
    console.log("  Sell (raw):", sellAmount.toString());
    console.log("  Buy (raw):", minBuyAmount.toString());

    if (sellAmount === 0n || minBuyAmount === 0n) {
      console.log("\n❌ Zero amounts - nothing to trade!");
    }

    // Check truncation based on decimals
    const sellDecimals = ORDER_CONFIG.sellDecimals;
    const buyDecimals = ORDER_CONFIG.buyDecimals;
    const sellPrecision = sellDecimals > 4 ? 10n ** BigInt(sellDecimals - (sellDecimals > 12 ? 5 : sellDecimals > 6 ? 6 : 4)) : 1n;
    const buyPrecision = buyDecimals > 4 ? 10n ** BigInt(buyDecimals - (buyDecimals > 12 ? 5 : buyDecimals > 6 ? 6 : 4)) : 1n;
    const isSellTruncated = sellAmount % sellPrecision === 0n;
    const isBuyTruncated = minBuyAmount % buyPrecision === 0n;
    console.log("\n  Truncation Check:");
    console.log("    Sell precision:", sellPrecision.toString(), "Truncated:", isSellTruncated);
    console.log("    Buy precision:", buyPrecision.toString(), "Truncated:", isBuyTruncated);
  } catch (e: any) {
    console.log("\n========== Calculated Amounts ==========");
    console.log("  ERROR calculating amounts:", e.message);
  }

  // Now test the handler's getTradeableOrder
  console.log("\n========== Handler getTradeableOrder ==========");
  const handler = await ethers.getContractAt(
    [
      "function getTradeableOrder(address, address, bytes32, bytes calldata staticInput, bytes calldata) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))",
      "function manager() view returns (address)",
    ],
    ORDER_CONFIG.orderHandler
  );

  // Verify handler points to correct manager
  const handlerManager = await handler.manager();
  console.log("  Handler's manager:", handlerManager);
  if (handlerManager.toLowerCase() !== ORDER_CONFIG.orderManager.toLowerCase()) {
    console.log("  ⚠️ WARNING: Handler points to different manager!");
  }

  try {
    // staticInput is ABI-encoded orderHash
    const abiCoder = new AbiCoder();
    const staticInput = abiCoder.encode(["bytes32"], [orderHash]);

    const gpv2Order = await handler.getTradeableOrder(
      ethers.ZeroAddress, // owner (unused)
      ethers.ZeroAddress, // sender (unused)
      ethers.ZeroHash,    // condOrderHash (unused)
      staticInput,
      "0x"                // offchainInput (unused)
    );

    console.log("\n  GPv2Order generated by handler:");
    console.log("    sellToken:", gpv2Order.sellToken);
    console.log("    buyToken:", gpv2Order.buyToken);
    console.log("    receiver:", gpv2Order.receiver);
    console.log("    sellAmount:", formatUnits(gpv2Order.sellAmount, ORDER_CONFIG.sellDecimals));
    console.log("    buyAmount:", formatUnits(gpv2Order.buyAmount, ORDER_CONFIG.buyDecimals));
    console.log("    validTo:", gpv2Order.validTo.toString(), `(${new Date(Number(gpv2Order.validTo) * 1000).toISOString()})`);
    console.log("    appData:", gpv2Order.appData);
    console.log("    feeAmount:", gpv2Order.feeAmount.toString());
    console.log("    kind:", gpv2Order.kind);
    console.log("    partiallyFillable:", gpv2Order.partiallyFillable);

    // Check kind
    const expectedKind = order.params.isKindBuy ? KIND_BUY : KIND_SELL;
    const kindStr = gpv2Order.kind === KIND_BUY ? "BUY" : gpv2Order.kind === KIND_SELL ? "SELL" : "UNKNOWN";
    console.log("\n    Order kind:", kindStr);
    console.log("    Expected kind:", order.params.isKindBuy ? "BUY" : "SELL");

    if (gpv2Order.kind !== expectedKind) {
      console.log("\n  ❌ KIND MISMATCH! Handler returns wrong kind.");
      console.log("     This WILL cause signature verification failure!");
    } else {
      console.log("\n  ✅ Kind matches expected value");
    }

    // Check validTo
    const now = Math.floor(Date.now() / 1000);
    if (Number(gpv2Order.validTo) < now) {
      console.log("\n  ⚠️ Order has EXPIRED! validTo is in the past.");
      console.log("     Current time:", now);
      console.log("     validTo:", gpv2Order.validTo.toString());
    } else {
      console.log("\n  ✅ validTo is in the future");
    }

    // Check receiver
    if (gpv2Order.receiver.toLowerCase() !== ORDER_CONFIG.orderManager.toLowerCase()) {
      console.log("\n  ⚠️ Receiver is NOT the order manager!");
      console.log("     Receiver:", gpv2Order.receiver);
      console.log("     Expected:", ORDER_CONFIG.orderManager);
    }

  } catch (e: any) {
    console.log("\n  ❌ Handler getTradeableOrder FAILED!");
    console.log("  Error:", e.message);

    // Try to decode revert reason
    const errorData = e.data || e.error?.data;
    if (errorData) {
      try {
        const abiCoderForError = new AbiCoder();
        // PollTryNextBlock(string) - selector 0x01eb50e0
        const pollTryNextBlockSig = "0x01eb50e0";
        // PollNever(string) - selector varies
        // OrderNotValid(string) - selector varies

        const errorHex = typeof errorData === "string" ? errorData : "0x" + Buffer.from(errorData).toString("hex");

        if (errorHex.startsWith(pollTryNextBlockSig)) {
          const reason = abiCoderForError.decode(["string"], "0x" + errorHex.slice(10))[0];
          console.log("  Revert: PollTryNextBlock -", reason);
        } else {
          // Try generic string decode (after selector)
          if (errorHex.length > 10) {
            try {
              const reason = abiCoderForError.decode(["string"], "0x" + errorHex.slice(10))[0];
              console.log("  Revert reason:", reason);
            } catch {
              console.log("  Raw error data:", errorHex.slice(0, 100) + "...");
            }
          }
        }
      } catch {
        // Ignore decode errors
      }
    }
  }

  console.log("\n========================================");
  console.log("   Summary");
  console.log("========================================");

  if (order.status !== 1n) {
    console.log("❌ Order is not Active");
  } else if (isComplete) {
    console.log("❌ Order is complete (trigger says done)");
  } else if (!shouldExec) {
    console.log("⚠️ Trigger condition not met - order waiting");
  } else if (sellAmount === 0n || minBuyAmount === 0n) {
    console.log("❌ Calculated amounts are zero");
  } else {
    console.log("✅ Order state looks valid");
    console.log("\nPossible reasons for watchtower rejection:");
    console.log("   1. Handler/Manager contract version mismatch");
    console.log("   2. Signature verification failing (check _orderMatches)");
    console.log("   3. ComposableCoW registry issue");
    console.log("   4. AppData not registered with CoW API");
    console.log("   5. validTo window calculation issue");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
