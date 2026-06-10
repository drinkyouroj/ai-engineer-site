# DECISION: Re-home the Writing area on The Civic Node (auto-updating, statically generated)

**Date:** 2026-06-10
**Status:** Accepted

## Context

The Substack at `drinkyouroj.substack.com` relaunched as **The Civic Node**
("Systems analysis for readers who've noticed money, power, tech, and crypto are one
story — and nobody's telling it."). The site's "AI essays + Help Desk for the
Singularity fiction" framing is retired, and the relaunched feed (20 items, oldest
2026-04-21) no longer contains any of the posts the site's writing surfaces were
hand-built around — including the PKM essay behind the pinned homepage card.

Three surfaces had to change together:

1. **Homepage writing grid** — pinned static card + 2 RSS cards → honest newest-3.
2. **`writing.html`** — two hardcoded sections (Tech & AI / Fiction) → a generated,
   auto-updating, reverse-chronological index of the whole publication.
3. **Deploy** — `writing.html` must refresh without commits to protected `main`,
   so Pages switches from branch deploys to the **GitHub Actions source**.

This crossed three AAP triggers (changes to `fetchWritingPosts()`/static-card mix,
a new third-party automation in the deploy path, indexing-affecting changes), so the
Adversarial Agent Protocol ran before implementation. Transcript below.

## Options Considered

1. **Client-side rendering on writing.html too (rss2json, like the homepage)** —
   Pros: no CI, no deploy change. Cons: rss2json caps at 10 of the feed's 20 items;
   the index would be invisible to crawlers (JSON-LD can't be generated client-side
   meaningfully); every visitor pays the fetch.
2. **Scheduled workflow commits regenerated writing.html to main** —
   Pros: branch-based Pages deploy unchanged. Cons: violates the protected-main /
   PRs-only rule; bot commits pollute history. Rejected on contract grounds.
3. **Scheduled workflow builds + deploys via `actions/deploy-pages` (chosen)** —
   Pros: no commits to main; full 20-item feed (raw XML, no CORS in CI); static HTML
   + ItemList JSON-LD for crawlers; a normal code push also re-bakes the feed.
   Cons: deploys now depend on the workflow and (at build time) on the feed fetch;
   scheduled runs can be delayed/disabled (see Consequences).

## Decision

Option 3, with the AAP-required design changes below.

- **Homepage:** drop the pinned `data-static` card and `PKM_SLUG` filter; `slice(0, 3)`;
  skeleton count 3 (no layout shift on swap); `FEED_CACHE_SCHEMA` 1→2 so cached
  2-item payloads read as a miss instead of briefly rendering the old shape.
  Loader mechanics (timeout/retry/SWR/reduced-motion/no-GSAP) untouched.
- **writing.html:** hand-authored chrome; generator owns only two marker-delimited
  regions (`FEED:START/END` cards, `JSONLD:START/END` ItemList). JSON-LD sits in
  `<body>` so `<head>` stays fully hand-authored. Copy re-drafted from the
  publication's real name + description.
- **Generator (`tools/build-writing.mjs`):** Node ≥22, zero-dependency, hand-parsed
  XML. HTML-escapes every injected value; JSON-LD additionally escapes `</` so a
  hostile post title can't close the script block. UTC date formatting keeps local
  and CI output byte-identical. **Fails hard** (non-zero exit) on fetch errors,
  empty/malformed items, non-Substack URLs, or missing/duplicated markers.
- **Workflow (`.github/workflows/deploy-pages.yml`):** push to main + 3 UTC crons
  (Wed 18:17, Sat 02:17 catching the Friday-evening post, Mon 12:17 sweep) +
  `workflow_dispatch`. `permissions: contents: read, pages: write, id-token: write`;
  `concurrency: pages` without cancel-in-progress. Uploads the **site root** so the
  existing `CNAME` ships in the artifact and the custom domain holds.

## AAP Transcript

### ARCHITECT
Three coupled changes, each layer independently simple (summarized above). Explicit
tradeoff: the deploy path now depends on a third-party feed fetch — accepted because
the generator failing hard **aborts the deploy and the last good deploy stays live**;
worst case is staleness, never a broken page.

### ADVERSARY
**Objection 1 — RSS fetch in the critical path of every deploy.** A Substack outage
at deploy time blocks an unrelated CSS fix. *Disposition:* real but rare and
self-healing (re-run the job; `workflow_dispatch` exists); deploying a zero-card
writing.html would be strictly worse. Accepted, fail-hard semantic documented.

**Objection 2 — Scheduled workflows silently die.** GitHub disables cron triggers
after ~60 days without repo activity and may delay/drop runs at peak. *Disposition:*
documented limitation; push-to-main also re-bakes, `workflow_dispatch` revives.
No further mitigation is proportionate for a portfolio.

**Objection 3 — Orphaning `pkm-llm-wiki.html` is worse than assumed.** Verified: the
essay is **not in the relaunched feed**, so the generated list will never link to it;
removing the homepage card and the Tech section removes its only inbound internal
links while it stays in the sitemap — a crawl dead end. Must be an explicit retention
decision, not a side effect.

**Objection 4 — Baked snapshot in git drifts from production.** CI re-bakes every
deploy but never commits. *Disposition:* inherent to the no-commit design; the repo
copy is a working template with real example content, regenerable on demand
(`node tools/build-writing.mjs`).

### JUDGE
**Verdict:** Approved as designed, with one required change: `writing.html` retains a
permanent hand-authored "Featured essay" link to `/pkm-llm-wiki.html` in the
page-footer chrome (outside the generated markers) — the page keeps its sitemap entry
and standalone-landing-page role; silent orphaning is rejected. Fail-hard semantics,
cron decay, and snapshot drift go in this doc.

## Consequences

- **Easier:** writing.html updates itself a few times a week with zero manual work;
  the full 20-post archive is crawlable static HTML with valid ItemList JSON-LD;
  any push to main also refreshes the feed.
- **Harder / new failure modes:** deploys flow through one workflow — if it breaks,
  nothing ships until it's fixed (the live site keeps serving the last deploy).
  Scheduled runs can lag and die after ~60 days of repo inactivity. The committed
  writing.html is a snapshot, not what production serves.
- **SEO:** old framing gone from titles/descriptions/JSON-LD; sitemap lastmod bumped;
  `pkm-llm-wiki.html` keeps exactly one inbound internal link (writing.html footer)
  plus its sitemap entry; its canonical/Article schema are untouched.

## Verification (2026-06-10)

- Generator run twice against the live feed → **identical bytes** (idempotent);
  20 cards, reverse-chronological, all URLs `drinkyouroj.substack.com/p/…`.
- Both JSON-LD blocks parse; ItemList has 20 ListItems, positions 1–20.
- `tools/test-feeds.mjs` — baseline: 3 writing cards, writing CLS 0; inview
  (skeleton→content swap in viewport): writing CLS **0.0007**; offline cold-cache:
  fallback message renders; offline `--warm`: 3 cached cards survive (SWR intact).
- Workflow YAML parsed + structurally checked (actionlint unavailable locally);
  no untrusted event input is interpolated anywhere in the workflow.
- Internal-link grep: all `href="/…"` targets exist; pkm page reachable via
  index → writing.html → footer link.

## Manual steps (cannot be done from the repo)

1. After merge: **Settings → Pages → Build and deployment → Source → "GitHub Actions".**
2. Confirm the custom domain (www.justin.hearn.me) still set; run the workflow once
   via `workflow_dispatch` and verify the deploy serves the domain correctly.
