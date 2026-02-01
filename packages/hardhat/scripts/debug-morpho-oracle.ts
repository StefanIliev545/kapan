import { ethers } from "hardhat";

/**
 * Debug script to check Morpho oracle prices and understand the calculation
 */
async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const WBTC = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f";
  const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const viewRouter = "0xdDcB0BAdaB2CF16ff53f843F4880686fC8ED6688";

  console.log("=== Debug Morpho Oracle Prices ===\n");

  // Get Morpho contract to find markets
  const Morpho = await ethers.getContractAt(
    ["function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
     "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)"],
    morpho
  );

  // Get the MorphoBlueGatewayView from ViewRouter
  const ViewRouter = await ethers.getContractAt(
    ["function gateways(string) view returns (address)"],
    viewRouter
  );
  const morphoGateway = await ViewRouter.gateways("morpho-blue");
  console.log("Morpho Gateway:", morphoGateway);

  // Get registered markets from the gateway
  const GatewayView = await ethers.getContractAt(
    ["function registeredMarketCount() view returns (uint256)",
     "function getRegisteredMarketIds() view returns (bytes32[])",
     "function getOraclePrice(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) params) view returns (uint256)",
     "function getPositionValue(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) params, address user) view returns (uint256 collateralValueUsd, uint256 debtValueUsd)"],
    morphoGateway
  );

  const marketIds = await GatewayView.getRegisteredMarketIds();
  console.log("Registered markets:", marketIds.length);

  // Show all markets
  for (const marketId of marketIds) {
    const params = await Morpho.idToMarketParams(marketId);
    console.log("\n--- Market:", marketId.slice(0, 18), "---");
    console.log("Loan Token:", params.loanToken);
    console.log("Collateral Token:", params.collateralToken);
  }

  // Find WBTC market (any loan token)
  for (const marketId of marketIds) {
    const params = await Morpho.idToMarketParams(marketId);
    if (params.collateralToken.toLowerCase() === WBTC.toLowerCase()) {
      console.log("\n=== Found WBTC Market ===");
      console.log("Market ID:", marketId);
      console.log("Loan Token (USDT):", params.loanToken);
      console.log("Collateral Token (WBTC):", params.collateralToken);
      console.log("Oracle:", params.oracle);
      console.log("IRM:", params.irm);
      console.log("LLTV:", (Number(params.lltv) / 1e16).toFixed(2) + "%");

      // Get oracle price directly
      const Oracle = await ethers.getContractAt(
        ["function price() view returns (uint256)"],
        params.oracle
      );

      const oraclePrice = await Oracle.price();
      console.log("\n--- Oracle Price ---");
      console.log("Raw oracle price:", oraclePrice.toString());
      console.log("Oracle price (scientific):", Number(oraclePrice) / 1e36, "* 1e36");

      // Calculate expected BTC price
      // Oracle scale: 10^(36 + loanDecimals - collateralDecimals) = 10^(36 + 6 - 8) = 10^34
      // So price = oraclePrice / 10^34
      const btcPriceInUsdt = Number(oraclePrice) / 1e34;
      console.log("Implied BTC price (USDT):", btcPriceInUsdt.toFixed(2));

      // Check what getCollateralPrice returns via ViewRouter
      const ViewRouterFull = await ethers.getContractAt(
        ["function getCollateralPrice(bytes4 protocolId, address collateralToken, bytes context) view returns (uint256)",
         "function getDebtPrice(bytes4 protocolId, address debtToken, bytes context) view returns (uint256)",
         "function calculateMinBuy(bytes4 protocolId, uint256 sellAmount, uint256 maxSlippageBps, address collateralToken, address debtToken, uint8 collateralDecimals, uint8 debtDecimals, bytes context) view returns (uint256)"],
        viewRouter
      );

      const MORPHO_BLUE = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10) as `0x${string}`;
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const marketContext = abiCoder.encode(
        ["tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
        [params]
      );

      console.log("\n--- ViewRouter Calculations ---");
      const collateralPrice = await ViewRouterFull.getCollateralPrice(MORPHO_BLUE, WBTC, marketContext);
      console.log("getCollateralPrice (8 dec):", collateralPrice.toString());
      console.log("getCollateralPrice / 1e8:", (Number(collateralPrice) / 1e8).toFixed(2));

      const debtPrice = await ViewRouterFull.getDebtPrice(MORPHO_BLUE, USDT, marketContext);
      console.log("getDebtPrice (8 dec):", debtPrice.toString());
      console.log("getDebtPrice / 1e8:", (Number(debtPrice) / 1e8).toFixed(2));

      // Check position value for user
      console.log("\n--- User Position ---");
      const position = await Morpho.position(marketId, user);
      console.log("User collateral (raw):", position.collateral.toString());
      console.log("User collateral (WBTC):", ethers.formatUnits(position.collateral, 8));

      if (position.collateral > 0) {
        const [collateralValue, debtValue] = await GatewayView.getPositionValue(params, user);
        console.log("Collateral Value (8 dec):", collateralValue.toString());
        console.log("Collateral Value (readable):", (Number(collateralValue) / 1e8).toFixed(2), "USDT");
        console.log("Debt Value (8 dec):", debtValue.toString());
        console.log("Debt Value (readable):", (Number(debtValue) / 1e8).toFixed(2), "USDT");

        // Calculate expected minBuy for selling all collateral
        const sellAmount = position.collateral;
        const minBuy = await ViewRouterFull.calculateMinBuy(
          MORPHO_BLUE,
          sellAmount,
          0, // no slippage
          WBTC,
          USDT,
          8,
          6,
          marketContext
        );
        console.log("\n--- calculateMinBuy for full collateral ---");
        console.log("sellAmount (WBTC):", ethers.formatUnits(sellAmount, 8));
        console.log("minBuyAmount (USDT):", ethers.formatUnits(minBuy, 6));
        console.log("Implied BTC price:", (Number(minBuy) / Number(sellAmount) * 1e2).toFixed(2), "USDT");

        // Manual calculation to verify
        console.log("\n--- Manual Calculation Verification ---");
        const manualMinBuy = (BigInt(sellAmount) * oraclePrice) / BigInt(1e36);
        console.log("Manual: (sellAmount * oraclePrice) / 1e36 =", ethers.formatUnits(manualMinBuy, 6), "USDT");
      }

      break;
    }
  }
}

main().catch(console.error);
