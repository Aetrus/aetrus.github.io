// The ground: a slow starfield with faint orbits, tinted by the active Binding.
// Static under prefers-reduced-motion; paused when the tab is hidden.

export function starfield(canvas) {
  const g = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let w = 0, h = 0, dpr = 1, stars = [], raf = 0, t0 = performance.now();
  let tint = { star: '235,230,238', lumen: '230,199,127', strength: 0.5, light: false };
  let scrollY = window.scrollY;
  let px = 0, py = 0, tx = 0, ty = 0;

  function readTint() {
    const cs = getComputedStyle(document.documentElement);
    const rgb = (v, fallback) => {
      const s = cs.getPropertyValue(v).trim();
      const m = s.match(/^#([0-9a-f]{6})$/i);
      if (!m) return fallback;
      const n = parseInt(m[1], 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    };
    tint = {
      star: rgb('--star', '235,230,238'),
      lumen: rgb('--lumen', '230,199,127'),
      strength: parseFloat(cs.getPropertyValue('--lumen-strength')) || 0.5,
      light: document.documentElement.dataset.mode === 'light',
    };
  }

  function seed() {
    const count = Math.round(Math.min(420, (w * h) / 5200));
    let s = 1337;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    stars = Array.from({ length: count }, () => {
      const z = R();
      return {
        x: R() * w, y: R() * h * 1.6, z,
        r: z < 0.85 ? 0.35 + R() * 0.8 : 0.9 + R() * 1.3,
        a: 0.25 + R() * 0.65,
        tw: R() * Math.PI * 2, sp: 0.4 + R() * 1.6,
        warm: R() < 0.18,
      };
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(performance.now());
  }

  function orbit(cx, cy, rx, ry, rot, alpha) {
    g.save();
    g.translate(cx, cy); g.rotate(rot);
    g.strokeStyle = `rgba(${tint.lumen},${alpha})`;
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, w, h);
    px += (tx - px) * 0.04; py += (ty - py) * 0.04;
    const light = tint.light;
    // orbits, off to the upper right
    const oa = (light ? 0.10 : 0.07) * (tint.strength / 0.5);
    const cx = w * 0.86 + px * 10, cy = -h * 0.1 - scrollY * 0.05;
    orbit(cx, cy, w * 0.55, h * 0.42, -0.35, oa);
    orbit(cx, cy, w * 0.82, h * 0.66, -0.35, oa * 0.75);
    orbit(cx, cy, w * 1.15, h * 0.95, -0.35, oa * 0.5);
    // stars
    for (const s of stars) {
      const depth = 0.15 + s.z * 0.85;
      let y = (s.y - scrollY * depth * 0.25) % (h * 1.6);
      if (y < 0) y += h * 1.6;
      if (y > h + 4) continue;
      const x = s.x + px * depth * 14;
      const twinkle = reduce.matches ? 1 : 0.65 + 0.35 * Math.sin(t * s.sp + s.tw);
      const a = s.a * twinkle * (light ? 0.55 : 1);
      g.fillStyle = `rgba(${s.warm ? tint.lumen : tint.star},${a})`;
      g.beginPath(); g.arc(x, y + py * depth * 10, s.r, 0, Math.PI * 2); g.fill();
      if (s.r > 1.6 && !light) {
        g.fillStyle = `rgba(${tint.lumen},${a * 0.12})`;
        g.beginPath(); g.arc(x, y + py * depth * 10, s.r * 4, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function loop(now) {
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduce.matches || document.hidden) { draw(performance.now()); return; }
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', () => { scrollY = window.scrollY; if (reduce.matches) draw(performance.now()); }, { passive: true });
  window.addEventListener('pointermove', (e) => { tx = e.clientX / w - 0.5; ty = e.clientY / h - 0.5; }, { passive: true });
  document.addEventListener('visibilitychange', start);
  reduce.addEventListener?.('change', start);

  readTint();
  resize();
  start();
  return { retint() { readTint(); draw(performance.now()); } };
}
