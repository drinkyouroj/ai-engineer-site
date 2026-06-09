# DECISION: Brave-targeted render-pipeline fixes + live render telemetry

**Date:** 2026-06-09
**Status:** Accepted

## Context

The site is smooth in Chrome but noticeably degraded in Brave: the hero swirl is
janky and page scrolling stutters. Brave shares Chromium with Chrome, so the gap
is Brave-layer cost: Brave's fingerprint defenses hook the canvas pipeline
*per operation* (cost scales with draw-call count, not painted pixels), and Brave
is less forgiving of expensive always-on compositor properties.

Profiling (dev overlay + CDP driver, see *Measurement* below) confirmed where the
budget went:

- **343 canvas draw calls/frame** (Chrome, dpr 2) — ~270 of them re-drawing a
  *static* scanline pattern via a `fillRect` loop under
  `globalCompositeOperation = 'multiply'` (`main.js step()`).
- **~75 HSL color conversions/frame** (`adjustColor(hexToRgb(...))`) on inputs
  that are compile-time constants.
- `mix-blend-mode: difference` on `.ribbon-meta` / `.ribbon-scroll-hint` — a
  compositor re-blend against the canvas on every animation frame.
- `backdrop-filter: blur(12px) saturate(180%)` on the sticky nav — backdrop
  re-sampled on every scroll frame (the scroll-stutter suspect).
- Film grain `body::after` at 200%×200% of the viewport — a 4×-viewport texture
  above everything, re-composited at every `grainShift` step (~12.5×/s).

The decisive baseline measurement: at 20× CPU throttle, **Chrome and Brave spend
the same rAF JS time (~2.5 ms/frame), but Brave drops vsyncs (worst frame
33.2 ms) where Chrome drops none (17.7 ms)** — with Brave drawing *fewer* ops
(209 vs 343; its test window opened at dpr 1). Same JS, same machine: the
difference is Brave's per-op pipeline cost. Shrinking the op count is the
Brave-specific lever.

## Options Considered

### Performance fixes (AAP)

**ARCHITECT** proposed five fixes; **ADVERSARY** objections and resolutions:

1. **Scanlines → pre-rendered `CanvasPattern`** (~270 draws → 1).
   *Objection: "pixel-identical" asserted, not proven.* Resolved with a
   `getImageData` equivalence test (headless Chrome): geometry identical; max
   per-channel delta **1/255 on 1.3 % of pixels** — the floor for Skia
   pattern-shader vs direct-fill rounding, below perceptual threshold. Claimed
   as *perceptually* identical, not byte-identical.
2. **Precompute ribbon colors** (palette × config are constants → cache
   `rgb()` strings + `r,g,b` trail prefixes at setup). No objection survived.
3. **Drop `mix-blend-mode: difference`** on the meta strips, replace with a
   `--shadow-text` token. *Objection: visible change — meta text no longer
   color-inverts when ribbons pass under it.* JUDGE accepted as a disclosed
   tradeoff: the task protects the *swirl* aesthetic; strips stay white-on-dark
   ~95 % of the time. Separate commit for easy revert.
4. **Drop sticky-nav `backdrop-filter`**, raise `--color-nav-bg` alpha
   0.85 → 0.92. *Objection: frosted-glass look changes sitewide.* Accepted:
   dark-blur-over-dark was barely perceptible; separate commit for easy revert.
5. **Shrink grain layer 200 % → 112 %** via new `--grain-bleed: 6%` token
   (keyframes translate at most ±5 % of the layer). ~70 % less texture memory
   and composite area; visually identical (random tiled noise).

*Objection (cross-cutting): CPU throttle can't measure compositor/GPU wins, so
the PR must not claim measured numbers for #3–#5.* Accepted — see Consequences.

### Visible upgrade (AAP)

- **A — Scroll-velocity-reactive swirl.** Rejected: the sticky hero is being
  covered exactly when the effect fires; visible to nobody.
