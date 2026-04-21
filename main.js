/**
 * main.js — AI-Augmented Engineering Portfolio
 *
 * Effects:
 *   1. Ribbon hero: canvas flow-field animation + wordmark parallax + live clock
 *   2. Scroll progress bar
 *   3. About columns: horizontal slide-in from opposite sides
 *   4. How I Work: staggered scrub (tied to scroll, not snap)
 *   5. Project cards: staggered reveal + 3D tilt on hover
 *   6. Writing cards: staggered reveal
 *   7. Nav: sticky — active section tracking
 *   8. Mobile nav
 */

'use strict';

window.addEventListener('load', init);

function init() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  setupRibbonHero(prefersReducedMotion);
  setupScrollProgress();
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
      gsap.set('.reveal', { opacity: 1, x: 0, y: 0 });
    } else {
      configureScrollAnimations();
    }
  } else {
    document.querySelectorAll('.reveal').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// RIBBON HERO — flow-field canvas + wordmark parallax + live clock
// Ported from digital-designer-portfolio/src/components/RibbonHero.tsx
// (React + framer-motion → vanilla canvas + rAF + scroll listener)
// ─────────────────────────────────────────────────────────────────
function setupRibbonHero(prefersReducedMotion) {
  const hero   = document.querySelector('.ribbon-hero');
  const canvas = document.querySelector('.ribbon-canvas');
  const ui     = document.querySelector('.ribbon-ui');
  const timeEl = document.querySelector('.ribbon-time');
  if (!hero || !canvas || !ui) return;

  // ── Live clock (updates every 15s, matches original cadence) ─────
  const formatTime = () =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (timeEl) {
    timeEl.textContent = formatTime();
    setInterval(() => { timeEl.textContent = formatTime(); }, 15000);
  }

  // ── Parallax: UI layer rises at 0.55× scroll so wordmark meets
  //    the content-scroll wrapper as it slides up (faithful to the
  //    framer-motion useTransform([0, vh], [0, -vh * 0.55]) math). ──
  let ticking = false;
  function updateParallax() {
    const vh = window.innerHeight;
    const y  = Math.min(window.scrollY, vh) * -0.55;
    ui.style.transform = `translate3d(0, ${y}px, 0)`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateParallax); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', updateParallax);
  updateParallax();

  // Reduced motion: show a static background color + skip canvas rAF.
  if (prefersReducedMotion) return;

  // ── Canvas flow-field animation ──────────────────────────────────
  const C = {
    pixel: 3, count: 70, width: 14, length: 200, speed: 36,
    turb: 50, flow: 335, swirl: 71,
    mStr: 126, mRadius: 335, fade: 14, bgColor: '#0b0b0d',
    hue: 23, sat: 100, bri: 150,
  };
  const PALETTE = ['#ff0040', '#ffffff', '#888888', '#202020'];

  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const lctx = low.getContext('2d');
  const noise2 = makeValueNoise(42);

  let ribbons = [];
  let rafId = null;
  let last = performance.now();

  const mouse = {
    x: -9999, y: -9999, tx: -9999, ty: -9999,
    vx: 0, vy: 0, px: -9999, py: -9999, inside: false,
  };

  function toLow(cx, cy) {
    return {
      x: (cx / window.innerWidth)  * low.width,
      y: (cy / window.innerHeight) * low.height,
    };
  }

  function resetRibbons() {
    const W = low.width, H = low.height;
    ribbons = [];
    for (let i = 0; i < C.count; i++) {
      ribbons.push({
        x: Math.random() * W,
        y: Math.random() * H,
        colorIdx: i % PALETTE.length,
        life: Math.random() * C.length,
        maxLife: C.length,
        w: C.width * (0.6 + Math.random() * 0.8),
      });
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    low.width  = Math.max(2, Math.floor(window.innerWidth  / C.pixel));
    low.height = Math.max(2, Math.floor(window.innerHeight / C.pixel));
    lctx.fillStyle = C.bgColor;
    lctx.fillRect(0, 0, low.width, low.height);
    resetRibbons();
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const W = low.width, H = low.height;

    // Fade previous frame toward bg — creates the ribbon trails
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = C.bgColor;
    lctx.globalAlpha = Math.max(0.02, C.fade / 100);
    lctx.fillRect(0, 0, W, H);
    lctx.globalAlpha = 1;

    const speed = C.speed / 30;
    const flowScale = C.flow / 100;
    const turb  = C.turb  / 50;
    const swirl = C.swirl / 60;
    const t = now * 0.00015 * (1 + C.speed / 150);

    // Smooth mouse follow
    if (mouse.inside) {
      if (mouse.x < -1000) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
      mouse.px = mouse.x; mouse.py = mouse.y;
      mouse.x += (mouse.tx - mouse.x) * 0.18;
      mouse.y += (mouse.ty - mouse.y) * 0.18;
      mouse.vx = mouse.x - mouse.px;
      mouse.vy = mouse.y - mouse.py;
    } else {
      mouse.vx *= 0.9; mouse.vy *= 0.9;
    }

    const mOn = mouse.inside;
    const mRadius = C.mRadius / Math.max(1, C.pixel);
    const mStr = C.mStr / 50;

    for (const r of ribbons) {
      const flowOX = mOn ? (mouse.x / W - 0.5) * 0.6 : 0;
      const flowOY = mOn ? (mouse.y / H - 0.5) * 0.6 : 0;
      const nx = r.x / (W / flowScale) * 0.8;
      const ny = r.y / (H / flowScale) * 0.8;
      const n  = noise2(nx + t + flowOX, ny - t * 0.6 + flowOY);
      const ang   = Math.atan2(r.y - H / 2, r.x - W / 2) + Math.PI / 2;
      const angle = n * Math.PI * 2 * (1 + turb);
      let vx = Math.cos(angle) + Math.cos(ang) * swirl * 0.3;
      let vy = Math.sin(angle) + Math.sin(ang) * swirl * 0.3;

      if (mOn) {
        const mdx = r.x - mouse.x, mdy = r.y - mouse.y;
        const dist = Math.sqrt(mdx * mdx + mdy * mdy) + 0.0001;
        if (dist < mRadius) {
          // 'flow' mouse mode: ribbons get pushed by cursor velocity
          const f = Math.pow(1 - dist / mRadius, 2) * mStr;
          vx += mouse.vx * f * 0.6;
          vy += mouse.vy * f * 0.6;
        }
      }

      const nextX = r.x + vx * speed * dt * 60;
      const nextY = r.y + vy * speed * dt * 60;
      const rgb = adjustColor(hexToRgb(PALETTE[r.colorIdx]), C);
      const radius = Math.max(0.5, r.w / (C.pixel < 3 ? 4 : 6));

      lctx.beginPath();
      lctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      lctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      lctx.fill();
      lctx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      lctx.lineWidth = radius * 2;
      lctx.lineCap = 'round';
      lctx.beginPath();
      lctx.moveTo(r.x, r.y);
      lctx.lineTo(nextX, nextY);
      lctx.stroke();

      r.x = nextX; r.y = nextY; r.life--;
      if (r.x < -20 || r.x > W + 20 || r.y < -20 || r.y > H + 20 || r.life <= 0) {
        const side = Math.floor(Math.random() * 4);
        if      (side === 0) { r.x = Math.random() * W; r.y = -5; }
        else if (side === 1) { r.x = W + 5;             r.y = Math.random() * H; }
        else if (side === 2) { r.x = Math.random() * W; r.y = H + 5; }
        else                 { r.x = -5;                r.y = Math.random() * H; }
        r.life = r.maxLife = C.length * (0.6 + Math.random() * 0.8);
        r.w = C.width * (0.6 + Math.random() * 0.8);
      }
    }

    // Upscale low-res canvas to main canvas (nearest-neighbor pixelated look)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, canvas.width, canvas.height);

    // Scanlines overlay
    ctx.globalCompositeOperation = 'multiply';
    const scanStep = Math.max(2, C.pixel * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < canvas.height; y += scanStep) {
      ctx.fillRect(0, y, canvas.width, Math.floor(scanStep / 2));
    }
    ctx.globalCompositeOperation = 'source-over';

    rafId = requestAnimationFrame(step);
  }

  function onMove(e) {
    const p = toLow(e.clientX, e.clientY);
    mouse.tx = p.x; mouse.ty = p.y; mouse.inside = true;
  }
  function onLeave() { mouse.inside = false; }

  // Pause rAF when hero is scrolled off-screen (battery + perf)
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(step); }
    } else if (rafId) {
      cancelAnimationFrame(rafId); rafId = null;
    }
  }, { threshold: 0 });
  io.observe(hero);

  window.addEventListener('pointermove',  onMove,  { passive: true });
  window.addEventListener('pointerleave', onLeave);
  window.addEventListener('resize', resize);

  resize();
  rafId = requestAnimationFrame(step);
}

