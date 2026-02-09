const { ethers } = require("hardhat");

// Order details from CoW API
const SELL_AMOUNT = 23937816n;  // USDT (6 decimals)
const BUY_AMOUNT = 20605200n;   // syrupUSDC (6 decimals)

// Oracle price
const ORACLE_PRICE = 1150119209733649568038091926859065510n; // 36 decimals

async function main() {
  console.log("=== Order Surplus Analysis ===\n");
  
  // Convert to human readable
  const sellUSDT = Number(SELL_AMOUNT) / 1e6;
  const minBuySyrup = Number(BUY_AMOUNT) / 1e6;
  const oracleRate = Number(ORACLE_PRICE) / 1e36;
  
  console.log("Order Details:");
  console.log("  Selling:", sellUSDT, "USDT");
  console.log("  Min buy:", minBuySyrup, "syrupUSDC");
  console.log("  Oracle rate: 1 syrupUSDC =", oracleRate.toFixed(6), "USDT");
  
  // What the oracle says we should get
  // For leverage: sellAmount * 1e36 / oraclePrice
  const fairSyrup = sellUSDT / oracleRate;
  console.log("\nAt oracle rate:");
  console.log("  Fair syrupUSDC:", fairSyrup.toFixed(6));
  console.log("  Order asks for:", minBuySyrup.toFixed(6));
  
  // Surplus for solver
  const surplusSyrup = fairSyrup - minBuySyrup;
  const surplusUSDT = surplusSyrup * oracleRate;
  const surplusPct = (surplusSyrup / fairSyrup) * 100;
  
  console.log("\nSolver surplus (honey):");
  console.log("  Surplus syrupUSDC:", surplusSyrup.toFixed(6));
  console.log("  Surplus in USDT:", surplusUSDT.toFixed(4));
  console.log("  Surplus %:", surplusPct.toFixed(2) + "%");
  
  // Reverse check - what rate does the order imply?
  const impliedRate = sellUSDT / minBuySyrup;
  console.log("\nImplied exchange rate:");
  console.log("  Order implies: 1 syrupUSDC =", impliedRate.toFixed(6), "USDT");
  console.log("  Oracle says: 1 syrupUSDC =", oracleRate.toFixed(6), "USDT");
  console.log("  Slippage applied:", ((impliedRate / oracleRate - 1) * 100).toFixed(2) + "%");
  
  // Gas costs on Arbitrum
  console.log("\n--- Gas Context ---");
  console.log("Typical Arbitrum swap gas: ~200k-400k gas");
  console.log("At 0.01 gwei: ~0.002-0.004 ETH");
  console.log("At ETH=$3000: ~$0.006-$0.012");
  console.log("Your surplus:", "$" + surplusUSDT.toFixed(4));
}

main().catch(console.error);
