/* ============================================================
   2nd-Brain · G그룹 — 생활 도메인 (브리프 09-lifedom.md)
   - GrowthScreen  : /growth 나의 변화 (주간 성장 리뷰)
   - ReadingScreen : /reading 내 책장 (Google Books 실제 검색)
   - MealsScreen   : /meals 이번 주 식단 (7×3 그리드 + 끼니 시트)
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useLd } = React;

/* ===================== /growth 나의 변화 ===================== */
const GR_STARS = [
{ id: 'now', name: '커리어', route: 'star', prior: 2, cur: 3 },
{ id: 'recall', name: '재정', route: 'ledger', prior: 2, cur: 2 },
{ id: 'seen', name: '성장', route: 'growth', prior: 1, cur: 2 },
{ id: 'rhythm', name: '관계', route: 'relcontacts', prior: 3, cur: 3 },
{ id: 'relational', name: '건강', route: 'healthdata', prior: 2, cur: 3 },
{ id: 'possible', name: '휴식', route: 'hobbyinput', prior: 1, cur: 1 },
{ id: 'values', name: '담아내기', route: 'capture', prior: 2, cur: 2 }];
const GR_OBS = {
  now: '커리어 기록을 자주 남긴 한 주였어요.',
  rhythm: '관계를 자주 떠올린 한 주였어요.',
  relational: '하루의 리듬이 또렷해졌어요.',
  possible: '쉼을 자주 챙긴 한 주였어요.',
  values: '무엇이 중요한지 자주 돌아봤어요.',
  seen: '성장의 흔적이 늘어난 한 주였어요.',
  recall: '돈의 흐름을 자주 들여다봤어요.'
};
const GR_STEPS = { now: '오늘 한 줄 돌아보기', rhythm: '한 사람에게 안부 전하기', relational: '같은 시간에 한 가지 하기',
  possible: '쉼을 한 줄 담기', values: '가치 한 가지 실천하기', seen: '배운 것 한 줄 적기', recall: '이번 주 지출 한 번 보기' };
/* 북두칠성 좌표 (비교 SVG) */
const GR_DIPPER = [[16, 62], [30, 52], [44, 48], [58, 44], [66, 30], [80, 26], [90, 40]];

function GrowthScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useLd('filled');
  const [saved, setSaved] = useLd(false);
  const [busy, setBusy] = useLd(false);

  const hero = GR_STARS.reduce((a, b) => (b.cur - b.prior) > (a.cur - a.prior) ? b : a, GR_STARS[0]);
  const delta = hero.cur - hero.prior;

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="변화를 모으는 중…" />;
    if (state === 'error') return <StateView state="error" title="잠시 불러오지 못했어요" body="조금 뒤에 다시 볼게요" cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return (
      <React.Fragment>
        <div style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 16, marginTop: 10 }}>
          <svg viewBox="0 0 100 76" shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: 120 }}>
            {GR_DIPPER.map((p, i) => <rect key={i} x={p[0] - 1} y={p[1] - 1} width="3" height="3" fill="var(--c02)" />)}
          </svg>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), textAlign: 'center', marginTop: 10 }}>첫 변화는 다음 주에</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            이번 주 기록과 루틴을 채우면 일요일에 너의 별이 얼마나 밝아졌는지 보여줄게요.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <MdButton variant="filled" full icon="add_circle" onClick={() => go('capture')}>오늘 기록 담기</MdButton>
          <MdButton variant="outlined" full icon="today" onClick={() => go('ops')}>루틴 하나 시작하기</MdButton>
        </div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 12 }}>한 주만 채우면 변화가 보여요.</div>
      </React.Fragment>);
    return (
      <React.Fragment>
        {/* 히어로 */}
        <MdCard variant="filled" style={{ padding: 16, marginTop: 10 }}>
          <div className="md-label-medium" style={{ color: 'var(--ds-nebula)' }}>이번 주의 별</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)' }}>{hero.name}</span>
            {delta > 0 && <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: 'var(--ok)' }}>밝기 +{delta}단계</span>}
          </div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 4 }}>가장 환한 별</div>
        </MdCard>

        {/* 북두칠성 비교 */}
        <div style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {[['지난주', 'prior'], ['이번주', 'cur']].map(([lb, key]) => (
              <div key={key} style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), textAlign: 'center', marginBottom: 6 }}>{lb}</div>
                <svg viewBox="0 0 100 76" shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: 88 }}>
                  {GR_DIPPER.slice(0, -1).map((p, i) => {
                    const q = GR_DIPPER[i + 1];
                    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), steps = Math.max(2, Math.round(len / 4));
                    return Array.from({ length: steps - 1 }).map((_, k) => (
                      <rect key={i + '-' + k} x={Math.round(p[0] + (q[0] - p[0]) * (k + 1) / steps)} y={Math.round(p[1] + (q[1] - p[1]) * (k + 1) / steps)}
                      width="1" height="1" fill="var(--c02)" />));
                  })}
                  {GR_DIPPER.map((p, i) => {
                    const lv = GR_STARS[i][key];
                    const sz = lv >= 3 ? 5 : lv === 2 ? 4 : 3;
                    return <rect key={i} x={p[0] - (sz >> 1)} y={p[1] - (sz >> 1)} width={sz} height={sz}
                    fill={lv >= 3 ? 'var(--ds-star)' : lv === 2 ? 'var(--ds-core)' : 'var(--c03)'} />;
                  })}
                </svg>
              </div>))}
          </div>
        </div>

        {/* 지표 칩 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {[['기록', '21'], ['루틴 연속', '5일'], ['완료율', '72%'], ['마일스톤', '2']].map(([l, v]) => (
            <span key={l} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '5px 10px',
              background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>{l} {v}</span>))}
          <button onClick={() => go(hero.route)} className="md-interactive"
          style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '5px 10px', minHeight: 28,
            background: C('primary-container'), color: C('on-primary-container'), boxShadow: 'var(--ds-edge)',
            fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>
            <span className="md-state" />{hero.name} ↑ ›
          </button>
        </div>

        {/* 관찰 카드 */}
        <MdCard variant="filled" style={{ padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 11 }}>
            <SbHead size={40} expression="positive" track={false} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
                지난주와 비교했어요. {GR_OBS[hero.id] || '이번 주도 꾸준했어요.'}
              </div>
              <div style={{ marginTop: 12 }}>
                <MdButton variant={saved ? 'outlined' : 'filled'} size="s" icon={saved ? 'check' : 'add'} disabled={saved}
                onClick={() => setSaved(true)}>{saved ? '담았어요' : '루틴으로 담기'}</MdButton>
              </div>
              {!saved && <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8, wordBreak: 'keep-all' }}>{GR_STEPS[hero.id] || '오늘 한 줄 돌아보기'}</div>}
            </div>
          </div>
        </MdCard>

        <div className="md-interactive" onClick={() => go('imagine')}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginTop: 10, cursor: 'pointer',
          background: C('surface-container'), boxShadow: 'var(--ds-edge)' }}>
          <span className="md-state" />
          <Icon name="auto_awesome" size={18} style={{ color: 'var(--ds-nebula)' }} />
          <span style={{ flex: 1, fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>이번 주 상상 한 조각을 첫 걸음으로?</span>
          <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
        </div>

        <div style={{ marginTop: 14 }}>
          <MdButton variant="text" full size="s" icon="cached" disabled={busy}
          onClick={() => { setBusy(true); env && env.startJob && env.startJob('별을 다시 살펴보는 중', { doneMsg: '다시 살펴봤어요', action: '결과 보기', goTo: 'growth' }); setTimeout(() => setBusy(false), 2600); }}>
            {busy ? '별을 다시 살펴보는 중' : '별 다시 살펴보기'}
          </MdButton>
          {busy && <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 6 }}>끝나면 알려줄게요. 앱은 그대로 써도 돼요.</div>}
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /reading 내 책장 (Google Books 실제 API) ===================== */
function ReadingScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useLd('filled');
  const [q, setQ] = useLd('');
  const [results, setResults] = useLd([]);
  const [searching, setSearching] = useLd(false);
  const [shelf, setShelf] = useLd([
  { id: 'b1', title: '몰입의 즐거움', author: '미하이 칙센트미하이', status: 'reading', pct: 46 },
  { id: 'b2', title: '아주 작은 습관의 힘', author: '제임스 클리어', status: 'want' },
  { id: 'b3', title: '생각에 관한 생각', author: '대니얼 카너먼', status: 'want' }]);
  const [banner, setBanner] = useLd(null);

  const search = () => {
    if (!q.trim()) return;
    setSearching(true); setBanner(null);
    fetch('https://www.googleapis.com/books/v1/volumes?maxResults=6&q=' + encodeURIComponent(q))
      .then((r) => r.json())
      .then((j) => {
        const items = (j.items || []).map((it) => {
          const v = it.volumeInfo || {};
          return { id: it.id, title: String(v.title || '제목 없음').slice(0, 80),
            author: (v.authors || []).join(', ').slice(0, 60) || '저자 미상' };
        });
        setResults(items); setSearching(false);
      })
      .catch(() => { setSearching(false); setBanner('검색하지 못했어요. 잠시 후 다시 시도해 주세요.'); });
  };
  const add = (b) => {
    if (state === 'error') { setBanner('저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.'); return; }
    if (shelf.some((x) => x.id === b.id)) return;
    setShelf((s) => [...s, { ...b, status: 'want' }]);
  };
  const setStatus = (id, st) => setShelf((s) => s.map((x) => x.id === id ? { ...x, status: st, pct: st === 'reading' ? 0 : x.pct } : x));

  const reading = shelf.find((x) => x.status === 'reading');
  const want = shelf.filter((x) => x.status === 'want');

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="기록이 쌓이면 걸음을 골라줄게요" />;
    if (state === 'error' && !banner) return <StateView state="error" title="잠시 불러오지 못했어요" body="네트워크를 확인해 주세요" cta={() => setState('filled')} ctaLabel="다시 시도" />;
    return (
      <React.Fragment>
        {banner && <div className="px-frame" style={{ padding: 11, marginBottom: 12, background: C('surface-container-low') }}>
          <span className="md-body-small" style={{ color: C('error'), wordBreak: 'keep-all' }}>{banner}</span></div>}

        <div style={{ marginTop: 10 }}>
          <AuField label="제목 · 저자 검색" value={q} onChange={setQ} ph="몰입"
          trailing={<button onClick={search} disabled={searching} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)' }}>{searching ? '…' : '검색'}</button>} />
        </div>

        {results.length > 0 &&
        <MdCard variant="filled" style={{ padding: 4, marginTop: 10 }}>
          {results.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>
              </span>
              <MdButton variant="outlined" size="s" icon="add" onClick={() => add(b)}>담기</MdButton>
            </div>))}
        </MdCard>}

        {reading &&
        <MdCard variant="filled" style={{ padding: 16, marginTop: 12 }}>
          <div className="md-label-medium" style={{ color: 'var(--ds-nebula)', marginBottom: 6 }}>NOW READING</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all' }}>{reading.title}</div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 3 }}>{reading.author}</div>
          <div style={{ marginTop: 12 }}><ProgressLinear value={reading.pct || 0} /></div>
          <div style={{ marginTop: 12 }}><MdButton variant="outlined" full size="s" icon="check" onClick={() => setStatus(reading.id, 'done')}>다 읽었어요</MdButton></div>
        </MdCard>}

        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 8px' }}>읽고 싶은 책</div>
        {state === 'empty' || want.length === 0 ?
        <StateView state="empty" title="아직 추천이 없어요" body="무슨 책을 읽고 있나요?" /> :
        <MdCard variant="filled" style={{ padding: 4 }}>
          {want.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>
              </span>
              <MdButton variant="tonal" size="s" onClick={() => setStatus(b.id, 'reading')}>읽는 중으로</MdButton>
            </div>))}
        </MdCard>}
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /meals 이번 주 식단 ===================== */
const ML_DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const ML_SLOTS = [['b', '아침'], ['l', '점심'], ['d', '저녁']];
const ML_IDEAS = ['비빔밥', '된장찌개', '샐러드 볼', '김치찌개', '연어 스테이크', '두부 덮밥', '닭가슴살 샐러드', '미역국'];

function MealsScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useLd('filled');
  const [week, setWeek] = useLd(0);
  const [meals, setMeals] = useLd({ '0-b': '오트밀', '0-l': '비빔밥', '1-l': '샐러드 볼', '2-d': '된장찌개', '4-l': '김치찌개' });
  const [sheet, setSheet] = useLd(null);
  const [draft, setDraft] = useLd('');
  const [banner, setBanner] = useLd(null);

  const open = (d, s) => { setSheet({ d, s }); setDraft(meals[`${d}-${s}`] || ''); };
  const save = () => {
    if (state === 'error') { setBanner('저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.'); setSheet(null); return; }
    setBanner(null);
    const k = `${sheet.d}-${sheet.s}`;
    setMeals((m) => { const n = { ...m }; if (draft.trim()) n[k] = draft.trim(); else delete n[k]; return n; });
    setSheet(null);
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="이번 주를 펴는 중이에요…" />;
    if (state === 'error' && !banner) return <StateView state="error" title="이번 주를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    const cells = state === 'empty' ? {} : meals;
    return (
      <React.Fragment>
        {banner && <div className="px-frame" style={{ padding: 11, marginBottom: 12, background: C('surface-container-low') }}>
          <span className="md-body-small" style={{ color: C('error'), wordBreak: 'keep-all' }}>{banner}</span></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 12px' }}>
          <MdIconButton name="chevron_left" title="지난 주" onClick={() => setWeek((w) => w - 1)} />
          <span style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>
            {week === 0 ? '8월 10일 – 16일' : week < 0 ? '지난 주' : '다음 주'}
          </span>
          <MdIconButton name="chevron_right" title="다음 주" onClick={() => setWeek((w) => w + 1)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(3,1fr)', gap: 4 }}>
          <span />
          {ML_SLOTS.map(([k, l]) => (
            <span key={k} style={{ textAlign: 'center', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), paddingBottom: 2 }}>{l}</span>))}
          {ML_DAYS.map((d, di) => (
            <React.Fragment key={d}>
              <span style={{ display: 'grid', placeItems: 'center', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10,
                color: di === 1 ? 'var(--ds-core)' : C('on-surface-variant') }}>{d}</span>
              {ML_SLOTS.map(([sk]) => {
                const v = cells[`${di}-${sk}`];
                return (
                  <button key={sk} onClick={() => open(di, sk)} className="md-interactive"
                  style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 46, padding: '4px 3px',
                    background: v ? C('surface-container-high') : C('surface-container-low'), boxShadow: 'var(--ds-edge)',
                    color: v ? C('on-surface') : C('on-surface-variant'), fontSize: 10, fontFamily: 'var(--font-micro)',
                    lineHeight: 1.25, wordBreak: 'keep-all', overflow: 'hidden' }}>
                    <span className="md-state" />{v || '＋'}
                  </button>);
              })}
            </React.Fragment>))}
        </div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          영양 수치는 참고용이에요 · 식이·의료 조언이 아닙니다.
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
      {sheet &&
      <div onClick={() => setSheet(null)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', padding: '16px 18px 20px', margin: 'var(--u)' }}>
          <div aria-hidden="true" style={{ width: 32, height: 'var(--u)', background: 'var(--c03)', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 4 }}>끼니 입력</div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginBottom: 12 }}>
            {ML_DAYS[sheet.d]}요일 · {(ML_SLOTS.find((s) => s[0] === sheet.s) || [])[1]}
          </div>
          <AuField label="지금 뭐 먹지?" value={draft} onChange={setDraft} ph="비빔밥" />
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '14px 0 6px' }}>아이디어</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ML_IDEAS.slice(0, 6).map((x) => <MdChip key={x} onClick={() => setDraft(x)}>{x}</MdChip>)}
          </div>
          <div style={{ marginTop: 16 }}><MdButton variant="filled" full onClick={save}>저장</MdButton></div>
        </div>
      </div>}
    </div>);
}

