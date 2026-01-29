const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

async function main() {
  console.log("=== Debugging Morpho Oracle Price ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  const order = await manager.getOrder(ORDER_HASH);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);

  console.log("Collateral:", triggerParams.collateralToken, "(steakUSDC)");
  console.log("Debt:", triggerParams.debtToken, "(USDT)");
  console.log("Collateral decimals:", triggerParams.collateralDecimals.toString());
  console.log("Debt decimals:", triggerParams.debtDecimals.toString());

  // Get ViewRouter
  const viewRouterAddr = await ltvTrigger.viewRouter();
  const viewRouter = await ethers.getContractAt("KapanViewRouter", viewRouterAddr);

  // Get Morpho gateway
  const morphoGatewayAddr = await viewRouter.gateways("morpho-blue");
  console.log("\nMorpho Gateway:", morphoGatewayAddr);

  const morphoGateway = await ethers.getContractAt([
    "function getOraclePrice(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) params) view returns (uint256)",
  ], morphoGatewayAddr);

  // Decode context to get MarketParams
  const marketParams = ethers.AbiCoder.defaultAbiCoder().decode(
    ["tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
    triggerParams.protocolContext
  )[0];

  console.log("\nMarket Params:");
  console.log("  loanToken:", marketParams.loanToken);
  console.log("  collateralToken:", marketParams.collateralToken);
  console.log("  oracle:", marketParams.oracle);

  // Get the oracle price - need to pass as array for struct
  const oraclePrice = await morphoGateway.getOraclePrice([
    marketParams.loanToken,
    marketParams.collateralToken,
    marketParams.oracle,
    marketParams.irm,
    marketParams.lltv,
  ]);
  console.log("\nMorpho Oracle Price (36 decimals):", oraclePrice.toString());
  console.log("Morpho Oracle Price (formatted):", ethers.formatUnits(oraclePrice, 36));

  // The Morpho oracle price represents: how many loan tokens per collateral token
  // loanAmount = collateralAmount * price / 1e36

  const sellAmount = 477353979n; // 477.35 collateral (6 decimals)
  console.log("\n=== Min Buy Calculation ===");
  console.log("Sell Amount:", ethers.formatUnits(sellAmount, 6), "collateral tokens");

  // Current formula: minBuy = sellAmount * oraclePrice / 1e36
  const minBuyWrong = (sellAmount * oraclePrice) / (10n ** 36n);
  console.log("\nCurrent formula result:", ethers.formatUnits(minBuyWrong, 6), "debt tokens");

  // What it SHOULD be (roughly 1:1 for stablecoins):
  // If steakUSDC and USDT are both ~$1, selling 477 should get ~477 (minus slippage)
  console.log("Expected (~1:1):", ethers.formatUnits(sellAmount, 6), "debt tokens");

  // The issue: Morpho oracle price is collateral/loan, not loan/collateral
  // So we need to invert it or use it differently

  // Let's check what the oracle price actually represents
  // If price > 1e36, collateral is worth MORE than loan (e.g., 1 ETH = 3000 USDC)
  // If price < 1e36, collateral is worth LESS than loan
  // If price = 1e36, they're 1:1

  const priceRatio = Number(oraclePrice) / 1e36;
  console.log("\nPrice ratio:", priceRatio, "(collateral per loan token? or loan per collateral?)");

  // If steakUSDC/USDT should be ~1:1, the price should be around 1e36
  // But if it's showing a different value, that explains the bug
}

main().catch(console.error);
