/* ============================================================
   2nd-Brain · C그룹 — 세컨비 축 (브리프 05-secondb.md)
   - InsightsScreen : /insights 인사이트 (이번 주 vs 지난주, 무-LLM 집계)
   - ResearchScreen : /research 연결 찾기 (태그 군집 + AI 연결 제안 propose→ratify)
   - DiscoverScreen : /discover 트렌드 (상승 태그 최대 3, 횟수만 표기)
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useSb2 } = React;

/* ===================== /insights 인사이트 ===================== */
function InsightsScreen({ t, go, env }) {
  const C = window.SB.C;
  const [state, setState] = useSb2('filled');
  const prior = 14, recent = 21;
  const delta = Math.round((recent - prior) / prior * 100);
  const domain = '커리어', domainPct = 38;
  const max = Math.max(prior, recent, 1);

  const Card = ({ onClick, children, style }) => (
    <div className="md-interactive" onClick={onClick}
    style={{ position: 'relative', background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 16, cursor: 'pointer', marginTop: 12, ...style }}>
      <span className="md-state" />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>);

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="이번 주를 세어보는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="이번 주 데이터를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return (
      <React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 4px' }}>
          <SbHead size={48} expression="neutral" track />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface') }}>이번 주부터 쌓이기 시작했어요.</div>
          </div>
        </div>
        <StateView state="empty" title="한 주만 채우면 지난주와 이번주를 비교해 드릴게요."
        body="담은 별가루가 쌓이면 이번 주와 지난주를 나란히 세어 보여드려요."
        cta={() => go('capture')} ctaLabel="별가루 담기" icon="add_circle" />
      </React.Fragment>);
    return (
      <React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 2px' }}>
          <SbHead size={48} expression="positive" track />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-label-medium" style={{ color: 'var(--ds-nebula)' }}>요즘의 나</div>
            <div style={{ fontSize: 12, color: C('on-surface'), marginTop: 2, wordBreak: 'keep-all' }}>지난주보다 이번주의 나는</div>
          </div>
        </div>

        <Card onClick={() => go('records')}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>담은 별가루 · 주간</span>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--warn)' : C('on-surface-variant') }}>
              {delta > 0 ? `▲ ${delta}% 더 많이 담았어요` : delta < 0 ? `▼ ${Math.abs(delta)}% 적게 담았어요` : '지난주와 같은 양'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height: 96, padding: '0 4px' }}>
            {[['지난주', prior, 'var(--c04)'], ['이번주', recent, 'var(--ds-core)']].map(([lb, v, col]) => (
              <div key={lb} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: C('on-surface') }}>{v}</span>
                <span style={{ width: '100%', height: Math.max(6, Math.round(v / max * 62)), background: col, boxShadow: 'var(--ds-edge)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>{lb}</span>
              </div>))}
          </div>
        </Card>

        <Card onClick={() => go('research')}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>이번 주 핵심 발견</div>
          <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            이번 주 기록의 <b style={{ color: 'var(--c11)' }}>{domainPct}%</b>가 ‘{domain}’ 영역이었어요.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <Icon name="hub" size={16} style={{ color: 'var(--ds-core)' }} />
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)' }}>연결 찾기로</span>
          </div>
        </Card>

        <Card onClick={() => go('discover')}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>무엇을 담아볼까</div>
          <div style={{ fontSize: 12, color: C('on-surface-variant'), lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            요즘 내 기록에서 떠오르는 관심사를 보여드려요.
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10 }}>가장 많이 담은 주제를 눌러 흐름을 보세요.</div>
        </Card>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /research 연결 찾기 ===================== */
