/* ============================================================
   2nd-Brain · A그룹 — 인증 · 법률 문서 (브리프 01-auth.md)
   - SignUpScreen      : /sign-up 회원가입 (연령 게이트 · PIPA 동의 · 6자리 코드)
   - ConsentNoticeScreen : /consent-notice 동의 항목 안내
   - TermsScreen       : /terms 이용약관
   - RefundScreen      : /refund 환불 및 청약철회 정책
   - PrivacyDocScreen  : /privacy-policy 개인정보처리방침 (설정의 /privacy 와 별개)
   - NotFoundScreen    : /+not-found 404
   - StateRow          : 전 화면 공통 디버그 상태 전환 행
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useAu } = React;

/* ── 전 화면 공통 디버그 행 — empty/loading/error/filled 전환 ── */
function StateRow({ value, onChange, extra }) {
  return null;   // 디버그 행 — 전 화면에서 숨김. 상태 전환은 window.__sb.jump 로 확인.
}

/* ── 상태 공용 표면 ── */
function StateView({ state, title, body, cta, ctaLabel, icon }) {
  const C = window.SB.C;
  if (state === 'loading') return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '48px 24px', textAlign: 'center' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><SbHead size={48} expression="neutral" track={false} /></div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant') }}>{body || '불러오는 중이에요…'}</div>
      </div>
    </div>);
  return (
    <div className="px-frame" style={{ padding: 20, margin: '12px 0', background: C('surface-container-low'), textAlign: 'center' }}>
      <Icon name={icon || (state === 'error' ? 'warning' : 'star_shine')} size={32}
      style={{ color: state === 'error' ? C('error') : 'var(--ds-core)' }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), margin: '10px 0 6px', wordBreak: 'keep-all' }}>{title}</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>{body}</div>
      {cta && <div style={{ marginTop: 16 }}><MdButton variant="tonal" full onClick={cta}>{ctaLabel}</MdButton></div>}
    </div>);
}

/* ===================== /sign-up 회원가입 ===================== */
const CONSENT_ITEMS = [
{ key: 'service', req: true, label: '서비스 제공을 위한 위 수집과 이용에 동의합니다.', short: '서비스 제공을 위한 수집과 이용' },
{ key: 'llm', req: true, label: 'AI 응답을 위한 기록 처리', short: 'AI 응답을 위한 기록 처리' },
{ key: 'overseas', req: true, label: '국외 처리(국외 이전) 안내', short: '국외 처리(국외 이전) 안내' },
{ key: 'sensitive', req: true, label: '민감할 수 있는 기록의 취급', short: '민감할 수 있는 기록의 취급' },
{ key: 'marketing', req: false, label: '가끔 제품 소식을 받아볼게요 (선택).', short: '제품 소식 받기(선택)' }];

