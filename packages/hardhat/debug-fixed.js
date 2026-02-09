const { ethers } = require("hardhat");

// Contract addresses from the transaction
const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
const MORPHO = "0x6c247b1F6182318877311737BaC0844bAa518F5e"; // Morpho Blue on Arbitrum

// Morpho market params
const MARKET_PARAMS = {
  loanToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
  collateralToken: "0x41CA7586cC1311807B4605fBB748a3B8862b42b5", // syrupUSDC
  oracle: "0x8ceD7944c38A635146F02b1305a4697761Fe6D7B",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: "915000000000000000" // 91.5%
};

async function main() {
  // Connect to Morpho directly
  const morpho = await ethers.getContractAt(
    ["function position(bytes32,address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
     "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)"],
    MORPHO
  );

  // Get oracle price
  const oracle = await ethers.getContractAt(
    ["function price() view returns (uint256)"],
    MARKET_PARAMS.oracle
  );

  // Get loan token decimals
  const loanToken = await ethers.getContractAt(
    ["function decimals() view returns (uint8)"],
    MARKET_PARAMS.loanToken
  );
  const loanDecimals = await loanToken.decimals();
  console.log(`Loan token decimals: ${loanDecimals}`);

  // Calculate market ID
  const marketId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "address", "uint256"],
      [MARKET_PARAMS.loanToken, MARKET_PARAMS.collateralToken, MARKET_PARAMS.oracle, MARKET_PARAMS.irm, MARKET_PARAMS.lltv]
    )
  );
  console.log(`Market ID: ${marketId}`);

  // Get position
  const position = await morpho.position(marketId, USER);
  console.log(`\n=== Raw Position ===`);
  console.log(`Supply shares: ${position.supplyShares.toString()}`);
  console.log(`Borrow shares: ${position.borrowShares.toString()}`);
  console.log(`Collateral: ${position.collateral.toString()}`);

  // Get market
  const market = await morpho.market(marketId);
  console.log(`\n=== Market State ===`);
  console.log(`Total borrow assets: ${market.totalBorrowAssets.toString()}`);
  console.log(`Total borrow shares: ${market.totalBorrowShares.toString()}`);

  // Calculate debt in loan units
  let debtInLoanUnits = 0n;
  if (position.borrowShares > 0n && market.totalBorrowShares > 0n) {
    debtInLoanUnits = (BigInt(position.borrowShares) * BigInt(market.totalBorrowAssets)) / BigInt(market.totalBorrowShares);
  }
  console.log(`\nDebt in loan units: ${debtInLoanUnits.toString()} (${Number(debtInLoanUnits) / (10 ** Number(loanDecimals))} USDT)`);

  // Get oracle price
  const oraclePrice = await oracle.price();
  console.log(`Oracle price: ${oraclePrice.toString()}`);

  // Calculate collateral in loan units
  let collateralInLoanUnits = 0n;
  if (position.collateral > 0n) {
    collateralInLoanUnits = (BigInt(position.collateral) * oraclePrice) / (10n ** 36n);
  }
  console.log(`Collateral in loan units: ${collateralInLoanUnits.toString()} (${Number(collateralInLoanUnits) / (10 ** Number(loanDecimals))} USDT equiv)`);

  // === BEFORE FIX (values in loan token units) ===
  console.log(`\n=== BEFORE FIX (loan token units) ===`);
  console.log(`Collateral value: ${collateralInLoanUnits.toString()}`);
  console.log(`Debt value: ${debtInLoanUnits.toString()}`);

  // === AFTER FIX (values in 8 decimals) ===
  let collateralValue8dec, debtValue8dec;
  if (loanDecimals >= 8n) {
    const divisor = 10n ** (BigInt(loanDecimals) - 8n);
    collateralValue8dec = collateralInLoanUnits / divisor;
    debtValue8dec = debtInLoanUnits / divisor;
  } else {
    const multiplier = 10n ** (8n - BigInt(loanDecimals));
    collateralValue8dec = collateralInLoanUnits * multiplier;
    debtValue8dec = debtInLoanUnits * multiplier;
  }
  console.log(`\n=== AFTER FIX (8 decimals) ===`);
  console.log(`Collateral value: ${collateralValue8dec.toString()} (${Number(collateralValue8dec) / 1e8} USD)`);
  console.log(`Debt value: ${debtValue8dec.toString()} (${Number(debtValue8dec) / 1e8} USD)`);

  // Calculate deleverage
  const targetLtvBps = 2800n;
  const currentLtvBps = (debtValue8dec * 10000n) / collateralValue8dec;
  console.log(`\nCurrent LTV: ${currentLtvBps.toString()} bps (${Number(currentLtvBps) / 100}%)`);

  if (currentLtvBps > targetLtvBps) {
    const targetDebt = (collateralValue8dec * targetLtvBps) / 10000n;
    const numerator = debtValue8dec - targetDebt;
    const denominator = 10000n - targetLtvBps;
    const deleverageUsd = (numerator * 10000n) / denominator;
    console.log(`Target debt: ${targetDebt.toString()} (${Number(targetDebt) / 1e8} USD)`);
    console.log(`Deleverage needed: ${deleverageUsd.toString()} (${Number(deleverageUsd) / 1e8} USD)`);

    // Calculate sell amount (collateral price = 1e8 for stablecoins)
    const collateralPrice = 100000000n; // $1.00 in 8 decimals
    const collateralDecimals = 6n; // syrupUSDC has 6 decimals
    const sellAmount = (deleverageUsd * (10n ** collateralDecimals)) / collateralPrice;
    console.log(`\nSell amount (raw): ${sellAmount.toString()}`);
    console.log(`Sell amount (formatted): ${Number(sellAmount) / 1e6} syrupUSDC tokens`);
    console.log(`Sell value: ~$${Number(sellAmount) / 1e6} USD`);

    // Compare to BEFORE
    console.log(`\n=== COMPARISON ===`);
    const deleverageOld = 494436461n; // From before (loan token units)
    const sellAmountOld = (deleverageOld * (10n ** collateralDecimals)) / collateralPrice;
    console.log(`BEFORE: deleverageUsd=${deleverageOld}, sellAmount=${sellAmountOld} (${Number(sellAmountOld) / 1e6} tokens)`);
    console.log(`AFTER:  deleverageUsd=${deleverageUsd}, sellAmount=${sellAmount} (${Number(sellAmount) / 1e6} tokens)`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
