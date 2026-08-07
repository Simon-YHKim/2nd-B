/* ============================================================
   2nd-Brain · Constellation Home (구조 보존)
   북극성(12시) + 북두칠성 7별 + 큰 세컨비 머리(터치추적) + 말풍선.
   Deep-space neural field background (palette-independent).
   Variation A: stars top / head bottom (canonical).
   Variation B: head centered, constellation arc above, soul-core card pinned.
   Export: window.ConstellationHome
   ============================================================ */
const { useState, useRef, useEffect } = React;
const { STARS: SB_STARS, STAR_LINES: SB_LINES, MOOD: SB_MOOD } = function () {
  return { STARS: window.SB.STARS, STAR_LINES: window.SB.STAR_LINES, MOOD: window.MOOD };
}();

function SecondBHead({ scale = 1, expression = 'neutral', headRef, leftEyeRef, rightEyeRef, mouthRef, sphereRef }) {
  const W = 152 * scale;
  const moodC = SB_MOOD[expression];
  // expression → eye height + mouth shape
  const eyeH = expression === 'positive' ? 13 : expression === 'negative' ? 17 : 16;
  const mouth = expression === 'positive' ?
  { w: 16, h: 7, radius: '0 0 9px 9px', bg: 'transparent', border: `2.5px solid #5FD4FF`, borderTop: 'none' } :
  expression === 'negative' ?
  { w: 16, h: 7, radius: '9px 9px 0 0', bg: 'transparent', border: `2.5px solid #5FD4FF`, borderBottom: 'none' } :
  { w: 15, h: 3.5, radius: 9, bg: '#5FD4FF', border: 'none' };
  return (
    <div style={{ position: 'relative', width: W, height: W }}>
      {/* mood orb glow behind head */}
      <div ref={sphereRef} style={{ position: 'absolute', left: '50%', top: '8%', width: W * 0.62, height: W * 0.62,
        transform: 'translateX(-50%)', borderRadius: '50%', filter: 'blur(8px)', pointerEvents: 'none',
        background: `radial-gradient(circle, ${moodC}cc, ${moodC}55 52%, transparent 76%)`,
        animation: 'sb-dim 3.4s ease-in-out infinite' }} />
      <div ref={headRef} style={{ position: 'relative', width: W, height: W, transformStyle: 'preserve-3d', willChange: 'transform' }}>
        <img src="assets/deepspace/secondb-head-blank.png" alt="세컨비" draggable="false"
        style={{ width: '100%', height: '100%', display: 'block', filter: 'drop-shadow(0 16px 26px rgba(70,90,200,.42))' }} />
        {/* dark face screen masks the baked eyes so dynamic eyes can track */}
        <div style={{ position: 'absolute', left: '50%', top: '60%', width: '47%', height: '23.5%',
          transform: 'translate(-50%,-50%)', borderRadius: 10 * scale,
          background: 'linear-gradient(180deg,#0a1020,#03060e 62%)',
          boxShadow: 'inset 0 1px 6px rgba(120,150,255,.18), inset 0 -4px 10px rgba(0,0,0,.6)' }} />
        <div style={{ position: 'absolute', left: '38.5%', top: '58.5%', width: 0, height: 0 }}>
          <div ref={leftEyeRef} style={{ position: 'absolute', left: -5 * scale, top: -8 * scale,
            width: 10 * scale, height: eyeH * scale, borderRadius: 4 * scale,
            background: 'radial-gradient(60% 60% at 50% 42%,#CCFAFF,#46B6FF 72%)',
            boxShadow: '0 0 9px rgba(70,182,255,.85),0 0 16px rgba(70,182,255,.4)', willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', left: '61.5%', top: '58.5%', width: 0, height: 0 }}>
          <div ref={rightEyeRef} style={{ position: 'absolute', left: -5 * scale, top: -8 * scale,
            width: 10 * scale, height: eyeH * scale, borderRadius: 4 * scale,
            background: 'radial-gradient(60% 60% at 50% 42%,#CCFAFF,#46B6FF 72%)',
            boxShadow: '0 0 9px rgba(70,182,255,.85),0 0 16px rgba(70,182,255,.4)', willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '65.5%', width: 0, height: 0 }}>
          <div ref={mouthRef} style={{ position: 'absolute', left: -mouth.w * scale / 2, top: 0,
            width: mouth.w * scale, height: mouth.h * scale, borderRadius: mouth.radius,
            background: mouth.bg, border: mouth.border, borderTop: mouth.borderTop, borderBottom: mouth.borderBottom,
            boxShadow: '0 0 8px rgba(70,182,255,.8)', willChange: 'transform' }} />
        </div>
      </div>
    </div>);

}

/* Shared deep-space neural background (same field as 별자리 home).
   focusY = vertical focus of the head-avoidance zone (0..1). */
function NeuralBg({ focusY = 0.5, style }) {
  const neuralRef = useRef(null);
  useEffect(() => {
    const cv = neuralRef.current; if (!cv) return;
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
      for (let i = 0; i < 24; i++) mk(rand() * w, rand() * h);
      const stars = [];
      for (let i = 0; i < 46; i++) stars.push({ x: rand() * w, y: rand() * h, r: 0.4 + rand() * 1.1, a: 0.12 + rand() * 0.4, phase: rand() * 6.28 });
      neural = { ctx, w, h, nodes, stars, hx: w / 2, hy: h * focusY };
    };
    setup();
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (!neural) return;
      const { ctx, w, h, nodes, stars } = neural; const tm = now * 0.001;
      ctx.clearRect(0, 0, w, h); ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) { const a = s.a * (0.6 + Math.sin(tm * 0.4 + s.phase) * 0.3); ctx.fillStyle = `rgba(204,250,255,${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill(); }
      for (const n of nodes) { n.x = n.baseX + Math.sin(tm * n.speed + n.phase) * n.drift; n.y = n.baseY + Math.cos(tm * n.speed * 0.8 + n.phase) * n.drift * 0.55; }
      const near = (n) => Math.hypot(n.x - neural.hx, n.y - neural.hy) > 70;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (dd < 96 && near(a) && near(b)) {
          const pulse = 0.5 + Math.sin(tm * 0.5 + a.phase + b.phase) * 0.3;
          const al = Math.max(0, (1 - dd / 96) * 0.24 * pulse * Math.min(a.depth, b.depth));
          ctx.strokeStyle = `rgba(70,182,255,${al})`; ctx.lineWidth = 0.8 + (1 - dd / 96) * 1; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + Math.sin(tm * 0.2 + i) * 4, b.x, b.y); ctx.stroke();
        }
      }
      for (const n of nodes) {
        const fade = near(n) ? 1 : 0.16, pulse = 0.72 + Math.sin(tm * 0.55 + n.phase) * 0.24, glow = n.r * (3.4 + pulse);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glow);
        g.addColorStop(0, `rgba(204,250,255,${0.3 * pulse * n.depth * fade})`);
        g.addColorStop(0.4, `rgba(95,212,255,${0.1 * pulse * n.depth * fade})`);
        g.addColorStop(1, 'rgba(70,182,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, glow, 0, 6.28); ctx.fill();
        ctx.fillStyle = `rgba(220,250,255,${Math.min(0.5, (0.26 + 0.26 * n.depth) * pulse) * fade})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); };
  }, [focusY]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, ...style,
      background: 'radial-gradient(120% 70% at 50% 26%,rgba(26,72,120,.5) 0%,rgba(11,33,66,.3) 42%,#070A13 76%), #05070d' }}>
      <canvas ref={neuralRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at 50% 30%,transparent 0 40%,rgba(7,10,19,.3) 72%,rgba(7,10,19,.62) 100%)' }} />
    </div>);
}

