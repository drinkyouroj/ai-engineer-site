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

  setupPerfOverlay(); // dev-only — no-op unless ?debug=perf or localStorage flag
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
// DEV PERF OVERLAY — rolling FPS / frame time / canvas draws per frame
// Gated: ?debug=perf in the URL, or localStorage.setItem('perfDebug','1').
// Normal visitors never reach the instrumentation below this guard.
// ─────────────────────────────────────────────────────────────────
function setupPerfOverlay() {
  let enabled = false;
  try {
    enabled = new URLSearchParams(location.search).get('debug') === 'perf'
           || localStorage.getItem('perfDebug') === '1';
  } catch (_) { /* localStorage may be blocked — overlay stays off */ }
  if (!enabled) return;

  // Count canvas 2D draw ops by patching the prototype. Method lookups
  // resolve at call time, so this instruments every 2D context on the
  // page (low-res buffer + visible canvas) with no render-loop changes.
  let draws = 0;
  const proto = CanvasRenderingContext2D.prototype;
  ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke',
   'drawImage', 'fillText', 'strokeText', 'putImageData'].forEach(name => {
    const orig = proto[name];
    if (!orig) return;
    proto[name] = function () { draws++; return orig.apply(this, arguments); };
  });

  // Time spent inside rAF callbacks per frame (the render loop's true main-
  // thread cost — visible even when vsync pins FPS at 60). Debug-mode only.
  let scriptMs = 0;
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => origRaf((ts) => {
    const t0 = performance.now();
    cb(ts);
    scriptMs += performance.now() - t0;
  });

  const el = document.createElement('div');
  el.className = 'perf-overlay';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  const SAMPLE = 60;                       // rolling ~1s window at 60fps
  const deltas  = new Float32Array(SAMPLE);
  const scripts = new Float32Array(SAMPLE);
  let idx = 0, filled = 0;
  let prev = performance.now();
  let prevDraws = 0, prevScript = 0, lastText = 0;

  // Exposed for automated measurement (CDP harness reads this object)
  const stats = { fps: 0, frameMs: 0, worstMs: 0, draws: 0, scriptMs: 0 };
  window.__perfStats = stats;

  function tick(now) {
    deltas[idx]  = now - prev;
    scripts[idx] = scriptMs - prevScript;  // rAF-callback time this frame
    prev = now;
    prevScript = scriptMs;
    idx = (idx + 1) % SAMPLE;
    if (filled < SAMPLE) filled++;

    let sum = 0, worst = 0, scriptSum = 0;
    for (let i = 0; i < filled; i++) {
      sum += deltas[i];
      scriptSum += scripts[i];
      if (deltas[i] > worst) worst = deltas[i];
    }
    const avg = sum / filled;
    stats.fps      = 1000 / avg;
    stats.frameMs  = avg;
    stats.worstMs  = worst;
    stats.scriptMs = scriptSum / filled;
    stats.draws    = draws - prevDraws;    // canvas ops since previous frame
    prevDraws = draws;

    // Repaint the readout at ~5Hz so the overlay itself stays cheap
    if (now - lastText > 200) {
      lastText = now;
      el.textContent =
        `${stats.fps.toFixed(1).padStart(5)} fps\n` +
        `${stats.frameMs.toFixed(2).padStart(6)} ms avg\n` +
        `${stats.worstMs.toFixed(2).padStart(6)} ms worst\n` +
        `${stats.scriptMs.toFixed(2).padStart(6)} ms raf-js\n` +
        `${String(stats.draws).padStart(4)} draws/frame`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
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

  // ── Wordmark auto-fit: CSS clamp handles the common case, but some
  //    viewport / font combos (narrow landscape phones) still overflow
  //    because `white-space: nowrap` can't self-correct. Measure after
  //    layout and scale down via font-size if scrollWidth > container.
  const wordmark = document.querySelector('.wordmark-inner');
  const wordmarkHost = document.querySelector('.wordmark');
  function fitWordmark() {
    if (!wordmark || !wordmarkHost) return;
    wordmark.style.fontSize = '';                          // reset to CSS
    // Target: text fills viewport minus ~2% breathing room on each side.
    const avail = wordmarkHost.clientWidth * 0.96;
    let fs = parseFloat(getComputedStyle(wordmark).fontSize);
    // Proportional scaling: one or two iterations converge quickly.
    // Grows as well as shrinks since `.wordmark-inner` is content-sized.
    for (let i = 0; i < 6; i++) {
      const actual = wordmark.offsetWidth;
      if (actual <= 0) break;
      const ratio = avail / actual;
      if (Math.abs(ratio - 1) < 0.01) break;               // within 1% of target
      fs = Math.max(12, Math.min(600, fs * ratio));
      wordmark.style.fontSize = fs + 'px';
    }
  }
  fitWordmark();
  window.addEventListener('resize', fitWordmark);
  // Re-fit after webfonts load (first paint uses fallback metrics)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitWordmark);
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

  // Live render telemetry — real numbers from the render loop, shown in
  // the bottom meta strip. Decorative (aria-hidden in the markup).
  const telemetryEl = hero.querySelector('.ribbon-telemetry');

  // Reduced motion: show a static background color + skip canvas rAF.
  // The telemetry says so honestly instead of showing stale numbers.
  if (prefersReducedMotion) {
    if (telemetryEl) telemetryEl.textContent = 'RENDER PAUSED · REDUCED MOTION';
    return;
  }

  // ── Canvas flow-field animation ──────────────────────────────────
  // Defaults match the reference prototype (swirling-name-hero-portfolio)
  const C = {
    pixel: 3, count: 35, width: 14, length: 200, speed: 36,
    turb: 50, flow: 335, swirl: 71,
    mStr: 126, mRadius: 335, fade: 14, bgColor: '#0b0b0d',
    hue: 0, sat: 110, bri: 130,
  };

  // Adaptive render quality — for browsers compositing in software
  // (graphics acceleration off, blocklisted GPUs), where the hero runs
  // ~36fps because of composite AREA, not JS. One-way ratchet:
  //   level 1: cap canvas dpr at 1 (4× less upscale raster work;
  //            simulation buffer untouched, so the swirl is identical)
  //   level 2: freeze the film grain (html.render-lite — grain stays
  //            visible, stops re-compositing the viewport every 80ms)
  // Trips only on SUSTAINED starvation: ADAPT.badNeeded consecutive
  // 500ms windows under ADAPT.minFps, after a warmup that lets the
  // load transient (RSS fetch, GSAP card injection) clear. Windows
  // longer than ADAPT.staleMs are a hidden tab / paused rAF, not
  // slowness — discarded. Never recovers within a session: degrading
  // raises FPS, which would un-trip a two-way rule and oscillate.
  const ADAPT = { minFps: 45, badNeeded: 6, warmupMs: 2000, staleMs: 1500 };
  let adaptLevel = 0, badWindows = 0;
  const setupAt = performance.now();
  // Blue shades matching --color-accent-primary (#3b82f6)
  const PALETTE = ['#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'];

  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const lctx = low.getContext('2d');
  const noise2 = makeValueNoise(42);

  // Palette + adjustment config are constants, so the HSL round-trip in
  // adjustColor() has exactly PALETTE.length distinct results. Compute them
  // once instead of 35×/frame (ribbons) + 40×/frame (cursor trail).
  // RIBBON_RGB  → 'rgb(r,g,b)' for ribbon fill/stroke
  // TRAIL_RGB   → 'r,g,b' prefix for the trail's per-particle alpha
  const RIBBON_RGB = PALETTE.map(hex => {
    const [r, g, b] = adjustColor(hexToRgb(hex), C);
    return `rgb(${r},${g},${b})`;
  });
  const TRAIL_RGB = PALETTE.map(hex => adjustColor(hexToRgb(hex), C).join(','));

  // Scanlines never change: pre-render one 1×scanStep tile and fill the
  // whole canvas with it as a repeating pattern — 1 draw call per frame
  // instead of canvas.height / scanStep (~300) fillRects. This is the big
  // Brave win: Brave's fingerprint defenses hook canvas ops per call, so
  // its per-frame tax scales with draw-call count, not painted pixels.
  const scanStep = Math.max(2, C.pixel * 2);
  const scanTile = document.createElement('canvas');
  scanTile.width = 1;
  scanTile.height = scanStep;
  const scanCtx = scanTile.getContext('2d');
  scanCtx.fillStyle = 'rgba(0,0,0,0.35)';
  scanCtx.fillRect(0, 0, 1, Math.floor(scanStep / 2));
  const scanPattern = ctx.createPattern(scanTile, 'repeat');

  let ribbons = [];
  let rafId = null;
  let last = performance.now();
  let telFrames = 0, telLast = last;   // telemetry: frames since last readout

  const mouse = {
    x: -9999, y: -9999, tx: -9999, ty: -9999,
    vx: 0, vy: 0, px: -9999, py: -9999, inside: false,
    trail: [],
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

  let dprCap = 2;   // lowered to 1 by the adaptive ratchet (level 1)

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width  = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    // Only rebuild the simulation buffer when its size actually changed —
    // assigning canvas dimensions clears content, and a dpr-only change
    // (adaptive level 1) must not wipe trails or respawn ribbons.
    const lw = Math.max(2, Math.floor(window.innerWidth  / C.pixel));
    const lh = Math.max(2, Math.floor(window.innerHeight / C.pixel));
    if (lw !== low.width || lh !== low.height) {
      low.width  = lw;
      low.height = lh;
      lctx.fillStyle = C.bgColor;
      lctx.fillRect(0, 0, low.width, low.height);
      resetRibbons();
    }
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
      const rgb = RIBBON_RGB[r.colorIdx];
      const radius = Math.max(0.5, r.w / (C.pixel < 3 ? 4 : 6));

      lctx.beginPath();
      lctx.fillStyle = rgb;
      lctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      lctx.fill();
      lctx.strokeStyle = rgb;
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

    // Cursor trail (fading particles along the smoothed mouse path)
    let trailDraws = 0;
    if (mouse.inside && mouse.x > -1000) {
      mouse.trail.push({ x: mouse.x, y: mouse.y, life: 1 });
      if (mouse.trail.length > 40) mouse.trail.shift();
      for (let i = 0; i < mouse.trail.length; i++) {
        const p = mouse.trail[i];
        p.life -= 0.035;
        if (p.life <= 0) continue;
        const rad = Math.max(0.8, (C.width / Math.max(1, C.pixel)) * p.life * 0.9);
        lctx.beginPath();
        lctx.fillStyle = `rgba(${TRAIL_RGB[i % TRAIL_RGB.length]},${p.life})`;
        lctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        lctx.fill();
        trailDraws++;
      }
      mouse.trail = mouse.trail.filter(p => p.life > 0);
    }

    // Upscale low-res canvas to main canvas (nearest-neighbor pixelated look)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, canvas.width, canvas.height);

    // Scanlines overlay — one pattern fill (pre-rendered tile, see setup)
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = scanPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // 500ms accounting window — feeds both the telemetry readout and the
    // adaptive-quality ratchet (which must run even without the readout).
    telFrames++;
    if (now - telLast >= 500) {
      const windowMs = now - telLast;
      const fps = Math.round((telFrames * 1000) / windowMs);

      // Adaptive ratchet: sustained sub-minFps after warmup escalates one
      // level. Stale windows (hidden tab, paused rAF) don't count either way.
      if (adaptLevel < 2 && windowMs < ADAPT.staleMs && now - setupAt > ADAPT.warmupMs) {
        badWindows = fps < ADAPT.minFps ? badWindows + 1 : 0;
        if (badWindows >= ADAPT.badNeeded) {
          adaptLevel++;
          badWindows = 0;
          if (adaptLevel === 1) {
            dprCap = 1;
            resize();
          } else {
            document.documentElement.classList.add('render-lite');
          }
        }
      }

      if (telemetryEl) {
        const drawOps = 3 + ribbons.length * 2 + trailDraws;
        telemetryEl.textContent =
          `RENDER ${fps}FPS · ${drawOps} DRAWS/F · ${W}×${H}${adaptLevel ? ' · LITE' : ''}`;
      }
      telFrames = 0;
      telLast = now;
    }

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
// RESILIENT FEED LOADER — shared by Writing + Testimonials
//
// Strategy: stale-while-revalidate. Last-good data (localStorage)
// renders immediately on repeat visits; the network revalidates in
// the background and re-renders only when content actually changed.
// Network failures keep last-good content on screen — the link-out
// fallback is reserved for cold-cache + failure.
// ─────────────────────────────────────────────────────────────────

// Network tuning — JS logic, not design tokens (see CLAUDE.md).
// rss2json answers in ~2-3s when healthy, so the timeout must clear that.
const FEED_TIMEOUT_MS       = 6000;  // per attempt, via AbortController
const FEED_RETRIES          = 1;     // extra attempts after the first
const FEED_RETRY_BACKOFF_MS = 1000;  // doubles per retry
const FEED_CACHE_PREFIX     = 'feed:';
const FEED_CACHE_SCHEMA     = 2;     // bump when a normalized card shape changes

function feedCacheRead(name) {
  try {
    const raw = localStorage.getItem(FEED_CACHE_PREFIX + name);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    // Stale schema reads as a miss — never render old shapes with new code
    if (entry.schema !== FEED_CACHE_SCHEMA) return null;
    if (!Array.isArray(entry.items) || !entry.items.length) return null;
    return entry.items;
  } catch (_) {
    return null; // blocked storage / corrupt JSON — behave like a cold load
  }
}

function feedCacheWrite(name, items) {
  try {
    localStorage.setItem(
      FEED_CACHE_PREFIX + name,
      JSON.stringify({ schema: FEED_CACHE_SCHEMA, savedAt: Date.now(), items })
    );
  } catch (_) { /* quota or private mode — cache is best-effort */ }
}

// fetch + parse with an abortable timeout and bounded retry.
// Retries cover network errors, timeouts, and 5xx. 4xx never retries —
// rss2json rate-limits, and hammering a 429 compounds the problem.
async function fetchJsonRetry(url, { retries = FEED_RETRIES, fetchOpts = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, FEED_RETRY_BACKOFF_MS * (2 ** (attempt - 1))));
    }
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...fetchOpts, signal: ctrl.signal });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status < 500) break;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function loadFeedSWR({ name, fetchFresh, render, renderFallback }) {
  const cached = feedCacheRead(name);
  if (cached) render(cached, { entrance: true });

  try {
    const fresh = await fetchFresh();
    feedCacheWrite(name, fresh);
    if (!cached) {
      render(fresh, { entrance: true });
    } else if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
      // Reconcile: content really changed — quiet crossfade, no re-reveal
      render(fresh, { entrance: false });
    }
  } catch (err) {
    console.warn(`[${name}] fetch failed${cached ? ' — keeping cached content' : ''}:`, err);
    if (!cached) renderFallback();
  }
}

