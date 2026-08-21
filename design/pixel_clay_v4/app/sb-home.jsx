/* ============================================================
   2nd-Brain · Constellation Home (구조 보존 · PIXEL-CLAY 판)
   북극성(12시) + 북두칠성 7별 + 큰 세컨비 스프라이트 + 말풍선.
   캔버스 뉴럴 필드는 2px 그리드 스냅 + 색 밴딩(알파 금지)으로 재해석.
   Export: window.ConstellationHome · SecondBHead · NeuralBg
   ============================================================ */
const { useState, useRef, useEffect } = React;
const { STARS: SB_STARS, STAR_LINES: SB_LINES } = function () {
  return { STARS: window.SB.STARS, STAR_LINES: window.SB.STAR_LINES };
}();

/* 큰 세컨비 머리 — 픽셀 스프라이트(SbHead) 확대판. 예전 ref API는 무시(호환용). */
function SecondBHead({ scale = 1, expression = 'neutral', headRef, leftEyeRef, rightEyeRef, mouthRef, sphereRef }) {
  const W = Math.max(96, Math.round(152 * scale / 16) * 16);
  return <window.SbHead size={W} expression={expression} track />;
}

/* 팔레트 색을 캔버스 리터럴로 해석 (팔레트 스왑 시 리마운트로 재해석) */
function dsCanvasColors() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (v, fb) => (cs.getPropertyValue(v) || fb).trim() || fb;
  return { dim: pick('--c02', '#232e4a'), mid: pick('--c03', '#3d4866'), hi: pick('--c05', '#b0b9cc'),
    star: pick('--ds-star', '#CCFAFF'), core: pick('--ds-core', '#46B6FF') };
}

/* 공용 딥스페이스 뉴럴 필드 — 2px 도트 스냅, 점선 연결, 스텝 프레임 */
function NeuralBg({ focusY = 0.5, style }) {
  const neuralRef = useRef(null);
  useEffect(() => {
    const cv = neuralRef.current; if (!cv) return;
    let raf, neural, paused = false, onScreen = true;
    const setup = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) { raf = setTimeout(setup, 120); return; }
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      let seed = 99173;
      const rand = () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
      const nodes = [];
      const mk = (x, y) => { const d = 0.28 + rand() * 0.72; nodes.push({ baseX: x, baseY: y, x, y, r: 1.4 + d * 4, depth: d, phase: rand() * 6.28, drift: 4 + rand() * 9, speed: 0.08 + rand() * 0.16 }); };
      for (let i = 0; i < 24; i++) mk(rand() * w, rand() * h);
      const stars = [];
      for (let i = 0; i < 46; i++) stars.push({ x: rand() * w, y: rand() * h, r: 0.4 + rand() * 1.1, a: 0.12 + rand() * 0.4, phase: rand() * 6.28 });
      const pairs = [];
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (Math.hypot(a.baseX - b.baseX, a.baseY - b.baseY) < 96 + a.drift + b.drift + 12) pairs.push([a, b]);
      }
      neural = { ctx, w, h, nodes, stars, pairs, hx: w / 2, hy: h * focusY, col: dsCanvasColors() };
    };
    setup();
    const q = (v) => Math.round(v / 2) * 2;
    const draw = (now) => {
      if (!neural || paused) return;
      const { ctx, w, h, nodes, stars, pairs, col } = neural; const tm = now * 0.001;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = s.a * (0.6 + Math.sin(tm * 0.4 + s.phase) * 0.3);
        if (a < 0.1) continue;
        ctx.fillStyle = a > 0.32 ? col.hi : a > 0.2 ? col.mid : col.dim;
        ctx.fillRect(q(s.x), q(s.y), 2, 2);
      }
      for (const n of nodes) { n.x = n.baseX + Math.sin(tm * n.speed + n.phase) * n.drift; n.y = n.baseY + Math.cos(tm * n.speed * 0.8 + n.phase) * n.drift * 0.55; }
      const near = (n) => Math.hypot(n.x - neural.hx, n.y - neural.hy) > 70;
      for (let p = 0; p < pairs.length; p++) {
        const a = pairs[p][0], b = pairs[p][1], dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (dd < 96 && near(a) && near(b)) {
          const pulse = 0.5 + Math.sin(tm * 0.5 + a.phase + b.phase) * 0.3;
          const al = Math.max(0, (1 - dd / 96) * 0.24 * pulse * Math.min(a.depth, b.depth));
          if (al < 0.05) continue;
          ctx.fillStyle = al > 0.12 ? col.mid : col.dim;
          const steps = Math.max(2, Math.round(dd / 9));
          for (let k = 1; k < steps; k++) ctx.fillRect(q(a.x + (b.x - a.x) * k / steps), q(a.y + (b.y - a.y) * k / steps), 2, 2);
        }
      }
      for (const n of nodes) {
        const fade = near(n), pulse = 0.72 + Math.sin(tm * 0.55 + n.phase) * 0.24;
        const sz = Math.max(2, Math.min(6, q(n.r)));
        const x = q(n.x), y = q(n.y);
        ctx.fillStyle = !fade ? col.dim : n.depth > 0.7 ? col.star : n.depth > 0.45 ? col.core : col.mid;
        ctx.fillRect(x, y, sz, sz);
        if (fade && pulse > 0.88) { /* 밝은 순간엔 + 모양 하이라이트 */
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
  }, [focusY]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, background: 'var(--ds-space)', ...style }}>
      <canvas ref={neuralRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>);
}

