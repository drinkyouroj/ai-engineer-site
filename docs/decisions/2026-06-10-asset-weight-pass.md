# DECISION: Asset-weight pass — hero SVG, schema headshot, article OG image, dead assets

**Date:** 2026-06-10
**Status:** Accepted

## Context

The image-weight item has sat in `build_log.md` "Next" since April. Measured on `main`
@ `5894181` (localhost, Fast-3G-ish throttle — 1.6 Mbps / 150 ms RTT / 4× CPU — via
`tools/measure-lcp.mjs`, median of 3 runs):

| Page | LCP element | LCP | Total transfer |
|---|---|---|---|
| `index.html` | `span.wordmark-word` — **text**, not the image | 1484 ms | 518 KB |
| `pkm-llm-wiki.html` | `<p>` body text | 764 ms | 74 KB |

Lighthouse (before): homepage performance **79** / BP 100 / SEO 100, LCP 4.5 s,
627 KiB total; article page 100/100/100.

| Asset | Bytes | Dims | Used by |
|---|---|---|---|
| `character.svg` | 331,807 | 832×1248, 536-path vector illustration | hero `<img>`, `index.html:87` — 64% of homepage bytes |
| `justin_hearn.png` | 12,974,860 | 2986×4000 | Person JSON-LD `image` only (`index.html:37`) |
| `pkm-llm-wiki-og-image.png` | 1,844,740 | 1344×768 (1.75:1) | OG + Twitter + Article-schema image |
| `justin_hearn.svg` | 1,235,032 | — | referenced nowhere |
| `pkm-llm-wiki-og-image.svg` | 586,537 | — | referenced nowhere |
| `og-image.png` | 85,881 | 1200×630 | fine — untouched |

Key facts that shaped the decision:

- The homepage **LCP element is the wordmark text**, not `character.svg`. The SVG is
  the biggest resource but it does not gate LCP; the render-blocking Google-Fonts CSS
  and `style.css` do.
- `justin_hearn.png` (12 MB) and the OG image are never downloaded by browsers — they
  are fetched by Googlebot and social scrapers, where 12 MB / 1.8 MB payloads are
  effectively broken (scrapers truncate or skip; LinkedIn/X card previews can fail).
- The OG image's 1.75:1 aspect doesn't match the 1.91:1 (1200×630) OG sweet spot.

## Options Considered

1. **Preload / `fetchpriority="high"` the hero SVG** — pro: image finishes sooner;
   con: LCP is the *text*, so boosting a non-LCP decoration can only steal bandwidth
   from the font CSS + `style.css` that gate the real LCP. A/B measured (see
   Consequences): preload regressed LCP. **Rejected by measurement.**
2. **Convert PNGs to JPEG/WebP/AVIF** — pro: 30–40% smaller at same quality; con:
   changes the canonical URLs baked into Google's structured-data index and social
   caches. The brief prioritizes URL stability. **Rejected.**
3. **Optimize in place at the same paths** — SVGO-minify the SVG; resize + palette-
   quantize (Floyd–Steinberg dither) the PNGs to spec dimensions under 200 KB.
   One-time dev-side CLI transforms, committed; originals remain in git history.
   **Accepted.**
4. **Keep the orphaned SVGs** — pro: none found (referenced nowhere; grep across
   html/css/js/xml/txt/json); con: 1.8 MB of dead weight in HEAD. **Rejected —
   deleted; recoverable via git history.**

## Decision

- `character.svg`: `npx svgo --multipass` in place (324 KB → ~195 KB), gated on a
  pixel-level screenshot diff showing no visible change. The hero `<img>` gains
  intrinsic `width="832" height="1248"` and `decoding="async"`. **No preload, no
  fetchpriority** — justified by the A/B numbers below.
- `justin_hearn.png`: ImageMagick resize to 896×1200 (1200 px long edge) +
  `png8:` Floyd–Steinberg quantization, same path, target <200 KB, visual gate.
- `pkm-llm-wiki-og-image.png`: resize to 1200 px wide, center-crop to 1200×630
  (exact 1.91:1), quantize <200 KB, same path, crop inspected visually
  (letterbox fallback if content would be lost).
- Delete `justin_hearn.svg` / `pkm-llm-wiki-og-image.svg`. (Discovered during
  implementation: both were **untracked** working-tree leftovers — never committed,
  never deployed — so this is a local `rm`, not a `git rm`; no commit carries it.)
- New dev-side harness `tools/measure-lcp.mjs` (CDP + buffered
  `largest-contentful-paint` PerformanceObserver) committed alongside
  `tools/measure-perf.mjs`; no runtime dependency added.

Tooling used (one-time, dev-side only): `svgo` via `npx`, ImageMagick `magick`,
`sips` for verification, headless Chrome for screenshots/measurement. No build step,
no site dependency.

## Consequences

- Homepage transfer drops ~64% → text-LCP unchanged-or-better; bandwidth freed for
  the resources that do gate LCP.
- Schema/OG images become actually fetchable by crawlers and scrapers at the same
  canonical URLs; OG card hits the exact 1200×630 spec.
- The 12 MB original headshot lives only in git history; future re-derivations
  (e.g. a WebP variant) must pull from `git show main~N:justin_hearn.png` or the
  original source file.
- Quantized PNGs trade some color depth for bytes; accepted after visual inspection.

### Measured results (after)

| Asset | Before | After | Δ |
|---|---|---|---|
| `character.svg` | 331,807 B | 200,143 B | −39.7% (pixel diff: 13/1,038,336 px, RMSE 0.0003) |
| `justin_hearn.png` | 12,974,860 B @ 2986×4000 | 195,192 B @ 672×900 | −98.5% |
| `pkm-llm-wiki-og-image.png` | 1,844,740 B @ 1344×768 | 181,579 B @ 1200×630 | −90.2%, exact 1.91:1 |

| Measurement (throttled harness, median) | Before | After |
|---|---|---|
| Homepage transfer | 518,552 B | 386,931 B (−25.4%) |
| Homepage LCP (text-gated) | 1484 ms | 1472 ms (unchanged within noise, as predicted) |
| Article page transfer | 74,516 B | unchanged (OG image is meta-only; browsers never fetch it) |

| Lighthouse | Before | After |
|---|---|---|
| Homepage perf / BP / SEO | 79 / 100 / 100 | **83** / 100 / 100 |
| Homepage LCP / total | 4.5 s / 627 KiB | 3.9 s / 498 KiB |
| Article perf / BP / SEO | 100 / 100 / 100 | 100 / 100 / 100 (LCP 1.5 → 1.4 s) |

**Preload A/B (5 runs per variant, throttled):** no-preload median LCP **1472 ms**
vs `<link rel="preload" as="image" fetchpriority="high">` **1484 ms** — no benefit
(within noise, nominally worse). Preload omitted.
