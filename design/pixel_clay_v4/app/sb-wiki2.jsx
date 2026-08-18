/* ============================================================
   2nd-Brain · E그룹 — 위키 (브리프 07-wiki.md)
   - WikiScreen      : /wiki 지식 (wiki_pages 리스트/그래프, focusPageId)
   - SrsScreen       : /srs 언어 복습 (FSRS 플래시카드)
   - ReviewScreen    : /review 점검 (제안 받기 → RatifySheet before/after)
   - DigestTodayScreen : /digest 오늘의 정리 (연결 제안 확인/보류) — 기존 주간 digest와 별도
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useWk } = React;

/* ===================== /wiki 지식 ===================== */
const WK_PAGES = [
{ id: 'w1', title: '딥워크의 조건', tags: ['#딥워크', '#집중'], links: 9, backlinks: 4, kind: '개념', snippet: '방해 없는 90분 블록이 하루의 밀도를 바꾼다. 오전 배치가 가장 잘 맞았다.' },
{ id: 'w2', title: '스프린트 회고', tags: ['#회고', '#팀'], links: 7, backlinks: 3, kind: '원본', snippet: '먼저 말을 꺼낸 회고. 팀의 반응이 예상보다 따뜻했다.' },
{ id: 'w3', title: '아침 러닝', tags: ['#운동', '#리듬'], links: 6, backlinks: 2, kind: '존재', snippet: '주 3회. 달린 날 오후 집중이 눈에 띄게 길어졌다.' },
{ id: 'w4', title: '멘토 커피챗', tags: ['#관계', '#커리어'], links: 5, backlinks: 3, kind: '존재', snippet: '분기마다 한 번. 매번 방향이 조금씩 조정된다.' },
{ id: 'w5', title: '몰입 읽기', tags: ['#독서', '#집중'], links: 5, backlinks: 2, kind: '개념', snippet: '종이책 + 타이머. 전자책보다 남는 게 많았다.' },
{ id: 'w6', title: '주간 정리', tags: ['#회고'], links: 4, backlinks: 2, kind: '원본', snippet: '일요일 저녁 30분. 다음 주가 가벼워진다.' },
{ id: 'w7', title: '수면과 컨디션', tags: ['#건강', '#리듬'], links: 4, backlinks: 1, kind: '개념', snippet: '7시간 아래로 내려간 주는 기록량도 같이 줄었다.' },
{ id: 'w8', title: '책 메모', tags: ['#독서'], links: 3, backlinks: 1, kind: '원본', snippet: '인용 대신 내 문장으로 옮겨 적기.' }];
const WK_TAGS = ['전체', '#딥워크', '#회고', '#운동', '#관계', '#독서', '#건강'];
const WK_NODES = [
{ id: 'w1', x: 48, y: 26, r: 8 }, { id: 'w2', x: 24, y: 46, r: 6 }, { id: 'w3', x: 72, y: 42, r: 6 },
{ id: 'w4', x: 34, y: 70, r: 5 }, { id: 'w5', x: 64, y: 70, r: 5 }, { id: 'w6', x: 12, y: 70, r: 4 },
{ id: 'w7', x: 86, y: 62, r: 4 }, { id: 'w8', x: 50, y: 88, r: 3 }];
const WK_EDGES = [['w1', 'w2'], ['w1', 'w3'], ['w1', 'w5'], ['w2', 'w6'], ['w3', 'w7'], ['w5', 'w8'], ['w2', 'w4'], ['w4', 'w5']];

