/* ============================================================
   2nd-Brain · 감사 회신 반영 — 누락 6화면 (10-ops.md · 11-settings.md · 03-polaris.md)
   - AccountScreen      : /account 계정 허브 (immersive)
   - ProfileHubScreen   : /profile 나 허브 (windowed, 플랜 카드 + 2탭)
   - SubscriptionScreen : /subscription 구독 관리 (windowed)
   - ThemeScreen        : /theme 테마 · 글꼴 (windowed)
   - RlssScreen         : /rlss 삶의 만족도 RLSS 6문항 (windowed)
   - PeerTokenScreen    : /peer/[token] 지인 응답 랜딩 (gate · 무계정)
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useSt2 } = React;

/* ===================== /account 계정 허브 ===================== */
function AccountScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useSt2('filled');
  const rows = [
  { icon: 'person', label: '프로필', route: 'profile' },
  { icon: 'settings', label: '설정', route: 'settings' },
  { icon: 'database', label: '내 데이터', route: 'datareview' },
  { icon: 'ios_share', label: 'IDEN', route: 'iden' },
  { icon: 'smartphone', label: '앱 밖에서', route: 'widget' }];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>계정</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>
        {state === 'loading' ? <StateView state="loading" /> :
        state === 'error' ? <StateView state="error" title="계정 정보를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" /> :
        <React.Fragment>
          <div style={{ textAlign: 'center', padding: '18px 0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={64} expression="neutral" track /></div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              계정 정보는 네가 소유하고, 필요한 것만 연결해요.
            </div>
          </div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {rows.map((r, i) => (
              <div key={r.route} className="md-interactive" onClick={() => go(r.route)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', cursor: 'pointer', minHeight: 48,
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                <span className="md-state" />
                <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
                  <Icon name={r.icon} size={16} />
                </span>
                <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>{r.label}</span>
                <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
              </div>))}
          </MdCard>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 14, textAlign: 'center', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            삭제와 내보내기는 언제든 직접 시작할 수 있어요.
          </div>
        </React.Fragment>}
      </div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /profile 나 허브 ===================== */
const PH_KNOW = [
{ label: '북극성 열기', route: 'me' }, { label: 'Big Five', route: 'bigfive' },
{ label: '정밀검사 (IPIP-NEO)', route: 'ipip-neo' }, { label: '삶의 만족도', route: 'rlss' },
{ label: '애착 유형', route: 'attachment' }, { label: '지금 체크인', route: 'esm' },
{ label: '인터뷰', route: 'interview' }, { label: '과거의 나', route: 'audit' }];
const PH_ANALYZE = [
{ label: '인사이트', route: 'insights' }, { label: '밝기 변화', route: 'trend' },
{ label: '나의 변화', route: 'growth' }, { label: '보여지는 나', route: 'peer' },
{ label: '연결 찾기', route: 'research' }];

function ProfileHubScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useSt2('filled');
  const [tab, setTab] = useSt2('know');
  const prof = window.useProfile ? window.useProfile() : null;
  const name = state === 'empty' ? '게스트' : (prof && prof.name) || '아리아';
  const list = tab === 'know' ? PH_KNOW : PH_ANALYZE;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>
        {state === 'loading' ? <StateView state="loading" body="프로필을 불러오는 중이에요…" /> :
        state === 'error' ? <StateView state="error" title="프로필을 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" /> :
        <React.Fragment>
          {/* 표시명 + 설정 — 셸 앱바가 '나' 제목을 이미 그리므로 헤더를 다시 그리지 않는다 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 4px' }}>
            <SbHead size={40} expression="neutral" track />
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <MdButton variant="outlined" size="s" icon="settings" onClick={() => go('settings')}>설정</MdButton>
          </div>
          <MdCard variant="filled" style={{ padding: 14, marginTop: 10 }} onClick={() => go('plans')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="workspace_premium" size={20} style={{ color: 'var(--ds-nebula)', flex: '0 0 auto' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>현재 플랜</span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 2 }}>항해자</span>
              </span>
              <Icon name="chevron_right" size={18} style={{ color: C('on-surface-variant') }} />
            </div>
          </MdCard>
          <div style={{ display: 'flex', gap: 4, margin: '16px 0 10px' }}>
            {[['know', '나를 알아가기'], ['analyze', '분석']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="md-interactive"
              style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 36,
                background: tab === k ? C('primary') : C('surface-container-highest'),
                color: tab === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
                <span className="md-state" />{l}
              </button>))}
          </div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {list.map((r, i) => (
              <div key={r.route} className="md-interactive" onClick={() => go(r.route)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer', minHeight: 44,
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                <span className="md-state" />
                <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>{r.label}</span>
                <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
              </div>))}
          </MdCard>
        </React.Fragment>}
      </div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /subscription 구독 관리 ===================== */
function SubscriptionScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useSt2('filled');
  const [tier, setTier] = useSt2('항해자');
  const [autoRenew, setAutoRenew] = useSt2(true);
  const [modal, setModal] = useSt2(null);   // cancel | refund
  const [notice, setNotice] = useSt2(null);
  const free = state === 'empty' || tier === '별바라기';
  const eligible = true, daysLeft = 4, used = 3, allowance = 2, calls = 18;

  const doCancel = (now) => {
    setAutoRenew(false); setModal(null);
    setNotice(now ? '지금 바로 해지했어요. 유료 기능이 닫혔어요.' : '다음 갱신일 해지로 바꿨어요.');
  };
  const doRefund = () => { setModal(null); setNotice('환불 요청을 접수했어요. 승인 결과는 결제 영수증 메일로 안내돼요.'); };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" />;
    if (state === 'error') return <StateView state="error" title="구독 정보를 불러오지 못했어요." body="엔타이틀먼트는 그대로예요. 잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    return (
      <React.Fragment>
        <MdCard variant="filled" style={{ padding: 16, marginTop: 10 }}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>현재 플랜</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)' }}>{free ? '별바라기' : tier}</div>
          {free ?
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 8, wordBreak: 'keep-all' }}>지금은 무료 플랜이라 결제 중인 구독이 없어요.</div> :
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              {autoRenew ? '2026년 9월 3일에 자동 결제돼요' : '자동 결제가 꺼져 있어요. 2026년 9월 3일까지는 그대로 쓸 수 있어요.'}
            </div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 6 }}>최근 결제일: 2026년 8월 3일</div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>결제수단: Visa •••• 4242</div>
          </div>}
        </MdCard>

        {notice &&
        <div className="px-frame" style={{ padding: 12, marginTop: 10, background: C('surface-container-low') }}>
          <span style={{ fontSize: 12, color: 'var(--ok)', wordBreak: 'keep-all', textWrap: 'pretty' }}>{notice}</span>
        </div>}

        {!free &&
        <React.Fragment>
          <MdCard variant="filled" style={{ padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>구독 해지</div>
            {autoRenew ?
            <React.Fragment>
              <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
                구독은 해지할 때까지 자동으로 갱신되고 결제돼요. 해지하면 다음 결제가 멈추고, 이미 결제한 기간이 끝날 때까지는 유료 기능을 그대로 쓸 수 있어요.
              </div>
              <div style={{ marginTop: 12 }}><MdButton variant="outlined" full size="s" onClick={() => setModal('cancel')}>구독 해지하기</MdButton></div>
            </React.Fragment> :
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              이 구독은 이미 자동 결제가 꺼져 있어요. 더 청구되지 않고, 이미 결제한 기간이 끝날 때까지는 그대로 쓸 수 있어요.
            </div>}
          </MdCard>

          <MdCard variant="filled" style={{ padding: 16, marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>환불</div>
            <div className="md-body-medium" style={{ color: eligible ? 'var(--ok)' : C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              {eligible ? '지금은 전액 환불을 요청할 수 있어요.' :
              '결제 후 사용량이 같은 기간 무료 플랜에서 쓸 수 있는 양을 넘어서, 앱에서 바로 환불받을 수는 없어요.'}
            </div>
            {/* 자격 없음도 산수와 함께 — bare no 금지 */}
            <div style={{ marginTop: 10, padding: 10, background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)' }}>
              {[`환불 가능 기간: 7일 중 ${daysLeft}일 남음`, `리즈닝 사용: ${used}회 (같은 기간 무료 플랜 기준 ${allowance}회)`, `기록된 AI 호출: ${calls}건`].map((l) => (
                <div key={l} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 3 }}>{l}</div>))}
            </div>
            <div style={{ marginTop: 12 }}><MdButton variant="tonal" full size="s" disabled={!eligible} onClick={() => setModal('refund')}>환불 요청하기</MdButton></div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              도움이 필요하면 kim0405@hayangzip.com 로 알려 주세요. 영업일 기준 2일 이내에 답변해요.
            </div>
          </MdCard>
        </React.Fragment>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
          {[['refund', '환불 및 청약철회 정책 보기'], ['plans', '요금제 보기']].map(([r, l]) => (
            <div key={r} className="md-interactive" onClick={() => go(r)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer', minHeight: 44,
              background: C('surface-container'), boxShadow: 'var(--ds-edge)' }}>
              <span className="md-state" />
              <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>{l}</span>
              <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
            </div>))}
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState}
      extra={<button onClick={() => setTier((v) => v === '항해자' ? '별바라기' : '항해자')} className="md-interactive"
        style={{ position: 'relative', marginLeft: 'auto', border: 'none', cursor: 'pointer', padding: '4px 8px', minHeight: 26,
          background: C('surface-container-high'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)',
          fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}><span className="md-state" />{tier}</button>} />

      {modal &&
      <div onClick={() => setModal(null)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 22 }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 306, padding: 20, margin: 'var(--u)' }}>
          {modal === 'cancel' ?
          <React.Fragment>
            <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>구독을 해지할까요?</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              2026년 9월 3일 이후로는 자동 갱신되지 않아요. 그때까지는 유료 기능이 그대로예요.
            </div>
            <div className="md-body-small" style={{ color: 'var(--warn)', marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              지금 바로 해지로 바꾸면 유료 기능이 바로 닫혀요. 남은 기간은 자동으로 환불되지 않아요.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <MdButton variant="filled" full size="s" onClick={() => doCancel(false)}>해지하기</MdButton>
              <MdButton variant="outlined" full size="s" onClick={() => doCancel(true)}>지금 바로 해지로 바꾸기</MdButton>
              <MdButton variant="text" full size="s" onClick={() => setModal(null)}>그대로 두기</MdButton>
            </div>
          </React.Fragment> :
          <React.Fragment>
            <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>환불을 요청할까요?</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
              요청은 판매자인 Paddle에 접수돼요. 승인되면 원 결제수단으로 전액 환불되고 유료 기능은 닫혀요.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setModal(null)}>취소</MdButton></span>
              <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={doRefund}>환불 요청</MdButton></span>
            </div>
          </React.Fragment>}
        </div>
      </div>}
    </div>);
}

/* ===================== /theme 테마 · 글꼴 ===================== */
function ThemeScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useSt2('filled');
  const e = env || {};
  const dark = e.dark !== false;
  const [font, setFont] = useSt2('readable');
  const [lite, setLite] = useSt2(false);

  const Row = ({ on, label, sub, onClick, first }) => (
    <div className="md-interactive" onClick={onClick}
    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', cursor: 'pointer', minHeight: 48,
      background: on ? 'var(--c02)' : 'transparent', borderTop: first ? 'none' : `1px solid ${C('outline-variant')}` }}>
      <span className="md-state" />
      <span style={{ width: 16, height: 16, flex: '0 0 auto', boxShadow: `0 0 0 2px ${on ? 'var(--ds-core)' : C('outline-variant')}`,
        background: on ? 'var(--ds-core)' : 'transparent' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>{label}</span>
        {sub && <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{sub}</span>}
      </span>
    </div>);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>
        {state === 'loading' ? <StateView state="loading" /> :
        state === 'error' ? <StateView state="error" title="설정을 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" /> :
        <React.Fragment>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '10px 0 4px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            보기 편한 테마와 글꼴을 골라요.
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginBottom: 14, wordBreak: 'keep-all' }}>
            모션을 줄이면 화면이 더 차분해져요.
          </div>

          <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>테마</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            <Row first on={dark} label="딥스페이스" sub="다크 · 별하늘" onClick={() => e.setDark && e.setDark(true)} />
            <Row on={!dark} label="미드나잇" sub="라이트" onClick={() => e.setDark && e.setDark(false)} />
          </MdCard>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            미드나잇은 아직 일부 화면에만 적용돼요. 딥스페이스 화면 적용은 준비 중이에요.
          </div>

          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 6px' }}>글꼴</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            <Row first on={font === 'pixel'} label="픽셀 · Galmuri" sub="지금 화면의 글꼴" onClick={() => setFont('pixel')} />
            <Row on={font === 'readable'} label="읽기 편한 · Pretendard" onClick={() => setFont('readable')} />
          </MdCard>

          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 6px' }}>모션</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', minHeight: 48 }}>
              <Icon name="swipe" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
              <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>모션 줄이기</span>
              <MdSwitch checked={lite} onChange={setLite} />
            </div>
          </MdCard>
        </React.Fragment>}
      </div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /rlss 삶의 만족도 (RLSS 6문항) ===================== */
