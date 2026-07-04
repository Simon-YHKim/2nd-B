/* ============================================================
   2nd-Brain · shared data + Material 3 UI primitives
   Exposes to window: SB (data), and M3 primitives
   (Icon, MdButton, MdIconButton, MdCard, MdChip, MdNavBar,
    Companion, MoodDot, SegBtn, ProgressLinear)
   ============================================================ */

/* All shared data below now lives in data/*.json — loaded synchronously into
   window.SB_DATA by sb-boot.js before any sb-*.jsx executes, so these consts
   keep their original names and byte-identical values for every consumer. */
const SB_D = window.SB_DATA;
const C = (v) => `var(--md-sys-color-${v})`;

/* ---- Layer A: 7 life-domain stars (북두칠성) + 북극성 (Polaris, layer C output).
   The 7 visible stars are LIFE DOMAINS (입력), not psychology constructs — those
   moved to the hidden validation layer B (see BIGFIVE / 북극성 종합). Polaris keeps
   its synthesis role; the 'Soul Core' name is dropped (PRD §4). ---- */
const STARS = SB_D.constellation.stars; // → data/core/constellation.json

/* dipper outline: bowl quad (closed) + handle polyline. Pointer→Polaris drawn in home. */
const STAR_LINES = SB_D.constellation.lines;

const POLARIS_GUIDE = SB_D.constellation.polarisGuide;

/* ---- Bottom navigation. Constellation is the canonical home (PRD §9); the
   other tabs are the persistent entry points (담기 · 세컨비 · 위키 · 북극성 종합). ---- */
const NAV = SB_D.nav.tabs; // → data/app/nav.json


/* ---- 3 conversation lenses. Each recolors the chat UI (PRD: no 공상모드). ---- */
const CHAT_MODES = SB_D.chatModes.modes; // → data/core/chat-modes.json


/* ---- Companion (small head) context lines per screen ---- */
const COMPANION = SB_D.companion.perScreen; // → data/core/companion.json

/* ---- Companion observations: simple read-outs on the user's current state,
   cycled in constellation (dipper) order — career → finance → relation →
   growth → health → leisure → catchall. Shown ~10s each, then advances. ---- */
const OBSERVATIONS = SB_D.companion.observations;


/* ---- Mock records ---- */
const RECORDS = SB_D.mock.records; // → data/core/mock.json

const BIGFIVE = SB_D.mock.bigfive;

const ERAS = SB_D.mock.eras;

const CAPTURE_MODES = SB_D.captureModes.modes; // → data/core/capture-modes.json


window.SB = { C, STARS, STAR_LINES, POLARIS_GUIDE, NAV, CHAT_MODES, COMPANION, OBSERVATIONS, RECORDS, BIGFIVE, ERAS, CAPTURE_MODES };

/* =====================================================================
   M3 PRIMITIVES
   ===================================================================== */
const { useState, useRef, useEffect } = React;

/* Inline-SVG icon set (M3 geometry, 24dp grid, 2dp rounded strokes), keyed by
   Material Symbols names so the rest of the code reads as canonical M3. Inline
   SVG (not the Symbols webfont) keeps icons as glyphs in html-to-image, PDF and
   PPTX export, where the variable webfont falls back to ligature text. */
const ICON_SVG = SB_D.icons.icons; // → data/core/icons.json (131 icons, duplicate keys deduped: later wins)

function Icon({ name, fill, size = 24, weight, grade, style }) {
  const path = ICON_SVG[name] || ICON_SVG.workspaces;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={fill ? 1.4 : 2} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'inline-block', flex: '0 0 auto', verticalAlign: 'middle', ...style }}
    dangerouslySetInnerHTML={{ __html: path }} />);

}

/* Filled / tonal / elevated / outlined / text · pill, 40dp tall */
function MdButton({ variant = 'filled', icon, trailingIcon, children, onClick, full, size = 'm', style, disabled }) {
  const base = {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
    height: size === 'l' ? 56 : size === 's' ? 32 : 40,
    padding: size === 'l' ? '0 28px' : size === 's' ? '0 14px' : '0 24px',
    borderRadius: 9999, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: 500,
    fontSize: size === 'l' ? 16 : 14, letterSpacing: '0.1px',
    width: full ? '100%' : 'auto',
    transition: 'box-shadow .2s, background .2s'
  };
  const skins = {
    filled: { background: C('primary'), color: C('on-primary') },
    tonal: { background: C('secondary-container'), color: C('on-secondary-container') },
    tertiary: { background: C('tertiary-container'), color: C('on-tertiary-container') },
    elevated: { background: C('surface-container-low'), color: C('primary'), boxShadow: 'var(--md-sys-elevation-level1)' },
    outlined: { background: 'transparent', color: C('primary'), border: `1px solid ${C('outline-variant')}` },
    text: { background: 'transparent', color: C('primary'), padding: '0 12px' }
  };
  return (
    <button className="md-interactive" disabled={disabled} onClick={disabled ? undefined : onClick}
    style={{ ...base, ...skins[variant], cursor: disabled ? 'default' : 'pointer', ...style }}>
      <span className="md-state" />
      {icon && <Icon name={icon} size={18} />}
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </button>);

}