function ConstellationHome({ t, onStar, active }) {
  const stageRef = useRef(null),headRef = useRef(null);
  const leftEyeRef = useRef(null),rightEyeRef = useRef(null),mouthRef = useRef(null);
  const bubbleRef = useRef(null),sphereRef = useRef(null),neuralRef = useRef(null);
  const [focus, setFocus] = useState(null);
  const [bubble, setBubble] = useState(null);
  const [menu, setMenu] = useState(false);
  const [persona, setPersona] = useState(false);
  const hold = useRef(null),focusRef = useRef(null);
  const motion = (t.motion ?? 70) / 70;
  const variantB = t.homeVariant === 'B';

  /* ---- neural background field (deep space) ---- */
  useEffect(() => {
    const cv = neuralRef.current;if (!cv) return;
    let raf, neural;
    const setup = () => {
      const w = cv.clientWidth,h = cv.clientHeight;
      if (!w || !h) {raf = setTimeout(setup, 120);return;}
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr;cv.height = h * dpr;
      const ctx = cv.getContext('2d');ctx.scale(dpr, dpr);
      let seed = 99173;
      const rand = () => {seed = seed + 0x6D2B79F5 | 0;let x = Math.imul(seed ^ seed >>> 15, 1 | seed);x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;return ((x ^ x >>> 14) >>> 0) / 4294967296;};
      const nodes = [];
      const mk = (x, y) => {const d = 0.28 + rand() * 0.72;nodes.push({ baseX: x, baseY: y, x, y, r: 1.4 + d * 4, depth: d, phase: rand() * 6.28, drift: 4 + rand() * 9, speed: 0.08 + rand() * 0.16 });};
      for (let i = 0; i < 24; i++) mk(rand() * w, rand() * h);
      const stars = [];
      for (let i = 0; i < 46; i++) stars.push({ x: rand() * w, y: rand() * h, r: 0.4 + rand() * 1.1, a: 0.12 + rand() * 0.4, phase: rand() * 6.28 });
      neural = { ctx, w, h, nodes, stars, hx: w / 2, hy: variantB ? h * 0.5 : h * 0.7 };
    };
    setup();
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (!neural) return;
      const { ctx, w, h, nodes, stars } = neural;const tm = now * 0.001;
      ctx.clearRect(0, 0, w, h);ctx.save();ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {const a = s.a * (0.6 + Math.sin(tm * 0.4 + s.phase) * 0.3);ctx.fillStyle = `rgba(204,250,255,${a})`;ctx.beginPath();ctx.arc(s.x, s.y, s.r, 0, 6.28);ctx.fill();}
      for (const n of nodes) {n.x = n.baseX + Math.sin(tm * n.speed + n.phase) * n.drift;n.y = n.baseY + Math.cos(tm * n.speed * 0.8 + n.phase) * n.drift * 0.55;}
      const near = (n) => Math.hypot(n.x - neural.hx, n.y - neural.hy) > 70;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],b = nodes[j],dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (dd < 96 && near(a) && near(b)) {
          const pulse = 0.5 + Math.sin(tm * 0.5 + a.phase + b.phase) * 0.3;
          const al = Math.max(0, (1 - dd / 96) * 0.24 * pulse * Math.min(a.depth, b.depth));
          ctx.strokeStyle = `rgba(70,182,255,${al})`;ctx.lineWidth = 0.8 + (1 - dd / 96) * 1;ctx.lineCap = 'round';
          ctx.beginPath();ctx.moveTo(a.x, a.y);ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + Math.sin(tm * 0.2 + i) * 4, b.x, b.y);ctx.stroke();
        }
      }
      for (const n of nodes) {
        const fade = near(n) ? 1 : 0.16,pulse = 0.72 + Math.sin(tm * 0.55 + n.phase) * 0.24,glow = n.r * (3.4 + pulse);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glow);
        g.addColorStop(0, `rgba(204,250,255,${0.3 * pulse * n.depth * fade})`);
        g.addColorStop(0.4, `rgba(95,212,255,${0.1 * pulse * n.depth * fade})`);
        g.addColorStop(1, 'rgba(70,182,255,0)');
        ctx.fillStyle = g;ctx.beginPath();ctx.arc(n.x, n.y, glow, 0, 6.28);ctx.fill();
        ctx.fillStyle = `rgba(220,250,255,${Math.min(0.5, (0.26 + 0.26 * n.depth) * pulse) * fade})`;
        ctx.beginPath();ctx.arc(n.x, n.y, n.r * pulse, 0, 6.28);ctx.fill();
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => {cancelAnimationFrame(raf);clearTimeout(raf);};
  }, [variantB]);

  /* ---- head tracking ---- */
  useEffect(() => {
    const cur = { yaw: 0, pitch: 0, tx: 0, ty: 0, ex: 0, ey: 0 };
    const ptr = { x: 0, y: 0 };let last = Date.now();
    let blink = 1,blinkStart = 0,nextBlink = Date.now() + 1400;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)),lerp = (a, b, k) => a + (b - a) * k;
    const setPtr = (cx, cy) => {const el = stageRef.current;if (!el) return;const r = el.getBoundingClientRect();
      ptr.x = cl((cx - (r.left + r.width / 2)) / (window.innerWidth / 2), -1.3, 1.3);
      ptr.y = cl((cy - (r.top + r.height / 2)) / (window.innerHeight / 2), -1.3, 1.3);last = Date.now();};
    const move = (e) => {const p = e.touches ? e.touches[0] : e;if (p) setPtr(p.clientX, p.clientY);};
    window.addEventListener('pointermove', move);window.addEventListener('touchmove', move, { passive: true });
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);const now = Date.now();
      if (hold.current) {if (now < hold.current.until) {ptr.x = hold.current.x;ptr.y = hold.current.y;last = now;} else hold.current = null;}
      if (now - last > 2000) {ptr.x *= 0.92;ptr.y *= 0.92;}
      const m = motion;
      cur.yaw = lerp(cur.yaw, ptr.x * 17 * m, 0.1);cur.pitch = lerp(cur.pitch, -ptr.y * 11 * m, 0.1);
      cur.tx = lerp(cur.tx, ptr.x * 10 * m, 0.1);cur.ty = lerp(cur.ty, ptr.y * 9 * m, 0.1);
      cur.ex = lerp(cur.ex, ptr.x * 5.5, 0.18);cur.ey = lerp(cur.ey, ptr.y * 3.5, 0.18);
      if (!blinkStart && now > nextBlink) blinkStart = now;
      if (blinkStart) {const bp = (now - blinkStart) / 130;blink = 1 - Math.sin(Math.min(bp, 1) * Math.PI) * 0.92;if (bp >= 1) {blinkStart = 0;blink = 1;nextBlink = now + 1600 + Math.random() * 3200;}}
      if (headRef.current) headRef.current.style.transform = `rotateY(${cur.yaw}deg) rotateX(${cur.pitch}deg) translate3d(${cur.tx}px,${cur.ty}px,0)`;
      const eyeT = `translate(${cur.ex}px,${cur.ey}px) scaleY(${blink})`;
      if (leftEyeRef.current) leftEyeRef.current.style.transform = eyeT;
      if (rightEyeRef.current) rightEyeRef.current.style.transform = eyeT;
      if (mouthRef.current) mouthRef.current.style.transform = `translate(${cur.ex * 0.5}px,${cur.ey * 0.5}px)`;
    };
    raf = requestAnimationFrame(tick);
    return () => {cancelAnimationFrame(raf);window.removeEventListener('pointermove', move);window.removeEventListener('touchmove', move);};
  }, [motion]);

  const tapHead = () => {setBubble(null);setFocus(null);focusRef.current = null;hold.current = null;setMenu((m) => !m);};
  const tapStar = (s, e) => {
    setMenu(false);
    if (s.big) { setBubble(null); setFocus(s.id); focusRef.current = s.id; setPersona(true); return; }
    const star = e.currentTarget,stage = stageRef.current;
    const r = star.getBoundingClientRect(),sr = stage.getBoundingClientRect();
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    hold.current = {
      x: cl((r.left + r.width / 2 - (sr.left + sr.width / 2)) / (window.innerWidth / 2), -1.4, 1.4),
      y: cl((r.top + r.height / 2 - (sr.top + sr.height / 2)) / (window.innerHeight / 2), -1.4, 1.4),
      until: Date.now() + 60000
    };
    setFocus(s.id);focusRef.current = s.id;
    setBubble(s);
  };
  const travel = (s) => {hold.current = null;onStar && onStar(s.route, s);};
  const dismiss = () => {setFocus(null);focusRef.current = null;hold.current = null;setBubble(null);setMenu(false);};
  const goRoute = (route) => {hold.current = null;setMenu(false);onStar && onStar(route);};

  const level = t.starLevel ?? 3;
  const starOpacity = (s) => {if (s.big) return 1;const lv = s.level ?? level;return 0.36 + lv / 5 * 0.64;};

  const sel = bubble; // selected star object, or null
  const kindLabel = menu ? '세컨비' : sel ? sel.kind : '소개';
  const title = !menu && sel ? sel.domain || sel.label : null;
  const line = menu ? '어떻게 도와드릴까요?' :
  sel ? sel.line :
  t.bubbleText && t.bubbleText.trim() ? t.bubbleText : '안녕하세요, 저는 세컨비예요. 머리를 누르면 도와드릴게요.';
  const headOnTop = variantB;
  const headHalf = 152 * (t.headScale ?? 1) * 1.05 / 2;

  const VBW = 280,VBH = 230;
  const NORM = 42,BIG = 56; // star hit-target (≈ +30%)

  const Constellation =
  <div style={{ flex: 1, position: 'relative', display: 'grid', placeItems: 'center', zIndex: 3, minHeight: 0, padding: "84px 12px 0px" }}>
      <div style={{ position: 'relative', aspectRatio: `${VBW} / ${VBH}`, maxWidth: '100%', width: "380px", height: "312px", lineHeight: "1.4" }}>
        <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}>
          {SB_LINES.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(127,227,255,.34)" strokeWidth="1.2" strokeLinejoin="round" />)}
          <path d={window.SB.POLARIS_GUIDE} fill="none" stroke="rgba(167,139,250,.45)" strokeWidth="1" strokeDasharray="2 5" />
        </svg>
        {SB_STARS.map((s) => {
        const on = focus === s.id,sz = s.big ? BIG : NORM,dot = s.big ? 18 : 12;
        return (
          <button key={s.id} onClick={(e) => tapStar(s, e)}
          style={{ position: 'absolute', left: `${s.x / VBW * 100}%`, top: `${s.y / VBH * 100}%`,
            transform: `translate(-50%,-50%) scale(${on ? 1.5 : 1})`, width: sz, height: sz,
            border: 0, background: 'transparent', cursor: 'pointer', zIndex: on ? 6 : 4,
            transition: 'transform .4s var(--md-sys-motion-easing-emphasized)', padding: "0px", margin: "0px" }}>
              <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              width: dot, height: dot, borderRadius: '50%', opacity: starOpacity(s),
              background: s.big ? 'radial-gradient(circle,#FFFFFF,#D6C4FF 48%,#A78BFA 84%)' : 'radial-gradient(circle,#CCFAFF,#46B6FF 72%)',
              boxShadow: s.big ? '0 0 16px rgba(183,148,246,1),0 0 34px rgba(167,139,250,.7)' :
              `0 0 ${on ? 18 : 11}px rgba(70,182,255,.95),0 0 ${on ? 30 : 18}px rgba(70,182,255,.5)`, padding: "0px" }} />
              <span style={{ position: 'absolute', left: '50%', top: `calc(50% + ${dot / 2 + 8}px)`, transform: 'translateX(-50%)',
              whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, letterSpacing: '.02em',
              color: on ? '#EAF7FF' : s.big ? 'rgba(214,196,255,.95)' : 'rgba(190,225,255,.88)',
              textShadow: '0 1px 5px rgba(0,0,0,.7)' }}>{s.domain || s.label}</span>
            </button>);

      })}
      </div>
    </div>;


  const HeadBubble =
  <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', zIndex: 5, padding: '0 16px 8px', minHeight: 0 }}>
      {/* head pinned to a fixed anchor (above region center) — position is independent of bubble size */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(50% - 104px)', transform: 'translateY(-50%)',
      display: 'flex', justifyContent: 'center' }}>
        <div onClick={tapHead} role="button" tabIndex={0} title="세컨비에게 물어보기"
      style={{ animation: 'sb-bob 4.5s ease-in-out infinite', cursor: 'pointer' }}>
          <SecondBHead scale={(t.headScale ?? 1) * 1.05} expression={t.expression}
        headRef={headRef} leftEyeRef={leftEyeRef} rightEyeRef={rightEyeRef} mouthRef={mouthRef} sphereRef={sphereRef} />
        </div>
      </div>
      {/* bubble floats just below the pinned head, growing downward without moving the head */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(50% - 104px + ${headHalf - 6}px)`,
      display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
        <div style={{ width: '100%', maxWidth: 268, pointerEvents: 'auto' }}>
        <div key={`${kindLabel}|${title}|${line}|${menu ? 'm' : ''}${sel ? 's' : ''}`}
          style={{ position: 'relative', padding: '13px 16px', border: '1px solid rgba(70,182,255,.34)', borderRadius: 14,
          background: 'rgba(9,20,40,.95)', boxShadow: '0 8px 22px rgba(0,0,0,.5)', textAlign: 'center',
          transformOrigin: 'top center', animation: 'sb-bubble-pop .36s var(--md-sys-motion-easing-emphasized)' }}>
          <span style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 12, height: 12,
            background: 'rgba(9,20,40,.95)', borderLeft: '1px solid rgba(70,182,255,.34)', borderTop: '1px solid rgba(70,182,255,.34)' }} />
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.14em', color: 'rgba(167,139,250,.95)', marginBottom: title ? 3 : 6 }}>{kindLabel}</div>
          {title && <div style={{ fontSize: 16, fontWeight: 700, color: '#EAF7FF', marginBottom: 5 }}>{title}</div>}
          <div style={{ fontSize: 13.5, color: '#A7E0FF', lineHeight: 1.5, wordBreak: 'keep-all', textWrap: 'pretty' }}>{line}</div>
          {menu &&
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              <MdButton variant="filled" size="s" icon="forum" onClick={() => goRoute('chat')}>챗봇</MdButton>
              <MdButton variant="tonal" size="s" icon="today" onClick={() => goRoute('ops')}>비서</MdButton>
            </div>
          }
          {sel &&
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              <MdButton variant="filled" size="s" trailingIcon="north_east" onClick={() => travel(sel)}>여행하기</MdButton>
              <MdButton variant="text" size="s" onClick={dismiss} style={{ color: 'rgba(159,228,255,.85)' }}>다음에</MdButton>
            </div>
          }
        </div>
      </div>
      </div>
    </div>;


  return (
    <div ref={stageRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 44,
      background: 'radial-gradient(120% 70% at 50% 26%,rgba(26,72,120,.5) 0%,rgba(11,33,66,.3) 42%,#070A13 76%)' }}>
      <canvas ref={neuralRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'radial-gradient(circle at 50% 30%,transparent 0 40%,rgba(7,10,19,.3) 72%,rgba(7,10,19,.62) 100%)' }} />
      {headOnTop ? <>{HeadBubble}{Constellation}</> : <>{Constellation}{HeadBubble}</>}
      {persona && <window.PersonaCard onClose={() => { setPersona(false); dismiss(); }} onRoute={(r) => { setPersona(false); hold.current = null; onStar && onStar(r); }} />}
    </div>);

}

window.ConstellationHome = ConstellationHome;
window.SecondBHead = SecondBHead;
window.NeuralBg = NeuralBg;