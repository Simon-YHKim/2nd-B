/* ============================================================
   2nd-Brain · 개인 비서(Ops) 축 + 시스템 표면
   - OpsScreen      : 오늘의 비서(추천 홈) — 루틴·연속일·도메인·추천 카드
   - PushSheet      : "내 앱으로 보내기" 바텀시트(캘린더·.ics·체크리스트 + ops_push 동의)
   - MdBottomSheet  : 공용 M3 모달 시트 (scrim + rise)
   - AnalysisDock   : 비차단 분석 진행 도크 (불변식 #6)
   - Toast          : 완료 스낵바
   - FirstInsight   : 첫날 통찰 TTFV (북극성 + 별 점등 + 비준 → L1→L2)
   Export → window
   ============================================================ */
const { useState: useO, useRef: useOR, useEffect: useOE } = React;

/* ============ 공용 바텀시트 ============ */
function MdBottomSheet({ open, onClose, children }) {
  const C = window.SB.C;
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', background: C('surface-container-low'), borderRadius: '28px 28px 0 0',
        padding: '12px 20px 22px', maxHeight: '84%', overflowY: 'auto',
        boxShadow: '0 -10px 34px rgba(0,0,0,.45)' }}>
        <div style={{ width: 32, height: 4, borderRadius: 2, background: C('outline'), margin: '0 auto 16px' }} />
        {children}
      </div>
    </div>);

}