function ConsentBlock({ value, onToggle, onAll, onDetail }) {
  const C = window.SB.C;
  const reqKeys = CONSENT_ITEMS.filter((i) => i.req).map((i) => i.key);
  const allReq = reqKeys.every((k) => value[k]);
  return (
    <MdCard variant="filled" style={{ padding: 4 }}>
      <div style={{ padding: '10px 12px 6px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface') }}>시작 전에 잠깐 확인해 주세요</div>
      </div>
      <div className="md-interactive" onClick={() => onAll(!allReq)}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
        background: C('surface-container-high') }}>
        <span className="md-state" />
        <span style={{ pointerEvents: 'none', display: 'inline-flex' }}><MdCheckbox checked={allReq} onChange={() => {}} /></span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C('on-surface') }}>필수 항목에 모두 동의</span>
      </div>
      {CONSENT_ITEMS.map((it, i) => (
        <div key={it.key} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C('outline-variant')}` }}>
          <div className="md-interactive" onClick={() => onToggle(it.key)}
          style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px 10px 12px', cursor: 'pointer' }}>
            <span className="md-state" />
            <span style={{ pointerEvents: 'none', display: 'inline-flex' }}><MdCheckbox checked={!!value[it.key]} onChange={() => {}} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{it.label}</span>
              <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: it.req ? 'var(--ds-core)' : C('on-surface-variant'), marginTop: 2 }}>{it.req ? '필수' : '선택'}</span>
            </span>
          </div>
          {onDetail && <MdIconButton name="chevron_right" title="자세히" onClick={() => onDetail(it.key)} />}
        </div>
      ))}
    </MdCard>);
}

function AuField({ label, value, onChange, ph, type, hint, hintTone, trailing, invalid, boxRef }) {
  const C = window.SB.C;
  return (
    <div ref={boxRef}>
      <div className="md-label-medium" style={{ color: invalid ? C('error') : C('on-surface-variant'), marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 12px',
        background: 'var(--panel-2)', boxShadow: invalid ? '0 0 0 2px var(--danger)' : 'var(--ds-edge)' }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} type={type || 'text'}
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
          color: 'var(--c07)', fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }} />
        {trailing}
      </div>
      {hint && <div className="md-body-small" style={{ color: hintTone === 'error' || invalid ? C('error') : C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>{hint}</div>}
    </div>);
}

function SignUpScreen({ t, go, env }) {
  const C = window.SB.C;
  const [state, setState] = useAu('filled');
  const [email, setEmail] = useAu('');
  const [pw, setPw] = useAu('');
  const [showPw, setShowPw] = useAu(false);
  const [pw2, setPw2] = useAu('');
  const [dobOpen, setDobOpen] = useAu(false);
  const [showPw2, setShowPw2] = useAu(false);
  const [dob, setDob] = useAu('');
  const [consent, setConsent] = useAu({});
  const [phase, setPhase] = useAu('form');   // form | confirm | existing
  const [code, setCode] = useAu('');
  const [err, setErr] = useAu(null);
  const [busy, setBusy] = useAu(false);
  const [bad, setBad] = useAu([]);           // 못 채운 항목 — 계정 만들기를 눌렀을 때만 켠다
  const scRef = React.useRef(null);
  const refs = { email: React.useRef(null), pw: React.useRef(null), pw2: React.useRef(null), dob: React.useRef(null), consent: React.useRef(null) };

  const reqKeys = CONSENT_ITEMS.filter((i) => i.req).map((i) => i.key);
  const allReq = reqKeys.every((k) => consent[k]);
  const pwMatch = pw.length >= 8 && pw === pw2;
  /* 만 나이 — 생일이 지났는지까지 본다 */
  const age = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
    const b = new Date(dob + 'T00:00:00'), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    const m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a -= 1;
    return a;
  })();
  const tooYoung = age != null && age < 14;
  /* 화면에 놓인 순서대로 — 첫 미충족 항목으로 스크롤한다 */
  const checks = [
    ['email', email.includes('@'), '이메일 주소를 확인해 주세요.'],
    ['pw', pw.length >= 8, '비밀번호를 8자 이상으로 정해 주세요.'],
    ['pw2', pw === pw2 && pw2.length > 0, '두 비밀번호가 서로 달라요.'],
    ['dob', /^\d{4}-\d{2}-\d{2}$/.test(dob) && age >= 14,
      !/^\d{4}-\d{2}-\d{2}$/.test(dob) ? '생년월일을 골라 주세요.' : '만 14세 이상만 가입할 수 있어요.'],
    ['consent', allReq, '필수 항목에 모두 동의해 주세요.']];
  const canSubmit = checks.every((c) => c[1]) && !busy;
  const isBad = (k) => bad.includes(k);
  const clearBad = (k) => setBad((s) => s.filter((x) => x !== k));

  const toast = (msg, tone) => env && env.showToast && env.showToast({ msg, tone });
  const submit = () => {
    setErr(null);
    const miss = checks.filter((c) => !c[1]);
    if (miss.length) {
      setBad(miss.map((c) => c[0]));
      toast(miss[0][2]);
      const el = refs[miss[0][0]] && refs[miss[0][0]].current;
      const sc = scRef.current;
      /* 컨테이너가 static 이라 offsetTop 은 바깥 기준 — 실제 화면 좌표로 잰다 */
      if (el && sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16;
      return;
    }
    if (pw === 'password') { toast('이 비밀번호는 알려진 유출 목록에 있어요. 다른 비밀번호로 바꿔 주세요.'); return; }
    if (email.startsWith('already@')) { setPhase('existing'); return; }
    if (/@xprize\.org$/i.test(email)) {
      toast('환영합니다. 전체 접근 권한이 활성화됐습니다.');
      setBusy(true);
      setTimeout(() => { setBusy(false); go('profilesetup'); }, 900);
      return;
    }
    setBusy(true);
    setTimeout(() => { setBusy(false); setPhase('confirm'); }, 700);
  };
  const verify = () => {
    if (code.length !== 6) { setErr('코드가 맞지 않아요. 최신 메일의 코드로 다시 시도해 주세요.'); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); go('profilesetup'); }, 700);
  };
  const editEmail = (v) => { setEmail(v); setPhase('form'); setErr(null); };

  const debug = (
    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
      {[['form', '폼'], ['confirm', '코드'], ['existing', '기존계정']].map(([k, l]) => (
        <button key={k} onClick={() => setPhase(k)} className="md-interactive"
        style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '4px 8px', minHeight: 26,
          background: phase === k ? 'var(--ds-nebula-deep)' : C('surface-container-high'),
          color: phase === k ? 'var(--ds-nebula-soft)' : C('on-surface-variant'),
          boxShadow: 'var(--ds-edge)', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>
          <span className="md-state" />{l}
        </button>))}
    </span>);

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="확인하는 중…" />;
    if (state === 'error') return <StateView state="error" title="가입에 실패했어요" body="연결을 확인하고 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return (
      <React.Fragment>
        <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={64} expression="positive" track /></div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)', marginTop: 12 }}>회원가입</div>
        </div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', padding: '10px 0 0', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          만 14세부터 가입할 수 있어요. 14세 미만은 보호자 동의가 필요해요.
        </div>
      </React.Fragment>);
    return (
      <React.Fragment>
        <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={56} expression="positive" track /></div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)', marginTop: 10 }}>회원가입</div>
        </div>

        {phase === 'confirm' && (
          <MdCard variant="filled" style={{ padding: 16, marginTop: 14, background: C('surface-container-high') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name="mail" size={18} style={{ color: 'var(--ds-core)' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>이메일을 확인해 주세요</span>
            </div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty', marginBottom: 12 }}>
              확인 코드를 {email || 'aria@example.com'} 주소로 보냈어요. 메일 속 6자리 코드를 아래에 입력하면 가입이 완료돼요. 안 보이면 스팸함도 확인해 주세요.
            </div>
            <AuField label="확인 코드 6자리" value={code} onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(null); }}
            ph="000000" hint={err} hintTone="error" />
            <div style={{ marginTop: 12 }}><MdButton variant="filled" full onClick={verify} disabled={busy}>{busy ? '확인 중…' : '코드 확인'}</MdButton></div>
          </MdCard>)}

        {phase === 'existing' && (
          <MdCard variant="filled" style={{ padding: 16, marginTop: 14, background: C('surface-container-high'),
            boxShadow: 'var(--ds-edge), 0 0 0 4px var(--sunken), 0 0 0 6px var(--warn)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name="info" size={18} style={{ color: 'var(--warn)' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>이미 가입하셨나요?</span>
            </div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              이 주소로 만든 계정이 있을 수 있어요. 로그인 화면에서 다시 시도해 보세요.
            </div>
            <div style={{ marginTop: 12 }}><MdButton variant="tonal" full onClick={() => go('auth')}>로그인 화면으로</MdButton></div>
          </MdCard>)}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <AuField label="이메일" value={email} onChange={(v) => { editEmail(v); clearBad('email'); }} ph="aria@example.com" type="email"
          invalid={isBad('email')} boxRef={refs.email}
          hint={isBad('email') ? '이메일 주소를 확인해 주세요.' : null} />
          <AuField label="비밀번호" value={pw} onChange={(v) => { setPw(v); clearBad('pw'); clearBad('pw2'); }} ph="••••••••" type={showPw ? 'text' : 'password'}
          invalid={isBad('pw')} boxRef={refs.pw}
          hint="8자 이상"
          trailing={
            <button onClick={() => setShowPw((v) => !v)} aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'} className="md-interactive"
            style={{ position: 'relative', width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--fg-muted)' }}>
              <span className="md-state" />
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon name="visibility" size={18} />
                {showPw && <span aria-hidden="true" style={{ position: 'absolute', left: 1, right: 1, top: '50%', height: 2, background: 'currentColor', boxShadow: '0 -2px 0 0 var(--panel-2)' }} />}
              </span>
            </button>} />
          <AuField label="비밀번호 확인" value={pw2} onChange={(v) => { setPw2(v); clearBad('pw2'); }} ph="한 번 더 입력" type={showPw2 ? 'text' : 'password'}
          invalid={isBad('pw2')} boxRef={refs.pw2}
          hint={pw2 && pw !== pw2 ? '두 비밀번호가 서로 달라요.' : pwMatch ? '두 비밀번호가 일치해요.' : isBad('pw2') ? '비밀번호를 한 번 더 입력해 주세요.' : null}
          hintTone={pw2 && pw !== pw2 ? 'error' : undefined}
          trailing={
            <button onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? '비밀번호 숨기기' : '비밀번호 보기'} className="md-interactive"
            style={{ position: 'relative', width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--fg-muted)' }}>
              <span className="md-state" />
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon name="visibility" size={18} />
                {showPw2 && <span aria-hidden="true" style={{ position: 'absolute', left: 1, right: 1, top: '50%', height: 2, background: 'currentColor', boxShadow: '0 -2px 0 0 var(--panel-2)' }} />}
              </span>
            </button>} />
          {/* 생년월일 — 달력에서 고른다 */}
          <div ref={refs.dob}>
            <div className="md-label-medium" style={{ color: isBad('dob') || tooYoung ? C('error') : C('on-surface-variant'), marginBottom: 5 }}>생년월일</div>
            <button onClick={() => { setDobOpen(true); clearBad('dob'); }} className="md-interactive"
            style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 12px',
              border: 'none', cursor: 'pointer', textAlign: 'left', background: 'var(--panel-2)',
              boxShadow: isBad('dob') || tooYoung ? '0 0 0 2px var(--danger)' : 'var(--ds-edge)' }}>
              <span className="md-state" />
              <Icon name="calendar_today" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: dob ? 'var(--c07)' : C('on-surface-variant'),
                fontFamily: 'var(--md-ref-typeface-plain)' }}>
                {dob ? (window.sbFmtDate ? window.sbFmtDate(dob) : dob) : '눌러서 달력 열기'}
              </span>
              <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            </button>
            <div className="md-body-small" style={{ color: isBad('dob') || tooYoung ? C('error') : C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>
              {tooYoung ? '만 14세 이상만 가입할 수 있어요. 보호자 동의가 있어야 이용할 수 있어요.' :
              isBad('dob') ? '생년월일을 골라 주세요.' : '만 14세 이상만 가입할 수 있어요.'}
            </div>
          </div>
        </div>

        <div ref={refs.consent} style={{ marginTop: 16, boxShadow: isBad('consent') ? '0 0 0 2px var(--danger)' : 'none' }}>
          <ConsentBlock value={consent} onToggle={(k) => { setConsent((s) => ({ ...s, [k]: !s[k] })); clearBad('consent'); }}
          onAll={(v) => { setConsent((s) => { const n = { ...s }; reqKeys.forEach((k) => n[k] = v); return n; }); clearBad('consent'); }}
          onDetail={(k) => go('consent-notice', { item: k })} />
        </div>
        {isBad('consent') && <div className="md-body-small" style={{ color: C('error'), marginTop: 6, wordBreak: 'keep-all' }}>필수 항목에 모두 동의해 주세요.</div>}

        <div style={{ marginTop: 16 }}>
          <MdButton variant="filled" full disabled={busy} onClick={submit}>{busy ? '만드는 중…' : '계정 만들기'}</MdButton>
        </div>

      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={scRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 20px' }}>{body()}</div>
      {dobOpen && window.CalendarSheet &&
      <window.CalendarSheet value={dob} title="생년월일" pastOnly onChange={setDob} onClose={() => setDobOpen(false)} />}
      <StateRow value={state} onChange={setState} extra={debug} />
    </div>);
}

/* ===================== /consent-notice 동의 항목 안내 ===================== */
const NOTICE_SECTIONS = [
{ key: 'service', title: '서비스 제공을 위한 수집과 이용', req: true,
  what: '이메일, 생년월일, 그리고 직접 작성한 기록(일기, 노트, 캡처).',
  why: '계정을 만들고 기록을 저장하며 별자리를 계산하기 위해서예요.',
  keep: '탈퇴 시까지. 탈퇴하면 30일 안에 완전히 지워요.',
  right: '동의하지 않으면 서비스를 이용할 수 없어요.' },
{ key: 'llm', title: 'AI 응답을 위한 기록 처리', req: true,
  what: '세컨비에게 물어볼 때 참고하는 기록의 본문.',
  why: '근거 있는 답을 만들기 위해 AI 모델에 전달해요.',
  keep: '전달한 내용은 응답 생성 후 보관하지 않아요.',
  right: '동의하지 않으면 AI 대화 기능만 꺼져요. 기록은 그대로 쓸 수 있어요.' },
{ key: 'overseas', title: '국외 처리(국외 이전) 안내', req: true,
  what: 'AI 처리에 전달되는 기록 본문.',
  why: 'AI 모델 서버가 국외에 있어요.',
  keep: '전송 구간은 암호화되고 별도 보관은 없어요.',
  right: '동의하지 않으면 AI 기능이 제한돼요.' },
{ key: 'sensitive', title: '민감할 수 있는 기록의 취급', req: true,
  what: '건강·신념·관계처럼 민감할 수 있는 내용이 담긴 기록.',
  why: '별 밝기 계산과 요약에 쓰여요. 판매하거나 광고에 쓰지 않아요.',
  keep: '다른 기록과 같은 기준으로 보관해요.',
  right: '개별 기록은 언제든 지울 수 있어요.' },
{ key: 'marketing', title: '제품 소식 받기(선택)', req: false,
  what: '이메일 주소.',
  why: '새 기능과 업데이트 소식을 보내요.',
  keep: '수신 거부 시 즉시 목록에서 빼요.',
  right: '동의하지 않아도 모든 기능을 그대로 쓸 수 있어요.' }];

function ConsentNoticeScreen({ t, go, param }) {
  const C = window.SB.C;
  const [state, setState] = useAu('filled');
  const focus = param && param.item;
  const refs = React.useRef({});
  const scRef = React.useRef(null);
  React.useEffect(() => {
    if (!focus) return;
    const el = refs.current[focus];
    const sc = scRef.current;
    if (el && sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12;
  }, [focus]);
  const Line = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
      <span style={{ flex: '0 0 auto', width: 52, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), paddingTop: 2 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 12, color: C('on-surface'), lineHeight: 1.55, wordBreak: 'keep-all' }}>{children}</span>
    </div>);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={scRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>
        {state === 'loading' ? <StateView state="loading" /> :
        state === 'error' ? <StateView state="error" title="문서를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" /> :
        <React.Fragment>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '8px 0 14px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            가입할 때 확인하는 각 항목이 무엇을 뜻하는지, 왜 필요한지, 어떤 선택권이 있는지 정리했습니다.
          </div>
          <MdCard variant="filled" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), marginBottom: 6 }}>무엇을 모으고 왜 쓰나요</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              수집 항목: 이메일, 생년월일, 그리고 직접 작성한 기록(일기, 노트, 캡처).
            </div>
          </MdCard>
          {state === 'empty' ? <StateView state="empty" title="표시할 항목이 없어요" body="가입 화면에서 다시 열어보세요." /> :
          NOTICE_SECTIONS.map((s) => (
            <div key={s.key} ref={(el) => refs.current[s.key] = el}
            style={{ background: C('surface-container'), padding: 14, marginBottom: 10,
              boxShadow: focus === s.key ? 'var(--ds-edge), 0 0 0 4px var(--sunken), 0 0 0 6px var(--ds-core)' : 'var(--ds-edge)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '2px 7px',
                  background: s.req ? C('primary') : C('surface-container-highest'),
                  color: s.req ? C('on-primary') : C('on-surface-variant') }}>{s.req ? '필수' : '선택'}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all' }}>{s.title}</div>
              <Line label="무엇을">{s.what}</Line>
              <Line label="왜">{s.why}</Line>
              <Line label="언제까지">{s.keep}</Line>
              <Line label="선택권">{s.right}</Line>
            </div>))}
          <div className="md-body-small" style={{ color: C('on-surface-variant'), padding: '6px 2px 0', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            궁금한 점은 설정의 지원에서 언제든 물어보세요. 영업일 2일 안에 답합니다.
          </div>
        </React.Fragment>}
      </div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== 정책 및 약관 — 한 화면 · 접었다 펴는 3절 ===================== */
const TERMS_SECTIONS = [
{ h: '제1조 (목적)', p: '이 약관은 2nd-Brain 서비스의 이용 조건과 절차, 회사와 이용자의 권리·의무·책임을 정합니다.' },
{ h: '제2조 (정의)', p: '‘기록’은 이용자가 직접 작성하거나 가져온 자료를 말합니다. ‘별’은 기록량에서 계산되는 표시 단위입니다.' },
{ h: '제3조 (계정)', p: '만 14세 이상만 가입할 수 있습니다. 계정 정보의 관리 책임은 이용자에게 있습니다.' },
{ h: '제4조 (서비스의 제공)', p: '회사는 기록 저장, AI 응답, 별자리 계산 기능을 제공합니다. 점검이 필요할 때 일시 중단될 수 있습니다.' },
{ h: '제5조 (이용자의 기록에 대한 권리)', p: '기록의 권리는 이용자에게 있습니다. 회사는 서비스 제공 목적 밖으로 쓰지 않으며 판매하지 않습니다.' },
{ h: '제6조 (금지 행위)', p: '타인의 권리를 침해하거나 서비스 운영을 방해하는 행위를 금지합니다.' },
{ h: '제7조 (해지)', p: '이용자는 언제든 탈퇴할 수 있으며, 탈퇴 시 기록 삭제 절차가 진행됩니다.' },
{ h: '제8조 (책임의 한계)', p: 'AI가 만든 요약과 제안은 참고용이며 전문가의 판단을 대신하지 않습니다.' },
{ h: '제9조 (분쟁의 해결)', p: '분쟁은 대한민국 법률에 따르며 관할 법원은 회사 소재지 법원으로 합니다.' }];

const REFUND_SECTIONS = [
{ h: '1. 결제 대행', p: '결제는 Paddle(Merchant of Record)을 통해 이뤄집니다. 영수증과 환불 처리도 Paddle을 거칩니다.' },
{ h: '2. 청약철회 기간', p: '결제일로부터 7일 이내, 유료 기능을 사용하지 않은 경우 전액 환불됩니다.' },
{ h: '3. 사용 후 환불', p: '유료 기능을 이미 사용한 경우 남은 기간에 해당하는 금액을 일할 계산해 환불합니다.' },
{ h: '4. 정기 결제', p: '해지 시 다음 결제일부터 청구되지 않으며, 남은 기간은 그대로 이용할 수 있습니다.' },
{ h: '5. 환불 제외', p: '광고 시청으로 받은 무료 횟수 등 무상 제공분은 환불 대상이 아닙니다.' },
{ h: '6. 신청 방법', p: '설정의 지원에서 환불을 요청하면 영업일 2일 안에 답변드립니다.' }];

const PRIVACY_DOC_SECTIONS = [
{ h: '1. 수집하는 개인정보 항목', p: '이메일, 생년월일, 이용자가 직접 작성하거나 가져온 기록. 선택 항목으로 프로필 이름·이미지.' },
{ h: '2. 개인정보의 처리 목적', p: '계정 식별, 기록 저장과 검색, 별 밝기 계산, AI 응답 생성, 고객 지원.' },
{ h: '3. 보유 및 이용 기간', p: '탈퇴 시까지 보유하며, 탈퇴 후 30일 이내 파기합니다. 법령이 정한 경우 해당 기간 보관합니다.' },
{ h: '4. 제3자 제공', p: '제3자에게 판매하거나 제공하지 않습니다. 법령에 따른 요구가 있는 경우에만 예외로 합니다.' },
{ h: '5. 처리 위탁 및 국외 이전', p: 'AI 응답 생성을 위해 기록 본문이 국외 AI 처리 사업자에 전달될 수 있습니다. 전송 구간은 암호화됩니다.' },
{ h: '6. 정보주체의 권리', p: '열람·정정·삭제·처리정지를 언제든 요구할 수 있습니다. 설정에서 직접 내보내기와 삭제가 가능합니다.' },
{ h: '7. 만 14세 미만의 개인정보', p: '만 14세 미만은 가입할 수 없으며, 확인되는 경우 계정과 기록을 삭제합니다.' },
{ h: '8. 안전성 확보 조치', p: '전송 구간 암호화, 접근 권한 최소화, 접근 기록 보관.' },
{ h: '9. 개인정보 보호책임자', p: '설정의 지원 화면에서 문의하면 담당자에게 전달됩니다.' }];


const LEGAL_DOCS = [
{ id: 'terms', title: '이용약관', sections: TERMS_SECTIONS },
{ id: 'privacy-policy', title: '개인정보 처리방침', sections: PRIVACY_DOC_SECTIONS },
{ id: 'refund', title: '환불 및 청약철회 정책', sections: REFUND_SECTIONS }];

function LegalScreen({ t, go, param }) {
  const C = window.SB.C;
  const [state, setState] = useAu('filled');
  const [open, setOpen] = useAu((param && param.doc) || 'terms');
  const scRef = React.useRef(null);
  const refs = { terms: React.useRef(null), 'privacy-policy': React.useRef(null), refund: React.useRef(null) };
  const toggle = (id) => setOpen(open === id ? null : id);
  /* 펼침이 커밋된 뒤에 잰다 — 그 전엔 위쪽 높이가 아직 안 줄어 있다 */
  React.useEffect(() => {
    if (!open) return;
    const el = refs[open] && refs[open].current, sc = scRef.current;
    if (el && sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8;
  }, [open]);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={scRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>
        {state === 'loading' ? <StateView state="loading" /> :
        state === 'error' ? <StateView state="error" title="문서를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" /> :
        <React.Fragment>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '10px 0 14px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            항목을 누르면 전문이 펼쳐져요.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LEGAL_DOCS.map((d) => {
              const on = open === d.id;
              return (
                <div key={d.id} ref={refs[d.id]} style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)' }}>
                  <div className="md-interactive" onClick={() => toggle(d.id)} role="button" aria-expanded={on}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px', cursor: 'pointer', minHeight: 48 }}>
                    <span className="md-state" />
                    <Icon name="description" size={18} style={{ color: on ? 'var(--ds-core)' : C('on-surface-variant'), flex: '0 0 auto' }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all' }}>{d.title}</span>
                    <Icon name={on ? 'expand_less' : 'expand_more'} size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
                  </div>
                  {on &&
                  <div style={{ padding: '0 14px 16px' }}>
                    {d.sections.map((s, i) => (
                      <div key={s.h} style={{ marginTop: i ? 16 : 4, paddingTop: i ? 14 : 0, borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all' }}>{s.h}</div>
                        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 5, lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty' }}>{s.p}</div>
                      </div>))}
                    <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C('outline-variant')}` }}>
                      <div className="md-body-small" style={{ color: C('on-surface-variant'), fontStyle: 'italic', wordBreak: 'keep-all' }}>
                        본문은 자리표시자예요. 법무 검토 원문이 준비되면 이 자리에 그대로 실립니다.
                      </div>
                    </div>
                  </div>}
                </div>);
            })}
          </div>
        </React.Fragment>}
      </div>
      <StateRow value={state} onChange={setState} />
    </div>);
}
const TermsScreen = LegalScreen, RefundScreen = LegalScreen, PrivacyDocScreen = LegalScreen;

