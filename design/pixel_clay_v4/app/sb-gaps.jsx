/* ============================================================
   2nd-Brain · PRD gap-fill screens (B-series remainder)
   - PeerScreen      : 보여지는 나(peer review) — 설문 공유 + 자기/타인 비교
   - PwResetScreen   : 비밀번호 재설정
   - ProfileSetupScreen : 프로필 완성(강제)
   - DobGateScreen   : 생년월일 확인(미성년 게이트)
   - PermissionsScreen : 권한 관리(민감 항목 강조)
   - PrivacyScreen   : 개인정보·약관·데이터 주권
   - SupportScreen   : 지원·공지·문의
   - ManualScreen    : 사용 매뉴얼·핵심 개념
   Export: window.<each>
   ============================================================ */
const { useState: useGp } = React;

/* ---- small shared list row (chevron) ---- */
function GapRow({ icon, label, sub, accent, badge, onClick, danger }) {
  const C = window.SB.C;
  return (
    <div className="md-interactive" onClick={onClick}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 12px', borderRadius: 0, cursor: 'pointer' }}>
      <span className="md-state" />
      <div style={{ width: 38, height: 38, borderRadius: 0, flex: '0 0 auto', display: 'grid', placeItems: 'center',
        background: accent || C('surface-container-highest'), color: danger ? C('error') : C('on-surface-variant') }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="md-body-large" style={{ color: danger ? C('error') : C('on-surface'), wordBreak: 'keep-all' }}>{label}</div>
        {sub && <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{sub}</div>}
      </div>
      {badge}
      <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
    </div>
  );
}

function SensitiveBadge() {
  const C = window.SB.C;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      color: C('on-error-container'), background: C('error-container'), borderRadius: 0, padding: '3px 9px' }}>
      <Icon name="lock" size={12} />민감
    </span>
  );
}

/* ===================== 보여지는 나 (peer review) ===================== */
function PeerScreen({ t, go }) {
  const C = window.SB.C;
  const [copied, setCopied] = useGp(false);
  // self vs peer per trait (peer = 남이 본 평균)
  const pairs = [
    { k: '외향성', self: 41, peer: 60, note: '남들은 당신을 더 활발하게 봐요' },
    { k: '우호성', self: 67, peer: 74, note: '비슷하게 따뜻한 사람으로 보여요' },
    { k: '성실성', self: 58, peer: 55, note: '거의 같게 보여요' },
    { k: '개방성', self: 72, peer: 63, note: '스스로를 더 열린 사람으로 느껴요' },
  ];
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 2px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 24, fontWeight: 700 }}>보여지는 나</div>
        <Dots level={2} color={C('tertiary')} />
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 4, wordBreak: 'keep-all' }}>
        남이 보는 나는 얼마나 같을까요? 가까운 사람에게 익명 설문을 보내 모아요.
      </div>

      {/* share invite */}
      <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Icon name="link" size={20} style={{ color: C('on-secondary-container') }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-title-small" style={{ color: C('on-secondary-container') }}>익명 설문 링크</div>
            <div className="md-body-small" style={{ color: C('on-secondary-container'), opacity: .8 }}>2nd.me/p/aria-7q · 30초 · 익명</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C('primary'), background: C('surface-container-highest'), borderRadius: 0, padding: '4px 11px' }}>3명 응답</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MdButton variant="filled" icon={copied ? 'check' : 'content_copy'} style={{ flex: 1 }} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? '복사됨' : '링크 복사'}</MdButton>
          <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }}>공유</MdButton>
        </div>
      </MdCard>

      {/* self vs peer */}
      <SectionLabel>내가 보는 나 vs 남이 보는 나</SectionLabel>
      <MdCard variant="outlined" style={{ padding: '4px 14px 14px' }}>
        {pairs.map((p, i) => {
          const gap = Math.abs(p.self - p.peer);
          return (
            <div key={p.k} style={{ paddingTop: 14, borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', marginTop: i ? 12 : 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="md-title-small" style={{ color: C('on-surface') }}>{p.k}</span>
                {gap >= 12 && <span style={{ fontSize: 12, fontWeight: 700, color: C('tertiary') }}>차이 {gap}p</span>}
              </div>
              {[['나', p.self, C('on-surface-variant')], ['남', p.peer, C('primary')]].map(([lab, v, col]) => (
                <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 16, fontSize: 12, color: C('on-surface-variant'), flex: '0 0 auto' }}>{lab}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 0, background: C('surface-container-highest'), overflow: 'hidden' }}>
                    <div style={{ width: v + '%', height: '100%', borderRadius: 0, background: col }} />
                  </div>
                  <span style={{ width: 26, textAlign: 'right', fontSize: 12, fontWeight: 700, color: col, flex: '0 0 auto' }}>{v}</span>
                </div>
              ))}
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 5, wordBreak: 'keep-all' }}>{p.note}</div>
            </div>
          );
        })}
      </MdCard>

      <RatifyBlock id="peer" confidence={48} evidence={3} evidenceLabel="응답"
        estimate="남이 보는 당신은 스스로 느끼는 것보다 더 활발하고 따뜻한 편이에요. 응답이 더 모이면 또렷해져요."
        onEvidence={() => go('records')} onRefine={() => go('interview')} />

      <MdButton variant="text" icon="send" style={{ marginTop: 14 }} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }}>설문 더 보내기</MdButton>
    </ScreenPad>
  );
}

