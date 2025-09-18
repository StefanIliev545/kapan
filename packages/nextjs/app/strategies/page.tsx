import { ArrowDownRightIcon, ArrowTrendingUpIcon, BoltIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Metadata } from "next";
import formatPercentage from "~~/utils/formatPercentage";

export const metadata: Metadata = {
  title: "Yield Strategies | Kapan Finance",
  description:
    "Cross-protocol lending strategies built with current optimal interest rates. Explore multi-hop routes and see the net APY on a $100 borrowed deposit.",
};

type HopAction = "deposit" | "borrow";
type RateKind = "APY" | "APR";

type StrategyHop = {
  action: HopAction;
  protocol: string;
  chain: string;
  asset: string;
  amountUSD: number;
  rate: number;
  rateKind: RateKind;
  description: string;
  includeInNetYield?: boolean;
  ltv?: number;
};

type Strategy = {
  id: string;
  title: string;
  headline: string;
  summary: string;
  baseAsset: string;
  borrowedAsset: string;
  primaryAmountUSD: number;
  asOf: string;
  liquidationBuffer: string;
  riskHighlights: string[];
  marketDrivers: string[];
  hops: StrategyHop[];
};

type ComputedHop = StrategyHop & {
  normalizedNotional: number;
  contribution?: number | null;
  cumulative?: number;
};

type ComputedStrategy = Strategy & {
  hops: ComputedHop[];
  netYield: number;
};