/* ===================== /+not-found 404 ===================== */
function NotFoundScreen({ t, go }) {
  const C = window.SB.C;
  const [state, setState] = useAu('filled');
  const links = [
  { icon: 'add_circle', label: '별가루 담기', route: 'capture' },
  { icon: 'history', label: '과거의 나', route: 'audit' },
  { icon: 'person', label: '페르소나', route: 'me' },  { icon: 'menu_book', label: '사용 안내서', route: 'manual' }];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 20px' }}>
        {state === 'loading' ? <StateView state="loading" /> :
        <React.Fragment>
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={64} expression="negative" track /></div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 30, letterSpacing: '.18em', color: 'var(--ds-nebula)', marginTop: 14 }}>404</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)', marginTop: 8 }}>없는 화면이에요</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              홈 화면에서 다시 시작할 수 있어요.
            </div>
          </div>
          <div style={{ marginTop: 16 }}><MdButton variant="filled" full icon="home" onClick={() => go('home')}>홈으로</MdButton></div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), textAlign: 'center', margin: '20px 0 10px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            연결이 끊어진 것 같아요. 이어갈 화면을 골라 주세요.
          </div>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '0 0 8px' }}>자주 가는 화면</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {links.map((l, i) => (
              <div key={l.route} className="md-interactive" onClick={() => go(l.route)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', cursor: 'pointer',
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                <span className="md-state" />
                <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
                  <Icon name={l.icon} size={16} />
                </span>
                <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>{l.label}</span>
                <Icon name="chevron_right" size={18} style={{ color: C('on-surface-variant') }} />
              </div>))}
          </MdCard>
        </React.Fragment>}
      </div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

