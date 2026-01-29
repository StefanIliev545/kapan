const { ethers } = require("hardhat");

// Contract addresses from the transaction
const LTV_TRIGGER = "0x93Ca5E4F4ECfD6Bc3E7f573bc40af8C32c997Fb5";
const CONDITIONAL_ORDER_MANAGER = "0x7768e74C711c8c8df7D64088e0f145E14D010054";
const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
const ORDER_HASH = "0x56fcb57506425ff028c651e9f4aee43c4fa2a64dac9fc20dc53ad6f2da3130d4";

async function main() {
  // Get contracts
  const conditionalOrderManager = await ethers.getContractAt(
    "KapanConditionalOrderManager",
    CONDITIONAL_ORDER_MANAGER
  );

  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  // Get order
  const order = await conditionalOrderManager.getOrder(ORDER_HASH);

  // Decode trigger params
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);

  console.log("=== Trigger Params ===");
  console.log(`Protocol ID: ${triggerParams.protocolId}`);
  console.log(`Trigger LTV: ${triggerParams.triggerLtvBps.toString()} bps`);
  console.log(`Target LTV: ${triggerParams.targetLtvBps.toString()} bps`);
  console.log(`Collateral: ${triggerParams.collateralToken}`);
  console.log(`Debt: ${triggerParams.debtToken}`);
  console.log(`Collateral Decimals: ${triggerParams.collateralDecimals}`);
  console.log(`Debt Decimals: ${triggerParams.debtDecimals}`);
  console.log(`Max slippage: ${triggerParams.maxSlippageBps.toString()} bps`);
  console.log(`Num chunks: ${triggerParams.numChunks}`);
  console.log(`Protocol Context length: ${triggerParams.protocolContext.length}`);

  // Decode Morpho context
  if (triggerParams.protocolId === "0x30281257") { // MORPHO_BLUE
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(address,address,address,address,uint256)"],
        triggerParams.protocolContext
      );
      const [loanToken, collateralToken, oracle, irm, lltv] = decoded[0];
      console.log("\n=== Morpho Context ===");
      console.log(`Loan Token: ${loanToken}`);
      console.log(`Collateral Token: ${collateralToken}`);
      console.log(`Oracle: ${oracle}`);
      console.log(`IRM: ${irm}`);
      console.log(`LLTV: ${lltv.toString()} (${Number(lltv) / 1e18 * 100}%)`);
    } catch (e) {
      console.log(`Failed to decode context: ${e.message}`);
    }
  }

  // Get ViewRouter and manually trace calculation
  const viewRouterAddr = await ltvTrigger.viewRouter();
  console.log(`\nViewRouter: ${viewRouterAddr}`);

  const viewRouter = await ethers.getContractAt(
    [...(await ethers.getContractFactory("KapanViewRouter")).interface.fragments],
    viewRouterAddr
  );

  // Get position value
  console.log("\n=== Position Value ===");
  try {
    const [collateralValue, debtValue] = await viewRouter.getPositionValue(
      triggerParams.protocolId,
      USER,
      triggerParams.protocolContext
    );
    console.log(`Collateral value: ${collateralValue.toString()}`);
    console.log(`Debt value: ${debtValue.toString()}`);

    // Calculate deleverage
    const targetLtvBps = triggerParams.targetLtvBps;
    const currentLtvBps = (debtValue * 10000n) / collateralValue;
    console.log(`Current LTV: ${currentLtvBps.toString()} bps`);

    if (currentLtvBps > targetLtvBps) {
      const targetDebt = (collateralValue * targetLtvBps) / 10000n;
      const numerator = debtValue - targetDebt;
      const denominator = 10000n - targetLtvBps;
      const deleverageUsd = (numerator * 10000n) / denominator;
      console.log(`Target debt: ${targetDebt.toString()}`);
      console.log(`Deleverage USD (raw): ${deleverageUsd.toString()}`);

      // Get collateral price
      const collateralPrice = await viewRouter.getCollateralPrice(
        triggerParams.protocolId,
        triggerParams.collateralToken,
        triggerParams.protocolContext
      );
      console.log(`Collateral price: ${collateralPrice.toString()}`);

      // Calculate sell amount
      const collateralDecimals = BigInt(triggerParams.collateralDecimals);
      const sellAmount = (deleverageUsd * (10n ** collateralDecimals)) / collateralPrice;
      console.log(`Sell amount (raw): ${sellAmount.toString()}`);
      console.log(`Sell amount (formatted ${triggerParams.collateralDecimals} dec): ${ethers.formatUnits(sellAmount, triggerParams.collateralDecimals)}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Check token decimals on chain
  console.log("\n=== Token Decimals On-Chain ===");
  const collateralToken = await ethers.getContractAt(
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    triggerParams.collateralToken
  );
  const debtToken = await ethers.getContractAt(
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    triggerParams.debtToken
  );

  const collDecimals = await collateralToken.decimals();
  const debtDecimals = await debtToken.decimals();
  const collSymbol = await collateralToken.symbol();
  const debtSymbol = await debtToken.symbol();

  console.log(`Collateral: ${collSymbol} - ${collDecimals} decimals (param says ${triggerParams.collateralDecimals})`);
  console.log(`Debt: ${debtSymbol} - ${debtDecimals} decimals (param says ${triggerParams.debtDecimals})`);

  if (collDecimals != triggerParams.collateralDecimals) {
    console.log(`\n>>> BUG: Collateral decimals mismatch!`);
  }
  if (debtDecimals != triggerParams.debtDecimals) {
    console.log(`\n>>> BUG: Debt decimals mismatch!`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
