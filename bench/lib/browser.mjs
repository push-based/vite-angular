// Headless Chrome: open an app, wait until it really rendered, read its first contentful paint,
// and watch for the markers that edits write.

import {existsSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

export function chromePath() {
  const chrome =
    process.env['CHROME_PATH'] ??
    [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
    ].find((p) => existsSync(p));
  if (!chrome) throw new Error('No Chrome found; set CHROME_PATH');
  return chrome;
}

export function launch() {
  return puppeteer.launch({executablePath: chromePath(), headless: true, args: ['--no-sandbox']});
}

/**
 * Reports every `bench-mark-<n>` that appears in the page, once per document, with the epoch
 * time it appeared and the document's time origin (which changes when the page reloads).
 * Installed before any page script runs, so it survives reloads.
 */
const MARKER_OBSERVER = `(() => {
  const seen = new Set();
  const check = (text) => {
    if (!text || !text.includes('bench-mark-')) return;
    for (const m of text.matchAll(/bench-mark-(\\d+)/g)) {
      const n = Number(m[1]);
      if (seen.has(n)) continue;
      seen.add(n);
      window.__benchMarker(n, Date.now(), performance.timeOrigin);
    }
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') check(r.target.data);
      for (const node of r.addedNodes) check(node.textContent);
    }
  }).observe(document, {subtree: true, childList: true, characterData: true});
})();`;

/**
 * Opens `url` in a fresh browser context (no HTTP cache, no storage) and waits until `gate`
 * holds. Returns the page, the epoch times of first contentful paint and of the gate passing,
 * and every error the page logged.
 */
export async function openApp(browser, url, gate, {timeoutMs = 600_000, markers = null} = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  let documents = 0;
  // The generated apps ship no favicon and Chrome asks for one anyway: that 404 isn't the app's.
  const favicon = (url) => new URL(url).pathname === '/favicon.ico';
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (msg.text().startsWith('Failed to load resource') && favicon(msg.location()?.url ?? '')) return;
    errors.push(`console: ${msg.text()} (${msg.location()?.url ?? ''})`);
  });
  page.on('pageerror', (err) => errors.push(`exception: ${err.message}`));
  page.on('domcontentloaded', () => documents++);
  page.on('response', (res) => {
    if (res.status() >= 400 && !favicon(res.url())) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  if (markers) {
    await page.exposeFunction('__benchMarker', (n, at, origin) => markers(n, at, origin));
    await page.evaluateOnNewDocument(MARKER_OBSERVER);
  }
  page.setDefaultTimeout(timeoutMs);
  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: timeoutMs});
  await page.waitForFunction(gate, {polling: 'mutation', timeout: timeoutMs});
  const renderedAt = Date.now();
  const paint = await firstContentfulPaint(page);
  return {page, context, errors, renderedAt, ...paint, documents: () => documents};
}

/** Epoch time of the current document's first contentful paint. */
export async function firstContentfulPaint(page) {
  for (let i = 0; i < 100; i++) {
    const t = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return fcp ? {fcpAt: performance.timeOrigin + fcp.startTime, timeOrigin: performance.timeOrigin} : null;
    });
    if (t) return t;
    await sleep(50);
  }
  throw new Error('no first-contentful-paint entry');
}

export async function gateHolds(page, gate) {
  return page.evaluate(`(${gate})()`);
}