Object.assign(window, { SignUpScreen, ConsentNoticeScreen, TermsScreen, RefundScreen, PrivacyDocScreen, NotFoundScreen, LegalScreen, StateRow, StateView, AuField, ConsentBlock, CONSENT_ITEMS });

/* ===================== 홈 코너 '더보기' 시트 ===================== */
const MORE_SECTIONS = [
{ title: '나를 돌아보기', items: [
  { icon: 'insights', label: '인사이트', sub: '이번 주 vs 지난주', route: 'insights' },
  { icon: 'hub', label: '연결 찾기', sub: '기록 사이의 다리', route: 'research' },
  { icon: 'trending_up', label: '트렌드', sub: '떠오르는 관심사', route: 'discover' },
  { icon: 'auto_awesome', label: '나의 변화', sub: '주간 성장 리뷰', route: 'growth' },
  { icon: 'task_alt', label: '점검', sub: '제안 받고 승인하기', route: 'review' }] },
{ title: '검사 · 측정', items: [
  { icon: 'bubble_chart', label: '성격 정밀검사', sub: 'IPIP-NEO-120', route: 'ipip-neo' },
  { icon: 'favorite', label: '삶의 만족도', sub: 'RLSS 6문항', route: 'rlss' },
  { icon: 'schedule', label: '가벼운 체크인', sub: '15초 순간 기록', route: 'esm' },
  { icon: 'groups', label: '나를 아는 사람들에게 묻기', sub: '지인 초대 관리', route: 'peer-invites' },
  { icon: 'share', label: '지인 응답 랜딩', sub: '무계정 화면 미리보기', route: 'peer-token' },
  { icon: 'shield', label: '도움 연결', sub: '위기 라우팅 표면', route: 'crisis' }] },
{ title: '생활 관리', items: [
  { icon: 'timer', label: '일일 집중', sub: '포모도로', route: 'focus' },
  { icon: 'flag', label: '목표', sub: '마일스톤 관리', route: 'milestones' },
  { icon: 'payments', label: '이번 달 점검', sub: '가계부', route: 'ledger' },
  { icon: 'restaurant', label: '이번 주 식단', sub: '주간 그리드', route: 'meals' },
  { icon: 'menu_book', label: '내 책장', sub: '읽고 있는 책', route: 'reading' },
  { icon: 'ac_unit', label: '휴식', sub: '3상태 보드', route: 'rest' },
  { icon: 'group', label: '관계', sub: '궤도형 인물맵', route: 'people' },
  { icon: 'code', label: '사이드 프로젝트', sub: 'GitHub 활동', route: 'side-project' },
  { icon: 'school', label: '언어 복습', sub: '오늘의 카드', route: 'srs' }] },
{ title: '데이터 · 문서', items: [
  { icon: 'person', label: '계정', sub: '나 허브', route: 'account' },
  { icon: 'badge', label: '나', sub: '프로필 · 자기이해 묶음', route: 'profile' },
  { icon: 'workspace_premium', label: '구독 관리', sub: '해지 · 환불 요청', route: 'subscription' },
  { icon: 'palette', label: '테마 · 글꼴', sub: '보기 편한 설정', route: 'theme' },
  { icon: 'lan', label: '지식', sub: '위키 그래프', route: 'wiki' },
  { icon: 'cloud_upload', label: '가져오기', sub: '개인 데이터 허브', route: 'import-hub' },
  { icon: 'ios_share', label: '내보내기 형식', sub: '.iden · 클리퍼 형식', route: 'formats' },
  { icon: 'description', label: '정책 및 약관', sub: '이용약관 · 처리방침 · 환불', route: 'terms' }] }];