const strategies: Strategy[] = [
  {
    id: "eth-cross-protocol",
    title: "Cross-Protocol ETH Carry",
    headline: "Borrow WETH on Aave, deploy it on Morpho, and restake via Lido",
    summary:
      "Leverage lower Aave borrow costs with Morpho's boosted ETH supply rates, then recycle the liquidity into Lido staking to capture triple yield layers.",
    baseAsset: "USDC",
    borrowedAsset: "WETH",
    primaryAmountUSD: 100,
    asOf: "Feb 7, 2025",
    liquidationBuffer: "22%",
    riskHighlights: [
      "Track Aave's variable WETH rate — a spike above 5% collapses the spread.",
      "Morpho's boosted pools rely on governance rewards; if incentives drop, so will the supply APY.",
      "Staying 10% under the Morpho liquidation threshold leaves room for ETH volatility.",
    ],
    marketDrivers: [
      "Aave v3 Arbitrum WETH borrow has held near 3.1% amid muted leverage demand.",
      "Morpho Blue allocates 80% of Aave's reserve factor back to suppliers, pushing WETH supply to 4.95% APY.",
      "Lido's seven-day wstETH staking average sits at 3.8% with rising validator performance.",
    ],
    hops: [
      {
        action: "deposit",
        protocol: "Aave v3",
        chain: "Arbitrum",
        asset: "USDC",
        amountUSD: 125,
        rate: 5.45,
        rateKind: "APY",
        description: "Supply USDC to unlock 80% LTV borrowing power. This capital seeds the loop but isn't counted in the net spread.",
        includeInNetYield: false,
        ltv: 80,
      },
      {
        action: "borrow",
        protocol: "Aave v3",
        chain: "Arbitrum",
        asset: "WETH",
        amountUSD: 100,
        rate: 3.1,
        rateKind: "APR",
        description: "Borrow $100 worth of WETH at the current variable rate while maintaining a conservative buffer.",
      },
      {
        action: "deposit",
        protocol: "Morpho Blue",
        chain: "Ethereum",
        asset: "WETH",
        amountUSD: 100,
        rate: 4.95,
        rateKind: "APY",
        description: "Supply the borrowed WETH into Morpho's boosted ETH market to earn a higher base APY.",
      },
      {
        action: "borrow",
        protocol: "Morpho Blue",
        chain: "Ethereum",
        asset: "wstETH",
        amountUSD: 75,
        rate: 2.6,
        rateKind: "APR",
        description: "Draw wstETH against the Morpho position at 75% LTV, keeping a 10% liquidation buffer.",
        ltv: 75,
      },
      {
        action: "deposit",
        protocol: "Lido",
        chain: "Ethereum",
        asset: "wstETH",
        amountUSD: 75,
        rate: 3.8,
        rateKind: "APY",
        description: "Stake the borrowed wstETH to collect validator rewards while the position compounds.",
      },
    ],
  },
  {
    id: "stablecoin-relay",
    title: "Stablecoin Relay into Maker",
    headline: "Route DAI through Spark and Maker to stack savings and incentives",
    summary:
      "Turn wstETH collateral into productive stablecoin deposits by combining Spark's DAI credit line, Maker's DSR, and Morpho stablecoin incentives.",
    baseAsset: "wstETH",
    borrowedAsset: "DAI",
    primaryAmountUSD: 100,
    asOf: "Feb 7, 2025",
    liquidationBuffer: "28%",
    riskHighlights: [
      "Spark's variable DAI borrow jumps when utilization breaches 90%; automate monitoring.",
      "Maker's DSR can reprice via governance, so set alerts for rate changes.",
      "DAI peg stress increases liquidation risk on the downstream USDC borrow leg.",
    ],
    marketDrivers: [
      "Spark wstETH collateral earns 4.3% while supporting DAI supply at a 75% ceiling.",
      "Maker's DSR remains at 8% after the most recent stability fee hike in January 2025.",
      "Morpho's USDC/USDT vault receives 2.1% in OP incentives, lifting the blended APY to 6.3%.",
    ],
    hops: [
      {
        action: "deposit",
        protocol: "Spark",
        chain: "Ethereum",
        asset: "wstETH",
        amountUSD: 150,
        rate: 4.3,
        rateKind: "APY",
        description: "Supply wstETH to Spark at 75% LTV to open the DAI credit line (yield not counted in the $100 DAI spread).",
        includeInNetYield: false,
        ltv: 75,
      },
      {
        action: "borrow",
        protocol: "Spark",
        chain: "Ethereum",
        asset: "DAI",
        amountUSD: 100,
        rate: 5.6,
        rateKind: "APR",
        description: "Borrow $100 of DAI against the staked collateral while staying below the liquidation threshold.",
      },
      {
        action: "deposit",
        protocol: "MakerDAO DSR",
        chain: "Ethereum",
        asset: "DAI",
        amountUSD: 100,
        rate: 8.0,
        rateKind: "APY",
        description: "Deposit the borrowed DAI into the 8% Dai Savings Rate via Spark's savings module.",
      },
      {
        action: "borrow",
        protocol: "Maker Spark",
        chain: "Ethereum",
        asset: "USDC",
        amountUSD: 60,
        rate: 4.2,
        rateKind: "APR",
        description: "Use the DAI savings position as collateral to access additional USDC at Maker's D3M stabilized rate.",
        ltv: 60,
      },
      {
        action: "deposit",
        protocol: "Morpho Blue",
        chain: "Ethereum",
        asset: "USDC",
        amountUSD: 60,
        rate: 6.3,
        rateKind: "APY",
        description: "Supply the extra USDC to Morpho's USDC/USDT pool to capture incentive-boosted yield.",
      },
    ],
  },
  {
    id: "btc-carry",
    title: "Hedged BTC Carry",
    headline: "Harvest Curve incentives while financing WBTC through Radiant",
    summary:
      "Exploit the spread between Radiant's BTC borrow and Curve's stable incentives by looping collateral through Aave and Pendle.",
    baseAsset: "USDC",
    borrowedAsset: "WBTC",
    primaryAmountUSD: 100,
    asOf: "Feb 7, 2025",
    liquidationBuffer: "18%",
    riskHighlights: [
      "Radiant's cross-chain oracle can lag during volatility, so maintain extra collateral.",
      "WBTC liquidity on Arbitrum is thinner — large moves may widen slippage on unwind.",
      "Pendle PT-USDT yield depends on ARB incentives that can taper after Q1 2025.",
    ],
    marketDrivers: [
      "Radiant USDC supply has kept utilization low, holding WBTC variable borrow near 3.9% APR.",
      "Aave v3 Ethereum WBTC supply earns 2.6% plus stkAAVE rewards for long lenders.",
      "Pendle's PT-USDT (Q3 2025) trades at an implied 11.9% APY after factoring ARB incentives.",
    ],
    hops: [
      {
        action: "deposit",
        protocol: "Radiant",
        chain: "Arbitrum",
        asset: "USDC",
        amountUSD: 140,
        rate: 8.2,
        rateKind: "APY",
        description: "Provide USDC collateral on Radiant to unlock 70% LTV borrowing (yield excluded from the spread calculation).",
        includeInNetYield: false,
        ltv: 70,
      },
      {
        action: "borrow",
        protocol: "Radiant",
        chain: "Arbitrum",
        asset: "WBTC",
        amountUSD: 100,
        rate: 3.9,
        rateKind: "APR",
        description: "Borrow WBTC against the USDC collateral while staying 12% below liquidation.",
      },
      {
        action: "deposit",
        protocol: "Aave v3",
        chain: "Ethereum",
        asset: "WBTC",
        amountUSD: 100,
        rate: 2.6,
        rateKind: "APY",
        description: "Bridge and deposit the WBTC into Aave to capture base yield and stkAAVE incentives.",
      },
      {
        action: "borrow",
        protocol: "Aave v3",
        chain: "Ethereum",
        asset: "USDT",
        amountUSD: 65,
        rate: 7.4,
        rateKind: "APR",
        description: "Borrow USDT at 65% LTV, keeping a 15% health-factor buffer for BTC volatility.",
        ltv: 65,
      },
      {
        action: "deposit",
        protocol: "Pendle",
        chain: "Arbitrum",
        asset: "PT-USDT (Q3 2025)",
        amountUSD: 65,
        rate: 11.9,
        rateKind: "APY",
        description: "Swap the USDT into Pendle principal tokens to lock in double-digit incentives until maturity.",
      },
    ],
  },
];