/* path 문자열(M/L/Z) → 점선 도트 좌표 (픽셀 스페이스) */
function dsPathDots(d, sx, sy, gap) {
  const nums = d.match(/-?[\d.]+/g).map(Number);
  const close = /z/i.test(d);
  const pts = []; for (let i = 0; i < nums.length; i += 2) pts.push([nums[i] * sx, nums[i + 1] * sy]);
  if (close && pts.length) pts.push(pts[0]);
  const dots = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(len / gap));
    for (let k = 1; k < n; k++) dots.push([Math.round(x1 + (x2 - x1) * k / n), Math.round(y1 + (y2 - y1) * k / n)]);
  }
  return dots;
}

/* 4꼭짓점 픽셀 별 — 9×9 그리드, 선택 시 뒤에 큰 링 별을 겁쳐 그린다 */
function PixStar({ size, core, ring, on }) {
  const cells = [[4, 0, 1, 3], [3, 3, 3, 3], [0, 4, 9, 1], [4, 3, 1, 3], [4, 6, 1, 3], [0, 4, 3, 1], [6, 4, 3, 1]];
  const S = (px, fill, cls) => (
    <svg viewBox="0 0 9 9" width={px} height={px} shapeRendering="crispEdges" aria-hidden="true"
      style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
      <rect x="4" y="0" width="1" height="9" fill={fill} />
      <rect x="0" y="4" width="9" height="1" fill={fill} />
      <rect x="3" y="3" width="3" height="3" fill={fill} />
    </svg>);
  return (
    <React.Fragment>
      {S(on ? size + 10 : size + 5, ring)}
      {S(size, core)}
    </React.Fragment>);
}

const DialogBox = window.DialogBox;

