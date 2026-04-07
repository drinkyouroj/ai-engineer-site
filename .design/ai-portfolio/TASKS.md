# Build Tasks: AI-Augmented Engineering Portfolio

Generated from: .design/ai-portfolio/DESIGN_BRIEF.md
Date: 2026-04-06

Philosophy: Dark Precision (Linear/Vercel aesthetic)
Stack: Plain HTML + CSS custom properties + vanilla JS + GSAP (CDN)
Hosting: GitHub Pages

---

## Foundation

- [x] **Design tokens**: Full CSS custom property system covering color, typography, spacing, layout, motion, and breakpoints. Saved at `.design/ai-portfolio/tokens.css`. _New file._

- [ ] **Scaffold `index.html`**: Create the full semantic HTML structure — `<header>` nav, and six `<section>` elements with IDs `#hero`, `#about`, `#how-i-work`, `#projects`, `#writing`, `#contact`. Include meta tags, font imports, CSS/JS links. All content placeholder text at this stage. _New file._

- [ ] **`tokens.css` (production copy)**: Copy tokens from `.design/ai-portfolio/tokens.css` to project root `tokens.css`. This is the file `index.html` links to. _New file._

- [ ] **`style.css` — reset and base**: CSS reset, `box-sizing`, `scroll-behavior: smooth`, base typography using token values, body background/color, section padding scale, max-width containers. _New file._

---

## Core UI

- [ ] **Sticky nav**: `<header>` with name logo (links to #hero) left + five anchor links right. Transparent by default; gains `backdrop-filter: blur(12px)` and `--color-nav-bg` background once user scrolls 10px. Active link highlight (electric blue underline) controlled by JS IntersectionObserver. _New component._

- [ ] **Hero section**: Full-viewport (`100dvh`) section. Headline "AI-Augmented Engineering" in JetBrains Mono, large display size. Tagline in Inter below. Subtle animated scroll-down indicator at bottom. No background image — relies on dark bg + typography weight alone. _New component._

- [ ] **About section**: Two-column grid on desktop, single column on mobile. Left: systems engineering background (15yr career highlights). Right: AI pivot narrative. A thin vertical accent line divides the columns on desktop. _New component._

- [ ] **How I Work section**: Three-step horizontal flow. Each step: number (monospace, accent color), step title, two lines of supporting copy. Steps connected by a subtle horizontal rule or dotted line on desktop. Stacks vertically on mobile. _New component._

- [ ] **Projects section**: Three `ProjectCard` components in a responsive grid (1→2→3 columns). Each card: project name, one-line description, tech stack tags (pill badges), GitHub link arrow. Border + background from surface tokens. Hover: accent border glow + subtle lift. _New component ×3._

- [ ] **Writing section**: Two or three `LinkCard` components linking to Substack posts. Each card: post title, one-line excerpt, "Read on Substack →" link. Below the cards: a plain "View all writing →" link to drinkyouroj.substack.com. _New component._

- [ ] **Contact section**: Section heading + short closing line ("Open to interesting problems."). Four links in a 2×2 grid: GitHub, LinkedIn, Substack, Resume. Each link: icon (SVG inline) + label. Links open in new tab. _New component._

---

## Interactions & States

- [ ] **GSAP scroll animations**: Install GSAP + ScrollTrigger via CDN. Each section animates on scroll entry: `opacity: 0, y: 40` → `opacity: 1, y: 0`. Project cards stagger (each card 100ms after previous). Respect `prefers-reduced-motion` — skip animations if set. _Covers: initial load, scroll down, scroll up (if scrub enabled)._

- [ ] **Mobile nav**: Hamburger button (right side of nav). On click: full-screen overlay menu appears with vertical anchor links. Close on: link tap, outside tap, Escape key. Trap focus inside overlay when open. _Covers: open, close, keyboard, accessibility._

- [ ] **Active nav state**: IntersectionObserver watches all six sections. The nav link for the section with the most viewport visibility gets `aria-current="page"` and the active CSS class. Smooth transition between active states. _Covers: scroll down, scroll up, direct link jump._

---

## Responsive & Polish

- [ ] **Responsive layout pass**: Confirm all sections work at 375px, 768px, 1024px, 1280px. Key checks: nav collapse, hero text wraps gracefully, about stacks vertically on mobile, project grid reflows, touch targets ≥ 44px. _Breakpoints: sm / md / lg / xl._

- [ ] **Accessibility pass**: Verify all contrast ratios meet WCAG AA. Add `aria-label` to icon-only buttons. Confirm keyboard tab order matches visual order. Test focus ring visibility on all interactive elements. Add `aria-labelledby` to each section. Confirm reduced-motion behavior.

- [ ] **Final polish**: Hover states on all interactive elements. Smooth transitions on nav background change. Meta tags: title, description, og:image (if available), canonical URL. Favicon. Ensure no horizontal scroll at any breakpoint.

---

## Review

- [ ] **Design review**: Run `/design-review` against the brief once all sections are built.
