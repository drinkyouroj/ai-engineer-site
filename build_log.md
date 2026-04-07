# Build Log — ai-engineer-site

Append-only. One entry per session that makes meaningful changes.

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
