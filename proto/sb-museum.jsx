/* ============================================================
   2nd-Brain · AI 뮤지엄 — 2축 타임라인
   X축 = 시간(연표) · Y축 = 카테고리 2레인
     상단 레인: AI와 세계의 흐름 (세계사적 사건)
     하단 레인: AI 발전사
   좌우 드래그/스와이프로 시간 여행 · 이벤트 탭 → 상세 시트
     (본문 · 해시태그 · 이어진 사건 · 자료/논문 링크)
   Export: window.MuseumScreen, window.MuseumDeck(alias), window.MUSEUM
   ============================================================ */
const { useState: useMsS, useRef: useMsR, useEffect: useMsE } = React;

/* ---- lanes ---- */
const MZ_LANES = window.SB_DATA.museum.lanes; // → data/screens/museum.json

/* ---- events (id, lane, year(number for x), ylabel(display), title, sub, body, tags, rel[ids], refs[{kind,label}]) ---- */
const MUSEUM = window.SB_DATA.museum.events.slice(); // fresh outer array (module-scope push/sort below) → data/screens/museum.json

if (window.MZ_EXTRA) Array.prototype.push.apply(MUSEUM, window.MZ_EXTRA);
MUSEUM.sort((a, b) => a.year - b.year);
const MZ_DETAIL = window.MZ_DETAIL || {};

/* ---- geometry ---- */
const MZ = {
  START: 1936, END: 2028, PXY: 100, PAD: 88,
  TH: 400, AXIS: 196, NODE_W: 118, NODE_H: 84, GAP: 16, VGAP: 10
};
MZ.W = MZ.PAD * 2 + (MZ.END - MZ.START) * MZ.PXY;
const mzX = (y) => MZ.PAD + (y - MZ.START) * MZ.PXY;

/* ---- starfield (deterministic, painted behind the timeline) ---- */
const MZ_SKY = window.SB_DATA.museum.sky; // → data/screens/museum.json
function mzRng(seed) {let s = seed >>> 0;return () => {s = s * 1664525 + 1013904223 >>> 0;return s / 4294967296;};}
const MZ_STARS = (() => {
  const r = mzRng(20260317),cols = ['#CFE0FF', '#CFE0FF', '#C9BEFF', '#FFFFFF'],out = [];
  for (let i = 0; i < 96; i++) out.push({
    x: +(r() * MZ_SKY.w).toFixed(1), y: +(r() * MZ_SKY.h).toFixed(1),
    r: +(0.5 + r() * 1.7).toFixed(2), o: +(0.18 + r() * 0.62).toFixed(2),
    tw: r() < 0.22, dly: +(r() * 4.5).toFixed(2), c: cols[r() * cols.length | 0]
  });
  return out;
})();
const MZ_CONST = window.SB_DATA.museum.constellations; // → data/screens/museum.json

