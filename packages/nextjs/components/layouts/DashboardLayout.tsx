"use client";

import React from "react";
import { useKapanThemePersistent } from "~~/hooks/useKapanTheme";

interface DashboardLayoutProps {
    children: React.ReactNode;
    className?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, className = "" }) => {
    // Force kapan dark theme for all dashboard pages
    useKapanThemePersistent();

    return (
        <div className={`bg-base-100 min-h-screen ${className}`}>
            {/* Subtle background grid matching landing page */}
            <div className="pointer-events-none fixed inset-0">
                {/* eslint-disable-next-line tailwindcss/no-contradicting-classname -- bg-[linear-gradient] and bg-[size] are different CSS properties */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.02)_0%,transparent_50%)]" />
            </div>
            <div className="relative z-10 mx-auto max-w-[1500px] px-0 py-4 sm:px-8 sm:py-8 lg:px-12">
                {children}
            </div>
        </div>
    );
};
