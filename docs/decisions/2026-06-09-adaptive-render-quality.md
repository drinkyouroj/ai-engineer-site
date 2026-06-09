# DECISION: Adaptive render quality for software-rendered browsers

**Date:** 2026-06-09
**Status:** Accepted

## Context

After the Brave perf fixes shipped (see
`2026-06-09-brave-perf-and-render-telemetry.md`), the reported jank persisted
on the reporting machine. Systematic debugging found the real root cause there:
**graphics acceleration was disabled in that Brave profile**
(`hardware_acceleration_mode: {enabled: false}` in Local State; the running GPU
process had `--use-gl=disabled`). Controlled A/B on the live site (fresh
profiles, dpr 2, maximized):

| Config | Hero idle | Scroll | Worst frame |
|---|---|---|---|
| GPU on | 60 fps | 60 fps | 17.8 ms |
| GPU off | 36 fps | 33 fps | 51–67 ms |

rAF JS time in the GPU-off run was 0.22 ms/frame — the page's JavaScript is
not the bottleneck; CPU compositing of ~12 megapixels is. The user-side fix is
re-enabling acceleration, but the *class* of visitor (acceleration off,
blocklisted GPU, VM/remote desktop) is real and the site can defend itself.

## Options Considered

1. **Do nothing; document the brave://settings toggle** — zero risk, but every
   software-rendered visitor gets a 33–36 fps experience indefinitely.
2. **Static detection up front** (probe for software rendering via
   WebGL renderer string, etc.) — fingerprinting-adjacent, unreliable across
   browsers/privacy modes, and punishes capable machines that match the
   heuristic.
3. **Adaptive degradation from measured FPS** (chosen) — react to the symptom
   itself, after the fact, with bounded fidelity loss.

## Decision (AAP summary)

**ARCHITECT:** a one-way quality ratchet inside the hero's existing 500 ms
telemetry accounting window (no new rAF loop):

- Trigger: 6 *consecutive* 500 ms windows under 45 fps, after a 2 s warmup.
  Windows longer than 1.5 s (hidden tab / paused rAF) are discarded.
- **Level 1:** cap the visible canvas dpr at 1 — quarters the software-raster
  area of the upscale `drawImage`. The low-res simulation buffer is untouched:
  ribbon paths, speed, and colors are bit-identical; pixelation gets coarser
  on Retina displays.
- **Level 2:** freeze the film grain via `html.render-lite` (`animation: none`
  on `body::after`) — grain remains visible as static texture, the
  full-viewport re-composite every 80 ms stops.
- One-way ratchet, capped at level 2; page reload resets. Telemetry line shows
  a `LITE` badge while degraded.

**ADVERSARY objections and resolutions:**
1. *False positives permanently degrade capable machines.* → Warmup clears the
   load transient; six consecutive bad windows means sustained starvation, not
   a spike. The GPU-on control run is a merge gate. Worst case is bounded:
   coarser pixels + static grain.
2. *Hidden-tab rAF throttling reads as ~1 fps on return.* → The >1.5 s
   stale-window guard discards exactly those windows.
3. *Coarser pixelation contradicts the perf PR's "pixel-identical" bar.* →
   That bar governed unconditional changes for all visitors. This change is
   conditional on a measured failure state, badged (`LITE`), documented, and
   the simulation itself stays identical. The alternative being preserved is
   33 fps jank, not the pristine look.
4. *Silent divergence confuses bug reports.* → The always-visible telemetry
   line carries the `LITE` badge; thresholds are recorded here.

**JUDGE:** approved with two merge gates: (1) GPU-off run shows the ratchet
engaging and FPS materially recovering; (2) GPU-on control at the same window
size completes with zero activations. Constants live next to the hero's `C`
config; only CSS addition is the `render-lite` rule (no new token values —
no new colors, sizes, or timings).

## Verification (merge gates, both passed)

Fresh Brave profiles, dpr 2 forced, maximized, local site, harness
`tools/measure-perf.mjs`:

| Run | First idle window | Post-adaptation idle | Scroll | Telemetry |
|---|---|---|---|---|
| `--disable-gpu` | 44.4 median / 33.9 min fps (ratchet engaging) | **60 fps, 17.7 ms worst** | **60 fps** (was 33/29.5 min) | `… · LITE` |
| GPU on (control) | 60 fps | 60 fps | 55.3 median; one 267 ms network spike **did not trip the ratchet** | no badge |

`prefers-reduced-motion` never starts the canvas loop, so the ratchet never
runs there (grain is already static via the tokens.css reduced-motion rule).
No-GSAP fallback unaffected.

## Consequences

- Software-rendered visitors converge to 60 fps within ~5 s of arriving,
  at the cost of coarser pixelation and static grain — both within the site's
  pixel aesthetic.
- Sessions that degrade stay degraded until reload (deliberate: no
  oscillation). If field reports ever show spurious `LITE` badges on capable
  hardware, the knobs are `ADAPT` in `main.js`.
- The harness gained `PERF_URL` / `EXTRA_BROWSER_ARGS` env overrides and now
  reports the page's telemetry line, so both gates are reproducible in one
  command each.