function ConstellationHome({ t, onStar, active }) {
  const stageRef = useRef(null);
  const [focus, setFocus] = useState(null);
  const [bubble, setBubble] = useState(null);
  const [menu, setMenu] = useState(false);
  const [persona, setPersona] = useState(false);
  /* 페르소나가 열리면 홈 코너 버튼(알림·공지·더보기·뮤지엄)을 숨긴다 — 클릭이 먹히지 않는데 켜져 보인다 */
  React.useEffect(() => {
    const el = document.documentElement;
    if (persona) el.setAttribute('data-sb-persona', '1'); else el.removeAttribute('data-sb-persona');
    return () => el.removeAttribute('data-sb-persona');
  }, [persona]);
  const hold = useRef(null), focusRef = useRef(null);
  const variantB = t.homeVariant === 'B';

  const tapHead = () => { setBubble(null); setFocus(null); focusRef.current = null; hold.current = null; setMenu((m) => !m); };
  const tapStar = (s, e) => {
    setMenu(false);
    if (s.big) { setBubble(null); setFocus(s.id); focusRef.current = s.id; setPersona(true); return; }
    setFocus(s.id); focusRef.current = s.id;
    setBubble(s);
  };
  const travel = (s) => { hold.current = null; onStar && onStar(s.route, s); };
  const dismiss = () => { setFocus(null); focusRef.current = null; hold.current = null; setBubble(null); setMenu(false); };
  const goRoute = (route) => { hold.current = null; setMenu(false); onStar && onStar(route); };

  const level = t.starLevel ?? 3;
  const starTone = (s, on) => {
    if (s.big) return { core: 'var(--c08)', ring: 'var(--ds-polaris)' };
    /* 커뮤니티 = 포탈. 도메인이 아니므로 밝기(L1~L5)가 없다 — 속이 비어 보이는 윤곽 별로 구분. */
    if (s.portal) return { core: 'var(--ds-space)', ring: 'var(--ds-nebula)', portal: true };
    const lv = s.level ?? level;
    return { core: lv >= 4 ? 'var(--ds-star)' : lv === 3 ? 'var(--ds-core)' : 'var(--c03)', ring: lv >= 3 ? 'var(--accent-deep)' : 'var(--c02)' };
  };

  const sel = bubble;
  const feed = React.useMemo(() => (t.bubbleText && t.bubbleText.trim() ? null :
  [{ kind: '소개', line: '안녕하세요, 저는 세컨비예요. 머리를 누르면 도와드릴게요.' }, ...window.SB.dialogFeed()]), [t.bubbleText]);
  const kindLabel = menu ? '세컨비' : sel ? sel.kind : '소개';
  const title = !menu && sel ? sel.domain || sel.label : null;
  const line = menu ? '어떻게 도와드릴까요?' :
  sel ? sel.line :
  t.bubbleText && t.bubbleText.trim() ? t.bubbleText : '안녕하세요, 저는 세컨비예요. 머리를 누르면 도와드릴게요.';
  const headOnTop = variantB;
  const headPx = Math.max(96, Math.round(152 * (t.headScale ?? 1) * 1.05 / 16) * 16);
  const headHalf = headPx / 2;

  const VBW = 280, VBH = 230;
  const BOXW = 380, BOXH = 312;
  const SX = BOXW / VBW, SY = BOXH / VBH;
  const NORM = 42, BIG = 56;
  const lineDots = SB_LINES.flatMap((d) => dsPathDots(d, SX, SY, 8));
  const guideDots = dsPathDots(window.SB.POLARIS_GUIDE, SX, SY, 12);

  const Constellation =
  <div style={{ flex: 1, position: 'relative', display: 'grid', placeItems: 'center', zIndex: 3, minHeight: 0, padding: "12px 12px 0px" }}>
      <div style={{ position: 'relative', maxWidth: '100%', width: BOXW + "px", height: BOXH + "px", lineHeight: "1.4" }}>
        <svg viewBox={`0 0 ${BOXW} ${BOXH}`} shapeRendering="crispEdges" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}>
          {lineDots.map((p, i) => <rect key={'l' + i} x={p[0]} y={p[1]} width="2" height="2" fill="var(--c03)" />)}
          {guideDots.map((p, i) => <rect key={'g' + i} x={p[0]} y={p[1]} width="2" height="2" fill="var(--ds-nebula-deep)" />)}
        </svg>
        {SB_STARS.map((s) => {
        const on = focus === s.id, sz = s.big ? BIG : NORM, dot = s.big ? 16 : 10;
        const tone = starTone(s, on);
        return (
          <button key={s.id} onClick={(e) => tapStar(s, e)}
          style={{ position: 'absolute', left: `${s.x / VBW * 100}%`, top: `${s.y / VBH * 100}%`,
            transform: `translate(-50%,-50%)`, width: sz, height: sz,
            border: 0, background: 'transparent', cursor: 'pointer', zIndex: on ? 6 : 4, padding: "0px", margin: "0px" }}>
              <PixStar size={dot + 5} core={tone.core} ring={tone.ring} on={on} />
              <span style={{ position: 'absolute', left: '50%', top: `calc(50% + ${dot / 2 + 8}px)`, transform: 'translateX(-50%)',
              whiteSpace: 'nowrap', fontSize: 10, fontFamily: 'var(--font-micro)', fontWeight: 400, letterSpacing: '.02em',
              color: on ? 'var(--c07)' : s.big ? 'var(--ds-polaris)' : s.portal ? 'var(--ds-nebula)' : 'var(--c05)' }}>{s.domain || s.label}</span>
            </button>);
      })}
      </div>
    </div>;

  const HeadBubble =
  <div style={{ flex: '0 0 auto', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'flex-end', zIndex: 5, padding: '0 0 8px', minHeight: 0 }}>
      <DialogBox kindLabel={kindLabel} title={title} line={line}
      pages={!menu && !sel ? feed : null}
      head={
      <div onClick={(e) => { e.stopPropagation(); tapHead(); }} role="button" tabIndex={0} title="세컨비에게 물어보기" style={{ cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <window.SbHead size={48} expression={t.expression} track />
      </div>}
      choices={menu ? [{ label: '챗봇', icon: 'forum', on: () => goRoute('chat') }, { label: '비서', icon: 'today', on: () => goRoute('ops') }] :
      sel ? [{ label: '여행하기', icon: 'north_east', on: () => travel(sel) }, { label: '다음에', icon: 'close', on: dismiss }] : null} />
    </div>;

  return (
    <div ref={stageRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 44, background: 'var(--ds-space)' }}>
      <NeuralBg focusY={variantB ? 0.5 : 0.7} />
      {headOnTop ? <>{!persona && HeadBubble}{Constellation}</> : <>{Constellation}{!persona && HeadBubble}</>}
      {persona && (
        /* 카드가 여러 장일 때 — 덱을 오버레이로 띄운다 (옆으로 넘겨 보기) */
        /* 스크림 없이 — 별하늘이 그대로 보이고 카드만 뜬다 */
        <div onClick={() => { setPersona(false); dismiss(); }} role="dialog" aria-modal="true"
          style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 4px 0' }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ height: '96%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 4px', flex: '0 0 auto' }}>
              <window.MdIconButton name="close" title="닫기" onClick={() => { setPersona(false); dismiss(); }} />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {window.PersonaDeck
                ? <window.PersonaDeck fill go={(r) => { setPersona(false); hold.current = null; onStar && onStar(r); }} />
                : <window.PersonaCard onClose={() => { setPersona(false); dismiss(); }} onRoute={(r) => { setPersona(false); hold.current = null; onStar && onStar(r); }} />}
            </div>
          </div>
        </div>
      )}
    </div>);
}

window.ConstellationHome = ConstellationHome;
window.SecondBHead = SecondBHead;
window.NeuralBg = NeuralBg;
