"use client";

import { useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { track } from "@vercel/analytics";
import { FiArrowRight, FiZap, FiShield, FiTrendingUp } from "react-icons/fi";

const EnterAppCTA = () => {
  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");

    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;

    return `${protocol}//app.${baseHost}`;
  }, []);

  const features = [
    { icon: <FiZap className="w-4 h-4" />, label: "Atomic Transactions" },
    { icon: <FiShield className="w-4 h-4" />, label: "Non-Custodial" },
    { icon: <FiTrendingUp className="w-4 h-4" />, label: "Best Rates" },
  ];

  const protocols = [
    { name: "Aave", logo: "/logos/aave.svg" },
    { name: "Compound", logo: "/logos/compound.svg" },
    { name: "Vesu", logo: "/logos/vesu.svg" },
    { name: "Nostra", logo: "/logos/nostra.svg" },
  ];

  return (
    <section className="relative py-20 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-200 via-base-100 to-base-200 dark:from-base-300 dark:via-base-200 dark:to-base-300" />
      
      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/10 blur-3xl"
          animate={{ 
            x: [0, 50, 0],
            y: [0, -30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent/10 blur-3xl"
          animate={{ 
            x: [0, -40, 0],
            y: [0, 40, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }} />

      <div className="container mx-auto max-w-screen-lg px-5 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-center gap-8 text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Live on 5+ Networks</span>
          </motion.div>

          {/* Main heading */}
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight">
              <span className="text-base-content">Start Optimizing</span>
              <br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-x">
                Your DeFi Positions
              </span>
            </h2>
            <p className="max-w-xl mx-auto text-base md:text-lg text-base-content/70 leading-relaxed">
              Manage lending positions across protocols. Move debt to lower rates. 
              All operations atomic — no additional capital required.
            </p>
          </div>

          {/* Feature pills */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap justify-center gap-3"
          >
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-base-200/80 dark:bg-base-300/50 border border-base-300/50 backdrop-blur-sm"
              >
                <span className="text-accent">{feature.icon}</span>
                <span className="text-sm font-medium text-base-content/80">{feature.label}</span>
              </div>
            ))}
          </motion.div>

          {/* CTA Button */}
          <motion.a
            href="/app"
            onClick={event => {
              event.preventDefault();
              track("To App conversion", { button: "After Demo" });
              window.location.assign(appUrl);
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative mt-4"
          >
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            
            {/* Button */}
            <div className="relative flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-bold text-lg shadow-xl">
              <span>Launch App</span>
              <FiArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </div>
          </motion.a>

          {/* Supported protocols */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center gap-3 mt-4"
          >
            <span className="text-xs uppercase tracking-widest text-base-content/40 font-medium">Integrated Protocols</span>
            <div className="flex items-center gap-4">
              {protocols.map((protocol, idx) => (
                <motion.div
                  key={protocol.name}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + idx * 0.1 }}
                  className="group relative"
                >
                  <div className="w-10 h-10 rounded-xl bg-base-200 dark:bg-base-300 border border-base-300/50 p-2 transition-transform group-hover:scale-110 group-hover:-translate-y-1">
                    <Image
                      src={protocol.logo}
                      alt={protocol.name}
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                  </div>
                </motion.div>
              ))}
              <div className="w-10 h-10 rounded-xl bg-base-200/50 dark:bg-base-300/30 border border-dashed border-base-300/50 flex items-center justify-center">
                <span className="text-xs font-bold text-base-content/40">+5</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default EnterAppCTA;