/* ===================== 계정 찾기 · 비밀번호 재설정 (로그인 게이트) ===================== */
const RECOVER_MODES = [
{ id: 'pw', label: '비밀번호 찾기', title: '비밀번호를 잊으셨나요?', icon: 'lock',
  fieldLabel: '가입 이메일', fieldValue: 'aria@example.com', cta: '인증코드 보내기', code: true,
  doneTitle: '메일을 확인하세요', doneBody: 'aria@example.com 으로 6자리 인증코드를 보냈어요. 5분 안에 도착하지 않으면 스팸함도 확인해 주세요.' },
{ id: 'id', label: '아이디 찾기', title: '가입한 이메일을 찾아요', icon: 'user',
  fieldLabel: '가입 이메일', fieldValue: 'aria@example.com', cta: '인증코드 보내기', code: true,
  doneTitle: '이 이메일로 가입했어요', doneBody: 'ar••@example.com · 2025년 11월 가입. 전체 주소는 보내드린 메일에서 확인할 수 있어요.' },
{ id: 'reset', label: '비밀번호 재설정', title: '새 비밀번호를 정해요', icon: 'key',
  fieldLabel: '새 비밀번호', fieldValue: '••••••••', cta: '비밀번호 바꾸기',
  doneTitle: '비밀번호를 바꿨어요', doneBody: '다른 기기는 모두 로그아웃됐어요. 새 비밀번호로 다시 로그인해 주세요.' }];