function MdIconButton({ name, fill, variant = 'standard', onClick, size = 40, iconSize = 24, style, title }) {
  const skins = {
    standard: { background: 'transparent', color: C('on-surface-variant') },
    filled: { background: C('primary'), color: C('on-primary') },
    tonal: { background: C('secondary-container'), color: C('on-secondary-container') },
    outlined: { background: 'transparent', color: C('on-surface-variant'), border: `1px solid ${C('outline-variant')}` }
  };
  return (
    <button className="md-interactive" onClick={onClick} title={title}
    style={{ width: size, height: size, borderRadius: 9999, border: 'none', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...skins[variant], ...style }}>
      <span className="md-state" />
      <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}><Icon name={name} fill={fill} size={iconSize} /></span>
    </button>);

}

function MdCard({ variant = 'filled', children, onClick, style, className }) {
  const skins = {
    filled: { background: C('surface-container-highest'), border: 'none' },
    elevated: { background: C('surface-container-low'), boxShadow: 'var(--md-sys-elevation-level1)', border: 'none' },
    outlined: { background: C('surface'), border: `1px solid ${C('outline-variant')}` }
  };
  return (
    <div className={'md-card ' + (onClick ? 'md-interactive ' : '') + (className || '')} onClick={onClick}
    style={{ borderRadius: 12, padding: 16, ...skins[variant], cursor: onClick ? 'pointer' : 'default', ...style }}>
      {onClick && <span className="md-state" />}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>);

}

/* assist / filter / input / suggestion chip */
function MdChip({ children, icon, selected, onClick, variant = 'assist', style }) {
  const sel = selected && variant === 'filter';
  return (
    <button className="md-interactive" onClick={onClick}
    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 32, padding: icon ? '0 14px 0 10px' : '0 16px', borderRadius: 8, cursor: 'pointer',
      border: sel ? 'none' : `1px solid ${C('outline-variant')}`,
      background: sel ? C('secondary-container') : 'transparent',
      color: sel ? C('on-secondary-container') : C('on-surface-variant'),
      whiteSpace: 'nowrap', flex: '0 0 auto',
      fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: 500, fontSize: 14, letterSpacing: '0.1px', ...style }}>
      <span className="md-state" />
      {sel && <Icon name="check" size={18} />}
      {icon && !sel && <Icon name={icon} size={18} />}
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </button>);

}

function ProgressLinear({ value, color, track, height = 8 }) {
  return (
    <div style={{ height, borderRadius: 9999, background: track || C('surface-variant'), overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', borderRadius: 9999,
        background: color || C('primary'), transition: 'width .5s var(--md-sys-motion-easing-emphasized)' }} />
    </div>);

}

const MOOD = SB_D.theme.mood; // → data/app/theme.json

/* ── Brand glyphs for social login (inline SVG, brand-accurate marks) ── */
function BrandGlyph({ name, size = 20 }) {
  const P = SB_D.icons.brand; // → data/core/icons.json (brand marks)
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"
  style={{ flex: '0 0 auto' }} dangerouslySetInnerHTML={{ __html: P[name] }} />;
}

function GoogleGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flex: '0 0 auto' }}>
      <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.3-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6C4.8 19.9 8.1 22 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.5l3.3-2.6z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3.1 14.7 2 12 2 8.1 2 4.8 4.1 3.1 7.5l3.3 2.6C7.2 7.7 9.4 6 12 6z" />
    </svg>);

}

/* ── Shared auth form — email + password primary, 로그인 / 회원가입,
   then a row of equal-size social icon buttons under "또 다른 방법".
   Used by both the onboarding last slide and the standalone AuthScreen. ── */
