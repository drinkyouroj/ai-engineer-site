# CLAUDE.md — ai-engineer-site

> This file is the authoritative guide for Claude Code and any AI agent working in this
> repository. Read it fully before taking any action. It is committed to the repo root
> and applies to every session.

**Project:** ai-engineer-site
**Purpose:** Personal portfolio and writing index for an AI-augmented systems engineer — a single-page site plus standalone essay/writing pages, deployed on GitHub Pages at justin.hearn.me
**Last updated:** 2026-04-07

---

## Environment & Stack

**Language(s):** HTML5, CSS3, JavaScript (ES2020+)
**Framework(s):** None — intentionally vanilla. No build step, no bundler.
**Animations:** GSAP 3 (CDN), ScrollTrigger plugin
**Live data:** rss2json CORS proxy → Substack RSS feed (`fetchWritingPosts`, `fetchTestimonials`)
**Fonts:** Google Fonts — Inter (body), JetBrains Mono (display/mono)
**Runtime:** Python 3 http.server for local preview
**Deployed:** GitHub Pages at `https://www.justin.hearn.me` via CNAME

### Key Files

| File | Role |
|---|---|
| `index.html` | Single-page portfolio — all main sections |
| `pkm-llm-wiki.html` | Standalone article page (PKM / Karpathy essay) |
| `writing.html` | Curated writing index (tech + fiction) |
| `style.css` | All component styles |
| `tokens.css` | Design system tokens — single source of truth for colors, spacing, type |
| `main.js` | GSAP animations, scroll tracking, live RSS fetch |
| `sitemap.xml` | Sitemap for Google Search Console |
| `robots.txt` | Crawl directives — points to sitemap |

### Setup

```bash
# Run locally
python3 -m http.server 3000

# Open in browser
open http://localhost:3000
```

> No install step — no npm, no pip, no dependencies to manage locally.
> The site runs directly from the file system.

---

## Design System

**All visual values live in `tokens.css`.** Never hardcode a color, spacing value, size,
or timing constant in `style.css` or any HTML file. Always use the CSS custom properties
defined in `:root`.

### Key tokens

| Category | Prefix | Example |
|---|---|---|
| Colors | `--color-*` | `--color-accent-primary: #3b82f6` |
| Spacing | `--space-*` | `--space-4: 1rem` (4px base unit) |
| Typography | `--font-*` | `--font-family-mono`, `--font-size-sm` |
| Motion | `--duration-*`, `--easing-*` | `--duration-fast: 150ms` |
| Layout | `--max-width-*`, `--nav-height` | `--max-width-content: 68ch` |

### Responsive grid convention

Project and writing grids use a **1-column → 3-column** breakpoint (no 2-column
intermediate) to avoid orphaned cards when content count is exactly 3:

```css
/* 1-column default, 3-column at ≥1024px — skip the 2-column middle state */
@media (min-width: 1024px) {
  .projects-grid, .writing-grid { grid-template-columns: repeat(3, 1fr); }
}
```

---

## Content Architecture

### Static vs. dynamic cards

The homepage writing grid mixes a **static featured card** (pinned first, `data-static="true"`)
with **dynamically fetched RSS cards**. The static card always links to a portfolio landing
page, not directly to Substack. `fetchWritingPosts()` in `main.js` must preserve the
static card and filter its post from the RSS results to prevent duplication.

### Sub-pages

Sub-pages (`pkm-llm-wiki.html`, `writing.html`, future essay pages) follow these rules:

- Load `tokens.css` and `style.css` only — **no GSAP, no `main.js`**
- Nav links use absolute anchors: `href="/"` for logo, `href="/#section-id"` for sections
- Include an inline mobile nav toggle script (no GSAP dependency)
- Include a `<link rel="canonical">` pointing to the page's own URL
- Include JSON-LD structured data appropriate to the page type

### SEO conventions

| Element | Convention |
|---|---|
| Canonical URL | Always `https://www.justin.hearn.me/...` — never the old `drinkyouroj.github.io` domain |
| OG image (default) | `og-image.png` (1200×630, general portfolio) |
| OG image (article) | Article-specific PNG, e.g. `pkm-llm-wiki-og-image.png` |
| Person schema image | `justin_hearn.png` (headshot) |
| Article schema | Requires `image` field for Rich Results eligibility |
| Sitemap | Update `sitemap.xml` when adding new indexable pages |