function PwResetScreen({ t, go, param }) {
  const C = window.SB.C;
  const [mode, setMode] = useGp((param && param.mode) || 'pw');
  const [sent, setSent] = useGp(false);
  const [code, setCode] = useGp('');
  const [err, setErr] = useGp(null);
  const [done, setDone] = useGp(false);
  const [left, setLeft] = useGp(300);   // 인증코드 유효시간 5분
  const [pw1, setPw1] = useGp('');
  const [pw2, setPw2] = useGp('');
  const [show1, setShow1] = useGp(false);
  const [show2, setShow2] = useGp(false);
  const m = RECOVER_MODES.find((x) => x.id === mode) || RECOVER_MODES[0];

  React.useEffect(() => {
    if (!sent || done) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [sent, done]);

  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const expired = sent && left === 0;
  const reset = () => { setSent(false); setCode(''); setErr(null); setDone(false); setLeft(300); };
  const pwOk = pw1.length >= 8 && pw1 === pw2;
  const send = () => {
    if (!m.code) {                            // 새 비밀번호 저장 — 코드 단계 없음
      if (pw1.length < 8) { setErr('8자 이상으로 정해 주세요.'); return; }
      if (pw1 !== pw2) { setErr('두 비밀번호가 서로 달라요.'); return; }
      setErr(null); setDone(true); return;
    }
    setSent(true); setCode(''); setErr(null); setLeft(300);
  };
  /* 비밀번호 칸 — 각자 보이기/숨기기 토글을 가진다 */
  const PwField = ({ label, value, onChange, shown, onToggle, ph }) =>
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 8px 0 16px', background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)' }}>
      <Icon name="lock" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>{label}</div>
        <input value={value} onChange={(e) => { onChange(e.target.value); setErr(null); }} type={shown ? 'text' : 'password'}
        placeholder={ph} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: 0,
          color: 'var(--c07)', fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }} />
      </div>
      <button onClick={onToggle} aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'} className="md-interactive"
      style={{ position: 'relative', width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer',
        display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--fg-muted)' }}>
        <span className="md-state" />
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <Icon name="visibility" size={18} />
          {shown && <span aria-hidden="true" style={{ position: 'absolute', left: 1, right: 1, top: '50%', height: 2, background: 'currentColor', boxShadow: '0 -2px 0 0 var(--panel-2)' }} />}
        </span>
      </button>
    </div>;
  const verify = () => {
    if (expired) { setErr('코드가 만료됐어요. 다시 받아 주세요.'); return; }
    if (code.length !== 6) { setErr('코드가 맞지 않아요. 최신 메일의 코드로 다시 시도해 주세요.'); return; }
    setErr(null);
    if (mode === 'pw') { setMode('reset'); reset(); return; }  // 확인되면 새 비밀번호 단계로
    setDone(true);
  };

  /* 완료 표면 — 비밀번호를 바꿨거나 아이디를 찾았을 때 */
  if (done) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56, padding: '0 6px', flex: '0 0 auto' }}>
          <MdIconButton name="arrow_back" title="로그인으로" onClick={() => go('auth')} />
          <span className="md-title-large" style={{ color: C('on-surface') }}>계정 찾기</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 22px 24px' }}>
          <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', background: C('secondary-container'), color: C('on-secondary-container'), boxShadow: 'var(--ds-edge)', marginBottom: 18 }}>
            <Icon name="check" size={30} />
          </div>
          <div style={{ color: C('on-surface'), fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{m.doneTitle}</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'balance', maxWidth: 280 }}>{m.doneBody}</div>
          <MdButton variant="filled" icon="check" style={{ marginTop: 22, minWidth: 150 }} onClick={() => go('auth')}>확인</MdButton>
        </div>
      </div>);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56, padding: '0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="로그인으로" onClick={() => go('auth')} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>계정 찾기</span>
      </div>

      {/* 상단 — 입력부는 코드를 보낸 뒤에도 그대로 남는다 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 22px 16px' }}>
        {mode !== 'reset' &&
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {RECOVER_MODES.filter((x) => x.id !== 'reset').map((x) =>
          <MdChip key={x.id} variant="filter" selected={x.id === mode} onClick={() => { setMode(x.id); reset(); }} style={{ flex: 1, justifyContent: 'center' }}>{x.label}</MdChip>)}
        </div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: C('surface-container-highest'), color: 'var(--ds-core)', boxShadow: 'var(--ds-edge)' }}><Icon name={m.icon} size={20} /></span>
          <span style={{ color: C('on-surface'), fontSize: 24, fontWeight: 700, wordBreak: 'keep-all', textWrap: 'balance' }}>{m.title}</span>
        </div>
        {m.id === 'reset' ?
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PwField label="새 비밀번호" value={pw1} onChange={setPw1} shown={show1} onToggle={() => setShow1((v) => !v)} ph="8자 이상" />
          <PwField label="새 비밀번호 확인" value={pw2} onChange={setPw2} shown={show2} onToggle={() => setShow2((v) => !v)} ph="한 번 더 입력" />
          {pw2 && pw1 !== pw2 && <div className="md-body-small" style={{ color: C('error'), wordBreak: 'keep-all' }}>두 비밀번호가 서로 달라요.</div>}
          {pwOk && <div className="md-body-small" style={{ color: 'var(--ok)', wordBreak: 'keep-all' }}>두 비밀번호가 일치해요.</div>}
        </div> :
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 16px', background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)' }}>
          <Icon name="mail" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>{m.fieldLabel}</div>
            <div className="md-body-large" style={{ color: C('on-surface') }}>{m.fieldValue}</div>
          </div>
        </div>}
        {!(sent && m.code) &&
        <React.Fragment>
          {!m.code && err && <div className="md-body-small" style={{ color: C('error'), marginTop: 12, wordBreak: 'keep-all' }}>{err}</div>}
          <MdButton variant="filled" full icon={m.code ? 'send' : 'check'} style={{ marginTop: 18 }}
          disabled={!m.code && !pwOk} onClick={send}>{m.cta}</MdButton>
        </React.Fragment>}
        {sent && m.code &&
        <React.Fragment>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>{m.doneBody}</div>

          {/* 인증코드 — 안내 문구 바로 아래. 키보드가 떠도 가려지지 않는다 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ds-core)' }}>인증코드 6자리</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="timer" size={13} style={{ color: expired ? C('error') : C('on-surface-variant') }} />
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: expired ? C('error') : left <= 60 ? 'var(--warn)' : C('on-surface') }}>{mmss}</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 14px', background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)' }}>
            <Icon name="key" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }}
            placeholder="000000" inputMode="numeric" autoFocus
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', padding: 0,
              color: 'var(--c07)', fontSize: 15, letterSpacing: '.3em', fontFamily: 'var(--md-ref-typeface-mono)' }} />
          </div>
          {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 8, wordBreak: 'keep-all' }}>{err}</div>}
          {expired && !err && <div className="md-body-small" style={{ color: C('error'), marginTop: 8, wordBreak: 'keep-all' }}>코드가 만료됐어요. 다시 받아 주세요.</div>}
          <MdButton variant="filled" full icon="check" style={{ marginTop: 12 }} disabled={code.length !== 6 || expired} onClick={verify}>코드 확인</MdButton>
          <MdButton variant="text" full icon="cached" style={{ marginTop: 6 }} onClick={send}>코드 다시 보내기</MdButton>
        </React.Fragment>}
      </div>

    </div>
  );
}

/* ===================== 프로필 완성(강제) ===================== */
const PROFILE_PRESETS = [
{ seed: 'nova', kind: 'human' }, { seed: 'lin', kind: 'human' }, { seed: 'devon', kind: 'human' },
{ seed: 'sooyeon', kind: 'human' }, { seed: 'minjun', kind: 'human' }, { seed: 'aria-h', kind: 'human' },
{ seed: 'kite', kind: 'human' }, { seed: 'juno', kind: 'human' }, { seed: 'sol', kind: 'human' },
{ seed: 'hana', kind: 'human' }, { seed: 'rex', kind: 'human' }, { seed: 'vera', kind: 'human' },
{ seed: 'mochi', kind: 'cat' }, { seed: 'yuki', kind: 'cat' }, { seed: 'foxy', kind: 'fox' },
{ seed: 'coco', kind: 'dog' },
{ seed: 'kuma', kind: 'bear' }, { seed: 'nabi', kind: 'panda' }, { seed: 'tori', kind: 'rabbit' },
{ seed: 'dubu', kind: 'rabbit' }, { seed: 'gaeul', kind: 'frog' }, { seed: 'byul', kind: 'bird' },
{ seed: 'haneul', kind: 'bird' }, { seed: 'pado', kind: 'animal' }, { seed: 'noel', kind: 'animal' },
{ seed: 'muni', kind: 'animal' }];
const PROFILE_TIPS = {
  photo: { icon: 'user', title: '프로필 이미지', body: '앞으로 공유 카드·피어 설문에 같이 나가는 얼굴이에요.', tip: '기본 프리셋만 골라도 충분해요. 사진은 기기에만 저장되고 서버로 올라가지 않아요.' },
  name: { icon: 'user', title: '이름', body: '세컨비가 말을 건넬 때 불러주는 이름이에요.', tip: '본명이 아니어도 돼요. 설정에서 언제든 바꿀 수 있어요.' },
  handle: { icon: 'tag', title: '핸들', body: '공유 링크와 피어 설문에서 나를 가리키는 주소예요.', tip: '영문·숫자·밑줄만 쓸 수 있고, 한 번 정하면 30일에 한 번 바꿀 수 있어요.' },
  dob: { icon: 'calendar', title: '생년월일', body: '나이대에 맞는 보호 수준과 비교 기준을 정하는 데 써요.', tip: '나이대만 통계에 쓰고 정확한 날짜는 누구에게도 보이지 않아요.' },
  goal: { icon: 'star', title: '한 줄 목표', body: '북극성의 첫 문장이 돼요. 담은 기록을 어떤 방향으로 읽을지 기준이 돼요.', tip: '거창하지 않아도 돼요. 쓰다 보면 세컨비가 다듬을 문장을 제안해요.',
    bubble: '2ndB와 함께할 땐 내용이 구체적일수록 좋아요. ‘책 많이 읽기’보다 ‘퇴근길에 다섯 쪽씩 읽기’처럼요.' }
};

function ProfileSetupScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const prof = window.useProfile();
  const [name, setName] = useGp(prof.name || '아리아');
  const [handle, setHandle] = useGp(prof.handle || 'aria');
  const [goal, setGoal] = useGp(prof.goal || '');
  const [dob, setDob] = useGp(prof.dob || '1996-04-12');
  const [dobOpen, setDobOpen] = useGp(false);
  const [studio, setStudio] = useGp(false);
  const [photo, setPhoto] = useGp(!!prof.photo);
  const [tip, setTip] = useGp(null);
  const [tipBubble, setTipBubble] = useGp(false);
  const job = window.SBProfile.job();
  const fields = [!!name, !!handle, !!dob, !!goal];
  const filled = fields.filter(Boolean).length;
  const ready = filled === fields.length;
  const Info = ({ k }) =>
  <button onClick={(e) => {e.stopPropagation();setTipBubble(false);setTip(PROFILE_TIPS[k]);}} aria-label={PROFILE_TIPS[k].title + ' 설명'} className="md-interactive"
  style={{ position: 'relative', width: 44, height: 44, flex: '0 0 auto', display: 'grid', placeItems: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer', color: C('on-surface-variant') }}>
      <span className="md-state" /><Icon name="help" size={16} />
    </button>;
  const Field = ({ label, icon, value, placeholder, prefix, tipKey }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 10px 8px 16px', background: C('surface-container-highest') }}>
      <Icon name={icon} size={20} style={{ color: value ? C('primary') : C('on-surface-variant'), flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>{label}</div>
        <div className="md-body-large" style={{ color: value ? C('on-surface') : C('on-surface-variant'), wordBreak: 'keep-all' }}>{prefix}{value || placeholder}</div>
      </div>
      {value ? <Icon name="check" size={18} style={{ color: C('primary') }} /> : <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('tertiary'), fontWeight: 700 }}>필요</span>}
      <Info k={tipKey} />
    </div>
  );
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
    <ScreenPad>
      {/* 로그인 게이트 화면이라 셸 앱바가 없다 — 뒤로가기를 여기서 그린다 */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack || (() => go('auth'))} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 0 }}>
        <div className="md-title-medium" style={{ color: C('on-surface'), marginBottom: 12 }}>프로필을 마저 채워요</div>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 84, height: 84, display: 'grid', placeItems: 'center', overflow: 'hidden',
            background: C('secondary-container'), boxShadow: 'var(--ds-edge)' }}>
            {photo ?
            <image-slot id="sb-profile-photo" placeholder="프로필 사진" style={{ width: '100%', height: '100%' }}></image-slot> :
            <window.SbAvatar spec={prof.avatar} size={76} />}
          </div>
          <button onClick={() => setPhoto((v) => !v)} aria-label={photo ? '프리셋으로 돌아가기' : '사진 올리기'} className="md-interactive"
          style={{ position: 'absolute', bottom: -11, right: -11, width: 44, height: 44, display: 'grid', placeItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', position: 'relative',
              background: C('primary'), color: C('on-primary'), boxShadow: 'var(--ds-edge)' }}>
              <span className="md-state" /><Icon name={photo ? 'close' : 'photo_camera'} size={15} />
            </span>
          </button>
        </div>
        {/* 아바타 — 스튜디오에서 만들거나 빠른 프리셋 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6 }}>
            <MdButton variant="filled" size="s" icon="palette" style={{ flex: 1 }} onClick={() => { setPhoto(false); setStudio(true); }}>아바타 만들기</MdButton>
            <MdButton variant="outlined" size="s" icon="cached" onClick={() => { setPhoto(false); window.SBProfile.set({ photo: false, avatar: (window.PXAvatar64 || window.PXC_EXT).avatarSpec(Math.random().toString(36).slice(2, 9)) }); }}>랜덤</MdButton>
          </div>
          <Info k="photo" />
        </div>
        {job &&
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: C('on-surface-variant') }}>
          <Icon name="badge" size={14} />{job.ko}
        </div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Field label="이름" icon="person" value={name} tipKey="name" />
        <Field label="핸들" icon="badge" value={handle} prefix="@" tipKey="handle" />
        <div onClick={() => setDobOpen(true)} role="button" tabIndex={0} className="md-interactive"
          style={{ position: 'relative', cursor: 'pointer', background: 'transparent', padding: 0, textAlign: 'left' }}>
          <Field label="생년월일 (눌러서 달력 열기)" icon="calendar_today" value={window.sbFmtDate(dob)} tipKey="dob" />
        </div>
        <div onClick={() => setGoal(goal ? '' : '나를 더 잘 이해하고 더 나답게 살기')} role="button" tabIndex={0} className="md-interactive"
          style={{ position: 'relative', cursor: 'pointer', background: 'transparent', padding: 0, textAlign: 'left' }}>
          <Field label="한 줄 목표 (눌러서 예시 채우기)" icon="auto_awesome" value={goal} placeholder="나는 왜 이 앱을 쓰나요?" tipKey="goal" />
        </div>
      </div>

      {dobOpen && <window.CalendarSheet value={dob} title="생년월일" pastOnly onChange={setDob} onClose={() => setDobOpen(false)} />}

      {/* 완성도 — CTA 바로 위 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 10px' }}>
        <div style={{ flex: 1, height: 8, background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', overflow: 'hidden' }}>
          <div style={{ width: (filled / fields.length * 100) + '%', height: '100%', background: C('primary'), transition: 'width .3s steps(4,end)' }} />
        </div>
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), fontWeight: 700 }}>{filled}/{fields.length}</span>
      </div>

      <MdButton variant="filled" full icon={ready ? 'task_alt' : undefined} style={{ opacity: ready ? 1 : .5 }}
      onClick={() => { if (!ready) return; window.SBProfile.set({ name, handle, dob, goal, photo }); go('home'); }}>
        {ready ? '시작하기' : '항목을 모두 채워주세요'}
      </MdButton>
    </ScreenPad>

    {studio && (window.PXAvatar64 || window.PXC_EXT) &&
    <window.AvatarStudio spec={prof.avatar} onClose={() => setStudio(false)}
    onSave={(sp) => { window.SBProfile.set({ avatar: sp, photo: false }); setStudio(false); }} />}

    {tip &&
    <div onClick={() => setTip(null)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="ds-window" role="dialog" aria-modal="true"
      style={{ position: 'relative', width: '100%', maxWidth: 300, padding: '18px 18px 14px', margin: 'var(--u)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', flex: '0 0 auto',
            background: C('primary-container'), color: C('on-primary-container'), boxShadow: 'var(--ds-edge)' }}><Icon name={tip.icon} size={18} /></span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C('on-surface') }}>{tip.title}</span>
          {tip.bubble &&
          <button onClick={() => setTipBubble((v) => !v)} aria-label="세컨비 팁" aria-pressed={tipBubble} className="md-interactive"
          style={{ position: 'relative', height: 30, padding: '0 12px', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700,
            background: tipBubble ? C('primary') : C('surface-container-highest'),
            color: tipBubble ? C('on-primary') : C('primary'), boxShadow: 'var(--ds-edge)' }}>
            <span className="md-state" />Tip
          </button>}
        </div>
        {tip.bubble && tipBubble &&
        <div style={{ position: 'absolute', left: -14, right: -14, bottom: 'calc(100% - 20px)', zIndex: 2, pointerEvents: 'none' }}>
          <window.DialogBox compact kindLabel="세컨비" line={tip.bubble}
          head={<window.SbHead size={48} expression="positive" track={false} />} />
        </div>}
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>{tip.body}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)' }}>
          <Icon name="lightbulb" size={16} style={{ color: 'var(--ds-core)', marginTop: 1 }} />
          <span style={{ fontSize: 12, color: C('on-surface-variant'), lineHeight: 1.5, wordBreak: 'keep-all' }}>{tip.tip}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <MdButton variant="filled" size="s" onClick={() => setTip(null)}>알겠어요</MdButton>
        </div>
      </div>
    </div>}
    </div>
  );
}

/* ===================== 생년월일 확인(미성년 게이트) ===================== */
function DobGateScreen({ t, go }) {
  const C = window.SB.C;
  const [dob, setDob] = useGp('1996-04-12');
  const [dobOpen, setDobOpen] = useGp(false);
  const birth = dob ? new Date(dob + 'T00:00:00') : null;
  const now = new Date();
  let age = 0;
  if (birth) { age = now.getFullYear() - birth.getFullYear(); const mo = now.getMonth() - birth.getMonth(); if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--; }
  const minor = !!birth && age < 14;
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 24, fontWeight: 700, margin: '14px 0 6px' }}>생년월일을 알려주세요</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 20, wordBreak: 'keep-all' }}>
        나이에 따라 보호 수준이 달라져요. 위치·통신 같은 민감한 데이터는 미성년에겐 잠겨요.
      </div>

      {/* date picker */}
      <div style={{ padding: '8px 0 4px' }}>
        <button onClick={() => setDobOpen(true)} className="md-interactive"
          style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            border: `1px solid ${C('outline-variant')}`, borderRadius: 0, padding: '16px 16px', cursor: 'pointer', background: C('surface-container-highest') }}>
          <span className="md-state" />
          <Icon name="calendar_today" size={22} style={{ color: C('primary'), flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-body-small" style={{ color: C('on-surface-variant') }}>생년월일</div>
            <div className="md-title-medium" style={{ color: C('on-surface') }}>{window.sbFmtDate(dob) || '날짜를 골라요'}</div>
          </div>
          <span className="md-body-small" style={{ color: C('on-surface-variant'), whiteSpace: 'nowrap' }}>만 {age}세</span>
        </button>
      </div>

      {dobOpen && <window.CalendarSheet value={dob} title="생년월일" pastOnly onChange={setDob} onClose={() => setDobOpen(false)} />}

      {minor ? (
        <MdCard variant="filled" style={{ background: C('error-container'), padding: 16, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Icon name="lock" size={22} style={{ color: C('on-error-container'), flex: '0 0 auto' }} />
            <div>
              <div className="md-title-small" style={{ color: C('on-error-container') }}>만 14세 이상만 가입할 수 있어요</div>
              <div className="md-body-small" style={{ color: C('on-error-container'), opacity: .85, marginTop: 4, wordBreak: 'keep-all' }}>
                보호자 동의와 별도 보호 정책이 필요해요. 통신·위치 데이터 수집은 서버에서 잠겨 있어요.
              </div>
            </div>
          </div>
        </MdCard>
      ) : (
        <MdButton variant="filled" full icon="arrow_forward" style={{ marginTop: 8 }} onClick={() => go('profilesetup')}>계속하기</MdButton>
      )}
    </ScreenPad>
  );
}

/* ===================== 권한 관리 ===================== */
function PermissionsScreen({ t, go }) {
  const C = window.SB.C;
  const [p, setP] = useGp({ notify: true, mic: true, camera: false, calendar: true, location: false, contacts: false });
  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const rows = [
    { k: 'notify', icon: 'bubble_chart', label: '알림', sub: '새 통찰·연속기록·완료를 알려요' },
    { k: 'mic', icon: 'mic', label: '마이크', sub: '음성 메모·통화 녹음 받아쓰기' },
    { k: 'camera', icon: 'photo_camera', label: '카메라', sub: '사진으로 별가루 담기' },
    { k: 'calendar', icon: 'today', label: '캘린더', sub: '비서가 보낸 루틴을 일정으로' },
  ];
  const sensitive = [
    { k: 'location', icon: 'workspaces', label: '위치', sub: '맥락 신호 (선택) · 기본 꺼짐' },
    { k: 'contacts', icon: 'forum', label: '통신·연락처', sub: '관계 신호 (선택) · 기본 꺼짐' },
  ];
  return (
    <ScreenPad>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '10px 0 4px', wordBreak: 'keep-all' }}>
        필요한 것만 켜세요. 끈 권한의 데이터는 절대 수집하지 않아요.
      </div>
      <SectionLabel>기본 권한</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {rows.map((r, i) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <Icon name={r.icon} size={22} style={{ color: p[r.k] ? C('primary') : C('on-surface-variant'), flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="md-body-large" style={{ color: C('on-surface') }}>{r.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{r.sub}</div>
            </div>
            <MdSwitch checked={p[r.k]} onChange={(v) => set(r.k, v)} />
          </div>
        ))}
      </MdCard>

      <SectionLabel>민감 권한 · 명시 동의</SectionLabel>
      <MdCard variant="outlined" style={{ padding: 4, borderColor: C('error') }}>
        {sensitive.map((r, i) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <Icon name={r.icon} size={22} style={{ color: p[r.k] ? C('error') : C('on-surface-variant'), flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="md-body-large" style={{ color: C('on-surface') }}>{r.label}</span>
                <SensitiveBadge />
              </div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{r.sub}</div>
            </div>
            <MdSwitch checked={p[r.k]} onChange={(v) => set(r.k, v)} />
          </div>
        ))}
      </MdCard>
      <div style={{ display: 'flex', gap: 8, padding: 12, marginTop: 12, borderRadius: 0, background: C('surface-container-high') }}>
        <Icon name="badge" size={18} style={{ color: C('tertiary'), flex: '0 0 auto', marginTop: 1 }} />
        <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
          위치·통신은 명시 동의 없이는 한 건도 수집하지 않아요. 미성년 계정에선 서버에서 잠겨요.
        </div>
      </div>
    </ScreenPad>
  );
}

/* ===================== 개인정보·약관·데이터 주권 ===================== */
function PrivacyScreen({ t, go }) {
  const C = window.SB.C;
  const facts = [
    { icon: 'badge', label: '기기에서 먼저', v: '원문은 내 기기에서 분석하고, 분석 결과만 잠가서 남겨요.' },
    { icon: 'inbox', label: '수집 항목', v: '담은 별가루·렌즈 점수·사용 패턴. 위치·통신은 동의 시에만.' },
    { icon: 'schedule', label: '보관 기간', v: '계정이 살아있는 동안 · 탈퇴 시 30일 내 완전 삭제.' },
    { icon: 'delete', label: '삭제권', v: '언제든 항목·전체를 삭제할 수 있어요.' },
  ];
  return (
    <ScreenPad>
      <SectionLabel>한눈에</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {facts.map((f, i) => (
          <div key={f.label} style={{ display: 'flex', gap: 13, padding: '13px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <Icon name={f.icon} size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto', marginTop: 1 }} />
            <div>
              <div className="md-body-large" style={{ color: C('on-surface') }}>{f.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{f.v}</div>
            </div>
          </div>
        ))}
      </MdCard>

      <SectionLabel>문서</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        <GapRow icon="shield_person" label="개인정보 처리방침" sub="2026. 06 개정" onClick={() => {}} />
        <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
        <GapRow icon="auto_stories" label="이용약관" sub="2026. 06 개정" onClick={() => {}} />
      </MdCard>

      <MdButton variant="tonal" full icon="shield_person" style={{ marginTop: 16 }} onClick={() => go('datareview')}>내 데이터 리뷰 열기</MdButton>
    </ScreenPad>
  );
}

/* ===================== 지원·공지 ===================== */
function SupportScreen({ t, go }) {
  const C = window.SB.C;
  const [open, setOpen] = useGp(null);
  const faqs = [
    { q: '밝기(별빛)와 확신은 뭐가 다른가요?', a: '별빛은 그 영역을 얼마나 많이 담았는지, 확신은 세컨비의 추정이 얼마나 검증됐는지예요. 둘은 따로 움직여요.' },
    { q: '유료가 더 똑똑한가요?', a: '아니요. 답의 질은 모든 요금제가 같아요. 횟수·보관·내보내기 한도만 달라요.' },
    { q: '통화 녹음은 안전한가요?', a: '녹음은 기기에서 받아쓰고 즉시 삭제해요. 텍스트와 신호만 암호화해 남겨요.' },
  ];
  const notices = [
    { t: '세컨비 3모드 출시', d: '06. 20', tag: '새 기능' },
    { t: 'AI 뮤지엄 8개 컬렉션 공개', d: '06. 12', tag: '콘텐츠' },
    { t: '온디바이스 STT 개선', d: '06. 02', tag: '개선' },
  ];
  return (
    <ScreenPad>
      <SectionLabel>문의</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        <MdButton variant="filled" icon="forum" style={{ flex: 1 }}>채팅 문의</MdButton>
        <MdButton variant="tonal" icon="send" style={{ flex: 1 }}>이메일 보내기</MdButton>
      </div>

      <SectionLabel>자주 묻는 질문</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {faqs.map((f, i) => (
          <div key={f.q} style={{ borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <button className="md-interactive" onClick={() => setOpen((o) => o === i ? null : i)}
              style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
              <span className="md-state" />
              <span className="md-body-large" style={{ flex: 1, color: C('on-surface'), wordBreak: 'keep-all' }}>{f.q}</span>
              <Icon name={open === i ? 'expand_less' : 'chevron_right'} size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            </button>
            {open === i && <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '0 12px 14px', wordBreak: 'keep-all' }}>{f.a}</div>}
          </div>
        ))}
      </MdCard>

      <SectionLabel>공지사항</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {notices.map((n, i) => (
          <div key={n.t} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C('on-secondary-container'), background: C('secondary-container'), borderRadius: 0, padding: '3px 9px', flex: '0 0 auto' }}>{n.tag}</span>
            <span className="md-body-large" style={{ flex: 1, color: C('on-surface'), wordBreak: 'keep-all' }}>{n.t}</span>
            <span className="md-body-small" style={{ color: C('on-surface-variant'), flex: '0 0 auto' }}>{n.d}</span>
          </div>
        ))}
      </MdCard>

      <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 18 }}>2nd-Brain · 버전 0.9.2 (rev2)</div>
    </ScreenPad>
  );
}

