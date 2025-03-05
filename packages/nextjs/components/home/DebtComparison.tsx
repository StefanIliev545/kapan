import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FiTrendingDown, FiArrowRight, FiDollarSign, FiPercent } from "react-icons/fi";
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

  // Find Aave and Compound rates
  const aaveProtocol = tokenData.protocols.find(p => p.name === "Aave V3");
  const compoundProtocol = tokenData.protocols.find(p => p.name === "Compound V3");
  const aaveRate = aaveProtocol?.rate || 0;
  const compoundRate = compoundProtocol?.rate || 0;

  // Calculate savings
  const annualInterestAave = tokenData.totalDebt * (aaveRate / 100);
  const annualInterestCompound = tokenData.totalDebt * (compoundRate / 100);
  const totalSavings = annualInterestAave - annualInterestCompound;
  const savingsPercentage = aaveRate > 0 ? (((aaveRate - compoundRate) / aaveRate) * 100).toFixed(1) : "0.0";

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
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xl">
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
                  <Image src={tokenNameToLogo(tokenData.symbol)} alt={tokenData.symbol} fill className="object-contain" />
                </motion.div>
              </AnimatePresence>
            </div>
            <AnimatedValue>{tokenData.symbol}</AnimatedValue>
            <span>debt on</span>
            <div className="w-5 h-5 relative">
              <Image src="/logos/aave.svg" alt="Aave" fill className="object-contain" />
            </div>
            <span>Aave on</span>
            <div className="w-4 h-4 relative">
              <Image src="/logos/arb.svg" alt="Arbitrum" fill className="object-contain" />
            </div>
            <span>Arbitrum:</span>
            <AnimatedValue className="text-xl font-bold">
              ${formatNumber(tokenData.totalDebt)}
            </AnimatedValue>
          </div>
        </div>
      </div>

      {/* Protocol Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Higher Rate Protocol */}
        <div className="card bg-base-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="avatar">
              <div className="w-8 h-8 rounded-full bg-base-100 p-1 shadow-sm border border-base-300">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={aaveRate > compoundRate ? "aave" : "compound"}
                    initial={{ rotate: -180, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 180, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    <Image 
                      src={aaveRate > compoundRate ? "/logos/aave.svg" : "/logos/compound.svg"} 
                      alt={aaveRate > compoundRate ? "Aave" : "Compound"} 
                      width={24} 
                      height={24} 
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div>
              <AnimatedValue className="font-semibold">
                Currently on {aaveRate > compoundRate ? "Aave" : "Compound"}
              </AnimatedValue>
              <div className="text-sm text-base-content/70">Variable Rate</div>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base-content/70 flex items-center gap-1">
              <FiPercent className="w-4 h-4" />
              Annual Interest
            </div>
            <AnimatedValue className="text-2xl font-bold">
              {Math.max(aaveRate, compoundRate).toFixed(2)}%
            </AnimatedValue>
            <AnimatedValue className="text-base-content/70 mt-1">
              ${formatNumber(Math.max(annualInterestAave, annualInterestCompound))} per year
            </AnimatedValue>
          </div>
        </div>

        {/* Lower Rate Protocol */}
        <div className="card bg-base-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="avatar">
              <div className="w-8 h-8 rounded-full bg-base-100 p-1 shadow-sm border border-base-300">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={aaveRate > compoundRate ? "compound" : "aave"}
                    initial={{ rotate: -180, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 180, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    <Image 
                      src={aaveRate > compoundRate ? "/logos/compound.svg" : "/logos/aave.svg"} 
                      alt={aaveRate > compoundRate ? "Compound" : "Aave"} 
                      width={24} 
                      height={24} 
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div>
              <AnimatedValue className="font-semibold">
                Available on {aaveRate > compoundRate ? "Compound" : "Aave"}
              </AnimatedValue>
              <div className="text-sm text-base-content/70">Variable Rate</div>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base-content/70">Annual Interest</div>
            <AnimatedValue className="text-2xl font-bold text-primary">
              {Math.min(aaveRate, compoundRate).toFixed(2)}%
            </AnimatedValue>
            <AnimatedValue className="text-base-content/70 mt-1">
              ${formatNumber(Math.min(annualInterestAave, annualInterestCompound))} per year
            </AnimatedValue>
          </div>
        </div>
      </div>

      {/* Savings Card */}
      <div className="card bg-base-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
            <FiTrendingDown className="w-5 h-5 text-success" />
          </div>
          <div className="font-semibold">Your Potential Savings</div>
        </div>
        <div className="mt-2">
          <AnimatedValue className="text-3xl font-bold text-success">
            Save ${formatNumber(totalSavings)} per year
          </AnimatedValue>
          <AnimatedValue className="text-base-content/70 mt-1">
            {savingsPercentage}% reduction in borrowing costs
          </AnimatedValue>
        </div>
        <Link href="/app" className="mt-4" passHref>
          <button className="btn btn-primary w-full">Start Saving Now</button>
        </Link>
      </div>
    </div>
  );
};

export default DebtComparison;
