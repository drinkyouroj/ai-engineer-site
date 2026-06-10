#!/usr/bin/env node
/**
 * measure-lcp.mjs — drives headless Chrome over the DevTools Protocol and
 * reports the LCP element, LCP/FCP timing, and total bytes transferred for
 * a page. Companion to measure-perf.mjs (which measures canvas FPS).
 *
 * Usage:
 *   node tools/measure-lcp.mjs [url] [runs]
 *   node tools/measure-lcp.mjs http://localhost:3030/ 3
 *
 * Env:
 *   CHROME_BIN  — browser binary (default: Google Chrome.app)
 *   THROTTLE    — 'none' to skip network/CPU throttling (default: Fast-3G-ish
 *                 1.6 Mbps down / 150 ms RTT + 4× CPU, so bandwidth competition
 *                 between fonts and images is actually observable)
 *
 * Requires Node ≥ 22 (global fetch + WebSocket).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_UNDER_TEST = process.argv[2] || 'http://localhost:3030/';
const RUNS = Number(process.argv[3]) || 3;
const BIN = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const THROTTLED = process.env.THROTTLE !== 'none';
const PORT = 9224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const msgId = ++id;
        pending.set(msgId, { res, rej });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      }),
      close: () => ws.close(),
    });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
  });
}

// Runs inside the page after load. `buffered: true` replays past entries, so
// no pre-navigation injection is needed.
const COLLECT = `(() => new Promise((resolve) => {
  const out = { lcp: null, fcp: null, resources: [] };
  new PerformanceObserver((list) => {
    const e = list.getEntries().at(-1);
    if (!e) return;
    const el = e.element;
    out.lcp = {
      timeMs: +e.startTime.toFixed(0),
      sizePx: e.size,
      element: el ? {
        tag: el.tagName,
        class: el.className && String(el.className).slice(0, 80),
        src: el.currentSrc || el.src || null,
        text: (el.textContent || '').trim().slice(0, 40) || null,
      } : { url: e.url || null },
    };
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  out.fcp = fcp ? +fcp.startTime.toFixed(0) : null;
  const nav = performance.getEntriesByType('navigation')[0];
  let total = nav ? nav.transferSize : 0;
  for (const r of performance.getEntriesByType('resource')) {
    total += r.transferSize;
    out.resources.push({
      url: r.name.split('/').pop().split('?')[0].slice(0, 60),
      transfer: r.transferSize,
      start: +r.startTime.toFixed(0),
      dur: +r.duration.toFixed(0),
    });
  }
  out.totalTransferBytes = total;
  setTimeout(() => resolve(JSON.stringify(out)), 300);
}))()`;

async function measureOnce(runIdx) {
  const profile = mkdtempSync(join(tmpdir(), `lcp-${runIdx}-`));
  const browser = spawn(BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let version;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) { version = await res.json(); break; }
      } catch (_) { /* not up yet */ }
      await sleep(250);
    }
    if (!version) throw new Error('DevTools endpoint never came up');

    const created = await fetch(
      `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,
      { method: 'PUT' },
    ).then((r) => r.json());
    const cdp = await connect(created.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    if (THROTTLED) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,   // 1.6 Mbps
        uploadThroughput: (750 * 1024) / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
    await sleep(THROTTLED ? 12000 : 5000);   // let LCP settle
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: COLLECT, awaitPromise: true, returnByValue: true,
    });
    cdp.close();
    return JSON.parse(result.value);
  } finally {
    browser.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
  const r = await measureOnce(i);
  runs.push(r);
  console.error(`run ${i + 1}/${RUNS}: LCP ${r.lcp?.timeMs}ms — ${r.lcp?.element?.tag} ${r.lcp?.element?.src || r.lcp?.element?.text || ''}`);
}

console.log(JSON.stringify({
  url: URL_UNDER_TEST,
  throttled: THROTTLED,
  runs: RUNS,
  medianLcpMs: median(runs.map((r) => r.lcp?.timeMs || 0)),
  medianFcpMs: median(runs.map((r) => r.fcp || 0)),
  lcpElement: runs.at(-1).lcp?.element || null,
  totalTransferBytes: median(runs.map((r) => r.totalTransferBytes)),
  resourcesLastRun: runs.at(-1).resources
    .sort((a, b) => b.transfer - a.transfer).slice(0, 12),
}, null, 2));
