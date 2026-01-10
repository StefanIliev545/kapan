#!/usr/bin/env node
/**
 * Capture Storybook Story Screenshot
 *
 * Usage:
 *   node scripts/capture-story.mjs <story-id> [output-path]
 *
 * Examples:
 *   node scripts/capture-story.mjs common-loading--spinner
 *   node scripts/capture-story.mjs common-loading--spinner /tmp/screenshot.png
 *
 * After capturing, agents can view with: Read tool on the output path
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_OUTPUT_DIR = '/tmp/storybook-screenshots';
const STORYBOOK_PORT = 6006;
const STORYBOOK_URL = `http://localhost:${STORYBOOK_PORT}`;

async function isServerRunning() {
  try {
    const response = await fetch(STORYBOOK_URL, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  console.log('Starting Storybook server...');
  const server = spawn('npx', ['http-server', 'storybook-static', '-p', String(STORYBOOK_PORT), '-s'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  server.unref();

  // Wait for server
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isServerRunning()) {
      console.log('Server ready!');
      return server.pid;
    }
  }
  throw new Error('Server failed to start');
}

async function captureScreenshot(storyId, outputPath) {
  const url = `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`;

  // Use playwright to capture
  const script = `
    const { chromium } = require('playwright');
    (async () => {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto('${url}', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: '${outputPath}', fullPage: true });
      await browser.close();
      console.log('Screenshot saved to: ${outputPath}');
    })();
  `;

  execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
    stdio: 'inherit',
    cwd: ROOT
  });
}

async function main() {
  const storyId = process.argv[2];
  if (!storyId) {
    console.error('Usage: node scripts/capture-story.mjs <story-id> [output-path]');
    console.error('\nAvailable stories:');
    try {
      const index = JSON.parse(require('fs').readFileSync(join(ROOT, 'storybook-static/index.json'), 'utf-8'));
      Object.entries(index.entries)
        .filter(([_, e]) => e.type === 'story')
        .forEach(([id]) => console.log(`  - ${id}`));
    } catch {}
    process.exit(1);
  }

  const outputPath = process.argv[3] || join(DEFAULT_OUTPUT_DIR, `${storyId.replace(/[^a-z0-9-]/gi, '-')}.png`);
  mkdirSync(dirname(outputPath), { recursive: true });

  // Check/start server (reuses existing if already running)
  if (await isServerRunning()) {
    console.log('Storybook server already running on port 6006');
  } else {
    // Check if build exists
    if (!existsSync(join(ROOT, 'storybook-static/index.html'))) {
      console.log('Building Storybook first...');
      execSync('yarn storybook:build', { cwd: ROOT, stdio: 'inherit' });
    }
    await startServer();
  }

  await captureScreenshot(storyId, outputPath);
  console.log(`\nTo view: Read tool with path "${outputPath}"`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