function bindCursorHover(nodes) {
  nodes.forEach(node => {
    node.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    node.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });
}

function killFeedTweens(tweens) {
  tweens.forEach(t => {
    if (t.scrollTrigger) t.scrollTrigger.kill();
    t.kill();
  });
}

// Restart the CSS reconcile crossfade (.feed-swap in style.css)
function restartFeedSwap(grid) {
  grid.classList.remove('feed-swap');
  void grid.offsetWidth; // flush so the animation re-runs
  grid.classList.add('feed-swap');
}

// ─────────────────────────────────────────────────────────────────
// WRITING: Live Substack RSS feed via rss2json CORS proxy
// ─────────────────────────────────────────────────────────────────
function fetchWritingPosts() {
  const grid = document.querySelector('.writing-grid');
  if (!grid) return;

  const RSS_URL  = 'https://drinkyouroj.substack.com/feed';
  const API      = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

  let tweens = [];

  // Network + normalize + validate. The returned shape is exactly what
  // render() consumes and what the cache stores (see FEED_CACHE_SCHEMA).
  async function fetchFresh() {
    const data = await fetchJsonRetry(API);
    if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('Feed error');

    const items = data.items
      .filter(item => item && typeof item.link === 'string')
      .slice(0, 3)
      .map(item => {
        // Strip HTML from description to a plain-text excerpt. DOMParser
        // yields an inert document — no resource loads, no event handlers.
        const doc = new DOMParser().parseFromString(item.description || item.content || '', 'text/html');
        const raw = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          title:   String(item.title || ''),
          link:    item.link,
          pubDate: String(item.pubDate || ''),
          excerpt: raw.length > 140 ? raw.slice(0, 140).trimEnd() + '…' : raw,
        };
      });

    if (!items.length) throw new Error('Empty feed');
    return items;
  }

  function buildCard(item, withReveal) {
    const date    = new Date(item.pubDate);
    const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const card = document.createElement('a');
    card.href             = item.link;
    card.target           = '_blank';
    card.rel              = 'noopener noreferrer';
    card.className        = withReveal ? 'writing-card reveal' : 'writing-card';
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
    body.textContent      = item.excerpt;

    const cta   = document.createElement('span');
    cta.className         = 'writing-cta';
    cta.textContent       = 'Read on Substack →';

    card.append(time, title, body, cta);
    return card;
  }

  function render(items, { entrance }) {
    killFeedTweens(tweens);
    tweens = [];

    const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Only hide cards behind the .reveal class when GSAP will actually
    // reveal them — otherwise they'd be stranded at opacity 0
    const animateEntrance = entrance && hasGsap && !reduced;

    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(buildCard(item, animateEntrance)));
    grid.replaceChildren(fragment);
    grid.setAttribute('aria-busy', 'false');

    const cards = grid.querySelectorAll('.writing-card');
    bindCursorHover(cards);

    if (animateEntrance) {
      tweens.push(gsap.fromTo('.writing-card.reveal',
        { opacity: 0, y: 32 },
        {
          opacity: 1, y: 0,
          duration: 0.55, stagger: 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: '.writing-grid', start: 'top 82%' }
        }
      ));
    } else if (!entrance && !reduced) {
      restartFeedSwap(grid);
    }

    if (hasGsap && !reduced) {
      cards.forEach((card, i) => {
        tweens.push(gsap.to(card, {
          y: -20 - (i * 10),
          ease: 'none',
          scrollTrigger: {
            trigger: '#writing',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 2,
          }
        }));
      });
    }
  }

  // Cold-cache failure only — still links out to the publication
  function renderFallback() {
    const msg  = document.createElement('p');
    msg.className = 'writing-error';
    const link = document.createElement('a');
    link.href   = 'https://drinkyouroj.substack.com';
    link.target = '_blank';
    link.rel    = 'noopener noreferrer';
    link.textContent = 'read The Civic Node on Substack →';
    msg.append("Couldn't load posts — ", link);

    grid.replaceChildren(msg);
    grid.setAttribute('aria-busy', 'false');
  }

  loadFeedSWR({ name: 'writing', fetchFresh, render, renderFallback });
}

