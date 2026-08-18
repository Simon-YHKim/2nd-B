/* ============================================================
   2nd-Brain · 픽셀 아바타 (PXC_EXT 확장팩 연동)
   - window.SBProfile : 프로필(아바타 spec·이름·핸들·직업) 저장소 (localStorage: sb_profile)
   - <SbAvatar spec size /> : 64×64 스프라이트 렌더
   - <AvatarStudio /> : 프레임 안에서 도는 아바타 스튜디오 시트
   확장팩은 pxc-ext-*.js 가 window.PXC_EXT 로 올려준다. 아이콘은 번들 ICONS 에 병합됨.
   ============================================================ */
const EXT = window.PXAvatar64 || window.PXC_EXT;   /* 64 그리드로 교체 (16 그리드는 폴백) */
/* 16 그리드 시절 저장본은 필드 규격이 달라 시드로 다시 만든다 */
function migrate64(sp) {
  if (!sp || sp.v === 64) return sp || null;
  /* 옛 저장본은 색·부품을 인덱스로 담는다 — ops() 의 normalize 가 그대로 흡수하므로
     시드로 다시 굴리지 않고 값만 넘긴다. 다시 굴리면 고른 캐릭터가 바뀐다. */
  return EXT.avatarSpec(sp.seed || 'nova', sp);
}

/* ---- 프로필 저장소 ---- */
window.SBProfile = (() => {
  const KEY = 'sb_profile';
  const listeners = new Set();
  const base = { name: '아리아', handle: 'aria', dob: '1996-04-12', goal: '', photo: false,
    avatar: EXT ? EXT.avatarSpec('nova', { type: 'human' }) : null };
  let st = base;
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') st = { ...base, ...s }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  return {
    get() { return st; },
    set(patch) { st = { ...st, ...patch }; save(); listeners.forEach((f) => f(st)); },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    /* 직업 메타 (있으면) */
    job() { return st.avatar && st.avatar.job && EXT && EXT.JOB_BY_ID ? EXT.JOB_BY_ID[st.avatar.job] : null; }
  };
})();
function useProfile() {
  const [p, setP] = React.useState(window.SBProfile.get());
  React.useEffect(() => window.SBProfile.subscribe(setP), []);
  return p;
}

/* ---- 아바타 렌더 ---- */
function SbAvatar({ spec, seed, size = 48, crop, style }) {
  const sp = migrate64(spec) || (EXT ? EXT.avatarSpec(seed || 'nova') : null);
  if (!EXT || !sp) return <span style={{ width: size, height: size, display: 'block', background: 'var(--sunken)', ...style }} />;
  /* crop: 작은 칩에서 전신 64칸을 다 넣으면 한 칸이 1px 미만이 된다.
     머리 영역(12..52 × 0..40)만 잘라 칸 크기를 지킨다 — 높은 헤어·귀·턱선 소품까지 포함. */
  let html = EXT.avatarSVG(sp).replace('<span class="px-pavatar">', '<span style="display:block;width:100%;height:100%">');
  if (crop) html = html.replace('viewBox="0 0 64 64"', 'viewBox="12 0 40 40"');
  return <span aria-hidden="true" style={{ width: size, height: size, display: 'block', flex: '0 0 auto', lineHeight: 0, ...style }}
  dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---- 스튜디오 부품 ---- */
function StRail({ items, value, onChange, label }) {
  const C = window.SB.C;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map((it, i) => {
          const v = it.key !== undefined ? it.key : it.id !== undefined ? it.id : i;
          const on = value === v;
          return (
            <button key={it.id || i} onClick={() => onChange(v)} aria-pressed={on} className="md-interactive"
            style={{ position: 'relative', flex: '0 0 auto', minHeight: 32, padding: on ? '0 9px 0 6px' : '0 9px', border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: on ? 'var(--accent)' : 'var(--panel-2)', color: on ? 'var(--accent-fg)' : C('on-surface'),
              boxShadow: on ? 'var(--ds-edge), inset 0 0 0 2px var(--accent-fg)' : 'var(--ds-edge)',
              font: (on ? '700' : '400') + ' 12px/1.5 var(--font-ui)', whiteSpace: 'nowrap',
              transform: on ? 'translateY(var(--u))' : 'none' }}>
              <span className="md-state" />
              {on && <Icon name="check" size={13} />}
              {it.ko || it.label}
            </button>);
        })}
      </div>
    </div>);
}
function StSwatch({ colors, value, onChange, label }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {colors.map((c, i) => {
          const on = value === c || value === i;
          return (
            <button key={c + i} onClick={() => onChange(c)} aria-pressed={on} aria-label={label + ' ' + (i + 1)}
            style={{ position: 'relative', width: 26, height: 26, border: 'none', cursor: 'pointer', background: c, padding: 0,
              display: 'grid', placeItems: 'center',
              boxShadow: on ? '0 0 0 2px var(--edge), 0 0 0 4px var(--ds-core)' : 'var(--ds-edge)',
              transform: on ? 'translateY(var(--u))' : 'none' }}>
              {on && <span aria-hidden="true" style={{ width: 10, height: 10, background: 'var(--c00)', boxShadow: '0 0 0 2px var(--c08)' }} />}
            </button>);
        })}
      </div>
    </div>);
}

