import { useTheme } from "next-themes";

export type NetworkWithColor = {
  color?: string | [string, string];
};

export const DEFAULT_NETWORK_COLOR: [string, string] = ["#666666", "#bbbbbb"];

export const getNetworkColor = (network: NetworkWithColor, isDarkMode: boolean) => {
  const colorConfig = network.color ?? DEFAULT_NETWORK_COLOR;
  return Array.isArray(colorConfig)
    ? isDarkMode
      ? colorConfig[1]
      : colorConfig[0]
    : colorConfig;
};

export const useNetworkColor = (network: NetworkWithColor) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  return getNetworkColor(network, isDarkMode);
};
