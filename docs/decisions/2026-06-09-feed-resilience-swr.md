# DECISION: Stale-while-revalidate resilience for the Writing + Testimonials feeds

**Date:** 2026-06-09
**Status:** Accepted

## Context

Two homepage sections render from live network data and both are fragile:

- **Writing** (`fetchWritingPosts()`) pulls the Substack feed through the public
  rss2json proxy — single point of failure, variable latency (2.7s measured on a
  *healthy* request), no timeout, no retry, no cache.
- **Testimonials** (`fetchTestimonials()`) fetches an index + per-item JSON from
  drinkyouroj.github.io with `cache: 'no-store'` — always hits the network.

Measured before-state (CDP harness, `tools/test-feeds.mjs`, on `main` @ 752fa3d):

| Scenario | Behavior |
|---|---|
| Baseline | No cache of any kind (`localStorage` empty) — every visit is a cold load |
| In-view swap, Writing | CLS 0.024 — skeleton count (static + 3) ≠ final count (static + 2); the 3-col row collapse shifts content below |
| In-view swap, Testimonials | CLS 0.196 total / 0.139 in-section — skeletons shorter than real cards |
| Offline / 500 / malformed | Error fallback shown **and the pinned `data-static` featured card is destroyed** (catch path calls `grid.replaceChildren()`) |
| Slow proxy | Skeletons hang forever (no timeout) |
| Repeat visit + failure | Identical to cold failure — last-good data is never reused |

Two latent bugs were also confirmed: the error path violates the CLAUDE.md
invariant that the static featured card always leads the Writing grid, and
dynamically injected cards run the GSAP entrance reveal even under
`prefers-reduced-motion` (the reduced-motion `gsap.set` at init runs before the
cards exist).

This change touches `fetchWritingPosts()` and the static/dynamic card mix, so
the Adversarial Agent Protocol applies (AAP transcript summarized below).

## Options Considered

1. **Service Worker with a real network-layer SWR cache**
   - Pros: transparent to app code; caches images too; works for HTML.
   - Cons: new file + registration lifecycle on a deliberately no-build site;
     GitHub Pages scope and update semantics are easy to get wrong; massive
     hammer for two JSON feeds. Rejected.

2. **HTTP `Cache-Storage` API (`caches.open`) without a SW**
   - Pros: built for responses.
   - Cons: stores raw responses, not the normalized card shape — a card-shape
     change in JS would still render broken markup from a "valid" cached
     response; async API complicates the instant-paint path. Rejected.

3. **localStorage SWR with normalized, schema-stamped payloads** *(chosen)*
   - Pros: synchronous read = cached cards paint in the same frame the loader
     runs; payload is the exact shape the renderer consumes, so one
     `FEED_CACHE_SCHEMA` constant honestly describes compatibility; ~3 KB total;
     zero new dependencies; degrades to today's behavior wherever storage is
     blocked (every access is try/catch-wrapped).
   - Cons: no TTL (see Consequences); per-origin quota shared with other
     site state (trivial at this size).

## Decision

One shared loader in `main.js`, applied to both feeds:

- `fetchJsonRetry(url)` — `AbortController` timeout **6000 ms** per attempt
  (rss2json answers in ~2–3 s when healthy; 3–4 s would abort live responses),
  **1 retry** with **1000 ms** backoff (doubling). Retries cover network errors,
  timeouts, and 5xx only — **4xx never retries** (rss2json rate-limits; retrying
  a 429 compounds it). These are named JS constants beside the helper —
  network tuning, not design tokens, per CLAUDE.md.
- `feedCacheRead/Write` — `localStorage` key `feed:<name>`, payload
  `{schema, savedAt, items}`. `schema !== FEED_CACHE_SCHEMA` reads as a miss,
  so a future card-shape change invalidates stale cache instead of rendering
  broken markup. Items are normalized card shapes, not raw API responses.
- `loadFeedSWR` — cached content renders immediately (warm visits paint before
  any network), then revalidates in the background. Re-render happens **only
  when the normalized JSON differs**. Failures keep displayed cache; the
  link-out fallback is reserved for cold-cache + failure.
- Both feeds split into `fetchFresh()` (network + normalize + validate; throws
  on malformed or empty payloads) and `render(items, {entrance})`. First render
  of a page view keeps the existing GSAP entrance reveal; reconcile re-renders
  crossfade via CSS only (works in the no-GSAP fallback too).

Layout-shift fixes:

- Writing skeletons reduced 3 → 2 so skeleton state matches final state
  (static + 2 = 3 items; no second-row collapse on desktop).
