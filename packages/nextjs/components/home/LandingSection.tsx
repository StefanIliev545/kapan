"use client";

import { ProtocolView } from "../ProtocolView";
import { motion } from "framer-motion";
import { Heading } from "@radix-ui/themes";




const LandingSection = () => {
  return (
    <section className="w-full pt-3 pb-3 lg:py-5 relative overflow-hidden bg-gradient-to-b from-base-100 to-base-200 dark:from-base-200 dark:to-base-300">
      <div className="container mx-auto px-5 relative">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.6 }}
        >
          <Heading
            as="h1"
            size="9"
            weight="bold"
            align="center"
            className="font-extrabold font-display mb-4 tracking-tight text-gradient bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent drop-shadow-md"
          >
            Lend everywhere. <br className="hidden md:inline" />
            <span className="text-primary">Borrow anytime.</span>
            <br className="hidden md:inline" />
            All in Kapan.
          </Heading>
        </motion.div>
        <div className="relative fade-bottom-mask">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut", delay: 1.2 }}>
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
          />
          </motion.div>
          <div className="mt-1" />
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut", delay: 1.8 }}>
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
          />
          </motion.div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 md:h-32 bg-gradient-to-b from-transparent to-base-200 dark:to-base-300" />
        </div>
      </div>
    </section>
  );
};

export default LandingSection;


