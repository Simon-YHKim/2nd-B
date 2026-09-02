/* ============================================================
   2nd-Brain · NeuralField
   Deep-space neural field backdrop — the exact same field used on
   the 별자리(Constellation) home, extracted so other screens (위키 graph)
   can share the identical background. Fixed backdrop: it does NOT pan
   or zoom with content placed on top of it.
   Export: window.NeuralField
   ============================================================ */
function NeuralField({ style, density = 1, motion = 1 }) {
  const ref = React.useRef(null);
  const reduce = React.useRef(typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let raf, neural;
    const setup = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) { raf = setTimeout(setup, 120); return; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr; cv.height = h * dpr;
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      let seed = 99173;
      const rand = () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
      const nodes = [];
      const mk = (x, y) => { const d = 0.28 + rand() * 0.72; nodes.push({ baseX: x, baseY: y, x, y, r: 1.4 + d * 4, depth: d, phase: rand() * 6.28, drift: 4 + rand() * 9, speed: 0.08 + rand() * 0.16 }); };
      const nCount = Math.round(26 * density);
      for (let i = 0; i < nCount; i++) mk(rand() * w, rand() * h);
      const stars = [];
      const sCount = Math.round(52 * density);
      for (let i = 0; i < sCount; i++) stars.push({ x: rand() * w, y: rand() * h, r: 0.4 + rand() * 1.1, a: 0.12 + rand() * 0.4, phase: rand() * 6.28 });
      neural = { ctx, w, h, nodes, stars };
    };
    setup();
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (!neural) return;
      const { ctx, w, h, nodes, stars } = neural; const tm = now * 0.001 * (reduce.current ? 0 : motion);
      ctx.clearRect(0, 0, w, h); ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) { const a = s.a * (0.6 + Math.sin(tm * 0.4 + s.phase) * 0.3); ctx.fillStyle = `rgba(204,250,255,${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill(); }
      for (const n of nodes) { n.x = n.baseX + Math.sin(tm * n.speed + n.phase) * n.drift; n.y = n.baseY + Math.cos(tm * n.speed * 0.8 + n.phase) * n.drift * 0.55; }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (dd < 96) {
          const pulse = 0.5 + Math.sin(tm * 0.5 + a.phase + b.phase) * 0.3;
          const al = Math.max(0, (1 - dd / 96) * 0.24 * pulse * Math.min(a.depth, b.depth));
          ctx.strokeStyle = `rgba(70,182,255,${al})`; ctx.lineWidth = 0.8 + (1 - dd / 96) * 1; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + Math.sin(tm * 0.2 + i) * 4, b.x, b.y); ctx.stroke();
        }
      }
      for (const n of nodes) {
        const pulse = 0.72 + Math.sin(tm * 0.55 + n.phase) * 0.24, glow = n.r * (3.4 + pulse);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glow);
        g.addColorStop(0, `rgba(204,250,255,${0.3 * pulse * n.depth})`);
        g.addColorStop(0.4, `rgba(95,212,255,${0.1 * pulse * n.depth})`);
        g.addColorStop(1, 'rgba(70,182,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, glow, 0, 6.28); ctx.fill();
        ctx.fillStyle = `rgba(220,250,255,${Math.min(0.5, (0.26 + 0.26 * n.depth) * pulse)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); };
  }, [density, motion]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} />;
}
window.NeuralField = NeuralField;
