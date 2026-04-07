/**
 * main.js — AI-Augmented Engineering Portfolio
 *
 * Effects:
 *   1. Scroll progress bar
 *   2. Hero parallax (content + glow move at different depths)
 *   3. Floating hero terminal snippets (GSAP fade in + CSS drift)
 *   4. About columns: horizontal slide-in from opposite sides
 *   5. How I Work: staggered scrub (tied to scroll, not snap)
 *   6. Project cards: staggered reveal + 3D tilt on hover
 *   7. Writing cards: staggered reveal
 *   8. Nav: backdrop blur on scroll
 *   9. Nav: active section tracking
 *  10. Mobile nav
 */

'use strict';

window.addEventListener('load', init);

function init() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  setupScrollProgress();
  setupNav();
  setupActiveNavTracking();
  setupMobileNav();
  setup3DCardTilt();
  setupCustomCursor();
  setupCounters();
  fetchWritingPosts();
  fetchTestimonials();

  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    if (prefersReducedMotion) {
      // Immediately show all reveal elements — no animation
      gsap.set('.reveal, .hero-float', { opacity: 1, x: 0, y: 0 });
    } else {
      configureScrollAnimations();
    }
  } else {
    // GSAP unavailable — show all content
    document.querySelectorAll('.reveal, .hero-float').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// SCROLL PROGRESS BAR
// ─────────────────────────────────────────────────────────────────
function setupScrollProgress() {
  const bar = document.querySelector('.scroll-progress');
  if (!bar) return;

  let ticking = false;

  function update() {
    const scrollTop  = window.scrollY;
    const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
    const pct        = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width  = pct + '%';
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
}

// ─────────────────────────────────────────────────────────────────
// SCROLL ANIMATIONS
// ─────────────────────────────────────────────────────────────────
function configureScrollAnimations() {

  // ── 1. Hero: label + tagline fade in, headline does the scramble ──
  const heroTl = gsap.timeline({ defaults: { ease: 'power2.out' } });
  heroTl
    .fromTo('.hero-label',   { opacity: 0, y: 12 }, { opacity: 1,    y: 0, duration: 0.6 }, 0.1)
    .fromTo('.hero-tagline', { opacity: 0, y: 14 }, { opacity: 1,    y: 0, duration: 0.6 }, 0.8)
    .fromTo('.hero-scroll',  { opacity: 0, y: 8  }, { opacity: 1,    y: 0, duration: 0.5 }, 1.1)
    .fromTo('.hero-ascii',   { opacity: 0, scale: 1.04 }, { opacity: 0.12, scale: 1, duration: 1.4, ease: 'power1.out' }, 1.0);

  // Scramble fires at the same time as label, runs its own animation
  setTimeout(() => {
    const headline = document.querySelector('.hero-headline');
    if (headline && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scrambleText(headline, 'AI\u2011Augmented\nEngineering');
    } else if (headline) {
      gsap.fromTo(headline, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
    }
  }, 250);

  // ── 2. Hero parallax — 4 distinct depth planes
  // Plane 1 (closest): hero text moves at 50% scroll speed
  gsap.to('.hero-inner', {
    yPercent: -50,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1.5,
    }
  });

  // Plane 2: floats move at 70% speed — faster than text, slower than glow
  gsap.to('.hero-floats', {
    yPercent: -70,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1,
    }
  });

  // Plane 3 (furthest): glow rockets up at 100% and fades hard
  gsap.to('.hero-glow', {
    yPercent: -100,
    opacity: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: '50% top',
      scrub: 0.8,
    }
  });

  // Plane 4: hero section background gets a subtle scale — adds cinematic zoom-out
  gsap.to('#hero', {
    scale: 0.94,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 2,
    }
  });

  // ── 2. Floating terminal snippets ─────────────────────────────
  // Fade in staggered on page load, then drift via CSS animation
  gsap.to('.hero-float', {
    opacity: 0.18,           // subtle — atmosphere, not distraction
    duration: 1.2,
    stagger: 0.15,
    ease: 'power1.out',
    delay: 0.8,
  });

  // Floats also parallax upward (faster than content) as hero scrolls out
  gsap.to('.hero-floats', {
    yPercent: -40,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    }
  });

  // ── 3. About: horizontal slide + continuing parallax drift ───
  gsap.to('.about-col:first-child', {
    opacity: 1, x: 0, duration: 0.9, ease: 'power2.out',
    scrollTrigger: { trigger: '.about-grid', start: 'top 80%' }
  });
  gsap.to('.about-col:last-child', {
    opacity: 1, x: 0, duration: 0.9, delay: 0.12, ease: 'power2.out',
    scrollTrigger: { trigger: '.about-grid', start: 'top 80%' }
  });

  // The two columns drift apart at different speeds as you scroll past
  gsap.to('.about-col:first-child', {
    y: -40,
    ease: 'none',
    scrollTrigger: {
      trigger: '#about',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1.5,
    }
  });
  gsap.to('.about-col:last-child', {
    y: -80,                   // moves faster — creates separation
    ease: 'none',
    scrollTrigger: {
      trigger: '#about',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1.5,
    }
  });

  // ── 4. How I Work: scrub stagger + section label parallax ────
  const steps = gsap.utils.toArray('.workflow-step');
  gsap.to(steps, {
    opacity: 1, y: 0,
    stagger: 0.2,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: '.workflow-steps',
      start: 'top 75%',
      end: 'bottom 55%',
      scrub: 1,
    }
  });

  // Section label floats up independently
  gsap.fromTo('#how-i-work .section-label', { y: 30 }, {
    y: -30,
    ease: 'none',
    scrollTrigger: {
      trigger: '#how-i-work',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 2,
    }
  });

  // ── 5. Projects: staggered reveal + cards float at different depths
  gsap.to('.project-card.reveal', {
    opacity: 1, y: 0,
    duration: 0.6,
    stagger: { each: 0.14, ease: 'power1.inOut' },
    ease: 'power2.out',
    scrollTrigger: { trigger: '.projects-grid', start: 'top 82%' }
  });

  // Each card drifts up at a slightly different rate as you scroll past
  gsap.utils.toArray('.project-card').forEach((card, i) => {
    gsap.to(card, {
      y: -30 - (i * 15),      // card 0: -30, card 1: -45, card 2: -60
      ease: 'none',
      scrollTrigger: {
        trigger: '#projects',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.5,
      }
    });
  });

  // ── 6. Writing cards: animated after fetchWritingPosts() injects them ──

  // ── 7. Contact: fade-up with section label parallax ──────────
  gsap.utils.toArray('.writing-footer.reveal, .contact-inner.reveal').forEach(el => {
    gsap.to(el, {
      opacity: 1, y: 0, duration: 0.65, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });

  gsap.fromTo('#contact .section-label', { y: 20 }, {
    y: -20,
    ease: 'none',
    scrollTrigger: {
      trigger: '#contact',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 2,
    }
  });

}

// ─────────────────────────────────────────────────────────────────
// TEXT SCRAMBLE
// Safe DOM-only implementation — no innerHTML with dynamic content.
// Each character slot is a pre-built <span> whose textContent is
// updated each frame, so the browser never parses arbitrary HTML.
// ─────────────────────────────────────────────────────────────────
function scrambleText(el, finalText) {
  const chars = '!<>_\\/[]{}=+*^?#|01';
  const lines = finalText.split('\n');

  const queue = [];
  lines.forEach((line, lineIdx) => {
    [...line].forEach((char, charIdx) => {
      const delay = Math.floor(Math.random() * 18) + charIdx * 1.5;
      queue.push({
        to: char,
        start: Math.floor(delay),
        end: Math.floor(delay) + Math.floor(Math.random() * 14) + 8,
        scrambleChar: '',
        lineIdx,
      });
    });
    if (lineIdx < lines.length - 1) {
      queue.push({ to: '\n', start: 0, end: 0, lineIdx });
    }
  });

  // Pre-build one DOM node per slot — textContent only, no innerHTML
  el.textContent = '';
  el.style.opacity = '1';

  const nodes = queue.map(item => {
    if (item.to === '\n') return document.createElement('br');
    const span = document.createElement('span');
    span.style.opacity = '0';
    span.textContent = item.to;
    return span;
  });
  nodes.forEach(node => el.appendChild(node));

  let frame = 0;

  function update() {
    let complete = 0;
    const realItems = queue.filter(q => q.to !== '\n');

    queue.forEach((item, i) => {
      if (item.to === '\n') return;
      const node = nodes[i];
      if (frame >= item.end) {
        complete++;
        node.className = '';
        node.style.opacity = '1';
        node.textContent = item.to;
      } else if (frame >= item.start) {
        if (!item.scrambleChar || Math.random() < 0.3) {
          item.scrambleChar = chars[Math.floor(Math.random() * chars.length)];
        }
        node.className = 'scramble-char';
        node.style.opacity = '1';
        node.textContent = item.scrambleChar;
      } else {
        node.style.opacity = '0';
        node.textContent = item.to;
      }
    });

    if (complete < realItems.length) requestAnimationFrame(update);
    frame++;
  }

  requestAnimationFrame(update);
}

// ─────────────────────────────────────────────────────────────────
// CUSTOM CURSOR
// ─────────────────────────────────────────────────────────────────
function setupCustomCursor() {
  if (window.matchMedia('(hover: none)').matches) return;

  const dot  = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;

  let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
    if (!document.body.classList.contains('cursor-ready')) {
      document.body.classList.add('cursor-ready');
      ringX = mouseX; ringY = mouseY;
      animateRing();
    }
  }, { passive: true });

  function animateRing() {
    ringX += (mouseX - ringX) * 0.1;
    ringY += (mouseY - ringY) * 0.1;
    ring.style.transform = `translate(calc(${ringX}px - 50%), calc(${ringY}px - 50%))`;
    requestAnimationFrame(animateRing);
  }

  document.querySelectorAll('a, button, .project-card, .writing-card, .contact-link').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  document.addEventListener('mousedown', () => document.body.classList.add('cursor-clicking'));
  document.addEventListener('mouseup',   () => document.body.classList.remove('cursor-clicking'));
  document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; ring.style.opacity = '1'; });
}

