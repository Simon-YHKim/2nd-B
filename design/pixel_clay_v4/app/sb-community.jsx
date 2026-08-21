/* ============================================================
   2nd-Brain · 커뮤니티 — 별자리 7번째 슬롯 (2026-08-10 결정)
   도메인이 아니라 포탈이므로 밝기 L1~L5가 없고 북극성 평균에서 제외된다.
   같은 별을 그리는 사람들의 공개 기록을 읽고, 내 기록을 익명으로 나눈다.
   Export: window.CommunityScreen
   ============================================================ */
const { useState: useCu } = React;

const CM_FEED = [
{ id: 'f1', star: '커리어', alias: '북두 07', when: '2시간 전', likes: 24, saved: false,
  text: '3년 차에 처음으로 회고를 글로 남겼다. 쓰고 나니 다음에 뭘 해야 할지가 오히려 또렷해졌다.' },
{ id: 'f2', star: '휴식', alias: '별먼지 12', when: '어제', likes: 41, saved: true,
  text: '주말에 아무 계획 없이 산책만 했는데, 그 주가 제일 생산적이었다는 게 기록에 남아 있었다.' },
{ id: 'f3', star: '관계', alias: '이름 없는 별', when: '2일 전', likes: 18, saved: false,
  text: '연락이 뜸했던 사람에게 먼저 안부를 보냈다. 답장이 길게 왔다. 관계 별이 한 칸 밝아졌다.' },
{ id: 'f4', star: '건강', alias: '북두 03', when: '3일 전', likes: 33, saved: false,
  text: '수면 7시간 아래로 내려간 주는 기록량도 같이 줄더라. 데이터가 잔소리보다 설득력 있다.' }];
const CM_TOPICS = ['전체', '커리어', '재정', '성장', '관계', '건강', '휴식'];
const CM_CIRCLES = [
{ id: 'c1', name: '회고 쓰는 사람들', n: 312, tag: '#회고' },
{ id: 'c2', name: '아침형 실험실', n: 148, tag: '#리듬' },
{ id: 'c3', name: '한 줄 독서', n: 205, tag: '#독서' }];

function CommunityScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCu('filled');
  const [topic, setTopic] = useCu('전체');
  const [feed, setFeed] = useCu(CM_FEED);
  const [joined, setJoined] = useCu(['c1']);
  const [share, setShare] = useCu(false);
  const [draft, setDraft] = useCu('');
  const [note, setNote] = useCu(null);

  const rows = feed.filter((f) => topic === '전체' || f.star === topic);
  const toast = (m) => { setNote(m); setTimeout(() => setNote(null), 2200); };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="사람들의 별을 모으는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="커뮤니티를 불러오지 못했어요"
      body="내 기록은 그대로 있어요. 잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return (
      <StateView state="empty" title="아직 올라온 이야기가 없어요."
      body="먼저 한 조각을 나눠보면 비슷한 별을 그리는 사람이 찾아와요."
      cta={() => setShare(true)} ctaLabel="내 기록 나누기" icon="forum" />);
    return (
      <React.Fragment>
        {/* 포탈 안내 — 밝기 없음 */}
        <div className="px-frame" style={{ padding: '11px 13px', background: C('surface-container-low'), marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <Icon name="hub" size={16} style={{ color: 'var(--ds-nebula)', flex: '0 0 auto', marginTop: 1 }} />
            <span style={{ flex: 1, fontSize: 12, color: C('on-surface-variant'), lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              커뮤니티는 도메인이 아니라 문이에요. 여기 머문다고 별이 밝아지진 않아요.
            </span>
          </div>
        </div>

        {/* 주제 필터 */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '12px 0 10px' }}>
          {CM_TOPICS.map((x) => <MdChip key={x} variant="filter" selected={topic === x} onClick={() => setTopic(x)}>{x}</MdChip>)}
        </div>

        {/* 내 기록 나누기 */}
        {share ?
        <div className="px-frame" style={{ padding: 14, background: C('surface-container-low'), marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>내 기록 나누기</div>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="한 조각만 옮겨 적어요. 이름은 나가지 않아요."
          style={{ width: '100%', minHeight: 92, resize: 'vertical', border: 'none', outline: 'none', boxSizing: 'border-box',
            background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: C('on-surface'),
            font: '400 12px/1.6 var(--font-ui)', padding: 11 }} />
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            익명 별칭으로만 올라가요. 원문 기록과 태그는 내 계정에만 남아요.
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => { setShare(false); setDraft(''); }}>취소</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" disabled={!draft.trim()}
            onClick={() => { setFeed((s) => [{ id: 'n' + Date.now(), star: topic === '전체' ? '성장' : topic, alias: '나', when: '방금', likes: 0, saved: false, text: draft.trim() }, ...s]); setShare(false); setDraft(''); toast('나눴어요'); }}>올리기</MdButton></span>
          </div>
        </div> :
        <div style={{ marginBottom: 12 }}>
          <MdButton variant="filled" full size="s" icon="forum" onClick={() => setShare(true)}>내 기록 나누기</MdButton>
        </div>}

        {/* 피드 */}
        {rows.length === 0 ?
        <StateView state="empty" title="이 주제엔 아직 이야기가 없어요." body="다른 주제를 눌러보거나 먼저 한 조각을 나눠보세요." /> :
        rows.map((f) => (
          <MdCard key={f.id} variant="filled" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, background: 'var(--ds-core)', boxShadow: '0 0 0 var(--u) var(--edge)', flex: '0 0 auto' }} />
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)' }}>{f.star}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>· {f.alias} · {f.when}</span>
            </div>
            <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.65, wordBreak: 'keep-all', textWrap: 'pretty' }}>{f.text}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <button onClick={() => setFeed((s) => s.map((x) => x.id === f.id ? { ...x, likes: x.likes + 1 } : x))} className="md-interactive"
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer',
                padding: '6px 10px', minHeight: 32, background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <Icon name="favorite" size={13} />
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>{f.likes}</span>
              </button>
              <button onClick={() => { setFeed((s) => s.map((x) => x.id === f.id ? { ...x, saved: !x.saved } : x)); toast(f.saved ? '담기를 취소했어요' : '내 기록에 담았어요'); }} className="md-interactive"
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer',
                padding: '6px 10px', minHeight: 32, boxShadow: 'var(--ds-edge)',
                background: f.saved ? C('primary') : C('surface-container-highest'), color: f.saved ? C('on-primary') : C('on-surface-variant') }}>
                <span className="md-state" />
                <Icon name={f.saved ? 'check' : 'add_circle'} size={13} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)' }}>{f.saved ? '담김' : '담기'}</span>
              </button>
            </div>
          </MdCard>))}

        {/* 서클 */}
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 8px' }}>같은 별을 그리는 모임</div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {CM_CIRCLES.map((c, i) => {
            const on = joined.includes(c.id);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--ds-nebula)' }}>
                  <Icon name="group" size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{c.name}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>{c.tag} · {c.n}명</span>
                </span>
                <MdButton variant={on ? 'outlined' : 'tonal'} size="s"
                onClick={() => setJoined((s) => on ? s.filter((x) => x !== c.id) : [...s, c.id])}>{on ? '나가기' : '참여'}</MdButton>
              </div>);
          })}
        </MdCard>

        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          올린 글은 언제든 내릴 수 있어요. 내 별 밝기는 커뮤니티 활동과 무관해요.
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>커뮤니티</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      {note &&
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 52, zIndex: 20 }}>
        <div style={{ background: C('inverse-surface'), color: C('inverse-on-surface'), padding: '10px 14px', boxShadow: 'var(--ds-edge)', fontSize: 12 }}>{note}</div>
      </div>}
      <StateRow value={state} onChange={setState} />
    </div>);
}

window.CommunityScreen = CommunityScreen;
