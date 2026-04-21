# Build Log — ai-engineer-site

Append-only. One entry per session that makes meaningful changes.

---

## 2026-04-21 — Ribbon hero + sticky nav below marquee

### Done
- Replaced the ASCII-portrait hero with a sticky full-viewport **ribbon hero** ported from `digital-designer-portfolio/src/components/RibbonHero.tsx`: canvas flow-field animation (value-noise + color-adjusted ribbons + scanlines), parallax wordmark (`JUSTIN [character] HEARN`), `LET'S BUILD!` speech bubble, live clock + mix-blend-mode meta strips, `▼ SCROLL` hint
- Added scrolling **marquee** below the hero (pure CSS `@keyframes` + tripled row)
- Moved `<header class="nav-header">` out of its pre-`<main>` slot into a new `.content-scroll` wrapper **below the marquee**; switched from `position: fixed` to `position: sticky; top: 0;` so it travels with the page and pins on contact with the viewport edge
- Ported `RibbonHero.tsx` to vanilla JS (`setupRibbonHero` in `main.js`): framer-motion `useScroll`/`useTransform` → scroll listener + rAF driving `.ribbon-ui` `translate3d`; canvas rAF paused via `IntersectionObserver` when hero off-screen
- Copied `character.png` (4.8 MB — flagged for optimization) from `digital-designer-portfolio/public/`
- Removed dead code per CLAUDE.md: old GSAP hero timeline, `scrambleText()`, `setupNav()` + `.scrolled` toggle, `.hero-float` / `.hero-ascii` / `.hero-glow` CSS, `floatDrift` / `scrollBounce` keyframes
- Dev-server port moved to `3030` in `.claude/launch.json` (avoids collision with the Next.js dev server on 3000)

### Decisions
- **AAP → Option A.** Rather than migrate `design-project-2` to Next.js to host `RibbonHero.tsx` natively, we ported the hero down into the vanilla stack. `design-project-2` is the canonical deployed site (CNAME, sitemap, indexed URLs); CLAUDE.md mandates "intentionally vanilla, no build step" — reversing that would itself require a DECISION doc; the hero is the only piece of `digital-designer-portfolio` worth adopting, so porting the hero is strictly cheaper than platform migration.
- **Parallax math preserved:** `translateY(min(scrollY, vh) * -0.55)` matches the framer-motion `useTransform([0, vh], [0, -vh * 0.55])` in the original. Wordmark meets the rising content-scroll wrapper at `scrollY = vh`.
- **Sticky-hero layering** uses `.ribbon-hero { position: sticky; top: 0; height: 100vh; z-index: 1 }` + `.content-scroll { position: relative; z-index: 10; background: var(--color-bg-primary) }`. Content slides over the canvas on scroll with no JS scroll math.
- **Nav is now solid from the start** — no blur-in-on-scroll state since it's no longer overlaying the hero canvas. Keeps `backdrop-filter` for the pinned feel over the scrolling content.

### Next
- Optimize `character.png` (4.8 MB → target <500 KB; consider WebP or pixel-accurate PNG re-export)
- Narrow-viewport check: wordmark `white-space: nowrap` can clip "JUSTIN"/"HEARN" edges on small screens — acceptable for now but worth a responsive size curve
- Consider a formal `docs/decisions/` note transcribing this session's AAP, per CLAUDE.md

---

## 2026-04-07 — Initial build through SEO foundation

### Done
- Initial portfolio build: single-page HTML/CSS/JS with GSAP animations, design token system, ASCII portrait hero, project cards, live Substack RSS feed, testimonials
- UX audit: font loading optimization, skeleton screens
- Added SEO foundation: JSON-LD Person schema (index.html), robots.txt, sitemap.xml
- Created `pkm-llm-wiki.html` — standalone Article page targeting Karpathy/LLM wiki keywords, with Article JSON-LD schema and ~400-word essay teaser
- Created `writing.html` — curated writing index (tech + Help Desk for the Singularity fiction)
- Pinned static PKM card to homepage writing grid; updated `fetchWritingPosts()` to preserve it and filter duplicate from RSS
- Added article/sub-page CSS to `style.css` (`.article-*`, `.writing-page-*` classes)
- Fixed writing/project grid layout: removed 2-column breakpoint, grids now jump 1-column → 3-column at ≥1024px
- Stacked writing footer links vertically
- Migrated all URLs from `drinkyouroj.github.io` to `www.justin.hearn.me`
- Added `justin_hearn.svg` headshot to Person schema; added `pkm-llm-wiki-og-image.svg` to Article schema and OG tags
- Added CLAUDE.md

### Decisions
- Standalone HTML pages over SPA routes — GitHub Pages has no server, static files are simplest and each page gets its own indexable URL
- 1→3 column grid (no 2-column middle state) — prevents orphaned cards when content count is exactly 3
- Static featured card in writing grid rather than RSS-only — gives control over which post leads and where it links (portfolio page vs. Substack directly)
- New domain `justin.hearn.me` chosen for SEO: name in domain is a ranking signal for personal brand queries

### Next
- Submit sitemap.xml in Google Search Console
- Write additional essay pages (sysadmin-to-AI, vibe coding vs. engineering)
- GhostEditor case study page
- Monitor Karpathy/LLM wiki keyword rankings for pkm-llm-wiki.html