// ─────────────────────────────────────────────────────────────────
// ANIMATED COUNTERS
// ─────────────────────────────────────────────────────────────────
function setupCounters() {
  const counters = document.querySelectorAll('.counter[data-target]');
  if (!counters.length) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const el = entry.target;
      const target = parseInt(el.dataset.target, 10);
      if (reduced) { el.textContent = target; return; }

      const duration = 1400;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });

  counters.forEach(c => observer.observe(c));
}

// ─────────────────────────────────────────────────────────────────
// 3D CARD TILT (project cards)
// ─────────────────────────────────────────────────────────────────
function setup3DCardTilt() {
  const cards = document.querySelectorAll('.project-card');
  const MAX_TILT = 6; // degrees — subtle, not carnival

  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect   = card.getBoundingClientRect();
      // Normalize mouse position to -1 → +1 relative to card center
      const normX  = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
      const normY  = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
      // rotateY tilts left/right, rotateX tilts up/down (inverted)
      card.style.setProperty('--tilt-x', `${-normY * MAX_TILT}deg`);
      card.style.setProperty('--tilt-y', `${ normX * MAX_TILT}deg`);
      card.classList.remove('tilt-reset');
    });

    card.addEventListener('mouseleave', () => {
      card.classList.add('tilt-reset');
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// NAV: Backdrop blur on scroll
// ─────────────────────────────────────────────────────────────────
function setupNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  let ticking = false;

  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 10);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateNav); ticking = true; }
  }, { passive: true });

  updateNav();
}

