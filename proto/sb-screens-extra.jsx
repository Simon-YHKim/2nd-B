/* ============================================================
   2nd-Brain · Extra screens
   StarScreen(도메인 별 상세) · IdenScreen · ConnectScreen · PlansScreen
   · SettingsScreen · MuseumScreen · state screens (loading/empty/error/offline)
   Export: window.{StarScreen, IdenScreen, ConnectScreen, PlansScreen,
           SettingsScreen, MuseumScreen, StatePreviewScreen,
           Skeleton, EmptyState, ErrorState, OfflineBanner, LoadingState, MdSwitch}
   ============================================================ */
const { useState: useSt, useEffect: useEf } = React;

/* ---- per-domain detail metadata. 별빛(cov)=얼마나 담았나, 확신(conf)=얼마나 검증됐나.
   The two are intentionally different — that is the PRD's 밝기 정직성 rule. ---- */
const DOMAIN_META = window.SB_DATA.domainMeta.domains; // → data/screens/domain-meta.json

/* ===================== reusable state pieces ===================== */
/* Loading: 세컨비 머리 둘레를 도는 스피너 + 한 줄 문장 (스켈레톤 없음) */
function LoadingState({ label = '불러오는 중', sub }) {
  const C = window.SB.C;
  return (
    <div style={{ flex: 1, height: '100%', minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 22, padding: '40px 28px' }}>
      <div style={{ position: 'relative', width: 132, height: 132, display: 'grid', placeItems: 'center' }}>
        {/* breathing halo */}
        <div style={{ position: 'absolute', width: 104, height: 104, borderRadius: '50%', filter: 'blur(3px)',
          background: 'radial-gradient(circle, rgba(70,150,255,.42), transparent 68%)',
          animation: 'sb-pulse 2.6s ease-in-out infinite' }} />
        {/* faint static orbit guide */}
        <div style={{ position: 'absolute', inset: 9, borderRadius: '50%', border: '1px dashed rgba(126,180,255,.18)' }} />
        {/* orbiting star particles — graduated opacity makes a comet trail as the group rotates */}
        <div style={{ position: 'absolute', inset: 0, animation: 'sb-spin 2.4s linear infinite' }}>
          {Array.from({ length: 6 }).map((_, i) =>
          <div key={i} style={{ position: 'absolute', inset: 0, transform: `rotate(${i * 60}deg)` }}>
              <span style={{ position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)',
              width: 7 - i * 0.5, height: 7 - i * 0.5, borderRadius: '50%', background: '#CCFAFF',
              opacity: 1 - i * 0.15, boxShadow: '0 0 8px 1px rgba(120,216,246,.85)' }} />
            </div>
          )}
        </div>
        {/* head */}
        <div style={{ animation: 'sb-bob 3.4s ease-in-out infinite' }}>
          <img src="assets/deepspace/secondb-head-front.png" alt="세컨비" style={{ width: 72, height: 72, display: 'block',
            filter: 'drop-shadow(0 6px 16px rgba(70,90,200,.5))' }} />
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="md-title-medium" style={{ color: C('on-surface') }}>{label}</div>
        {sub && <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 6, maxWidth: 230, wordBreak: 'keep-all' }}>{sub}</div>}
      </div>
    </div>);

}

function EmptyState({ icon = 'inbox', title, body, cta, onCta }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '52px 28px', gap: 12, minHeight: 340 }}>
      <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: C('surface-container-highest') }}>
        <Icon name={icon} size={38} style={{ color: C('on-surface-variant') }} />
      </div>
      <div className="md-title-large" style={{ color: C('on-surface'), marginTop: 4 }}>{title}</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), maxWidth: 250, wordBreak: 'keep-all' }}>{body}</div>
      {cta && <MdButton variant="tonal" icon="add" style={{ marginTop: 6 }} onClick={onCta}>{cta}</MdButton>}
    </div>);

}

function ErrorState({ title = '잠시 문제가 생겼어요', body = '데이터를 불러오지 못했어요. 다시 시도해 주세요.', onRetry }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '52px 28px', gap: 12, minHeight: 340 }}>
      <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: C('error-container') }}>
        <Icon name="replay" size={38} style={{ color: C('on-error-container') }} />
      </div>
      <div className="md-title-large" style={{ color: C('on-surface'), marginTop: 4 }}>{title}</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), maxWidth: 250, wordBreak: 'keep-all' }}>{body}</div>
      <MdButton variant="filled" icon="replay" style={{ marginTop: 6 }} onClick={onRetry}>다시 시도</MdButton>
    </div>);

}

function OfflineBanner() {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', margin: '0 0 8px',
      borderRadius: 12, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
      <Icon name="wifi" size={18} style={{ color: C('on-surface-variant') }} />
      <div style={{ flex: 1 }}>
        <div className="md-label-large" style={{ color: C('on-surface') }}>오프라인 모드</div>
        <div className="md-body-small" style={{ color: C('on-surface-variant') }}>담기는 저장돼요. 연결되면 자동으로 동기화돼요.</div>
      </div>
    </div>);

}

/* small M3 switch */
function MdSwitch({ checked, onChange }) {
  const C = window.SB.C;
  return (
    <button onClick={() => onChange && onChange(!checked)} className="md-interactive"
    style={{ position: 'relative', width: 52, height: 32, borderRadius: 9999, border: `2px solid ${checked ? C('primary') : C('outline')}`,
      background: checked ? C('primary') : C('surface-container-highest'), cursor: 'pointer', flex: '0 0 auto', transition: 'all .2s', padding: 0 }}>
      <span style={{ position: 'absolute', top: '50%', left: checked ? 'calc(100% - 13px)' : 9, transform: 'translate(-50%,-50%)',
        width: checked ? 24 : 16, height: checked ? 24 : 16, borderRadius: '50%',
        background: checked ? C('on-primary') : C('outline'), transition: 'all .2s var(--md-sys-motion-easing-emphasized)' }} />
    </button>);

}

/* ===================== STAR 도메인 별 상세 ===================== */
function HonestyMeter({ label, sub, value, color }) {
  const C = window.SB.C;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="md-label-large" style={{ color: C('on-surface') }}>{label}</span>
        <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{value}%</span>
      </div>
      <ProgressLinear value={value} color={color} />
      <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 5, wordBreak: 'keep-all' }}>{sub}</div>
    </div>);

}

/* ---- cosmic backdrop shared by the 7-star detail screen (matches the AI 뮤지엄 sky) ---- */
const STAR_BG = window.SB_DATA.domainMeta.starBg; // → data/screens/domain-meta.json

const CosmicStars = React.memo(function CosmicStars() {
  const stars = React.useMemo(() => {
    let s = 7321;const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: 56 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: 0.5 + rnd() * 1.5, o: 0.18 + rnd() * 0.62, d: 3 + rnd() * 4.5, delay: rnd() * 5 }));
  }, []);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {stars.map((st, i) =>
      <span key={i} className="sc-tw" style={{ position: 'absolute', left: `${st.x}%`, top: `${st.y}%`, width: st.r * 2, height: st.r * 2,
        borderRadius: '50%', background: '#dde9ff', opacity: st.o, boxShadow: '0 0 4px rgba(200,220,255,.75)', '--d': `${st.d}s`, animationDelay: `${st.delay}s` }} />
      )}
    </div>);
});

