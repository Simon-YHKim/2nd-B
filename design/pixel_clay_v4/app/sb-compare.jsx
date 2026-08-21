/* ============================================================
   2nd-Brain · 대조 화면 — 기존 구현 vs 브리프 판
   성격이 달라진 3쌍을 한 라우트에서 토글로 나란히 대조한다.
   - /rest    : 3상태 보드(브리프)  vs  hobbyinput(기존 취미·여가 기록)
   - /people  : 궤도형 인물맵(브리프) vs relcontacts(기존 주소록)
   - /digest  : 오늘의 정리(브리프)   vs digest(기존 주간 다이제스트)
   CompareShell 이 상단 토글 + 차이 요약을 얹고 아래에 각 판을 렌더한다.
   ============================================================ */
const { useState: useCm } = React;

/* ── 대조 셸 ── */
function CompareShell({ title, diff, current, brief, existing, onBack }) {
  const C = window.SB.C;
  const [side, setSide] = useCm('brief');
  const [note, setNote] = useCm(true);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <span className="md-title-large" style={{ color: C('on-surface'), flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>

      {/* 대조 토글 */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 8px', flex: '0 0 auto' }}>
        {[['brief', '새 · 브리프 판'], ['existing', '기존 · 현재 앱']].map(([k, l]) => {
          const on = side === k;
          return (
            <button key={k} onClick={() => setSide(k)} className="md-interactive"
            style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 38,
              background: on ? (k === 'brief' ? 'var(--ds-core)' : C('surface-container-high')) : C('surface-container-low'),
              color: on ? (k === 'brief' ? 'var(--c01)' : C('on-surface')) : C('on-surface-variant'),
              boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)', fontWeight: on ? 700 : 400 }}>
              <span className="md-state" />{l}
            </button>);
        })}
      </div>

      {/* 차이 요약 */}
      {note &&
      <div style={{ margin: '0 12px 8px', padding: '9px 11px', background: C('surface-container-low'), boxShadow: 'var(--ds-edge)', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Icon name="info" size={14} style={{ color: 'var(--ds-nebula)', flex: '0 0 auto', marginTop: 1 }} />
          <span style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), lineHeight: 1.5, wordBreak: 'keep-all' }}>{diff}</span>
          <button onClick={() => setNote(false)} aria-label="닫기"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C('on-surface-variant'), display: 'inline-flex', flex: '0 0 auto' }}>
            <Icon name="close" size={13} />
          </button>
        </div>
      </div>}

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          {side === 'brief' ? brief : existing}
        </div>
      </div>
    </div>);
}

/* ===================== /rest 휴식 — 3상태 보드 (브리프 판) ===================== */
const RB_CATS = ['게임', '영화', '음악', '여행', '공연', '취미', '그 밖에'];
const RB_STATUS = [['want', '하고 싶어요'], ['doing', '하는 중'], ['done', '했어요']];
const RB_SEED = [
{ id: 'r1', title: '젤다의 전설', cat: '게임', status: 'doing' },
{ id: 'r2', title: '제주 여행', cat: '여행', status: 'want' },
{ id: 'r3', title: '피아노', cat: '취미', status: 'doing' },
{ id: 'r4', title: '듄 파트2', cat: '영화', status: 'done', rating: 5 },
{ id: 'r5', title: '재즈 페스티벌', cat: '공연', status: 'want' },
{ id: 'r6', title: '주말 등산', cat: '취미', status: 'done', rating: 4 }];

