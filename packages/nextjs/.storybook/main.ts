import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  stories: ["../**/*.stories.@(ts|tsx|mdx)"],
  addons: ["msw-storybook-addon"],
  framework: {
    name: "@storybook/nextjs",
    options: {
      nextConfigPath: "../next.config.js",
    },
  },
  staticDirs: ["../public"],
  docs: {
    autodocs: "tag",
  },
};

export default config;
