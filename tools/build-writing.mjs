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
 * SOURCES — Cloudflare 403s ALL fetches from GitHub-runner IPs (verified
 * empirically: curl + node, browser/feed-reader UAs, HTTP/1.1 + 2 — every
 * combination), so the raw feed only works from residential IPs:
 *   1. raw feed XML (all ~20 items) — works locally, blocked in CI
 *   2. rss2json (already a site dependency — the homepage uses it): its
 *      servers fetch the feed from THEIR IPs, so it works in CI, but caps
 *      at 10 items
 * Either way, the fetched items are UNIONED with the cards already baked
 * between the markers (dedupe by URL, newest first), so the committed page
 * doubles as a persistent archive and a 10-item source loses nothing.
 * CAVEAT: if more than 10 posts are published between local re-bakes
 * (raw feed, full window), the overflow never transits rss2json's window —
 * re-run this script locally and commit the refreshed snapshot now and then.
 *
 * FAILS HARD (non-zero exit) on any anomaly — both sources failing, empty
 * feed, missing fields, non-Substack URLs, missing/duplicated markers. In
 * CI the build aborting means the previous deploy stays live, which beats
 * shipping a broken or empty writing page.
 *
 * Usage: node tools/build-writing.mjs        (Node ≥ 22, zero dependencies)
 *        BUILD_WRITING_FORCE_FALLBACK=1 …    (skip the raw feed; test the
 *                                             rss2json path from anywhere)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const FEED_URL     = 'https://drinkyouroj.substack.com/feed';
const RSS2JSON_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEED_URL)}`;
const LINK_PREFIX  = 'https://drinkyouroj.substack.com/';
const PAGE_PATH    = join(dirname(fileURLToPath(import.meta.url)), '..', 'writing.html');

const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRIES    = 1;     // extra attempts after the first
const EXCERPT_MAX      = 140;   // mirrors the homepage excerpt rule (main.js)

function fail(msg) {
  console.error(`build-writing: ${msg}`);
  process.exit(1);
}

// ── Fetch ──────────────────────────────────────────────────────────

// Browser-shaped headers: Substack sits behind Cloudflare, which 403s
// Node's default `node` user agent from datacenter IPs (GitHub runners) —
// the bare fetch works locally but not in CI.
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchText(url) {
  let lastErr;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return await res.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Raw feed first (full item window; works from residential IPs), rss2json
// second (10-item window; works from CI). See SOURCES in the header.
async function fetchItems() {
  if (!process.env.BUILD_WRITING_FORCE_FALLBACK) {
    try {
      return { source: 'raw feed', items: parseItems(await fetchText(FEED_URL)) };
    } catch (err) {
      console.warn(`build-writing: raw feed failed (${err.message}) — falling back to rss2json`);
    }
  }
  let data;
  try {
    data = JSON.parse(await fetchText(RSS2JSON_URL));
  } catch (err) {
    fail(`rss2json fetch failed too: ${err.message}`);
  }
  if (data.status !== 'ok' || !Array.isArray(data.items) || !data.items.length) {
    fail(`rss2json returned no usable items (status: ${data.status})`);
  }
  return { source: 'rss2json', items: data.items.map(normalizeRss2jsonItem) };
}

function normalizeRss2jsonItem(item, i) {
  const title   = String(item.title || '').replace(/\s+/g, ' ').trim();
  const url     = String(item.link || '').trim();
  const excerpt = toExcerpt(String(item.description || item.content || ''));
  // rss2json pubDate is "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker —
  // make the UTC explicit so local and CI runs parse identically.
  const raw  = String(item.pubDate || '').trim();
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(' ', 'T') + 'Z' : raw);

  if (!title)                       fail(`rss2json item ${i + 1}: missing title`);
  if (!url.startsWith(LINK_PREFIX)) fail(`rss2json item ${i + 1}: unexpected link "${url}"`);
  if (Number.isNaN(date.getTime())) fail(`rss2json item ${i + 1}: bad pubDate "${raw}"`);

  return { title, url, date, excerpt };
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

// Exact inverse of escapeHtml — only ever applied to values this script
// escaped on a previous run.
function unescapeHtml(s) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

// ── Archive union ──────────────────────────────────────────────────
// The committed page doubles as the archive: read back the cards baked on
// previous runs so a capped source (rss2json's 10-item window) never drops
// older posts from the page.

const CARD_RE = new RegExp(
  '<a\\s+href="([^"]+)"[\\s\\S]*?'
  + '<time class="writing-date" datetime="([^"]+)">[^<]*</time>\\s*'
  + '<h3 class="writing-title">([\\s\\S]*?)</h3>\\s*'
  + '<p class="writing-excerpt">([\\s\\S]*?)</p>', 'g');

function parseBakedCards(page) {
  const start = page.indexOf('FEED:START');
  const end   = page.indexOf('FEED:END');
  if (start === -1 || end === -1) return []; // splice will fail loudly later
  const region = page.slice(start, end);
  return [...region.matchAll(CARD_RE)].map(([, url, datetime, title, excerpt]) => ({
    title:   unescapeHtml(title.trim()),
    url:     unescapeHtml(url),
    date:    new Date(datetime),
    excerpt: unescapeHtml(excerpt.trim()),
  })).filter(c => c.url.startsWith(LINK_PREFIX) && !Number.isNaN(c.date.getTime()));
}

function unionByUrl(fresh, baked) {
  const seen = new Set(fresh.map(i => i.url));
  return [...fresh, ...baked.filter(i => !seen.has(i.url))];
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

const { source, items: fresh } = await fetchItems();
if (!fresh.length) fail('feed parsed to zero items');

let page = readFileSync(PAGE_PATH, 'utf8');
const baked = parseBakedCards(page);
const items = unionByUrl(fresh, baked).sort((a, b) => b.date - a.date);

page = spliceBetween(page, 'FEED:START', 'FEED:END', items.map(renderCard).join('\n'));
page = spliceBetween(page, 'JSONLD:START', 'JSONLD:END', renderJsonLd(items));
writeFileSync(PAGE_PATH, page);

console.log(`build-writing: baked ${items.length} posts into writing.html `
          + `(${fresh.length} via ${source}, ${items.length - fresh.length} from the baked archive; `
          + `newest: "${items[0].title}", ${items[0].date.toISOString().slice(0, 10)})`);