/* ===================== 재정 전용 렌즈: 돈이 비추는 마음 ===================== */
function FinanceLens({ C }) {
  const budget = window.SB_DATA.starLenses.financeLens.budget,spent = window.SB_DATA.starLenses.financeLens.spent; // 이번 달 예산 대비 지출 → data/screens/star-lenses.json
  const pct = Math.round(spent / budget * 100);
  const won = (n) => '₩' + n.toLocaleString('ko-KR');
  const cats = window.SB_DATA.starLenses.financeLens.cats; // → data/screens/star-lenses.json

  const flow = window.SB_DATA.starLenses.financeLens.flow; // → data/screens/star-lenses.json

  const saveRate = window.SB_DATA.starLenses.financeLens.saveRate; // → data/screens/star-lenses.json
  return (
    <React.Fragment>
      {/* ── 1. 이번 달 지출 vs 예산 (돈이 먼저) ── */}
      <SectionLabel>이번 달 가계</SectionLabel>
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 24, fontWeight: 700, color: C('on-surface') }}>{won(spent)}</span>
          <span className="md-body-small" style={{ color: C('on-surface-variant') }}>예산 {won(budget)}</span>
        </div>
        <ProgressLinear value={pct} color={pct > 90 ? C('error') : C('primary')} height={10} />
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8 }}>
          예산의 <b style={{ color: C('on-surface') }}>{pct}%</b> 사용 · 남은 예산 {won(budget - spent)}
        </div>
        {/* 카테고리별 */}
        <div style={{ display: 'flex', height: 14, borderRadius: 9999, overflow: 'hidden', gap: 2, marginTop: 16 }}>
          {cats.map((c) => <div key={c.k} style={{ width: `${c.pct}%`, background: c.color }} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {cats.map((c) =>
          <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flex: '0 0 auto' }} />
              <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>{c.k}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('on-surface') }}>{won(c.amt)}</span>
            </div>
          )}
        </div>
      </MdCard>

      {/* ── 2. 수입·저축 흐름 ── */}
      <SectionLabel>현금 흐름 · 저축</SectionLabel>
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="md-label-small" style={{ color: C('on-surface-variant') }}>이번 달 저축률</div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 22, fontWeight: 700, color: C('primary') }}>{saveRate}%</div>
          </div>
          <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
            <div className="md-label-small" style={{ color: C('on-surface-variant') }}>목표</div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 14, color: C('on-surface-variant') }}>25%</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {flow.map((f, i) => {
            const col = f.kind === 'in' ? C('primary') : f.kind === 'save' ? C('tertiary') : C('on-surface');
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 12, background: C('surface-container-highest') }}>
                <Icon name={f.kind === 'in' ? 'trending_up' : f.kind === 'save' ? 'savings' : 'payments'} size={16} style={{ color: col, flex: '0 0 auto' }} />
                <span className="md-body-medium" style={{ color: C('on-surface'), flex: 1, minWidth: 0 }}>{f.t}</span>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13, fontWeight: 600, color: col, flex: '0 0 auto' }}>
                  {f.amt > 0 ? '+' : ''}{won(Math.abs(f.amt) * (f.amt < 0 ? -1 : 1)).replace('₩-', '-₩')}
                </span>
              </div>);

          })}
        </div>
      </MdCard>

      {/* ── 3. 보조 레이어: 돈이 비추는 마음 (작게) ── */}
      <SectionLabel>돈이 비추는 마음</SectionLabel>
      <MdCard variant="filled" style={{ background: C('surface-container-high'), padding: 14 }}>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginBottom: 10, wordBreak: 'keep-all' }}>
          숫자 너머의 결도 함께 봐요. 큰 지출엔 <b style={{ color: C('on-surface') }}>‘불안’</b>의 언어가 자주 따라왔어요.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {window.SB_DATA.starLenses.financeLens.emotionChips.map((s) => // → data/screens/star-lenses.json
          <span key={s.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            padding: '4px 10px', borderRadius: 9999, background: `${s.c}1f`, color: s.c }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.c }} />{s.k} {s.pct}%
            </span>
          )}
        </div>
      </MdCard>
    </React.Fragment>);

}

/* ===================== 관계 전용 렌즈: 인물 맵 ===================== */
/* 위키 노드 그래프와 동일한 엔진·시각 언어로 그린다 (sb-relgraph.jsx) */
function RelationLens({ C, go }) {
  return window.RelationGraph ? <window.RelationGraph C={C} go={go} /> : null;
}

/* ===================== 커리어 전용 렌즈: 쌓아온 길 ===================== */
function CareerLens({ C }) {
  // 이력서/CV 전체 타임라인 — 학력·병역·수상·자격·경력을 한 줄기로.
  // 탭(공통/메인/개인)으로 관점을 바꾸고, 경력 노드는 프로젝트를 메인·개인 하위 트리로 구분한다.
  const KIND = window.SB_DATA.starLenses.careerLens.kind; // → data/screens/star-lenses.json

  // 트랙: 경력 하위 프로젝트와 비-경력 항목을 '메인(회사 업무)·개인(사이드)'으로 나눈다.
  const TRACK = window.SB_DATA.starLenses.careerLens.track; // → data/screens/star-lenses.json
  const TRACK_ORDER = window.SB_DATA.starLenses.careerLens.trackOrder; // → data/screens/star-lenses.json

  const TABS = window.SB_DATA.starLenses.careerLens.tabs; // → data/screens/star-lenses.json

  // track: 비-경력 항목의 소속(공통 탭은 전부, 메인/개인 탭은 해당 트랙만). 경력은 projects 트랙으로 판단.
  const ITEMS = window.SB_DATA.starLenses.careerLens.items; // → data/screens/star-lenses.json

  const [tab, setTab] = useSt('main');
  const [open, setOpen] = useSt('j3'); // 기본은 현재 경력 펼침

  // 탭에 맞는 프로젝트만 추리기(경력 노드 전용)
  const jobProjects = (it) => (it.projects || []).filter((p) => tab === 'common' || p.track === tab);
  // 항목이 현재 탭에 보이는가
  const visible = (it) => {
    if (tab === 'common') return true;
    if (it.kind === 'job') return jobProjects(it).length > 0;
    return it.track === tab;
  };
  const rows = ITEMS.filter(visible);

  return (
    <React.Fragment>
      <SectionLabel>쌓아온 길</SectionLabel>

      {/* 관점 탭 — 메인(개인 프로젝트 제외) / 사이드(개인 프로젝트) */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 24, background: C('surface-container-high'), marginBottom: 10 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className="md-interactive"
              style={{ position: 'relative', flex: 1, padding: '8px 0', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: on ? C('secondary-container') : 'transparent', color: on ? C('on-secondary-container') : C('on-surface-variant'),
                fontWeight: on ? 700 : 600, fontSize: 13, fontFamily: 'inherit' }}>
              <span className="md-state" />{t.label}
            </button>);
        })}
      </div>

      {/* 범례 — 마커 색 안내 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {Object.keys(KIND).map((kk) => {
          const k = KIND[kk];
          return (
            <span key={kk} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px 3px 6px', borderRadius: 20, whiteSpace: 'nowrap',
              background: k.color + '1f', color: k.color }}>
              <Icon name={k.icon} size={13} style={{ color: k.color }} />{k.label}
            </span>);
        })}
      </div>

      <MdCard variant="outlined" style={{ padding: 14 }}>
        {rows.map((it, i) => {
          const k = KIND[it.kind];
          const isJob = it.kind === 'job';
          const detailRows = isJob ? jobProjects(it) : (it.details || []);
          const hasDetail = detailRows.length > 0;
          const isOpen = open === it.id, last = i === rows.length - 1;
          const RowTag = hasDetail ? 'button' : 'div';
          return (
            <div key={it.id} style={{ display: 'flex', gap: 12 }}>
              {/* 타임라인 마커(종류별 아이콘) + 연결선 */}
              <div style={{ flex: '0 0 auto', width: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginTop: 2, width: 24, height: 24, borderRadius: '50%', flex: '0 0 auto', zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: it.now ? k.color : k.color + '22', border: it.now ? 'none' : `1.5px solid ${k.color}66`,
                  boxShadow: it.now ? `0 0 0 4px ${k.color}33` : 'none' }}>
                  <Icon name={k.icon} size={14} style={{ color: it.now ? '#06121f' : k.color }} />
                </div>
                {!last && <div style={{ flex: 1, width: 2, marginTop: 4, background: C('outline-variant') }} />}
              </div>

              {/* 노드 */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 14 }}>
                <RowTag type={hasDetail ? 'button' : undefined} onClick={hasDetail ? () => setOpen(isOpen ? null : it.id) : undefined}
                  className={hasDetail ? 'md-interactive' : undefined}
                  style={{ position: 'relative', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: hasDetail ? 'pointer' : 'default', padding: '2px 2px 2px 0', borderRadius: 10, display: 'block' }}
                  aria-expanded={hasDetail ? isOpen : undefined}>
                  {hasDetail && <span className="md-state" />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: it.now ? k.color : C('on-surface-variant') }}>{it.period}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
                      background: k.color + '24', color: k.color }}>{it.chip}</span>
                    <span style={{ flex: 1 }} />
                    {hasDetail && <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />}
                  </div>
                  <div className="md-body-large" style={{ color: C('on-surface'), fontWeight: 700, marginTop: 3, wordBreak: 'keep-all' }}>{it.title}</div>
                  <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 1, wordBreak: 'keep-all' }}>{it.sub}</div>
                </RowTag>

                {/* 하위 내용 */}
                {hasDetail && isOpen && (isJob
                  ? (/* 경력: 메인·개인 하위 트리 */
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {TRACK_ORDER.map((tk) => {
                        if (tab !== 'common' && tab !== tk) return null;
                        const ps = (it.projects || []).filter((p) => p.track === tk);
                        if (!ps.length) return null;
                        const t = TRACK[tk];
                        return (
                          <div key={tk}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 2, background: t.color, flex: '0 0 auto' }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: t.color }}>{t.label}</span>
                              <span style={{ fontSize: 11, color: C('on-surface-variant') }}>{ps.length}</span>
                            </div>
                            <div style={{ marginLeft: 3, paddingLeft: 12, borderLeft: `1.5px solid ${t.color}40`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {ps.map((p, di) =>
                                <div key={di} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto', marginTop: 6, background: t.color }} />
                                  <div style={{ minWidth: 0 }}>
                                    <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{p.name}</div>
                                    {p.note && <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{p.note}</div>}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>);
                      })}
                    </div>)
                  : (/* 비-경력: 단순 목록 */
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 2 }}>
                      {it.details.map((p, di) =>
                        <div key={di} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto', marginTop: 6, background: k.color }} />
                          <div style={{ minWidth: 0 }}>
                            <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{p.name}</div>
                            {p.note && <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{p.note}</div>}
                          </div>
                        </div>
                      )}
                    </div>))}
              </div>
            </div>);
        })}
      </MdCard>
    </React.Fragment>);

}

