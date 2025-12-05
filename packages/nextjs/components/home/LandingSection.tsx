"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ProtocolView } from "../ProtocolView";
import { motion } from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import { useWalletConnection } from "~~/hooks/useWalletConnection";

const protocols = [
  { name: "Aave", logo: "/logos/aave.svg" },
  { name: "Compound", logo: "/logos/compound.svg" },
  { name: "Vesu", logo: "/logos/vesu.svg" },
  { name: "Nostra", logo: "/logos/nostra.svg" },
  { name: "Venus", logo: "/logos/venus.svg" },
  { name: "ZeroLend", logo: "/logos/zerolend.svg" },
  { name: "Starknet", logo: "/logos/starknet.svg" },
  { name: "Base", logo: "/logos/base.svg" },
];

// Duplicate for seamless loop
const duplicatedProtocols = [...protocols, ...protocols];

const ProtocolCarousel = () => {
  return (
    <div className="relative overflow-hidden flex-1 max-w-xs">
      <motion.div
        className="flex gap-4"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          x: {
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          },
        }}
      >
        {duplicatedProtocols.map((protocol, index) => (
          <div
            key={`${protocol.name}-${index}`}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            <div className="w-4 h-4 relative">
              <Image
                src={protocol.logo}
                alt={protocol.name}
                fill
                className="object-contain"
              />
            </div>
            <span className="text-xs font-medium text-base-content/60">
              {protocol.name}
            </span>
          </div>
        ))}
      </motion.div>
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-base-100 dark:from-base-200 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-base-100 dark:from-base-200 to-transparent pointer-events-none" />
    </div>
  );
};

const LandingSection = () => {
  const { starknet } = useWalletConnection();
  const [hasStarknetWallet, setHasStarknetWallet] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(true);
  const buttonRef = useRef<HTMLAnchorElement>(null);

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");
    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;
    return `${protocol}//app.${baseHost}`;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const anyWin = window as any;
    const detected = Boolean(anyWin?.starknet) || Boolean(anyWin?.argentX) || Boolean(anyWin?.braavos);
    setHasStarknetWallet(detected || Boolean(starknet.isConnected));
  }, [starknet.isConnected]);

  // Track when hero button leaves viewport
  useEffect(() => {
    if (!buttonRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setButtonVisible(entry.isIntersecting);
      },
      { threshold: 0 }
    );
    
    observer.observe(buttonRef.current);
    return () => observer.disconnect();
  }, []);

  // Dispatch custom event for header to listen to
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('heroButtonVisibility', { detail: { visible: buttonVisible } }));
  }, [buttonVisible]);

  return (
    <section className="w-full pt-4 pb-2 lg:pt-6 lg:pb-4 relative overflow-hidden bg-gradient-to-b from-base-100 to-base-200 dark:from-base-200 dark:to-base-300">
      <div className="container mx-auto max-w-screen-2xl px-5 relative">
        {/* Hero Header */}
        <div className="mb-4 lg:mb-6">
          {/* Centered title */}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-3 text-center"
          >
            <span className="text-base-content block">One Dashboard.</span>
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent block">
              Every Protocol.
            </span>
          </motion.h1>

          {/* Description + Button - all centered */}
          <div className="flex flex-col items-center gap-4 max-w-xl mx-auto">
            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="text-sm text-base-content/60 leading-relaxed text-center"
            >
              View all your lending positions in one place. Refinance debt, swap collateral, 
              and migrate between protocols—all in a single atomic transaction using flash loans.
            </motion.p>

            {/* Protocol carousel + Button row */}
            <div className="flex items-center gap-4">
              {/* Protocol carousel */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex items-center gap-2"
              >
                <span className="text-xs text-base-content/40 flex-shrink-0">Works with</span>
                <ProtocolCarousel />
              </motion.div>

              {/* Launch App button */}
              <motion.a
                ref={buttonRef}
                href="/app"
                onClick={e => {
                  e.preventDefault();
                  window.location.assign(appUrl);
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.25 }}
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 flex-shrink-0"
              >
                <span>Launch App</span>
                <FiArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </motion.a>
            </div>
          </div>
        </div>

        {/* Protocol Views Demo */}
        <div className="relative fade-bottom-mask">
          {hasStarknetWallet ? (
            <>
              <motion.div 
                initial={{ opacity: 0, y: 12 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
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
              <div className="mt-1.5" />
              <motion.div 
                initial={{ opacity: 0, y: 14 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.5 }}
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
                initial={{ opacity: 0, y: 12 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
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
              <div className="mt-1.5" />
              <motion.div 
                initial={{ opacity: 0, y: 14 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.5 }}
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-base-200 dark:to-base-300" />
        </div>
      </div>
    </section>
  );
};

export default LandingSection;
