# DECISION: Port Ribbon Hero from `digital-designer-portfolio` into vanilla stack

**Date:** 2026-04-21
**Status:** Accepted

## Context

`design-project-2` is the canonical deployed site at `www.justin.hearn.me`
(GitHub Pages, CNAME-mapped, sitemap indexed). Its hero was a centered ASCII
portrait with floating terminal snippets — a quiet, text-first opener.

`digital-designer-portfolio` is a separate Next.js + TypeScript + framer-motion
design study. Its `RibbonHero` component produces a full-viewport canvas
flow-field animation, a bold parallax wordmark (`JUSTIN [character] HEARN`),
and a "LET'S BUILD!" speech bubble — a much louder, more visual opener.

The user asked to replace the deployed site's hero with the one from the
design study, and to move the nav bar below a scrolling marquee so it "stops
when it reaches the top of the page."

The question: **port the React hero down into the vanilla stack, or migrate
the deployed site up onto Next.js?**

## Options Considered

### Option A — Port React hero → vanilla HTML/CSS/JS
- **Pros**
  - Keeps the stated architectural principle in CLAUDE.md (*"intentionally
    vanilla. No build step, no bundler."*) intact.
  - Keeps all existing content (about, how-i-work, projects, live RSS writing,
    live RSS testimonials, contact), sub-pages (`pkm-llm-wiki.html`,
    `writing.html`), and SEO assets (sitemap, JSON-LD Person schema,
    canonicals) untouched.
  - Keeps the GitHub Pages deploy, CNAME, and indexed URLs stable.
  - Bounded to one focused session: canvas math ports verbatim, framer-motion
    `useScroll`/`useTransform` → scroll listener + `requestAnimationFrame`,
    marquee → pure CSS `@keyframes`.
- **Cons**
  - Two sites now contain the same hero in two different stacks. If both stay
    live, every tweak has to be double-maintained.
  - The canvas animation adds ~400 lines of JS to what was a lean site.

### Option B — Migrate `design-project-2` onto Next.js
- **Pros**
  - Keeps the hero in its native React form; no porting cost.
  - Unlocks future React ergonomics (component library, typed routes, image
    optimization).
- **Cons**
  - Violates a stated architectural principle in CLAUDE.md. That alone
    requires its own DECISION doc before proceeding.
  - Live RSS via `rss2json` is currently client-side; moving to Next.js either
    keeps it client-side (no gain) or requires new API routes + caching — a
    non-trivial rewrite of `fetchWritingPosts` / `fetchTestimonials`.
  - SEO regression risk during the cutover: canonicals, sitemap, OG images,
    and Search Console signal are all tied to currently-indexed URLs.
  - Next.js → GitHub Pages requires `output: "export"`, which disables the
    server features (ISR, image optimization) that would justify the migration.
    End state: a build step with no runtime benefit.
  - Most of `design-project-2`'s content (About, How-I-Work, 3 projects,
    writing RSS, testimonials RSS, contact, sub-pages) has no analog in
    `digital-designer-portfolio` and would need to be rebuilt, not ported.
  - Effort: several sessions, plus a new deploy pipeline.

## Decision

**Option A.** Port the `RibbonHero` component from React into vanilla JS,
place it inside `design-project-2`, and retire the ASCII hero.

The deciding factors, in order of weight:

1. `design-project-2` is the canonical deployed site with SEO inertia; the
   other repo is a design exploration. Porting *toward* the canonical site
   is almost always cheaper than migrating the canonical site *onto* another
   stack.
2. CLAUDE.md mandates vanilla/no-build. Flipping that would itself need
   its own DECISION doc and AAP — a strict prerequisite, not a side quest.
3. Option A is bounded; Option B is a platform migration.
4. The hero is the only piece of `digital-designer-portfolio` worth adopting.

## Consequences

### What becomes easier
- The full-viewport sticky-hero-plus-parallax-content pattern is now available
  for any future section that wants it (`position: sticky` + higher-z
  `.content-scroll` wrapper, no JS scroll math).
- The nav lost its JS-driven `.scrolled` blur-in state. `position: sticky;
  top: 0;` gets the same "pin on contact" behavior for free.

### What becomes harder
- Canvas animation code in `main.js` grows the script weight. Offsetting this:
  `IntersectionObserver` pauses the canvas rAF when the hero scrolls
  off-screen, so off-hero pages pay nothing per frame.
- `character.png` is a new asset dependency. Resized on import from
  2048×2048 / 4.8 MB → 720×720 / 542 KB; `image-rendering: pixelated`
  preserves the chunky character aesthetic.
- If `digital-designer-portfolio` stays active as a design study, any hero
  improvement there will need to be re-ported here. Realistically: that repo
  becomes reference-only.

### What stays the same
- All existing content, sub-pages, SEO assets, JSON-LD schema, sitemap,
  canonicals, CNAME, deploy target.
- The `tokens.css` design system (new hero styles use existing tokens where
  they fit; canvas-specific hex values are self-contained in the canvas code).