- Testimonial skeletons calibrated against measured rendered card heights.
- `aria-busy="true"` on both grids until first render — suppresses partial
  announcements in the existing `aria-live="polite"` regions.

New visual values introduced and tokenized in `tokens.css`:

- `--duration-feed-crossfade` — the reconcile crossfade timing.

Skeleton internal line dimensions follow the existing raw-px idiom of the
SKELETON block in `style.css` (heights/widths there are deliberately local
mock-content measurements, not design-system values); tokenizing only the new
lines while their twenty neighbors stay raw would make the block harder to
maintain, not easier.

Invariant fixes folded in (required by CLAUDE.md, found broken in before-state):

- The static featured card is captured before any DOM mutation and re-attached
  first in **every** render path, including the error fallback.
- Injected-card animation honors `prefers-reduced-motion` (instant show, no
  reveal/crossfade) and the no-GSAP path (cards get no `reveal` class, so they
  are never stranded at `opacity: 0` / `translateY(32px)`).
- GSAP tweens/ScrollTriggers from a previous render are killed before a
  reconcile re-render (no triggers left on detached nodes).

## AAP Summary

**ADVERSARY objections and rulings (JUDGE):**

1. *Stale-forever cache (no TTL)* — **accepted trade-off**: stale-on-failure is
   the requirement; content is public; staleness is bounded by the next healthy
   visit. A TTL reintroduces the blank-section failure this change removes.
2. *Reconcile rug-pull (re-render mid-interaction, double `aria-live`
   announcement)* — **resolved by construction**: reconcile only fires when
   content actually changed, which for these feeds is rare (a new post).
   Residual risk accepted and documented.
3. *Shared schema constant invalidates both feeds* — **accepted**: cost is one
   cold fetch; per-feed versions are complexity without payoff at this scale.
4. *JSON string equality fragile against API key-order/format drift* —
   **resolved by construction**: comparison runs on our normalized shape with
   fixed key order, not raw API JSON.
5. *Safari private mode / quota errors* — **resolved**: every storage access is
   try/catch-wrapped; reads degrade to cold behavior, writes are best-effort.

**Verdict:** localStorage SWR in `main.js`, no new dependencies, no TTL.

## Consequences

- Repeat visitors see last-good content instantly (pre-network paint) and keep
  it through proxy outages, timeouts, 500s, and offline; the link-out fallback
  becomes a cold-cache-only state.
- A retracted post/testimonial can persist for a returning visitor until their
  next *successful* revalidation. Acceptable for public portfolio content.
- Changing a normalized card shape now requires bumping `FEED_CACHE_SCHEMA`
  (one constant; forgetting it risks old-shape cache hitting new render code —
  the stamp exists precisely so the failure is a cache miss, not broken markup).
- Skeleton counts are coupled to live feed sizes (2 RSS cards by design,
  3 testimonials currently). If the testimonial count changes, the skeleton
  count in `index.html` should change with it — noted in the markup comment.
- `tools/test-feeds.mjs` joins `measure-perf.mjs` as a repeatable harness for
  feed failure modes and per-section CLS; evidence in the PR and build_log.

## Measured Results (after, same harness)

In-view skeleton→content swap CLS (feed responses held until the section is
scrolled into the viewport, then released):

| Section | Before | After |
|---|---|---|
| Writing | 0.024 | **0.0007** |
| Testimonials | 0.196 total / 0.139 in-section | **0.000** |

Skeleton↔card height parity: writing 254px / 254px, testimonials 442px / 449px
(7px residual hides inside the grid row's tallest-card slack).

Failure modes (cold cache → link-out fallback **with the static featured card
now preserved and leading**; warm cache → full content, no error):

| Scenario | Cold | Warm (was: error fallback for all) |
|---|---|---|
| Offline | fallback + static card | 3 + 3 cards, CLS 0.0013 |
| HTTP 500 | fallback + static card | 3 + 3 cards |
| Malformed feed | fallback + static card | 3 + 3 cards |
| Slow (held 90s) | fallback at ~13s (was: skeletons forever) | cards from cache at 3s, still there at 15s |

Warm instant render: with feed requests held indefinitely, both sections show
full cached content at the 3s snapshot — content paints before the network
returns anything.

Accessibility paths (verified via CDP): GSAP CDN blocked → all cards
`opacity: 1`, no `translateY(32px)` stranding (fixes a pre-existing no-GSAP
bug); `prefers-reduced-motion` forced → cards render instantly with no reveal
animation (fixes a pre-existing violation for injected cards).
