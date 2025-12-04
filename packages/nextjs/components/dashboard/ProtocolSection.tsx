import React from "react";
import Image from "next/image";

interface ProtocolSectionProps {
    protocolName: string;
    protocolLogo: string;
    children: React.ReactNode;
    isEmpty?: boolean;
}

export const ProtocolSection: React.FC<ProtocolSectionProps> = ({
    protocolName,
    protocolLogo,
    children,
    isEmpty = false,
}) => {
    if (isEmpty) {
        return null;
    }

    return (
        <div className="space-y-4">
            {/* Protocol Header */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 relative">
                    <Image
                        src={protocolLogo}
                        alt={protocolName}
                        fill
                        className="object-contain rounded-lg"
                    />
                </div>
                <h2 className="text-lg font-semibold text-base-content tracking-tight">
                    {protocolName}
                </h2>
            </div>

            {/* Positions */}
            <div className="space-y-3">
                {children}
            </div>
        </div>
    );
};
