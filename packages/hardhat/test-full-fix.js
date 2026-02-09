const { ethers } = require("hardhat");

async function main() {
  console.log("=== Testing Full Fix ===\n");

  const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
  const oldTrigger = await ethers.getContractAt("LtvTrigger", "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c");
  const manager = await ethers.getContractAt("KapanConditionalOrderManager", "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3");

  const order = await manager.getOrder(ORDER_HASH);
  const user = order.params.user;
  const triggerParams = await oldTrigger.decodeTriggerParams(order.params.triggerStaticData);

  // Get the current deployed ViewRouter
  const oldViewRouter = await ethers.getContractAt("KapanViewRouter", "0x161438800232d5DBFF4DA0ea77b151e1498b5f31");

  // Get Morpho oracle price
  const morphoGateway = await oldViewRouter.gateways("morpho-blue");
  const morphoView = await ethers.getContractAt([
    "function getOraclePrice(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) params) view returns (uint256)"
  ], morphoGateway);

  const marketParams = ethers.AbiCoder.defaultAbiCoder().decode(
    ["tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
    triggerParams.protocolContext
  )[0];

  const oraclePrice = await morphoView.getOraclePrice([
    marketParams.loanToken, marketParams.collateralToken, marketParams.oracle, marketParams.irm, marketParams.lltv
  ]);

  console.log("=== Morpho Oracle ===");
  console.log("Oracle price (36 dec):", oraclePrice.toString());
  console.log("Price per steakUSDC:", ethers.formatUnits(oraclePrice, 36), "USDT");

  // Current broken values
  console.log("\n=== Current (Broken) ===");
  const [sellOld, minBuyOld] = await oldTrigger.calculateExecution(order.params.triggerStaticData, user);
  console.log("sellAmount:", ethers.formatUnits(sellOld, 6), "steakUSDC");
  console.log("minBuyAmount:", ethers.formatUnits(minBuyOld, 6), "USDT");
  console.log("Ratio:", (Number(minBuyOld) / Number(sellOld)).toFixed(4));

  // Fixed values (manual calculation)
  console.log("\n=== Fixed (Manual Calculation) ===");
  const deleverageUsd8 = 47735397900n; // $477.35 in 8 decimals (from ViewRouter debug)
  const collateralPrice8 = oraclePrice / BigInt(1e28); // Convert to 8 decimals
  console.log("Collateral price (8 dec):", ethers.formatUnits(collateralPrice8, 8), "USDT per steakUSDC");

  const sellFixed = (deleverageUsd8 * BigInt(1e6)) / collateralPrice8;
  console.log("sellAmount:", ethers.formatUnits(sellFixed, 6), "steakUSDC");

  // minBuy = sellAmount * oracleRate * (1 - slippage)
  let minBuyFixed = (sellFixed * oraclePrice) / BigInt(1e36);
  minBuyFixed = (minBuyFixed * 9900n) / 10000n; // 1% slippage
  console.log("minBuyAmount:", ethers.formatUnits(minBuyFixed, 6), "USDT");
  console.log("Ratio:", (Number(minBuyFixed) / Number(sellFixed)).toFixed(4));

  console.log("\n=== Summary ===");
  console.log("Debt owed: ~518 USDT");
  console.log("Old: sell", ethers.formatUnits(sellOld, 6), "→ min", ethers.formatUnits(minBuyOld, 6), "USDT (BROKEN: minBuy > sell!)");
  console.log("New: sell", ethers.formatUnits(sellFixed, 6), "→ min", ethers.formatUnits(minBuyFixed, 6), "USDT (FIXED: proper amounts)");
}

main().catch(console.error);
