"use client";

import Image from "next/image";
import React from "react";

// Static style objects to avoid creating new objects on each render
const animationDelayStyle1 = { animationDelay: '-1.3s' };
const animationDelayStyle2 = { animationDelay: '-2.6s' };

interface SupportBannerProps {
    className?: string;
}

export const SupportBanner: React.FC<SupportBannerProps> = ({ className = "" }) => {
    return (
        <>
            <style jsx global>{`
        @keyframes rotateGlow {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        
        .animate-rotate-glow {
          animation: rotateGlow 4s linear infinite;
        }
      `}</style>

            <div className={`grid grid-cols-1 gap-3 md:grid-cols-3 ${className}`}>
                {/* Support on X Card */}
                <div className="group relative">
                    {/* Animated glow border */}
                    <div className="absolute inset-[-1px] overflow-hidden rounded-lg opacity-60">
                        <div className="animate-rotate-glow absolute inset-0">
                            <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(168,85,247,0.3)_60deg,rgba(236,72,153,0.35)_120deg,transparent_180deg)]" />
                        </div>
                    </div>

                    {/* Card content */}
                    <div className="bg-base-100 border-base-200/40 relative rounded-lg border px-4 py-3">
                        <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="bg-base-content/5 flex size-8 flex-shrink-0 items-center justify-center rounded-md">
                                <Image
                                    src="/logos/x-logo.svg"
                                    alt="X Logo"
                                    width={14}
                                    height={14}
                                    className="opacity-70"
                                />
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base-content/80 text-sm font-medium">Support on X</h3>
                                <p className="text-base-content/50 truncate text-xs">Follow us to stay updated</p>
                            </div>

                            <a
                                href="https://x.com/KapanFinance"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-base-content/70 bg-base-content/5 hover:bg-base-content/10 hover:text-base-content flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
                            >
                                Follow
                            </a>
                        </div>
                    </div>
                </div>

                {/* Fund via Giveth Card */}
                <div className="group relative">
                    {/* Animated glow border */}
                    <div className="absolute inset-[-1px] overflow-hidden rounded-lg opacity-60">
                        <div className="animate-rotate-glow absolute inset-0" style={animationDelayStyle1}>
                            <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,197,94,0.3)_60deg,rgba(16,185,129,0.35)_120deg,transparent_180deg)]" />
                        </div>
                    </div>

                    {/* Card content */}
                    <div className="bg-base-100 border-base-200/40 relative rounded-lg border px-4 py-3">
                        <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="bg-base-content/5 flex size-8 flex-shrink-0 items-center justify-center rounded-md">
                                <svg
                                    className="text-base-content/60 size-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base-content/80 text-sm font-medium">Fund via Giveth</h3>
                                <p className="text-base-content/50 truncate text-xs">Help us keep going</p>
                            </div>

                            <a
                                href="https://giveth.io/project/kapan-finance-defi-lending-management-protocol"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-base-content/70 bg-base-content/5 hover:bg-base-content/10 hover:text-base-content flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
                            >
                                Donate
                            </a>
                        </div>
                    </div>
                </div>

                {/* Join Our Community Card */}
                <div className="group relative">
                    {/* Animated glow border */}
                    <div className="absolute inset-[-1px] overflow-hidden rounded-lg opacity-60">
                        <div className="animate-rotate-glow absolute inset-0" style={animationDelayStyle2}>
                            <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(99,102,241,0.3)_60deg,rgba(139,92,246,0.35)_120deg,transparent_180deg)]" />
                        </div>
                    </div>

                    {/* Card content */}
                    <div className="bg-base-100 border-base-200/40 relative rounded-lg border px-4 py-3">
                        <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="bg-base-content/5 flex size-8 flex-shrink-0 items-center justify-center rounded-md">
                                <Image
                                    src="/logos/discord.svg"
                                    alt="Discord"
                                    width={14}
                                    height={14}
                                    className="opacity-70"
                                />
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base-content/80 text-sm font-medium">Join Community</h3>
                                <p className="text-base-content/50 truncate text-xs">Connect with builders</p>
                            </div>

                            <a
                                href="https://discord.gg/Vjk6NhkxGv"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-base-content/70 bg-base-content/5 hover:bg-base-content/10 hover:text-base-content flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
                            >
                                Join
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default SupportBanner;
