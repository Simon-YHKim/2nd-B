/* ============================================================
   px-primitives.jsx — M3 프리미티브 이름을 PIXEL-CLAY 번들
   컴포넌트로 재구현. sb-*.jsx 화면 코드는 수정 없이 이 이름들을
   window에서 집어 쓴다. (sb-data.jsx의 M3 원본 정의는 제거됨)
   ============================================================ */
const PXC = window.PIXELCLAYDesignSystem_ca692b;
const pxRole = (v) => `var(--md-sys-color-${v})`;

/* Material Symbols 이름 → PXC 16×16 글리프 매핑 */
const PX_ICON_MAP = {
  star_shine: 'star', auto_awesome: 'star', ac_unit: 'star', satellite_alt: 'star',
  add_circle: 'plus', add: 'plus', close: 'close', check: 'check', task_alt: 'success',
  check_circle: 'success', verified: 'success', sentiment_satisfied: 'success', sentiment_very_satisfied: 'success',
  sentiment_neutral: 'info', sentiment_dissatisfied: 'error', sentiment_very_dissatisfied: 'error',
  forum: 'chat', chat: 'chat', format_quote: 'chat', inventory_2: 'archive', inbox: 'archive', account_balance: 'chest',
  tune: 'sliders', settings: 'gear', chevron_right: 'chevronRight', chevron_left: 'chevronLeft',
  expand_more: 'chevronDown', expand_less: 'chevronUp', arrow_back: 'arrowLeft', arrow_forward: 'arrowRight',
  north_east: 'arrowUp', south: 'arrowDown', rocket_launch: 'arrowUp', ios_share: 'upload', cloud_upload: 'upload',
  open_in_new: 'share', share: 'share', hub: 'share', workspaces: 'share', lan: 'share', bubble_chart: 'share',
  lock: 'lock', lock_open: 'unlock', visibility: 'eye', search: 'search', travel_explore: 'search', wifi: 'wifi',
  signal_cellular_alt: 'chartBar', battery_full: 'stop', notifications: 'bell', notifications_active: 'bell',
  alarm: 'clock', schedule: 'clock', timer: 'clock', history: 'refresh', cached: 'refresh', replay: 'refresh', transform: 'refresh',
  calendar_today: 'calendar', event: 'calendar', today: 'calendar', star: 'star', favorite: 'heart',
  cardiology: 'heart', monitor_heart: 'heart', monitor_weight: 'heart', warning: 'warn', block: 'error', coronavirus: 'error',
  cloud_off: 'error', info: 'info', help: 'help', edit: 'edit', edit_note: 'edit', edit_square: 'edit',
  delete: 'trash', link: 'link', attach_file: 'attach', photo_camera: 'image', image: 'image',
  add_photo_alternate: 'image', add_a_photo: 'image', photo_library: 'image', mic: 'record', play_circle: 'play',
  play_arrow: 'play', pause: 'pause', send: 'send', menu: 'menu', more_horiz: 'more', more_vert: 'more',
  apps: 'grid', dashboard: 'grid', grid_on: 'grid', memory: 'grid', trending_up: 'chartLine', trending_down: 'chartLine',
  insights: 'chartLine', person: 'user', person_add: 'user', self_improvement: 'user', directions_run: 'user',
  smart_toy: 'user', badge: 'user', contacts: 'users', group: 'users', groups: 'users', target: 'record',
  radio_button_unchecked: 'stop', lightbulb: 'sun', wb_sunny: 'sun', local_fire_department: 'sun', bolt: 'gem',
  dark_mode: 'moon', bedtime: 'moon', label: 'tag', sell: 'tag', description: 'file', auto_stories: 'file',
  menu_book: 'file', book: 'file', school: 'file', code: 'file', checklist: 'list', rule: 'list', list: 'list',
  filter_list: 'filter', savings: 'coin', payments: 'coin', shopping_bag: 'chest', drive_file_move: 'folder',
  smartphone: 'phone', devices: 'phone', phone: 'phone', call: 'phone', water_drop: 'potion', restaurant: 'leaf',
  psychology: 'seed', neurology: 'seed', palette: 'gem', gavel: 'sword', fitness_center: 'sword',
  emoji_events: 'gem', military_tech: 'gem', workspace_premium: 'gem', layers: 'copy', open_in_full: 'expand',
  swipe: 'expand', drag_pan: 'expand', flag: 'flag', shield: 'shield', key: 'key', database: 'database',
  campaign: 'volume', build: 'gear', notes: 'file', check_box: 'success', stop_circle: 'stop', graph_3: 'share',
  shield_person: 'shield', cloud_download: 'download', history: 'refresh',
  document_scanner: 'clipboard', mail: 'mail', download: 'download', bookmark: 'bookmark', power: 'power'
};
function pxIconName(n) {
  if (PX_ICON_MAP[n]) return PX_ICON_MAP[n];
  if (PXC.ICONS && PXC.ICONS[n]) return n;
  return 'star';
}
/* M3 Icon(name, fill, size) → PXC Icon. 표시 크기는 16/32/48로 스냅. */
function Icon({ name, fill, size = 24, weight, grade, style }) {
  const s = size <= 22 ? 'sm' : size <= 44 ? 'md' : 'lg';
  return <PXC.Icon name={pxIconName(name)} size={s} style={{ flex: '0 0 auto', verticalAlign: 'middle', ...style }} />;
}

