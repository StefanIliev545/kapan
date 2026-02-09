import { ethers } from "hardhat";

async function main() {
  const orderHash = "0x3f7aaef3df1ef4fdebdafece5c8d865473363ef2519cca3aa98dcb5c3a6bad71";
  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";
  const handlerAddress = "0xB048352915d26126904c162345d40a3A891E414a";
  const composableCoWAddress = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  // Get current block timestamp
  const block = await ethers.provider.getBlock("latest");
  console.log("=== Block Info ===");
  console.log("Block number:", block?.number);
  console.log("Block timestamp:", block?.timestamp);
  console.log("Block time:", new Date((block?.timestamp || 0) * 1000).toISOString());

  // Get order from manager
  const manager = await ethers.getContractAt(
    [
      "function getOrder(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function chunkWindow() view returns (uint256)",
      "function orderSalts(bytes32) view returns (bytes32)"
    ],
    managerAddress
  );

  const order = await manager.getOrder(orderHash);
  const chunkWindow = await manager.chunkWindow();
  const salt = await manager.orderSalts(orderHash);

  console.log("\n=== Order Info ===");
  console.log("Status:", order.status.toString(), "(1=Active, 2=Completed, 3=Cancelled)");
  console.log("CreatedAt:", order.createdAt.toString());
  console.log("CreatedAt time:", new Date(Number(order.createdAt) * 1000).toISOString());
  console.log("IterationCount:", order.iterationCount.toString());
  console.log("MaxIterations:", order.params.maxIterations.toString());
  console.log("ChunkWindow:", chunkWindow.toString(), "seconds");
  console.log("Salt:", salt);

  // Calculate validTo like the handler does
  const createdAt = BigInt(order.createdAt);
  const iterationCount = BigInt(order.iterationCount);
  const window = BigInt(chunkWindow);
  const blockTimestamp = BigInt(block?.timestamp || 0);

  const chunkWindowStart = createdAt + (iterationCount * window);
  const chunkWindowEnd = chunkWindowStart + window - 1n;

  console.log("\n=== ValidTo Calculation ===");
  console.log("chunkWindowStart:", chunkWindowStart.toString());
  console.log("chunkWindowEnd:", chunkWindowEnd.toString());
  console.log("chunkWindowEnd time:", new Date(Number(chunkWindowEnd) * 1000).toISOString());

  let validTo: bigint;
  if (blockTimestamp <= chunkWindowEnd) {
    validTo = chunkWindowEnd;
    console.log("Using chunkWindowEnd as validTo");
  } else {
    // Extend to current window
    const elapsedSinceCreate = blockTimestamp - createdAt;
    const currentWindowIndex = elapsedSinceCreate / window;
    validTo = createdAt + ((currentWindowIndex + 1n) * window) - 1n;
    console.log("Extended to current window, windowIndex:", currentWindowIndex.toString());
  }

  console.log("validTo:", validTo.toString());
  console.log("validTo time:", new Date(Number(validTo) * 1000).toISOString());
  console.log("block.timestamp:", blockTimestamp.toString());
  console.log("block.timestamp > validTo:", blockTimestamp > validTo);

  if (blockTimestamp > validTo) {
    console.log("\n*** WINDOW EXPIRED - This is why the handler reverts! ***");
    console.log("The fork's block timestamp is ahead of the validTo window.");
  }

  // Check trigger
  console.log("\n=== Trigger Checks ===");
  const trigger = await ethers.getContractAt(
    [
      "function shouldExecute(bytes,address) view returns (bool,string)",
      "function calculateExecution(bytes,address,uint256) pure returns (uint256,uint256)",
      "function isComplete(bytes,address,uint256) pure returns (bool)"
    ],
    order.params.trigger
  );

  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
  console.log("shouldExecute:", shouldExec, "-", reason);

  const [sellAmount, buyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, order.params.user, order.iterationCount);
  console.log("sellAmount:", ethers.formatUnits(sellAmount, 18), "WETH");
  console.log("buyAmount:", ethers.formatUnits(buyAmount, 8), "WBTC");

  const isComplete = await trigger.isComplete(order.params.triggerStaticData, order.params.user, order.iterationCount);
  console.log("isComplete:", isComplete);

  // Check ComposableCoW registration with CORRECT salt
  console.log("\n=== ComposableCoW Registration ===");
  const staticData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);

  const composableCoW = await ethers.getContractAt(
    [
      "function singleOrders(address,bytes32) view returns (bool)",
      "function hash((address handler, bytes32 salt, bytes staticInput) params) view returns (bytes32)"
    ],
    composableCoWAddress
  );

  // Use ComposableCoW's hash function (same as used in createOrder/cancelOrder)
  const cowParamsHash = await composableCoW.hash({
    handler: handlerAddress,
    salt: salt,
    staticInput: staticData
  });
  console.log("ComposableCoW hash:", cowParamsHash);

  const isRegistered = await composableCoW.singleOrders(managerAddress, cowParamsHash);
  console.log("Is registered (singleOrders):", isRegistered);

  // Try ComposableCoW's getTradeableOrderWithSignature (what solvers call)
  console.log("\n=== ComposableCoW getTradeableOrderWithSignature ===");
  const iface = new ethers.Interface([
    "function getTradeableOrderWithSignature(address owner, (address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns ((address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ]);

  const calldata = iface.encodeFunctionData("getTradeableOrderWithSignature", [
    managerAddress,
    {
      handler: handlerAddress,
      salt: salt,
      staticInput: staticData
    },
    "0x",
    []
  ]);

  try {
    const result = await ethers.provider.call({
      to: composableCoWAddress,
      data: calldata,
    });
    console.log("SUCCESS! Result length:", result.length);
    const decoded = iface.decodeFunctionResult("getTradeableOrderWithSignature", result);
    console.log("Order is TRADEABLE via ComposableCoW!");
    console.log("  sellAmount:", ethers.formatUnits(decoded.order.sellAmount, 18));
    console.log("  buyAmount:", ethers.formatUnits(decoded.order.buyAmount, 8));
  } catch (e: unknown) {
    const error = e as Error & { data?: string };
    console.log("FAILED via ComposableCoW!");

    if (error.data && error.data.length > 10) {
      const pollNever = ethers.id("PollNever(string)").slice(0, 10);
      const pollTry = ethers.id("PollTryNextBlock(string)").slice(0, 10);
      const orderNotValid = ethers.id("OrderNotValid(string)").slice(0, 10);
      const notRegistered = ethers.id("SingleOrderNotAuthed()").slice(0, 10);
      const proofNotAuthed = ethers.id("ProofNotAuthed()").slice(0, 10);

      if (error.data.startsWith(pollNever)) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.log("PollNever:", decoded[0]);
      } else if (error.data.startsWith(pollTry)) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.log("PollTryNextBlock:", decoded[0]);
      } else if (error.data.startsWith(orderNotValid)) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.log("OrderNotValid:", decoded[0]);
      } else if (error.data.startsWith(notRegistered)) {
        console.log("SingleOrderNotAuthed - Order not registered in ComposableCoW!");
      } else if (error.data.startsWith(proofNotAuthed)) {
        console.log("ProofNotAuthed - Merkle proof not valid");
      } else {
        console.log("Revert data:", error.data.slice(0, 200));
      }
    } else {
      console.log("Error:", error.message?.slice(0, 300));
    }
  }

  // Try to call getTradeableOrder directly on handler
  console.log("\n=== Direct Handler Call ===");
  const handler = await ethers.getContractAt(
    ["function getTradeableOrder(address,address,bytes32,bytes,bytes) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))"],
    handlerAddress
  );

  try {
    const gpv2Order = await handler.getTradeableOrder(
      managerAddress,
      ethers.ZeroAddress,
      salt,
      staticData,
      "0x"
    );
    console.log("SUCCESS! Order is tradeable:");
    console.log("  sellAmount:", ethers.formatUnits(gpv2Order.sellAmount, 18));
    console.log("  buyAmount:", ethers.formatUnits(gpv2Order.buyAmount, 8));
    console.log("  validTo:", gpv2Order.validTo.toString());
  } catch (e: unknown) {
    const error = e as Error & { data?: string };
    console.log("FAILED!");

    if (error.data && error.data.length > 10) {
      const pollNever = ethers.id("PollNever(string)").slice(0, 10);
      const pollTry = ethers.id("PollTryNextBlock(string)").slice(0, 10);
      const orderNotValid = ethers.id("OrderNotValid(string)").slice(0, 10);

      if (error.data.startsWith(pollNever)) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.log("PollNever:", decoded[0]);
      } else if (error.data.startsWith(pollTry)) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.log("PollTryNextBlock:", decoded[0]);
      } else if (error.data.startsWith(orderNotValid)) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.log("OrderNotValid:", decoded[0]);
      } else {
        console.log("Revert data:", error.data.slice(0, 200));
      }
    } else {
      console.log("Error:", error.message?.slice(0, 300));
    }
  }
}

main().catch(console.error);