function AuthProviders({ onPick, mode = 'signin' }) {
  const C = window.SB.C;
  const pick = onPick || (() => {});
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [show, setShow] = React.useState(false);
  const socials = [
  { k: 'kakao', label: '카카오로 계속', node: <BrandGlyph name="kakao" size={22} />, bg: '#FEE500', fg: '#181600' },
  { k: 'naver', label: '네이버로 계속', node: <span style={{ fontWeight: 900, fontSize: 19, lineHeight: 1, fontFamily: 'var(--md-ref-typeface-plain)' }}>N</span>, bg: '#03C75A', fg: '#fff' },
  { k: 'github', label: 'GitHub로 계속', node: <BrandGlyph name="github" size={22} />, bg: '#1F2328', fg: '#fff' },
  { k: 'google', label: 'Google로 계속', node: <GoogleGlyph size={20} />, bg: '#fff', fg: '#111' },
  { k: 'apple', label: 'Apple로 계속', node: <BrandGlyph name="apple" size={22} />, bg: '#fff', fg: '#111' }];

  const Field = ({ icon, ph, val, set, type, trailing }) =>
  <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 54, padding: '0 14px', borderRadius: 14,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(150,190,255,.2)' }}>
      <Icon name={icon} size={20} style={{ color: 'rgba(190,225,255,.62)', flex: '0 0 auto' }} />
      <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph} type={type}
    autoCapitalize="none" autoCorrect="off" spellCheck={false}
    style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
      color: '#EAF7FF', fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }} />
      {trailing}
    </div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* email + password — the base inputs */}
      <Field icon="forum" ph="이메일" val={email} set={setEmail} type="email" />
      <Field icon="lock" ph="비밀번호" val={pw} set={setPw} type={show ? 'text' : 'password'}
      trailing={
      <button onClick={() => setShow((v) => !v)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} className="md-interactive"
      style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent',
        cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'rgba(190,225,255,.62)' }}>
            <span className="md-state" /><Icon name={show ? 'visibility' : 'lock'} size={19} />
          </button>
      } />

      {/* 로그인 / 회원가입 — primary actions */}
      <button onClick={() => pick('login')} className="md-interactive"
      style={{ position: 'relative', height: 52, borderRadius: 9999, border: 'none', cursor: 'pointer', marginTop: 3,
        background: '#46B6FF', color: '#05121f', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15.5, fontWeight: 700, fontFamily: 'var(--md-ref-typeface-plain)' }}>
        <span className="md-state" />로그인
      </button>
      <button onClick={() => pick('signup')} className="md-interactive"
      style={{ position: 'relative', height: 52, borderRadius: 9999, cursor: 'pointer', background: 'transparent',
        border: '1px solid rgba(127,182,255,.5)', color: '#BFE7FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15.5, fontWeight: 600, fontFamily: 'var(--md-ref-typeface-plain)' }}>
        <span className="md-state" />회원가입
      </button>

      {/* social providers — all equal small icon size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 2px' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(180,205,255,.18)' }} />
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        {socials.map((b) =>
        <button key={b.k} onClick={() => pick(b.k)} className="md-interactive" aria-label={b.label} title={b.label}
        style={{ position: 'relative', flex: 1, height: 50, borderRadius: 14,
          border: b.fg === '#111' ? '1px solid rgba(180,205,255,.16)' : 'none',
          cursor: 'pointer', background: b.bg, color: b.fg, display: 'grid', placeItems: 'center' }}>
            <span className="md-state" />{b.node}
          </button>
        )}
      </div>
    </div>);

}

function MoodDot({ mood = 'neutral', size = 10, style }) {
  const c = MOOD[mood];
  return <span style={{ width: size, height: size, borderRadius: 9999, background: c,
    boxShadow: `0 0 8px 1px ${c}`, display: 'inline-block', ...style }} />;
}

/* ── SbHead — the 2ndB companion head with live expression + gaze tracking ──
   Reuses the constellation-home head geometry (masked baked eyes → dynamic
   cyan eyes + mouth) but is fully self-contained: its own pointer/touch
   tracking, idle blink, and expression (eye height + mouth curve) driven by
   `expression` (positive | neutral | negative). Percentage-positioned features
   scale to any `size`. Pass track={false} for a static instance. */
function SbHead({ size = 48, expression = 'neutral', track = true, tilt = true, bob = false, glow = false, style }) {
  const scale = size / 152;
  const rootRef = useRef(null),headRef = useRef(null);
  const leftEyeRef = useRef(null),rightEyeRef = useRef(null),mouthRef = useRef(null);
  const moodC = MOOD[expression] || MOOD.neutral;
  const eyeH = expression === 'positive' ? 13 : expression === 'negative' ? 17 : 16;
  const mouth = expression === 'positive' ?
  { w: 16, h: 7, radius: '0 0 9px 9px', bg: 'transparent', border: '2.5px solid #5FD4FF', borderTop: 'none' } :
  expression === 'negative' ?
  { w: 16, h: 7, radius: '9px 9px 0 0', bg: 'transparent', border: '2.5px solid #5FD4FF', borderBottom: 'none' } :
  { w: 15, h: 3.5, radius: 9, bg: '#5FD4FF', border: 'none' };

  useEffect(() => {
    if (!track) return;
    const cur = { yaw: 0, pitch: 0, tx: 0, ty: 0, ex: 0, ey: 0 };
    const ptr = { x: 0, y: 0 };let last = Date.now();
    let blinkStart = 0,nextBlink = Date.now() + 1400,blink = 1;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)),lerp = (a, b, k) => a + (b - a) * k;
    const setPtr = (cx, cy) => {const el = rootRef.current;if (!el) return;const r = el.getBoundingClientRect();
      ptr.x = cl((cx - (r.left + r.width / 2)) / (window.innerWidth / 2), -1.3, 1.3);
      ptr.y = cl((cy - (r.top + r.height / 2)) / (window.innerHeight / 2), -1.3, 1.3);last = Date.now();};
    const move = (e) => {const p = e.touches ? e.touches[0] : e;if (p) setPtr(p.clientX, p.clientY);};
    window.addEventListener('pointermove', move);window.addEventListener('touchmove', move, { passive: true });
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);const now = Date.now();
      if (now - last > 2200) {ptr.x *= 0.92;ptr.y *= 0.92;}
      cur.yaw = lerp(cur.yaw, ptr.x * 15, 0.1);cur.pitch = lerp(cur.pitch, -ptr.y * 10, 0.1);
      cur.tx = lerp(cur.tx, ptr.x * 4, 0.1);cur.ty = lerp(cur.ty, ptr.y * 3, 0.1);
      cur.ex = lerp(cur.ex, ptr.x * 5.5, 0.18);cur.ey = lerp(cur.ey, ptr.y * 3.5, 0.18);
      if (!blinkStart && now > nextBlink) blinkStart = now;
      if (blinkStart) {const bp = (now - blinkStart) / 130;blink = 1 - Math.sin(Math.min(bp, 1) * Math.PI) * 0.92;if (bp >= 1) {blinkStart = 0;blink = 1;nextBlink = now + 1600 + Math.random() * 3400;}}
      if (headRef.current) headRef.current.style.transform = tilt ? `rotateY(${cur.yaw}deg) rotateX(${cur.pitch}deg) translate3d(${cur.tx * scale}px,${cur.ty * scale}px,0)` : '';
      const eyeT = `translate(${cur.ex * scale}px,${cur.ey * scale}px) scaleY(${blink})`;
      if (leftEyeRef.current) leftEyeRef.current.style.transform = eyeT;
      if (rightEyeRef.current) rightEyeRef.current.style.transform = eyeT;
      if (mouthRef.current) mouthRef.current.style.transform = `translate(${cur.ex * 0.5 * scale}px,${cur.ey * 0.5 * scale}px)`;
    };
    raf = requestAnimationFrame(tick);
    return () => {cancelAnimationFrame(raf);window.removeEventListener('pointermove', move);window.removeEventListener('touchmove', move);};
  }, [track, tilt, scale]);

  return (
    <div ref={rootRef} style={{ position: 'relative', width: size, height: size, flex: '0 0 auto',
      animation: bob ? 'sb-bob 4s ease-in-out infinite' : undefined, ...style }}>
      {glow && <div style={{ position: 'absolute', left: '50%', top: '8%', width: size * 0.62, height: size * 0.62,
        transform: 'translateX(-50%)', borderRadius: '50%', filter: 'blur(6px)', pointerEvents: 'none',
        background: `radial-gradient(circle, ${moodC}aa, ${moodC}44 52%, transparent 76%)`,
        animation: 'sb-dim 3.4s ease-in-out infinite' }} />}
      <div ref={headRef} style={{ position: 'relative', width: size, height: size, transformStyle: 'preserve-3d', willChange: 'transform' }}>
        <img src="assets/deepspace/secondb-head-blank.png" alt="세컨비" draggable="false"
        style={{ width: '100%', height: '100%', display: 'block', filter: 'drop-shadow(0 2px 8px rgba(70,80,160,.35))' }} />
        {/* dark face screen masks the baked eyes so dynamic eyes can track */}
        <div style={{ position: 'absolute', left: '50%', top: '60%', width: '47%', height: '23.5%',
          transform: 'translate(-50%,-50%)', borderRadius: Math.max(3, 10 * scale),
          background: 'linear-gradient(180deg,#0a1020,#03060e 62%)',
          boxShadow: 'inset 0 1px 6px rgba(120,150,255,.18), inset 0 -4px 10px rgba(0,0,0,.6)' }} />
        <div style={{ position: 'absolute', left: '38.5%', top: '58.5%', width: 0, height: 0 }}>
          <div ref={leftEyeRef} style={{ position: 'absolute', left: -5 * scale, top: -8 * scale,
            width: 10 * scale, height: eyeH * scale, borderRadius: 4 * scale,
            background: 'radial-gradient(60% 60% at 50% 42%,#CCFAFF,#46B6FF 72%)',
            boxShadow: `0 0 ${9 * scale}px rgba(70,182,255,.85)`, willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', left: '61.5%', top: '58.5%', width: 0, height: 0 }}>
          <div ref={rightEyeRef} style={{ position: 'absolute', left: -5 * scale, top: -8 * scale,
            width: 10 * scale, height: eyeH * scale, borderRadius: 4 * scale,
            background: 'radial-gradient(60% 60% at 50% 42%,#CCFAFF,#46B6FF 72%)',
            boxShadow: `0 0 ${9 * scale}px rgba(70,182,255,.85)`, willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '65.5%', width: 0, height: 0 }}>
          <div ref={mouthRef} style={{ position: 'absolute', left: -mouth.w * scale / 2, top: 0,
            width: mouth.w * scale, height: mouth.h * scale, borderRadius: mouth.radius,
            background: mouth.bg, border: mouth.border, borderTop: mouth.borderTop, borderBottom: mouth.borderBottom,
            boxShadow: `0 0 ${8 * scale}px rgba(70,182,255,.8)`, willChange: 'transform' }} />
        </div>
      </div>
    </div>);

}

/* ── Shared ratify affordance for layer-B estimates (PRD invariant #1) ──
   Every AI read is a PROPOSAL, never a fact. Shows 확신%(confidence) + 근거(evidence)
   and requires 맞아요 / 조금 달라요 before anything reaches the North Star.
   State persists in localStorage so a reload keeps the user's decision. */
function RatifyBlock({ id, estimate, confidence = 60, evidence = 0, evidenceLabel = '기록', onRefine, onEvidence }) {
  const C = window.SB.C;
  const key = 'sb.ratify.' + id;
  const [state, setState] = React.useState('pending'); // pending | ratified | refined
  React.useEffect(() => {try {const v = localStorage.getItem(key);if (v) setState(v);} catch (e) {}}, [key]);
  const set = (v) => {setState(v);try {localStorage.setItem(key, v);} catch (e) {}};
  const reset = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' };
  const confColor = confidence >= 67 ? C('primary') : confidence >= 45 ? C('tertiary') : C('on-surface-variant');

  return (
    <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 14, marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="md-label-small" style={{ color: C('on-secondary-container'), opacity: .7, marginBottom: 3 }}>세컨비의 추정 · 아직 반영 안 됨</div>
          <div className="md-body-medium" style={{ color: C('on-secondary-container'), wordBreak: 'keep-all' }}>{estimate}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          color: confColor, background: C('surface-container-highest'), borderRadius: 9999, padding: '3px 10px' }}>
          <span style={{ width: 7, height: 7, borderRadius: 9999, background: confColor }} />확신 {confidence}%
        </span>
        <button className="md-interactive" onClick={onEvidence} style={{ ...reset,
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          color: C('on-secondary-container'), borderRadius: 9999, padding: '3px 8px' }}>
          <Icon name="link" size={13} />{evidenceLabel} {evidence}건 근거<Icon name="arrow_forward" size={13} />
          <span className="md-state-layer" />
        </button>
      </div>

      {state === 'pending' &&
      <React.Fragment>
          <div className="md-body-small" style={{ color: C('on-secondary-container'), opacity: .8, margin: '12px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={13} />비준하기 전엔 북극성에 반영되지 않아요.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <MdButton variant="filled" icon="task_alt" style={{ flex: 1 }} onClick={() => set('ratified')}>맞아요</MdButton>
            <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => {set('refined');onRefine && onRefine();}}>조금 달라요</MdButton>
          </div>
        </React.Fragment>
      }
      {state === 'ratified' &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: C('surface-container-highest') }}>
          <Icon name="task_alt" size={18} fill style={{ color: C('primary') }} />
          <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>비준했어요 · 북극성에 반영돼요</span>
          <button onClick={() => set('pending')} style={{ ...reset, fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>되돌리기</button>
        </div>
      }
      {state === 'refined' &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: C('surface-container-highest') }}>
          <Icon name="forum" size={18} style={{ color: C('tertiary') }} />
          <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>더 알려주시면 다시 다듬을게요</span>
          <button onClick={() => set('pending')} style={{ ...reset, fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>취소</button>
        </div>
      }
    </MdCard>);

}

