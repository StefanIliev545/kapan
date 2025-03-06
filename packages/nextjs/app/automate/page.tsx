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
      <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
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

const Automate: NextPage = () => {
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

        {/* Interactive Demo Section - Temporarily Disabled */}
        {/*
        <div className="mb-16">
          <div className="relative mb-8 flex items-center">
            <div className="h-px flex-grow bg-base-300"></div>
            <h2 className="text-2xl font-bold px-4 flex items-center">
              <BoltIcon className="w-5 h-5 mr-2 text-primary" />
              See It In Action
            </h2>
            <div className="h-px flex-grow bg-base-300"></div>
          </div>
          <InteractiveDemo />
        </div>
        */}

        {/* CTA section */}
        <div className="relative border border-primary/30 bg-base-100/20 backdrop-blur-sm">
          {/* Tech corner accents */}
          <div className="absolute top-0 left-0 w-4 h-px bg-primary"></div>
          <div className="absolute top-0 left-0 w-px h-4 bg-primary"></div>
          <div className="absolute top-0 right-0 w-4 h-px bg-primary"></div>
          <div className="absolute top-0 right-0 w-px h-4 bg-primary"></div>
          <div className="absolute bottom-0 left-0 w-4 h-px bg-primary"></div>
          <div className="absolute bottom-0 left-0 w-px h-4 bg-primary"></div>
          <div className="absolute bottom-0 right-0 w-4 h-px bg-primary"></div>
          <div className="absolute bottom-0 right-0 w-px h-4 bg-primary"></div>
          
          <div className="p-8 flex flex-col md:flex-row items-center justify-between">
            <div className="mb-6 md:mb-0 md:pr-8">
              <h2 className="text-2xl font-bold mb-3 flex items-center text-base-content">
                <span className="inline-block w-4 h-px bg-primary mr-2"></span>
                Stay Updated
              </h2>
              <p className="text-base-content/80 max-w-xl">
                Follow us on Twitter for announcements when these automation features launch. We&apos;ll post regular
                updates on our development progress and feature releases.
              </p>
            </div>
            <a
              href="https://x.com/KapanFinance"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary hover:bg-primary-focus text-primary-content dark:bg-accent dark:hover:bg-accent/80 flex items-center py-3 px-6 transition-all duration-300"
            >
              <Image src="/logos/x-logo.svg" alt="X Logo" width={18} height={18} className="mr-3" />
              <span className="font-medium">Follow @KapanFinance</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Automate;