function MoreSheet({ go }) {
  const C = window.SB.C;
  const Row = ({ it, first }) => (
    <div className="md-interactive" onClick={() => go(it.route)}
    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 10px', cursor: 'pointer', minHeight: 48,
      borderTop: first ? 'none' : `1px solid ${C('outline-variant')}` }}>
      <span className="md-state" />
      <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flex: '0 0 auto',
        background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
        <Icon name={it.icon} size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{it.label}</span>
        {it.sub && <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>{it.sub}</span>}
      </span>
      <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
    </div>);
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), padding: '0 2px 12px' }}>더보기</div>
      {/* 오늘의 정리 — 상단 고정 */}
      <div className="md-interactive" onClick={() => go('digest-today')}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', cursor: 'pointer', minHeight: 48,
        background: C('primary-container'), boxShadow: 'var(--ds-edge)' }}>
        <span className="md-state" />
        <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', flex: '0 0 auto',
          background: C('primary'), color: C('on-primary'), boxShadow: 'var(--ds-edge)' }}>
          <Icon name="checklist" size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C('on-primary-container') }}>오늘의 정리</span>
          <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-primary-container'), marginTop: 1 }}>연결 제안 확인</span>
        </span>
        <Icon name="chevron_right" size={18} style={{ color: C('on-primary-container') }} />
      </div>
      {MORE_SECTIONS.map((sec) => (
        <div key={sec.title} style={{ marginTop: 16 }}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), padding: '0 2px 6px' }}>{sec.title}</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {sec.items.map((it, i) => <Row key={it.route} it={it} first={i === 0} />)}
          </MdCard>
        </div>))}
    </div>);
}
window.MoreSheet = MoreSheet;