function MdButton({ variant = 'filled', icon, trailingIcon, children, onClick, full, size = 'm', style, disabled }) {
  const v = variant === 'filled' ? 'primary' : variant === 'outlined' || variant === 'text' ? 'ghost' : undefined;
  const tertiary = variant === 'tertiary' ? { background: 'var(--ds-nebula-deep)', color: 'var(--ds-nebula-soft)' } : null;
  return (
    <PXC.Button variant={v} size={size === 's' ? 'sm' : size === 'l' ? 'lg' : undefined} block={full}
    disabled={disabled} onClick={disabled ? undefined : onClick}
    className={variant === 'text' ? 'ds-bare' : ''}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s2)',
      minHeight: 44, ...tertiary, ...style }}>
      {icon && <Icon name={icon} size={16} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={16} />}
    </PXC.Button>);
}

function MdIconButton({ name, fill, variant = 'standard', onClick, size = 40, iconSize = 24, style, title }) {
  return (
    <PXC.IconButton icon={pxIconName(name)} label={title || name} onClick={onClick}
    variant={variant === 'filled' ? 'primary' : undefined}
    className={variant === 'standard' ? 'ds-bare' : ''}
    style={{ minWidth: 44, minHeight: 44, ...style }} />);
}

function MdCard({ variant = 'filled', children, onClick, style, className }) {
  const bg = pxRole(variant === 'elevated' ? 'surface-container-low' : variant === 'outlined' ? 'surface-container' : 'surface-container-highest');
  return (
    <div className={'px-bevel' + (onClick ? ' md-interactive' : '') + (className ? ' ' + className : '')}
    onClick={onClick}
    style={{ background: bg, padding: 'var(--s4)', position: 'relative', cursor: onClick ? 'pointer' : 'default', ...style }}>
      {onClick && <span className="md-state" />}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>);
}

function MdChip({ children, icon, selected, onClick, variant = 'assist', style }) {
  const sel = selected && variant === 'filter';
  return (
    <PXC.Chip pressed={!!sel} onClick={onClick} className="md-interactive"
    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s1)', whiteSpace: 'nowrap', flex: '0 0 auto',
      ...(sel ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : null), ...style }}>
      {sel && <Icon name="check" size={16} />}
      {icon && !sel && <Icon name={icon} size={16} />}
      {children}
    </PXC.Chip>);
}

function ProgressLinear({ value, color, track, height }) {
  return <PXC.Gauge value={Math.max(0, Math.min(100, value || 0))} />;
}

function MoodDot({ mood = 'neutral', size = 10, style }) {
  return <span style={{ width: size, height: size, background: `var(--sb-mood-${mood})`,
    boxShadow: '0 0 0 var(--u) var(--edge)', display: 'inline-block', flex: '0 0 auto', ...style }} />;
}

function MdSwitch({ checked, onChange }) {
  return <PXC.Switch checked={!!checked} onChange={(e) => onChange && onChange(e.target.checked)} />;
}

function MdCheckbox({ checked, disabled, onChange }) {
  return <PXC.Check type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />;
}

function MdBottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} className="ds-window"
      style={{ width: '100%', maxHeight: '78%', overflowY: 'auto', padding: 'var(--s3) var(--s4) var(--s5)', margin: 'var(--s1)' }}>
        <div aria-hidden="true" style={{ width: 32, height: 'var(--u)', background: 'var(--c03)', margin: '0 auto var(--s3)' }} />
        {children}
      </div>
    </div>);
}

