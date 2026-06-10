#!/usr/bin/env node
/**
 * test-feeds.mjs — drives Chrome over the DevTools Protocol to verify the
 * Writing + Testimonials live feeds: failure-mode recovery and per-section
 * layout shift (CLS).
 *
 * Usage:
 *   node tools/test-feeds.mjs <scenario> [--warm]
 *   node tools/test-feeds.mjs all
 *
 * Scenarios:
 *   baseline   — no interference; feeds load normally
 *   inview     — hold feed responses until each section is scrolled into view,
 *                then release: measures the skeleton→content swap CLS where it
 *                actually hurts (in the viewport)
 *   offline    — feed requests fail at the network layer (InternetDisconnected)
 *   http500    — feed origins answer 500
 *   malformed  — feed origins answer 200 with junk bodies
 *   slow       — feed responses held for 90s (never released): does the page
 *                hang on skeletons forever, or time out and recover?
 *
 *   --warm     — first load the page with feeds healthy (seeds any cache),
 *                THEN apply the scenario on a reload. Tests stale-while-
 *                revalidate: last-good content should survive the failure.
 *
 * Requires Node ≥ 22 and the site served at http://localhost:3030.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_UNDER_TEST = process.env.FEEDS_URL || 'http://localhost:3030/';
const PORT = 9224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [, , SCENARIO = 'baseline', ...FLAGS] = process.argv;
const WARM = FLAGS.includes('--warm');

// Only intercept fetch() calls to the two feed origins — headshot <img>
// requests (resourceType Image) flow through untouched.
const FEED_PATTERNS = [
  { urlPattern: '*api.rss2json.com*', resourceType: 'Fetch', requestStage: 'Request' },
  { urlPattern: '*drinkyouroj.github.io*', resourceType: 'Fetch', requestStage: 'Request' },
];

// Injected before any page script: buffers layout-shift entries and tags each
// with the section it happened in, so CLS can be attributed per feed.
const OBSERVER_SNIPPET = `
  window.__lsEntries = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        const sections = new Set();
        for (const src of (e.sources || [])) {
          let n = src.node;
          if (n && n.nodeType === 3) n = n.parentElement;
          const sec = n && n.closest ? n.closest('section[id]') : null;
          sections.add(sec ? sec.id : '(outside-sections)');
        }
        window.__lsEntries.push({ value: e.value, sections: [...sections] });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}
`;

const SNAPSHOT_SNIPPET = `(() => {
  const $$ = (s) => document.querySelectorAll(s).length;
  const perSection = {};
  let total = 0;
  for (const e of (window.__lsEntries || [])) {
    total += e.value;
    for (const s of e.sections) perSection[s] = (perSection[s] || 0) + e.value;
  }
  let cacheKeys = [];
  try { cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('feed:')); } catch (_) {}
  const heights = (s) => [...document.querySelectorAll(s)].map(el => Math.round(el.offsetHeight));
  return JSON.stringify({
    heights: {
      writingCards:         heights('.writing-card'),
      writingSkeletons:     heights('.skeleton-writing'),
      testimonialCards:     heights('.testimonial-card'),
      testimonialSkeletons: heights('.skeleton-testimonial'),
    },
    writingCards:        $$('.writing-card'),
    writingSkeletons:    $$('.skeleton-writing'),
    writingError:        $$('.writing-error'),
    testimonialCards:    $$('.testimonial-card'),
    testimonialSkeletons: $$('.skeleton-testimonial'),
    testimonialError:    $$('.testimonials-error'),
    cls: { total: +total.toFixed(4),
           writing: +(perSection.writing || 0).toFixed(4),
           testimonials: +(perSection.testimonials || 0).toFixed(4) },
    cacheKeys,
  });
})()`;

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const msgId = ++id;
        pending.set(msgId, { res, rej });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      }),
      on: (method, fn) => listeners.set(method, fn),
      close: () => ws.close(),
    });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        listeners.get(msg.method)(msg.params);
      }
    };
  });
}

async function evalJson(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  return JSON.parse(result.value);
}

/**
 * Interception modes. Each returns a handler for Fetch.requestPaused;
 * 'hold' modes queue the pause events so release() can let them through later.
 */
