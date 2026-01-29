const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

async function main() {
  console.log("=== Debugging LTV Trigger Calculation ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  const order = await manager.getOrder(ORDER_HASH);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);

  console.log("Trigger Params:");
  console.log("  triggerLtvBps:", triggerParams.triggerLtvBps.toString(), "(", Number(triggerParams.triggerLtvBps) / 100, "%)");
  console.log("  targetLtvBps:", triggerParams.targetLtvBps.toString(), "(", Number(triggerParams.targetLtvBps) / 100, "%)");
  console.log("  collateralToken:", triggerParams.collateralToken);
  console.log("  debtToken:", triggerParams.debtToken);
  console.log("  collateralDecimals:", triggerParams.collateralDecimals.toString());
  console.log("  debtDecimals:", triggerParams.debtDecimals.toString());
  console.log("  maxSlippageBps:", triggerParams.maxSlippageBps.toString(), "(", Number(triggerParams.maxSlippageBps) / 100, "%)");
  console.log("  numChunks:", triggerParams.numChunks.toString());
  console.log("  gatewayId:", triggerParams.gatewayId);

  // Get current position data
  console.log("\n=== Current Position ===");
  const user = order.params.user;

  // Call shouldExecute
  const [shouldExec, reason] = await ltvTrigger.shouldExecute(order.params.triggerStaticData, user);
  console.log("shouldExecute:", shouldExec, reason);

  // Call calculateExecution
  const [sellAmount, minBuyAmount] = await ltvTrigger.calculateExecution(order.params.triggerStaticData, user);
  console.log("\ncalculateExecution:");
  console.log("  sellAmount:", ethers.formatUnits(sellAmount, triggerParams.collateralDecimals), "collateral");
  console.log("  minBuyAmount:", ethers.formatUnits(minBuyAmount, triggerParams.debtDecimals), "debt");

  // Get current LTV (call the GatewayView)
  const morphoGateway = await ethers.getContractAt([
    "function getUserAccountData(bytes calldata context, address user) view returns (uint256 totalCollateralValue, uint256 totalDebtValue, uint256 availableBorrowsValue, uint256 ltv, uint256 healthFactor)",
    "function getUserSupply(bytes calldata context, address token, address user) view returns (uint256)",
    "function getUserBorrow(bytes calldata context, address token, address user) view returns (uint256)",
  ], "0x34Eb7E4FE216c1CE1F3DD33d2a50E1E3d8B4CBaF"); // MorphoBlueGatewayView

  const context = triggerParams.context;

  const accountData = await morphoGateway.getUserAccountData(context, user);
  console.log("\nAccount Data:");
  console.log("  totalCollateralValue:", ethers.formatUnits(accountData.totalCollateralValue, 8), "USD");
  console.log("  totalDebtValue:", ethers.formatUnits(accountData.totalDebtValue, 8), "USD");
  console.log("  currentLTV:", Number(accountData.ltv) / 100, "%");
  console.log("  healthFactor:", ethers.formatUnits(accountData.healthFactor, 18));

  // Get actual balances
  const collateralBalance = await morphoGateway.getUserSupply(context, triggerParams.collateralToken, user);
  const debtBalance = await morphoGateway.getUserBorrow(context, triggerParams.debtToken, user);
  console.log("\nActual Balances:");
  console.log("  Collateral:", ethers.formatUnits(collateralBalance, triggerParams.collateralDecimals), "steakUSDC");
  console.log("  Debt:", ethers.formatUnits(debtBalance, triggerParams.debtDecimals), "USDT");

  // Check if selling all collateral vs calculated amount
  console.log("\n=== Analysis ===");
  console.log("Sell amount vs Collateral balance:");
  console.log("  Selling:", ethers.formatUnits(sellAmount, triggerParams.collateralDecimals));
  console.log("  Have:", ethers.formatUnits(collateralBalance, triggerParams.collateralDecimals));
  console.log("  Percentage of collateral:", Number(sellAmount) / Number(collateralBalance) * 100, "%");

  console.log("\nBuy amount vs Debt balance:");
  console.log("  Buying:", ethers.formatUnits(minBuyAmount, triggerParams.debtDecimals));
  console.log("  Owe:", ethers.formatUnits(debtBalance, triggerParams.debtDecimals));
  console.log("  Percentage of debt:", Number(minBuyAmount) / Number(debtBalance) * 100, "%");
}

main().catch(console.error);