const RS_CLUSTERS = ['전체', '#딥워크', '#회고', '#관계', '#운동', '#독서'];
const RS_NODES = [
{ id: 'n1', x: 46, y: 30, r: 7, tag: '#딥워크', label: '집중의 조건' },
{ id: 'n2', x: 22, y: 52, r: 5, tag: '#회고', label: '스프린트 회고' },
{ id: 'n3', x: 70, y: 46, r: 5, tag: '#독서', label: '몰입 읽기' },
{ id: 'n4', x: 36, y: 74, r: 4, tag: '#운동', label: '아침 러닝' },
{ id: 'n5', x: 62, y: 76, r: 4, tag: '#관계', label: '멘토 커피챗' },
{ id: 'n6', x: 84, y: 66, r: 3, tag: '#독서', label: '책 메모' },
{ id: 'n7', x: 12, y: 30, r: 3, tag: '#회고', label: '주간 정리' }];
const RS_EDGES = [['n1', 'n2'], ['n1', 'n3'], ['n2', 'n7'], ['n3', 'n6'], ['n1', 'n4'], ['n4', 'n5'], ['n2', 'n5']];
const RS_PROPOSALS = [
{ id: 'p1', from: '집중의 조건', to: '아침 러닝', pct: 78 },
{ id: 'p2', from: '스프린트 회고', to: '멘토 커피챗', pct: 64 },
{ id: 'p3', from: '몰입 읽기', to: '주간 정리', pct: 52 }];

function ResearchScreen({ t, go, env }) {
  const C = window.SB.C;
  const [state, setState] = useSb2('filled');
  const [cluster, setCluster] = useSb2('전체');
  const [props, setProps] = useSb2(RS_PROPOSALS);
  const [busy, setBusy] = useSb2(false);
  const [note, setNote] = useSb2(null);

  const dim = (n) => cluster !== '전체' && n.tag !== cluster;
  const decide = (id, ok) => {
    setProps((s) => s.filter((p) => p.id !== id));
    setNote(ok ? '연결을 확정했어요' : '제안을 정리했어요');
    setTimeout(() => setNote(null), 2200);
  };
  const propose = () => {
    setBusy(true);
    setTimeout(() => { setBusy(false); setProps(RS_PROPOSALS); }, 1400);
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="연결을 그리는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="연결을 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return (
      <StateView state="empty" title="아직 이어줄 기록이 없어요."
      body="오늘의 별가루를 담으면 여기서 연결을 그려드려요."
      cta={() => go('capture')} ctaLabel="별가루 담기" icon="add_circle" />);
    return (
      <React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 4px' }}>
          <SbHead size={48} expression="positive" track />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
            흩어진 기록 사이에서 <b style={{ color: 'var(--c11)' }}>{RS_EDGES.length}</b>개의 연결을 찾았어요.
          </div>
        </div>

        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>흩어진 기록이 이렇게 이어져요</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {RS_CLUSTERS.map((cl) => (
            <MdChip key={cl} variant="filter" selected={cluster === cl} onClick={() => setCluster(cl)}>{cl}</MdChip>))}
        </div>

        <div style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 10, marginTop: 6 }}>
          <svg viewBox="0 0 100 92" shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: 176 }}>
            {RS_EDGES.map(([a, b], i) => {
              const na = RS_NODES.find((n) => n.id === a), nb = RS_NODES.find((n) => n.id === b);
              const off = dim(na) || dim(nb);
              const len = Math.hypot(nb.x - na.x, nb.y - na.y), steps = Math.max(2, Math.round(len / 4));
              return Array.from({ length: steps - 1 }).map((_, k) => (
                <rect key={i + '-' + k} x={Math.round(na.x + (nb.x - na.x) * (k + 1) / steps)} y={Math.round(na.y + (nb.y - na.y) * (k + 1) / steps)}
                width="1" height="1" fill={off ? 'var(--c02)' : 'var(--c03)'} />));
            })}
            {RS_NODES.map((n) => (
              <rect key={n.id} x={n.x - (n.r >> 1)} y={n.y - (n.r >> 1)} width={n.r} height={n.r}
              fill={dim(n) ? 'var(--c03)' : n.r >= 6 ? 'var(--ds-star)' : 'var(--ds-core)'} />))}
          </svg>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 4 }}>태그를 누르면 군집이 보여요.</div>
        </div>

        <MdCard variant="filled" style={{ padding: 14, marginTop: 12 }} onClick={() => go('record', window.SB.RECORDS[0])}>
          <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            가장 많이 이어진 지식은 ‘<b style={{ color: 'var(--c11)' }}>집중의 조건</b>’예요. 여러 기록이 이 한 점으로 모여요.
          </div>
        </MdCard>
        <MdCard variant="filled" style={{ padding: 14, marginTop: 8 }} onClick={() => go('record', window.SB.RECORDS[1])}>
          <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            뜻밖의 연결을 찾았어요. ‘<b style={{ color: 'var(--c11)' }}>아침 러닝</b>’과 ‘<b style={{ color: 'var(--c11)' }}>집중의 조건</b>’이 서로 다른 주제인데 이어져 있어요.
          </div>
        </MdCard>

        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 6px' }}>제안된 연결</div>
        {props.length === 0 ?
        <div className="px-frame" style={{ padding: 14, background: C('surface-container-low') }}>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
            아직 제안이 없어요. 의미 색인을 만든 뒤 연결 제안을 받아보세요.
          </div>
          <div style={{ marginTop: 12 }}>
            <MdButton variant="tonal" full size="s" icon="auto_awesome" disabled={busy} onClick={propose}>{busy ? '연결을 찾는 중…' : 'AI 연결 제안 받기'}</MdButton>
          </div>
        </div> :
        <MdCard variant="filled" style={{ padding: 4 }}>
          {props.map((p, i) => (
            <div key={p.id} style={{ padding: '11px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{p.from} ↔ {p.to}</span>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', flex: '0 0 auto' }}>{p.pct}% 일치</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" icon="check" onClick={() => decide(p.id, true)}>승인</MdButton></span>
                <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => decide(p.id, false)}>거절</MdButton></span>
              </div>
            </div>))}
        </MdCard>}
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          {[['페이지', 12], ['연결', RS_EDGES.length], ['외딴 별가루', 3], ['지식 군집', 4]].map(([l, v]) => (
            <span key={l} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{l} {v}</span>))}
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      {note &&
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 52, zIndex: 20 }}>
        <div style={{ background: C('inverse-surface'), color: C('inverse-on-surface'), padding: '10px 14px', boxShadow: 'var(--ds-edge)', fontSize: 12 }}>{note}</div>
      </div>}
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /discover 트렌드 ===================== */
const DS_RISING = [
{ tag: '#딥워크', recent: 7, prior: 2 },
{ tag: '#러닝', recent: 5, prior: 1 },
{ tag: '#회고', recent: 4, prior: 3 }];