function AnalysisDock({ job }) {
  return (
    <div className="ds-window" style={{ position: 'absolute', left: 'var(--s3)', right: 'var(--s3)', bottom: 92, zIndex: 40, padding: 'var(--s2) var(--s3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s1)' }}>
        <PXC.Spinner />
        <span className="md-body-medium" style={{ color: 'var(--fg)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.label}</span>
        <span className="px-mono-num" style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{Math.round(job.pct)}%</span>
      </div>
      <PXC.Gauge value={job.pct} />
    </div>);
}

function Toast({ toast, onAction, onClose }) {
  return (
    <div style={{ position: 'absolute', left: 'var(--s3)', right: 'var(--s3)', bottom: 92, zIndex: 50 }}>
      <PXC.Toast style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', width: '100%' }}>
        <span style={{ flex: 1, minWidth: 0 }}>{toast.msg}</span>
        {toast.action && <button onClick={onAction} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-soft)', font: '700 12px/1.5 var(--font-ui)', padding: 0, whiteSpace: 'nowrap' }}>{toast.action}</button>}
        <button onClick={onClose} aria-label="닫기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex', padding: 0 }}><Icon name="close" size={16} /></button>
      </PXC.Toast>
    </div>);
}

/* ── SbHead — 세컨비 머리, 16×16 픽셀 스프라이트 재작화 ──
   expression: positive | neutral | negative (눈높이 + 입모양)
   track: 시선이 포인터 방향으로 1px 단위 스냅 이동. tilt/glow는 그리드 위반이라 무시. */
function SbHead({ size = 48, expression = 'neutral', track = true, tilt, bob = false, glow, accent, style }) {
  const px = Math.max(16, Math.round(size / 16) * 16);
  const [gaze, setGaze] = React.useState([0, 0]);
  const [blink, setBlink] = React.useState(false);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!track) return;
    let last = 0;
    const move = (e) => {
      const now = Date.now(); if (now - last < 120) return; last = now;
      const el = rootRef.current; if (!el) return;
      const p = e.touches ? e.touches[0] : e; if (!p) return;
      const r = el.getBoundingClientRect();
      const dx = p.clientX - (r.left + r.width / 2), dy = p.clientY - (r.top + r.height / 2);
      setGaze([Math.abs(dx) < 40 ? 0 : dx > 0 ? 1 : -1, Math.abs(dy) < 40 ? 0 : dy > 0 ? 1 : -1]);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [track]);
  React.useEffect(() => {
    let t2; const t = setInterval(() => { setBlink(true); t2 = setTimeout(() => setBlink(false), 150); }, 3400 + Math.random() * 2000);
    return () => { clearInterval(t); clearTimeout(t2); };
  }, []);
  const HULL = 'var(--c03)', HULL_D = 'var(--c02)', HULL_L = 'var(--c04)', VISOR = 'var(--ds-visor)';
  const EYE = accent || 'var(--ds-core)', EYE_CORE = 'var(--ds-star)', MOUTH = accent || 'var(--ds-core)';
  const MOOD_C = `var(--sb-mood-${expression})`;
  const R = []; const add = (x, y, w, h, f) => R.push([x, y, w, h, f]);
  add(7, 0, 2, 1, MOOD_C); add(7, 1, 2, 1, HULL_L);            /* 안테나 */
  add(4, 2, 8, 1, HULL_L); add(3, 3, 10, 1, HULL);             /* 정수리 */
  add(2, 4, 12, 7, HULL);                                       /* 머리통 */
  add(1, 5, 1, 4, HULL_D); add(14, 5, 1, 4, HULL_D);            /* 사이드 포드 */
  add(3, 5, 10, 5, VISOR);                                      /* 바이저 */
  const ex = gaze[0], ey = gaze[1];
  if (blink) { add(4 + ex, 7 + ey, 2, 1, EYE); add(10 + ex, 7 + ey, 2, 1, EYE); }
  else if (expression === 'positive') {
    add(4 + ex, 6 + ey, 2, 2, EYE); add(10 + ex, 6 + ey, 2, 2, EYE);
    add(4 + ex, 6 + ey, 1, 1, EYE_CORE); add(10 + ex, 6 + ey, 1, 1, EYE_CORE);
  } else {
    add(4 + ex, 6 + ey, 2, 3, EYE); add(10 + ex, 6 + ey, 2, 3, EYE);
    add(4 + ex, 6 + ey, 1, 1, EYE_CORE); add(10 + ex, 6 + ey, 1, 1, EYE_CORE);
  }
  if (expression === 'positive') { add(6, 9, 1, 1, MOUTH); add(9, 9, 1, 1, MOUTH); add(7, 10, 2, 1, MOUTH); }
  else if (expression === 'negative') { add(7, 9, 2, 1, MOUTH); add(6, 10, 1, 1, MOUTH); add(9, 10, 1, 1, MOUTH); }
  else add(6, 10, 4, 1, MOUTH);
  add(3, 11, 10, 1, HULL); add(4, 12, 8, 1, HULL_D);            /* 턱 */
  add(5, 13, 6, 1, HULL_D);
  return (
    <div ref={rootRef} style={{ position: 'relative', width: px, height: px, flex: '0 0 auto',
      animation: bob ? 'sb-bob 2s steps(2,end) infinite' : undefined, ...style }}>
      <svg viewBox="0 0 16 16" width={px} height={px} shapeRendering="crispEdges" role="img" aria-label="세컨비">
        {R.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={r[4]} />)}
      </svg>
    </div>);
}