// ─────────────────────────────────────────────────────────────────
// NAV: Active section tracking
// ─────────────────────────────────────────────────────────────────
function setupActiveNavTracking() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link[data-section]');
  if (!sections.length || !navLinks.length) return;

  const linkMap = {};
  navLinks.forEach(link => { linkMap[link.dataset.section] = link; });

  function setActiveLink(id) {
    navLinks.forEach(link => {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    });
    const active = linkMap[id];
    if (active) {
      active.classList.add('active');
      active.setAttribute('aria-current', 'page');
    }
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (entry.target.id === 'hero') {
          navLinks.forEach(l => { l.classList.remove('active'); l.removeAttribute('aria-current'); });
        } else {
          setActiveLink(entry.target.id);
        }
      });
    },
    { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
  );

  sections.forEach(s => observer.observe(s));
}

// ─────────────────────────────────────────────────────────────────
// MOBILE NAV
// ─────────────────────────────────────────────────────────────────
function setupMobileNav() {
  const hamburger   = document.querySelector('.nav-hamburger');
  const mobileNav   = document.querySelector('.mobile-nav');
  const closeBtn    = document.querySelector('.mobile-nav-close');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');
  if (!hamburger || !mobileNav) return;

  let isOpen = false;

  function openNav() {
    isOpen = true;
    mobileNav.classList.add('open');
    mobileNav.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function closeNav() {
    isOpen = false;
    mobileNav.classList.remove('open');
    mobileNav.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    hamburger.focus();
  }

  hamburger.addEventListener('click', () => isOpen ? closeNav() : openNav());
  if (closeBtn) closeBtn.addEventListener('click', closeNav);
  mobileLinks.forEach(link => link.addEventListener('click', closeNav));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closeNav(); });

  // Focus trap
  mobileNav.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = [...mobileNav.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

// ─────────────────────────────────────────────────────────────────
// WRITING: Live Substack RSS feed via rss2json CORS proxy
// ─────────────────────────────────────────────────────────────────
async function fetchWritingPosts() {
  const grid = document.querySelector('.writing-grid');
  if (!grid) return;

  const RSS_URL   = 'https://drinkyouroj.substack.com/feed';
  const API       = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

  try {
    const res  = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Feed error');

    // Preserve the static featured card (data-static="true") before replacing children
    const staticCard = grid.querySelector('[data-static]');

    // Filter out the PKM article (already shown as the static card) and take next 3
    const PKM_SLUG = 'obsidian-was-never-the-problem';
    const items = data.items
      .filter(item => !item.link.includes(PKM_SLUG))
      .slice(0, 3);

    // Build card nodes — no innerHTML with untrusted data
    const fragment = document.createDocumentFragment();

    // Re-attach the static card first so it always leads the grid
    if (staticCard) fragment.appendChild(staticCard);

    items.forEach((item, i) => {
      // Strip HTML from description to get plain-text excerpt
      const tmp = document.createElement('div');
      tmp.innerHTML = item.description || item.content || '';
      const raw     = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
      const excerpt = raw.length > 140 ? raw.slice(0, 140).trimEnd() + '…' : raw;

      // Format publish date
      const date    = new Date(item.pubDate);
      const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const card = document.createElement('a');
      card.href             = item.link;
      card.target           = '_blank';
      card.rel              = 'noopener noreferrer';
      card.className        = 'writing-card reveal';
      card.setAttribute('aria-label', `Read: ${item.title} on Substack`);

      const time = document.createElement('time');
      time.className        = 'writing-date';
      time.setAttribute('datetime', item.pubDate);
      time.textContent      = dateStr;

      const title = document.createElement('h3');
      title.className       = 'writing-title';
      title.textContent     = item.title;

      const body  = document.createElement('p');
      body.className        = 'writing-excerpt';
      body.textContent      = excerpt;

      const cta   = document.createElement('span');
      cta.className         = 'writing-cta';
      cta.textContent       = 'Read on Substack →';

      card.append(time, title, body, cta);
      fragment.appendChild(card);
    });

    grid.replaceChildren(fragment);

    // Re-bind cursor hover on freshly-injected cards
    grid.querySelectorAll('.writing-card').forEach(card => {
      card.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      card.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

    // Animate cards — GSAP if loaded, plain CSS otherwise
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.fromTo('.writing-card.reveal',
        { opacity: 0, y: 32 },
        {
          opacity: 1, y: 0,
          duration: 0.55, stagger: 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: '.writing-grid', start: 'top 82%' }
        }
      );

      grid.querySelectorAll('.writing-card').forEach((card, i) => {
        gsap.to(card, {
          y: -20 - (i * 10),
          ease: 'none',
          scrollTrigger: {
            trigger: '#writing',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 2,
          }
        });
      });
    } else {
      // No GSAP — immediately show cards
      grid.querySelectorAll('.writing-card').forEach(c => c.style.opacity = '1');
    }

  } catch (err) {
    console.warn('[Writing] Substack fetch failed:', err);

    // Graceful fallback — still links to Substack
    grid.replaceChildren();
    const msg  = document.createElement('p');
    msg.className = 'writing-error';
    const link = document.createElement('a');
    link.href   = 'https://drinkyouroj.substack.com';
    link.target = '_blank';
    link.rel    = 'noopener noreferrer';
    link.textContent = 'read on Substack →';
    msg.append("Couldn't load posts — ", link);
    grid.appendChild(msg);
  }
}

// ─────────────────────────────────────────────────────────────────
// TESTIMONIALS: Fetched from drinkyouroj.github.io
// ─────────────────────────────────────────────────────────────────
async function fetchTestimonials() {
  const grid = document.querySelector('.testimonials-grid');
  if (!grid) return;

  const BASE     = 'https://drinkyouroj.github.io/assets/testimonials/';
  const IMG_BASE = BASE;

  try {
    // Fetch index (list + clips) and all individual full-text JSONs in parallel
    const indexRes = await fetch(BASE + 'index.json', { cache: 'no-store' });
    if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status}`);
    const data = await indexRes.json();
    const list = Array.isArray(data?.testimonials) ? data.testimonials : [];
    if (!list.length) throw new Error('No testimonials');

    const fullTexts = await Promise.all(
      list.map(t =>
        fetch(`${BASE}${encodeURIComponent(t.slug)}.json`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );

    const fragment = document.createDocumentFragment();

    list.forEach((t, i) => {
      const full     = fullTexts[i];
      const nameMode = String(t.carousel_display_name || 'irl').toLowerCase();
      const name     = nameMode === 'online'
        ? (t.name_online || t.name_irl || '')
        : (t.name_irl    || t.name_online || '');

      const card = document.createElement('article');
      card.className = 'testimonial-card reveal';

      // Decorative opening quote mark
      const quoteMark = document.createElement('span');
      quoteMark.className   = 'testimonial-quote-mark';
      quoteMark.textContent = '\u201C';
      quoteMark.setAttribute('aria-hidden', 'true');

      // Clip text (shown by default)
      const clipEl = document.createElement('p');
      clipEl.className   = 'testimonial-body testimonial-clip-text';
      clipEl.textContent = t.testimonial_clip || '';

      card.append(quoteMark, clipEl);

      // Full text (hidden until toggled) — only if available and different from clip
      const fullText = full?.testimonial_full || '';
      if (fullText && fullText !== t.testimonial_clip) {
        const fullEl = document.createElement('p');
        fullEl.className   = 'testimonial-body testimonial-full-text';
        fullEl.textContent = fullText;
        // Preserve paragraph breaks from the source
        fullEl.style.whiteSpace = 'pre-line';
        card.appendChild(fullEl);

        const toggle = document.createElement('button');
        toggle.className        = 'testimonial-toggle';
        toggle.textContent      = 'Read full testimonial ↓';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
          const expanded = card.classList.toggle('expanded');
          toggle.textContent = expanded ? 'Collapse ↑' : 'Read full testimonial ↓';
          toggle.setAttribute('aria-expanded', String(expanded));
        });
        card.appendChild(toggle);
      }

      // Divider
      const divider = document.createElement('hr');
      divider.className = 'testimonial-divider';

      // Person row
      const person = document.createElement('div');
      person.className = 'testimonial-person';

      // Headshot
      const img = document.createElement('img');
      img.className = 'testimonial-avatar';
      img.alt       = name;
      img.width     = 40;
      img.height    = 40;
      img.loading   = 'lazy';
      if (t.headshot_image_url) {
        img.src = IMG_BASE + t.headshot_image_url.split('/').pop();
      }
      img.addEventListener('error', () => {
        const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        img.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' rx='20' fill='%231a1a1a'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='14' fill='%233b82f6'>${initials}</text></svg>`;
        img.alt = initials;
      });

      // Meta: name, role, LinkedIn
      const meta = document.createElement('div');
      meta.className = 'testimonial-meta';

      const nameEl = document.createElement('p');
      nameEl.className   = 'testimonial-name';
      nameEl.textContent = name;

      // Prefer index role_company — it's consistently more detailed
      const roleEl = document.createElement('p');
      roleEl.className   = 'testimonial-role';
      roleEl.textContent = t.role_company || full?.role_company || '';

      meta.append(nameEl, roleEl);

      if (t.referral_link_url && t.referral_link_text) {
        const link = document.createElement('a');
        link.className   = 'testimonial-link';
        link.href        = t.referral_link_url;
        link.target      = '_blank';
        link.rel         = 'noopener noreferrer';
        link.textContent = t.referral_link_text + ' ↗';
        meta.appendChild(link);
      }

      person.append(img, meta);
      card.append(divider, person);
      fragment.appendChild(card);
    });

    grid.replaceChildren(fragment);

    // Cursor hover bindings
    grid.querySelectorAll('.testimonial-card').forEach(card => {
      card.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      card.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

    // GSAP reveal
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.fromTo('.testimonial-card.reveal',
        { opacity: 0, y: 32 },
        {
          opacity: 1, y: 0,
          duration: 0.55, stagger: 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: '.testimonials-grid', start: 'top 82%' }
        }
      );
    } else {
      grid.querySelectorAll('.testimonial-card').forEach(c => c.style.opacity = '1');
    }

  } catch (err) {
    console.warn('[Testimonials] Fetch failed:', err);
    grid.replaceChildren();
    const msg  = document.createElement('p');
    msg.className   = 'testimonials-error';
    msg.textContent = 'Testimonials unavailable — ';
    const link = document.createElement('a');
    link.href        = 'https://drinkyouroj.github.io/#testimonials';
    link.target      = '_blank';
    link.rel         = 'noopener noreferrer';
    link.textContent = 'view on the original site →';
    msg.appendChild(link);
    grid.appendChild(msg);
  }
}