Object.assign(window, { Icon, MdButton, MdIconButton, MdCard, MdChip, ProgressLinear, MoodDot, MOOD, SbHead, AuthProviders, RatifyBlock });

/* =====================================================================
   SHARED INPUT PRIMITIVES — calendar date picker + auto-grow textarea
   App-wide rule: any date is chosen from a calendar, never free-typed.
   ===================================================================== */
const SB_WD = ['일', '월', '화', '수', '목', '금', '토'];
function sbFmtDate(v) {
  if (!v) return '';
  const dt = v instanceof Date ? v : new Date(v + 'T00:00:00');
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일 (${SB_WD[dt.getDay()]})`;
}
function sbToISO(dt) {
  const m = String(dt.getMonth() + 1).padStart(2, '0'),d = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${d}`;
}

/* M3 modal date picker — calendar grid, month/year nav, today + selection states.
   Rendered as an absolute overlay inside the phone frame (like ConfirmDialog).
   futureOnly disables past days (e.g. 마감/예약); pastOnly disables future (e.g. 생일·지난 일). */
function CalendarSheet({ value, title = '날짜 선택', onChange, onClose, futureOnly, pastOnly }) {
  const C = window.SB.C;
  const today = new Date();today.setHours(0, 0, 0, 0);
  const initSel = value ? new Date(value + 'T00:00:00') : null;
  const valid = initSel && !isNaN(initSel.getTime());
  const base = valid ? initSel : today;
  const [view, setView] = React.useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const [sel, setSel] = React.useState(valid ? initSel : null);
  const [yearPick, setYearPick] = React.useState(false);

  const y = view.getFullYear(),m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const disabled = (d) => {const dt = new Date(y, m, d);if (futureOnly && dt < today) return true;if (pastOnly && dt > today) return true;return false;};
  const shift = (delta) => setView(new Date(y, m + delta, 1));
  const years = [];for (let yy = today.getFullYear() - 100; yy <= today.getFullYear() + 10; yy++) years.push(yy);

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 344, background: C('surface-container-high'), borderRadius: 28, padding: '20px 16px 14px', boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), padding: '0 8px' }}>{title}</div>
        <div className="md-headline-small" style={{ color: C('on-surface'), padding: '2px 8px 12px', fontSize: 24, fontWeight: 600 }}>
          {sel ? `${sel.getMonth() + 1}월 ${sel.getDate()}일 (${SB_WD[sel.getDay()]})` : '날짜를 골라요'}
        </div>
        <div style={{ borderTop: `1px solid ${C('outline-variant')}`, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px 6px' }}>
            <button onClick={() => setYearPick((p) => !p)} className="md-interactive"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: C('on-surface'), fontWeight: 600, fontSize: 15, padding: '6px 8px', borderRadius: 8, fontFamily: 'var(--md-ref-typeface-plain)' }}>
              <span className="md-state" />{y}년 {m + 1}월 <Icon name={yearPick ? 'expand_less' : 'expand_more'} size={18} />
            </button>
            <div style={{ flex: 1 }} />
            {!yearPick && <React.Fragment>
              <MdIconButton name="chevron_left" iconSize={22} onClick={() => shift(-1)} />
              <MdIconButton name="chevron_right" iconSize={22} onClick={() => shift(1)} />
            </React.Fragment>}
          </div>

          {yearPick ?
          <div style={{ height: 252, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: 4 }}>
              {years.map((yy) =>
            <button key={yy} onClick={() => {setView(new Date(yy, m, 1));setYearPick(false);}} className="md-interactive"
            style={{ position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 9999, padding: '10px 0', fontSize: 14, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: yy === y ? 700 : 500,
              background: yy === y ? C('primary') : 'transparent', color: yy === y ? C('on-primary') : C('on-surface') }}>
                  <span className="md-state" />{yy}
                </button>
            )}
            </div> :

          <React.Fragment>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
                {SB_WD.map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '4px 0', color: i === 0 ? C('error') : C('on-surface-variant') }}>{w}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {cells.map((d, i) => {
                if (d === null) return <div key={'e' + i} />;
                const dt = new Date(y, m, d),isSel = sameDay(dt, sel),isToday = sameDay(dt, today),dis = disabled(d);
                return (
                  <button key={d} disabled={dis} onClick={() => setSel(dt)} className={dis ? '' : 'md-interactive'}
                  style={{ position: 'relative', aspectRatio: '1', border: 'none', cursor: dis ? 'default' : 'pointer', borderRadius: '50%',
                    background: isSel ? C('primary') : 'transparent',
                    color: dis ? C('outline') : isSel ? C('on-primary') : i % 7 === 0 ? C('error') : C('on-surface'),
                    fontSize: 14, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: isSel || isToday ? 700 : 500, opacity: dis ? .45 : 1,
                    boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${C('primary')}` : 'none' }}>
                      <span className="md-state" />{d}
                    </button>);

              })}
              </div>
            </React.Fragment>
          }
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 10 }}>
          <MdButton variant="text" onClick={onClose}>취소</MdButton>
          <MdButton variant="text" onClick={() => {if (sel) onChange(sbToISO(sel));onClose();}}>확인</MdButton>
        </div>
      </div>
    </div>);

}

/* Tappable date field — looks like a text field but opens the calendar. */
function DatePickerField({ icon = 'calendar_today', label, hint = '날짜를 골라요', value, onChange, C, futureOnly, pastOnly }) {
  const CC = C || window.SB.C;
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      {label &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {icon && <Icon name={icon} size={15} style={{ color: CC('on-surface-variant') }} />}
          <span className="md-label-medium" style={{ color: CC('on-surface-variant') }}>{label}</span>
        </div>
      }
      <button onClick={() => setOpen(true)} className="md-interactive"
      style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        border: `1px solid ${CC('outline-variant')}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer', background: CC('surface-container-highest') }}>
        <span className="md-state" />
        <span style={{ flex: 1, minWidth: 0, color: value ? CC('on-surface') : CC('on-surface-variant'), fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }}>
          {value ? sbFmtDate(value) : hint}
        </span>
        <Icon name="calendar_today" size={18} style={{ color: CC('on-surface-variant') }} />
      </button>
      {open && <CalendarSheet value={value} title={label || '날짜 선택'} futureOnly={futureOnly} pastOnly={pastOnly}
      onChange={onChange} onClose={() => setOpen(false)} />}
    </div>);

}

/* Auto-growing textarea — height follows content (no inner scroll), and on focus
   nudges its scroll container so the caret isn't hidden behind the keyboard/footer.
   Mark the scrolling ancestor with data-scroll for the keyboard-safe nudge. */
function AutoTextarea({ value, onChange, placeholder, C, minRows = 3, style }) {
  const CC = C || window.SB.C;
  const ref = React.useRef(null);
  const resize = () => {const el = ref.current;if (!el) return;el.style.height = 'auto';el.style.height = el.scrollHeight + 'px';};
  React.useEffect(() => {resize();}, [value]);
  const onFocus = (e) => {
    const el = e.target,scroller = el.closest('[data-scroll]');
    setTimeout(() => {
      if (!scroller) return;
      const er = el.getBoundingClientRect(),sr = scroller.getBoundingClientRect();
      const over = er.bottom - (sr.bottom - 16);
      if (over > 0) scroller.scrollTop += over;
    }, 60);
  };
  return (
    <textarea ref={ref} value={value} onChange={(ev) => {onChange(ev.target.value);resize();}} placeholder={placeholder} rows={minRows} onFocus={onFocus}
    style={{ width: '100%', resize: 'none', overflow: 'hidden', minHeight: minRows * 24 + 22, border: `1px solid ${CC('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
      background: CC('surface-container-highest'), color: CC('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, lineHeight: 1.5, outline: 'none', ...style }} />);

}

Object.assign(window, { CalendarSheet, DatePickerField, AutoTextarea, sbFmtDate, TimeSheet });

/* M3 modal time picker — hour/minute dials + AM·PM. Returns a display string like
   "오후 8:00". Rendered as an absolute overlay inside the phone frame. */
function TimeSheet({ value, title = '시간 선택', onChange, onClose }) {
  const C = window.SB.C;
  // parse "오후 8:00" / "오전 9:30" / "23:30" into 24h h/m
  const parse = (v) => {
    if (!v) return { h: 8, m: 0 };
    const pm = /오후|PM/i.test(v),am = /오전|AM/i.test(v);
    const mt = v.match(/(\d{1,2}):(\d{2})/);
    if (!mt) return { h: 8, m: 0 };
    let h = +mt[1];const m = +mt[2];
    if (pm && h < 12) h += 12;if (am && h === 12) h = 0;
    return { h, m };
  };
  const init = parse(value);
  const [h24, setH] = React.useState(init.h);
  const [min, setMin] = React.useState(init.m);
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const setMeridiem = (toPm) => {if (toPm && h24 < 12) setH(h24 + 12);if (!toPm && h24 >= 12) setH(h24 - 12);};
  const setHour12 = (v) => {const base = v % 12;setH(pm ? base + 12 : base);};
  const fmt = () => `${pm ? '오후' : '오전'} ${h12}:${String(min).padStart(2, '0')}`;
  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const Big = ({ active, children }) =>
  <span style={{ fontSize: 40, fontWeight: 600, fontFamily: 'var(--md-ref-typeface-plain)',
    color: active ? C('primary') : C('on-surface'), lineHeight: 1 }}>{children}</span>;

  const Dial = ({ items, sel, onPick, pad2 }) =>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
      {items.map((v) => {
      const on = v === sel;
      return (
        <button key={v} onClick={() => onPick(v)} className="md-interactive"
        style={{ position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 9999, padding: '9px 0',
          fontSize: 14.5, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: on ? 700 : 500,
          background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface') }}>
            <span className="md-state" />{pad2 ? String(v).padStart(2, '0') : v}
          </button>);

    })}
    </div>;

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 344, background: C('surface-container-high'), borderRadius: 28, padding: '20px 18px 14px', boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>{title}</div>

        {/* big read-out + AM/PM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <Big active>{h12}</Big><Big>:</Big><Big>{String(min).padStart(2, '0')}</Big>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C('outline-variant')}` }}>
            {[['오전', false], ['오후', true]].map(([lb, isPm]) => {
              const on = pm === isPm;
              return (
                <button key={lb} onClick={() => setMeridiem(isPm)} className="md-interactive"
                style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '9px 16px', whiteSpace: 'nowrap', fontSize: 14, fontWeight: on ? 700 : 500,
                  fontFamily: 'var(--md-ref-typeface-plain)', background: on ? C('tertiary-container') : 'transparent',
                  color: on ? C('on-tertiary-container') : C('on-surface-variant') }}>
                  <span className="md-state" />{lb}
                </button>);

            })}
          </div>
        </div>

        <div className="md-label-small" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>시</div>
        <Dial items={hours} sel={h12} onPick={setHour12} />
        <div className="md-label-small" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>분</div>
        <Dial items={mins} sel={min} onPick={setMin} pad2 />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 14 }}>
          <MdButton variant="text" onClick={onClose}>취소</MdButton>
          <MdButton variant="text" onClick={() => {onChange(fmt());onClose();}}>확인</MdButton>
        </div>
      </div>
    </div>);

}

