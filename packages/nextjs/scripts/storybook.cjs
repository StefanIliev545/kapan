#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
process.chdir(workspaceRoot);

const args = process.argv.slice(2);
const storybookPackagePath = path.dirname(require.resolve('storybook/package.json'));
const storybookBin = path.join(storybookPackagePath, 'dist/bin/index.cjs');

const child = spawn(process.execPath, [storybookBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