function RestBoardScreen({ t, go }) {
  const C = window.SB.C;
  const [state, setState] = useCm('filled');
  const [items, setItems] = useCm(RB_SEED);
  const [adding, setAdding] = useCm(false);
  const [title, setTitle] = useCm('');
  const [cat, setCat] = useCm('게임');
  const [st, setSt] = useCm('want');
  const [err, setErr] = useCm(null);
  const [busy, setBusy] = useCm(false);

  const save = () => {
    if (state === 'error') { setErr('저장하지 못했어요. 다시 시도해 주세요.'); return; }
    if (!title.trim()) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false); setErr(null);
      setItems((s) => [{ id: 'n' + Date.now(), title: title.trim(), cat, status: st }, ...s]);
      setTitle(''); setAdding(false);
    }, 600);
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="펼치는 중…" />;
    if (state === 'error' && !adding) return <StateView state="error" title="불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    const list = state === 'empty' ? [] : items;
    return (
      <React.Fragment>
        <div style={{ padding: '10px 0 12px' }}>
          <MdButton variant={adding ? 'outlined' : 'filled'} full size="s" icon={adding ? 'close' : 'add'}
          onClick={() => setAdding((v) => !v)}>{adding ? '닫기' : '휴식 담기'}</MdButton>
        </div>

        {adding &&
        <div className="px-frame" style={{ padding: 14, background: C('surface-container-low'), marginBottom: 14 }}>
          <AuField label="무엇인가요? (필수)" value={title} onChange={setTitle} ph="예: 젤다, 제주 여행, 피아노" />
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>종류</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RB_CATS.map((c) => <MdChip key={c} variant="filter" selected={cat === c} onClick={() => setCat(c)}>{c}</MdChip>)}
          </div>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>상태</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
            {RB_STATUS.map(([k, l]) => (
              <button key={k} onClick={() => setSt(k)} className="md-interactive"
              style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 36,
                background: st === k ? C('primary') : C('surface-container-highest'),
                color: st === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
                <span className="md-state" />{l}
              </button>))}
          </div>
          {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><MdButton variant="filled" full disabled={!title.trim() || busy} onClick={save}>{busy ? '저장 중…' : '담기'}</MdButton></div>
        </div>}

        {list.length === 0 ?
        <MdCard variant="outlined" style={{ padding: 18, textAlign: 'center' }}>
          <Icon name="ac_unit" size={28} style={{ color: 'var(--ds-core)' }} />
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            아직 담긴 휴식이 없어요. 요즘 나를 쉬게 하는 것부터 담아 보세요. 휴식 별이 밝아져요.
          </div>
        </MdCard> :
        RB_STATUS.map(([k, l]) => {
          const rows = list.filter((x) => x.status === k);
          if (!rows.length) return null;
          return (
            <div key={k} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: k === 'doing' ? 'var(--ds-core)' : k === 'done' ? 'var(--ok)' : C('on-surface-variant') }}>{l}</span>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{rows.length}</span>
                <span style={{ flex: 1, height: 'var(--u)', background: C('outline-variant') }} />
              </div>
              <MdCard variant="filled" style={{ padding: 4 }}>
                {rows.map((x, i) => (
                  <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                    <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                      background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
                      <Icon name={x.cat === '게임' ? 'apps' : x.cat === '영화' ? 'play_circle' : x.cat === '음악' ? 'auto_awesome' :
                        x.cat === '여행' ? 'travel_explore' : x.cat === '공연' ? 'emoji_events' : 'palette'} size={14} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{x.title}</span>
                      <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>
                        {x.cat}{x.rating ? ` · 평점 ${x.rating}/5` : ''}
                      </span>
                    </span>
                    {k !== 'done' &&
                    <MdButton variant="outlined" size="s"
                    onClick={() => setItems((s) => s.map((y) => y.id === x.id ? { ...y, status: k === 'want' ? 'doing' : 'done', rating: k === 'doing' ? 4 : y.rating } : y))}>
                      {k === 'want' ? '하는 중' : '했어요'}
                    </MdButton>}
                  </div>))}
              </MdCard>
            </div>);
        })}
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--sb-lens-top, 4px) 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /people 관계 — 궤도형 인물맵 (브리프 판) ===================== */
const PM_KINDS = [['family', '가족'], ['partner', '파트너'], ['friend', '친구'], ['peer', '동료'], ['mentor', '멘토'], ['other', '그 밖에']];
const PM_COLOR = { family: 'var(--sb-mood-positive)', partner: 'var(--sb-mood-negative)', friend: 'var(--ds-core)',
  peer: 'var(--ds-polaris)', mentor: 'var(--warn)', other: 'var(--c05)' };
const PM_SEED = [
{ id: 'p1', name: '어머니', kind: 'family', close: 5, cadence: '주 1회', last: '3일 전' },
{ id: 'p2', name: '준호', kind: 'friend', close: 4, cadence: '월 2회', last: '1주 전' },
{ id: 'p3', name: '팀 선배', kind: 'peer', close: 3, cadence: '주 3회', last: '어제' },
{ id: 'p4', name: '유진', kind: 'partner', close: 5, cadence: '매일', last: '오늘' },
{ id: 'p5', name: '대학 은사', kind: 'mentor', close: 2, cadence: '분기 1회', last: '2달 전' },
{ id: 'p6', name: '동아리 후배', kind: 'friend', close: 2, cadence: '분기 1회', last: '6주 전' },
{ id: 'p7', name: '사촌 형', kind: 'family', close: 3, cadence: '월 1회', last: '3주 전' }];

