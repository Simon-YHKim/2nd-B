/* ============================================================
   2nd-Brain · 사용자 인증 (설정 › 사용자 인증)
   생체 인증 · PIN · 패턴 · 비밀번호 중 하나를 고른다.
   고르면 그 자리에서 등록 절차가 이어진다.
   Export: window.AppLockScreen
   ============================================================ */
const { useState: useAl } = React;

const AUTH_METHODS = [
{ id: 'off', icon: 'lock_open', label: '사용 안 함', sub: '앱을 열 때 묻지 않아요' },
{ id: 'bio', icon: 'visibility', label: '생체 인증', sub: '지문 · 얼굴로 바로 열어요', badge: '가장 빠름' },
{ id: 'pin', icon: 'key', label: 'PIN 번호', sub: '숫자 6자리를 눌러 열어요' },
{ id: 'pattern', icon: 'grid_on', label: '패턴', sub: '점 4개 이상을 이어 그려요' },
{ id: 'password', icon: 'edit', label: '비밀번호', sub: '문자를 섞어 더 단단하게' }];

function AppLockScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const e = env || {};
  const f = e.features || {};
  const cur = f.authMethod || 'off';
  const [enrolling, setEnrolling] = useAl(null);   // 등록 중인 방식
  const [pin, setPin] = useAl('');
  const [pin2, setPin2] = useAl('');
  const [pw, setPw] = useAl('');
  const [dots, setDots] = useAl([]);
  const [err, setErr] = useAl(null);
  const [note, setNote] = useAl(null);

  const commit = (id) => {
    e.setFeature && e.setFeature('authMethod', id);
    e.setFeature && e.setFeature('applock', id !== 'off');
    setEnrolling(null); setPin(''); setPin2(''); setPw(''); setDots([]); setErr(null);
    setNote(id === 'off' ? '앱 잠금을 껐어요' : '이제 이 방법으로 열어요');
    setTimeout(() => setNote(null), 2400);
  };
  const pick = (id) => {
    setErr(null);
    if (id === 'off' || id === 'bio') { commit(id); return; }
    setEnrolling(id); setPin(''); setPin2(''); setPw(''); setDots([]);
  };

  /* 등록 — 방식마다 확인 절차가 다르다 */
  const enroll = () => {
    if (enrolling === 'pin') {
      if (pin.length !== 6) { setErr('6자리를 입력해 주세요.'); return; }
      if (pin !== pin2) { setErr('두 번 입력한 번호가 서로 달라요. 다시 눌러 주세요.'); setPin2(''); return; }
    }
    if (enrolling === 'pattern' && dots.length < 4) { setErr('점을 4개 이상 이어 주세요.'); return; }
    if (enrolling === 'password' && pw.length < 8) { setErr('8자 이상으로 정해 주세요.'); return; }
    commit(enrolling);
  };

  const Row = ({ m, first }) => {
    const on = cur === m.id;
    return (
      <div className="md-interactive" onClick={() => pick(m.id)}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', cursor: 'pointer', minHeight: 48,
        background: on ? 'var(--c02)' : 'transparent', borderTop: first ? 'none' : `1px solid ${C('outline-variant')}` }}>
        <span className="md-state" />
        <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flex: '0 0 auto',
          background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : 'var(--c11)',
          boxShadow: 'var(--ds-edge)' }}>
          <Icon name={m.icon} size={16} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 400, color: C('on-surface') }}>{m.label}</span>
            {m.badge && <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '1px 6px',
              background: C('surface-container-highest'), color: 'var(--ds-core)', boxShadow: 'var(--ds-edge)' }}>{m.badge}</span>}
          </span>
          <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), marginTop: 2 }}>{m.sub}</span>
        </span>
        {on && <Icon name="check" size={16} style={{ color: 'var(--ok)', flex: '0 0 auto' }} />}
      </div>);
  };

  /* PIN 키패드 */
  const Pad = ({ value, onChange }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 12 }}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
        d === '' ? <span key={i} /> :
        <button key={i} onClick={() => onChange(d === '⌫' ? value.slice(0, -1) : (value + d).slice(0, 6))} className="md-interactive"
        style={{ position: 'relative', minHeight: 48, border: 'none', cursor: 'pointer',
          background: C('surface-container-highest'), color: C('on-surface'), boxShadow: 'var(--ds-edge)',
          fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 15 }}>
          <span className="md-state" />{d}
        </button>))}
    </div>);
  const Pips = ({ n }) => (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '4px 0 0' }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 12, height: 12, background: i < n ? 'var(--ds-core)' : C('surface-container-highest'),
          boxShadow: 'var(--ds-edge)' }} />))}
    </div>);

  const body = () => {
    if (enrolling === 'pin') return (
      <React.Fragment>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 10 }}>{pin.length < 6 ? 'PIN 6자리를 정해요' : '한 번 더 눌러 확인해요'}</div>
        <div style={{ marginTop: 14 }}><Pips n={pin.length < 6 ? pin.length : pin2.length} /></div>
        <Pad value={pin.length < 6 ? pin : pin2} onChange={pin.length < 6 ? setPin : setPin2} />
        {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10, wordBreak: 'keep-all' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => { setPin(''); setPin2(''); setErr(null); }}>다시</MdButton></span>
          <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" disabled={pin.length !== 6 || pin2.length !== 6} onClick={enroll}>저장</MdButton></span>
        </div>
        <div style={{ marginTop: 8 }}><MdButton variant="text" full size="s" onClick={() => setEnrolling(null)}>취소</MdButton></div>
      </React.Fragment>);

    if (enrolling === 'pattern') return (
      <React.Fragment>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 10 }}>점을 이어 패턴을 그려요</div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4 }}>순서대로 눌러요 · 4개 이상</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 16, maxWidth: 220 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const at = dots.indexOf(i);
            return (
              <button key={i} onClick={() => setDots((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i])} className="md-interactive"
              aria-label={`점 ${i + 1}`} style={{ position: 'relative', aspectRatio: '1', minHeight: 48, border: 'none', cursor: 'pointer',
                display: 'grid', placeItems: 'center',
                background: at >= 0 ? C('primary') : C('surface-container-highest'), color: at >= 0 ? C('on-primary') : C('on-surface-variant'),
                boxShadow: 'var(--ds-edge)', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12 }}>
                <span className="md-state" />{at >= 0 ? at + 1 : ''}
              </button>);
          })}
        </div>
        {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10, wordBreak: 'keep-all' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setDots([])}>다시</MdButton></span>
          <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" disabled={dots.length < 4} onClick={enroll}>저장</MdButton></span>
        </div>
        <div style={{ marginTop: 8 }}><MdButton variant="text" full size="s" onClick={() => setEnrolling(null)}>취소</MdButton></div>
      </React.Fragment>);

    if (enrolling === 'password') return (
      <React.Fragment>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), margin: '10px 0 14px' }}>비밀번호를 정해요</div>
        <window.AuField label="앱 비밀번호" value={pw} onChange={setPw} ph="8자 이상" type="password"
        hint={err} hintTone="error" />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setEnrolling(null)}>취소</MdButton></span>
          <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" disabled={pw.length < 8} onClick={enroll}>저장</MdButton></span>
        </div>
      </React.Fragment>);

    return (
      <React.Fragment>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '10px 0 12px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          앱을 열 때 어떻게 확인할지 골라요. 언제든 바꿀 수 있어요.
        </div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {AUTH_METHODS.map((m, i) => <Row key={m.id} m={m} first={i === 0} />)}
        </MdCard>
        {cur !== 'off' &&
        <div style={{ marginTop: 14 }}>
          <MdButton variant="outlined" full size="s" icon="cached" onClick={() => pick(cur)}>다시 등록하기</MdButton>
        </div>}
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          잠금은 이 기기에만 적용돼요. 생체 정보는 기기를 벗어나지 않아요.
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      {note &&
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 20 }}>
        <div style={{ background: C('inverse-surface'), color: C('inverse-on-surface'), padding: '10px 14px', boxShadow: 'var(--ds-edge)', fontSize: 12 }}>{note}</div>
      </div>}
    </div>);
}

window.AppLockScreen = AppLockScreen;
window.AUTH_METHODS = AUTH_METHODS;
