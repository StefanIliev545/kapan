const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

async function main() {
  console.log("=== Testing ViewRouter Fix ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  const order = await manager.getOrder(ORDER_HASH);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);
  const user = order.params.user;

  console.log("Before fix (from on-chain deployed ViewRouter):");
  const [sellAmountOld, minBuyOld] = await ltvTrigger.calculateExecution(order.params.triggerStaticData, user);
  console.log("  Sell:", ethers.formatUnits(sellAmountOld, 6), "collateral");
  console.log("  MinBuy:", ethers.formatUnits(minBuyOld, 6), "debt");
  console.log("  Ratio:", (Number(minBuyOld) / Number(sellAmountOld)).toFixed(4));

  // Deploy the fixed ViewRouter locally
  console.log("\nDeploying fixed ViewRouter...");
  const ViewRouter = await ethers.getContractFactory("KapanViewRouter");
  const [signer] = await ethers.getSigners();
  const fixedViewRouter = await ViewRouter.deploy(signer.address);
  await fixedViewRouter.waitForDeployment();

  // Set the gateways (copy from the old one)
  const oldViewRouterAddr = await ltvTrigger.viewRouter();
  const oldViewRouter = await ethers.getContractAt("KapanViewRouter", oldViewRouterAddr);

  const morphoGateway = await oldViewRouter.gateways("morpho-blue");
  const aaveGateway = await oldViewRouter.gateways("aave-v3");

  console.log("Setting gateways...");
  console.log("  Morpho:", morphoGateway);
  console.log("  Aave:", aaveGateway);

  await fixedViewRouter.setGateway("morpho-blue", morphoGateway);
  await fixedViewRouter.setGateway("aave-v3", aaveGateway);

  // Call calculateMinBuy directly on the fixed router
  const sellAmount = 477353979n;
  const maxSlippageBps = 100n; // 1%

  const minBuyFixed = await fixedViewRouter.calculateMinBuy(
    triggerParams.protocolId,
    sellAmount,
    maxSlippageBps,
    triggerParams.collateralToken,
    triggerParams.debtToken,
    triggerParams.collateralDecimals,
    triggerParams.debtDecimals,
    triggerParams.protocolContext
  );

  console.log("\nAfter fix (local fixed ViewRouter):");
  console.log("  Sell:", ethers.formatUnits(sellAmount, 6), "collateral");
  console.log("  MinBuy:", ethers.formatUnits(minBuyFixed, 6), "debt");
  console.log("  Ratio:", (Number(minBuyFixed) / Number(sellAmount)).toFixed(4));

  // Show the improvement
  console.log("\n=== Summary ===");
  console.log("Old minBuy:", ethers.formatUnits(minBuyOld, 6), "USDT (using Morpho oracle)");
  console.log("New minBuy:", ethers.formatUnits(minBuyFixed, 6), "USDT (using Aave/Chainlink prices)");
  console.log("Debt owed:  ~518 USDT");
  console.log("\nThe fix ensures minBuy < sellAmount (realistic for swaps)");
}

main().catch(console.error);
