"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { ChevronDownIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useKapanTheme } from "~~/hooks/useKapanTheme";
// Note: Header is rendered by ScaffoldEthAppWithProviders (LandingHeader for /about route)

// Character set for scramble effect
const CHARS = "@#$%&*!?<>[]{}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const getRandomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

// One-shot text scramble - reveals when isActive becomes true
const ScrambleText = ({ 
  text, 
  isActive,
  duration = 800,
}: { 
  text: string; 
  isActive: boolean;
  duration?: number;
}) => {
  const [displayText, setDisplayText] = useState("");
  const [hasRevealed, setHasRevealed] = useState(false);
  const frameRef = useRef<number | null>(null);

  const scrambleReveal = useCallback(() => {
    const length = text.length;
    const startTime = performance.now();
    let scrambledChars = text.split("").map((char) => 
      char === " " || char === "." || char === "," || char === "?" || char === "'" ? char : getRandomChar()
    );
    let lastScrambleTime = 0;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const revealedCount = Math.floor(progress * length);
      const revealStartIndex = length - revealedCount;

      if (currentTime - lastScrambleTime > 50) {
        lastScrambleTime = currentTime;
        for (let i = 0; i < revealStartIndex; i++) {
          if (text[i] !== " " && text[i] !== "." && text[i] !== "," && text[i] !== "?" && text[i] !== "'") {
            scrambledChars[i] = getRandomChar();
          }
        }
      }

      let result = "";
      for (let i = 0; i < length; i++) {
        if (text[i] === " " || text[i] === "." || text[i] === "," || text[i] === "?" || text[i] === "'") {
          result += text[i];
        } else if (i >= revealStartIndex) {
          result += text[i];
        } else {
          result += scrambledChars[i];
        }
      }

      setDisplayText(result);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayText(text);
        setHasRevealed(true);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
  }, [text, duration]);

  useEffect(() => {
    if (isActive && !hasRevealed) {
      scrambleReveal();
    }
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isActive, hasRevealed, scrambleReveal]);

  // Initialize with scrambled text
  useEffect(() => {
    if (!displayText && !hasRevealed) {
      const initial = text.split("").map((char) => 
        char === " " || char === "." || char === "," || char === "?" || char === "'" ? char : getRandomChar()
      ).join("");
      setDisplayText(initial);
    }
  }, [text, displayText, hasRevealed]);

  return <>{displayText}</>;
};

// Section data
interface SectionData {
  tag: string;
  title: string;
  ContentComponent: React.FC<{ isActive: boolean }>;
}

// Glitch effect for the photo
const GlitchImage = ({ src, alt, isActive }: { src: string; alt: string; isActive: boolean }) => {
  const [glitchActive, setGlitchActive] = useState(false);

  // Periodic glitch effect
  useEffect(() => {
    if (!isActive) return;
    
    const triggerGlitch = () => {
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 150 + Math.random() * 100);
    };

    // Initial glitch
    const initialTimeout = setTimeout(triggerGlitch, 500);
    
    // Periodic glitches
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        triggerGlitch();
      }
    }, 2000 + Math.random() * 3000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isActive]);

  return (
    <div className="relative w-48 h-48 md:w-64 md:h-64 mx-auto">
      {/* Base image */}
      <div className="relative w-full h-full overflow-hidden">
        <Image
          src={src}
          alt={alt}
          fill
          className={`object-cover grayscale contrast-125 brightness-90 transition-all duration-100 ${
            glitchActive ? "translate-x-1" : ""
          }`}
        />
        
        {/* Scan lines overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
          }}
        />
        
        {/* Glitch layers */}
        {glitchActive && (
          <>
            <div 
              className="absolute inset-0"
              style={{
                background: "rgba(255,0,0,0.1)",
                transform: "translateX(-3px)",
                mixBlendMode: "screen",
              }}
            >
              <Image src={src} alt="" fill className="object-cover grayscale" />
            </div>
            <div 
              className="absolute inset-0"
              style={{
                background: "rgba(0,255,255,0.1)",
                transform: "translateX(3px)",
                mixBlendMode: "screen",
              }}
            >
              <Image src={src} alt="" fill className="object-cover grayscale" />
            </div>
          </>
        )}
        
        {/* Noise overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>
      
      {/* Corner brackets */}
      <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-base-content/30" />
      <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-base-content/30" />
      <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-base-content/30" />
      <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-base-content/30" />
    </div>
  );
};