Object.assign(window, { GrowthScreen, ReadingScreen, MealsScreen });

/* ===================== /peer-invites 나를 아는 사람들에게 묻기 ===================== */
const PI_KINDS = ['친구', '가족', '동료', '연인', '기타'];
const PI_STATUS = { pending: ['대기 중', 'var(--ds-core)'], answered: ['응답함', 'var(--ok)'], declined: ['거절', 'var(--fg-muted)'],
  withdrawn: ['철회됨', 'var(--fg-muted)'], expired: ['만료', 'var(--warn)'] };
const PI_MAX = 5;

function PeerInvitesScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useLd('filled');
  const [kind, setKind] = useLd('친구');
  const [label, setLabel] = useLd('');
  const [busy, setBusy] = useLd(false);
  const [err, setErr] = useLd(null);
  const [list, setList] = useLd([
  { id: 'p1', label: '대학 동기', kind: '친구', status: 'answered', when: '3일 전' },
  { id: 'p2', label: '팀 선배', kind: '동료', status: 'pending', when: '어제' },
  { id: 'p3', label: '누나', kind: '가족', status: 'pending', when: '5일 전' }]);

  const pending = list.filter((x) => x.status === 'pending').length;
  const atMax = pending >= PI_MAX;
  const create = () => {
    if (state === 'error') { setErr('링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setBusy(true); setErr(null);
    setTimeout(() => {
      setBusy(false);
      setList((s) => [{ id: 'n' + Date.now(), label: label.trim() || kind, kind, status: 'pending', when: '방금' }, ...s]);
      setLabel('');
    }, 700);
  };
  const withdraw = (id) => {
    if (state === 'error') { setErr('회수하지 못했어요. 초대 링크는 아직 살아 있어요. 다시 시도해 주세요.'); return; }
    setErr(null);
    setList((s) => s.map((x) => x.id === id ? { ...x, status: 'withdrawn' } : x));
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="불러오는 중…" />;
    return (
      <React.Fragment>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '10px 0 12px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          나를 아는 사람에게 일회용 링크를 보내요. 세 명 이상 답하면 합산 그림이 보여지는 나 렌즈에 나타나요. 개별 답변은 볼 수 없어요.
        </div>

        <div className="px-frame" style={{ padding: 14, background: C('surface-container-low') }}>
          <AuField label="이 사람을 부를 별칭 (나만 보여요)" value={label} onChange={setLabel} ph="예) 대학 동기" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
            {PI_KINDS.map((k) => <MdChip key={k} variant="filter" selected={kind === k} onClick={() => setKind(k)}>{k}</MdChip>)}
          </div>
          {atMax && <div className="md-body-small" style={{ color: C('error'), marginBottom: 10, wordBreak: 'keep-all' }}>
            열려 있는 초대가 최대예요. 하나를 회수하면 새로 보낼 수 있어요.</div>}
          {err && <div className="md-body-small" style={{ color: C('error'), marginBottom: 10, wordBreak: 'keep-all' }}>{err}</div>}
          <MdButton variant="filled" full icon="share" disabled={busy || atMax} onClick={create}>{busy ? '만드는 중…' : '링크 만들어 공유'}</MdButton>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            링크는 1회용이고 14일 뒤 만료돼요.
          </div>
        </div>

        {state === 'empty' || list.length === 0 ?
        <StateView state="empty" title="아직 초대가 없어요." body="나를 잘 아는 한 사람부터 시작해 보세요." /> :
        <React.Fragment>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 8px' }}>보낸 초대</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {list.map((x, i) => {
              const [lb, col] = PI_STATUS[x.status];
              return (
                <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{x.label}</span>
                    <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{x.kind} · {x.when}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: col, flex: '0 0 auto' }}>{lb}</span>
                  {x.status === 'pending' && <MdButton variant="outlined" size="s" onClick={() => withdraw(x.id)}>회수</MdButton>}
                </div>);
            })}
          </MdCard>
        </React.Fragment>}
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          답변은 세 명 이상이 모였을 때 합산 그림으로만, 보여지는 나 렌즈에 나타나요.
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>나를 아는 사람들에게 묻기</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}
window.PeerInvitesScreen = PeerInvitesScreen;