/* ============ 비차단 분석 도크 (불변식 #6) ============ */
function AnalysisDock({ job }) {
  const C = window.SB.C;
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 90, zIndex: 22,
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16,
      background: C('inverse-surface'), color: C('inverse-on-surface'),
      boxShadow: '0 8px 28px rgba(0,0,0,.4)' }}>
      <div style={{ position: 'relative', width: 26, height: 26, flex: '0 0 auto' }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2.5px solid ${C('inverse-primary')}`,
          borderTopColor: 'transparent', animation: 'sb-spin .8s linear infinite' }} />
        <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ position: 'absolute', inset: 4, width: 18, height: 18 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="md-body-medium" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.label}</div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.18)', overflow: 'hidden', marginTop: 6 }}>
          <div style={{ width: `${Math.round(job.pct)}%`, height: '100%', borderRadius: 2,
            background: C('inverse-primary'), transition: 'width .3s linear' }} />
        </div>
      </div>
      <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, opacity: .85 }}>{Math.round(job.pct)}%</span>
    </div>);

}

/* ============ 완료 토스트 ============ */
function Toast({ toast, onAction, onClose }) {
  const C = window.SB.C;
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 90, zIndex: 24,
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14,
      background: C('inverse-surface'), color: C('inverse-on-surface'),
      boxShadow: '0 8px 28px rgba(0,0,0,.4)' }}>
      <Icon name="check_circle" fill size={20} style={{ color: C('inverse-primary'), flex: '0 0 auto' }} />
      <span className="md-body-medium" style={{ flex: 1, wordBreak: 'keep-all' }}>{toast.msg}</span>
      {toast.action &&
      <button className="md-interactive" onClick={onAction}
      style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer',
        color: C('inverse-primary'), fontWeight: 700, fontSize: 14, padding: '4px 6px', whiteSpace: 'nowrap' }}>
          <span className="md-state" />{toast.action}
        </button>
      }
    </div>);

}

/* ============ 푸시 바텀시트 ============ */
function PushSheet({ rec, env, onClose }) {
  const C = window.SB.C;
  const [target, setTarget] = useO('cal');
  const targets = window.SB_DATA.ops.pushTargets; // → data/screens/ops.json

  const sentMsg = window.SB_DATA.ops.sentMessages; // → data/screens/ops.json
  const send = () => {onClose();env.showToast({ msg: sentMsg[target], action: '실행 취소' });};

  return (
    <div>
      <div className="md-headline-small" style={{ color: C('on-surface') }}>내 앱으로 보내기</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 4, marginBottom: 16, wordBreak: 'keep-all' }}>{rec.title}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {targets.map((tg) => {
          const on = target === tg.id;
          return (
            <button key={tg.id} onClick={() => setTarget(tg.id)} className="md-interactive"
            style={{ position: 'relative', textAlign: 'left', padding: 12, borderRadius: 14, cursor: 'pointer',
              border: `1.5px solid ${on ? C('primary') : C('outline-variant')}`,
              background: on ? C('secondary-container') : C('surface-container'), transition: 'all .18s' }}>
              <span className="md-state" />
              <Icon name={tg.icon} size={20} style={{ color: on ? C('on-secondary-container') : C('on-surface-variant') }} />
              <div className="md-title-small" style={{ color: on ? C('on-secondary-container') : C('on-surface'), marginTop: 8 }}>{tg.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2, wordBreak: 'keep-all' }}>{tg.note}</div>
            </button>);

        })}
      </div>

      {/* time row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, padding: '12px 14px',
        borderRadius: 14, background: C('surface-container-highest') }}>
        <Icon name="schedule" size={20} style={{ color: C('on-surface-variant') }} />
        <div style={{ flex: 1 }}>
          <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{target === 'check' ? '마감' : '시작'}</div>
          <div className="md-body-large" style={{ color: C('on-surface') }}>오늘 저녁 8:00</div>
        </div>
        <MdButton variant="text" size="s">변경</MdButton>
      </div>

      {/* ops_push consent */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, padding: '11px 13px', borderRadius: 12,
        background: C('tertiary-container'), color: C('on-tertiary-container') }}>
        <Icon name="lock" size={17} style={{ flex: '0 0 auto', marginTop: 1 }} />
        <span className="md-body-small" style={{ wordBreak: 'keep-all' }}>
          ‘개인 비서’ 권한으로 일정·리마인더를 추가해요. 기록 내용은 보내지 않고, 언제든 설정에서 끌 수 있어요.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="text" style={{ flex: 1 }} onClick={onClose}>취소</MdButton>
        <MdButton variant="filled" icon="send" style={{ flex: 2 }} onClick={send}>보내기</MdButton>
      </div>
    </div>);

}

/* ============ 오늘의 비서 (추천 홈) ============ */
/* 여러 카드로 쪼개지 않고, 데이터를 모아 하나의 「종합 의견」으로 조언한다.
   각 의견은 여러 별을 가로지르는 근본 하나를 짚고, 앱에서 바로 실행할 수 있는 기능으로 연결한다. */
const OPS_ADVICE = window.SB_DATA.ops.advice; // → data/screens/ops.json


function OpsScreen({ t, go, env }) {
  const C = window.SB.C;
  const [ai, setAi] = useO(0);
  const [routines, setRoutines] = useO(() => window.SB_DATA.ops.routines.map((r) => ({ ...r }))); // → data/screens/ops.json (clone: fresh per mount, state mutates)
  const toggle = (id) => setRoutines((rs) => rs.map((r) => r.id === id ? { ...r, done: !r.done } : r));
  const doneN = routines.filter((r) => r.done).length;
  const pct = Math.round(doneN / routines.length * 100);
  const adv = OPS_ADVICE[ai % OPS_ADVICE.length];

  const R = 22,CIRC = 2 * Math.PI * R;
  const runAction = (a) => {
    if (a.route) { go(a.route); return; }
    if (a.reminder) go('reminders', { prefill: { ...a.reminder, src: '세컨비 종합 의견' } });
  };

  return (
    <ScreenPad>
      {/* hero — 오늘 */}
      <MdCard variant="elevated" style={{ padding: 16, marginTop: 4,
        background: 'linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-surface-container-low))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="58" height="58" viewBox="0 0 58 58" style={{ flex: '0 0 auto', transform: 'rotate(-90deg)' }}>
            <circle cx="29" cy="29" r={R} fill="none" stroke={C('surface-variant')} strokeWidth="6" />
            <circle cx="29" cy="29" r={R} fill="none" stroke={C('primary')} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - doneN / routines.length)}
            style={{ transition: 'stroke-dashoffset .5s var(--md-sys-motion-easing-emphasized)' }} />
          </svg>
          <div style={{ flex: 1 }}>
            <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>오늘의 루틴</div>
            <div className="md-headline-small" style={{ color: C('on-surface') }}>{doneN} / {routines.length} 완료</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#FF8A5B' }}>
              <Icon name="local_fire_department" fill size={22} />
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 22, fontWeight: 800 }}>{window.SB_DATA.ops.streak}</span>{/* → data/screens/ops.json */}
            </div>
            <div className="md-label-small" style={{ color: C('on-surface-variant') }}>일 연속</div>
          </div>
        </div>
        <ProgressLinear value={pct} color={C('primary')} height={4} />
      </MdCard>

      {/* routines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {routines.map((r) =>
        <button key={r.id} onClick={() => toggle(r.id)} className="md-interactive"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          padding: '12px 14px', borderRadius: 12, cursor: 'pointer', border: 'none',
          background: C('surface-container-highest') }}>
            <span className="md-state" />
            <Icon name={r.done ? 'check_circle' : 'radio_button_unchecked'} fill={r.done} size={22}
          style={{ color: r.done ? C('primary') : C('outline'), flex: '0 0 auto' }} />
            <span className="md-body-large" style={{ flex: 1, color: r.done ? C('on-surface-variant') : C('on-surface'),
            textDecoration: r.done ? 'line-through' : 'none' }}>{r.label}</span>
            <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{r.star}</span>
          </button>
        )}
      </div>

      {/* weekly analysis trigger — demonstrates non-blocking dock */}
      <MdCard variant="filled" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="auto_awesome" size={20} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-body-large" style={{ color: C('on-surface') }}>이번 주 패턴 분석</div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>분석은 백그라운드로 돌아요. 계속 써도 돼요.</div>
          </div>
          <MdButton variant="tonal" size="s" icon="trending_up"
          onClick={() => env.startJob('이번 주 패턴을 분석하는 중', { doneMsg: '이번 주 분석이 끝났어요', action: '변화 보기', goTo: 'trend' })}>돌리기</MdButton>
        </div>
      </MdCard>

      {/* 오늘의 종합 의견 — 하나로 합쳐진 조언 + 실행 버튼 */}
      <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.14em',
        color: C('primary'), margin: '22px 2px 8px' }}>오늘의 종합 의견</div>
      <MdCard variant="elevated" style={{ padding: 16,
        background: 'linear-gradient(160deg, var(--md-sys-color-surface-container-high), var(--md-sys-color-surface-container-low))' }}>
        {/* 세컨비 + 핵심 제안 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img src="assets/deepspace/secondb-head-front.png" alt="세컨비" style={{ width: 46, height: 46, flex: '0 0 auto', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.35))' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{adv.star} 별 · 오늘 가장 중요한 한 가지</span>
            <div className="md-title-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all', lineHeight: 1.45, marginTop: 2 }}>{adv.headline}</div>
          </div>
        </div>

        {/* 종합 읽기 */}
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', lineHeight: 1.6, marginTop: 12 }}>{adv.read}</div>
        <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all', lineHeight: 1.6, marginTop: 8 }}>{adv.detail}</div>

        {/* 근거 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          <Icon name="auto_awesome" size={13} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
          <span className="md-label-small" style={{ color: C('on-surface-variant'), marginRight: 2 }}>근거</span>
          {adv.evidence.map((e) =>
          <span key={e} className="md-label-small" style={{ padding: '3px 9px', borderRadius: 9999, whiteSpace: 'nowrap',
            background: C('surface-container-highest'), color: C('on-surface-variant') }}>{e}</span>
          )}
        </div>

        {/* 실행 버튼 — 앱의 실행 가능한 기능으로 연결 */}
        <MdButton variant="filled" icon={adv.action.icon} full style={{ marginTop: 16 }} onClick={() => runAction(adv.action)}>{adv.action.label}</MdButton>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <MdButton variant="text" size="s" icon="refresh" onClick={() => setAi((i) => i + 1)}>다른 관점으로</MdButton>
        </div>
      </MdCard>

      {/* 비서 도구 — 맨 아래 */}
      <SectionLabel>비서 도구</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {window.SB_DATA.ops.tools. /* → data/screens/ops.json */
        map((tool) =>
        <MdCard key={tool.route} variant="filled" onClick={() => go(tool.route)} style={{ padding: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name={tool.icon} size={20} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-title-small" style={{ color: C('on-surface') }}>{tool.label}</div>
                <div className="md-label-small" style={{ color: C('on-surface-variant') }}>{tool.sub}</div>
              </div>
            </div>
          </MdCard>
        )}
      </div>
    </ScreenPad>);

}

/* ============ 첫날 통찰 (TTFV) ============ */
function FirstInsight({ onDone }) {
  const C = window.SB.C;
  const [step, setStep] = useO('intro'); // intro → ratify → grown
  const [showWhy, setWhy] = useO(false);
  const ratify = () => setStep('grown');
  const grown = step === 'grown';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '46px 28px 32px', textAlign: 'center' }}>
      <window.NeuralBg focusY={0.46} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.2em', color: '#7FD0FF', marginBottom: 6 }}>FIRST LIGHT · 첫 빛</div>
      <div className="md-title-medium" style={{ color: '#EAF2FF', marginBottom: 18 }}>당신의 첫 별이 켜졌어요</div>

      {/* 북극성 — 이 화면의 유일한 별 (다른 별·연결선 삭제) */}
      <div style={{ position: 'relative', width: 220, height: 92, marginBottom: 8, display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ display: 'block', width: 15, height: 15, borderRadius: '50%', background: '#EAF2FF',
            boxShadow: '0 0 18px 5px rgba(207,189,255,.85)', animation: 'sb-pulse 2.4s ease-in-out infinite' }} />
          <span style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
            fontSize: 11, color: '#CFE6FF', fontFamily: 'var(--md-ref-typeface-mono)', letterSpacing: '.06em' }}>북극성</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {step !== 'grown' ?
      <React.Fragment>
          <div style={{ marginBottom: 8, animation: 'sb-bob 4s ease-in-out infinite' }}>
            <window.SecondBHead expression="positive" />
          </div>
          <div className="md-title-medium" style={{ color: '#EAF2FF', maxWidth: 280, wordBreak: 'keep-all', lineHeight: 1.5 }}>
            당신은 <span style={{ color: '#82D8F6' }}>‘먼저 다가가는’</span> 사람일지도 몰라요.
          </div>
          <div className="md-body-medium" style={{ color: 'rgba(220,230,255,.7)', marginTop: 8, maxWidth: 260, wordBreak: 'keep-all' }}>
            가입 답변에서 관계 별의 첫 신호를 봤어요. 맞나요?
          </div>

          {/* 근거 — 무엇을 보고 이렇게 말했는지 */}
          <div style={{ width: '100%', maxWidth: 320, marginTop: 16 }}>
            <button onClick={() => setWhy((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto', background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(190,225,255,.8)', fontSize: 13, fontWeight: 600 }}>
              <Icon name="target" size={15} />이렇게 본 근거 2가지
              <Icon name={showWhy ? 'expand_less' : 'expand_more'} size={16} />
            </button>
            {showWhy &&
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
                {window.SB_DATA.ops.firstInsightEvidence. /* → data/screens/ops.json */
            map((e, i) =>
            <div key={i} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(127,182,255,.1)', border: '1px solid rgba(127,182,255,.2)' }}>
                    <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.04em', color: '#7FB6FF', marginBottom: 3 }}>{e.q}</div>
                    <div className="md-body-small" style={{ color: '#DCE8FF', wordBreak: 'keep-all' }}>{e.a}</div>
                  </div>
            )}
                <div className="md-label-small" style={{ color: 'rgba(190,225,255,.78)', textAlign: 'center', marginTop: 2, wordBreak: 'keep-all' }}>
                  아직 가입 답변뿐이라 ‘첫 신호’예요. 담을수록 근거가 늘어요.
                </div>
              </div>
          }
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, width: '100%', maxWidth: 320 }}>
            <MdButton variant="filled" icon="check" style={{ flex: 1 }} onClick={ratify}>맞아요</MdButton>
            <MdButton variant="outlined" style={{ flex: 1, color: '#CFE6FF', borderColor: 'rgba(180,200,255,.4)' }} onClick={ratify}>조금 달라요</MdButton>
          </div>
          <div className="md-body-small" style={{ color: 'rgba(200,210,240,.75)', marginTop: 14, wordBreak: 'keep-all' }}>
            어떤 답이든, 별은 당신의 동의로만 밝아져요.
          </div>
        </React.Fragment> :

      <React.Fragment>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 9999,
          background: 'rgba(130,216,246,.16)', color: '#BFE9FF', marginBottom: 14 }}>
            <Icon name="trending_up" size={16} /><span style={{ fontWeight: 700, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13 }}>관계 · L1 → L2</span>
          </div>
          <div className="md-title-medium" style={{ color: '#EAF2FF', maxWidth: 280, wordBreak: 'keep-all', lineHeight: 1.5 }}>
            관계 별이 한 단계 밝아졌어요.
          </div>
          <div className="md-body-medium" style={{ color: 'rgba(220,230,255,.7)', marginTop: 8, maxWidth: 280, wordBreak: 'keep-all' }}>
            담을수록 별이 또렷해지고, 7개가 모이면 북극성이 켜져요.
          </div>
          <MdButton variant="filled" icon="star_shine" full style={{ marginTop: 24, maxWidth: 320 }} onClick={onDone}>별자리로 들어가기</MdButton>
        </React.Fragment>
      }
      </div>
    </div>);

}

Object.assign(window, { MdBottomSheet, AnalysisDock, Toast, PushSheet, OpsScreen, FirstInsight });