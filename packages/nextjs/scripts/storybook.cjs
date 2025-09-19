#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
process.chdir(workspaceRoot);

const env = { ...process.env };

const resolveYarnPath = () => {
  if (env.STORYBOOK_YARN_CJS) {
    return env.STORYBOOK_YARN_CJS;
  }

  const repoRoot = path.resolve(workspaceRoot, '..', '..');
  try {
    const yarnrc = fs.readFileSync(path.join(repoRoot, '.yarnrc.yml'), 'utf8');
    const match = yarnrc.match(/yarnPath:\s*(.+)/);
    if (match) {
      return path.resolve(repoRoot, match[1].trim());
    }
  } catch (error) {
    // If the config can't be read we fall back to the known default path.
  }

  return path.resolve(repoRoot, '.yarn/releases/yarn-3.2.3.cjs');
};

env.STORYBOOK_YARN_CJS = resolveYarnPath();
env.STORYBOOK_NODE = env.STORYBOOK_NODE ?? process.execPath;
const shimBinDir = path.resolve(__dirname, 'bin');
env.PATH = `${shimBinDir}${path.delimiter}${env.PATH ?? ''}`;
if (!env.YARN_NPM_REGISTRY_SERVER) {
  env.YARN_NPM_REGISTRY_SERVER = 'https://registry.yarnpkg.com';
}
if (!env.STORYBOOK_SKIP_SWC_BINARY_DOWNLOAD) {
  env.STORYBOOK_SKIP_SWC_BINARY_DOWNLOAD = '1';
}
if (!env.NEXT_IGNORE_INCORRECT_LOCKFILE) {
  env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';
}

const args = process.argv.slice(2);
const storybookPackagePath = path.dirname(require.resolve('storybook/package.json'));
const storybookBin = path.join(storybookPackagePath, 'dist/bin/index.cjs');

const child = spawn(process.execPath, [storybookBin, ...args], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