// Mission content - punchy copy
const MissionContent = ({ isActive }: { isActive: boolean }) => {
  const [line1Active, setLine1Active] = useState(false);
  const [line2Active, setLine2Active] = useState(false);
  const [line3Active, setLine3Active] = useState(false);
  const [line4Active, setLine4Active] = useState(false);

  useEffect(() => {
    if (isActive) {
      const t1 = setTimeout(() => setLine1Active(true), 0);
      const t2 = setTimeout(() => setLine2Active(true), 600);
      const t3 = setTimeout(() => setLine3Active(true), 1200);
      const t4 = setTimeout(() => setLine4Active(true), 1800);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [isActive]);

  return (
    <div className="max-w-2xl mx-auto space-y-8 text-center">
      <p className="text-lg md:text-xl text-base-content/60 leading-relaxed">
        <ScrambleText 
          text="Swap? One site. Lend? Another. Loop? Another. Mint? Another." 
          isActive={line1Active} 
          duration={800} 
        />
      </p>
      <p className="text-lg md:text-xl text-base-content/60 leading-relaxed">
        <ScrambleText 
          text="Great tools. Zero integration." 
          isActive={line2Active} 
          duration={600} 
        />
      </p>
      <p className="text-xl md:text-2xl text-base-content/80 font-semibold leading-relaxed">
        <ScrambleText 
          text="Kapan is the middlelayer." 
          isActive={line3Active} 
          duration={700} 
        />
      </p>
      <p className="text-base md:text-lg text-base-content/40 leading-relaxed">
        <ScrambleText 
          text="One interface. Every protocol. Every action. If we have to leave to run a strat, something's broken. We fix it." 
          isActive={line4Active} 
          duration={1000} 
        />
      </p>
    </div>
  );
};

// Founder content
const FounderContent = ({ isActive }: { isActive: boolean }) => {
  const [photoActive, setPhotoActive] = useState(false);
  const [nameActive, setNameActive] = useState(false);
  const [detailsActive, setDetailsActive] = useState(false);
  const [quoteActive, setQuoteActive] = useState(false);

  useEffect(() => {
    if (isActive) {
      const t1 = setTimeout(() => setPhotoActive(true), 200);
      const t2 = setTimeout(() => setNameActive(true), 600);
      const t3 = setTimeout(() => setDetailsActive(true), 1000);
      const t4 = setTimeout(() => setQuoteActive(true), 1400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [isActive]);

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Photo with glitch effect */}
      <GlitchImage 
        src="/team/me.jpg" 
        alt="StefanCantCode" 
        isActive={photoActive}
      />
      
      {/* Name and role */}
      <div className="text-center space-y-2">
        <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
          <ScrambleText text="StefanCantCode" isActive={nameActive} duration={700} />
        </h3>
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80">
          <ScrambleText text="Founder" isActive={nameActive} duration={500} />
        </p>
      </div>
      
      {/* Background details */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-base-content/40 uppercase tracking-wider">
        <span><ScrambleText text="Ex-R3" isActive={detailsActive} duration={400} /></span>
        <span className="text-base-content/20">|</span>
        <span><ScrambleText text="Ex-Finance" isActive={detailsActive} duration={400} /></span>
        <span className="text-base-content/20">|</span>
        <span><ScrambleText text="L2 Infrastructure" isActive={detailsActive} duration={400} /></span>
        <span className="text-base-content/20">|</span>
        <span><ScrambleText text="6 Years Building" isActive={detailsActive} duration={400} /></span>
      </div>
      
      {/* Quote */}
      <p className="text-base-content/50 text-sm md:text-base italic max-w-md text-center">
        "<ScrambleText text="If it's missing, I'll build it." isActive={quoteActive} duration={600} />"
      </p>
    </div>
  );
};

// Social icons
const TwitterIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const DiscordIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const TelegramIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const GitHubIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

// CTA content with socials
const CTAContent = ({ isActive }: { isActive: boolean }) => {
  const [buttonsActive, setButtonsActive] = useState(false);
  const [socialsActive, setSocialsActive] = useState(false);

  useEffect(() => {
    if (isActive) {
      const t1 = setTimeout(() => setButtonsActive(true), 300);
      const t2 = setTimeout(() => setSocialsActive(true), 700);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isActive]);

  const getAppUrl = () => {
    if (typeof window === "undefined") return "/app";
    const { protocol, hostname, host } = window.location;
    const baseHost = hostname.replace(/^www\./, "");
    if (host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${host}`;
    return `${protocol}//app.${baseHost}`;
  };

  const socials = [
    { name: "Twitter", icon: TwitterIcon, href: "https://x.com/KapanFinance" },
    { name: "Discord", icon: DiscordIcon, href: "https://discord.gg/Vjk6NhkxGv" },
    { name: "Telegram", icon: TelegramIcon, href: "https://t.me/+vYCKr2TrOXRiODg0" },
    { name: "GitHub", icon: GitHubIcon, href: "https://github.com/StefanIliev545/kapan" },
  ];

  return (
    <div className="flex flex-col items-center gap-10">
      {/* Launch App button */}
      <motion.a
        href="/app"
        onClick={e => {
          e.preventDefault();
          track("To App conversion", { button: "About Page CTA" });
          window.location.assign(getAppUrl());
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={buttonsActive ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="group relative h-14 md:h-16 px-8 md:px-12 bg-primary text-primary-content font-bold uppercase tracking-[0.2em] text-[11px] md:text-xs hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-500 overflow-hidden flex items-center justify-center"
      >
        <div className="relative z-10 flex items-center gap-3">
          <span className="translate-x-2 group-hover:translate-x-0 transition-transform duration-500">
            Launch App
          </span>
          <ArrowRightIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-500" />
        </div>
      </motion.a>

      {/* Social links */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={socialsActive ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-6"
      >
        {socials.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base-content/30 hover:text-base-content/80 transition-colors duration-300"
            title={social.name}
          >
            <social.icon />
          </a>
        ))}
      </motion.div>

      {/* Back to home */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={socialsActive ? { opacity: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Link 
          href="/"
          className="text-xs text-base-content/30 hover:text-base-content/60 transition-colors uppercase tracking-wider"
        >
          ← Back to Home
        </Link>
      </motion.div>
    </div>
  );
};

// Sticky Section component
const StickySection = ({
  section,
  index,
  total,
  scrollYProgress,
}: {
  section: SectionData;
  index: number;
  total: number;
  scrollYProgress: ReturnType<typeof useSpring>;
}) => {
  // First section starts active
  const [hasBeenActive, setHasBeenActive] = useState(index === 0);
  
  const center = index / (total - 1);
  const neighborDistance = 1 / (total - 1);
  const inputRange = [center - neighborDistance, center, center + neighborDistance];

  const opacity = useTransform(
    scrollYProgress,
    [center - neighborDistance * 0.4, center, center + neighborDistance * 0.4],
    [0, 1, 0]
  );
  const scale = useTransform(scrollYProgress, inputRange, [0.95, 1, 0.95]);
  const y = useTransform(scrollYProgress, inputRange, [40, 0, -40]);
  const pointerEvents = useTransform(opacity, (v) => (v > 0.5 ? "auto" : "none"));

  // Track when section becomes active
  useEffect(() => {
    const unsubscribe = opacity.on("change", (v) => {
      const active = v > 0.8;
      if (active && !hasBeenActive) {
        setHasBeenActive(true);
      }
    });
    return () => unsubscribe();
  }, [opacity, hasBeenActive]);

  return (
    <motion.div
      style={{ opacity, scale, y, zIndex: index, pointerEvents }}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div className="w-full max-w-4xl px-6 md:px-8 flex flex-col items-center text-center">
        {/* Tag + Title */}
        <div className="flex flex-col items-center gap-3 mb-8 md:mb-12">
          <div className="h-px w-10 bg-base-content/20" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-base-content/40 font-medium">
            {section.tag}
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight">
            <ScrambleText text={section.title} isActive={hasBeenActive} duration={600} />
          </h2>
        </div>

        {/* Content */}
        <div className="w-full">
          <section.ContentComponent isActive={hasBeenActive} />
        </div>
      </div>
    </motion.div>
  );
};

const AboutPageContent = () => {
  useKapanTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  const sections: SectionData[] = [
    {
      tag: "01 / MISSION",
      title: "DEFI SUCKS.",
      ContentComponent: MissionContent,
    },
    {
      tag: "02 / FOUNDER",
      title: "WHO'S BUILDING.",
      ContentComponent: FounderContent,
    },
    {
      tag: "03 / CONNECT",
      title: "JOIN US.",
      ContentComponent: CTAContent,
    },
  ];

  const { scrollYProgress } = useScroll({ container: containerRef });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="fixed inset-0 bg-base-100 text-base-content overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="h-full w-full hide-scrollbar relative z-10 overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        <div style={{ height: `${sections.length * 100}vh` }} className="relative">
          {/* Snap targets */}
          <div className="absolute inset-0 flex flex-col pointer-events-none">
            {sections.map((_, i) => (
              <div key={i} className="h-screen w-full snap-start" />
            ))}
          </div>

          {/* Sticky viewport */}
          <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
            {/* Progress indicator */}
            <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 h-48 w-[1px] bg-base-content/5 hidden lg:block">
              <motion.div
                className="w-full bg-base-content/40 origin-top"
                style={{ height: "100%", scaleY: smoothProgress }}
              />
            </div>

            {/* Sections */}
            {sections.map((section, i) => (
              <StickySection
                key={i}
                section={section}
                index={i}
                total={sections.length}
                scrollYProgress={smoothProgress}
              />
            ))}

            {/* Scroll hint */}
            <motion.div
              style={{ opacity: useTransform(smoothProgress, [0, 0.15], [1, 0]) }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-base-content/30"
            >
              <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
              <ChevronDownIcon className="w-4 h-4 animate-bounce" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPageContent;
