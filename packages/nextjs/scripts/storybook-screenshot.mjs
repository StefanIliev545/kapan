#!/usr/bin/env node
/**
 * Storybook Screenshot Capture Script
 *
 * Usage:
 *   node scripts/storybook-screenshot.mjs [story-id]
 *
 * Examples:
 *   node scripts/storybook-screenshot.mjs                    # Capture all stories
 *   node scripts/storybook-screenshot.mjs common-loading     # Capture specific story
 *
 * Screenshots are saved to: .storybook-screenshots/
 * Agents can view these using the Read tool.
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCREENSHOT_DIR = join(ROOT, '.storybook-screenshots');
const STORYBOOK_URL = 'http://localhost:6006';

async function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

async function getStories() {
  try {
    const indexPath = join(ROOT, 'storybook-static', 'index.json');
    if (existsSync(indexPath)) {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      return Object.entries(index.entries || {})
        .filter(([_, entry]) => entry.type === 'story')
        .map(([id, entry]) => ({
          id,
          title: entry.title,
          name: entry.name,
        }));
    }
  } catch (e) {
    console.error('Could not read stories index:', e.message);
  }
  return [];
}

async function captureScreenshot(browser, storyId, outputPath) {
  const page = await browser.newPage();
  const url = `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`;

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500); // Let animations settle

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: true,
    });

    console.log(`  ✓ Captured: ${storyId}`);
    return true;
  } catch (e) {
    console.error(`  ✗ Failed: ${storyId} - ${e.message}`);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  const filterStoryId = process.argv[2];

  // Ensure screenshot directory exists
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Check if server is running
  console.log('Checking Storybook server...');
  const serverRunning = await waitForServer(STORYBOOK_URL, 5000);

  let serverProcess = null;
  if (!serverRunning) {
    console.log('Starting Storybook server...');
    serverProcess = spawn('npx', ['http-server', 'storybook-static', '-p', '6006', '-s'], {
      cwd: ROOT,
      stdio: 'ignore',
    });

    if (!await waitForServer(STORYBOOK_URL, 30000)) {
      console.error('Failed to start Storybook server');
      process.exit(1);
    }
  }

  console.log('Server ready!');

  // Get stories
  let stories = await getStories();
  if (filterStoryId) {
    stories = stories.filter(s =>
      s.id.toLowerCase().includes(filterStoryId.toLowerCase())
    );
  }

  if (stories.length === 0) {
    console.log('No stories found.');
    if (serverProcess) serverProcess.kill();
    process.exit(0);
  }

  console.log(`\nCapturing ${stories.length} stories...\n`);

  // Launch browser
  const browser = await chromium.launch({ headless: true });

  try {
    for (const story of stories) {
      const filename = `${story.id.replace(/[^a-z0-9]/gi, '-')}.png`;
      const outputPath = join(SCREENSHOT_DIR, filename);
      await captureScreenshot(browser, story.id, outputPath);
    }
  } finally {
    await browser.close();
    if (serverProcess) serverProcess.kill();
  }

  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('Agents can view these using the Read tool.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
