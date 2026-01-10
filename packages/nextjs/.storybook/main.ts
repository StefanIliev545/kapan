import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

const componentsDir = path.resolve(__dirname, "../components");

const config: StorybookConfig = {
  stories: [
    path.join(componentsDir, "**/*.stories.@(js|jsx|mjs|ts|tsx)"),
  ],
  addons: [
    "@storybook/addon-essentials",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  viteFinal: async (config) => {
    // Ensure proper resolution for monorepo
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "~~": path.resolve(__dirname, "../"),
        // Mock next/image to work in Storybook
        "next/image": path.resolve(__dirname, "./mocks/next-image.tsx"),
      };
    }
    // Define process for browser compatibility (Next.js uses process.env.NEXT_PUBLIC_*)
    config.define = {
      ...config.define,
      // Global process object for Node.js compatibility
      "process.env": "{}",
    };
    return config;
  },
};

export default config;
