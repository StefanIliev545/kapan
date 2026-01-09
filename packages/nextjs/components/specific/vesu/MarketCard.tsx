// Re-export the shared MarketCard component from markets module
// This component is protocol-agnostic and can be used for any market display
import { MarketCard as SharedMarketCard, MarketCardProps as SharedMarketCardProps } from "~~/components/markets/MarketCard";
import { FC } from "react";

// VesuMarketCard props are a simplified version - force vesu protocol
export type MarketCardProps = Omit<SharedMarketCardProps, "protocol" | "network" | "allowDeposit">;

export const MarketCard: FC<MarketCardProps> = (props) => {
  return (
    <SharedMarketCard
      {...props}
      network="starknet"
      protocol="vesu"
      allowDeposit={true}
    />
  );
};
