"use client";

import Image from "next/image";
import type { NextPage } from "next";
import { ArrowsRightLeftIcon, BoltIcon, CogIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

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
}) => (
  <div className="card bg-base-100 shadow-xl">
    <div className="card-body">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-primary/10 p-3">{icon}</div>
        <div>
          <h3 className="card-title flex items-center gap-2">
            {title}
            {comingSoon && <span className="badge badge-secondary text-xs">Coming Soon</span>}
          </h3>
          <p className="mt-2 text-base-content/70">{description}</p>
        </div>
      </div>
    </div>
  </div>
);

const Automate: NextPage = () => {
  return (
    <div className="flex flex-col items-center pt-10">
      <div className="px-5 max-w-6xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Automated Position Management</h1>
          <p className="text-xl text-base-content/70 max-w-2xl mx-auto">
            Let Kapan automatically manage your positions across protocols to minimize interest rates and maximize
            returns while keeping your assets safe.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AutomationFeature
            title="Rate Optimization"
            description="Automatically move your debt between lending protocols to always get the lowest interest rate. Set your preferences and let Kapan handle the rest."
            icon={<BoltIcon className="w-6 h-6 text-primary" />}
          />

          <AutomationFeature
            title="Smart Rebalancing"
            description="Automatically rebalance your collateral across protocols based on market conditions and liquidation risks. Maintain optimal health factors at all times."
            icon={<ArrowsRightLeftIcon className="w-6 h-6 text-primary" />}
          />

          <AutomationFeature
            title="Liquidation Protection"
            description="Set up automated safety measures to prevent liquidations. Kapan will monitor your positions 24/7 and take action if your health factor drops too low."
            icon={<ShieldCheckIcon className="w-6 h-6 text-primary" />}
          />

          <AutomationFeature
            title="Custom Strategies"
            description="Create your own automation strategies with custom conditions and actions. Combine multiple features to build the perfect automation for your needs."
            icon={<CogIcon className="w-6 h-6 text-primary" />}
          />
        </div>

        <div className="mt-12 card bg-primary text-primary-content">
          <div className="card-body items-center text-center">
            <h2 className="card-title">Stay Updated on Automation Features</h2>
            <p>
              Follow us on Twitter for announcements when these automation features launch. We&apos;ll post regular
              updates on our development progress, feature releases, and early access opportunities.
            </p>
            <div className="card-actions mt-4">
              <a
                href="https://x.com/KapanFinance"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary gap-2"
              >
                <Image src="/logos/x-logo.svg" alt="X Logo" width={16} height={16} className="w-5 h-5" />
                Follow @KapanFinance
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Automate;
