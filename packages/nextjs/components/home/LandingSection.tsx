"use client";

import { useEffect, useState } from "react";
import { ProtocolView } from "../ProtocolView";
import { motion } from "framer-motion";
import { FiArrowDown } from "react-icons/fi";
import { useWalletConnection } from "~~/hooks/useWalletConnection";

const LandingSection = () => {
  const { starknet } = useWalletConnection();
  const [hasStarknetWallet, setHasStarknetWallet] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const anyWin = window as any;
    const detected = Boolean(anyWin?.starknet) || Boolean(anyWin?.argentX) || Boolean(anyWin?.braavos);
    setHasStarknetWallet(detected || Boolean(starknet.isConnected));
  }, [starknet.isConnected]);

  return (
    <section className="w-full pt-8 pb-4 lg:pt-12 lg:pb-6 relative overflow-hidden bg-gradient-to-b from-base-100 to-base-200 dark:from-base-200 dark:to-base-300">

      <div className="container mx-auto max-w-screen-2xl px-5 relative">
        {/* Hero Header */}
        <div className="text-center mb-8 lg:mb-12">
          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4"
          >
            <span className="text-base-content">One Dashboard.</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Every Protocol.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="text-base sm:text-lg text-base-content/60 max-w-xl mx-auto leading-relaxed"
          >
            Manage, compare, and optimize your lending positions across Aave, Compound, Vesu, and more. 
            Move debt to better rates with a single click.
          </motion.p>

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.5 }}
            className="hidden lg:flex justify-center mt-6"
          >
            <motion.div 
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="flex flex-col items-center gap-1 text-base-content/30"
            >
              <span className="text-[10px] uppercase tracking-widest font-medium">Preview</span>
              <FiArrowDown className="w-4 h-4" />
            </motion.div>
          </motion.div>
        </div>

        {/* Protocol Views Demo */}
        <div className="relative fade-bottom-mask">
          {hasStarknetWallet ? (
            <>
              <motion.div 
                initial={{ opacity: 0, y: 16 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.8 }}
              >
                <ProtocolView
                  protocolName="Vesu"
                  protocolIcon="/logos/vesu.svg"
                  ltv={62}
                  maxLtv={80}
                  suppliedPositions={[
                    { icon: "/logos/usdc.svg", name: "USDC", tokenPrice: 100000000n, balance: 12000, tokenBalance: BigInt(12000 * 10 ** 6), currentRate: 3.1, tokenAddress: "0x01", tokenDecimals: 6 },
                  ]}
                  borrowedPositions={[
                    { icon: "/logos/usdt.svg", name: "USDT", tokenPrice: 100000000n, balance: -8000, tokenBalance: BigInt(8000 * 10 ** 6), currentRate: 4.3, tokenAddress: "0x02", tokenDecimals: 6 },
                  ]}
                  networkType="starknet"
                  readOnly
                  forceShowAll
                  expandFirstPositions={false}
                />
              </motion.div>
              <div className="mt-2" />
              <motion.div 
                initial={{ opacity: 0, y: 18 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.5, ease: "easeOut", delay: 1.1 }}
              >
                <ProtocolView
                  protocolName="Nostra"
                  protocolIcon="/logos/nostra.svg"
                  ltv={58}
                  maxLtv={75}
                  suppliedPositions={[
                    { icon: "/logos/weth.svg", name: "ETH", tokenPrice: 320000000000n, balance: 3200, tokenBalance: BigInt(1 * 10 ** 18), currentRate: 2.7, tokenAddress: "0x03", tokenDecimals: 18 },
                  ]}
                  borrowedPositions={[
                    { icon: "/logos/usdc.svg", name: "USDC", tokenPrice: 100000000n, balance: -1200, tokenBalance: BigInt(1200 * 10 ** 6), currentRate: 4.0, tokenAddress: "0x04", tokenDecimals: 6 },
                  ]}
                  networkType="starknet"
                  readOnly
                  forceShowAll
                  expandFirstPositions={false}
                />
              </motion.div>
            </>
          ) : (
            <>
              <motion.div 
                initial={{ opacity: 0, y: 16 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.8 }}
              >
                <ProtocolView
                  protocolName="Aave"
                  protocolIcon="/logos/aave.svg"
                  ltv={65}
                  maxLtv={80}
                  suppliedPositions={[
                    { icon: "/logos/eth.svg", name: "ETH", tokenPrice: 425000000000n, balance: 5240.21, tokenBalance: BigInt(5.5 * 10 ** 18), currentRate: 2.8, tokenAddress: "0x0000000000000000000000000000000000000000", tokenDecimals: 18 },
                  ]}
                  borrowedPositions={[
                    { icon: "/logos/dai.svg", name: "DAI", tokenPrice: 1000000000n, balance: -1800.5, tokenBalance: BigInt(1800.5 * 10 ** 6), currentRate: 4.1, tokenAddress: "0x0000000000000000000000000000000000000000" },
                  ]}
                  networkType="evm"
                  readOnly
                  forceShowAll
                  expandFirstPositions={false}
                />
              </motion.div>
              <div className="mt-2" />
              <motion.div 
                initial={{ opacity: 0, y: 18 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.5, ease: "easeOut", delay: 1.1 }}
              >
                <ProtocolView
                  protocolName="Compound"
                  protocolIcon="/logos/compound.svg"
                  ltv={60}
                  maxLtv={75}
                  suppliedPositions={[
                    { icon: "/logos/usdc.svg", name: "USDC", tokenPrice: 100000000n, balance: 1250.0, tokenBalance: BigInt(750 * 10 ** 6), currentRate: 3.2, tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", tokenDecimals: 6 },
                  ]}
                  borrowedPositions={[
                    { icon: "/logos/usdt.svg", name: "USDT", tokenPrice: 100000000n, balance: -420.0, tokenBalance: BigInt(420 * 10 ** 6), currentRate: 4.6, tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", tokenDecimals: 6 },
                  ]}
                  networkType="evm"
                  readOnly
                  forceShowAll
                  expandFirstPositions={false}
                />
              </motion.div>
            </>
          )}
          {/* Fade overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-base-200 dark:to-base-300" />
        </div>
      </div>
    </section>
  );
};

export default LandingSection;