- **B — Live render telemetry in the hero meta strip.** Real numbers from the
  actual render loop (`RENDER 60FPS · 73 DRAWS/F · 480×270`) as a third
  meta-strip line. **Chosen.**
- **C — Wordmark as flow obstacle.** Rejected: endangers the protected swirl
  aesthetic; box-repulsion looks crude without glyph masking (real scope).

JUDGE's required changes for B (all implemented): measured numbers only, no
hardcoded values; `aria-hidden="true"` (decorative, matches the live-dot
precedent); `font-variant-numeric: tabular-nums` so the line doesn't jitter;
under `prefers-reduced-motion` the canvas never runs and the line honestly
reads `RENDER PAUSED · REDUCED MOTION` (verified via CDP media emulation).

## Decision

Ship all five fixes (four commits, #3/#4 independently revertable) plus the
telemetry line. The story is one piece: the perf work made the render loop
cheap and *measurable*; the telemetry makes that measurement part of the
design — on-brand for a systems-engineering portfolio built on observability.

## Measurement

Instrument: dev-only overlay (`?debug=perf` or `localStorage.perfDebug='1'`)
reporting rolling FPS, avg/worst frame time, rAF-callback ms (debug-only rAF
wrapper), and canvas draws/frame (debug-only
`CanvasRenderingContext2D.prototype` patch). Driver: `tools/measure-perf.mjs`
(CDP, Node ≥22) — idle, CPU-throttled idle, and synthetic-wheel-scroll phases.
Test rig: M-series MacBook, fresh profiles, 1440×900, both browsers measured
sequentially with identical flags.

| Metric (hero idle)                | Chrome before | Chrome after | Brave before | Brave after |
|-----------------------------------|--------------:|-------------:|-------------:|------------:|
| Canvas draws/frame                | 343           | **73 (−79 %)** | 209 (dpr 1)  | **73 (−65 %)** |
| rAF JS ms/frame                   | 0.26          | 0.17         | 0.26         | 0.20        |
| rAF JS ms/frame @ 20× throttle    | 2.52          | **1.56 (−38 %)** | 2.47     | **1.42 (−43 %)** |
| Worst frame @ 20× throttle        | 17.7 ms (no drops) | 17.7 ms | **33.2 ms (dropped vsyncs)** | **17.7 ms (no drops)** |
| Median FPS (all phases)           | 60            | 60           | 60           | 60          |

Headline: **Brave was dropping frames at the 20× stress level before; after,
it holds every vsync** — and the farbling-taxed surface (canvas ops/frame)
shrank 65–79 %. Unthrottled FPS was already pegged at 60 on this fast test rig
in both browsers, which is why the throttled phase exists: it models the
mid-range hardware where the user-visible Brave jank lives.

**Measured vs reasoned:** draws/frame, rAF JS ms, and dropped frames above are
measured. The wins from removing `difference` blending, the backdrop blur, and
shrinking the grain layer are compositor/GPU-side, which CPU throttling cannot
capture — those are reasoned from Chromium rendering behavior (per-frame
backdrop re-sampling, blend-group isolation, composited-texture size), not
claimed as numbers.

## Consequences

- The hero swirl is perceptually unchanged (equivalence-tested); the render
  loop now costs ~73 draw calls/frame regardless of viewport height.
- Two disclosed look changes outside the swirl: meta text no longer inverts
  over ribbons (now shadow-backed white), and the nav is slightly more opaque
  with no frosted blur. Each lives in its own commit for cheap revert.
- New tokens: `--shadow-text`, `--grain-bleed`; `--color-nav-bg` value bumped.
- The site gains a permanent, honest perf instrument (`?debug=perf`) and a
  reproducible cross-browser measurement script (`tools/measure-perf.mjs`,
  dev-only, requires Node ≥22 — the site itself still has no build step).
- The telemetry line is a small ongoing honesty constraint: if the hero gets
  more expensive, the number on the page goes up. That is the point.