const RLSS_ITEMS = [
'나는 내 삶에 만족한다.',
'나는 지금까지 원하던 중요한 것들을 이뤄왔다.',
'내 삶의 조건은 훌륭하다.',
'다시 태어나도 지금과 거의 같은 삶을 살고 싶다.',
'대체로 내 삶은 내가 바라던 모습에 가깝다.',
'요즘 나는 삶에서 좋은 것들을 충분히 누리고 있다.'];
const RLSS_LIKERT = ['전혀 그렇지 않다', '', '', '보통', '', '', '매우 그렇다'];

function RlssScreen({ t, go, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useSt2('filled');
  const [intro, setIntro] = useSt2(true);
  const [resp, setResp] = useSt2({});
  const [quit, setQuit] = useSt2(false);
  const [saved, setSaved] = useSt2(false);
  const done = Object.keys(resp).length;
  const avg = done ? Object.values(resp).reduce((a, b) => a + b, 0) / done : 0;
  const band = avg >= 5.5 ? '높음' : avg >= 4 ? '보통' : avg >= 2.5 ? '낮음' : '매우 낮음';

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="검사를 불러오는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="저장하지 못했어요" body="답변은 그대로 남아 있으니 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (saved) return (
      <div style={{ display: 'grid', placeItems: 'center', padding: '44px 12px', textAlign: 'center' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={64} expression="positive" track={false} /></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 14 }}>저장됐어요 · 페르소나에서 다시 만나요</div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: 'var(--ds-core)', marginTop: 8 }}>삶의 만족도: {avg.toFixed(1)}/7 · {band}</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            지금 이 순간의 자기보고예요. 시간이 지나며 달라질 수 있어요.
          </div>
          <div style={{ marginTop: 16 }}><MdButton variant="filled" size="s" onClick={() => go('me')}>북극성으로</MdButton></div>
        </div>
      </div>);
    if (state === 'empty') return <StateView state="empty" title="아직 측정 전이에요" body="6문항이면 끝나요." cta={() => setIntro(true)} ctaLabel="시작" />;
    return (
      <React.Fragment>
        <div style={{ padding: '10px 0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ flex: 1 }}><ProgressLinear value={Math.round(done / RLSS_ITEMS.length * 100)} /></span>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{done} / 6</span>
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
            삶 전체를 떠올리며, 각 문장이 지금 당신과 얼마나 맞는지 골라주세요.
          </div>
        </div>
        {RLSS_ITEMS.map((it, i) => (
          <div key={i} style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), flex: '0 0 auto', paddingTop: 2 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 12, color: C('on-surface'), lineHeight: 1.5, wordBreak: 'keep-all' }}>{it}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((v) => {
                const on = resp[i] === v;
                return (
                  <button key={v} onClick={() => setResp((s) => ({ ...s, [i]: v }))} className="md-interactive"
                  style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 44,
                    background: on ? C('primary') : C('surface-container-highest'),
                    color: on ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)',
                    fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>
                    <span className="md-state" />{v}
                  </button>);
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>전혀 그렇지 않다</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant') }}>매우 그렇다</span>
            </div>
          </div>))}
        <div style={{ marginTop: 6 }}>
          <MdButton variant="filled" full disabled={done < RLSS_ITEMS.length} onClick={() => setSaved(true)}>결과 저장</MdButton>
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
      {intro && !saved &&
      <div onClick={() => setIntro(false)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 22 }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 306, padding: 20, margin: 'var(--u)' }}>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--ds-nebula)', marginBottom: 8 }}>삶의 만족도 · RLSS</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty', marginBottom: 16 }}>
            삶 전체에 대한 만족을 재는 검증된 6문항 자기보고예요. 각 문장에 1(전혀 그렇지 않다) ~ 7(매우 그렇다)로 답해 주세요. 정답은 없고, 지금 이 순간의 느낌이면 됩니다.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => { setIntro(false); onBack && onBack(); }}>취소</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => setIntro(false)}>시작</MdButton></span>
          </div>
        </div>
      </div>}
    </div>);
}

