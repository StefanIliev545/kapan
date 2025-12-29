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
        <div className={`min-h-screen bg-base-100 ${className}`}>
            {/* Subtle background grid matching landing page */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.02)_0%,transparent_50%)]" />
            </div>
            <div className="relative z-10 mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-12 py-8">
                {children}
            </div>
        </div>
    );
};