---

## Git Flow

### Branch Model

```
main        ← production-ready, deployed to GitHub Pages on merge
feature/*   ← one branch per feature or fix, branched from main
fix/*       ← targeted bug fixes
chore/*     ← maintenance, dependency updates, config changes
```

### Rules

- `main` is **protected**. No direct commits. PRs only.
- Branch names: `feature/short-description`, `fix/short-description`, `chore/short-description`.
- Delete feature branches after merge.
- This is a static site — no `develop` or `release` branches needed.

### Commit Message Format

Follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body — wrap at 72 chars]

[optional footer]
```

**Types:**

| Type | Use for |
|---|---|
| `feat` | New page, section, or capability |
| `fix` | Bug fix or visual correction |
| `chore` | Config, tooling, sitemap updates |
| `docs` | CLAUDE.md, README, decision docs |
| `content` | Copy changes, new writing cards, article updates |
| `seo` | Meta tags, structured data, sitemap, robots.txt |
| `perf` | Animation, font loading, image optimization |

### Commit Granularity

Commit per logical change — not per file, not per task batch.

**Correct:**
- One commit for a new HTML page, a separate commit for its CSS additions
- One commit for JSON-LD changes, a separate commit for OG tag changes

**Anti-patterns:**
- ❌ Batching unrelated changes ("misc fixes, also updated some meta tags")
- ❌ "WIP" commits on shared branches

### Pull Requests

- PR title follows Conventional Commits format: `feat(seo): add PKM landing page`
- PR description: what changed, why, and how to verify it
- Squash-merge feature branches into main

---

## Adversarial Agent Protocol (AAP)

**Significant decisions go through a three-agent review before implementation.**

### The Three Agents

**ARCHITECT** — Designs the solution. Makes tradeoffs explicit.
Always asks: *"Is this the simplest thing that works and can be extended?"*

**ADVERSARY** — Attacks the design before and after implementation. Finds edge cases,
SEO risks, accessibility failures, and maintenance traps.
Never lets a decision pass without at least two specific objections.

**JUDGE** — Listens to both. Decides. Writes a one-line verdict and any required design
changes. Does not compromise for the sake of harmony.

### When AAP Is Required

Run AAP for:

- New standalone pages (URL strategy, canonical, internal linking)
- Changes to `fetchWritingPosts()` or the static/dynamic card mix
- Structural changes to `tokens.css` (affects the entire design system)
- Any new third-party dependency (CDN script, API, proxy service)
- Changes to `robots.txt` or `sitemap.xml` that could affect indexing

Skip AAP for: copy edits, styling tweaks, new writing cards, meta description updates.

### Protocol Format

```
## AAP: {{decision title}}

### ARCHITECT
{{Design proposal — specific files, approach, tradeoffs considered.}}

### ADVERSARY
**Objection 1:** {{specific attack}}
**Objection 2:** {{specific attack}}

### JUDGE
**Verdict:** {{one sentence}}
{{Any required design changes before implementation proceeds.}}
```

---

## Documentation Conventions

### build_log.md

`build_log.md` lives at the repo root. Append an entry for every session that makes
meaningful changes:

```markdown
## YYYY-MM-DD — short description

### Done
- bullet per logical change

### Decisions
- any notable choices or trade-offs

### Next
- what's left or blocked
```

### DECISION Docs

Before implementing any of the following, a DECISION doc is required:

- New standalone pages (affects URL structure, sitemap, internal linking)
- New third-party APIs or CDN dependencies
- Changes to the static/dynamic card architecture in `main.js`
- Structural `tokens.css` changes

DECISION docs live in `docs/decisions/` and follow this template:

```markdown
# DECISION: {{title}}

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Rejected | Superseded

## Context
What problem are we solving? Why now?

## Options Considered
1. **Option A** — pros / cons
2. **Option B** — pros / cons

## Decision
What we're doing and why.

## Consequences
What changes, what gets harder, what gets easier.
```