/* ===================== /peer/[token] 지인 응답 랜딩 (무계정) ===================== */
const PT_TRAITS = [
'사람들 속에서 힘을 얻고, 스스럼없이 말하는 편이에요.',
'정리정돈이 되어 있고, 시작한 일을 끝까지 해내요.',
'따뜻하고 배려심이 있어서 함께 지내기 편해요.'];

function PeerTokenScreen({ t, go, param }) {
  const C = window.SB.C;
  const [state, setState] = useSt2('filled');
  const [phase, setPhase] = useSt2('form');   // form | done | already | withdrawn | expired | invalid
  const [ratings, setRatings] = useSt2({});
  const [llm, setLlm] = useSt2(false);
  const [oversea, setOversea] = useSt2(false);
  const [minor, setMinor] = useSt2(false);
  const [guardian, setGuardian] = useSt2(false);
  const [err, setErr] = useSt2(null);

  const canSubmit = Object.keys(ratings).length === 3 && llm && oversea && (!minor || guardian);
  const submit = () => {
    if (state === 'error') { setErr('보내지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setErr(null); setPhase('done');
  };
  const withdraw = () => {
    if (state === 'error') { setErr('철회하지 못했어요. 답변은 아직 공유된 상태예요. 잠시 후 다시 시도해 주세요.'); return; }
    setErr(null); setPhase('withdrawn');
  };

  const Msg = ({ children }) => (
    <div className="px-frame" style={{ padding: 18, marginTop: 14, background: 'var(--panel)', textAlign: 'center' }}>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>{children}</div>
    </div>);

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="불러오는 중…" />;
    if (phase === 'invalid' || state === 'empty') return <Msg>유효하지 않은 링크예요.</Msg>;
    if (phase === 'expired') return <Msg>기한이 지난 링크예요.</Msg>;
    if (phase === 'withdrawn') return <Msg>응답이 철회됐어요. 합산 그림에 아무것도 남지 않아요.</Msg>;
    if (phase === 'already') return (
      <React.Fragment>
        <Msg>이미 응답을 보냈어요. 이 링크로 언제든 철회할 수 있어요.</Msg>
        {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10, textAlign: 'center' }}>{err}</div>}
        <div style={{ marginTop: 12 }}><MdButton variant="outlined" full size="s" onClick={withdraw}>내 응답 철회하기</MdButton></div>
      </React.Fragment>);
    if (phase === 'done') return (
      <React.Fragment>
        <div style={{ display: 'grid', placeItems: 'center', padding: '28px 12px 8px', textAlign: 'center' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={56} expression="positive" track={false} /></div>
            <div className="md-body-medium" style={{ color: C('on-surface'), marginTop: 14, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              고마워요. 답변은 세 명 이상 모였을 때 합산으로만 보이고, 개별로는 절대 보이지 않아요.
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
              응답을 철회하고 싶어질 때를 위해 이 링크를 보관해 두세요.
            </div>
          </div>
        </div>
        {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 6, textAlign: 'center' }}>{err}</div>}
        <div style={{ marginTop: 14 }}><MdButton variant="outlined" full size="s" onClick={withdraw}>내 응답 철회하기</MdButton></div>
      </React.Fragment>);
    return (
      <React.Fragment>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '4px 0 10px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          당신이 아는 어떤 사람이, 남들이 자신을 어떻게 경험하는지 그림을 만들고 있어요. 질문 세 개, 1분이면 돼요.
        </div>
        <div className="px-frame" style={{ padding: 12, background: 'var(--panel)', marginBottom: 14 }}>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty' }}>
            답변은 당신 자신의 데이터예요. 최소 두 명 이상의 다른 답과 합쳐서만 보이고, 하나씩은 절대 공개되지 않아요. 이 링크로 언제든 철회할 수 있어요.
          </div>
        </div>
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginBottom: 10 }}>
          1 = 전혀 그렇지 않다, 5 = 매우 그렇다
        </div>
        {PT_TRAITS.map((q, i) => (
          <div key={i} style={{ background: 'var(--panel)', boxShadow: 'var(--ds-edge)', padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.5, marginBottom: 10, wordBreak: 'keep-all' }}>{q}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((v) => {
                const on = ratings[i] === v;
                return (
                  <button key={v} onClick={() => setRatings((s) => ({ ...s, [i]: v }))} className="md-interactive"
                  style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 44,
                    background: on ? C('primary') : C('surface-container-highest'),
                    color: on ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)',
                    fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>
                    <span className="md-state" />{v}
                  </button>);
              })}
            </div>
          </div>))}
        <MdCard variant="filled" style={{ padding: 4, marginTop: 4 }}>
          {[[llm, setLlm, '합산 그림을 만들기 위해 내 답변이 AI 시스템으로 처리될 수 있음에 동의해요.'],
            [oversea, setOversea, '이 처리가 국외 서버에서 이뤄질 수 있음에 동의해요.'],
            [minor, setMinor, '저는 만 18세 미만이에요.']].map(([v, set, l], i) => (
            <div key={i} className="md-interactive" onClick={() => set(!v)}
            style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px', cursor: 'pointer',
              borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span className="md-state" />
              <span style={{ pointerEvents: 'none', display: 'inline-flex', marginTop: 1 }}><MdCheckbox checked={v} onChange={() => {}} /></span>
              <span style={{ flex: 1, fontSize: 12, color: C('on-surface'), lineHeight: 1.5, wordBreak: 'keep-all' }}>{l}</span>
            </div>))}
          {minor &&
          <div className="md-interactive" onClick={() => setGuardian(!guardian)}
          style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px 11px 34px', cursor: 'pointer',
            borderTop: `1px solid ${C('outline-variant')}`, background: 'var(--c02)' }}>
            <span className="md-state" />
            <span style={{ pointerEvents: 'none', display: 'inline-flex', marginTop: 1 }}><MdCheckbox checked={guardian} onChange={() => {}} /></span>
            <span style={{ flex: 1, fontSize: 12, color: C('on-surface'), lineHeight: 1.5, wordBreak: 'keep-all' }}>보호자가 함께 있고, 이에 동의했어요.</span>
          </div>}
        </MdCard>
        {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10 }}>{err}</div>}
        <div style={{ marginTop: 14 }}><MdButton variant="filled" full disabled={!canSubmit} onClick={submit}>답변 보내기</MdButton></div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 22px 12px' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={48} expression="neutral" track /></div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)', marginTop: 12 }}>남이 보는 나</div>
        </div>
        {body()}
      </div>
      <StateRow value={state} onChange={setState}
      extra={<span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
        {[['form', '폼'], ['already', '기응답'], ['expired', '만료'], ['invalid', '무효']].map(([k, l]) => (
          <button key={k} onClick={() => setPhase(k)} className="md-interactive"
          style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '4px 7px', minHeight: 26,
            background: phase === k ? 'var(--ds-nebula-deep)' : C('surface-container-high'),
            color: phase === k ? 'var(--ds-nebula-soft)' : C('on-surface-variant'),
            boxShadow: 'var(--ds-edge)', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10 }}>
            <span className="md-state" />{l}
          </button>))}
      </span>} />
    </div>);
}

Object.assign(window, { AccountScreen, ProfileHubScreen, SubscriptionScreen, ThemeScreen, RlssScreen, PeerTokenScreen });
