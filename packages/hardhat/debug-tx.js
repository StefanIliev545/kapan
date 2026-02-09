const { ethers } = require("hardhat");

const TX_HASH = "0x692a8afa2c6e3274b228c3ea426967672226072f4a8eb9c1cd6eab2e100eb4d4";

// NEW deployed contract addresses
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

async function main() {
  const provider = ethers.provider;

  console.log("=== Analyzing Transaction ===");
  console.log(`TX: ${TX_HASH}\n`);

  // Get transaction receipt
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  if (!receipt) {
    console.log("Transaction not found - may need to wait for fork to sync");
    return;
  }
  console.log(`Status: ${receipt.status === 1 ? "Success" : "Failed"}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`From: ${receipt.from}`);
  console.log(`To: ${receipt.to}`);
  console.log(`Logs count: ${receipt.logs.length}`);
  console.log("");

  // Check current block number
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current fork block: ${currentBlock}`);
  console.log("");

  // Check contract code exists
  const managerCode = await provider.getCode(CONDITIONAL_ORDER_MANAGER);
  console.log(`ConditionalOrderManager code length: ${managerCode.length} bytes`);
  const triggerCode = await provider.getCode(LTV_TRIGGER);
  console.log(`LtvTrigger code length: ${triggerCode.length} bytes`);
  console.log("");

  // Parse logs
  const conditionalOrderManager = await ethers.getContractAt(
    "KapanConditionalOrderManager",
    CONDITIONAL_ORDER_MANAGER
  );

  console.log("=== Events ===");
  let orderHash = null;
  for (const log of receipt.logs) {
    try {
      const parsed = conditionalOrderManager.interface.parseLog(log);
      if (parsed) {
        console.log(`Event: ${parsed.name}`);
        console.log(`  Args: ${JSON.stringify(parsed.args, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}`);
        if (parsed.name === "ConditionalOrderCreated") {
          orderHash = parsed.args.orderHash;
        }
      }
    } catch {
      // Try ComposableCoW events
      try {
        const composableCoWIface = new ethers.Interface([
          "event ConditionalOrderCreated(address indexed owner, tuple(address handler, bytes32 salt, bytes staticData) params)"
        ]);
        const parsed = composableCoWIface.parseLog(log);
        if (parsed) {
          console.log(`Event: ComposableCoW.${parsed.name}`);
          console.log(`  Owner: ${parsed.args.owner}`);
          console.log(`  Handler: ${parsed.args.params.handler}`);
          console.log(`  Salt: ${parsed.args.params.salt}`);
        }
      } catch {
        // Other contract
      }
    }
  }

  if (!orderHash) {
    console.log("\nNo ConditionalOrderCreated event found from our manager");
    return;
  }

  console.log(`\n=== Order Details ===`);
  console.log(`Order hash: ${orderHash}`);

  // Get order from manager
  const order = await conditionalOrderManager.getOrder(orderHash);
  console.log(`Status: ${order.status} (1=Active, 2=Completed, 3=Cancelled)`);
  console.log(`User: ${order.params.user}`);
  console.log(`Trigger: ${order.params.trigger}`);
  console.log(`Iteration count: ${order.iterationCount.toString()}`);
  console.log(`Max iterations: ${order.params.maxIterations.toString()}`);
  console.log(`Sell token: ${order.params.sellToken}`);
  console.log(`Buy token: ${order.params.buyToken}`);

  // Decode trigger static data
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);
  console.log(`\n=== Trigger Params ===`);
  console.log(`Protocol ID: ${triggerParams.protocolId}`);
  console.log(`Trigger LTV: ${triggerParams.triggerLtvBps.toString()} bps (${Number(triggerParams.triggerLtvBps) / 100}%)`);
  console.log(`Target LTV: ${triggerParams.targetLtvBps.toString()} bps (${Number(triggerParams.targetLtvBps) / 100}%)`);
  console.log(`Collateral: ${triggerParams.collateralToken}`);
  console.log(`Debt: ${triggerParams.debtToken}`);
  console.log(`Collateral decimals: ${triggerParams.collateralDecimals}`);
  console.log(`Debt decimals: ${triggerParams.debtDecimals}`);
  console.log(`Max slippage: ${triggerParams.maxSlippageBps.toString()} bps`);
  console.log(`Num chunks: ${triggerParams.numChunks}`);

  // Check current LTV
  console.log(`\n=== Current State ===`);
  try {
    const currentLtv = await ltvTrigger.getCurrentLtv(
      triggerParams.protocolId,
      order.params.user,
      triggerParams.protocolContext
    );
    console.log(`Current LTV: ${currentLtv.toString()} bps (${Number(currentLtv) / 100}%)`);

    // Check shouldExecute
    const [shouldExec, reason] = await ltvTrigger.shouldExecute(order.params.triggerStaticData, order.params.user);
    console.log(`Should execute: ${shouldExec} - ${reason}`);

    // Check isComplete
    const isComplete = await ltvTrigger.isComplete(order.params.triggerStaticData, order.params.user, order.iterationCount);
    console.log(`Is complete: ${isComplete}`);

    // Try calculateExecution
    if (shouldExec) {
      try {
        const [sellAmount, minBuy] = await ltvTrigger.calculateExecution(order.params.triggerStaticData, order.params.user);
        console.log(`\n=== Calculate Execution ===`);
        console.log(`Sell amount: ${ethers.formatUnits(sellAmount, triggerParams.collateralDecimals)} (raw: ${sellAmount.toString()})`);
        console.log(`Min buy: ${ethers.formatUnits(minBuy, triggerParams.debtDecimals)} (raw: ${minBuy.toString()})`);
      } catch (e) {
        console.log(`calculateExecution FAILED: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`Error checking state: ${e.message}`);
  }

  // Try getTradeableOrder
  console.log(`\n=== getTradeableOrder ===`);
  try {
    const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
    const tradeableOrder = await conditionalOrderManager.getTradeableOrder(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash,
      staticInput,
      "0x"
    );
    console.log(`SUCCESS!`);
    console.log(`  Sell token: ${tradeableOrder.sellToken}`);
    console.log(`  Buy token: ${tradeableOrder.buyToken}`);
    console.log(`  Sell amount: ${ethers.formatUnits(tradeableOrder.sellAmount, triggerParams.collateralDecimals)} (raw: ${tradeableOrder.sellAmount.toString()})`);
    console.log(`  Buy amount: ${ethers.formatUnits(tradeableOrder.buyAmount, triggerParams.debtDecimals)} (raw: ${tradeableOrder.buyAmount.toString()})`);
    console.log(`  Valid to: ${tradeableOrder.validTo}`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    if (e.data) {
      console.log(`Error data: ${e.data}`);
    }
  }

  // Check ViewRouter configuration
  console.log(`\n=== ViewRouter Check ===`);
  const viewRouterAddr = await ltvTrigger.viewRouter();
  console.log(`ViewRouter address: ${viewRouterAddr}`);

  const viewRouter = await ethers.getContractAt("KapanViewRouter", viewRouterAddr);
  const morphoGateway = await viewRouter.gateways("morpho-blue");
  console.log(`Morpho gateway in ViewRouter: ${morphoGateway}`);

  // Check getPositionValue directly
  console.log(`\n=== Direct getPositionValue Check ===`);
  try {
    const [collateralValue, debtValue] = await viewRouter.getPositionValue(
      triggerParams.protocolId,
      order.params.user,
      triggerParams.protocolContext
    );
    console.log(`Collateral value (8 decimals USD): ${collateralValue.toString()}`);
    console.log(`Debt value (8 decimals USD): ${debtValue.toString()}`);
    console.log(`Collateral value USD: $${Number(collateralValue) / 1e8}`);
    console.log(`Debt value USD: $${Number(debtValue) / 1e8}`);

    // Calculate expected LTV
    if (collateralValue > 0) {
      const calculatedLtv = (debtValue * 10000n) / collateralValue;
      console.log(`Calculated LTV: ${calculatedLtv.toString()} bps (${Number(calculatedLtv) / 100}%)`);
    }
  } catch (e) {
    console.log(`getPositionValue FAILED: ${e.message}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
