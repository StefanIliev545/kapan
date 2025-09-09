import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { FiDollarSign, FiPercent, FiTrendingDown } from "react-icons/fi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useTokenData } from "~~/hooks/useTokenData";
import { formatNumber } from "~~/utils/formatNumber";

const AnimatedValue = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className="relative overflow-hidden">
    <AnimatePresence mode="wait">
      <motion.div
        key={children?.toString()}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  </div>
);

const DebtComparison = () => {
  const tokenData = useTokenData();
  const [starknetRate, setStarknetRate] = useState(0);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const res = await fetch("https://yields.llama.fi/pools");
        const data = await res.json();
        const pools = data.data.filter(
          (p: any) => p.chain === "Starknet" && p.symbol.toUpperCase() === tokenData.symbol.toUpperCase(),
        );
        if (pools.length) {
          const highest = pools.sort((a: any, b: any) => b.apy - a.apy)[0];
          setStarknetRate(highest.apy);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchRate();
  }, [tokenData.symbol]);

  // Find rates from all supported protocols
  const aaveProtocol = tokenData.protocols.find(p => p.name === "Aave V3");
  const compoundProtocol = tokenData.protocols.find(p => p.name === "Compound V3");
  const venusProtocol = tokenData.protocols.find(p => p.name === "Venus");
  
  const aaveRate = aaveProtocol?.rate || 0;
  const compoundRate = compoundProtocol?.rate || 0;
  const venusRate = venusProtocol?.rate || 0;

  // Find the protocol with the highest rate
  const ratesByProtocol = [
    { name: "Aave", rate: aaveRate, logo: "/logos/aave.svg" },
    { name: "Compound", rate: compoundRate, logo: "/logos/compound.svg" },
    { name: "Venus", rate: venusRate, logo: "/logos/venus.svg" },
  ];
  if (starknetRate > 0) {
    ratesByProtocol.push({ name: "Nostra", rate: starknetRate, logo: "/logos/nostra.svg" });
  }

  // Sort protocols by rate (highest first)
  const sortedProtocols = [...ratesByProtocol].sort((a, b) => b.rate - a.rate);
  
  // Get highest and lowest rate protocols
  const highestRateProtocol = sortedProtocols[0];
  const lowestRateProtocol = sortedProtocols[sortedProtocols.length - 1];

  const getNetworkInfo = (protocolName: string) => {
    if (protocolName === "Nostra") {
      return { logo: "/logos/starknet.svg", name: "Starknet" };
    }
    return { logo: "/logos/arb.svg", name: "Arbitrum" };
  };
  const networkInfo = getNetworkInfo(highestRateProtocol.name);
  
  // Calculate savings 
  const higherRate = highestRateProtocol.rate;
  const lowerRate = lowestRateProtocol.rate;
  const currentDebt = tokenData.totalDebt;
  const annualInterestHigher = currentDebt * (higherRate / 100);
  const annualInterestLower = currentDebt * (lowerRate / 100);
  const totalSavings = Math.abs(annualInterestHigher - annualInterestLower);
  const savingsPercentage = higherRate > 0 ? (((higherRate - lowerRate) / higherRate) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FiDollarSign className="w-6 h-6" />
          Protocol Interest Rate Comparison
        </h2>
      </div>

      {/* Total Debt Position with Token Icon */}
      <div className="flex items-center gap-6 mb-6">
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xl min-h-[4rem]">
            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <span>Total</span>
              <div className="w-5 h-5 relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tokenData.symbol}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    <Image
                      src={tokenNameToLogo(tokenData.symbol)}
                      alt={tokenData.symbol}
                      fill
                      className="object-contain"
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
              <AnimatedValue>{tokenData.symbol}</AnimatedValue>
              <span>debt on</span>
            </div>
            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <div className="w-5 h-5 relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={highestRateProtocol.name.toLowerCase()}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    <Image
                      src={highestRateProtocol.logo}
                      alt={highestRateProtocol.name}
                      fill
                      className="object-contain"
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
              <AnimatedValue>{highestRateProtocol.name}</AnimatedValue>
              <span>on</span>
              <div className="w-4 h-4 relative">
                <Image src={networkInfo.logo} alt={networkInfo.name} fill className="object-contain" />
              </div>
              <span>{networkInfo.name}:</span>
            </div>
            <div className="inline-flex items-center">
              <AnimatedValue className="text-xl font-bold whitespace-nowrap">
                ${formatNumber(tokenData.totalDebt)}
              </AnimatedValue>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Higher Rate Protocol */}
        <div className="card bg-base-200 dark:bg-base-300/30 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="avatar">
              <div className="w-8 h-8 rounded-lg bg-base-100 dark:bg-base-300 p-1 shadow-sm border border-base-300 dark:border-base-content/10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={highestRateProtocol.name.toLowerCase()}
                    initial={{ rotate: -180, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 180, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    <Image
                      src={highestRateProtocol.logo}
                      alt={highestRateProtocol.name}
                      width={24}
                      height={24}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div>
              <AnimatedValue className="font-semibold text-base-content">
                Currently on {highestRateProtocol.name}
              </AnimatedValue>
              <div className="text-sm text-base-content/70">Variable Rate</div>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base-content/70 flex items-center gap-1">
              <FiPercent className="w-4 h-4" />
              Annual Interest
            </div>
            <AnimatedValue className="text-2xl font-bold text-base-content">{higherRate.toFixed(2)}%</AnimatedValue>
            <AnimatedValue className="text-base-content/70 mt-1">
              ${formatNumber(annualInterestHigher)} per year
            </AnimatedValue>
          </div>
        </div>

        {/* Lower Rate Protocol */}
        <div className="card bg-base-200 dark:bg-base-300/30 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="avatar">
              <div className="w-8 h-8 rounded-lg bg-base-100 dark:bg-base-300 p-1 shadow-sm border border-base-300 dark:border-base-content/10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={lowestRateProtocol.name.toLowerCase()}
                    initial={{ rotate: -180, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 180, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    <Image
                      src={lowestRateProtocol.logo}
                      alt={lowestRateProtocol.name}
                      width={24}
                      height={24}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div>
              <AnimatedValue className="font-semibold text-base-content">
                Available on {lowestRateProtocol.name}
              </AnimatedValue>
              <div className="text-sm text-base-content/70">Variable Rate</div>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base-content/70">Annual Interest</div>
            <AnimatedValue className="text-2xl font-bold text-primary dark:text-accent">
              {lowerRate.toFixed(2)}%
            </AnimatedValue>
            <AnimatedValue className="text-base-content/70 mt-1">
              ${formatNumber(annualInterestLower)} per year
            </AnimatedValue>
          </div>
        </div>
      </div>

      {/* Savings Card */}
      <div className="card bg-base-200 dark:bg-base-300/30 p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-success/10 dark:bg-success/20 flex items-center justify-center">
            <FiTrendingDown className="w-5 h-5 text-success" />
          </div>
          <div className="font-semibold text-base-content">Your Potential Savings</div>
        </div>
        <div className="mt-2">
          <AnimatedValue className="text-3xl font-bold text-success">
            Save ${formatNumber(totalSavings)} per year
          </AnimatedValue>
          <AnimatedValue className="mt-1">
            <div className="text-xl font-bold bg-gradient-to-r from-primary via-success to-primary dark:from-accent dark:via-success dark:to-accent bg-[length:200%_100%] animate-gradient-x bg-clip-text text-transparent">
              {savingsPercentage}% reduction in borrowing costs
            </div>
          </AnimatedValue>
        </div>
        <Link href="/app" className="mt-4" passHref>
          <button className="btn btn-primary dark:bg-accent dark:border-accent/70 dark:text-accent-content dark:hover:bg-accent/80 w-full">Start Saving Now</button>
        </Link>
      </div>
    </div>
  );
};

export default DebtComparison;
