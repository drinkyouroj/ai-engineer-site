# Design Brief: AI-Augmented Engineering Portfolio

## Problem

Employers and collaborators see "Support Engineer / Sysadmin — 15 years" and immediately slot Justin into a support role. His AI coding work — real, shipped projects built with Claude, D3, FastAPI, and TypeScript — is invisible behind that label. There's no single place that reframes the story.

## Solution

A single-page scrolling site that functions as a cinematic argument. Each section reveals a new dimension: the systems foundation, the AI-augmented workflow, the actual projects. By the time the reader reaches the contact section, the question isn't "can he code?" — it's "why isn't he already on our team?"

## Experience Principles

1. **Demonstration over declaration** — Show the work, not claims about the work. Every section earns its place by showing something concrete.
2. **Quiet confidence over self-promotion** — The tone is authoritative and precise. No "hire me!" energy. The site assumes the reader is already interested.
3. **Motion serves meaning** — Scroll animations reveal content in reading order. They are not decorative. Nothing animates that doesn't help the reader absorb the information.

## Aesthetic Direction

- **Philosophy**: Dark precision — the aesthetic of tools built by engineers for engineers. Linear, Vercel, Resend. Not a portfolio template.
- **Tone**: Authoritative, precise, quietly confident. Technical without being cold.
- **Reference points**: Linear.app, Vercel.com, Resend.com — dark backgrounds, tight typography, intentional use of white space, electric accent colors used sparingly.
- **Anti-references**: Colorful Dribbble portfolios, rainbow gradient hero sections, animated emoji, "creative" portfolios with cursor effects and parallax chaos.

## Existing Patterns

Greenfield project — no existing codebase, no existing tokens, no components to inherit.

- Typography: JetBrains Mono (display/headings) + Inter (body) via Google Fonts
- Colors: Deep black `#0a0a0a` background, electric blue `#3b82f6` / `#60a5fa` accents
- Spacing: 4px base scale
- Components: None — all new

## Component Inventory

| Component | Status | Notes |
|-----------|--------|-------|
| StickyNav | New | Name/logo left, anchor links right. Backdrop blur on scroll. Active section highlight. |
| HeroSection | New | Full-viewport. Animated headline. Scroll indicator. |
| AboutSection | New | Two-column layout: 15yr systems background left, AI pivot right. |
| WorkflowSection | New | "How I Work" — 3-step visual flow showing AI-augmented process. |
| ProjectCard | New | Reused ×3. Tech stack tags, link to repo, one-line problem statement. |
| WritingSection | New | Link cards to Substack posts on AI/decentralization topics. |
| ContactSection | New | GitHub, LinkedIn, Substack, Resume — icon + label link grid. |

## Key Interactions

- **Nav scroll awareness**: Nav links gain an active state when their target section is in the viewport. The nav bar gains a `backdrop-filter: blur` background once the user scrolls past the hero.
- **Section reveals**: Each section fades up (translateY: 40px → 0, opacity: 0 → 1) as it enters the viewport. Triggered by GSAP ScrollTrigger, not on page load.
- **Project cards**: Subtle border glow on hover using the electric blue accent. Tech stack tags shift background on hover.
- **Mobile nav**: Hamburger icon → full-screen overlay menu. Closes on link tap or outside tap.
- **Smooth scroll**: All anchor links scroll smoothly. Offset accounts for sticky nav height.

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Mobile (< 768px) | Single column. Nav collapses to hamburger. Hero headline wraps. About stacks vertically. |
| Tablet (768px–1024px) | Two-column about. Projects grid: 2 columns. |
| Desktop (> 1024px) | Full layout. Projects: 3 columns. Generous whitespace. |

## Accessibility Requirements

- All text meets WCAG AA contrast (4.5:1 minimum on body text, 3:1 on large text/UI elements)
- All interactive elements keyboard-focusable with visible focus ring using `--color-accent-primary`
- Nav landmark `<nav>`, section landmarks `<section>` with `aria-labelledby`
- Images (if any) have meaningful `alt` text
- Reduced motion: all GSAP animations respect `prefers-reduced-motion`

## Out of Scope

- Blog or writing functionality (links to Substack only — no embedded posts)
- Dark/light mode toggle (dark mode only — the aesthetic is intentionally dark)
- Contact form (links only — no form submission)
- CMS or dynamic content (static HTML only)
- Analytics or tracking scripts
