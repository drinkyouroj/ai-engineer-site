# Information Architecture: AI-Augmented Engineering Portfolio

## Site Map

Single-page application. All content lives at `/index.html`. Navigation is anchor-based.

```
/ (index.html)
  #hero          ← Full-viewport landing
  #about         ← Background + AI pivot
  #how-i-work    ← AI-augmented workflow
  #projects      ← GhostEditor, Thread Cartographer, IntakeForm-AI
  #writing       ← Substack link cards
  #contact       ← GitHub, LinkedIn, Substack, Resume
```

## Navigation Model

- **Primary navigation**: Sticky top bar. Name/logo on the left (links to #hero). Five anchor links on the right: About · How I Work · Projects · Writing · Contact.
- **Secondary navigation**: None — single-page, no nested sections.
- **Utility navigation**: None — no auth, no settings.
- **Mobile navigation**: Hamburger icon (right side) → full-screen overlay with vertical link list. Closes on link tap. Nav links are large touch targets (min 48px height).

**Active state rule**: The nav link corresponding to the section currently in the viewport receives an active highlight (electric blue underline or color shift).

**Scroll offset**: All anchor links offset by the nav height (~64px) so headings are not hidden behind the sticky bar.

## Content Hierarchy

### #hero
1. **Name** — "Justin Hearn" — identity anchor, first thing read
2. **Headline** — "AI-Augmented Engineering" — the reframe
3. **Tagline** — "15+ years of systems thinking, now amplified by AI" — context
4. **CTA / scroll indicator** — invites continued reading

### #about
1. **Section heading** — "About"
2. **Systems background** (left column) — 15yr sysadmin/support engineering career; Facebook Reality Labs, Rackspace, production systems, incident response
3. **AI pivot** (right column) — How AI changed the workflow; building real tools with Claude, GPT, and modern stacks
4. **Connective thread** — The bridge sentence: deep systems knowledge + AI = unusually capable builder

### #how-i-work
1. **Section heading** — "How I Work"
2. **3-step workflow** — Visual flow showing the AI-augmented process:
   - Step 1: Define the problem clearly (systems thinking background)
   - Step 2: Build with AI as a collaborator (Claude, GitHub Copilot)
   - Step 3: Ship, iterate, document (sysadmin discipline)
3. **Supporting detail** — Brief copy under each step

### #projects
1. **Section heading** — "Projects"
2. **GhostEditor** — AI developmental editor for authors (Claude API + FastAPI + React)
3. **Thread Cartographer** — Reddit thread visualizer (D3 force graphs + sentiment analysis)
4. **IntakeForm-AI** — AI-powered intake form system (Next.js + TypeScript)
5. Each card: Project name, one-line description, tech stack tags, GitHub link

### #writing
1. **Section heading** — "Writing"
2. **Substack link cards** — 2–3 featured posts on AI, decentralization, and engineering topics
3. **"Read more on Substack" link** — drives to drinkyouroj.substack.com

### #contact
1. **Section heading** — "Get in Touch" or "Connect"
2. **Link grid** — GitHub, LinkedIn, Substack, Resume (4 links, icon + label)
3. **Short closing line** — One sentence. Not "hire me." Something like "Open to interesting problems."

## User Flows

### Primary: Evaluating Justin for a role
1. Lands on #hero → reads name + headline ("AI-Augmented Engineering" reframes expectations)
2. Scrolls to #about → understands the 15yr background + AI pivot (credibility established)
3. Scrolls to #how-i-work → sees the workflow is structured, not just vibes
4. Scrolls to #projects → sees three shipped tools with real stacks (GhostEditor is the strongest)
5. Scrolls to #writing → optional depth signal
6. Reaches #contact → clicks LinkedIn or Resume

### Secondary: Developer checking the work
1. Lands on #hero → reads headline
2. Jumps directly to #projects via nav
3. Clicks GitHub links on project cards → leaves site to explore repos

## Naming Conventions

| Concept | Label in UI | Notes |
|---------|-------------|-------|
| The site owner | "Justin Hearn" | Full name in hero and nav logo |
| Section: work history | "About" | Not "Bio" or "Resume" |
| Section: workflow | "How I Work" | Not "Process" or "Methodology" |
| Section: shipped work | "Projects" | Not "Portfolio" or "Work" |
| Section: articles | "Writing" | Not "Blog" — links to Substack |
| Section: links | "Contact" | Not "Hire Me" or "Connect" |
| GitHub link label | "GitHub" | Icon + text, not just icon |
| Resume link label | "Resume" | Not "CV" |

## Component Reuse Map

| Component | Used on | Behavior differences |
|-----------|---------|---------------------|
| StickyNav | All sections (always visible) | Transparent → blurred bg on scroll |
| ProjectCard | #projects (×3) | Same structure, different content |
| LinkCard | #writing (×2–3) | Same structure, different content |
| SectionHeading | Every section | Same style, different text |

## Content Growth Plan

This site is intentionally static. Content does not grow over time — it is updated manually when Justin adds new projects or writing. No pagination, filtering, or archive patterns needed. If the project count grows beyond 6, a simple "View all on GitHub" link is sufficient.

## URL Strategy

- Single page: `/` (or `/index.html` for GitHub Pages)
- All navigation: hash-based anchors (`#about`, `#projects`, etc.)
- No query parameters, no dynamic segments
- External links: GitHub repos, LinkedIn, Substack, Resume (standardresume.co) — all open in new tab
