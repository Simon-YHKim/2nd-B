/* ============================================================
   2nd-Brain · F그룹 — 커리어 · 재정 (브리프 08-careerfin.md)
   - CareerScreen      : /career 커리어 타임라인 + 성과 담기
   - MilestonesScreen  : /milestones 목표 (계획→진행중→완료 순환)
   - LedgerScreen      : /ledger 이번 달 점검 (가계부)
   - SideProjectScreen : /side-project GitHub 공개 활동 (실제 API)
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useCf } = React;

/* ===================== /career 커리어 ===================== */
const CAREER_SEED = [
{ id: 'a1', year: 2025, title: '팀 온보딩 프로세스 재설계', role: '리드', impact: '신규 입사자 적응 기간 6주 → 3주' },
{ id: 'a2', year: 2024, title: '결제 실패율 개선 프로젝트', role: '백엔드', impact: '실패율 4.2% → 1.1%' },
{ id: 'a3', year: 2024, title: '사내 기술 세미나 시작', role: '기획·진행', impact: '분기 4회 정착, 참여 평균 32명' },
{ id: 'a4', year: 2022, title: '첫 정규 입사', role: '주니어 개발자', impact: '' }];
const CAREER_SIDE = ['학력', '병역', '수상', '자격', '경력'];

function CareerScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCf('filled');
  const [rows, setRows] = useCf(CAREER_SEED);
  const [adding, setAdding] = useCf(false);
  const [track, setTrack] = useCf('main');
  const [f, setF] = useCf({ title: '', role: '', impact: '', year: '' });
  const [err, setErr] = useCf(null);
  const [busy, setBusy] = useCf(false);

  const yearBad = f.year !== '' && !/^\d{4}$/.test(f.year);
  const canSave = f.title.trim() && !yearBad && !busy;
  const save = () => {
    if (state === 'error') { setErr('저장하지 못했어요. 다시 시도해 주세요.'); return; }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setRows((s) => [{ id: 'n' + Date.now(), year: parseInt(f.year || '2026', 10), title: f.title, role: f.role, impact: f.impact }, ...s]);
      setF({ title: '', role: '', impact: '', year: '' }); setAdding(false); setErr(null);
    }, 700);
  };
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="타임라인을 펴는 중…" />;
    if (state === 'error' && !adding) return <StateView state="error" title="타임라인을 잠깐 못 불러왔어요" body="별가루는 그대로 있으니 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    return (
      <React.Fragment>
        <div style={{ display: 'flex', gap: 6, padding: '10px 0 12px' }}>
          <span style={{ flex: 1 }}><MdButton variant={adding ? 'outlined' : 'filled'} full size="s" icon={adding ? 'close' : 'add'}
          onClick={() => setAdding((v) => !v)}>{adding ? '닫기' : '성과 담기'}</MdButton></span>
          <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" icon="open_in_full" onClick={() => go('drilldown')}>Drill Down</MdButton></span>
        </div>

        {adding &&
        <div className="px-frame" style={{ padding: 14, background: C('surface-container-low'), marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <AuField label="성과 (필수)" value={f.title} onChange={(v) => setF((s) => ({ ...s, title: v }))} ph="무엇을 해냈나요?" />
            <AuField label="역할" value={f.role} onChange={(v) => setF((s) => ({ ...s, role: v }))} ph="그때 나의 역할" />
            <AuField label="임팩트" value={f.impact} onChange={(v) => setF((s) => ({ ...s, impact: v }))} ph="무엇이 달라졌나요? 수치가 있다면 함께" />
            <AuField label="연도" value={f.year} onChange={(v) => setF((s) => ({ ...s, year: v.replace(/\D/g, '').slice(0, 4) }))}
            ph="예: 2023 (비우면 오늘 기준)" hint={yearBad ? '네 자리 연도로 적어 주세요' : null} hintTone="error" />
          </div>
          {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><MdButton variant="filled" full disabled={!canSave} onClick={save}>{busy ? '저장 중…' : '담기'}</MdButton></div>
        </div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="md-label-medium" style={{ color: C('on-surface-variant'), flex: '0 0 auto' }}>쌓아온 길</span>
          <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {[['main', '메인'], ['side', '사이드']].map(([k, l]) => (
              <button key={k} onClick={() => setTrack(k)} className="md-interactive"
              style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '5px 12px', minHeight: 30,
                background: track === k ? C('primary') : C('surface-container-highest'),
                color: track === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
                <span className="md-state" />{l}
              </button>))}
          </span>
        </div>

        {track === 'side' ?
        <MdCard variant="outlined" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {CAREER_SIDE.map((x) => (
              <span key={x} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '4px 9px',
                background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>{x}</span>))}
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
            학력·병역·수상·자격·경력 같은 공식 이력은 연동하면 여기에 자동으로 정리돼요. 지금은 메인에서 직접 담은 성과가 쌓여요.
          </div>
        </MdCard> :
        state === 'empty' || rows.length === 0 ?
        <MdCard variant="outlined" style={{ padding: 18, textAlign: 'center' }}>
          <Icon name="rocket_launch" size={28} style={{ color: 'var(--ds-core)' }} />
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            아직 커리어 별가루가 없어요. 지난 성과부터 하나 담아 보세요. 커리어 별이 밝아져요.
          </div>
        </MdCard> :
        years.map((y) => (
          <div key={y} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 15, fontWeight: 700, color: 'var(--ds-core)' }}>{y}</span>
              <span style={{ flex: 1, height: 'var(--u)', background: C('outline-variant') }} />
            </div>
            {rows.filter((r) => r.year === y).map((r) => (
              <MdCard key={r.id} variant="filled" style={{ padding: 13, marginBottom: 6 }}
              onClick={() => go('record', window.SB.RECORDS[0])}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all' }}>{r.title || '(제목 없음)'}</div>
                {r.role && <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-nebula)', marginTop: 3 }}>{r.role}</div>}
                {r.impact && <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 5, wordBreak: 'keep-all' }}>{r.impact}</div>}
              </MdCard>))}
          </div>))}
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>커리어</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /milestones 목표 ===================== */
const MS_SEED = {
  learning_goals: [
  { id: 'm1', title: '영어 발표 스크립트 없이 하기', due: '2026-09-30', status: 'doing' },
  { id: 'm2', title: '알고리즘 주 3회 풀기', due: '', status: 'todo' },
  { id: 'm3', title: '기술 블로그 첫 글', due: '2026-07-20', status: 'done' }],
  career_check: [
  { id: 'm4', title: '분기 성과 정리', due: '2026-09-01', status: 'doing' },
  { id: 'm5', title: '멘토 커피챗 2회', due: '', status: 'todo' }]
};
const MS_STATUS = { todo: ['계획', 'var(--c04)'], doing: ['진행 중', 'var(--ds-core)'], done: ['완료', 'var(--ok)'] };

function MilestonesScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCf('filled');
  const [dom, setDom] = useCf('learning_goals');
  const [data, setData] = useCf(MS_SEED);
  const [title, setTitle] = useCf('');
  const [due, setDue] = useCf('');
  const [edit, setEdit] = useCf(null);
  const [banner, setBanner] = useCf(null);

  const list = data[dom];
  const doneN = list.filter((x) => x.status === 'done').length;
  const write = (fn) => {
    if (state === 'error') { setBanner('저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.'); return; }
    setBanner(null); fn();
  };
  const add = () => write(() => {
    if (!title.trim()) return;
    setData((s) => ({ ...s, [dom]: [...s[dom], { id: 'n' + Date.now(), title, due, status: 'todo' }] }));
    setTitle(''); setDue('');
  });
  const cycle = (id) => write(() => setData((s) => ({ ...s, [dom]: s[dom].map((x) =>
    x.id === id ? { ...x, status: x.status === 'todo' ? 'doing' : x.status === 'doing' ? 'done' : 'todo' } : x) })));
  const saveEdit = () => write(() => {
    setData((s) => ({ ...s, [dom]: s[dom].map((x) => x.id === edit.id ? { ...x, title: edit.title, due: edit.due } : x) }));
    setEdit(null);
  });

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="기록이 쌓이면 걸음을 골라줄게요" />;
    if (state === 'error' && !banner) return <StateView state="error" title="잠시 불러오지 못했어요" body="네트워크를 확인해 주세요" cta={() => setState('filled')} ctaLabel="다시 시도" />;
    return (
      <React.Fragment>
        {banner && <div className="px-frame" style={{ padding: 11, marginBottom: 12, background: C('surface-container-low') }}>
          <span className="md-body-small" style={{ color: C('error'), wordBreak: 'keep-all' }}>{banner}</span></div>}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[['learning_goals', '배움'], ['career_check', '커리어 점검']].map(([k, l]) => (
            <button key={k} onClick={() => setDom(k)} className="md-interactive"
            style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 34,
              background: dom === k ? C('primary') : C('surface-container-highest'),
              color: dom === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
              <span className="md-state" />{l}
            </button>))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span className="md-label-medium" style={{ color: C('on-surface-variant'), flex: '0 0 auto' }}>다음 한 걸음</span>
          <span style={{ flex: 1 }}><ProgressLinear value={list.length ? Math.round(doneN / list.length * 100) : 0} /></span>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), flex: '0 0 auto' }}>{doneN}/{list.length}</span>
        </div>
        <div className="px-frame" style={{ padding: 12, background: C('surface-container-low'), marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AuField label="목표" value={title} onChange={setTitle} ph="목표 이름을 적어 주세요" />
            <AuField label="마감일" value={due} onChange={setDue} ph="2026-09-30"
            trailing={due ? <button onClick={() => setDue('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)' }}>지우기</button> : null} />
          </div>
          <div style={{ marginTop: 12 }}><MdButton variant="filled" full size="s" icon="add" disabled={!title.trim()} onClick={add}>＋ 기록 담기</MdButton></div>
        </div>
        {state === 'empty' || list.length === 0 ?
        <StateView state="empty" title="아직 추천이 없어요" body="목표" /> :
        <MdCard variant="filled" style={{ padding: 4 }}>
          {list.map((x, i) => {
            const [lb, col] = MS_STATUS[x.status];
            const over = x.due && x.status !== 'done' && x.due < '2026-08-11';
            const ed = edit && edit.id === x.id;
            return (
              <div key={x.id} style={{ padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                {ed ?
                <React.Fragment>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AuField label="목표 이름 바꾸기" value={edit.title} onChange={(v) => setEdit((s) => ({ ...s, title: v }))} ph="목표 이름" />
                    <AuField label="마감일" value={edit.due} onChange={(v) => setEdit((s) => ({ ...s, due: v }))} ph="2026-09-30" />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setEdit(null)}>취소</MdButton></span>
                    <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={saveEdit}>저장</MdButton></span>
                  </div>
                </React.Fragment> :
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span onClick={() => setEdit({ id: x.id, title: x.title, due: x.due })} className="md-interactive"
                  style={{ position: 'relative', flex: 1, minWidth: 0, cursor: 'pointer', padding: '2px 0' }}>
                    <span className="md-state" />
                    <span style={{ display: 'block', fontSize: 12, color: C('on-surface'),
                      textDecoration: x.status === 'done' ? 'line-through' : 'none', wordBreak: 'keep-all' }}>{x.title}</span>
                    {x.due && <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, marginTop: 2,
                      color: over ? C('error') : C('on-surface-variant') }}>{x.due}{over ? ' · 마감 지남' : ''}</span>}
                  </span>
                  <button onClick={() => cycle(x.id)} className="md-interactive"
                  style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '5px 10px', minHeight: 30, flex: '0 0 auto',
                    background: C('surface-container-highest'), color: col, boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
                    <span className="md-state" />{lb}
                  </button>
                </div>}
              </div>);
          })}
        </MdCard>}
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /ledger 이번 달 점검 ===================== */
const LG_SEED = [
{ id: 'l1', on: '2026-08-02', kind: 'income', amt: 3800000, cat: '급여' },
{ id: 'l2', on: '2026-08-03', kind: 'expense', amt: 620000, cat: '주거' },
{ id: 'l3', on: '2026-08-04', kind: 'expense', amt: 284000, cat: '식비' },
{ id: 'l4', on: '2026-08-06', kind: 'expense', amt: 96000, cat: '교통' },
{ id: 'l5', on: '2026-08-08', kind: 'expense', amt: 148000, cat: '문화' },
{ id: 'l6', on: '2026-08-10', kind: 'expense', amt: 72000, cat: '식비' }];
const won = (n) => n.toLocaleString('ko-KR');

function LedgerScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCf('filled');
  const [rows, setRows] = useCf(LG_SEED);
  const [kind, setKind] = useCf('expense');
  const [on, setOn] = useCf('2026-08-11');
  const [amt, setAmt] = useCf('');
  const [cat, setCat] = useCf('');
  const [banner, setBanner] = useCf(null);

  const income = rows.filter((r) => r.kind === 'income').reduce((a, b) => a + b.amt, 0);
  const expense = rows.filter((r) => r.kind === 'expense').reduce((a, b) => a + b.amt, 0);
  const byCat = Object.entries(rows.filter((r) => r.kind === 'expense').reduce((m, r) => { m[r.cat] = (m[r.cat] || 0) + r.amt; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const maxCat = byCat.length ? byCat[0][1] : 1;

  const add = () => {
    if (state === 'error') { setBanner('저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.'); return; }
    const n = parseInt(String(amt).replace(/\D/g, ''), 10);
    if (!n || n <= 0) return;
    setBanner(null);
    setRows((s) => [{ id: 'n' + Date.now(), on, kind, amt: n, cat: cat.trim() || '기타' }, ...s]);
    setAmt(''); setCat(''); setOn('2026-08-11');
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="…" />;
    if (state === 'error' && !banner) return <StateView state="error" title="잠시 불러오지 못했어요" body="네트워크를 확인해 주세요" cta={() => setState('filled')} ctaLabel="다시 시도" />;
    return (
      <React.Fragment>
        {banner && <div className="px-frame" style={{ padding: 11, marginBottom: 12, background: C('surface-container-low') }}>
          <span className="md-body-small" style={{ color: C('error'), wordBreak: 'keep-all' }}>{banner}</span></div>}
        <MdCard variant="filled" style={{ padding: 16, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {[['수입', income, 'var(--ok)'], ['지출', expense, 'var(--warn)'], ['잔여', income - expense, 'var(--ds-core)']].map(([l, v, col]) => (
              <div key={l} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{l}</div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: col, marginTop: 4 }}>{won(v)}</div>
              </div>))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '3px 9px',
              background: C('surface-container-highest'), color: 'var(--ok)', boxShadow: 'var(--ds-edge)' }}>전월 대비 ▼ 8%</span>
          </div>
        </MdCard>

        <div className="px-frame" style={{ padding: 12, background: C('surface-container-low'), marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 11 }}>
            {[['expense', '지출'], ['income', '수입']].map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className="md-interactive"
              style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 32,
                background: kind === k ? C('primary') : C('surface-container-highest'),
                color: kind === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
                <span className="md-state" />{l}
              </button>))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AuField label="날짜" value={on} onChange={setOn} ph="2026-08-11" />
            <AuField label="금액" value={amt} onChange={(v) => setAmt(v.replace(/\D/g, ''))} ph="0" />
            <AuField label="분류 (예: 식비)" value={cat} onChange={setCat} ph="기타" />
          </div>
          <div style={{ marginTop: 12 }}><MdButton variant="filled" full size="s" icon="add" onClick={add}>추가</MdButton></div>
        </div>

        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 8px' }}>분류별 지출</div>
        {state === 'empty' || byCat.length === 0 ?
        <StateView state="empty" title="아직 추천이 없어요" body="기록" /> :
        <MdCard variant="filled" style={{ padding: 14 }}>
          {byCat.map(([c, v]) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ flex: '0 0 auto', width: 46, fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>{c}</span>
              <span style={{ flex: 1, height: 10, background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.round(v / maxCat * 100) + '%', background: 'var(--ds-core)' }} />
              </span>
              <span style={{ flex: '0 0 auto', width: 62, textAlign: 'right', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface') }}>{won(v)}</span>
            </div>))}
        </MdCard>}

        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 8px' }}>이번 달 내역</div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span style={{ flex: '0 0 auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{r.on.slice(5)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface') }}>{r.cat}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, flex: '0 0 auto',
                color: r.kind === 'income' ? 'var(--ok)' : C('on-surface') }}>{r.kind === 'income' ? '+' : '−'}{won(r.amt)}</span>
              <MdIconButton name="close" title="내역 삭제" onClick={() => setRows((s) => s.filter((x) => x.id !== r.id))} />
            </div>))}
        </MdCard>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 12 }}>다통화는 자동 환산돼요 (FX).</div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /side-project GitHub (실제 공개 API) ===================== */
function SideProjectScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCf('filled');
  const [handle, setHandle] = useCf(() => { try { return localStorage.getItem('sb_gh_handle') || ''; } catch (e) { return ''; } });
  const [input, setInput] = useCf(handle);
  const [data, setData] = useCf(null);
  const [phase, setPhase] = useCf(handle ? 'loading' : 'unlinked'); // unlinked | loading | linked | rate

  const load = React.useCallback((h) => {
    if (!h) return;
    setPhase('loading');
    fetch(`https://api.github.com/users/${encodeURIComponent(h)}/events/public`)
      .then((r) => { if (!r.ok) throw new Error(r.status === 403 ? 'rate' : 'err'); return r.json(); })
      .then((ev) => {
        const pushes = ev.filter((e) => e.type === 'PushEvent');
        const now = Date.now(), day = 864e5;
        const heat = Array.from({ length: 14 }, (_, i) => 0);
        const repos = {};
        let week = 0;
        pushes.forEach((e) => {
          const d = Math.floor((now - new Date(e.created_at).getTime()) / day);
          const n = (e.payload && e.payload.commits ? e.payload.commits.length : 1);
          if (d < 14) heat[13 - d] += n;
          if (d < 7) week += n;
          if (e.repo) repos[e.repo.name] = (repos[e.repo.name] || 0) + n;
        });
        setData({ week, heat, days: heat.filter(Boolean).length, repos: Object.entries(repos).sort((a, b) => b[1] - a[1]).slice(0, 5) });
        setPhase('linked');
        try { localStorage.setItem('sb_gh_handle', h); } catch (e) {}
        setHandle(h);
      })
      .catch((e) => setPhase(e.message === 'rate' ? 'rate' : 'rate'));
  }, []);
  React.useEffect(() => { if (handle) load(handle); }, []);

  const body = () => {
    if (state === 'loading' || phase === 'loading') return <StateView state="loading" body="공개 활동을 불러오는 중이에요…" />;
    if (state === 'error' || phase === 'rate') return (
      <StateView state="error" title="잠시만요" body="요청이 많아 잠깐 쉬어가요 · 곧 다시" cta={() => load(input)} ctaLabel="다시 시도" />);
    if (state === 'empty' || phase === 'unlinked' || !data) return (
      <React.Fragment>
        <div style={{ marginTop: 12 }}><AuField label="GitHub @사용자명" value={input} onChange={setInput} ph="octocat" /></div>
        <StateView state="empty" title="아직 연결 안 됐어요" body="연결하면 자동으로, 아니면 직접 적어요"
        cta={() => load(input.trim())} ctaLabel="연결하기" icon="code" />
      </React.Fragment>);
    const max = Math.max(1, ...data.heat);
    return (
      <React.Fragment>
        <div style={{ marginTop: 12 }}>
          <AuField label="GitHub @사용자명" value={input} onChange={setInput} ph="octocat"
          trailing={<button onClick={() => load(input.trim())} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)' }}>연결</button>} />
        </div>
        <MdCard variant="filled" style={{ padding: 16, marginTop: 12 }}>
          <div className="md-label-medium" style={{ color: 'var(--ds-nebula)', marginBottom: 8 }}>THIS WEEK</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 30, fontWeight: 700, color: C('on-surface') }}>{data.week}</span>
            <span style={{ fontSize: 12, color: C('on-surface-variant') }}>커밋</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '3px 8px',
              background: C('surface-container-highest'), color: 'var(--ok)', boxShadow: 'var(--ds-edge)' }}>활동 {data.days}일</span>
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 14 }}>
            {data.heat.map((v, i) => (
              <span key={i} style={{ flex: 1, height: 26, boxShadow: 'var(--ds-edge)',
                background: v === 0 ? C('surface-container-highest') : v / max > 0.66 ? 'var(--ds-star)' : v / max > 0.33 ? 'var(--ds-core)' : 'var(--accent-deep)' }} />))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>14일 전</span>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>오늘</span>
          </div>
        </MdCard>
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 8px' }}>저장소</div>
        {data.repos.length === 0 ?
        <StateView state="empty" title="최근 공개 커밋이 없어요" body="공개 저장소에 푸시하면 여기 나타나요." /> :
        <MdCard variant="filled" style={{ padding: 4 }}>
          {data.repos.map(([name, n], i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <Icon name="code" size={16} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', flex: '0 0 auto' }}>{n}</span>
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

Object.assign(window, { CareerScreen, MilestonesScreen, LedgerScreen, SideProjectScreen });