/* ===================== 사용 매뉴얼 ===================== */
function ManualScreen({ t, go }) {
  const C = window.SB.C;
  const concepts = [
    { icon: 'auto_awesome', title: '별 = 삶의 영역', body: '북두칠성 7별은 커리어·재정·성장·관계·건강·휴식·담아내기예요. 별을 눌러 그 영역의 나를 봐요.' },
    { icon: 'workspaces', title: '북극성 = 나의 종합', body: '7별을 모아 정체성 한 문장으로 비춰요. 별이 고르게 밝아질수록 또렷해져요.' },
    { icon: 'bubble_chart', title: '별빛 ≠ 확신', body: '별빛은 얼마나 담았는지, 확신은 얼마나 확인됐는지. 모르면 모른다고 말해요.' },
    { icon: 'task_alt', title: '확인하고 반영하기', body: '세컨비의 짐작은 제안일 뿐이에요. "맞아요"로 확인한 것만 나에게 반영돼요.' },
    { icon: 'inbox', title: '담기', body: '글·링크·사진·음성·할 일을 흘려보내지 말고 담아요. 분류는 세컨비가 도와요.' },
    { icon: 'forum', title: '세컨비 3모드', body: '세컨비(나를 아는)·메타비(객관적)·트위비(창의적). 필요에 따라 바꿔 대화해요.' },
  ];
  return (
    <ScreenPad>
      <div style={{ margin: '18px 0 6px' }}>
        <window.DialogBox compact kindLabel="세컨비" line="처음이세요? 6가지만 알면 충분해요."
        head={<window.SbHead size={32} track={false} />} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {concepts.map((c) => (
          <MdCard key={c.title} variant="filled" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 0, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('secondary-container'), color: C('on-secondary-container') }}>
                <Icon name={c.icon} size={21} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-title-small" style={{ color: C('on-surface') }}>{c.title}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 3, wordBreak: 'keep-all' }}>{c.body}</div>
              </div>
            </div>
          </MdCard>
        ))}
      </div>
      <MdButton variant="tonal" full icon="replay" style={{ marginTop: 16 }} onClick={() => { try { localStorage.removeItem('sb_coach'); } catch (e) {} go('home'); }}>홈에서 코치마크 다시 보기</MdButton>
    </ScreenPad>
  );
}