/* ── Shared confirm dialog for destructive / irreversible actions (M3 basic dialog) ── */
function ConfirmDialog({ open, title, body, confirmLabel = '삭제', cancelLabel = '취소', danger, onConfirm, onClose, requireType }) {
  const C = window.SB.C;
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {if (open) setTyped('');}, [open]);
  if (!open) return null;
  const gate = requireType ? typed.trim() === requireType.trim() : true;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center',
      background: 'rgba(0,0,0,.5)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: C('surface-container-high'),
        borderRadius: 28, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {danger && <Icon name="warning" size={24} style={{ color: C('error') }} />}
          <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 22 }}>{title}</div>
        </div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: requireType ? 16 : 22 }}>{body}</div>
        {requireType &&
        <div style={{ marginBottom: 22 }}>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginBottom: 8, wordBreak: 'keep-all' }}>
            계속하려면 <span style={{ color: C('error'), fontWeight: 600 }}>‘{requireType}’</span> 를 입력해 주세요.
          </div>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireType}
          autoFocus spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12,
            background: C('surface-container-highest'), color: C('on-surface'), fontSize: 15, outline: 'none',
            border: `1.5px solid ${gate ? C('error') : C('outline-variant')}`, transition: 'border-color .15s' }} />
        </div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <MdButton variant="text" onClick={onClose}>{cancelLabel}</MdButton>
          <MdButton variant="filled" disabled={!gate} onClick={() => {if (!gate) return;onConfirm && onConfirm();onClose && onClose();}}
          style={danger ? { background: gate ? C('error') : C('surface-container-highest'), color: gate ? C('on-error') : C('on-surface-variant'), opacity: gate ? 1 : .7 } : gate ? undefined : { opacity: .5 }}>{confirmLabel}</MdButton>
        </div>
      </div>
    </div>);

}
Object.assign(window, { ConfirmDialog });