/* ============================================================
   2nd-Brain · NeuralField (PIXEL-CLAY 판)
   딥스페이스 뉴럴 필드 백드롭 — 홈과 동일한 필드의 공용 추출본.
   2px 그리드 스냅 · 색 밴딩(알파 금지) · 점선 연결 · 스텝 프레임.
   Export: window.NeuralField
   ============================================================ */
function NeuralField({ style, density = 1, motion = 1 }) {
  const ref = React.useRef(null);
  const reduce = React.useRef(typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let raf, neural, paused = false, onScreen = true;
    const setup = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) { raf = setTimeout(setup, 120); return; }
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      let seed = 99173;
      const rand = () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
      const cs = getComputedStyle(document.documentElement);
      const pick = (v, fb) => (cs.getPropertyValue(v) || fb).trim() || fb;
      const col = { dim: pick('--c02', '#232e4a'), mid: pick('--c03', '#3d4866'), hi: pick('--c05', '#b0b9cc'),
        star: pick('--ds-star', '#CCFAFF'), core: pick('--ds-core', '#46B6FF') };
      const nodes = [];
      const mk = (x, y) => { const d = 0.28 + rand() * 0.72; nodes.push({ baseX: x, baseY: y, x, y, r: 1.4 + d * 4, depth: d, phase: rand() * 6.28, drift: 4 + rand() * 9, speed: 0.08 + rand() * 0.16 }); };
      const nCount = Math.round(26 * density);
      for (let i = 0; i < nCount; i++) mk(rand() * w, rand() * h);
      const stars = [];
      const sCount = Math.round(52 * density);
      for (let i = 0; i < sCount; i++) stars.push({ x: rand() * w, y: rand() * h, r: 0.4 + rand() * 1.1, a: 0.12 + rand() * 0.4, phase: rand() * 6.28 });
      const pairs = [];
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (Math.hypot(a.baseX - b.baseX, a.baseY - b.baseY) < 96 + a.drift + b.drift + 12) pairs.push([a, b]);
      }
      neural = { ctx, w, h, nodes, stars, pairs, col };
    };
    setup();
    const q = (v) => Math.round(v / 2) * 2;
    const draw = (now) => {
      if (!neural || paused) return;
      const { ctx, w, h, nodes, stars, pairs, col } = neural; const tm = now * 0.001 * (reduce.current ? 0 : motion);
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = s.a * (0.6 + Math.sin(tm * 0.4 + s.phase) * 0.3);
        if (a < 0.1) continue;
        ctx.fillStyle = a > 0.32 ? col.hi : a > 0.2 ? col.mid : col.dim;
        ctx.fillRect(q(s.x), q(s.y), 2, 2);
      }
      for (const n of nodes) { n.x = n.baseX + Math.sin(tm * n.speed + n.phase) * n.drift; n.y = n.baseY + Math.cos(tm * n.speed * 0.8 + n.phase) * n.drift * 0.55; }
      for (let p = 0; p < pairs.length; p++) {
        const a = pairs[p][0], b = pairs[p][1], dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (dd < 96) {
          const pulse = 0.5 + Math.sin(tm * 0.5 + a.phase + b.phase) * 0.3;
          const al = Math.max(0, (1 - dd / 96) * 0.24 * pulse * Math.min(a.depth, b.depth));
          if (al < 0.05) continue;
          ctx.fillStyle = al > 0.12 ? col.mid : col.dim;
          const steps = Math.max(2, Math.round(dd / 9));
          for (let k = 1; k < steps; k++) ctx.fillRect(q(a.x + (b.x - a.x) * k / steps), q(a.y + (b.y - a.y) * k / steps), 2, 2);
        }
      }
      for (const n of nodes) {
        const pulse = 0.72 + Math.sin(tm * 0.55 + n.phase) * 0.24;
        const sz = Math.max(2, Math.min(6, q(n.r)));
        const x = q(n.x), y = q(n.y);
        ctx.fillStyle = n.depth > 0.7 ? col.star : n.depth > 0.45 ? col.core : col.mid;
        ctx.fillRect(x, y, sz, sz);
        if (pulse > 0.88) {
          ctx.fillStyle = col.dim;
          ctx.fillRect(x - 2, y + (sz >> 1) - 1, 2, 2); ctx.fillRect(x + sz, y + (sz >> 1) - 1, 2, 2);
          ctx.fillRect(x + (sz >> 1) - 1, y - 2, 2, 2); ctx.fillRect(x + (sz >> 1) - 1, y + sz, 2, 2);
        }
      }
    };
    const tick = setInterval(() => draw(performance.now()), 110);
    const onVis = () => { paused = document.hidden || !onScreen; };
    document.addEventListener('visibilitychange', onVis);
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => {
      onScreen = es[0].isIntersecting; onVis();
    }, { threshold: 0 }) : null;
    if (io) io.observe(cv);
    return () => { clearInterval(tick); clearTimeout(raf); document.removeEventListener('visibilitychange', onVis); if (io) io.disconnect(); };
  }, [density, motion]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} />;
}
window.NeuralField = NeuralField;
