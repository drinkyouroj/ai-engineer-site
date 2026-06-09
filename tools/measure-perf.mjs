#!/usr/bin/env node
/**
 * measure-perf.mjs — drives Chrome or Brave over the DevTools Protocol and
 * samples the site's dev perf overlay (window.__perfStats, see main.js).
 *
 * Usage:
 *   node tools/measure-perf.mjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" chrome
 *   node tools/measure-perf.mjs "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" brave
 *
 * Requires Node ≥ 22 (global fetch + WebSocket). The site must be served at
 * http://localhost:3030 with the ?debug=perf overlay available.
 *
 * Phases:
 *   1. idle          — hero on screen, no input, 8s of samples
 *   2. idle-throttled — same, with 6× CPU throttle (simulates mid-range laptop)
 *   3. scroll        — synthetic wheel events down the page, 6s of samples
 *
 * Reports median FPS, median draws/frame, and worst frame time per phase.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , BIN, LABEL = 'browser', THROTTLE_ARG] = process.argv;
const THROTTLE = Number(THROTTLE_ARG) || 6;
if (!BIN) {
  console.error('usage: measure-perf.mjs <browser-binary> [label]');
  process.exit(1);
}

// Overridable for A/B experiments, e.g. reproducing a user config:
//   PERF_URL='https://www.justin.hearn.me/?debug=perf' \
//   EXTRA_BROWSER_ARGS='--disable-gpu' node tools/measure-perf.mjs ...
const URL_UNDER_TEST = process.env.PERF_URL || 'http://localhost:3030/?debug=perf';
const EXTRA_ARGS = (process.env.EXTRA_BROWSER_ARGS || '').split(' ').filter(Boolean);
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const profile = mkdtempSync(join(tmpdir(), `perf-${LABEL}-`));
const browser = spawn(BIN, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--window-size=1440,900',
  '--window-position=40,40',
  ...EXTRA_ARGS,
  'about:blank',
], { stdio: 'ignore' });

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch (_) { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('DevTools endpoint never came up');
}

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

async function readStats(cdp) {
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__perfStats || null)',
    returnByValue: true,
  });
  return JSON.parse(result.value);
}

async function samplePhase(cdp, name, durationMs, everyMs, onTick) {
  const fps = [], draws = [], worst = [], script = [];
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) {
    if (onTick) await onTick();
    await sleep(everyMs);
    const s = await readStats(cdp);
    if (s && s.fps > 0) {
      fps.push(s.fps);
      draws.push(s.draws);
      worst.push(s.worstMs);
      script.push(s.scriptMs || 0);
    }
  }
  return {
    phase: name,
    medianFps: +median(fps).toFixed(1),
    minFps: +Math.min(...fps).toFixed(1),
    medianDraws: Math.round(median(draws)),
    medianScriptMs: +median(script).toFixed(2),
    worstFrameMs: +Math.max(...worst).toFixed(1),
    samples: fps.length,
  };
}

try {
  await waitForDevtools();

  const created = await fetch(
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_UNDER_TEST)}`,
    { method: 'PUT' },
  ).then((r) => r.json());

  await fetch(`http://127.0.0.1:${PORT}/json/activate/${created.id}`);
  const cdp = await connect(created.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');

  // Warm-up: fonts, RSS fetch, canvas resize all settle
  await sleep(4000);

  const idle = await samplePhase(cdp, 'hero-idle', 8000, 250);

  // Same scene with the CPU slowed 6× — models the mid-range hardware where
  // the per-draw-call tax (Brave farbling hooks every canvas op) becomes jank
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await sleep(1000);
  const throttled = await samplePhase(cdp, `hero-idle-${THROTTLE}x-throttle`, 8000, 250);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await sleep(1000);

  // Synthetic wheel scroll — real compositor scroll, like a user flicking down
  let wheels = 0;
  const scroll = await samplePhase(cdp, 'scroll', 6000, 50, async () => {
    wheels++;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 700, y: 450, deltaX: 0,
      deltaY: (wheels % 100 < 50) ? 140 : -140,   // down then back up — nav stays sticky/visible
    });
  });

  // Hero telemetry line as the page reports it (includes LITE badge when
  // the adaptive-quality ratchet engaged during the run)
  const { result: tel } = await cdp.send('Runtime.evaluate', {
    expression: `(document.querySelector('.ribbon-telemetry')||{}).textContent || null`,
    returnByValue: true,
  });

  console.log(JSON.stringify({ browser: LABEL, idle, throttled, scroll, telemetry: tel.value }, null, 2));
  cdp.close();
} catch (err) {
  console.error(`[${LABEL}] measurement failed:`, err.message);
  process.exitCode = 1;
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
