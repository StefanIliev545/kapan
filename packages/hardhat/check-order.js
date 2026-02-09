const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x2d54d21de929ba5c7f19f1b2ea62ecd1fced2faf";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const USER = "0xa9adc7bb84a0f5e657a7e5d58ce45e5a654c894c"; // lowercase
  
  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);
  
  const handlerAddress = await manager.orderHandler();
  console.log("Handler:", handlerAddress);
  
  const userOrders = await manager.getUserOrders(USER);
  console.log("User orders count:", userOrders.length);
  
  if (userOrders.length > 0) {
    const orderHash = userOrders[userOrders.length - 1];
    console.log("\nLatest order hash:", orderHash);
    
    const order = await manager.getOrder(orderHash);
    console.log("Status:", order.status.toString(), "(1=Active)");
    console.log("Created at:", new Date(Number(order.createdAt) * 1000).toISOString());
    console.log("Trigger:", order.params.trigger);
    console.log("Sell token:", order.params.sellToken);
    console.log("Buy token:", order.params.buyToken);
    
    const salt = await manager.orderSalts(orderHash);
    console.log("Salt:", salt);
    
    const [shouldExecute, reason] = await manager.isTriggerMet(orderHash);
    console.log("\nTrigger met:", shouldExecute, "-", reason);
    
    if (shouldExecute) {
      const [sellAmount, buyAmount] = await manager.getExecutionAmounts(orderHash);
      console.log("Sell amount:", ethers.formatEther(sellAmount), "wstETH");
      console.log("Min buy amount:", ethers.formatUnits(buyAmount, 6), "USDC");
    }
    
    // Try handler
    const handler = await ethers.getContractAt("KapanConditionalOrderHandler", handlerAddress);
    const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
    
    try {
      const gpv2Order = await handler.getTradeableOrder(MANAGER, MANAGER, ethers.ZeroHash, staticInput, "0x");
      console.log("\n✅ Handler returns order:");
      console.log("  sellAmount:", ethers.formatEther(gpv2Order.sellAmount));
      console.log("  buyAmount:", ethers.formatUnits(gpv2Order.buyAmount, 6));
      console.log("  validTo:", new Date(Number(gpv2Order.validTo) * 1000).toISOString());
    } catch (e) {
      console.log("\n❌ Handler error:", e.message);
      if (e.data) {
        // Try to decode PollTryNextBlock or PollNever
        try {
          const iface = new ethers.Interface([
            "error PollTryNextBlock(string)",
            "error PollNever(string)"
          ]);
          const decoded = iface.parseError(e.data);
          console.log("Decoded:", decoded.name, "-", decoded.args[0]);
        } catch {}
      }
    }
  }
}

main().catch(console.error);