function WikiScreen({ t, go, param }) {
  const C = window.SB.C;
  const [state, setState] = useWk('filled');
  const [view, setView] = useWk('list');
  const [tag, setTag] = useWk('전체');
  const [open, setOpen] = useWk((param && param.focusPageId) || null);
  const [sel, setSel] = useWk(null);

  const pages = WK_PAGES.filter((p) => tag === '전체' || p.tags.includes(tag));
  const totalLinks = WK_EDGES.length;

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="지식을 펼치는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="지식을 불러오지 못했어요" body="담은 별가루는 안전해요. 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return (
      <StateView state="empty" title="창고가 조용해요."
      body="오늘의 별가루나 링크를 담으면 여기서 다시 만날 수 있어요."
      cta={() => go('capture')} ctaLabel="+ 별가루 담기" icon="add_circle" />);
    return (
      <React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 8px' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>
            지금까지 <b style={{ color: 'var(--c11)' }}>{WK_PAGES.length}</b>개의 지식이 자라고 있어요.
          </span>
          <span style={{ display: 'flex', gap: 10, flex: '0 0 auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>
            <span>페이지 {WK_PAGES.length}</span><span>연결 {totalLinks}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[['list', '목록'], ['graph', '그래프']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className="md-interactive"
            style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 34,
              background: view === k ? C('primary') : C('surface-container-highest'),
              color: view === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
              <span className="md-state" />{l}
            </button>))}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
          {WK_TAGS.map((tg) => <MdChip key={tg} variant="filter" selected={tag === tg} onClick={() => setTag(tg)}>{tg}</MdChip>)}
        </div>

        {view === 'graph' ?
        <div style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 10 }}>
          <svg viewBox="0 0 100 100" shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: 240 }}>
            {WK_EDGES.map(([a, b], i) => {
              const na = WK_NODES.find((n) => n.id === a), nb = WK_NODES.find((n) => n.id === b);
              const off = tag !== '전체' && !(pages.some((p) => p.id === a) && pages.some((p) => p.id === b));
              const len = Math.hypot(nb.x - na.x, nb.y - na.y), steps = Math.max(2, Math.round(len / 4));
              return Array.from({ length: steps - 1 }).map((_, k) => (
                <rect key={i + '-' + k} x={Math.round(na.x + (nb.x - na.x) * (k + 1) / steps)} y={Math.round(na.y + (nb.y - na.y) * (k + 1) / steps)}
                width="1" height="1" fill={off ? 'var(--c02)' : 'var(--c03)'} />));
            })}
            {WK_NODES.map((n) => {
              const inFilter = pages.some((p) => p.id === n.id);
              const on = sel === n.id;
              return (
                <rect key={n.id} x={n.x - (n.r >> 1)} y={n.y - (n.r >> 1)} width={n.r} height={n.r}
                onClick={() => { if (on) { setView('list'); setOpen(n.id); setSel(null); } else setSel(n.id); }}
                style={{ cursor: 'pointer' }}
                fill={!inFilter ? 'var(--c03)' : on ? 'var(--c08)' : n.r >= 6 ? 'var(--ds-star)' : 'var(--ds-core)'} />);
            })}
          </svg>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 4 }}>
            {sel ? '한 번 더 누르면 열려요' : '태그로 좁혀 보세요.'}
          </div>
        </div> :
        pages.length === 0 ?
        <StateView state="empty" title="이 태그에 담긴 지식이 아직 없어요."
        body="다른 태그를 눌러보거나 별가루를 담아보세요." cta={() => go('capture')} ctaLabel="+ 별가루 담기" icon="add_circle" /> :
        <MdCard variant="filled" style={{ padding: 4 }}>
          {pages.map((p, i) => {
            const on = open === p.id;
            return (
              <div key={p.id} style={{ borderTop: i ? `1px solid ${C('outline-variant')}` : 'none',
                background: on ? 'var(--c02)' : 'transparent' }}>
                <div className="md-interactive" onClick={() => setOpen(on ? null : p.id)}
                style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' }}>
                  <span className="md-state" />
                  <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                    background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
                    <Icon name={p.kind === '개념' ? 'bubble_chart' : p.kind === '존재' ? 'person' : 'description'} size={14} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>연결 {p.links}</span>
                  </span>
                  <Icon name={on ? 'expand_less' : 'expand_more'} size={16} style={{ color: C('on-surface-variant') }} />
                </div>
                {on &&
                <div style={{ padding: '0 12px 12px 50px' }}>
                  <div style={{ fontSize: 12, color: C('on-surface-variant'), lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty' }}>{p.snippet}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {p.tags.map((tg) => <span key={tg} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '2px 7px',
                      background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>{tg}</span>)}
                  </div>
                  <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginTop: 8 }}>↩ 연결된 기록 {p.backlinks}</div>
                </div>}
              </div>);
          })}
        </MdCard>}
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={() => go('records')} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>지식</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /srs 언어 복습 ===================== */
const SRS_SEED = [
{ id: 's1', front: 'serendipity', back: '뜻밖의 발견 · 우연한 행운' },
{ id: 's2', front: 'deliberate practice', back: '의도적 연습 — 약점을 겨냥한 반복' },
{ id: 's3', front: 'compounding', back: '복리 — 작은 것이 쌓여 커지는 것' },
{ id: 's4', front: 'antifragile', back: '반취약 — 충격을 받을수록 강해지는' }];

function SrsScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useWk('filled');
  const [queue, setQueue] = useWk(SRS_SEED);
  const [flip, setFlip] = useWk(false);
  const [adding, setAdding] = useWk(false);
  const [nf, setNf] = useWk('');
  const [nb, setNb] = useWk('');

  const card = queue[0];
  const grade = () => { setQueue((q) => q.slice(1)); setFlip(false); };
  const addCard = () => {
    if (!nf.trim()) { setAdding(false); return; }
    setQueue((q) => [...q, { id: 'n' + Date.now(), front: nf, back: nb }]);
    setNf(''); setNb(''); setAdding(false);
  };

  const body = () => {
    if (state === 'loading') return (
      <div style={{ display: 'grid', placeItems: 'center', padding: '48px 24px', textAlign: 'center' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={56} expression="neutral" track={false} /></div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 14 }}>카드를 불러오는 중이에요…</div>
        </div>
      </div>);
    if (state === 'error') return <StateView state="error" title="카드를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (adding) return (
      <MdCard variant="filled" style={{ padding: 16, marginTop: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 12 }}>카드 추가</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AuField label="앞면" value={nf} onChange={setNf} ph="단어나 질문" />
          <AuField label="뒷면" value={nb} onChange={setNb} ph="뜻이나 답" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setAdding(false)}>취소</MdButton></span>
          <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={addCard}>저장</MdButton></span>
        </div>
      </MdCard>);
    if (state === 'empty' || !card) return (
      <div style={{ display: 'grid', placeItems: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={64} expression="positive" track /></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 14 }}>모두 끝냈어요. 잘했어요.</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            오늘 복습할 카드를 모두 끝내면 언어 루틴이 자동으로 체크돼요.
          </div>
          <div style={{ marginTop: 16 }}><MdButton variant="outlined" size="s" icon="add" onClick={() => setAdding(true)}>카드 추가</MdButton></div>
        </div>
      </div>);
    return (
      <React.Fragment>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '8px 0 12px', wordBreak: 'keep-all' }}>오늘의 카드를 정리해요.</div>
        <div onClick={() => setFlip((f) => !f)} className="md-interactive"
        style={{ position: 'relative', minHeight: 168, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 24, textAlign: 'center',
          background: flip ? C('surface-container-high') : C('surface-container'), boxShadow: 'var(--ds-edge)' }}>
          <span className="md-state" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--ds-nebula)', marginBottom: 10 }}>{flip ? '뒷면' : '앞면'}</div>
            <div style={{ fontSize: flip ? 15 : 24, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all', textWrap: 'pretty' }}>{flip ? card.back : card.front}</div>
            {!flip && <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14 }}>눌러서 뒤집기</div>}
          </div>
        </div>
        {flip &&
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 12 }}>
          {[['다시', 'var(--danger)'], ['어려움', 'var(--warn)'], ['좋음', 'var(--ds-core)'], ['쉬움', 'var(--ok)']].map(([l, col]) => (
            <button key={l} onClick={grade} className="md-interactive"
            style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 46,
              background: C('surface-container-highest'), color: col, boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)', fontWeight: 700 }}>
              <span className="md-state" />{l}
            </button>))}
        </div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>오늘 남은 카드: {queue.length}</span>
          <span style={{ marginLeft: 'auto' }}><MdButton variant="outlined" size="s" icon="add" onClick={() => setAdding(true)}>카드 추가</MdButton></span>
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 4px 12px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <SbHead size={32} expression={queue.length ? 'neutral' : 'positive'} track={false} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>언어 복습</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /review 점검 ===================== */
const RV_RECEIPTS = [
{ id: 'r1', title: '회고 — 이번 스프린트에서 배운 것', when: '2시간 전' },
{ id: 'r2', title: '멘토 커피챗 메모', when: '어제' },
{ id: 'r3', title: '팀 발표 후기', when: '3일 전' }];

function ReviewScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useWk('filled');
  const [phase, setPhase] = useWk('idle');  // idle | loading | sheet | done
  const [result, setResult] = useWk(null);
  const [reopen, setReopen] = useWk(false);

  const propose = () => {
    if (state === 'error') { setResult('제안을 불러오지 못했어요. 다시 시도해 주세요.'); return; }
    if (state === 'empty') { setResult('지금은 제안할 변화가 없어요.'); return; }
    setPhase('loading');
    setTimeout(() => setPhase('sheet'), 1100);
  };
  const decide = (ok) => {
    setPhase('done');
    setResult(ok ? '승인됐어요. 실행가능(L4)으로 올라갔어요.' : '이번엔 그대로 둘게요.');
    setReopen(false);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 4px 12px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <SbHead size={32} expression="neutral" track={false} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>점검</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '8px 0 4px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          내가 달라졌다면 별자리도 함께 점검해요.
        </div>
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginBottom: 12 }}>승인해야만 반영돼요.</div>

        <MdCard variant="filled" style={{ padding: 16 }}>
          <div className="md-label-medium" style={{ color: 'var(--ds-nebula)', marginBottom: 6 }}>세컨비의 제안</div>
          <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            최근 기록을 보면 외향성이 올라간 것 같아요. 별 밝기를 올릴까요?
          </div>
        </MdCard>

        <div style={{ marginTop: 14 }}>
          <MdButton variant="filled" full icon="auto_awesome" disabled={phase === 'loading'} onClick={propose}>
            {phase === 'loading' ? '불러오는 중…' : '제안 받기'}
          </MdButton>
        </div>

        {result &&
        <div className="px-frame" style={{ padding: 13, marginTop: 12, background: C('surface-container-low') }}>
          <div style={{ fontSize: 12, color: /못했|없어요/.test(result) ? C('error') : 'var(--ok)', wordBreak: 'keep-all' }}>{result}</div>
        </div>}

        {phase === 'done' && !reopen &&
        <div style={{ marginTop: 10 }}><MdButton variant="outlined" full size="s" onClick={() => { setReopen(true); setPhase('sheet'); }}>받은 제안 다시 보기</MdButton></div>}

        {(phase === 'sheet' || phase === 'done') &&
        <React.Fragment>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 6px' }}>이 제안의 근거가 된 기록</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {RV_RECEIPTS.map((r, i) => (
              <div key={r.id} className="md-interactive" onClick={() => go('record', window.SB.RECORDS[i] || window.SB.RECORDS[0])}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                <span className="md-state" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>{r.when}</span>
                </span>
                <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
              </div>))}
          </MdCard>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8 }}>탭하면 원본 기록을 직접 확인할 수 있어요.</div>
        </React.Fragment>}

        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 20, textAlign: 'center', wordBreak: 'keep-all' }}>
          승인해야만 반영됩니다 · 모든 제안은 기록에 남습니다
        </div>
      </div>
      <StateRow value={state} onChange={setState} />

      {phase === 'sheet' &&
      <div onClick={() => setPhase(reopen ? 'done' : 'idle')} className="ds-scrim"
      style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', padding: '16px 18px 20px', margin: 'var(--u)' }}>
          <div aria-hidden="true" style={{ width: 32, height: 'var(--u)', background: 'var(--c03)', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 12 }}>세컨비의 제안</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ flex: 1, padding: 12, background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', textAlign: 'center' }}>
              <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>지금</span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 4 }}>L3</span>
            </span>
            <Icon name="arrow_forward" size={18} style={{ color: 'var(--ds-core)', flex: '0 0 auto' }} />
            <span style={{ flex: 1, padding: 12, background: C('primary-container'), boxShadow: 'var(--ds-edge)', textAlign: 'center' }}>
              <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-primary-container') }}>제안</span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C('on-primary-container'), marginTop: 4 }}>L4</span>
            </span>
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty', marginBottom: 16 }}>
            최근 기록을 보면 외향성이 올라간 것 같아요. 별 밝기를 올릴까요?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => decide(false)}>그대로 두기</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => decide(true)}>승인</MdButton></span>
          </div>
        </div>
      </div>}
    </div>);
}

