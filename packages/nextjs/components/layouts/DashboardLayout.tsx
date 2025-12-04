import React from "react";

interface DashboardLayoutProps {
    children: React.ReactNode;
    className?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, className = "" }) => {
    return (
        <div className={`min-h-screen bg-gradient-to-br from-base-100 via-base-100 to-base-200/30 ${className}`}>
            <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-12 py-8">
                {children}
            </div>
        </div>
    );
};
