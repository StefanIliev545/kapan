import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { StorybookConfig } from "@storybook/nextjs";

const require = createRequire(import.meta.url);

const config: StorybookConfig = {
  stories: ["../**/*.stories.@(ts|tsx|mdx)"],
  addons: [getAbsolutePath("msw-storybook-addon")],

  framework: {
    name: getAbsolutePath("@storybook/nextjs"),
    options: {
      nextConfigPath: "../next.config.js",
      
    },
  },
  core: {
    builder: {
      name: '@storybook/builder-webpack5',
      options: {
        fsCache: true,         // enables Webpack’s filesystem cache between runs
        lazyCompilation: true, // faster startup; compiles on demand in dev
      },
    },
  },


  staticDirs: ["../public"]
};

export default config;

function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, "package.json")));
}
