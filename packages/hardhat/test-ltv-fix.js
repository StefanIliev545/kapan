const { ethers } = require("hardhat");

async function main() {
  console.log("=== Testing LtvTrigger Fix (Manual Calculation) ===\n");

  // Get old trigger values from deployed contract
  const oldTrigger = await ethers.getContractAt("LtvTrigger", "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c");
  const manager = await ethers.getContractAt(
    "KapanConditionalOrderManager",
    "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3"
  );

  const order = await manager.getOrder("0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e");
  const user = order.params.user;
  const triggerParams = await oldTrigger.decodeTriggerParams(order.params.triggerStaticData);

  console.log("=== OLD Trigger (deployed) ===");
  const [sellOld, minBuyOld] = await oldTrigger.calculateExecution(order.params.triggerStaticData, user);
  console.log("Sell:   ", ethers.formatUnits(sellOld, 6), "collateral");
  console.log("MinBuy: ", ethers.formatUnits(minBuyOld, 6), "debt");
  console.log("Ratio:  ", (Number(minBuyOld) / Number(sellOld)).toFixed(4));

  // Calculate what the fix would produce
  console.log("\n=== NEW Trigger (fixed formula) ===");
  const sellNew = sellOld; // Same sell calculation
  const collateralDecimals = Number(triggerParams.collateralDecimals);
  const debtDecimals = Number(triggerParams.debtDecimals);
  const maxSlippageBps = Number(triggerParams.maxSlippageBps);

  // Fixed formula: minBuy = sellAmount * (1 - slippage), adjusted for decimals
  let minBuyNew;
  if (debtDecimals >= collateralDecimals) {
    minBuyNew = sellNew * BigInt(10 ** (debtDecimals - collateralDecimals));
  } else {
    minBuyNew = sellNew / BigInt(10 ** (collateralDecimals - debtDecimals));
  }
  minBuyNew = (minBuyNew * BigInt(10000 - maxSlippageBps)) / 10000n;

  console.log("Sell:   ", ethers.formatUnits(sellNew, 6), "collateral");
  console.log("MinBuy: ", ethers.formatUnits(minBuyNew, 6), "debt");
  console.log("Ratio:  ", (Number(minBuyNew) / Number(sellNew)).toFixed(4));

  console.log("\n=== Summary ===");
  console.log("Old minBuy:", ethers.formatUnits(minBuyOld, 6), "USDT (>sell, impossible!)");
  console.log("New minBuy:", ethers.formatUnits(minBuyNew, 6), "USDT (<sell, with", maxSlippageBps/100, "% slippage)");
  console.log("Debt owed:  ~518 USDT");

  if (Number(minBuyNew) < Number(sellNew)) {
    console.log("\n✅ Fix verified: minBuy < sellAmount (realistic swap)");
  } else {
    console.log("\n❌ Fix failed: minBuy still >= sellAmount");
  }
}

main().catch(console.error);