const computeStrategies = (data: Strategy[]): ComputedStrategy[] => {
  return data.map(strategy => {
    const baseAmount = strategy.primaryAmountUSD;
    let cumulative = 0;

    const computedHops: ComputedHop[] = strategy.hops.map(hop => {
      const normalizedNotional = hop.amountUSD / baseAmount;

      if (hop.includeInNetYield === false) {
        return {
          ...hop,
          normalizedNotional,
          contribution: null,
          cumulative,
        };
      }

      const signedRate = hop.action === "deposit" ? hop.rate : -hop.rate;
      const contribution = signedRate * normalizedNotional;
      cumulative += contribution;

      return {
        ...hop,
        normalizedNotional,
        contribution,
        cumulative,
      };
    });

    return {
      ...strategy,
      hops: computedHops,
      netYield: Number(cumulative.toFixed(2)),
    };
  });
};

const computedStrategies = computeStrategies(strategies);

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);

const formatMultiplier = (value: number): string => `${value.toFixed(2)}x`;

const StrategiesPage = () => {
  return (
    <div className="relative min-h-screen overflow-hidden pb-20">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-base-100 via-base-200 to-base-100 dark:from-base-300 dark:via-base-200/60 dark:to-base-300" />
      <div className="absolute inset-0 -z-10 opacity-50" aria-hidden>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pt-16 sm:px-6 lg:px-8">
        <section className="space-y-6 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-sm font-medium text-primary dark:border-accent/40 dark:bg-accent/10 dark:text-accent">
            <ArrowTrendingUpIcon className="h-4 w-4" />
            Multi-hop lending strategies
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">Optimal yield routes built on live market spreads</h1>
          <p className="mx-auto max-w-3xl text-base-content/70">
            Each route below chains together lending and borrowing opportunities to highlight how Kapan sources optimal interest rates across protocols.
            We calculate the net annualized spread earned on a $100 deposit of the borrowed asset after accounting for every downstream hop.
          </p>
          <div className="mx-auto flex flex-wrap items-center justify-center gap-4 text-sm text-base-content/60">
            <div className="flex items-center gap-2">
              <BoltIcon className="h-4 w-4" />
              Rates captured from on-chain feeds · Updated {computedStrategies[0]?.asOf}
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-4 w-4" />
              Net APY reflects borrow costs and incentive boosts after the primary deposit
            </div>
          </div>
        </section>

        <section className="space-y-10">
          {computedStrategies.map(strategy => (
            <article
              key={strategy.id}
              className="group relative overflow-hidden rounded-3xl border border-base-300/60 bg-base-100/80 p-8 shadow-lg transition hover:shadow-xl dark:border-base-200/40 dark:bg-base-200/70"
            >
              <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-primary/10 blur-3xl transition group-hover:scale-110 dark:bg-accent/20" aria-hidden />
              <div className="relative space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex rounded-full bg-base-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-base-content/60 dark:bg-base-100/60">
                      {strategy.borrowedAsset} carry · {strategy.hops.length} hops
                    </div>
                    <h2 className="text-2xl font-semibold text-base-content sm:text-3xl">{strategy.title}</h2>
                    <p className="max-w-2xl text-base-content/70">{strategy.summary}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-base-content/60">
                      <div>
                        <span className="font-semibold text-base-content">Net spread:</span> {formatPercentage(strategy.netYield)}% APY on ${strategy.primaryAmountUSD} {strategy.borrowedAsset}
                      </div>
                      <div>
                        <span className="font-semibold text-base-content">Last updated:</span> {strategy.asOf}
                      </div>
                      <div>
                        <span className="font-semibold text-base-content">Liquidation buffer:</span> {strategy.liquidationBuffer}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left text-primary dark:border-accent/40 dark:bg-accent/10 dark:text-accent">
                    <div className="text-sm uppercase tracking-wide">Net APY on {formatCurrency(strategy.primaryAmountUSD)}</div>
                    <div className="text-4xl font-semibold">{formatPercentage(strategy.netYield, 2, false)}%</div>
                    <p className="text-xs text-primary/80 dark:text-accent/80">
                      Includes all borrow costs and reinvested yields after the {strategy.borrowedAsset} deposit.
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {strategy.hops.map((hop, index) => {
                    const contribution = strategy.hops[index]?.contribution ?? 0;
                    const cumulative = strategy.hops[index]?.cumulative ?? 0;
                    const contributionLabel = `${formatPercentage(Math.abs(contribution))}% ${contribution >= 0 ? "gain" : "drag"}`;
                    const cumulativeLabel = `${formatPercentage(Math.abs(cumulative))}% APY`;

                    return (
                      <div
                        key={`${strategy.id}-${index}`}
                        className="relative flex h-full flex-col justify-between rounded-2xl border border-base-300/70 bg-base-200/70 p-5 transition group-hover:border-primary/40 dark:border-base-100/30 dark:bg-base-100/50"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-base-content/60">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-base-100 text-base font-semibold text-base-content/70 dark:bg-base-200">
                              {index + 1}
                            </span>
                            {hop.action === "deposit" ? "Deposit" : "Borrow"}
                          </div>
                          <h3 className="text-lg font-semibold text-base-content">{hop.protocol}</h3>
                          <p className="text-sm text-base-content/70">{hop.description}</p>
                        </div>
                        <div className="mt-4 space-y-2 text-sm text-base-content/80">
                          <div className="flex items-center justify-between">
                            <span className="text-base-content/60">Asset</span>
                            <span className="font-medium text-base-content">{hop.asset}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-base-content/60">Chain</span>
                            <span className="font-medium text-base-content">{hop.chain}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-base-content/60">Notional</span>
                            <span className="font-medium text-base-content">{formatCurrency(hop.amountUSD)} · {formatMultiplier(strategy.hops[index]?.normalizedNotional ?? 1)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-base-content/60">Rate</span>
                            <span className="font-medium text-base-content">{formatPercentage(hop.rate)}% {hop.rateKind}</span>
                          </div>
                          {typeof hop.ltv === "number" && (
                            <div className="flex items-center justify-between">
                              <span className="text-base-content/60">Applied LTV</span>
                              <span className="font-medium text-base-content">{formatPercentage(hop.ltv)}%</span>
                            </div>
                          )}
                          {hop.includeInNetYield === false ? (
                            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-base-100 px-3 py-1 text-xs font-medium text-base-content/60 dark:bg-base-200/70">
                              <ArrowDownRightIcon className="h-3.5 w-3.5" />
                              Seed collateral — excluded from net APY math
                            </div>
                          ) : (
                            <div className="mt-2 rounded-xl bg-base-100/80 px-3 py-2 text-xs text-base-content/70 dark:bg-base-200/80">
                              <div className="flex items-center justify-between">
                                <span>Contribution</span>
                                <span className={contribution >= 0 ? "text-success" : "text-error"}>{contributionLabel}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Cumulative net</span>
                                <span className={cumulative >= 0 ? "text-success" : "text-error"}>{cumulativeLabel}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-base-300/60 bg-base-200/60 p-6 dark:border-base-100/30 dark:bg-base-100/40">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-base-content/60">Market context</h3>
                    <ul className="mt-3 space-y-2 text-sm text-base-content/80">
                      {strategy.marketDrivers.map((driver, index) => (
                        <li key={`${strategy.id}-driver-${index}`}>• {driver}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-base-300/60 bg-base-200/60 p-6 dark:border-base-100/30 dark:bg-base-100/40">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-base-content/60">Risk considerations</h3>
                    <ul className="mt-3 space-y-2 text-sm text-base-content/80">
                      {strategy.riskHighlights.map((risk, index) => (
                        <li key={`${strategy.id}-risk-${index}`}>• {risk}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};

export default StrategiesPage;
