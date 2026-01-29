const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

async function main() {
  console.log("=== Debugging ViewRouter Values ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  const order = await manager.getOrder(ORDER_HASH);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);
  const user = order.params.user;

  console.log("User:", user);
  console.log("Protocol ID:", triggerParams.protocolId);
  console.log("Trigger LTV:", Number(triggerParams.triggerLtvBps) / 100, "%");
  console.log("Target LTV:", Number(triggerParams.targetLtvBps) / 100, "%");

  // Get the ViewRouter address from trigger
  const viewRouterAddr = await ltvTrigger.viewRouter();
  console.log("\nViewRouter:", viewRouterAddr);

  const viewRouter = await ethers.getContractAt([
    "function getCurrentLtv(bytes4 protocolId, address user, bytes calldata context) view returns (uint256 ltvBps)",
    "function getPositionValue(bytes4 protocolId, address user, bytes calldata context) view returns (uint256 collateralValueUsd, uint256 debtValueUsd)",
    "function getCollateralPrice(bytes4 protocolId, address collateralToken, bytes calldata context) view returns (uint256 price)",
    "function getDebtPrice(bytes4 protocolId, address debtToken, bytes calldata context) view returns (uint256 price)",
  ], viewRouterAddr);

  // Get current LTV
  const currentLtv = await viewRouter.getCurrentLtv(triggerParams.protocolId, user, triggerParams.protocolContext);
  console.log("\n=== Current LTV ===");
  console.log("Current LTV:", Number(currentLtv) / 100, "%");

  // Get position values
  const [collateralValueUsd, debtValueUsd] = await viewRouter.getPositionValue(
    triggerParams.protocolId,
    user,
    triggerParams.protocolContext
  );
  console.log("\n=== Position Values (8 decimals USD) ===");
  console.log("Collateral Value:", ethers.formatUnits(collateralValueUsd, 8), "USD");
  console.log("Debt Value:", ethers.formatUnits(debtValueUsd, 8), "USD");
  console.log("Calculated LTV:", (Number(debtValueUsd) / Number(collateralValueUsd) * 100).toFixed(2), "%");

  // Get prices
  const collateralPrice = await viewRouter.getCollateralPrice(
    triggerParams.protocolId,
    triggerParams.collateralToken,
    triggerParams.protocolContext
  );
  const debtPrice = await viewRouter.getDebtPrice(
    triggerParams.protocolId,
    triggerParams.debtToken,
    triggerParams.protocolContext
  );
  console.log("\n=== Prices (8 decimals USD) ===");
  console.log("Collateral Price:", ethers.formatUnits(collateralPrice, 8), "USD per token");
  console.log("Debt Price:", ethers.formatUnits(debtPrice, 8), "USD per token");

  // Calculate deleverage amount manually
  console.log("\n=== Deleverage Calculation ===");
  const targetLtvBps = BigInt(triggerParams.targetLtvBps);

  // Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)
  const targetDebt = (collateralValueUsd * targetLtvBps) / 10000n;
  console.log("Target Debt at", Number(targetLtvBps) / 100, "% LTV:", ethers.formatUnits(targetDebt, 8), "USD");

  const numerator = debtValueUsd - targetDebt;
  console.log("Numerator (debt - targetDebt):", ethers.formatUnits(numerator, 8), "USD");

  const denominator = 10000n - targetLtvBps;
  console.log("Denominator (1 - targetLtv):", Number(denominator) / 10000);

  const deleverageUsd = (numerator * 10000n) / denominator;
  console.log("Deleverage Amount (USD):", ethers.formatUnits(deleverageUsd, 8), "USD");

  // Convert to collateral tokens
  // sellAmount = deleverageUsd * 10^collateralDecimals / collateralPrice
  const collateralDecimals = BigInt(triggerParams.collateralDecimals);
  const sellAmount = (deleverageUsd * (10n ** collateralDecimals)) / collateralPrice;
  console.log("\n=== Sell Amount ===");
  console.log("Sell Amount:", ethers.formatUnits(sellAmount, Number(collateralDecimals)), "collateral tokens");

  // What percentage of collateral is this?
  const collateralBalance = (collateralValueUsd * (10n ** collateralDecimals)) / collateralPrice;
  console.log("Total Collateral Balance:", ethers.formatUnits(collateralBalance, Number(collateralDecimals)), "tokens");
  console.log("Percentage to sell:", (Number(sellAmount) / Number(collateralBalance) * 100).toFixed(2), "%");

  // Sanity check: what would be the new LTV after selling this amount?
  const newCollateralUsd = collateralValueUsd - deleverageUsd;
  const newDebtUsd = debtValueUsd - deleverageUsd;
  const newLtv = Number(newDebtUsd) / Number(newCollateralUsd) * 100;
  console.log("\n=== After Deleverage ===");
  console.log("New Collateral:", ethers.formatUnits(newCollateralUsd, 8), "USD");
  console.log("New Debt:", ethers.formatUnits(newDebtUsd, 8), "USD");
  console.log("New LTV:", newLtv.toFixed(2), "%");
}

main().catch(console.error);
