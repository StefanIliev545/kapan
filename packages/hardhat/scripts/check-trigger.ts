import { ethers } from "hardhat";

async function main() {
  const orderHash = "0x3f7aaef3df1ef4fdebdafece5c8d865473363ef2519cca3aa98dcb5c3a6bad71";
  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";
  const handlerAddress = "0xB048352915d26126904c162345d40a3A891E414a";

  const manager = await ethers.getContractAt(
    ["function getOrder(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))"],
    managerAddress
  );

  const order = await manager.getOrder(orderHash);
  console.log("Order status:", order.status.toString(), "(1=OPEN, 2=FILLED, 3=CANCELLED)");
  console.log("User:", order.params.user);
  console.log("Iterations:", order.iterationCount.toString(), "/", order.params.maxIterations.toString());

  // Check trigger
  const trigger = await ethers.getContractAt(
    [
      "function shouldExecute(bytes,address) view returns (bool,string)",
      "function calculateExecution(bytes,address,uint256) pure returns (uint256,uint256)",
      "function isComplete(bytes,address,uint256) pure returns (bool)"
    ],
    order.params.trigger
  );

  console.log("\n=== Trigger Checks ===");
  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
  console.log("shouldExecute:", shouldExec, "-", reason);

  const [sellAmount, buyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, order.params.user, order.iterationCount);
  console.log("calculateExecution: Sell", ethers.formatUnits(sellAmount, 18), "WETH, Buy", ethers.formatUnits(buyAmount, 8), "WBTC");

  const complete = await trigger.isComplete(order.params.triggerStaticData, order.params.user, order.iterationCount);
  console.log("isComplete:", complete);

  // Check handler directly - using correct ConditionalOrderParams format
  console.log("\n=== Handler Check ===");

  // ConditionalOrderParams = { handler, salt, staticData }
  // For our system: handler = handlerAddress, salt = orderHash, staticData = abi.encode(orderHash)
  const staticData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);

  const iface = new ethers.Interface([
    "function getTradeableOrderWithSignature(address owner, (address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns ((address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ]);

  // The owner for ComposableCoW is the MANAGER (it's the one that registered the order)
  const calldata = iface.encodeFunctionData("getTradeableOrderWithSignature", [
    managerAddress, // owner = manager
    {
      handler: handlerAddress,
      salt: orderHash,
      staticInput: staticData,
    },
    "0x",
    []
  ]);

  // Call ComposableCoW, not handler directly
  const composableCoWAddress = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  try {
    const result = await ethers.provider.call({
      to: composableCoWAddress,
      data: calldata,
    });
    console.log("Call succeeded! Result length:", result.length);
    const decoded = iface.decodeFunctionResult("getTradeableOrderWithSignature", result);
    console.log("Order is TRADEABLE!");
    console.log("  sellAmount:", ethers.formatUnits(decoded.order.sellAmount, 18), "WETH");
    console.log("  buyAmount:", ethers.formatUnits(decoded.order.buyAmount, 8), "WBTC");
  } catch (e: unknown) {
    const error = e as Error & { data?: string };
    console.log("NOT TRADEABLE!");
    console.log("  Error:", error.message?.slice(0, 300));

    // Try to decode the revert reason
    if (error.data && error.data.length > 10) {
      try {
        // Check for custom errors
        const pollNever = ethers.id("PollNever(string)").slice(0, 10);
        const pollTry = ethers.id("PollTryNextBlock(string)").slice(0, 10);
        const orderNotValid = ethers.id("OrderNotValid(string)").slice(0, 10);

        if (error.data.startsWith(pollNever)) {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
          console.log("  PollNever reason:", decoded[0]);
        } else if (error.data.startsWith(pollTry)) {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
          console.log("  PollTryNextBlock reason:", decoded[0]);
        } else if (error.data.startsWith(orderNotValid)) {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
          console.log("  OrderNotValid reason:", decoded[0]);
        } else {
          console.log("  Revert data:", error.data.slice(0, 200));
        }
      } catch {
        console.log("  Revert data:", error.data.slice(0, 200));
      }
    }
  }
}

main().catch(console.error);