/* 건강 전용 렌즈 — sb-health.jsx 로 분리 (window.SB.HealthLens) */

/* ===================== 성장 전용 렌즈: 인생의 장 ===================== */
function GrowthLens({ C, go }) {
  // 사용자 생년월일(1996-04-12) 기준 — 나이를 먹으면 10년 단위 '장'이 자동으로 늘어난다.
  const BIRTH = new Date(window.SB_DATA.starLenses.growthLens.birth); // → data/screens/star-lenses.json
  const BORN = BIRTH.getFullYear();
  const now = new Date();
  let age = now.getFullYear() - BORN;
  const mo = now.getMonth() - BIRTH.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < BIRTH.getDate())) age--;
  const curDec = Math.floor(age / 10); // 30세 → 3 (30대)

  // 분류별 진행도(%) — 담긴 별가루로 그 시기가 얼마나 채워졌나(예시값)
  const FILL = window.SB_DATA.starLenses.growthLens.fill; // → data/screens/star-lenses.json
  const SUB_HINT = window.SB_DATA.starLenses.growthLens.subHint; // → data/screens/star-lenses.json

  const decLabel = (d) => d === 0 ? '유년기' : `${d * 10}대`;
  const decAges = (d) => d === 0 ? '0–9세' : d === curDec ? `${d * 10}세~` : `${d * 10}–${d * 10 + 9}세`;
  const decYears = (d) => {
    const ys = BORN + d * 10;
    return d === curDec ? `${ys}–` : `${ys}–${ys + 9}`;
  };
  const subs = window.SB_DATA.starLenses.growthLens.subs; // → data/screens/star-lenses.json

  const decades = [];
  for (let d = 0; d <= 9; d++) decades.push(d); // 유년기~90대

  const [open, setOpen] = useSt(curDec); // 기본은 현재 '장' 펼침

  const drill = (d, s) => {
    const dl = decLabel(d);
    const rng = `${d * 10 + s.span[0]}–${d * 10 + s.span[1]}세`;
    // 'chat'은 루트라 param이 초기화됨 → 전역으로 시드를 전달하면 ChatScreen이 마운트 시 소비한다
    window.__sbPendingSeed = {
      mode: 'meta',
      title: `${dl} ${s.k} 돌아보기`,
      intro: `${dl} ${s.k}(만 ${rng}) 무렵으로 같이 들어가 볼까요? 그때 가장 자주 떠오르는 장면이나 사람을 하나만 들려주세요. 거기서부터 그 시절의 당신을 천천히 풀어가 볼게요.` };
    go('chat');
  };

  return (
    <React.Fragment>
      {/* 생년 + 나이 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Icon name="auto_stories" size={16} style={{ color: C('on-surface-variant') }} />
        <span className="md-label-large" style={{ color: C('on-surface') }}>{BORN}년생</span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: C('outline') }} />
        <span className="md-label-large" style={{ color: C('on-surface') }}>만 {age}세</span>
      </div>

      <MdCard variant="outlined" style={{ padding: 14 }}>
        {decades.map((d, i) => {
          const isOpen = open === d, isCur = d === curDec, isFuture = d > curDec, pct = FILL[d] || 0;
          return (
            <div key={d} style={{ display: 'flex', gap: 12 }}>
              {/* 타임라인 마커 + 연결선 */}
              <div style={{ flex: '0 0 auto', width: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginTop: 5, width: isCur ? 13 : 10, height: isCur ? 13 : 10, borderRadius: '50%', flex: '0 0 auto', zIndex: 1,
                background: isCur ? C('primary') : 'transparent', border: isCur ? 'none' : `2px ${isFuture ? 'dashed' : 'solid'} ${C(isFuture ? 'outline-variant' : 'outline')}`,
                boxShadow: isCur ? `0 0 0 4px ${C('primary')}33` : 'none' }} />
                {i !== decades.length - 1 && <div style={{ flex: 1, width: 2, marginTop: 4, background: C('outline-variant') }} />}
              </div>

              {/* 분류(장) 노드 */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: i !== decades.length - 1 ? 14 : 0 }}>
                <button onClick={() => setOpen(isOpen ? -1 : d)} className="md-interactive"
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="md-title-small" style={{ color: isCur ? C('primary') : isFuture ? C('on-surface-variant') : C('on-surface'), fontWeight: 700 }}>{decLabel(d)}</span>
                    <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{decAges(d)} · {decYears(d)}</span>
                    <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={18} style={{ marginLeft: 'auto', color: C('on-surface-variant') }} />
                  </div>
                  {/* 분류별 진행도 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
                    <div style={{ flex: 1 }}><ProgressLinear value={pct} color={isCur ? C('primary') : C('tertiary')} /></div>
                    <span className="md-label-small" style={{ color: C('on-surface-variant'), fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                  </div>
                </button>

                {/* 하위 트리: 초반 · 중반 · 후반 → 메타비 drill-down */}
                {isOpen &&
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {subs.map((s, si) => {
                    const lo = d * 10 + s.span[0], hi = d * 10 + s.span[1];
                    const future = lo > age;
                    const hint = (SUB_HINT[d] && SUB_HINT[d][si]) || '';
                    return (
                      <button key={s.k} disabled={future} onClick={() => !future && drill(d, s)}
                      className={future ? '' : 'md-interactive'}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, width: '100%', textAlign: 'left',
                        background: future ? 'transparent' : C('surface-container-high'),
                        border: future ? `1px dashed ${C('outline-variant')}` : 'none',
                        cursor: future ? 'default' : 'pointer', opacity: future ? 0.5 : 1 }}>
                        <span style={{ flex: '0 0 auto', width: 6, height: 6, borderRadius: '50%', background: future ? C('outline') : C('primary') }} />
                        <span className="md-label-large" style={{ color: C('on-surface'), flex: '0 0 auto' }}>{s.k}</span>
                        <span className="md-body-small" style={{ color: C('on-surface-variant'), flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {future ? '아직 오지 않은 시간' : `만 ${lo}–${hi}세${hint ? ' · ' + hint : ''}`}
                        </span>
                        {future ?
                        <Icon name="lock" size={15} style={{ color: C('outline'), flex: '0 0 auto' }} /> :
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
                            <span className="md-label-small" style={{ color: C('primary'), fontWeight: 700 }}>메타비</span>
                            <Icon name="chevron_right" size={16} style={{ color: C('primary') }} />
                          </span>}
                      </button>);

                  })}
                </div>}
              </div>
            </div>);

        })}
      </MdCard>

    </React.Fragment>);

}

/* ===================== 휴식 전용 렌즈: 휴식 지도 · 타임랩스 =====================
   x:혼자(0)~함께(1) · y:비움(0)~채움(1) · fw:빈도 가중 · joy:0~100.
   각 활동은 [기록 시작 → 지금] 두 키프레임을 t(0~1)로 보간한다 — 재생/스크럽하면
   넷플릭스가 커지며 '누수'로 변하는 과정을 눈으로 볼 수 있다. (attached rest-map v3 포팅) */
