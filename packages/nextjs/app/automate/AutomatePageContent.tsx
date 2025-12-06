"use client";

import Image from "next/image";
import type { NextPage } from "next";
import { useState } from "react";
import { ArrowsRightLeftIcon, BoltIcon, CogIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import TransactionFeed from "../../components/TransactionFeed";

// Temporarily disabled the InteractiveDemo
// import InteractiveDemo from "../../components/automate/InteractiveDemo";

// High-tech feature card with hover effects
const AutomationFeature = ({
  title,
  description,
  icon,
  comingSoon = true,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative overflow-hidden group border border-base-300 bg-gradient-to-br from-base-100 to-base-200"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Glowing border effect on hover */}
      <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${isHovered ? "opacity-100" : "opacity-0"}`}>
        <div className="absolute inset-0 border border-primary/60 z-10"></div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"></div>
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary to-transparent"></div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"></div>
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-primary to-transparent"></div>
      </div>

      {/* Content area */}
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-base-300 text-primary dark:text-accent">{icon}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-base-content">{title}</h3>
              {comingSoon && (
                <div className="bg-base-300 px-2 py-0.5">
                  <span className="text-xs uppercase tracking-wider font-mono text-primary-focus dark:text-accent">Coming Soon</span>
                </div>
              )}
            </div>
            <div className="h-px w-full bg-gradient-to-r from-primary/20 to-transparent mb-3"></div>
            <p className="text-base-content/80">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const AutomatePageContent: NextPage = () => {
  return (
    <div className="flex flex-col items-center min-h-screen relative">
      {/* Background transaction feed with increased blur */}
      <div className="fixed inset-0 -z-10 backdrop-blur-xl">
        <TransactionFeed />
      </div>

      {/* Dark overlay for better contrast */}
      <div className="fixed inset-0 bg-base-300 opacity-80 -z-5"></div>

      {/* Main content */}
      <div className="relative z-10 container max-w-6xl mx-auto px-4 py-12">
        {/* Header section with tech-style border */}
        <div className="relative mb-16 px-6 py-8 border-l-2 border-primary">
          <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
          <div className="absolute top-0 left-2 w-12 h-px bg-primary"></div>
          <div className="absolute bottom-0 left-2 w-12 h-px bg-primary"></div>

          <h1 className="text-5xl font-bold mb-6 leading-tight text-base-content">
            Automated <br />
            <span className="text-primary dark:text-accent">Position Management</span>
          </h1>
          <p className="text-xl max-w-2xl leading-relaxed text-base-content">
            Let Kapan automatically manage your positions across protocols to minimize interest rates and maximize
            returns while keeping your assets safe.
          </p>
        </div>

        {/* Grid of features - MOVED UP BEFORE THE INTERACTIVE DEMO */}
        <div className="mb-16">
          <div className="relative mb-8 flex items-center">
            <div className="h-px flex-grow bg-base-300"></div>
            <h2 className="text-2xl font-bold px-4 text-base-content">Automation Features</h2>
            <div className="h-px flex-grow bg-base-300"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AutomationFeature
              title="Rate Optimization"
              description="Automatically move your debt between lending protocols to always get the lowest interest rate. Set your preferences and let Kapan handle the rest."
              icon={<BoltIcon className="w-6 h-6" />}
            />

            <AutomationFeature
              title="Smart Rebalancing"
              description="Automatically rebalance your collateral across protocols based on market conditions and liquidation risks. Maintain optimal health factors at all times."
              icon={<ArrowsRightLeftIcon className="w-6 h-6" />}
            />

            <AutomationFeature
              title="Liquidation Protection"
              description="Set up automated safety measures to prevent liquidations. Kapan will monitor your positions 24/7 and take action if your health factor drops too low."
              icon={<ShieldCheckIcon className="w-6 h-6" />}
            />

            <AutomationFeature
              title="Custom Strategies"
              description="Create your own automation strategies with custom conditions and actions. Combine multiple features to build the perfect automation for your needs."
              icon={<CogIcon className="w-6 h-6" />}
            />
          </div>
        </div>

        {/* Swap Demo section */}
        <div className="mb-16">
          <div className="relative mb-8 flex items-center">
            <div className="h-px flex-grow bg-base-300"></div>
            <h2 className="text-2xl font-bold px-4 text-base-content">Preview the Magic</h2>
            <div className="h-px flex-grow bg-base-300"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-base-content">See how Kapan automates your workflow</h3>
              <p className="text-base-content/80 leading-relaxed">
                Connect your wallet, choose a lending protocol, and set your target rates. Kapan will automatically move
                your position when better opportunities arise.
              </p>
              <div className="bg-base-300/50 border border-base-300 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <BoltIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-base-content/70">Trigger</p>
                    <p className="font-semibold text-base-content">Rate drops by 0.5%</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-base-100 p-3 rounded-lg border border-base-300">
                    <p className="text-base-content/70">From</p>
                    <p className="font-semibold text-base-content">Aave V3</p>
                    <p className="text-sm text-base-content/70">Base Network</p>
                  </div>
                  <div className="bg-base-100 p-3 rounded-lg border border-base-300">
                    <p className="text-base-content/70">To</p>
                    <p className="font-semibold text-base-content">Compound</p>
                    <p className="text-sm text-base-content/70">Base Network</p>
                  </div>
                  <div className="bg-base-100 p-3 rounded-lg border border-base-300">
                    <p className="text-base-content/70">Amount</p>
                    <p className="font-semibold text-base-content">$25,000 USDC</p>
                  </div>
                  <div className="bg-base-100 p-3 rounded-lg border border-base-300">
                    <p className="text-base-content/70">Execution</p>
                    <p className="font-semibold text-base-content">Flash loan migration</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20 blur-3xl"></div>
              <div className="relative bg-base-100 border border-base-300 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-base-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-success"></div>
                    <span className="text-sm font-semibold text-base-content">Strategy Active</span>
                  </div>
                  <div className="text-xs bg-base-300 px-3 py-1 rounded-full text-base-content">Automation</div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Image src="/logos/aave.svg" alt="Aave" width={32} height={32} />
                    </div>
                    <div>
                      <p className="text-sm text-base-content/70">Monitoring</p>
                      <p className="font-semibold text-base-content">Aave V3 Borrow Rate</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs text-base-content/70">Current</p>
                      <p className="font-semibold text-base-content">5.3%</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-base-300 bg-base-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm text-base-content/70">Trigger Condition</p>
                        <p className="font-semibold text-base-content">When rate drops below 4.8%</p>
                      </div>
                      <div className="flex items-center gap-2 text-success">
                        <div className="h-2 w-2 rounded-full bg-success"></div>
                        <span className="text-sm font-semibold">Armed</span>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-base-content/80">
                      <p>• Swap $25,000 USDC from Aave V3</p>
                      <p>• Move position to Compound with better APY</p>
                      <p>• Maintain 150% collateral ratio during migration</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="p-3 rounded-lg bg-base-200 border border-base-300">
                      <p className="text-base-content/70">Collateral</p>
                      <p className="font-semibold text-base-content">$125k ETH</p>
                    </div>
                    <div className="p-3 rounded-lg bg-base-200 border border-base-300">
                      <p className="text-base-content/70">Health Factor</p>
                      <p className="font-semibold text-base-content">1.9</p>
                    </div>
                    <div className="p-3 rounded-lg bg-base-200 border border-base-300">
                      <p className="text-base-content/70">Projected APR</p>
                      <p className="font-semibold text-base-content">+1.4%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 border border-base-300 bg-base-200 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <BoltIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-base-content/70">Fully Automated</p>
                <h3 className="text-xl font-semibold text-base-content">Set and Forget</h3>
              </div>
            </div>
            <p className="text-base-content/80">
              Configure once and let Kapan continuously monitor markets, executing migrations without manual intervention.
            </p>
          </div>

          <div className="p-6 border border-base-300 bg-base-200 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <ShieldCheckIcon className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-base-content/70">Non-Custodial</p>
                <h3 className="text-xl font-semibold text-base-content">You Keep Control</h3>
              </div>
            </div>
            <p className="text-base-content/80">
              Funds stay in your wallet or preferred protocols. Automation uses smart contracts to safely execute your
              strategy.
            </p>
          </div>

          <div className="p-6 border border-base-300 bg-base-200 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center">
                <CogIcon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-base-content/70">Configurable</p>
                <h3 className="text-xl font-semibold text-base-content">Custom Rules</h3>
              </div>
            </div>
            <p className="text-base-content/80">
              Define triggers, thresholds, and target protocols that match your risk tolerance and performance goals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomatePageContent;
