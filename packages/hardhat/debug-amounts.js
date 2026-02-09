const { ethers } = require("hardhat");

// Contract addresses from the transaction
const LTV_TRIGGER = "0x93Ca5E4F4ECfD6Bc3E7f573bc40af8C32c997Fb5";
const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";

async function main() {
  // Get LtvTrigger's ViewRouter
  const ltvTrigger = await ethers.getContractAt(
    [...(await ethers.getContractFactory("LtvTrigger")).interface.fragments],
    LTV_TRIGGER
  );

  const viewRouterAddr = await ltvTrigger.viewRouter();
  console.log(`LtvTrigger's ViewRouter: ${viewRouterAddr}`);

  // Get ViewRouter contract
  const viewRouter = await ethers.getContractAt(
    [...(await ethers.getContractFactory("KapanViewRouter")).interface.fragments],
    viewRouterAddr
  );

  // Get Morpho gateway
  const MORPHO_BLUE_ID = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10);
  console.log(`MORPHO_BLUE_ID: ${MORPHO_BLUE_ID}`);

  const morphoGateway = await viewRouter.gateways("morpho-blue");
  console.log(`Morpho Gateway from ViewRouter: ${morphoGateway}`);

  // Encode Morpho context (from the order)
  const context = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,address,address,uint256)"],
    [[
      "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // loanToken (USDT)
      "0x41CA7586cC1311807B4605fBB748a3B8862b42b5", // collateralToken (steakUSDC)
      "0x8ceD7944c38A635146F02b1305a4697761Fe6D7B", // oracle
      "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA", // irm
      "0x0cb2bba6f17b8000" // lltv (915000000000000000)
    ]]
  );

  // Check getCurrentLtv
  console.log(`\n=== LTV Check ===`);
  try {
    const currentLtv = await viewRouter.getCurrentLtv(MORPHO_BLUE_ID, USER, context);
    console.log(`getCurrentLtv: ${currentLtv.toString()} bps (${Number(currentLtv) / 100}%)`);
  } catch (e) {
    console.log(`getCurrentLtv FAILED: ${e.message}`);
  }

  // Check getPositionValue
  console.log(`\n=== Position Value Check ===`);
  try {
    const [collateralValue, debtValue] = await viewRouter.getPositionValue(MORPHO_BLUE_ID, USER, context);
    console.log(`Collateral value: ${collateralValue.toString()}`);
    console.log(`Debt value: ${debtValue.toString()}`);

    // Calculate expected deleverage
    // Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)
    const targetLtvBps = 2800n;
    const targetDebt = (collateralValue * targetLtvBps) / 10000n;
    console.log(`\nTarget debt at 28% LTV: ${targetDebt.toString()}`);

    if (debtValue > targetDebt) {
      const numerator = debtValue - targetDebt;
      const denominator = 10000n - targetLtvBps;
      const deleverageAmount = (numerator * 10000n) / denominator;
      console.log(`Deleverage needed (USD): ${deleverageAmount.toString()}`);
    } else {
      console.log(`Already below target LTV - no deleverage needed`);
    }
  } catch (e) {
    console.log(`getPositionValue FAILED: ${e.message}`);
    console.log(`This is likely the bug - MorphoBlueGatewayView doesn't have getPositionValue!`);
  }

  // Check if the MorphoBlueGatewayView has getPositionValue
  console.log(`\n=== Check MorphoBlueGatewayView ===`);
  try {
    const morphoGatewayView = await ethers.getContractAt(
      ["function getPositionValue(tuple(address,address,address,address,uint256),address) view returns (uint256,uint256)"],
      morphoGateway
    );

    const marketParams = {
      loanToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      collateralToken: "0x41CA7586cC1311807B4605fBB748a3B8862b42b5",
      oracle: "0x8ceD7944c38A635146F02b1305a4697761Fe6D7B",
      irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
      lltv: "915000000000000000"
    };

    const [cv, dv] = await morphoGatewayView.getPositionValue(
      [marketParams.loanToken, marketParams.collateralToken, marketParams.oracle, marketParams.irm, marketParams.lltv],
      USER
    );
    console.log(`Direct getPositionValue call SUCCESS`);
    console.log(`  Collateral: ${cv.toString()}`);
    console.log(`  Debt: ${dv.toString()}`);
  } catch (e) {
    console.log(`Direct getPositionValue call FAILED: ${e.message}`);
    console.log(`\n>>> The deployed MorphoBlueGatewayView doesn't have the getPositionValue function!`);
    console.log(`>>> Need to redeploy MorphoBlueGatewayView and update ViewRouter.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