function DiscoverScreen({ t, go, env }) {
  const C = window.SB.C;
  const [state, setState] = useSb2('filled');
  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="요즘 담은 것들을 살펴보는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="최근 기록을 읽지 못해서 보여줄 게 없어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return <StateView state="empty" title="아직 추세를 말할 만큼 기록이 쌓이지 않았어요." body="데이터가 더 쌓이면 새로운 제안이 나타납니다." cta={() => go('capture')} ctaLabel="별가루 담기" icon="add_circle" />;
    return (
      <React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 6px' }}>
          <SbHead size={48} expression="positive" track />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
            요즘 너의 관심이 향하는 다음 한 걸음
          </div>
        </div>
        {DS_RISING.map((r) => (
          <MdCard key={r.tag} variant="filled" style={{ padding: 14, marginTop: 10 }} onClick={() => go('capture')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c11)' }}>{r.tag}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ok)' }}>
                ▲ 이번 주 {r.recent}회 · 지난주 {r.prior}회
              </span>
            </div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              요즘 더 자주 올라와요. 이 주제로 더 담아볼까요?
            </div>
          </MdCard>))}
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 16, wordBreak: 'keep-all' }}>제안을 누르면 관련 검사나 기록으로 이어져요.</div>
      </React.Fragment>);
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

Object.assign(window, { InsightsScreen, ResearchScreen, DiscoverScreen });