// Smooth value-noise (Perlin-ish, no dependencies)
function makeValueNoise(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const SZ = 256;
  const vals = new Float32Array(SZ * SZ);
  for (let i = 0; i < vals.length; i++) vals[i] = rand();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const x0 = ((xi % SZ) + SZ) % SZ, y0 = ((yi % SZ) + SZ) % SZ;
    const x1 = (x0 + 1) % SZ,         y1 = (y0 + 1) % SZ;
    const a = vals[y0 * SZ + x0], b = vals[y0 * SZ + x1];
    const c = vals[y1 * SZ + x0], d = vals[y1 * SZ + x1];
    const u = sm(x - xi), v = sm(y - yi);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// HSL-space color adjust (hue shift + sat + bright) matching the React version
function adjustColor([r, g, b], C) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, sat = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if      (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else                 h = ((rn - gn) / d + 4) * 60;
  }
  const hh = (h + C.hue + 360) % 360;
  const ss = Math.max(0, Math.min(1, sat * (C.sat / 100)));
  const ll = Math.max(0, Math.min(1, l * (C.bri / 100)));
  const cc = (1 - Math.abs(2 * ll - 1)) * ss;
  const hp = hh / 60, x = cc * (1 - Math.abs(hp % 2 - 1));
  let rp = 0, gp = 0, bp = 0;
  if      (hp < 1) { rp = cc; gp = x;  }
  else if (hp < 2) { rp = x;  gp = cc; }
  else if (hp < 3) { gp = cc; bp = x;  }
  else if (hp < 4) { gp = x;  bp = cc; }
  else if (hp < 5) { rp = x;  bp = cc; }
  else             { rp = cc; bp = x;  }
  const m = ll - cc / 2;
  return [Math.round((rp + m) * 255), Math.round((gp + m) * 255), Math.round((bp + m) * 255)];
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

  // Hero animation is owned by setupRibbonHero() — canvas + parallax are
  // driven independently of GSAP ScrollTrigger.

  // ── About: horizontal slide + continuing parallax drift ───
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
      .slice(0, 2);

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
