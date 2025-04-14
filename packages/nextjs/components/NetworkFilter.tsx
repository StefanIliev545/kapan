"use client";

import { useState } from "react";
import Image from "next/image";

export interface NetworkOption {
  id: string;
  name: string;
  logo: string;
}

interface NetworkFilterProps {
  networks: NetworkOption[];
  defaultNetwork?: string;
  onNetworkChange: (networkId: string) => void;
}

export const NetworkFilter: React.FC<NetworkFilterProps> = ({ 
  networks, 
  defaultNetwork = networks[0]?.id, 
  onNetworkChange 
}) => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>(defaultNetwork);

  const handleNetworkChange = (networkId: string) => {
    setSelectedNetwork(networkId);
    onNetworkChange(networkId);
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-base-200 rounded-lg">
      <div className="flex items-center gap-2">
        {networks.map((network) => (
          <button
            key={network.id}
            className={`btn btn-sm normal-case flex items-center gap-2 ${
              selectedNetwork === network.id ? "btn-primary" : "btn-ghost"
            }`}
            onClick={() => handleNetworkChange(network.id)}
          >
            <div className="w-5 h-5 relative">
              <Image 
                src={network.logo} 
                alt={network.name} 
                fill 
                className="object-contain" 
              />
            </div>
            <span>{network.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
