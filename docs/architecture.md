# Architecture — ai-engineer-site

## Overview

A static portfolio site with no build step, no framework, and no server-side logic.
Deployed on GitHub Pages at `https://www.justin.hearn.me`.

## Page Inventory

| URL | File | Type | Schema |
|---|---|---|---|
| `/` | `index.html` | Single-page portfolio | `Person` |
| `/pkm-llm-wiki.html` | `pkm-llm-wiki.html` | Standalone article | `Article` |
| `/writing.html` | `writing.html` | Writing index | `CollectionPage` |

## Asset Map

```
/
├── index.html              ← Main portfolio (all sections)
├── pkm-llm-wiki.html       ← PKM/Karpathy essay landing page
├── writing.html            ← Curated writing index
├── style.css               ← All component styles
├── tokens.css              ← Design system tokens (source of truth)
├── main.js                 ← Animations, scroll, live RSS fetch
├── og-image.svg            ← Default OG/Twitter card (1200×630)
├── pkm-llm-wiki-og-image.svg  ← Article-specific OG image
├── justin_hearn.svg        ← Headshot (Person schema image)
├── sitemap.xml             ← Submitted to Google Search Console
├── robots.txt              ← Crawl directives
├── CNAME                   ← GitHub Pages custom domain
└── docs/
    ├── architecture.md     ← This file
    └── decisions/          ← DECISION docs (see CLAUDE.md)
```

## Data Flow

```
Browser
  │
  ├─ index.html + tokens.css + style.css → rendered DOM
  │
  ├─ main.js (deferred)
  │    ├─ GSAP + ScrollTrigger → animations
  │    ├─ fetch(rss2json API) → Substack RSS → writing cards
  │    │    └─ static PKM card preserved (data-static="true")
  │    └─ fetch(rss2json API) → testimonials JSON → testimonial cards
  │
  └─ sub-pages (pkm-llm-wiki.html, writing.html)
       └─ tokens.css + style.css only (no GSAP, no main.js)
```

## External Dependencies

| Dependency | Purpose | Risk |
|---|---|---|
| Google Fonts CDN | Inter + JetBrains Mono | Font flash on slow connections (mitigated by preconnect hints) |
| GSAP CDN (cdnjs) | Scroll animations, parallax | Animations degrade gracefully if CDN fails |
| rss2json.com | CORS proxy for Substack RSS | Single point of failure for live writing/testimonial cards; fallback renders empty grid with Substack link |

## Responsive Layout

- **Mobile (default):** 1-column grid for projects and writing
- **Desktop (≥1024px):** 3-column grid
- No 2-column intermediate state (avoids orphaned cards with 3 items)

## SEO Architecture

- Each page has a unique `<title>`, `<meta name="description">`, canonical URL, and OG tags
- `index.html` → `Person` JSON-LD with headshot image
- `pkm-llm-wiki.html` → `Article` JSON-LD with article-specific OG image (Rich Results eligible)
- `writing.html` → `CollectionPage` JSON-LD
- `sitemap.xml` lists all 3 indexable URLs
- `robots.txt` points crawlers to sitemap