function MzSky() {
  return (
    <svg viewBox={`0 0 ${MZ_SKY.w} ${MZ_SKY.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
      {MZ_CONST.map((cn, i) =>
      <g key={i} opacity={cn.o}>
          <polyline points={cn.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={cn.c} strokeOpacity="0.34" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          {cn.pts.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r="1.5" fill={cn.c} opacity="0.85" />)}
        </g>
      )}
      {MZ_STARS.map((s, i) =>
      <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.c}
      opacity={s.tw ? undefined : s.o} className={s.tw ? 'mz-tw' : undefined}
      style={s.tw ? { animationDelay: s.dly + 's' } : undefined} />
      )}
    </svg>);

}
const MzSkyMemo = React.memo(MzSky);

/* place a lane's events into 2 stagger rows; returns map id→pos */
function mzPlace(list, nearTop, farTop) {
  const tops = [nearTop, farTop];
  const lastX = [-1e9, -1e9];
  const minGap = MZ.NODE_W + 8;
  const out = {};
  [...list].sort((a, b) => a.year - b.year).forEach((ev) => {
    const natural = mzX(ev.year);
    const fits0 = natural - lastX[0] >= minGap;
    const fits1 = natural - lastX[1] >= minGap;
    let row;
    if (fits0 && fits1) row = lastX[0] <= lastX[1] ? 0 : 1; // both free → balance
    else if (fits0) row = 0;else
    if (fits1) row = 1;else
    row = lastX[0] <= lastX[1] ? 0 : 1; // both blocked → soonest-free
    const x = (row === 0 ? fits0 : fits1) ? natural : lastX[row] + minGap; // nudge only if needed
    lastX[row] = x;
    const top = tops[row];
    out[ev.id] = { x, top, cy: top + MZ.NODE_H / 2, row };
  });
  return out;
}

const refIcon = window.SB_DATA.museum.refIcon; // → data/screens/museum.json
const refKo = window.SB_DATA.museum.refKo; // → data/screens/museum.json

/* representative ‘image’ plate per event: lane-tinted gradient + watermark glyph */
function MzPlate({ ev, L, radius = 13, glyph = 56, glyphOpacity = 0.22 }) {
  return (
    <React.Fragment>
      <span style={{ position: 'absolute', inset: 0, borderRadius: radius,
        background: `linear-gradient(135deg, ${L.accent}3a 0%, ${L.accent}12 48%, rgba(7,10,19,.5) 100%)` }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: radius, opacity: .55,
        background: `radial-gradient(82% 120% at 84% 18%, ${L.accent}33, transparent 62%)` }} />
      <Icon name={ev.icon || L.icon} size={glyph} style={{ position: 'absolute', right: -6, bottom: -10,
        color: L.accent, opacity: glyphOpacity, pointerEvents: 'none' }} />
    </React.Fragment>);

}

/* ===================== detail sheet ===================== */
const MZ_BY_YEAR = [...MUSEUM].sort((a, b) => a.year - b.year || (a.lane < b.lane ? -1 : 1));
function MzSheet({ ev, byId, onClose, onJump, go, order }) {
  const C = window.SB.C;
  const sw = useMsR({ down: false, x: 0, y: 0, axis: null, dx: 0 });
  const [dx, setDx] = useMsS(0);
  const dirRef = useMsR(0);
  useMsE(() => {dirRef.current = 0;});
  if (!ev) return null;
  const L = MZ_LANES[ev.lane];
  const D = MZ_DETAIL[ev.id] || {};
  const idx = order ? order.findIndex((e) => e.id === ev.id) : -1;
  const total = order ? order.length : 0;
  const step = (d) => {const j = idx + d;if (order && order[j]) {dirRef.current = d;setDx(0);onJump(order[j]);}};
  const swPD = (e) => {sw.current = { down: true, x: e.clientX, y: e.clientY, axis: null, dx: 0 };};
  const swPM = (e) => {if (!sw.current.down) return;const a = e.clientX - sw.current.x,b = e.clientY - sw.current.y;
    if (!sw.current.axis && (Math.abs(a) > 8 || Math.abs(b) > 8)) sw.current.axis = Math.abs(a) > Math.abs(b) ? 'x' : 'y';
    if (sw.current.axis === 'x') {let d = a;if (d > 0 && idx <= 0 || d < 0 && idx >= total - 1) d *= 0.3;sw.current.dx = d;setDx(d);}};
  const swPU = () => {if (sw.current.axis === 'x') {const d = sw.current.dx || 0;
      if (d <= -60 && idx < total - 1) step(1);else if (d >= 60 && idx > 0) step(-1);else setDx(0);}
    sw.current.down = false;sw.current.axis = null;sw.current.dx = 0;};
  const animName = dirRef.current > 0 ? 'mz-card-r' : dirRef.current < 0 ? 'mz-card-l' : 'sb-graph-sheet-up';
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(4,7,14,.6)', display: 'flex', alignItems: 'flex-end' }}>
      <style>{`@keyframes mz-card-r{from{transform:translateX(48px);opacity:.25}to{transform:translateX(0);opacity:1}}@keyframes mz-card-l{from{transform:translateX(-48px);opacity:.25}to{transform:translateX(0);opacity:1}}`}</style>
      <div key={ev.id} onClick={(e) => e.stopPropagation()} onPointerDown={swPD} onPointerMove={swPM} onPointerUp={swPU} onPointerCancel={swPU}
        style={{ width: '100%', maxHeight: '90%', overflowY: 'auto', touchAction: 'pan-y',
        background: '#0B1120', borderTopLeftRadius: 24, borderTopRightRadius: 24, border: `1px solid ${L.accent}44`, borderBottom: 'none',
        boxShadow: '0 -10px 40px rgba(0,0,0,.55)', transform: `translateX(${dx}px)`,
        transition: sw.current.down ? 'none' : 'transform .22s var(--md-sys-motion-easing-emphasized)',
        animation: `${animName} .3s var(--md-sys-motion-easing-emphasized)` }}>
        {/* swipe / step between events */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 0' }}>
          <button className="md-interactive" onClick={() => step(-1)} disabled={idx <= 0}
          style={{ position: 'relative', width: 34, height: 34, borderRadius: 9999, border: 'none', display: 'grid', placeItems: 'center', cursor: idx <= 0 ? 'default' : 'pointer', background: 'rgba(255,255,255,.05)', color: idx <= 0 ? 'rgba(255,255,255,.2)' : L.accent }}>
            <span className="md-state" /><Icon name="chevron_left" size={20} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)' }} />
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, color: 'rgba(167,183,210,.85)' }}>{idx + 1} / {total}</div>
          </div>
          <button className="md-interactive" onClick={() => step(1)} disabled={idx >= total - 1}
          style={{ position: 'relative', width: 34, height: 34, borderRadius: 9999, border: 'none', display: 'grid', placeItems: 'center', cursor: idx >= total - 1 ? 'default' : 'pointer', background: 'rgba(255,255,255,.05)', color: idx >= total - 1 ? 'rgba(255,255,255,.2)' : L.accent }}>
            <span className="md-state" /><Icon name="chevron_right" size={20} />
          </button>
        </div>
        <div style={{ padding: '10px 20px 24px' }}>
          {/* lane + year */}
          <div style={{ position: 'relative', height: 150, borderRadius: 16, overflow: 'hidden', marginBottom: 14, border: `1px solid ${L.accent}33` }}>
            <MzPlate ev={ev} L={L} radius={16} glyph={150} glyphOpacity={0.26} />
            <image-slot id={`mz-photo-${ev.id}`} mask="inset(0 round 16px)" placeholder=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}></image-slot>
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(8,12,22,.92), rgba(8,12,22,.15) 60%, transparent)' }} />
            <div style={{ position: 'absolute', left: 16, top: 14, zIndex: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: 'rgba(7,10,19,.5)', border: `1px solid ${L.accent}66`, backdropFilter: 'blur(4px)' }}>
                <Icon name={L.icon} size={13} style={{ color: L.accent }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: L.ink, whiteSpace: 'nowrap' }}>{L.label}</span>
              </span>
              {ev.here && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: L.accent, color: '#06121f' }}>지금 여기</span>}
            </div>
            <span style={{ position: 'absolute', right: 12, top: 13, zIndex: 3, pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 9999, background: 'rgba(7,10,19,.5)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(4px)' }}>
              <Icon name="add_a_photo" size={12} style={{ color: 'rgba(231,240,255,.8)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(231,240,255,.9)' }}>사진 추가</span>
            </span>
            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, zIndex: 3, pointerEvents: 'none' }}>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: L.accent, marginBottom: 2 }}>{ev.ylabel}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-.01em', lineHeight: 1.15 }}>{ev.title}</div>
              <div className="md-body-small" style={{ color: L.ink, marginTop: 2 }}>{ev.sub}</div>
            </div>
          </div>
          <div className="md-body-medium" style={{ color: 'rgba(220,232,255,.8)', lineHeight: 1.65, wordBreak: 'keep-all' }}>{ev.body}</div>

          {/* deeper explanation */}
          {D.long &&
          <div className="md-body-medium" style={{ color: 'rgba(199,213,240,.72)', lineHeight: 1.72, wordBreak: 'keep-all', marginTop: 10 }}>{D.long}</div>}

          {/* key facts */}
          {D.facts && D.facts.length > 0 &&
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
            {D.facts.map((f, i) =>
            <div key={i} style={{ padding: '9px 12px', borderRadius: 12, background: L.tint, border: `1px solid ${L.accent}22` }}>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.1em', color: L.accent, marginBottom: 3 }}>{f[0]}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#EAF2FF', wordBreak: 'keep-all', lineHeight: 1.3 }}>{f[1]}</div>
            </div>
            )}
          </div>}

          {/* cause → effect */}
          {(D.cause || D.effect) &&
          <div style={{ marginTop: 18, borderRadius: 14, overflow: 'hidden', border: `1px solid ${L.accent}26`, background: 'rgba(255,255,255,.02)' }}>
            {D.cause &&
            <div style={{ display: 'flex', gap: 11, padding: '11px 13px' }}>
              <Icon name="south" size={15} style={{ color: L.accent, flex: '0 0 auto', marginTop: 1 }} />
              <div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.12em', color: L.accent, marginBottom: 3 }}>배경</div>
                <div style={{ fontSize: 13, color: 'rgba(214,226,248,.82)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{D.cause}</div>
              </div>
            </div>}
            {D.cause && D.effect && <div style={{ height: 1, background: `${L.accent}1e`, margin: '0 13px' }} />}
            {D.effect &&
            <div style={{ display: 'flex', gap: 11, padding: '11px 13px' }}>
              <Icon name="north_east" size={15} style={{ color: L.accent, flex: '0 0 auto', marginTop: 1 }} />
              <div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.12em', color: L.accent, marginBottom: 3 }}>영향</div>
                <div style={{ fontSize: 13, color: 'rgba(214,226,248,.82)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{D.effect}</div>
              </div>
            </div>}
          </div>}

          {/* hashtags */}
          {ev.tags && ev.tags.length > 0 &&
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
            {ev.tags.map((tg) =>
            <span key={tg} style={{ fontSize: 12, fontWeight: 600, color: L.ink, padding: '5px 11px', borderRadius: 9999, background: L.tint, border: `1px solid ${L.accent}33` }}>{tg}</span>
            )}
          </div>}

          {/* linked events */}
          {ev.rel && ev.rel.filter((id) => byId[id]).length > 0 &&
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.16em', color: 'rgba(167,183,210,.88)', marginBottom: 8 }}>이어진 사건</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ev.rel.filter((id) => byId[id]).map((id) => {const r = byId[id],RL = MZ_LANES[r.lane];return (
                  <button key={id} className="md-interactive" onClick={() => onJump(r)}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <span className="md-state" />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: RL.accent, flex: '0 0 auto', boxShadow: `0 0 8px ${RL.accent}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#EAF2FF' }}>{r.title}</div>
                    <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, color: RL.accent }}>{RL.label} · {r.ylabel}</div>
                  </div>
                  <Icon name="north_east" size={16} style={{ color: 'rgba(255,255,255,.4)' }} />
                </button>);
              })}
            </div>
          </div>}

          {/* references */}
          {ev.refs && ev.refs.length > 0 &&
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.16em', color: 'rgba(167,183,210,.88)', marginBottom: 8 }}>자료 · 논문</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ev.refs.map((rf, i) =>
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: L.tint }}>
                  <Icon name={refIcon[rf.kind] || 'link'} size={17} style={{ color: L.accent }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: '#EAF2FF', wordBreak: 'keep-all' }}>{rf.label}</div>
                  <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, color: 'rgba(167,183,210,.8)' }}>{refKo[rf.kind] || '링크'}</div>
                </div>
                <Icon name="open_in_new" size={15} style={{ color: 'rgba(255,255,255,.32)' }} />
              </div>
              )}
            </div>
          </div>}

          {ev.here &&
          <MdButton variant="filled" full trailingIcon="north_east" onClick={() => go('home')} style={{ marginTop: 22, background: L.accent, color: '#06121f' }}>별자리로 돌아가기</MdButton>}
        </div>
      </div>
    </div>);

}