function makeInterceptor(cdp, mode) {
  const held = [];
  let holding = mode === 'hold' || mode === 'slow';
  const handler = async ({ requestId, request }) => {
    try {
      if (mode === 'offline') {
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
      } else if (mode === 'http500') {
        await cdp.send('Fetch.fulfillRequest', {
          requestId, responseCode: 500,
          responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }],
          body: Buffer.from('Internal Server Error').toString('base64'),
        });
      } else if (mode === 'malformed') {
        const body = request.url.includes('rss2json')
          ? '{"status":"ok","items":"this-should-be-an-array"}'
          : '{"testimonials": 42}';
        await cdp.send('Fetch.fulfillRequest', {
          requestId, responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' },
          ],
          body: Buffer.from(body).toString('base64'),
        });
      } else if (holding) {
        held.push(requestId);
      } else {
        await cdp.send('Fetch.continueRequest', { requestId });
      }
    } catch (_) { /* request may already be gone (page aborted it) */ }
  };
  const release = async () => {
    holding = false;
    for (const requestId of held.splice(0)) {
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch (_) {}
    }
  };
  return { handler, release };
}

async function enableInterception(cdp, mode) {
  const interceptor = makeInterceptor(cdp, mode);
  cdp.on('Fetch.requestPaused', interceptor.handler);
  await cdp.send('Fetch.enable', { patterns: FEED_PATTERNS });
  return interceptor;
}

async function runScenario(scenario, warm) {
  const profile = mkdtempSync(join(tmpdir(), `feeds-${scenario}-`));
  const browser = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; }
      catch (_) { /* not up yet */ }
      await sleep(500);
    }

    const created = await fetch(
      `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,
      { method: 'PUT' },
    ).then((r) => r.json());
    const cdp = await connect(created.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SNIPPET });

    // Warm pass: one healthy load so the page can seed whatever cache it has.
    if (warm) {
      await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
      await sleep(6000); // let feeds complete + cache write
    }

    const result = { scenario, warm };

    if (scenario === 'inview') {
      // Hold feeds, scroll the section into view, then release — the swap
      // happens inside the viewport, which is where layout shift counts.
      for (const section of ['writing', 'testimonials']) {
        const interceptor = await enableInterception(cdp, 'hold');
        await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
        await sleep(2500); // load event + skeletons painted
        await cdp.send('Runtime.evaluate', {
          expression: `document.getElementById('${section}').scrollIntoView({block:'start'})`,
        });
        await sleep(1200); // settle scroll; skeletons on screen
        await cdp.send('Runtime.evaluate', { expression: 'window.__lsEntries.length = 0' });
        await interceptor.release();
        await sleep(5000); // swap + any animation settles
        const snap = await evalJson(cdp, SNAPSHOT_SNIPPET);
        result[`inview_${section}`] = snap;
        await cdp.send('Fetch.disable');
      }
    } else {
      const mode = scenario === 'baseline' ? 'continue' : scenario;
      const interceptor = await enableInterception(cdp, mode);
      await cdp.send('Page.navigate', { url: URL_UNDER_TEST });

      if (scenario === 'slow') {
        // Never release. Snapshot early and late to see if the page recovers
        // (timeout → cache or fallback) or hangs on skeletons.
        await sleep(3000);
        result.at3s = await evalJson(cdp, SNAPSHOT_SNIPPET);
        await sleep(12000);
        result.at15s = await evalJson(cdp, SNAPSHOT_SNIPPET);
        await interceptor.release(); // hygiene
      } else {
        // Failure scenarios need to outlast timeout+retry (~13s worst case).
        await sleep(scenario === 'baseline' ? 7000 : 16000);
        result.final = await evalJson(cdp, SNAPSHOT_SNIPPET);
      }
    }

    console.log(JSON.stringify(result, null, 2));
    cdp.close();
  } finally {
    browser.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

const ALL = ['baseline', 'inview', 'offline', 'http500', 'malformed', 'slow'];
if (SCENARIO === 'all') {
  for (const s of ALL) await runScenario(s, WARM);
} else {
  await runScenario(SCENARIO, WARM);
}
