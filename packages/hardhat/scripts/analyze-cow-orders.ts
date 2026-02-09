/**
 * Script to analyze CoW Protocol orders and verify the math
 * Usage: npx hardhat run scripts/analyze-cow-orders.ts --network arbitrum
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "ethers";

// Token addresses on Arbitrum
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { symbol: "WETH", decimals: 18 },
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { symbol: "WBTC", decimals: 8 },
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": { symbol: "USDC.e", decimals: 6 },
  "0x41ca7586cc1311807b4605fbb748a3b8862b42b5": { symbol: "???", decimals: 18 },
};

// Chainlink price feed addresses on Arbitrum
const PRICE_FEEDS: Record<string, string> = {
  ETH: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ETH/USD
  BTC: "0x6ce185860a4963106506C203335A2910C100e5c1", // BTC/USD
  USDC: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3", // USDC/USD
  USDT: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7", // USDT/USD
};

interface Order {
  uid: string;
  kind: "buy" | "sell";
  status: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
}

const ORDERS: Order[] = [
  {
    uid: "0x6021d3e9...",
    kind: "sell",
    status: "fulfilled",
    sellToken: "0x41ca7586cc1311807b4605fbb748a3b8862b42b5",
    buyToken: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    sellAmount: "216464509",
    buyAmount: "315937",
  },
  {
    uid: "0xc964d872...",
    kind: "buy",
    status: "open",
    sellToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    buyToken: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    sellAmount: "205842609",
    buyAmount: "208053065",
  },
  {
    uid: "0xf34b871a...",
    kind: "sell",
    status: "open",
    sellToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    buyToken: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    sellAmount: "14287236634171193",
    buyAmount: "41157",
  },
  {
    uid: "0x817f7825...",
    kind: "sell",
    status: "open",
    sellToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    buyToken: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    sellAmount: "14287236165633846",
    buyAmount: "31899207",
  },
];

async function getPrice(symbol: string): Promise<number> {
  const feedAddress = PRICE_FEEDS[symbol];
  if (!feedAddress) return 0;

  const aggregator = await ethers.getContractAt(
    ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"],
    feedAddress
  );

  const [, answer] = await aggregator.latestRoundData();
  return Number(answer) / 1e8; // Chainlink uses 8 decimals
}

async function analyzeOrder(order: Order, prices: Record<string, number>) {
  const sellTokenInfo = TOKENS[order.sellToken.toLowerCase()] || { symbol: "UNKNOWN", decimals: 18 };
  const buyTokenInfo = TOKENS[order.buyToken.toLowerCase()] || { symbol: "UNKNOWN", decimals: 18 };

  const sellAmount = Number(formatUnits(order.sellAmount, sellTokenInfo.decimals));
  const buyAmount = Number(formatUnits(order.buyAmount, buyTokenInfo.decimals));

  // Get USD values
  const sellSymbol = sellTokenInfo.symbol.replace(".e", "");
  const buySymbol = buyTokenInfo.symbol.replace(".e", "");

  let sellUSD = 0;
  let buyUSD = 0;

  if (sellSymbol === "WETH") sellUSD = sellAmount * (prices.ETH || 0);
  else if (sellSymbol === "WBTC") sellUSD = sellAmount * (prices.BTC || 0);
  else if (sellSymbol.includes("USD")) sellUSD = sellAmount * (prices.USDC || 1);

  if (buySymbol === "WETH") buyUSD = buyAmount * (prices.ETH || 0);
  else if (buySymbol === "WBTC") buyUSD = buyAmount * (prices.BTC || 0);
  else if (buySymbol.includes("USD")) buyUSD = buyAmount * (prices.USDT || 1);

  console.log("\n" + "=".repeat(80));
  console.log(`Order: ${order.uid}`);
  console.log(`Status: ${order.status} | Kind: ${order.kind.toUpperCase()}`);
  console.log("-".repeat(80));
  console.log(`Sell: ${sellAmount.toFixed(8)} ${sellTokenInfo.symbol} (~$${sellUSD.toFixed(2)})`);
  console.log(`Buy:  ${buyAmount.toFixed(8)} ${buyTokenInfo.symbol} (~$${buyUSD.toFixed(2)})`);
  console.log("-".repeat(80));

  if (order.kind === "buy") {
    // BUY order: exact buyAmount, max sellAmount
    // For the order to be fillable: sellAmount (max) must be >= what solver needs
    console.log(`BUY ORDER: Want exactly ${buyAmount.toFixed(4)} ${buyTokenInfo.symbol}`);
    console.log(`           Willing to pay up to ${sellAmount.toFixed(4)} ${sellTokenInfo.symbol}`);

    if (sellUSD > 0 && buyUSD > 0) {
      const ratio = sellUSD / buyUSD;
      console.log(`\n   USD Ratio: $${sellUSD.toFixed(2)} / $${buyUSD.toFixed(2)} = ${ratio.toFixed(4)}`);

      if (ratio < 1) {
        console.log(`\n   ❌ UNFILLABLE: sellAmount ($${sellUSD.toFixed(2)}) < buyAmount ($${buyUSD.toFixed(2)})`);
        console.log(`      Solver would LOSE money filling this order!`);
        console.log(`      Need sellAmount >= ${buyAmount.toFixed(4)} + fees (~${(buyUSD * 1.01).toFixed(2)} USD)`);
      } else if (ratio < 1.005) {
        console.log(`\n   ⚠️  TIGHT: Very low margin for solver (${((ratio - 1) * 100).toFixed(2)}%)`);
      } else {
        console.log(`\n   ✅ Fillable: ${((ratio - 1) * 100).toFixed(2)}% margin for solver`);
      }
    }
  } else {
    // SELL order: exact sellAmount, min buyAmount
    console.log(`SELL ORDER: Selling exactly ${sellAmount.toFixed(8)} ${sellTokenInfo.symbol}`);
    console.log(`            Want at least ${buyAmount.toFixed(8)} ${buyTokenInfo.symbol}`);

    if (sellUSD > 0 && buyUSD > 0) {
      const ratio = buyUSD / sellUSD;
      console.log(`\n   USD Ratio: $${buyUSD.toFixed(2)} / $${sellUSD.toFixed(2)} = ${ratio.toFixed(4)}`);

      if (ratio > 1.1) {
        console.log(`\n   ❌ UNFILLABLE: Asking for ${((ratio - 1) * 100).toFixed(2)}% above market`);
      } else if (ratio > 1) {
        console.log(`\n   ⚠️  TIGHT: Asking for ${((ratio - 1) * 100).toFixed(2)}% above market`);
      } else {
        console.log(`\n   ✅ Fillable: ${((1 - ratio) * 100).toFixed(2)}% below market`);
      }
    }
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("COW PROTOCOL ORDER ANALYSIS");
  console.log("Network:", network.name);
  console.log("=".repeat(80));

  // Fetch current prices
  console.log("\nFetching current prices...");
  const prices: Record<string, number> = {};

  try {
    prices.ETH = await getPrice("ETH");
    prices.BTC = await getPrice("BTC");
    prices.USDC = await getPrice("USDC");
    prices.USDT = await getPrice("USDT");

    console.log(`ETH/USD: $${prices.ETH.toFixed(2)}`);
    console.log(`BTC/USD: $${prices.BTC.toFixed(2)}`);
    console.log(`USDC/USD: $${prices.USDC.toFixed(4)}`);
    console.log(`USDT/USD: $${prices.USDT.toFixed(4)}`);
  } catch {
    console.log("Could not fetch prices, using defaults");
    prices.ETH = 3500;
    prices.BTC = 100000;
    prices.USDC = 1;
    prices.USDT = 1;
  }

  // Analyze each order
  for (const order of ORDERS) {
    await analyzeOrder(order, prices);
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const buyOrders = ORDERS.filter(o => o.kind === "buy");
  const sellOrders = ORDERS.filter(o => o.kind === "sell");

  console.log(`\nBUY orders: ${buyOrders.length}`);
  buyOrders.forEach(o => {
    const sellInfo = TOKENS[o.sellToken.toLowerCase()];
    const buyInfo = TOKENS[o.buyToken.toLowerCase()];
    const sell = Number(formatUnits(o.sellAmount, sellInfo?.decimals || 18));
    const buy = Number(formatUnits(o.buyAmount, buyInfo?.decimals || 18));
    console.log(`  - ${o.status}: Pay max ${sell.toFixed(2)} ${sellInfo?.symbol} for exactly ${buy.toFixed(2)} ${buyInfo?.symbol}`);
  });

  console.log(`\nSELL orders: ${sellOrders.length}`);
  sellOrders.forEach(o => {
    const sellInfo = TOKENS[o.sellToken.toLowerCase()];
    const buyInfo = TOKENS[o.buyToken.toLowerCase()];
    const sell = Number(formatUnits(o.sellAmount, sellInfo?.decimals || 18));
    const buy = Number(formatUnits(o.buyAmount, buyInfo?.decimals || 18));
    console.log(`  - ${o.status}: Sell ${sell.toFixed(8)} ${sellInfo?.symbol} for min ${buy.toFixed(8)} ${buyInfo?.symbol}`);
  });

  console.log("\n" + "=".repeat(80));
  console.log("DIAGNOSIS");
  console.log("=".repeat(80));
  console.log(`
The BUY orders for USDC→USDT debt swap are UNFILLABLE because:
  - sellAmount (205.84 USDC) < buyAmount (208.05 USDT)
  - For a BUY order, you need: sellAmount >= buyAmount + fees
  - Current orders offer LESS USDC than the USDT they want
  - Solvers would lose money filling these!

ROOT CAUSE IDENTIFIED:
  In useDebtSwapConfig.tsx and useClosePositionConfig.tsx, for BUY orders:

  1. Frontend gets CoW quote: sellAmount (e.g., 207 USDC for 208 USDT)
  2. Frontend sets totalSellAmount = quote.sellAmount (207 USDC) - NO SLIPPAGE BUFFER
  3. LimitPriceTrigger.calculateExecution() computes:
     - expectedSell = buyAmount * 1e8 / limitPrice (≈ 207 USDC)
     - sellAmount = expectedSell * (1 + slippage) (≈ 208 USDC with 0.5% slippage)
  4. BUT then caps to totalSellAmount: if sellAmount > totalSellAmount, use totalSellAmount
     - sellAmount gets capped back to 207 USDC, LOSING THE SLIPPAGE BUFFER!
  5. Order is created with sellAmount=207 < buyAmount=208 → UNFILLABLE

FIX APPLIED:
  Added slippage buffer to totalSellAmount for BUY orders:

  const totalSellAmountWithSlippage = (effectiveLimitOrderNewDebt *
    BigInt(10000 + Math.round(slippage * 100))) / 10000n;

  Now: totalSellAmount = 207 * 1.005 = 208 USDC → Order is fillable!
`);</thinking>

}

main().catch(console.error);