/* ---- 아바타 스튜디오 — 프레임 안 전체 시트 ---- */
function AvatarStudio({ spec, onSave, onClose }) {
  const C = window.SB.C;
  const [sp, setSp] = React.useState(() => spec || EXT.avatarSpec('nova', { type: 'human' }));
  const [tab, setTab] = React.useState('look');
  const [group, setGroup] = React.useState('all');
  const [jobMore, setJobMore] = React.useState(1);
  const JOB_PAGE = 40;
  const patch = (p) => setSp((s) => EXT.avatarSpec(s.seed, { ...s, ...p }));
  const randomize = () => setSp(EXT.avatarSpec(Math.random().toString(36).slice(2, 9), { type: sp.type }));
  const jobs = EXT.JOB.filter((j) => group === 'all' || j.group === group);
  const jobsShown = jobs.slice(0, jobMore * JOB_PAGE);
  const jobMeta = sp.job ? EXT.JOB_BY_ID[sp.job] : null;
  const Tab = ({ id, children }) =>
  <button onClick={() => setTab(id)} aria-pressed={tab === id} className="md-interactive"
  style={{ position: 'relative', flex: 1, minHeight: 40, border: 'none', cursor: 'pointer',
    background: tab === id ? 'var(--accent)' : 'var(--panel-2)', color: tab === id ? 'var(--accent-fg)' : C('on-surface'),
    boxShadow: 'var(--ds-edge)', font: '700 12px/1.5 var(--font-ui)' }}>
    <span className="md-state" />{children}
  </button>;
  return (
    <div className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column' }}>
      <div className="ds-window" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: 8, background: C('surface') }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 6px', flex: '0 0 auto' }}>
          <MdIconButton name="close" title="닫기" onClick={onClose} />
          <span className="md-title-large" style={{ color: C('on-surface') }}>아바타 만들기</span>
          <span style={{ marginLeft: 'auto' }}><MdIconButton name="cached" title="랜덤" onClick={randomize} /></span>
        </div>
        {/* 미리보기 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 16px 14px', flex: '0 0 auto' }}>
          <div style={{ width: 96, height: 96, display: 'grid', placeItems: 'center', background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)' }}>
            <SbAvatar spec={sp} size={88} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              {[48, 32, 16].map((n) =>
              <span key={n} style={{ textAlign: 'center' }}>
                <SbAvatar spec={sp} size={n} />
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{n}</span>
              </span>)}
            </div>
            <div style={{ fontSize: 12, color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
              {jobMeta ? <b style={{ color: C('on-surface') }}>{jobMeta.ko}</b> : sp.type === 'animal' ? '동물' : '사람'}
            </div>
          </div>
        </div>
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px', flex: '0 0 auto' }}>
          <Tab id="look">모양</Tab><Tab id="job">직업</Tab><Tab id="color">색</Tab>
        </div>
        {/* 본문 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 12px' }}>
          {tab === 'look' &&
          <React.Fragment>
            <StRail label="종류" items={[{ id: 'human', ko: '사람', key: 'human' }, { id: 'animal', ko: '동물', key: 'animal' }]} value={sp.type} onChange={(v) => patch({ type: v })} />
            {sp.type === 'human' ?
            <React.Fragment>
              <StRail label="헤어스타일" items={EXT.HAIR} value={sp.hair} onChange={(v) => patch({ hair: v })} />
              <StRail label="표정" items={EXT.EXPR} value={sp.expr} onChange={(v) => patch({ expr: v })} />
              <StRail label="액세서리" items={EXT.ACC} value={sp.acc} onChange={(v) => patch({ acc: v })} />
              <StRail label="얼굴" items={EXT.FACE} value={sp.face} onChange={(v) => patch({ face: v })} />
            </React.Fragment> :
            <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', marginBottom: 6 }}>종</div>}
            {sp.type === 'animal' &&
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
              {EXT.ANIMAL.map((a) =>
              <button key={a.id} onClick={() => patch({ species: a.id })} title={a.ko} aria-pressed={sp.species === a.id} className="md-interactive"
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 2px 6px',
                border: 'none', cursor: 'pointer',
                background: sp.species === a.id ? 'var(--accent)' : 'var(--panel-2)',
                color: sp.species === a.id ? 'var(--accent-fg)' : C('on-surface'), boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <SbAvatar spec={EXT.avatarSpec(sp.seed, { ...sp, type: 'animal', species: a.id })} size={30} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', lineHeight: 1.2, textAlign: 'center', wordBreak: 'keep-all' }}>{a.ko}</span>
              </button>)}
            </div>}
          </React.Fragment>}
          {tab === 'job' &&
          <React.Fragment>
            {sp.type === 'animal' &&
            <div style={{ fontSize: 12, color: C('on-surface-variant'), marginBottom: 10, wordBreak: 'keep-all' }}>직업은 사람 아바타에만 입힐 수 있어요.</div>}
            <StRail label="분야" items={[{ id: 'all', ko: '전체', key: 'all' }].concat(EXT.JOB_GROUPS.map((g) => ({ id: g.id, ko: g.ko, key: g.id })))} value={group} onChange={(v) => { setGroup(v); setJobMore(1); }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
              <button onClick={() => patch({ job: null })} aria-pressed={!sp.job} className="md-interactive"
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 2px 6px',
                border: 'none', cursor: 'pointer',
                background: !sp.job ? 'var(--accent)' : 'var(--panel-2)', color: !sp.job ? 'var(--accent-fg)' : C('on-surface'), boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <span style={{ height: 30, display: 'grid', placeItems: 'center' }}><Icon name="close" size={16} /></span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', lineHeight: 1.2 }}>없음</span>
              </button>
              {jobsShown.map((j) =>
              <button key={j.id} onClick={() => patch({ job: j.id, type: 'human' })} title={j.ko} aria-pressed={sp.job === j.id} className="md-interactive"
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 3, padding: '8px 2px 6px',
                border: 'none', cursor: 'pointer',
                background: sp.job === j.id ? 'var(--accent)' : 'var(--panel-2)',
                color: sp.job === j.id ? 'var(--accent-fg)' : C('on-surface'), boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <SbAvatar spec={EXT.avatarSpec(sp.seed, { ...sp, type: 'human', job: j.id })} size={30} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', lineHeight: 1.2, textAlign: 'center', wordBreak: 'keep-all' }}>{j.ko}</span>
              </button>)}
            </div>
            {jobsShown.length < jobs.length &&
            <div style={{ marginTop: 10 }}><MdButton variant="outlined" full size="s" icon="expand_more" onClick={() => setJobMore((v) => v + 1)}>더 보기 ({jobs.length - jobsShown.length})</MdButton></div>}
            {jobMeta && <div style={{ fontSize: 12, color: C('on-surface-variant'), marginTop: 10 }}>선택: <b style={{ color: C('on-surface') }}>{jobMeta.ko}</b> · {jobMeta.en}</div>}
          </React.Fragment>}
          {tab === 'color' &&
          <React.Fragment>
            {sp.type === 'human' ?
            <React.Fragment>
              <StSwatch label="피부" colors={EXT.SKIN} value={sp.skin} onChange={(v) => patch({ skin: v })} />
              <StSwatch label="머리색" colors={EXT.HAIRC} value={sp.hairColor} onChange={(v) => patch({ hairColor: v })} />
            </React.Fragment> :
            <StSwatch label="털색" colors={EXT.FUR} value={sp.fur} onChange={(v) => patch({ fur: v })} />}
            <StSwatch label="옷" colors={EXT.CLOTH} value={sp.cloth} onChange={(v) => patch({ cloth: v })} />
            {sp.job && <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), wordBreak: 'keep-all' }}>직업을 고르면 모자·의상은 그 직업의 고정 색을 써요.</div>}
          </React.Fragment>}
        </div>
        {/* 저장 */}
        <div style={{ padding: '10px 16px 14px', flex: '0 0 auto' }}>
          <MdButton variant="filled" full icon="check" onClick={() => onSave(sp)}>이 아바타로 할래요</MdButton>
        </div>
      </div>
    </div>);
}

Object.assign(window, { SbAvatar, AvatarStudio, useProfile, PXC_EXT_READY: !!EXT });