// ─────────────────────────────────────────────────────────────────
// TESTIMONIALS: Fetched from drinkyouroj.github.io
// ─────────────────────────────────────────────────────────────────
function fetchTestimonials() {
  const grid = document.querySelector('.testimonials-grid');
  if (!grid) return;

  const BASE = 'https://drinkyouroj.github.io/assets/testimonials/';
  let tweens = [];

  // Network + normalize + validate. The index lists everything render()
  // needs except full text, which comes from per-slug JSONs; a failed
  // per-slug fetch degrades that card to clip-only, never to an error.
  async function fetchFresh() {
    const data = await fetchJsonRetry(BASE + 'index.json', { fetchOpts: { cache: 'no-store' } });
    const list = Array.isArray(data?.testimonials) ? data.testimonials : [];
    if (!list.length) throw new Error('No testimonials');

    const fullTexts = await Promise.all(
      list.map(t =>
        fetchJsonRetry(`${BASE}${encodeURIComponent(t.slug)}.json`,
          { fetchOpts: { cache: 'no-store' }, retries: 0 })
          .catch(() => null)
      )
    );

    return list.map((t, i) => {
      const full     = fullTexts[i];
      const nameMode = String(t.carousel_display_name || 'irl').toLowerCase();
      return {
        name: nameMode === 'online'
          ? (t.name_online || t.name_irl || '')
          : (t.name_irl    || t.name_online || ''),
        // Prefer index role_company — it's consistently more detailed
        role:     t.role_company || full?.role_company || '',
        clip:     t.testimonial_clip || '',
        full:     full?.testimonial_full || '',
        headshot: t.headshot_image_url ? BASE + t.headshot_image_url.split('/').pop() : '',
        refUrl:   t.referral_link_url  || '',
        refText:  t.referral_link_text || '',
      };
    });
  }

  function buildCard(t, withReveal) {
    const card = document.createElement('article');
    card.className = withReveal ? 'testimonial-card reveal' : 'testimonial-card';

    // Decorative opening quote mark
    const quoteMark = document.createElement('span');
    quoteMark.className   = 'testimonial-quote-mark';
    quoteMark.textContent = '“';
    quoteMark.setAttribute('aria-hidden', 'true');

    // Clip text (shown by default)
    const clipEl = document.createElement('p');
    clipEl.className   = 'testimonial-body testimonial-clip-text';
    clipEl.textContent = t.clip;

    card.append(quoteMark, clipEl);

    // Full text (hidden until toggled) — only if available and different from clip
    if (t.full && t.full !== t.clip) {
      const fullEl = document.createElement('p');
      fullEl.className   = 'testimonial-body testimonial-full-text';
      fullEl.textContent = t.full;
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

    // Headshot — falls back to initials if the image fails to load
    const img = document.createElement('img');
    img.className = 'testimonial-avatar';
    img.alt       = t.name;
    img.width     = 40;
    img.height    = 40;
    img.loading   = 'lazy';
    if (t.headshot) img.src = t.headshot;
    img.addEventListener('error', () => {
      const initials = t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      img.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' rx='20' fill='%231a1a1a'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='14' fill='%233b82f6'>${initials}</text></svg>`;
      img.alt = initials;
    });

    // Meta: name, role, LinkedIn
    const meta = document.createElement('div');
    meta.className = 'testimonial-meta';

    const nameEl = document.createElement('p');
    nameEl.className   = 'testimonial-name';
    nameEl.textContent = t.name;

    const roleEl = document.createElement('p');
    roleEl.className   = 'testimonial-role';
    roleEl.textContent = t.role;

    meta.append(nameEl, roleEl);

    if (t.refUrl && t.refText) {
      const link = document.createElement('a');
      link.className   = 'testimonial-link';
      link.href        = t.refUrl;
      link.target      = '_blank';
      link.rel         = 'noopener noreferrer';
      link.textContent = t.refText + ' ↗';
      meta.appendChild(link);
    }

    person.append(img, meta);
    card.append(divider, person);
    return card;
  }

  function render(items, { entrance }) {
    killFeedTweens(tweens);
    tweens = [];

    const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animateEntrance = entrance && hasGsap && !reduced;

    const fragment = document.createDocumentFragment();
    items.forEach(t => fragment.appendChild(buildCard(t, animateEntrance)));
    grid.replaceChildren(fragment);
    grid.setAttribute('aria-busy', 'false');

    bindCursorHover(grid.querySelectorAll('.testimonial-card'));

    if (animateEntrance) {
      tweens.push(gsap.fromTo('.testimonial-card.reveal',
        { opacity: 0, y: 32 },
        {
          opacity: 1, y: 0,
          duration: 0.55, stagger: 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: '.testimonials-grid', start: 'top 82%' }
        }
      ));
    } else if (!entrance && !reduced) {
      restartFeedSwap(grid);
    }
  }

  // Cold-cache failure only — still links out to the original site
  function renderFallback() {
    const msg  = document.createElement('p');
    msg.className   = 'testimonials-error';
    msg.textContent = 'Testimonials unavailable — ';
    const link = document.createElement('a');
    link.href        = 'https://drinkyouroj.github.io/#testimonials';
    link.target      = '_blank';
    link.rel         = 'noopener noreferrer';
    link.textContent = 'view on the original site →';
    msg.appendChild(link);
    grid.replaceChildren(msg);
    grid.setAttribute('aria-busy', 'false');
  }

  loadFeedSWR({ name: 'testimonials', fetchFresh, render, renderFallback });
}