Object.assign(window, {
  PeerScreen, PwResetScreen, ProfileSetupScreen,
  DobGateScreen, PermissionsScreen, PrivacyScreen, SupportScreen, ManualScreen, GapRow,
});


/* ===================== NOTICES 공지사항 (신기능 B · PIXEL-CLAY) ===================== */
const NOTICE_KIND = {
  patch: { icon: 'campaign', bg: 'var(--md-sys-color-primary-container)', fg: 'var(--md-sys-color-on-primary-container)' },
  dev: { icon: 'edit_note', bg: 'var(--ds-nebula-deep)', fg: 'var(--ds-nebula-soft)' },
  maint: { icon: 'build', bg: 'var(--sunken)', fg: 'var(--danger)' }
};
function NoticeRich({ text }) {
  const parts = String(text).split('**');
  return <React.Fragment>{parts.map((p, i) => i % 2 ? <b key={i} style={{ color: 'var(--c11)', fontWeight: 700 }}>{p}</b> : p)}</React.Fragment>;
}
function NoticeTag({ kind, children }) {
  const C = window.SB.C;
  /* 모든 배지가 같은 높이·같은 형태를 갖는다. 색은 상태를 말할 때만 쓴다. */
  const sk = kind === 'new' ? { background: C('primary'), color: C('on-primary'), boxShadow: 'var(--ds-edge)' } :
  kind === 'ver' ? { background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' } :
  kind === 'maint' ? { background: 'transparent', color: C('error'), boxShadow: `0 0 0 2px ${C('error')}` } :
  { background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' };
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, boxSizing: 'border-box',
    fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 400, letterSpacing: '.1em', padding: '0 7px', ...sk }}>{children}</span>;
}
/* 공지 팝업 — 프레임 안 오버레이(디더 스크림 + ds-window). 확인=닫기, 리스트=히스토리, 과거 열람 시 이전/다음 페이저. */
function NoticeDialog({ notice, index, total, pager, onPrev, onNext, onList, onConfirm }) {
  const C = window.SB.C;
  const k = NOTICE_KIND[notice.type];
  return (
    <div onClick={onConfirm} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 75, display: 'grid', placeItems: 'center', padding: 22 }}>
      <div onClick={(e) => e.stopPropagation()} className="ds-window" role="dialog" aria-modal="true"
      style={{ width: '100%', maxWidth: 320, padding: '20px 18px 14px', margin: 'var(--u)',
        ...(notice.type === 'maint' ? { boxShadow: 'var(--ds-edge), 0 0 0 8px var(--sunken), 0 0 0 10px var(--danger)' } : null) }}>
        {/* 아이콘 타일과 첫 줄의 시각 중심을 맞추고, 배지·날짜를 같은 왼쪽 축에 세운다 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', flex: '0 0 auto',
            background: k.bg, color: k.fg, boxShadow: 'var(--ds-edge)' }}><Icon name={k.icon} fill size={18} /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 18 }}>
              {notice.latest && notice.type === 'patch' && <NoticeTag kind="new">NEW</NoticeTag>}
              {notice.version && <NoticeTag kind="ver">{notice.version}</NoticeTag>}
              {notice.type === 'dev' && <NoticeTag>개발자 공지</NoticeTag>}
              {notice.type === 'maint' && <NoticeTag kind="maint">점검 안내</NoticeTag>}
            </span>
            <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10,
              color: C('on-surface-variant'), letterSpacing: '.02em' }}>{notice.date}{notice.src ? ` · ${notice.src}` : ''}</span>
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5, marginBottom: 10, wordBreak: 'keep-all', color: C('on-surface') }}>{notice.ptitle || notice.title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: 'keep-all', color: C('on-surface-variant') }}>
          {notice.body.list ?
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9, margin: '4px 0 0', padding: 0 }}>
            {notice.body.list.map((it, i) =>
            <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <Icon name={it[0]} size={16} style={{ color: 'var(--ds-core)', marginTop: 2 }} />
              <span><NoticeRich text={it[1]} /></span>
            </li>)}
          </ul> :
          <div>{notice.body.paras.map((p, i) => <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}><NoticeRich text={p} /></p>)}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6, marginTop: 16 }}>
          {pager &&
          <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>
            <MdIconButton name="chevron_left" title="이전 공지" onClick={index > 0 ? onPrev : undefined} style={{ opacity: index <= 0 ? .4 : 1 }} />
            {index + 1} / {total}
            <MdIconButton name="chevron_right" title="다음 공지" onClick={index < total - 1 ? onNext : undefined} style={{ opacity: index >= total - 1 ? .4 : 1 }} />
          </span>}
          <span style={{ marginLeft: pager ? 0 : 'auto', display: 'inline-flex', gap: 6 }}>
            <MdButton variant="outlined" size="s" onClick={onList}>리스트</MdButton>
            <MdButton variant={notice.type === 'maint' ? 'tonal' : 'filled'} size="s" onClick={onConfirm}>확인</MdButton>
          </span>
        </div>
      </div>
    </div>);
}
/* 공지 히스토리 리스트 */
function NoticesScreen({ t, go, env }) {
  const C = window.SB.C;
  const N = window.SB.NOTICES;
  const read = window.SBNotices.read();
  const sub = (n) => (n.type === 'patch' ? `패치 ${n.version}` : n.type === 'dev' ? '공지' : '점검') + ' · ' + n.when;
  return (
    <ScreenPad>
      <MdCard variant="filled" style={{ padding: 4, marginTop: 8 }}>
        {N.map((n, i) => {
          const isUnread = !read.includes(n.id);const k = NOTICE_KIND[n.type];
          return (
            <div key={n.id} className="md-interactive" onClick={() => env.openNotice(i, true)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer',
              borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span className="md-state" />
              <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: k.bg, color: k.fg, boxShadow: 'var(--ds-edge)' }}><Icon name={k.icon} fill size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: isUnread ? 700 : 400, color: isUnread ? C('on-surface') : C('on-surface-variant') }}>
                  {isUnread && <span style={{ width: 6, height: 6, background: 'var(--ds-core)', flex: '0 0 auto' }} />}
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                </div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{sub(n)}</div>
              </div>
              <Icon name="chevron_right" size={18} style={{ color: C('on-surface-variant') }} />
            </div>);
        })}
      </MdCard>
    </ScreenPad>);
}
Object.assign(window, { NoticeDialog, NoticesScreen, NOTICE_KIND });