/* ── 세컨비 머리 데이터URI (img src 호환용) — 렌즈별 눈 색 ── */
function sbHeadURI(eye, core, blank) {
  const HULL = '#3d4866', HULL_D = '#232e4a', HULL_L = '#8b96b0', VISOR = '#0A1020', ANT = '#A78BFA';
  const R = []; const add = (x, y, w, h, f) => R.push(`<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${f}'/>`);
  add(7, 0, 2, 1, ANT); add(7, 1, 2, 1, HULL_L);
  add(4, 2, 8, 1, HULL_L); add(3, 3, 10, 1, HULL); add(2, 4, 12, 7, HULL);
  add(1, 5, 1, 4, HULL_D); add(14, 5, 1, 4, HULL_D); add(3, 5, 10, 5, VISOR);
  if (!blank) {
    add(4, 6, 2, 3, eye); add(10, 6, 2, 3, eye); add(4, 6, 1, 1, core); add(10, 6, 1, 1, core);
    add(6, 10, 4, 1, eye);
  }
  add(3, 11, 10, 1, HULL); add(4, 12, 8, 1, HULL_D); add(5, 13, 6, 1, HULL_D);
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>${R.join('')}</svg>`);
}
window.SB_HEAD = {  'head-front': sbHeadURI('#46B6FF', '#CCFAFF'), 'head-blank': sbHeadURI('#46B6FF', '#CCFAFF', true),
  'meta-face': sbHeadURI('#46B6FF', '#CCFAFF'), 'meta-blank': sbHeadURI('#46B6FF', '#CCFAFF', true),
  'twi-face': sbHeadURI('#C8B6FF', '#FFFFFF'), 'twi-blank': sbHeadURI('#C8B6FF', '#FFFFFF', true)
};

/* ── DialogBox — 2D 픽셀 RPG 대화창. 이중 프레임 · 이름판 · 타이핑 · ▼ 진행 · 선택지.
   pages(배열)를 주면 ▼ 를 눌러 다음 장으로 넘긴다. 한 장: {kind, meta?, title?, line, choices?}
   meta는 제목 위에 오는 작은 회색 줄(시각·형식 등) — 내용이 먼저 읽히도록 순서를 뒤집는다. ── */
function DialogBox({ kindLabel, meta, title, line, choices, head, pages, onPage, compact }) {
  const paged = Array.isArray(pages) && pages.length > 0;
  const [pi, setPi] = React.useState(0);
  React.useEffect(() => { setPi(0); }, [paged ? pages.length : 0]);
  const page = paged ? pages[Math.min(pi, pages.length - 1)] : null;
  const kl = page ? page.kind : kindLabel;
  const ti = page ? page.title : title;
  const mt = page ? page.meta : meta;
  const li = page ? page.line : line;
  const ch = page ? page.choices : choices;
  const rt = page ? page.route : null;
  const rtParam = page ? page.routeParam : null;
  const rtLabel = (page && page.cta) || '보러가기';
  const rtIcon = (page && page.ctaIcon) || 'auto_stories';
  const isNode = li != null && typeof li !== 'string';
  const full = `${ti ? ti + '\n' : ''}${isNode ? '' : li}`;
  const reduce = React.useRef(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [n, setN] = React.useState(reduce.current ? full.length : 0);
  React.useEffect(() => {
    if (reduce.current) { setN(full.length); return; }
    setN(0);
    const id = setInterval(() => setN((v) => { if (v >= full.length) { clearInterval(id); return v; } return v + 1; }), 26);
    return () => clearInterval(id);
  }, [full]);
  const done = n >= full.length;
  const shown = full.slice(0, n);
  const tShown = ti ? shown.split('\n')[0] : '';
  const lShown = ti ? shown.split('\n')[1] || '' : shown;
  const advance = () => {
    if (!done) { setN(full.length); return; }
    if (!paged || ch) return;
    const next = (pi + 1) % pages.length;
    setPi(next); onPage && onPage(next);
  };
  const pad = compact ? '12px 13px 11px' : '15px 16px 14px';
  return (
    <div style={{ width: '100%', padding: compact ? 0 : '0 10px' }} onClick={advance}>
      {/* 고정 최소 높이를 두면 짧은 대사에서 하단이 비어 보인다 — 내용만큼만 차지하고 위로 늘어난다 */}
      <div style={{ position: 'relative', background: 'var(--c01)', boxShadow: 'var(--ds-edge)', padding: pad,
        pointerEvents: 'auto', cursor: paged || !done ? 'pointer' : 'default' }}>
        <span aria-hidden="true" style={{ position: 'absolute', inset: 4, boxShadow: '0 0 0 var(--u) var(--edge-soft)', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', top: -10, left: 16, padding: '2px 9px', background: 'var(--c01)', boxShadow: 'var(--ds-edge)',
          fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--ds-nebula)' }}>{kl}</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {head &&
          <div style={{ flex: '0 0 auto', background: 'var(--sunken)', boxShadow: 'var(--ds-edge)', padding: 2, display: 'grid', placeItems: 'center' }}>{head}</div>}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {mt && <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', marginBottom: 3 }}>{mt}</div>}
          {ti && <div style={{ fontSize: compact ? 12 : 15, fontWeight: 700, color: 'var(--c07)', marginBottom: 4 }}>{tShown}</div>}
          <div style={{ fontSize: compact ? 12 : 15, color: 'var(--c11)', lineHeight: 1.5, wordBreak: 'keep-all', textWrap: 'pretty' }}>{isNode ? li : lShown}</div>
          {rt && done && window.__sb &&
          <div style={{ display: 'flex', marginTop: 12 }}>
            <button onClick={(e2) => { e2.stopPropagation(); window.__sb.jump(rt, rtParam); }} className="md-interactive"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px',
              background: 'var(--accent)', color: 'var(--accent-fg)', boxShadow: 'var(--ds-edge)', border: 'none', cursor: 'pointer',
              font: '700 12px/1.5 var(--font-ui)' }}>
              <span className="md-state" />
              <Icon name={rtIcon} size={14} />{rtLabel}
            </button>
          </div>}
          {ch && done &&
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {ch.map((c) =>
            <button key={c.label} onClick={(e) => { e.stopPropagation(); c.on(); }} className="md-interactive"
            style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
              background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)', border: 'none', cursor: 'pointer',
              color: 'var(--c07)', font: '700 12px/1.5 var(--font-ui)' }}>
              <span className="md-state" />
              <Icon name={c.icon} size={16} />{c.label}
            </button>)}
          </div>}
          {done && !ch &&
          <span aria-hidden="true" className="ds-tw-box" style={{ position: 'absolute', right: 0, bottom: -2, width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid var(--ds-core)' }} />}
          </div>
        </div>
      </div>
    </div>);
}

/* ── 픽셀 차트 (v4 번들 차트 엔진) ──
   PXC.SER 를 딥스페이스 계열로 한 번 설정하면 30종 차트가 팔레트를 따라온다. */
if (window.PXC) {
  window.PXC.SER = ['--ds-core', '--ds-nebula', '--ok', '--warn', '--danger', '--accent-deep', '--c04', '--c05'];
  window.PXC.GRID = '--edge-soft';
  window.PXC.AXIS = '--c04';
}
function PxChart({ type, data, options, label, height, style }) {
  if (!PXC.Chart) return null;
  return <PXC.Chart type={type} data={data} label={label} options={options}
  style={{ minHeight: 0, ...(height ? { height } : null), ...style }} />;
}

Object.assign(window, { Icon, MdButton, MdIconButton, MdCard, MdChip, ProgressLinear, MoodDot, MdSwitch, MdCheckbox, MdBottomSheet, AnalysisDock, Toast, SbHead, DialogBox, PxChart, PX_ICON_MAP });
window.PXSpinner = PXC.Spinner;
window.MOOD = { positive: 'var(--sb-mood-positive)', neutral: 'var(--sb-mood-neutral)', negative: 'var(--sb-mood-negative)' };