/* ===================== /digest 오늘의 정리 ===================== */
const DG_LINKS = [
{ id: 'd1', from: '딥워크의 조건', to: '아침 러닝', strength: '강한 연결' },
{ id: 'd2', from: '스프린트 회고', to: '멘토 커피챗', strength: '그럴듯한 연결' },
{ id: 'd3', from: '몰입 읽기', to: '주간 정리', strength: '약한 연결' }];

function DigestTodayScreen({ t, go, onBack, bare }) {
  const C = window.SB.C;
  const [state, setState] = useWk('filled');
  const [items, setItems] = useWk(DG_LINKS);
  const [remind, setRemind] = useWk(false);
  const tone = (s) => s === '강한 연결' ? 'var(--ok)' : s === '그럴듯한 연결' ? 'var(--ds-core)' : C('on-surface-variant');

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="정리를 펴는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="정리를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty' || items.length === 0) return (
      <StateView state="empty" title="지금 검토할 제안이 없어요."
      body="더 담으면 연결이 보이기 시작해요." cta={() => go('capture')} ctaLabel="담으러 가기" icon="add_circle" />);
    return (
      <React.Fragment>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '8px 0 4px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          기록에서 모인 연결 제안이에요. 무엇이 맞는지 당신이 확인하세요.
        </div>
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginBottom: 12 }}>검토할 제안 {items.length}개</div>
        {items.map((it) => (
          <MdCard key={it.id} variant="filled" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: tone(it.strength) }}>{it.strength}</span>
            </div>
            <div className="md-interactive" onClick={() => go('wiki', { focusPageId: 'w1' })}
            style={{ position: 'relative', cursor: 'pointer', padding: '4px 0' }}>
              <span className="md-state" />
              <span style={{ fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{it.from} ↔ {it.to}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" icon="check" onClick={() => setItems((s) => s.filter((x) => x.id !== it.id))}>확인</MdButton></span>
              <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setItems((s) => s.filter((x) => x.id !== it.id))}>보류</MdButton></span>
            </div>
          </MdCard>))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 14px',
          background: C('surface-container'), boxShadow: 'var(--ds-edge)' }}>
          <Icon name="alarm" size={18} style={{ color: C('on-surface-variant') }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>매일 오전 9시에 알림</span>
            <span className="md-body-small" style={{ color: C('on-surface-variant') }}>이 기기에서만 울려요. 언제든 끌 수 있어요.</span>
          </span>
          <MdSwitch checked={remind} onChange={setRemind} />
        </div>
      </React.Fragment>);
  };

  if (bare) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

Object.assign(window, { WikiScreen, SrsScreen, ReviewScreen, DigestTodayScreen });
