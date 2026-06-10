#!/usr/bin/env node
/**
 * build-writing.mjs — bakes The Civic Node's RSS feed into writing.html.
 *
 * Reads the raw Substack feed (no rss2json proxy — CI has no CORS and the
 * proxy caps at 10 items), normalizes every post to {title, url, date,
 * excerpt}, and rewrites two marker-delimited regions in writing.html:
 *
 *   <!-- FEED:START ... -->   reverse-chronological .writing-card list
 *   <!-- FEED:END -->
 *   <!-- JSONLD:START ... --> ItemList structured data
 *   <!-- JSONLD:END -->
 *
 * Everything outside the markers is hand-authored chrome and never touched.
 * Output is a pure function of feed content (UTC dates, no timestamps), so
 * running twice produces identical bytes.
 *
 * FAILS HARD (non-zero exit) on any anomaly — fetch error, empty feed,
 * missing fields, non-Substack URLs, missing/duplicated markers. In CI the
 * build aborting means the previous deploy stays live, which beats shipping
 * a broken or empty writing page.
 *
 * Usage: node tools/build-writing.mjs        (Node ≥ 22, zero dependencies)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const FEED_URL    = 'https://drinkyouroj.substack.com/feed';
const LINK_PREFIX = 'https://drinkyouroj.substack.com/';
const PAGE_PATH   = join(dirname(fileURLToPath(import.meta.url)), '..', 'writing.html');

const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRIES    = 1;     // extra attempts after the first
const EXCERPT_MAX      = 140;   // mirrors the homepage excerpt rule (main.js)

function fail(msg) {
  console.error(`build-writing: ${msg}`);
  process.exit(1);
}

// ── Fetch ──────────────────────────────────────────────────────────

async function fetchFeed(url) {
  let lastErr;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return await res.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ── Parse (hand-rolled — the Substack feed shape is simple and known) ──

// Returns the text of <tag>…</tag> inside `block`, CDATA-unwrapped and
// entity-decoded. Substack wraps title/description in CDATA; link and
// pubDate are plain text.
function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  let text = m[1].trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) return cdata[1];
  return decodeEntities(text);
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // last, so &amp;lt; doesn't double-decode
}

// Plain-text excerpt from an HTML description: strip tags, decode
// entities, collapse whitespace, truncate. Mirrors main.js exactly.
function toExcerpt(html) {
  const text = decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_MAX ? text.slice(0, EXCERPT_MAX).trimEnd() + '…' : text;
}

function parseItems(xml) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return blocks.map((block, i) => {
    const title   = tagText(block, 'title').replace(/\s+/g, ' ').trim();
    const url     = tagText(block, 'link').trim();
    const pubDate = tagText(block, 'pubDate').trim();
    const excerpt = toExcerpt(tagText(block, 'description'));
    const date    = new Date(pubDate);

    if (!title)                       fail(`item ${i + 1}: missing title`);
    if (!url.startsWith(LINK_PREFIX)) fail(`item ${i + 1}: unexpected link "${url}"`);
    if (Number.isNaN(date.getTime())) fail(`item ${i + 1}: bad pubDate "${pubDate}"`);

    return { title, url, date, excerpt };
  });
}

// ── Render ─────────────────────────────────────────────────────────

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Deterministic across machines: explicit locale + UTC.
const fmtDate = new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

function renderCard(item) {
  const title = escapeHtml(item.title);
  return `          <a
            href="${escapeHtml(item.url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="writing-card"
            aria-label="Read: ${title} on Substack"
          >
            <time class="writing-date" datetime="${item.date.toISOString()}">${fmtDate.format(item.date)}</time>
            <h3 class="writing-title">${title}</h3>
            <p class="writing-excerpt">${escapeHtml(item.excerpt)}</p>
            <span class="writing-cta">Read on Substack →</span>
          </a>`;
}

function renderJsonLd(items) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'The Civic Node — all posts',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.url,
      name: item.title,
    })),
  };
  // <\/ keeps a hostile "</script>" inside a title from ending the block
  const json = JSON.stringify(data, null, 2).replaceAll('</', '<\\/');
  return `    <script type="application/ld+json">\n${json}\n    </script>`;
}

// Replace the region between two marker comments, keeping the markers.
// Each marker must appear exactly once or the page layout has drifted —
// refuse to guess.
function spliceBetween(src, startTag, endTag, body) {
  const re = (tag) => new RegExp(`[^\\S\\n]*<!--\\s*${tag}\\b[^>]*-->`, 'g');
  const starts = src.match(re(startTag)) || [];
  const ends   = src.match(re(endTag))   || [];
  if (starts.length !== 1 || ends.length !== 1) {
    fail(`expected exactly one ${startTag}/${endTag} marker pair in writing.html `
       + `(found ${starts.length}/${ends.length})`);
  }
  const startIdx = src.indexOf(starts[0]) + starts[0].length;
  const endIdx   = src.indexOf(ends[0]);
  if (endIdx < startIdx) fail(`${endTag} appears before ${startTag}`);
  return src.slice(0, startIdx) + '\n' + body + '\n' + src.slice(endIdx);
}

// ── Main ───────────────────────────────────────────────────────────

let xml;
try {
  xml = await fetchFeed(FEED_URL);
} catch (err) {
  fail(`feed fetch failed: ${err.message}`);
}

const items = parseItems(xml).sort((a, b) => b.date - a.date);
if (!items.length) fail('feed parsed to zero items');

let page = readFileSync(PAGE_PATH, 'utf8');
page = spliceBetween(page, 'FEED:START', 'FEED:END', items.map(renderCard).join('\n'));
page = spliceBetween(page, 'JSONLD:START', 'JSONLD:END', renderJsonLd(items));
writeFileSync(PAGE_PATH, page);

console.log(`build-writing: baked ${items.length} posts into writing.html `
          + `(newest: "${items[0].title}", ${items[0].date.toISOString().slice(0, 10)})`);
