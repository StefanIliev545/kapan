import { ethers } from "hardhat";

async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const WBTC = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f";
  const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";

  // Get deployed contracts
  const ltvTrigger = "0xa8B4857Cb0d0914aBFB2d1c999992d41702d1e23";
  const viewRouter = "0xdDcB0BAdaB2CF16ff53f843F4880686fC8ED6688";

  console.log("=== Debug LtvTrigger Calculation ===\n");

  // Check ViewRouter functions
  const ViewRouter = await ethers.getContractAt(
    ["function getCollateralPrice(bytes4 protocolId, address collateralToken, bytes context) view returns (uint256)",
     "function getDebtPrice(bytes4 protocolId, address debtToken, bytes context) view returns (uint256)",
     "function getPositionValue(bytes4 protocolId, address user, bytes context) view returns (uint256 collateralValueUsd, uint256 debtValueUsd)",
     "function getCurrentLtv(bytes4 protocolId, address user, bytes context) view returns (uint256)"],
    viewRouter
  );

  // Morpho Blue protocol ID
  const MORPHO_BLUE = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10) as `0x${string}`;
  console.log("MORPHO_BLUE protocolId:", MORPHO_BLUE);

  // Empty context for now (need actual market params for Morpho)
  const emptyContext = "0x";

  // Try getting prices
  console.log("\n--- ViewRouter Price Queries ---");
  try {
    const wbtcPrice = await ViewRouter.getCollateralPrice(MORPHO_BLUE, WBTC, emptyContext);
    console.log("WBTC price (8 decimals):", ethers.formatUnits(wbtcPrice, 8), "USD");
  } catch (e) {
    console.log("getCollateralPrice failed:", (e as Error).message?.slice(0, 100));
  }

  try {
    const usdtPrice = await ViewRouter.getDebtPrice(MORPHO_BLUE, USDT, emptyContext);
    console.log("USDT price (8 decimals):", ethers.formatUnits(usdtPrice, 8), "USD");
  } catch (e) {
    console.log("getDebtPrice failed:", (e as Error).message?.slice(0, 100));
  }

  // Check position value
  console.log("\n--- Position Value ---");
  try {
    const [collateralUsd, debtUsd] = await ViewRouter.getPositionValue(MORPHO_BLUE, user, emptyContext);
    console.log("Collateral USD (8 decimals):", ethers.formatUnits(collateralUsd, 8));
    console.log("Debt USD (8 decimals):", ethers.formatUnits(debtUsd, 8));
  } catch (e) {
    console.log("getPositionValue failed:", (e as Error).message?.slice(0, 100));
  }

  // Check LTV
  try {
    const ltv = await ViewRouter.getCurrentLtv(MORPHO_BLUE, user, emptyContext);
    console.log("Current LTV (bps):", ltv.toString());
  } catch (e) {
    console.log("getCurrentLtv failed:", (e as Error).message?.slice(0, 100));
  }

  // Now test the trigger directly
  console.log("\n--- LtvTrigger Direct Test ---");
  const LtvTrigger = await ethers.getContractAt(
    ["function calculateExecution(bytes staticData, address owner, uint256 iterationCount) view returns (uint256 sellAmount, uint256 minBuyAmount)",
     "function encodeTriggerParams(tuple(bytes4 protocolId, bytes protocolContext, uint256 triggerLtvBps, uint256 targetLtvBps, address collateralToken, address debtToken, uint8 collateralDecimals, uint8 debtDecimals, uint256 maxSlippageBps, uint8 numChunks) params) view returns (bytes)"],
    ltvTrigger
  );

  // Build trigger params
  const triggerParams = {
    protocolId: MORPHO_BLUE,
    protocolContext: emptyContext,
    triggerLtvBps: 8500n, // 85%
    targetLtvBps: 7500n, // 75%
    collateralToken: WBTC,
    debtToken: USDT,
    collateralDecimals: 8,
    debtDecimals: 6,
    maxSlippageBps: 100n, // 1%
    numChunks: 1
  };

  try {
    const staticData = await LtvTrigger.encodeTriggerParams(triggerParams);
    console.log("Encoded trigger params length:", staticData.length);

    const [sellAmount, minBuyAmount] = await LtvTrigger.calculateExecution(staticData, user, 0);
    console.log("\nCalculated amounts:");
    console.log("  sellAmount (raw):", sellAmount.toString());
    console.log("  sellAmount (WBTC):", ethers.formatUnits(sellAmount, 8));
    console.log("  minBuyAmount (raw):", minBuyAmount.toString());
    console.log("  minBuyAmount (USDT):", ethers.formatUnits(minBuyAmount, 6));

    if (sellAmount > 0n && minBuyAmount > 0n) {
      // Calculate implied price
      const impliedPrice = (minBuyAmount * BigInt(10 ** 8)) / sellAmount;
      console.log("\nImplied BTC price:", ethers.formatUnits(impliedPrice, 6), "USDT");
    }
  } catch (e) {
    console.log("calculateExecution failed:", (e as Error).message?.slice(0, 200));
  }
}

main().catch(console.error);