function LeisureSpark({ hist, color, dot }) {
  const W = 280,H = 46,pad = 5,n = hist.length,min = Math.min(...hist) - 6,max = Math.max(...hist) + 6;
  const px = (i) => pad + i * ((W - 2 * pad) / (n - 1));
  const py = (v) => H - pad - (v - min) / (max - min) * (H - 2 * pad);
  let d = '';
  hist.forEach((v, i) => {d += (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1) + ' ';});
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 46 }}>
      <path d={`${d}L${px(n - 1).toFixed(1)} ${H} L${px(0).toFixed(1)} ${H} Z`} fill={color} fillOpacity={0.14} />
      <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {hist.map((v, i) => <circle key={i} cx={px(i).toFixed(1)} cy={py(v).toFixed(1)} r={i === n - 1 ? 3.2 : 2} fill={i === n - 1 ? color : dot} stroke={color} strokeWidth={1.5} />)}
    </svg>);
}

function LeisureLens({ C }) {
  const LEAK = C('error'),ANCHOR = window.SB_DATA.starLenses.leisureLens.anchor; // → data/screens/star-lenses.json
  // s=기록 시작, e=지금 키프레임 [x, y, fw, joy]
  const acts = window.SB_DATA.starLenses.leisureLens.acts; // → data/screens/star-lenses.json


  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const stateAt = (a, t) => ({ x: lerp(a.s[0], a.e[0], t), y: lerp(a.s[1], a.e[1], t), fw: lerp(a.s[2], a.e[2], t), joy: lerp(a.s[3], a.e[3], t) });
  const pickLeak = (t) => {let id = null,sc = -1;acts.forEach((a) => {const st = stateAt(a, t);if (st.y < .5) {const s = st.fw * (100 - st.joy);if (s > sc) {sc = s;id = a.id;}}});return id;};
  const pickAnchor = (t) => {let id = null,sc = -1;acts.forEach((a) => {const st = stateAt(a, t);const s = st.joy + st.fw * 8;if (s > sc) {sc = s;id = a.id;}});return id;};

  // 기록 시작 = 8주 전 → 오늘
  const dates = React.useRef(null);
  if (!dates.current) {const today = new Date();today.setHours(9, 0, 0, 0);dates.current = { today, start: new Date(today.getTime() - 56 * 864e5) };}
  const fmtD = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const dateAt = (t) => new Date(dates.current.start.getTime() + t * (dates.current.today.getTime() - dates.current.start.getTime()));

  const wrapRef = React.useRef(null);
  const zRef = React.useRef(1);
  const offRef = React.useRef({ x: 0, y: 0 });
  const [, force] = useSt(0);
  const render = () => force((v) => v + 1);
  const [sel, setSel] = useSt(null);
  const [logJoy, setLogJoy] = useSt(50);

  // timelapse
  const tRef = React.useRef(1);
  const playRef = React.useRef(false);
  const rafRef = React.useRef(0);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const applyT = (t) => {tRef.current = Math.max(0, Math.min(1, t));render();};
  const stopPlay = () => {playRef.current = false;cancelAnimationFrame(rafRef.current);render();};
  const startPlay = () => {
    if (reduce) {applyT(1);return;}
    playRef.current = true;
    const dur = 6500,t0 = performance.now(),base = tRef.current >= .999 ? 0 : tRef.current;
    if (tRef.current >= .999) tRef.current = 0;
    const step = (now) => {if (!playRef.current) return;const k = Math.min(1, (now - t0) / dur);applyT(base + (1 - base) * k);if (k < 1) rafRef.current = requestAnimationFrame(step);else stopPlay();};
    rafRef.current = requestAnimationFrame(step);
  };
  const tweenTo = (target) => {stopPlay();const from = tRef.current,t0 = performance.now();const step = (now) => {const k = Math.min(1, (now - t0) / 550);applyT(lerp(from, target, ease(k)));if (k < 1) rafRef.current = requestAnimationFrame(step);};rafRef.current = requestAnimationFrame(step);};
  useEf(() => () => cancelAnimationFrame(rafRef.current), []);

  const pts = React.useRef(new Map());
  const drag = React.useRef(null);
  const moved = React.useRef(false);
  const downAct = React.useRef(null);
  const pinch = React.useRef(null);
  const clampOff = (o, zz) => {const el = wrapRef.current;if (!el) return o;const w = el.clientWidth,h = el.clientHeight;return { x: Math.min(0, Math.max(w - w * zz, o.x)), y: Math.min(0, Math.max(h - h * zz, o.y)) };};
  const setView = (nz, no) => {zRef.current = nz;offRef.current = clampOff(no, nz);render();};
  const zoomAround = (cx, cy, nz) => {nz = Math.min(4, Math.max(1, nz));const z = zRef.current,o = offRef.current;const wx = (cx - o.x) / z,wy = (cy - o.y) / z;setView(nz, { x: cx - wx * nz, y: cy - wy * nz });};
  const reset = () => {zRef.current = 1;offRef.current = { x: 0, y: 0 };setSel(null);render();};
  const local = (e) => {const r = wrapRef.current.getBoundingClientRect();return { x: e.clientX - r.left, y: e.clientY - r.top };};
  const zCtr = (f) => {const el = wrapRef.current;zoomAround(el.clientWidth / 2, el.clientHeight / 2, zRef.current * f);};
  useEf(() => {
    const el = wrapRef.current;if (!el) return;
    const h = (e) => {e.preventDefault();const r = el.getBoundingClientRect();zoomAround(e.clientX - r.left, e.clientY - r.top, zRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15));};
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  const onDown = (e) => {
    const p = local(e);pts.current.set(e.pointerId, p);
    if (pts.current.size === 1) {moved.current = false;const hit = e.target.closest && e.target.closest('[data-act]');downAct.current = hit ? hit.dataset.act : null;drag.current = { x: p.x, y: p.y, ox: offRef.current.x, oy: offRef.current.y };} else
    if (pts.current.size === 2) {const [a, b] = [...pts.current.values()];pinch.current = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z: zRef.current };drag.current = null;moved.current = true;}
  };
  const onMove = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, local(e));
    if (pinch.current && pts.current.size >= 2) {const [a, b] = [...pts.current.values()];const d = Math.hypot(a.x - b.x, a.y - b.y);zoomAround((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.current.z * (d / pinch.current.d));} else
    if (drag.current) {const p = local(e);const dx = p.x - drag.current.x,dy = p.y - drag.current.y;if (Math.hypot(dx, dy) > 6) moved.current = true;offRef.current = clampOff({ x: drag.current.ox + dx, y: drag.current.oy + dy }, zRef.current);render();}
  };
  const onUp = (e) => {
    const size = pts.current.size;pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) {
      if (!moved.current && size === 1) {
        if (downAct.current) {const id = downAct.current;setSel((s) => s === id ? null : id);const a = acts.find((x) => x.id === id);if (a) setLogJoy(Math.round(stateAt(a, tRef.current).joy));} else
        setSel(null);
      }
      drag.current = null;
    }
  };

  const t = tRef.current,z = zRef.current,off = offRef.current;
  const leakId = pickLeak(t),anchorId = pickAnchor(t);
  const selAct = acts.find((a) => a.id === sel) || null;
  const selState = selAct ? stateAt(selAct, t) : null;
  const VP_H = 250;
  const ctrlBtn = { width: 32, height: 32, borderRadius: 9, border: `1px solid ${C('outline-variant')}`, background: C('surface-container'), color: C('on-surface'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, lineHeight: 1, fontWeight: 500, padding: 0 };
  const segBtn = (active) => ({ border: 'none', background: active ? C('primary') : 'transparent', color: active ? C('on-primary') : C('on-surface-variant'), fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 7, cursor: 'pointer' });

  return (
    <MdCard variant="outlined" style={{ padding: 16 }}>
      {/* header · 빠른 시점 전환 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="bubble_chart" size={16} style={{ color: C('primary') }} />
        <span className="md-label-large" style={{ color: C('on-surface') }}>휴식 지도</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', background: C('surface-container'), border: `1px solid ${C('outline-variant')}`, borderRadius: 9, padding: 2, gap: 2 }}>
          <button type="button" onClick={() => tweenTo(.5)} style={segBtn(Math.abs(t - .5) < 1e-3)}>4주 전</button>
          <button type="button" onClick={() => tweenTo(1)} style={segBtn(Math.abs(t - 1) < 1e-3)}>지금</button>
        </div>
      </div>

      {/* plot */}
      <div ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ position: 'relative', width: '100%', height: VP_H, borderRadius: 12, background: C('surface-container-highest'), overflow: 'hidden', touchAction: 'none', cursor: drag.current && moved.current ? 'grabbing' : 'grab' }}>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${off.x}px,${off.y}px) scale(${z})`, willChange: 'transform' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: C('outline-variant') }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: C('outline-variant') }} />
          {acts.map((a) => {
            const st = stateAt(a, t),on = a.id === sel,filled = st.y >= .5,dia = Math.round(16 + st.fw * 20);
            const isLeak = a.id === leakId,isAnchor = a.id === anchorId,ring = isLeak ? LEAK : isAnchor ? ANCHOR : null;
            return (
              <button key={a.id} data-act={a.id} type="button"
              style={{ position: 'absolute', left: `${st.x * 100}%`, top: `${(1 - st.y) * 100}%`, transform: `translate(-50%,-50%) scale(${1 / z})`, transformOrigin: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, justifyContent: 'center', minWidth: 44, minHeight: 44, padding: 6, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                {ring &&
                <span style={{ position: 'absolute', bottom: `calc(50% + ${dia / 2 + 8}px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', color: ring, textShadow: `0 1px 3px ${C('surface-container-highest')}` }}>{isLeak ? '⚠ 누수' : '★ 앵커'}</span>}
                <span style={{ position: 'relative', width: dia, height: dia, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ring && <span style={{ position: 'absolute', width: dia + 12, height: dia + 12, borderRadius: '50%', border: `2px solid ${ring}`, boxSizing: 'border-box' }} />}
                  <span style={{ width: dia, height: dia, borderRadius: '50%', boxSizing: 'border-box', background: filled ? C('primary') : 'transparent', border: filled ? 'none' : `2px solid ${C('primary')}`, boxShadow: on ? `0 0 0 4px color-mix(in srgb, ${C('primary')} 28%, transparent), 0 0 12px ${C('primary')}` : filled ? `0 0 8px ${C('primary')}` : 'none' }} />
                </span>
                <span style={{ fontSize: 11, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap', color: on ? C('primary') : C('on-surface'), textShadow: `0 1px 3px ${C('surface-container-highest')}` }}>{a.nm}</span>
              </button>);

          })}
        </div>
        {window.SB_DATA.starLenses.leisureLens.axisLabels /* → data/screens/star-lenses.json */.map(([tx, s]) =>
        <span key={tx} style={{ position: 'absolute', fontSize: 11, fontWeight: 600, color: C('on-surface-variant'), pointerEvents: 'none', ...s }}>{tx}</span>)}
        <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" onClick={() => zCtr(1.4)} style={ctrlBtn}>+</button>
          <button type="button" onClick={() => zCtr(1 / 1.4)} style={ctrlBtn}>−</button>
          <button type="button" onClick={reset} style={{ ...ctrlBtn, fontSize: 15 }}>⟲</button>
        </div>
      </div>

      {/* timelapse controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button type="button" onClick={() => playRef.current ? stopPlay() : startPlay()} aria-label="타임랩스 재생"
        style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', border: 'none', background: C('primary'), color: C('on-primary'), cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: playRef.current ? 0 : 2 }}>{playRef.current ? '⏸' : '▶'}</button>
        <input type="range" min="0" max="1000" value={Math.round(t * 1000)} aria-label="기록 시작부터 현재까지"
        onChange={(ev) => {stopPlay();applyT(+ev.target.value / 1000);}}
        style={{ flex: 1, accentColor: C('primary'), cursor: 'pointer' }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C('primary'), whiteSpace: 'nowrap', minWidth: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtD(dateAt(t))}</span>
      </div>

      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', marginTop: 8, fontSize: 11, color: C('on-surface-variant') }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>크기 = 빈도
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C('primary') }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: C('primary') }} />
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: C('primary') }} /></span></span>
        <span style={{ color: LEAK, fontWeight: 700 }}>⚠ 누수</span>
        <span style={{ color: ANCHOR, fontWeight: 700 }}>★ 앵커</span>
        <span>· 자동 표시</span>
      </div>
      <div style={{ fontSize: 11, color: C('outline'), marginTop: 6 }}>기록 시작 · {fmtD(dates.current.start)} → 오늘 {fmtD(dates.current.today)}</div>

      {/* per-node detail */}
      <div style={{ overflow: 'hidden', transition: 'max-height .28s ease, opacity .2s ease, margin-top .2s ease', maxHeight: selAct ? 380 : 0, opacity: selAct ? 1 : 0, marginTop: selAct ? 12 : 0 }}>
        {selAct &&
        <div style={{ borderRadius: 12, background: C('surface-container'), padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: selAct.id === anchorId ? ANCHOR : selAct.id === leakId ? LEAK : C('primary') }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: C('on-surface') }}>{selAct.nm}</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setSel(null)} style={{ border: 'none', background: 'transparent', color: C('on-surface-variant'), cursor: 'pointer', display: 'flex', padding: 2, fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
              {[selState.y >= .5 ? '채움' : '비움', selState.x >= .5 ? '함께' : '혼자', selAct.freq].map((c, i) =>
            <span key={i} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: i === 0 ? C('secondary-container') : C('surface-container-highest'), color: i === 0 ? C('on-secondary-container') : C('on-surface-variant') }}>{c}</span>)}
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all' }}>{selAct.note}</div>
            {/* 기쁨 추세 */}
            <div style={{ background: C('surface-container-highest'), borderRadius: 12, padding: '11px 12px', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C('on-surface-variant') }}>기쁨 추세 · 최근 6회</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: C('primary') }}>{Math.round(selState.joy)}</span>
              </div>
              <LeisureSpark hist={selAct.hist} color={C('primary')} dot={C('surface-container-highest')} />
            </div>
            {/* 지금 기쁨 기록 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C('on-surface-variant'), whiteSpace: 'nowrap' }}>지금 기쁨 기록</span>
              <input type="range" min="0" max="100" value={logJoy} onChange={(ev) => setLogJoy(+ev.target.value)} style={{ flex: 1, accentColor: C('primary'), cursor: 'pointer' }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: C('primary'), width: 28, textAlign: 'right' }}>{logJoy}</span>
            </div>
          </div>}
      </div>

      {/* 추천 · 함께 채우기 */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C('outline-variant')}` }}>
        <div className="md-label-medium" style={{ color: C('on-surface'), marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="auto_awesome" size={15} style={{ color: C('primary') }} />추천 · 함께 채우기
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {window.SB_DATA.starLenses.leisureLens.recChips /* → data/screens/star-lenses.json */.map(([h, why]) =>
          <span key={h} style={{ fontSize: 12.5, fontWeight: 600, color: C('on-secondary-container'), padding: '6px 12px', borderRadius: 9999, background: C('secondary-container') }}>{h} <span style={{ color: C('on-surface-variant'), fontWeight: 500 }}>· {why}</span></span>)}
        </div>
      </div>
    </MdCard>);

}

/* ===================== 담아내기 전용 렌즈: 정리 대기 큐 ===================== */
function CatchallLens({ C, go }) {
  const queue = window.SB_DATA.starLenses.catchallLens.queue; // → data/screens/star-lenses.json

  return (
    <React.Fragment>
      <SectionLabel>정리 대기 · 8</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {queue.map((q, i) =>
        <MdCard key={i} variant="outlined" style={{ padding: 14 }}>
            <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{q.txt}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span className="md-label-small" style={{ color: C('on-surface-variant') }}>제안</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 9999, background: C('secondary-container'), color: C('on-secondary-container') }}>
                <Icon name="star_shine" size={12} />{q.to}
              </span>
              <span style={{ flex: 1 }} />
              <MdButton variant="tonal" size="s" icon="check" onClick={() => {}}>보내기</MdButton>
              <MdButton variant="text" size="s" onClick={() => {}}>보류</MdButton>
            </div>
          </MdCard>
        )}
      </div>
      <MdButton variant="text" icon="inventory_2" style={{ marginTop: 12 }} onClick={() => go('records')}>위키에서 전체 보기</MdButton>
    </React.Fragment>);

}

/* 세컨비 한 줄 해석 — 별마다 데이터에 기반한 풀이(강조 포함)를 상단 글래스 스트립에서 말함.
   7개 별 모두 같은 역할: 짧은 메타 문장이 아니라 그 도메인을 읽어 주는 한 마디. */
function starInsight(id, C, meta) {
  const W = { color: '#FFFFFF' },P = { color: C('primary') };
  switch (id) {
    case 'career':return <React.Fragment>최근 3주 기록의 <b style={P}>64%</b>가 일이었어요. <b style={W}>몰입</b>은 깊은데 <b style={W}>회복 신호</b>가 적어, 번아웃 전에 쉼을 끼워 넣는 게 좋겠어요.</React.Fragment>;
    case 'finance':return <React.Fragment>이번 달 예산의 <b style={W}>68%</b>를 썼어요. 고정지출은 안정적인데 <b style={W}>여가 지출</b>이 지난달보다 <b style={P}>22% 늘었어요</b>. 한 줄씩 담으면 더 또렷해져요.</React.Fragment>;
    case 'growth':return <React.Fragment><b style={W}>청년기의 전환점</b>들이 지금의 <b style={P}>호기심</b>을 잘 설명해요. 회상을 몇 개 더 담으면 성장 곡선이 또렷해져요.</React.Fragment>;
    case 'relation':return <React.Fragment><b style={W}>가까운 사람</b>에게 <b style={P}>먼저 다가가는</b> 패턴이 또렷해지고 있어요. 다만 연결이 <b style={W}>소수에 집중</b>돼 있어, 느슨한 관계도 가끔 살펴보면 좋아요.</React.Fragment>;
    case 'health':return <React.Fragment>어젯밤 <b style={W}>수면이 짧았고</b>(6h40m) <b style={W}>HRV</b>도 조금 떨어졌어요. 며칠 잠이 부족했으니, 오늘은 <b style={P}>30분 일찍</b> 자보는 건 어때요?</React.Fragment>;
    case 'leisure':return <React.Fragment>채워주는 쉼은 <b style={P}>친구 수다·게임</b>이에요. 반대로 <b style={W}>넷플릭스</b>는 거의 매일인데 비우는 쪽이라 — 여기가 <b style={{ color: C('error') }}>에너지 누수</b>예요. <b style={W}>함께</b> 채우는 시간을 조금 늘리면 회복이 더 깊어져요.</React.Fragment>;
    case 'catchall':return <React.Fragment>아직 어느 별에도 닿지 못한 <b style={W}>별가루 8개</b>가 떠 있어요. 하나씩 <b style={P}>제자리</b>로 보내면 다른 별들이 함께 밝아져요.</React.Fragment>;
    default:return (meta || DOMAIN_META.career).insight;
  }
}

/* 별빛 게이지 — 상단바 우측(뒤로가기+제목과 같은 줄)에 놓인다. 모든 별 공통. */
function StarGauge({ level = 1, related, C }) {
  const cc = C || window.SB.C;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {related && <span className="md-label-small" style={{ color: cc('on-surface-variant'), whiteSpace: 'nowrap', maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis' }}>{related}</span>}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((i) =>
        <span key={i} style={{ width: 11, height: 4, borderRadius: 2, background: i <= level ? '#5FD4FF' : 'rgba(127,178,255,.2)', boxShadow: i <= level ? '0 0 6px rgba(95,212,255,.7)' : 'none' }} />
        )}
      </span>
      <span className="md-label-small" style={{ color: cc('on-surface-variant'), whiteSpace: 'nowrap' }}>L{level}</span>
    </div>);
}
window.SB = window.SB || {};
window.SB.StarGauge = StarGauge;

function StarScreen({ t, go, param, onBack }) {
  const C = window.SB.C;
  const star = param && param.domain ? param : window.SB.STARS[1];
  const meta = DOMAIN_META[star.id] || DOMAIN_META.career;
  const [loading, setLoading] = useSt(true);
  useEf(() => {setLoading(true);const id = setTimeout(() => setLoading(false), 720);return () => clearTimeout(id);}, [star.id]);

  // full-bleed cosmic shell — same sky language as the AI 뮤지엄 (배경·제목·뒤로가기는 앱 셸이 띄움)
  const shell = (children, center) =>
  <div className="star-cosmic" style={{ position: 'relative', height: '100%', overflow: 'hidden', background: STAR_BG }}>
      <style>{`
        .star-cosmic .md-card{background:rgba(12,19,38,.55)!important;border:1px solid rgba(127,178,255,.16)!important;border-radius:18px!important;box-shadow:0 10px 34px rgba(0,0,0,.34)!important;-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px)}
        @keyframes sc-tw{0%,100%{opacity:.22}50%{opacity:.95}}
        @media (prefers-reduced-motion: no-preference){.star-cosmic .sc-tw{animation:sc-tw var(--d,4s) ease-in-out infinite}}
      `}</style>
      <CosmicStars />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', boxSizing: 'border-box', paddingTop: 92, overflowY: 'auto',
      display: center ? 'grid' : 'block', placeItems: center ? 'center' : undefined }}>
        {children}
      </div>
    </div>;

  if (loading) return shell(<LoadingState label={`${star.domain} 별을 살피는 중`} sub="관련 별가루을 모아 이 별의 밝기를 다시 계산하고 있어요." />, true);

  const ds = t.dataState || '채움';
  if (ds === '오류') return shell(<ErrorState title={`${star.domain} 별을 불러오지 못했어요`} body="네트워크가 불안정해요. 잠시 후 다시 시도해 주세요." onRetry={() => {}} />, true);
  if (ds === '빈') return shell(<EmptyState icon="bubble_chart" title={`아직 ${star.domain} 별이 어두워요`} body="이 별과 연관된 별가루을 담으면 별빛이 차오르고 추정이 시작돼요." cta="담으러 가기" onCta={() => go('capture')} />, true);

  return shell(
    <div style={{ padding: '0 16px 24px' }}>
      {ds === '오프라인' && <div style={{ paddingBottom: 6 }}><OfflineBanner /></div>}

      {/* 세컨비 한 줄 해석 — 카드 대신 떠 있는 글래스 스트립 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 16,
        background: 'rgba(70,120,210,.14)', border: '1px solid rgba(127,178,255,.2)' }}>
        <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
        <div className="md-body-medium" style={{ color: '#E7EEFB', wordBreak: 'keep-all' }}>{starInsight(star.id, C, meta)}</div>
      </div>

      {/* 채워 넣기(도메인 전용 조사 프레임) · 세컨비와 대화 — 말풍선 아래 */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 14px' }}>
        <MdButton variant="filled" icon="edit_note" style={{ flex: 1 }} onClick={() => go(star.id === 'relation' ? 'relcontacts' : star.id === 'leisure' ? 'hobbyinput' : star.id === 'health' ? 'healthinput' : star.id === 'career' ? 'careerinput' : 'lifeinput', star.id === 'relation' ? { mode: 'fill', star } : star)}>{star.id === 'career' ? '성과 입력' : '채워 넣기'}</MdButton>
        <MdButton variant="outlined" icon="bubble_chart" style={{ flex: 1 }} onClick={() => star.id === 'relation' ? go('relcontacts', { mode: 'chat', star }) : star.id === 'career' ? go('drilldown', star) : go('chat')}>{star.id === 'career' ? 'Drill Down' : '세컨비와 대화'}</MdButton>
      </div>

      {/* 도메인 전용 뷰 (재정=가계, 관계=인물 맵, 휴식=쉼의 지도 …) */}
      {star.id === 'finance' && <FinanceLens C={C} />}
      {star.id === 'relation' && <RelationLens C={C} go={go} />}
      {star.id === 'career' && <CareerLens C={C} />}
      {star.id === 'health' && window.SB.HealthLens && React.createElement(window.SB.HealthLens, { C })}
      {star.id === 'growth' && <GrowthLens C={C} go={go} />}
      {star.id === 'leisure' && <LeisureLens C={C} />}
      {star.id === 'catchall' && <CatchallLens C={C} go={go} />}
    </div>);

}

/* ===================== IDEN 포터블 정체성 ===================== */
function IdenScreen({ t, go }) {
  const C = window.SB.C;
  const [fmt, setFmt] = useSt('Markdown');
  const [incl, setIncl] = useSt({ northstar: true, bigfive: true, domains: true, raw: false });
  const [rawWarn, setRawWarn] = useSt(false);
  const targets = window.SB_DATA.starLenses.idenScreen.targets; // → data/screens/star-lenses.json

  const rows = window.SB_DATA.starLenses.idenScreen.rows; // → data/screens/star-lenses.json

  return (
    <ScreenPad>
      {/* file card */}
      <MdCard variant="elevated" style={{ padding: 0, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ padding: 18, background: C('tertiary-container'), textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 10px', display: 'grid', placeItems: 'center',
            background: C('surface'), boxShadow: 'var(--md-sys-elevation-level1)' }}>
            <Icon name="badge" fill size={30} style={{ color: C('on-tertiary-container') }} />
          </div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 18, color: C('on-tertiary-container') }}>simon.iden</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: C('surface'), color: C('on-surface-variant') }}>v2.1</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: C('primary'), color: C('on-primary') }}>
              <Icon name="lock" size={12} /> 서명됨
            </span>
          </div>
        </div>
      </MdCard>

      <SectionLabel>무엇을 담을까요</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {rows.map((row, i) =>
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
          borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <div style={{ flex: 1 }}>
              <div className="md-body-large" style={{ color: C('on-surface') }}>{row.label}</div>
              <div className="md-body-small" style={{ color: row.id === 'raw' ? C('error') : C('on-surface-variant') }}>{row.sub}</div>
            </div>
            <MdSwitch checked={incl[row.id]} onChange={(v) => {
            if (row.id === 'raw' && v) {setRawWarn(true);return;}
            setIncl((s) => ({ ...s, [row.id]: v }));
          }} />
          </div>
        )}
      </MdCard>

      <SectionLabel>형식</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        {window.SB_DATA.starLenses.idenScreen.formats /* → data/screens/star-lenses.json */.map((f) => <MdChip key={f} variant="filter" selected={fmt === f} onClick={() => setFmt(f)}>{f}</MdChip>)}
      </div>

      <SectionLabel>AI에 전달</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {targets.map((tg) =>
        <MdCard key={tg.k} variant="outlined" onClick={() => go('connect')} style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: tg.c, color: '#fff', fontWeight: 700, fontSize: 14 }}>{tg.k[0]}</span>
              <span className="md-body-medium" style={{ color: C('on-surface') }}>{tg.k}</span>
            </div>
          </MdCard>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        <MdButton variant="filled" icon="ios_share" full onClick={() => go('connect')}>내보내기</MdButton>
        <MdButton variant="outlined" icon="visibility" onClick={() => {}}>미리보기</MdButton>
      </div>
      <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <Icon name="lock" size={14} /> 내 기기에서 서명돼요. 원문은 동의 없이 나가지 않아요.
      </div>
      <ConfirmDialog open={rawWarn} danger confirmLabel="포함하기" cancelLabel="제외 유지"
      title="원문 기록까지 담을까요?"
      body="대화·메모 원문은 가장 민감한 정보예요. 받는 AI가 그대로 읽게 돼요. 꼭 필요할 때만 포함하세요."
      onConfirm={() => setIncl((s) => ({ ...s, raw: true }))}
      onClose={() => setRawWarn(false)} />
    </ScreenPad>);

}

/* ===================== CONNECT 데이터 연동 ===================== */
function ConnectScreen({ t, go }) {
  const C = window.SB.C;
  const [conn, setConn] = useSt({ cal: false, health: true, notion: false, photos: false, gpt: false });
  const sources = window.SB_DATA.starLenses.connectScreen.sources; // → data/screens/star-lenses.json

  const toggle = (id) => setConn((s) => ({ ...s, [id]: !s[id] }));
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>데이터 연동</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 14, wordBreak: 'keep-all' }}>
        연결하면 별이 더 빨리 밝아져요. 모든 처리는 기기 안에서 먼저 일어나요.
      </div>

      {/* consent block */}
      <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Icon name="lock" size={20} style={{ color: C('on-secondary-container'), flex: '0 0 auto' }} />
          <div className="md-body-small" style={{ color: C('on-secondary-container'), wordBreak: 'keep-all' }}>
            원문은 저장하지 않아요. 도출된 신호만 암호화해 남기고, 언제든 연결을 끊고 지울 수 있어요.
          </div>
        </div>
      </MdCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.map((s) => {
          const on = conn[s.id];
          return (
            <MdCard key={s.id} variant="outlined" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface-variant') }}>
                  <Icon name={s.icon} fill={on} size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="md-title-small" style={{ color: C('on-surface') }}>{s.k}</div>
                  <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{s.sub}</div>
                </div>
                <MdButton variant={on ? 'tonal' : 'filled'} size="s" icon={on ? 'check' : undefined} onClick={() => toggle(s.id)}>
                  {on ? '연결됨' : '연결'}
                </MdButton>
              </div>
            </MdCard>);

        })}
      </div>
    </ScreenPad>);

}

/* ===================== PLANS 요금제 ===================== */
function PlansScreen({ t, go }) {
  const C = window.SB.C;
  const tiers = window.SB_DATA.starLenses.plansScreen.tiers; // → data/screens/star-lenses.json

  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>요금제</div>
      {/* honesty note */}
      <MdCard variant="filled" style={{ background: C('tertiary-container'), padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Icon name="lock" size={20} style={{ color: C('on-tertiary-container'), flex: '0 0 auto' }} />
          <div className="md-body-small" style={{ color: C('on-tertiary-container'), wordBreak: 'keep-all' }}>
            요금은 횟수·보관·내보내기 <b>한도만</b> 달라요. 더 비싸다고 더 ‘나은 나’를 주지 않아요.
          </div>
        </div>
      </MdCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tiers.map((tr) =>
        <MdCard key={tr.k} variant={tr.cur ? 'elevated' : 'outlined'}
        style={{ padding: 16, border: tr.cur ? `2px solid ${C('primary')}` : undefined }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="md-title-large" style={{ color: C('on-surface') }}>{tr.k}</span>
              {tr.cur && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: C('primary'), color: C('on-primary') }}>이용 중</span>}
              <span style={{ flex: 1 }} />
              <span className="md-title-medium" style={{ color: C('primary') }}>{tr.price}</span>
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2 }}>{tr.sub}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
              {tr.feats.map((f) =>
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="check" size={16} style={{ color: C('primary') }} />
                  <span className="md-body-medium" style={{ color: C('on-surface') }}>{f}</span>
                </div>
            )}
            </div>
            <MdButton variant={tr.cur ? 'tonal' : 'filled'} full onClick={() => {}}>{tr.cur ? '현재 요금제' : `${tr.k} 시작`}</MdButton>
          </MdCard>
        )}
      </div>

      {/* free top-up via opt-in ad */}
      <SectionLabel>결제 없이 늘리기</SectionLabel>
      <button className="md-interactive" onClick={() => go('reward')}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '14px 16px', borderRadius: 16, background: C('surface-container'),
        border: `1px solid ${C('outline-variant')}`, color: C('on-surface') }}>
        <span className="md-state-layer"></span>
        <Icon name="bolt" size={22} style={{ color: C('tertiary'), flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="md-title-small" style={{ fontWeight: 600 }}>광고로 담기 가속 충전</div>
          <div className="md-label-small" style={{ color: C('on-surface-variant') }}>30초 영상 = +5회 · 분석 품질은 그대로</div>
        </div>
        <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant'), flexShrink: 0 }} />
      </button>
    </ScreenPad>);

}

/* ===================== SETTINGS 설정 (root tab) ===================== */
function ToggleRow({ icon, label, sub, checked, onChange, danger, last }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
      borderTop: last ? 'none' : 'none' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center',
        background: checked ? C('primary') : C('surface-container-highest'), color: checked ? C('on-primary') : C('on-surface-variant') }}>
        <Icon name={icon} fill={checked} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="md-body-large" style={{ color: C('on-surface') }}>{label}</div>
        {sub && <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{sub}</div>}
      </div>
      <MdSwitch checked={checked} onChange={onChange} />
    </div>);

}

function SettingsScreen({ t, go, env }) {
  const C = window.SB.C;
  const e = env || {};
  const f = e.features || {};
  const setF = e.setFeature || (() => {});
  const conn = e.connections || {};
  const setConn = e.setConnection || (() => {});
  const [confirm, setConfirm] = useSt(null);
  const sources = window.SB_DATA.starLenses.settingsScreen.sources; // → data/screens/star-lenses.json

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ padding: '4px 16px 18px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>설정</div>

        {/* 모양 */}
        <SectionLabel>모양</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          <ToggleRow icon="bedtime" label="다크 모드" sub="딥스페이스 톤" checked={!!e.dark} onChange={(v) => e.setDark && e.setDark(v)} />
          <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
          {/* 강조 색 — 스펙 캡처(09-settings)·README의 팔레트 전환 행. env.palette/setPalette 배선은 셸에 이미 존재 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px' }}>
            <div style={{ width: 38, height: 38, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: C('on-surface-variant') }}>
              <Icon name="auto_awesome" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="md-body-large" style={{ color: C('on-surface') }}>강조 색</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant') }}>별빛 팔레트</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
              {['시안', '바이올렛'].map((p) => (
                <MdButton key={p} size="s" variant={(e.palette || '시안') === p ? 'tonal' : 'outlined'}
                  icon={(e.palette || '시안') === p ? 'check' : undefined}
                  onClick={() => e.setPalette && e.setPalette(p)}>{p}</MdButton>
              ))}
            </div>
          </div>
        </MdCard>

        {/* 기능 on/off */}
        <SectionLabel>기능</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          <ToggleRow icon="auto_awesome" label="자동 분류" sub="담는 즉시 별·태그로 정리" checked={f.autotag !== false} onChange={(v) => setF('autotag', v)} />
          <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
          <ToggleRow icon="bubble_chart" label="제안 알림" sub="새 통찰이 생기면 알려줘요" checked={!!f.notify} onChange={(v) => setF('notify', v)} />
          <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
          <ToggleRow icon="lock" label="앱 잠금" sub="생체 인증으로 보호" checked={!!f.applock} onChange={(v) => setF('applock', v)} />
          <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
          <ToggleRow icon="badge" label="온디바이스 우선 처리" sub="원문은 기기에서만 분석" checked={f.ondevice !== false} onChange={(v) => setF('ondevice', v)} />
          <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
          <ToggleRow icon="mic" label="통화 녹음" sub="통화를 기기에서 받아 적고 별로 엮어요" checked={!!f.callrec} onChange={(v) => setF('callrec', v)} />
        </MdCard>


        {/* 연동 */}
        <SectionLabel action={<MdButton variant="text" onClick={() => go('connect')}>전체</MdButton>}>데이터 연동</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {sources.map((s, i) =>
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
            borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: conn[s.id] ? C('primary') : C('surface-container-highest'), color: conn[s.id] ? C('on-primary') : C('on-surface-variant') }}>
                <Icon name={s.icon} fill={!!conn[s.id]} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-body-large" style={{ color: C('on-surface') }}>{s.k}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{conn[s.id] ? '연결됨 · 동기화 중' : s.sub}</div>
              </div>
              <MdButton variant={conn[s.id] ? 'tonal' : 'outlined'} size="s" icon={conn[s.id] ? 'check' : undefined} onClick={() => setConn(s.id, !conn[s.id])}>
                {conn[s.id] ? '연결됨' : '연결'}
              </MdButton>
            </div>
          )}
        </MdCard>

        {/* 데이터 주권 */}
        <SectionLabel>데이터</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {[
          { icon: 'cloud_download', label: '외부 가져오기', sub: '파일·계정에서 나를 가져오기', route: 'import' },
          { icon: 'monitor_heart', label: '건강 데이터 항목', sub: '읽는 신호 · 수집 현황', route: 'healthdata' },
          { icon: 'shield_person', label: '내 데이터 리뷰', sub: '보관·파생 신호 열람·삭제', route: 'datareview' }].
          map((row, i) =>
          <div key={row.label} className="md-interactive" onClick={() => go(row.route)}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px', borderRadius: 10,
            borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', cursor: 'pointer' }}>
              <span className="md-state" />
              <Icon name={row.icon} size={22} style={{ color: C('on-surface-variant') }} />
              <div style={{ flex: 1 }}>
                <div className="md-body-large" style={{ color: C('on-surface') }}>{row.label}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{row.sub}</div>
              </div>
              <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
            </div>
          )}
        </MdCard>

        {/* 계정·기타 */}
        <SectionLabel>계정</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {[
          { icon: 'badge', label: 'IDEN 관리', sub: '내보내기 · 버전', route: 'iden' },
          { icon: 'person', label: '북극성 · 나의 종합', sub: '7별 종합 · 검증틀', route: 'me' },
          { icon: 'workspace_premium', label: '요금제 · 항해자', sub: '횟수·보관·내보내기 한도', route: 'plans' },
          { icon: 'workspaces', label: '앱 밖에서 · 위젯', sub: '위젯·잠금화면·알림', route: 'widget' },
          { icon: 'auto_stories', label: 'AI 뮤지엄', sub: 'AI 발전사 8 카테고리', route: 'museum' }].
          map((row, i) =>
          <div key={row.label} className="md-interactive" onClick={() => go(row.route)}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px', borderRadius: 10,
            borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', cursor: 'pointer' }}>
              <span className="md-state" />
              <Icon name={row.icon} size={22} style={{ color: C('on-surface-variant') }} />
              <div style={{ flex: 1 }}>
                <div className="md-body-large" style={{ color: C('on-surface') }}>{row.label}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{row.sub}</div>
              </div>
              <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
            </div>
          )}
        </MdCard>

        {/* state preview */}
        <SectionLabel>도움말 · 정책</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {[
          { icon: 'lock', label: '권한 관리', sub: '알림·마이크·캘린더·민감 권한', route: 'permissions' },
          { icon: 'shield_person', label: '개인정보 · 약관', sub: '수집·보관·삭제권', route: 'privacy' },
          { icon: 'forum', label: '지원 · 공지', sub: '문의·FAQ·공지사항', route: 'support' },
          { icon: 'auto_stories', label: '사용 매뉴얼', sub: '핵심 개념·튜토리얼 다시 보기', route: 'manual' }].
          map((row, i) =>
          <div key={row.label} className="md-interactive" onClick={() => go(row.route)}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px', borderRadius: 10,
            borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', cursor: 'pointer' }}>
              <span className="md-state" />
              <Icon name={row.icon} size={22} style={{ color: C('on-surface-variant') }} />
              <div style={{ flex: 1 }}>
                <div className="md-body-large" style={{ color: C('on-surface') }}>{row.label}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{row.sub}</div>
              </div>
              <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
            </div>
          )}
        </MdCard>

        {/* 로그아웃 · 계정 삭제 */}
        <SectionLabel>계정 작업</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {[
          { icon: 'logout', label: '로그아웃', sub: '이 기기에서 로그아웃해요' },
          { icon: 'delete_forever', label: '계정 삭제', sub: '모든 별·기록이 영구 삭제돼요', danger: true }].
          map((row, i) =>
          <div key={row.label} className="md-interactive"
          onClick={() => {
            if (row.danger) setConfirm({ title: '정말 계정을 삭제할까요?', danger: true, confirmLabel: '영구 삭제',
              requireType: '계정을 삭제하는데 동의 합니다',
              body: '계정과 모든 별·기록·파생 신호가 영구히 삭제돼요. 이 작업은 되돌릴 수 없어요.',
              onConfirm: () => {e.showToast && e.showToast({ msg: '삭제를 접수했어요' });go('auth');} });else
            setConfirm({ title: '로그아웃할까요?', confirmLabel: '로그아웃',
              body: '다시 로그인하면 별과 기록은 그대로 이어져요.',
              onConfirm: () => go('auth') });
          }}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px', borderRadius: 10,
            borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', cursor: 'pointer' }}>
              <span className="md-state" />
              <Icon name={row.icon} size={22} style={{ color: row.danger ? C('error') : C('on-surface-variant') }} />
              <div style={{ flex: 1 }}>
                <div className="md-body-large" style={{ color: row.danger ? C('error') : C('on-surface') }}>{row.label}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{row.sub}</div>
              </div>
              <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
            </div>
          )}
        </MdCard>
        <ConfirmDialog open={!!confirm} {...confirm || {}} onClose={() => setConfirm(null)} />
      </div>
    </div>);

}

/* ===================== MUSEUM — moved to sb-museum.jsx (GT7-style deck) ===================== */

Object.assign(window, {
  StarScreen, IdenScreen, ConnectScreen, PlansScreen, SettingsScreen,
  EmptyState, ErrorState, OfflineBanner, LoadingState, MdSwitch, DOMAIN_META
});