/* ===================== MUSEUM 타임라인 ===================== */
function MuseumScreen({ t, go }) {
  const C = window.SB.C;
  const scroller = useMsR(null);
  const drag = useMsR({ down: false, x: 0, sl: 0, moved: false });
  const [sel, setSel] = useMsS(null);
  const [scrollX, setScrollX] = useMsS(0);
  const rafId = useMsR(0);
  const dialDown = useMsR(false);
  const anim = useMsR({ raf: 0, mode: 'idle', vx: 0, target: 0 });

  const world = MUSEUM.filter((e) => e.lane === 'world');
  const ai = MUSEUM.filter((e) => e.lane === 'ai');
  // world above axis (near row just above, far row higher); ai below
  const nearW = MZ.AXIS - MZ.GAP - MZ.NODE_H,farW = MZ.AXIS - MZ.GAP - MZ.NODE_H - MZ.VGAP - MZ.NODE_H;
  const nearA = MZ.AXIS + MZ.GAP,farA = MZ.AXIS + MZ.GAP + MZ.NODE_H + MZ.VGAP;
  const posW = mzPlace(world, nearW, farW);
  const posA = mzPlace(ai, nearA, farA);
  const pos = { ...posW, ...posA };
  const byId = Object.fromEntries(MUSEUM.map((e) => [e.id, e]));

  // connectors (dedup pairs)
  const links = [];
  const seen = new Set();
  MUSEUM.forEach((e) => (e.rel || []).forEach((rid) => {
    if (!pos[rid] || !pos[e.id]) return;
    const key = [e.id, rid].sort().join('|');if (seen.has(key)) return;seen.add(key);
    const a = pos[e.id],b = pos[rid];
    const src = a.x <= b.x ? e : byId[rid];
    links.push({ key, x1: a.x, y1: a.cy, x2: b.x, y2: b.cy, color: MZ_LANES[src.lane].accent, ids: [e.id, rid] });
  }));

  const decades = window.SB_DATA.museum.decades; // → data/screens/museum.json
  const bandCenter = {
    world: (MZ.AXIS - MZ.GAP - 2 * MZ.NODE_H - MZ.VGAP + (MZ.AXIS - MZ.GAP)) / 2,
    ai: (MZ.AXIS + MZ.GAP + (MZ.AXIS + MZ.GAP + 2 * MZ.NODE_H + MZ.VGAP)) / 2
  };

  useMsE(() => {const el = scroller.current;if (el) el.scrollLeft = mzX(2022) - el.clientWidth / 2;
    return () => {if (anim.current.raf) cancelAnimationFrame(anim.current.raf);};}, []);

  // ---- smooth motion engine: inertia after a flick + eased dial seek ----
  const clampScroll = (v) => {const el = scroller.current;if (!el) return v;return Math.max(0, Math.min(v, el.scrollWidth - el.clientWidth));};
  const stopAnim = () => {if (anim.current.raf) cancelAnimationFrame(anim.current.raf);anim.current.raf = 0;anim.current.mode = 'idle';anim.current.vx = 0;};
  const tick = () => {
    const el = scroller.current,a = anim.current;
    if (!el) {a.raf = 0;return;}
    if (a.mode === 'inertia') {
      a.vx *= 0.935;
      let nl = el.scrollLeft + a.vx;const max = el.scrollWidth - el.clientWidth;
      if (nl <= 0) {nl = 0;a.vx = 0;} else if (nl >= max) {nl = max;a.vx = 0;}
      el.scrollLeft = nl;
      if (Math.abs(a.vx) < 0.35) {a.mode = 'idle';a.raf = 0;return;}
    } else if (a.mode === 'dial') {
      const d = a.target - el.scrollLeft;
      if (Math.abs(d) < 0.5) {el.scrollLeft = a.target;a.mode = 'idle';a.raf = 0;return;}
      el.scrollLeft += d * 0.24;
    } else {a.raf = 0;return;}
    a.raf = requestAnimationFrame(tick);
  };
  const ensureTick = () => {if (!anim.current.raf) anim.current.raf = requestAnimationFrame(tick);};

  const jumpTo = (ev) => {
    stopAnim();setSel(ev);
    const el = scroller.current;if (el) el.scrollTo({ left: clampScroll(mzX(ev.year) - el.clientWidth / 2), behavior: 'smooth' });
  };

  // mouse drag-to-pan with flick inertia (touch uses native momentum scroll)
  const onDown = (e) => {if (e.pointerType !== 'mouse') return;stopAnim();const el = scroller.current;drag.current = { down: true, x: e.clientX, sl: el.scrollLeft, moved: false, lastX: e.clientX, lastT: performance.now(), vx: 0 };};
  const onMove = (e) => {if (!drag.current.down) return;const dx = e.clientX - drag.current.x;if (Math.abs(dx) > 4) drag.current.moved = true;scroller.current.scrollLeft = drag.current.sl - dx;
    const now = performance.now(),dt = now - drag.current.lastT;
    if (dt > 0) {drag.current.vx = (e.clientX - drag.current.lastX) / dt;drag.current.lastX = e.clientX;drag.current.lastT = now;}};
  const onUp = () => {if (!drag.current.down) return;drag.current.down = false;
    let v = -drag.current.vx * 16;v = Math.max(-90, Math.min(90, v));
    if (Math.abs(v) > 1.4) {anim.current.mode = 'inertia';anim.current.vx = v;ensureTick();}};
  const tapNode = (ev) => {if (drag.current.moved) {drag.current.moved = false;return;}setSel(ev);};
  const onWheel = (e) => {const el = scroller.current;if (!el) return;if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;if (!e.deltaY) return;stopAnim();el.scrollLeft = clampScroll(el.scrollLeft + e.deltaY);};

  // year dial ↔ scroll (two-way)
  const onScroll = (e) => {const sl = e.currentTarget.scrollLeft;if (rafId.current) return;rafId.current = requestAnimationFrame(() => {rafId.current = 0;setScrollX(sl);});};
  const dialSeek = (clientX, tr) => {let f = (clientX - tr.left) / tr.width;f = f < 0 ? 0 : f > 1 ? 1 : f;const yr = MZ.START + f * (MZ.END - MZ.START);const el = scroller.current;if (!el) return;anim.current.mode = 'dial';anim.current.target = clampScroll(mzX(yr) - el.clientWidth / 2);ensureTick();};
  const onDialDown = (e) => {dialDown.current = true;stopAnim();try {e.currentTarget.setPointerCapture(e.pointerId);} catch (_) {}dialSeek(e.clientX, e.currentTarget.getBoundingClientRect());};
  const onDialMove = (e) => {if (dialDown.current) dialSeek(e.clientX, e.currentTarget.getBoundingClientRect());};
  const onDialUp = () => {dialDown.current = false;};

  const Node = (ev) => {
    const p = pos[ev.id],L = MZ_LANES[ev.lane],on = sel && sel.id === ev.id;
    return (
      <button key={ev.id} onClick={() => tapNode(ev)} className="md-interactive"
      style={{ position: 'absolute', left: p.x - MZ.NODE_W / 2, top: p.top, width: MZ.NODE_W, height: MZ.NODE_H,
        padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', borderRadius: 14, background: '#0B1120',
        border: `1.5px solid ${on ? L.accent : ev.here ? L.accent + 'aa' : 'rgba(255,255,255,.12)'}`,
        boxShadow: on ? `0 8px 22px rgba(0,0,0,.5), 0 0 0 3px ${L.accent}33` : ev.here ? `0 0 16px ${L.accent}55` : '0 6px 16px rgba(0,0,0,.4)',
        zIndex: on ? 6 : 3, transition: 'border-color .2s, box-shadow .2s' }}>
        <MzPlate ev={ev} L={L} radius={12} glyph={62} glyphOpacity={on ? 0.34 : 0.22} />
        <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,9,16,.94) 16%, rgba(6,9,16,.32) 54%, transparent)' }} />
        <span className="md-state" />
        <span style={{ position: 'absolute', top: 7, left: 10, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, fontWeight: 700, color: L.accent, letterSpacing: '.04em', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{ev.ylabel}</span>
        {ev.here && <span style={{ position: 'absolute', top: 8, right: 9, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 800, color: L.accent, letterSpacing: '.1em' }}>NOW</span>}
        <span style={{ position: 'absolute', left: 10, right: 9, bottom: 8, fontSize: 12.5, fontWeight: 700, color: '#fff', lineHeight: 1.16, wordBreak: 'keep-all', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}>{ev.title}</span>
      </button>);

  };

  const viewW = scroller.current ? scroller.current.clientWidth : 360;
  const curYear = Math.max(MZ.START, Math.min(MZ.END - 1, MZ.START + (scrollX + viewW / 2 - MZ.PAD) / MZ.PXY));
  const yearFrac = (curYear - MZ.START) / (MZ.END - MZ.START);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', boxSizing: 'border-box', paddingTop: 92,
      background: 'radial-gradient(120% 60% at 50% 4%, rgba(40,86,150,.42), transparent 58%), radial-gradient(86% 56% at 86% 16%, rgba(120,96,210,.22), transparent 58%), #05070F' }}>
      <style>{`@keyframes mz-tw{0%,100%{opacity:.2}50%{opacity:.92}}.mz-tw{animation:mz-tw 4.5s ease-in-out infinite}.mz-hscroll::-webkit-scrollbar{height:0;width:0;display:none}`}</style>
      <MzSkyMemo />
      {/* range + swipe hint */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 8px' }}>
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, fontWeight: 700, color: 'rgba(159,184,222,.88)', letterSpacing: '.04em' }}>1936 — 2026</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, color: 'rgba(159,184,222,.88)', whiteSpace: 'nowrap' }}>
          <Icon name="swipe" size={13} style={{ color: 'rgba(159,184,222,.88)' }} />좌우로 시간 탐색
        </span>
      </div>

      {/* timeline viewport: horizontal scroller + pinned Y-axis */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
      <div ref={scroller} className="mz-hscroll" onScroll={onScroll} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', touchAction: 'pan-x', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', display: 'flex', alignItems: 'center', cursor: drag.current.down ? 'grabbing' : 'grab' }}>
        <div style={{ position: 'relative', width: MZ.W, height: MZ.TH, flex: '0 0 auto' }}>
          {/* svg: gridlines, axis, stems, connectors */}
          <svg width={MZ.W} height={MZ.TH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            {/* decade gridlines */}
            {decades.map((d) => <line key={d} x1={mzX(d)} y1={14} x2={mzX(d)} y2={MZ.TH - 8} stroke="rgba(127,178,255,.09)" strokeWidth="1" />)}
            {/* axis */}
            <line x1={MZ.PAD - 30} y1={MZ.AXIS} x2={MZ.W - MZ.PAD + 30} y2={MZ.AXIS} stroke="rgba(127,178,255,.35)" strokeWidth="1.5" />
            {/* now marker */}
            <line x1={mzX(2026)} y1={20} x2={mzX(2026)} y2={MZ.TH - 8} stroke="#9A86FF" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="3 4" />
            {/* connectors */}
            {links.map((lk) => {
                const active = sel && lk.ids.includes(sel.id);
                const mx = (lk.x1 + lk.x2) / 2,my = (lk.y1 + lk.y2) / 2 + (Math.abs(lk.x1 - lk.x2) < 4 ? 0 : lk.y1 < lk.y2 ? -18 : 18);
                return <path key={lk.key} d={`M ${lk.x1} ${lk.y1} Q ${mx} ${my} ${lk.x2} ${lk.y2}`} fill="none"
                stroke={lk.color} strokeOpacity={active ? .9 : .22} strokeWidth={active ? 2 : 1.2} />;
              })}
            {/* stems + axis dots */}
            {MUSEUM.map((ev) => {const p = pos[ev.id],L = MZ_LANES[ev.lane],on = sel && sel.id === ev.id;
                const inner = p.top < MZ.AXIS ? p.top + MZ.NODE_H : p.top; // bottom edge if above, top edge if below
                return <g key={ev.id}>
                <line x1={p.x} y1={MZ.AXIS} x2={p.x} y2={inner} stroke={on ? L.accent : L.accent} strokeOpacity={on ? .8 : .3} strokeWidth={on ? 1.8 : 1} />
                <circle cx={p.x} cy={MZ.AXIS} r={on ? 5 : 3.5} fill={L.accent} />
                {on && <circle cx={p.x} cy={MZ.AXIS} r="8" fill="none" stroke={L.accent} strokeOpacity=".5" />}
              </g>;
              })}
          </svg>
          {/* decade labels on axis */}
          {decades.map((d) =>
            <div key={d} style={{ position: 'absolute', left: mzX(d), top: MZ.AXIS + 8, transform: 'translateX(-50%)',
              fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, fontWeight: 700, color: 'rgba(159,184,222,.78)', pointerEvents: 'none' }}>{d}</div>
            )}
          {/* nodes */}
          {MUSEUM.map(Node)}
        </div>
      </div>
        {/* pinned Y-axis lane labels (stay while timeline scrolls) */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 42, pointerEvents: 'none', zIndex: 9, display: 'flex', alignItems: 'center',
          background: 'linear-gradient(to right, rgba(7,10,19,.95) 28%, rgba(7,10,19,.5) 72%, transparent)' }}>
          <div style={{ position: 'relative', height: MZ.TH, width: '100%' }}>
            {Object.values(MZ_LANES).map((L) =>
            <div key={L.id} style={{ position: 'absolute', left: 7, top: bandCenter[L.id], transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: L.accent, boxShadow: `0 0 8px ${L.accent}` }} />
              <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 11, fontWeight: 800, letterSpacing: '.02em', color: L.ink, textShadow: '0 1px 6px rgba(0,0,0,.9)', whiteSpace: 'nowrap' }}>{L.label}</span>
            </div>
            )}
          </div>
        </div>
      </div>
      {/* year dial / scrubber */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px 14px' }}>
        <div style={{ width: 52, flex: '0 0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 21, fontWeight: 800, lineHeight: 1, color: '#CFFAFF', letterSpacing: '-.01em' }}>{Math.round(curYear)}</div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.22em', color: 'rgba(159,184,222,.8)', marginTop: 3 }}>YEAR</div>
        </div>
        <div onPointerDown={onDialDown} onPointerMove={onDialMove} onPointerUp={onDialUp} onPointerCancel={onDialUp}
        style={{ position: 'relative', flex: 1, height: 44, borderRadius: 13, cursor: 'pointer', touchAction: 'none', background: 'rgba(11,17,32,.6)', border: '1px solid rgba(127,178,255,.16)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 1, background: 'rgba(159,184,222,.16)' }} />
          {/* dialTicks → data/screens/museum.json */}
          {window.SB_DATA.museum.dialTicks.map((d) => {const f = (d - MZ.START) / (MZ.END - MZ.START);return (
              <div key={'m' + d} style={{ position: 'absolute', left: `${f * 100}%`, top: '50%', height: 7, marginTop: -3.5, width: 1, background: 'rgba(159,184,222,.13)' }} />);
          })}
          {decades.map((d) => {const f = (d - MZ.START) / (MZ.END - MZ.START);return (
              <React.Fragment key={d}>
              <div style={{ position: 'absolute', left: `${f * 100}%`, top: 7, bottom: 14, width: 1, background: 'rgba(159,184,222,.2)' }} />
              <div style={{ position: 'absolute', left: `${f * 100}%`, bottom: 3, transform: 'translateX(-50%)', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'rgba(159,184,222,.8)' }}>{'’' + String(d).slice(2)}</div>
            </React.Fragment>);
          })}
          <div style={{ position: 'absolute', left: `${yearFrac * 100}%`, top: 5, bottom: 5, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <div style={{ width: 2.5, height: '100%', borderRadius: 2, background: 'linear-gradient(#9FE4FF,#5B9DFF)', boxShadow: '0 0 10px rgba(91,157,255,.85)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 13, height: 13, borderRadius: '50%', background: '#CFFAFF', border: '2px solid #5B9DFF', boxShadow: '0 0 10px rgba(159,228,255,.9)' }} />
          </div>
        </div>
      </div>
      <MzSheet ev={sel} byId={byId} onClose={() => setSel(null)} onJump={jumpTo} go={go} order={MZ_BY_YEAR} />
    </div>);

}

window.MuseumScreen = MuseumScreen;
window.MuseumDeck = MuseumScreen; /* alias — 'exhibit' route falls back to the timeline */
window.MUSEUM = MUSEUM;