function PeopleMapScreen({ t, go }) {
  const C = window.SB.C;
  const [state, setState] = useCm('filled');
  const [people, setPeople] = useCm(PM_SEED);
  const [adding, setAdding] = useCm(false);
  const [sel, setSel] = useCm(null);
  const [name, setName] = useCm('');
  const [kind, setKind] = useCm('friend');
  const [close, setClose] = useCm(3);
  const [err, setErr] = useCm(null);

  const save = () => {
    if (state === 'error') { setErr('저장하지 못했어요. 다시 시도해 주세요.'); return; }
    if (!name.trim()) return;
    setPeople((s) => [...s, { id: 'n' + Date.now(), name: name.trim(), kind, close, cadence: '—', last: '방금' }]);
    setName(''); setAdding(false); setErr(null);
  };

  /* 각도 = 관계 섹터, 반지름 = 가까움 역순 */
  const nodes = people.map((p, i) => {
    const ki = PM_KINDS.findIndex((k) => k[0] === p.kind);
    const inSector = people.filter((q) => q.kind === p.kind);
    const idx = inSector.findIndex((q) => q.id === p.id);
    const spread = inSector.length > 1 ? (idx / (inSector.length - 1) - 0.5) * 26 : 0;
    const ang = (ki * 60 - 90 + spread) * Math.PI / 180;
    const r = 12 + (5 - p.close) * 7.5;
    return { ...p, x: Math.round(50 + Math.cos(ang) * r), y: Math.round(50 + Math.sin(ang) * r) };
  });

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="지도를 펴는 중…" />;
    if (state === 'error' && !adding) return <StateView state="error" title="불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    const empty = state === 'empty' || people.length === 0;
    const selected = nodes.find((n) => n.id === sel);
    return (
      <React.Fragment>
        <div style={{ padding: '10px 0 12px' }}>
          <MdButton variant={adding ? 'outlined' : 'filled'} full size="s" icon={adding ? 'close' : 'person_add'}
          onClick={() => setAdding((v) => !v)}>{adding ? '닫기' : '사람 담기'}</MdButton>
        </div>

        {adding &&
        <div className="px-frame" style={{ padding: 14, background: C('surface-container-low'), marginBottom: 14 }}>
          <AuField label="이름 또는 부르는 말" value={name} onChange={setName} ph="예: 어머니, 준호" />
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>관계</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PM_KINDS.map(([k, l]) => <MdChip key={k} variant="filter" selected={kind === k} onClick={() => setKind(k)}>{l}</MdChip>)}
          </div>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>가까움 {close}/5</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} onClick={() => setClose(v)} className="md-interactive"
              style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 36,
                background: close === v ? C('primary') : C('surface-container-highest'),
                color: close === v ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)',
                fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>
                <span className="md-state" />{v}
              </button>))}
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            타인 정보는 내 기억을 위한 최소한만. 내 계정에만 저장돼요.
          </div>
          {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><MdButton variant="filled" full disabled={!name.trim()} onClick={save}>담기</MdButton></div>
        </div>}

        {empty ?
        <MdCard variant="outlined" style={{ padding: 18, textAlign: 'center' }}>
          <Icon name="group" size={28} style={{ color: 'var(--ds-core)' }} />
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            아직 담긴 사람이 없어요. 가까운 사람부터 하나씩 담아 보세요. 관계 별이 밝아져요.
          </div>
        </MdCard> :
        <React.Fragment>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 8 }}>관계 인물맵</div>
          <div style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 10 }}>
            <svg viewBox="0 0 100 100" shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: 250 }}>
              {/* 궤도 링 — 도트 원 */}
              {[12, 19.5, 27, 34.5, 42].map((r, ri) => (
                Array.from({ length: 48 }).map((_, k) => {
                  const a = k / 48 * Math.PI * 2;
                  return <rect key={ri + '-' + k} x={Math.round(50 + Math.cos(a) * r)} y={Math.round(50 + Math.sin(a) * r)}
                  width="1" height="1" fill="var(--c02)" />;
                })))}
              {/* 섹터 경계 */}
              {PM_KINDS.map((_, i) => {
                const a = (i * 60 - 120) * Math.PI / 180;
                return Array.from({ length: 9 }).map((_, k) => (
                  <rect key={i + '-s' + k} x={Math.round(50 + Math.cos(a) * (10 + k * 4))} y={Math.round(50 + Math.sin(a) * (10 + k * 4))}
                  width="1" height="1" fill="var(--c01)" />));
              })}
              {/* 중심 = 나 */}
              <rect x="47" y="47" width="6" height="6" fill="var(--ds-star)" />
              {/* 인물 노드 */}
              {nodes.map((n) => {
                const on = sel === n.id, sz = on ? 7 : 5;
                return (
                  <React.Fragment key={n.id}>
                    {on && <rect x={n.x - 5} y={n.y - 5} width="11" height="11" fill="var(--c02)" />}
                    <rect x={n.x - (sz >> 1)} y={n.y - (sz >> 1)} width={sz} height={sz} fill={PM_COLOR[n.kind]}
                    onClick={() => setSel(on ? null : n.id)} style={{ cursor: 'pointer' }} />
                  </React.Fragment>);
              })}
            </svg>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 4, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              가까움은 중심과의 거리, 관계 종류는 별빛 색으로 보여요.
            </div>
          </div>

          {selected &&
          <MdCard variant="filled" style={{ padding: 14, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, background: PM_COLOR[selected.kind], boxShadow: '0 0 0 var(--u) var(--edge)', flex: '0 0 auto' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: C('on-surface') }}>{selected.name}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>가까움 {selected.close}/5</span>
            </div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 6 }}>
              {(PM_KINDS.find((k) => k[0] === selected.kind) || [])[1]} · 연락 {selected.cadence} · 마지막 {selected.last}
            </div>
          </MdCard>}

          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '16px 0 6px' }}>범례</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PM_KINDS.map(([k, l]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, background: PM_COLOR[k], boxShadow: '0 0 0 var(--u) var(--edge)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>{l}</span>
              </span>))}
          </div>
        </React.Fragment>}
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--sb-lens-top, 4px) 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ── 대조 라우트 3종 ── */
function CompareRest({ t, go, env, onBack }) {
  return <CompareShell title="휴식" onBack={onBack}
  diff="브리프 판은 하고 싶어요 / 하는 중 / 했어요 3상태 보드예요. 기존 화면은 취미·여가를 항목별로 적는 입력 폼이에요."
  brief={<RestBoardScreen t={t} go={go} />}
  existing={window.HobbyInputScreen ? <window.HobbyInputScreen t={t} go={go} /> :
    <StateView state="empty" title="기존 화면을 찾을 수 없어요" body="hobbyinput 화면이 로드되지 않았어요." />} />;
}
function ComparePeople({ t, go, env, onBack }) {
  return <CompareShell title="관계" onBack={onBack}
  diff="브리프 판은 중심=나에서 가까움만큼 떨어진 궤도형 인물맵이에요. 기존 화면은 주소록 형태의 리스트예요."
  brief={<PeopleMapScreen t={t} go={go} />}
  existing={window.RelContactsScreen ? <window.RelContactsScreen t={t} go={go} /> :
    <StateView state="empty" title="기존 화면을 찾을 수 없어요" body="relcontacts 화면이 로드되지 않았어요." />} />;
}
function CompareDigest({ t, go, env, onBack }) {
  return <CompareShell title="정리" onBack={onBack}
  diff="브리프 판은 매일 열 때 연결 제안을 확인/보류하는 화면이에요. 기존 화면은 한 주를 요약해 보여주는 다이제스트예요."
  brief={<window.DigestTodayScreen t={t} go={go} onBack={onBack} bare />}
  existing={window.DigestScreen ? <window.DigestScreen t={t} go={go} /> :
    <StateView state="empty" title="기존 화면을 찾을 수 없어요" body="digest 화면이 로드되지 않았어요." />} />;
}

Object.assign(window, { CompareShell, RestBoardScreen, PeopleMapScreen, CompareRest, ComparePeople, CompareDigest });
