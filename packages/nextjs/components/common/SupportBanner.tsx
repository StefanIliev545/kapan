"use client";

import Image from "next/image";
import React from "react";

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

            <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${className}`}>
                {/* Support on X Card */}
                <div className="relative group">
                    {/* Animated glow border */}
                    <div className="absolute -inset-[1px] rounded-lg overflow-hidden opacity-60">
                        <div className="absolute inset-0 animate-rotate-glow">
                            <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(168,85,247,0.3)_60deg,rgba(236,72,153,0.35)_120deg,transparent_180deg)]" />
                        </div>
                    </div>

                    {/* Card content */}
                    <div className="relative bg-base-100 rounded-lg px-4 py-3 border border-base-200/40">
                        <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-md bg-base-content/5 flex items-center justify-center">
                                <Image
                                    src="/logos/x-logo.svg"
                                    alt="X Logo"
                                    width={14}
                                    height={14}
                                    className="opacity-70"
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-base-content/80">Support on X</h3>
                                <p className="text-xs text-base-content/50 truncate">Follow us to stay updated</p>
                            </div>

                            <a
                                href="https://x.com/KapanFinance"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium text-base-content/70 bg-base-content/5 hover:bg-base-content/10 hover:text-base-content transition-colors duration-200"
                            >
                                Follow
                            </a>
                        </div>
                    </div>
                </div>

                {/* Fund via Giveth Card */}
                <div className="relative group">
                    {/* Animated glow border */}
                    <div className="absolute -inset-[1px] rounded-lg overflow-hidden opacity-60">
                        <div className="absolute inset-0 animate-rotate-glow" style={{ animationDelay: '-1.3s' }}>
                            <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,197,94,0.3)_60deg,rgba(16,185,129,0.35)_120deg,transparent_180deg)]" />
                        </div>
                    </div>

                    {/* Card content */}
                    <div className="relative bg-base-100 rounded-lg px-4 py-3 border border-base-200/40">
                        <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-md bg-base-content/5 flex items-center justify-center">
                                <svg
                                    className="w-4 h-4 text-base-content/60"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-base-content/80">Fund via Giveth</h3>
                                <p className="text-xs text-base-content/50 truncate">Help us keep going</p>
                            </div>

                            <a
                                href="https://giveth.io/project/kapan-finance-defi-lending-management-protocol"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium text-base-content/70 bg-base-content/5 hover:bg-base-content/10 hover:text-base-content transition-colors duration-200"
                            >
                                Donate
                            </a>
                        </div>
                    </div>
                </div>

                {/* Join Our Community Card */}
                <div className="relative group">
                    {/* Animated glow border */}
                    <div className="absolute -inset-[1px] rounded-lg overflow-hidden opacity-60">
                        <div className="absolute inset-0 animate-rotate-glow" style={{ animationDelay: '-2.6s' }}>
                            <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(99,102,241,0.3)_60deg,rgba(139,92,246,0.35)_120deg,transparent_180deg)]" />
                        </div>
                    </div>

                    {/* Card content */}
                    <div className="relative bg-base-100 rounded-lg px-4 py-3 border border-base-200/40">
                        <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-md bg-base-content/5 flex items-center justify-center">
                                <Image
                                    src="/logos/discord.svg"
                                    alt="Discord"
                                    width={14}
                                    height={14}
                                    className="opacity-70"
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-base-content/80">Join Community</h3>
                                <p className="text-xs text-base-content/50 truncate">Connect with builders</p>
                            </div>

                            <a
                                href="https://discord.gg/Vjk6NhkxGv"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium text-base-content/70 bg-base-content/5 hover:bg-base-content/10 hover:text-base-content transition-colors duration-200"
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
