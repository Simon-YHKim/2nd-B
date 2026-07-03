/* ===================== 건강 별 · 채워 넣기 (정성 입력) =====================
   첨부 스펙(2ndbrain_qualitative_capture.html)의 '마찰 사다리' 중 건강에 직접
   닿는 두 단계를 입력 화면으로 구현한다.
   ① 데일리 체크인 — 초저마찰(10초): 기분 1탭 · 에너지 · 오늘을 만든 것 · 한 줄/음성
   ② 데이터가 던지는 질문 — 정량 이상치(HRV↓)가 먼저 물어 빈 화면을 없앤다
   + 정해진 형식 기록(식단·운동·수면) 바로가기
*/
(function () {
  if (!document.getElementById('sb-hi-style')) {
    const s = document.createElement('style');
    s.id = 'sb-hi-style';
    s.textContent = '@keyframes sb-eq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}';
    document.head.appendChild(s);
  }
})();

function HiLabel({ icon, children, hint, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
      {icon && <Icon name={icon} size={16} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />}
      <span className="md-label-large" style={{ color: C('on-surface'), whiteSpace: 'nowrap' }}>{children}</span>
      {hint && <span className="md-label-small" style={{ color: C('on-surface-variant'), opacity: .8, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{hint}</span>}
    </div>
  );
}

/* 한 줄/음성 입력 — 녹음 시 마이크가 활성색으로 펄스 + 파형 */
function VoiceField({ value, onChange, rec, setRec, placeholder, C }) {
  return (
    <div style={{ border: `1px solid ${rec ? C('error') : C('outline-variant')}`, borderRadius: 14, background: C('surface-container-highest'), padding: 12, transition: 'border-color .2s' }}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', color: C('on-surface'),
          fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, lineHeight: 1.5, outline: 'none', padding: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button onClick={() => setRec(!rec)} className="md-interactive" aria-label={rec ? '녹음 멈추기' : '음성으로 받아 적기'}
          style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', flex: '0 0 auto',
            background: rec ? C('error') : C('tertiary'), color: rec ? C('on-error') : C('on-tertiary'),
            boxShadow: rec ? '0 0 0 7px rgba(255,80,80,.16)' : 'none', transition: 'all .2s' }}>
          <span className="md-state" />
          <Icon name={rec ? 'pause' : 'mic'} fill size={20} style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
        </button>
        {rec ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 22 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span key={i} style={{ width: 3, height: 18, borderRadius: 3, background: C('error'),
                  transformOrigin: 'center', animation: `sb-eq ${0.7 + (i % 3) * 0.18}s ease-in-out ${i * 0.07}s infinite` }} />
              ))}
            </div>
            <span className="md-label-medium" style={{ color: C('error') }}>듣고 있어요…</span>
          </div>
        ) : (
          <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>탭하고 말하면 자동으로 받아 적어요</span>
        )}
      </div>
    </div>
  );
}

function HealthInputScreen({ t, go, param }) {
  const C = window.SB.C;
  const HEAD = 'assets/deepspace/secondb-head-front.png';

  const [mood, setMood] = React.useState(2);    // 0..4
  const [energy, setEnergy] = React.useState(0); // 0..5 (0=미선택)
  const [ctx, setCtx] = React.useState([]);
  const [memo, setMemo] = React.useState('');
  const [memoRec, setMemoRec] = React.useState(false);
  const [cause, setCause] = React.useState([]);
  const [why, setWhy] = React.useState('');
  const [whyRec, setWhyRec] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const MOODS = [
    { ic: 'sentiment_very_dissatisfied', l: '많이 지침' },
    { ic: 'sentiment_dissatisfied', l: '지침' },
    { ic: 'sentiment_neutral', l: '보통' },
    { ic: 'sentiment_satisfied', l: '좋음' },
    { ic: 'sentiment_very_satisfied', l: '아주 좋음' },
  ];
  const CTX = ['수면', '운동', '영양', '스트레스', '통증', '휴식', '카페인', '음주'];
  const CAUSES = ['업무 스트레스', '늦은 취침', '갈등', '음주', '카페인', '과로', '컨디션 난조'];
  const SHORTCUTS = [
    { id: 'meal', icon: 'restaurant', label: '식단' },
    { id: 'workout', icon: 'fitness_center', label: '운동' },
    { id: 'sleep', icon: 'bedtime', label: '수면' },
  ];
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const healthStar = (window.SB.STARS || []).find((s) => s.id === 'health');

  /* success */
  if (done) {
    return (
      <ScreenPad>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 420, gap: 18, textAlign: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C('tertiary-container'), color: C('on-tertiary-container') }}>
            <Icon name="check" size={42} stroke={2.4} />
          </div>
          <div className="md-headline-small" style={{ color: C('on-surface') }}>건강 별에 담았어요</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', maxWidth: 280 }}>
            오늘의 컨디션을 <b>건강</b> 별로 엮는 중이에요. 정량 신호(수면·HRV)와 합쳐 다음 질문이 더 똑똑해져요.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <MdButton variant="tonal" icon="add" onClick={() => { setDone(false); setMemo(''); setWhy(''); setCtx([]); setCause([]); setEnergy(0); }}>또 기록</MdButton>
            <MdButton variant="filled" icon="auto_awesome" onClick={() => { if (healthStar) go('star', healthStar); else go('records'); }}>건강 별 보기</MdButton>
          </div>
        </div>
      </ScreenPad>
    );
  }

  /* form */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 14px' }}>
        {/* 세컨비 안내 */}
        <MdCard variant="filled" style={{ background: C('tertiary-container'), padding: 14, margin: '4px 0 18px' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <img src={HEAD} alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
            <div className="md-body-medium" style={{ color: C('on-tertiary-container'), wordBreak: 'keep-all' }}>
              오늘 컨디션, 10초면 충분해요. 기분·에너지만 톡 찍어도 건강 별이 밝아져요.
            </div>
          </div>
        </MdCard>

        {/* ── ① 데일리 체크인 ── */}
        <div className="md-title-medium" style={{ color: C('on-surface'), marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ whiteSpace: 'nowrap' }}>데일리 체크인</span>
          <span className="md-label-small" style={{ whiteSpace: 'nowrap', color: C('on-tertiary-container'), background: C('tertiary-container'), padding: '2px 8px', borderRadius: 999 }}>초저마찰 · 10초</span>
        </div>

        <HiLabel C={C} icon="sentiment_satisfied">오늘 기분</HiLabel>
        <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
          {MOODS.map((m, i) => (
            <button key={m.ic} onClick={() => setMood(i)} className="md-interactive" aria-pressed={mood === i} title={m.l}
              style={{ position: 'relative', flex: 1, border: `1px solid ${mood === i ? C('tertiary') : C('outline-variant')}`, borderRadius: 13,
                background: mood === i ? C('tertiary-container') : C('surface-container'), cursor: 'pointer', padding: '10px 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .15s' }}>
              <span className="md-state" />
              <Icon name={m.ic} size={26} style={{ color: mood === i ? C('on-tertiary-container') : C('on-surface-variant') }} />
            </button>
          ))}
        </div>

        <HiLabel C={C} icon="bolt">에너지</HiLabel>
        <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setEnergy(n)} className="md-interactive" aria-label={`에너지 ${n}`}
              style={{ position: 'relative', flex: 1, height: 34, borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${n <= energy ? C('tertiary') : C('outline-variant')}`,
                background: n <= energy ? C('tertiary') : C('surface-container'), transition: 'all .15s' }}>
              <span className="md-state" />
            </button>
          ))}
        </div>

        <HiLabel C={C} icon="label" hint="복수 선택">오늘을 만든 것</HiLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CTX.map((o) => (
            <MdChip key={o} variant="filter" selected={ctx.includes(o)} onClick={() => toggle(ctx, setCtx, o)}>{o}</MdChip>
          ))}
        </div>

        <HiLabel C={C} icon="edit_note">한 줄 메모</HiLabel>
        <VoiceField C={C} value={memo} onChange={setMemo} rec={memoRec} setRec={setMemoRec}
          placeholder="오늘 몸과 마음을 한 줄로… (선택)" />

        {/* ── ② 데이터가 던지는 질문 ── */}
        <div style={{ height: 1, background: C('outline-variant'), margin: '26px 0 22px' }} />
        <div className="md-title-medium" style={{ color: C('on-surface'), marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ whiteSpace: 'nowrap' }}>데이터가 던지는 질문</span>
          <span className="md-label-small" style={{ whiteSpace: 'nowrap', color: C('on-surface-variant') }}>빈 화면 없이</span>
        </div>

        <MdCard variant="outlined" style={{ padding: 14, borderLeft: `3px solid ${C('tertiary')}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon name="cardiology" size={16} style={{ color: C('tertiary') }} />
            <span className="md-label-medium" style={{ color: C('tertiary'), fontWeight: 700 }}>HRV ↓ 18% · 데이터가 물어요</span>
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>
            어제 HRV가 평소보다 낮았고 수면도 6h 40m로 짧았어요. 무슨 일이 있었나요?
          </div>
        </MdCard>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {CAUSES.map((o) => (
            <MdChip key={o} variant="filter" selected={cause.includes(o)} onClick={() => toggle(cause, setCause, o)}>{o}</MdChip>
          ))}
        </div>
        <VoiceField C={C} value={why} onChange={setWhy} rec={whyRec} setRec={setWhyRec}
          placeholder="떠오르는 맥락을 적거나 말해요… (선택)" />

        {/* ── 정해진 형식으로 기록 ── */}
        <div style={{ height: 1, background: C('outline-variant'), margin: '26px 0 16px' }} />
        <HiLabel C={C} icon="checklist">정해진 형식으로 기록</HiLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {SHORTCUTS.map((s) => (
            <MdCard key={s.id} variant="outlined" onClick={() => go('lifeinput', { tplId: s.id })}
              style={{ padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: C('tertiary-container'), color: C('on-tertiary-container') }}>
                <Icon name={s.icon} size={22} />
              </div>
              <span className="md-label-large" style={{ color: C('on-surface') }}>{s.label}</span>
            </MdCard>
          ))}
        </div>
      </div>

      {/* submit bar */}
      <div style={{ padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" icon="check" style={{ width: '100%' }} onClick={() => setDone(true)}>오늘 기록 담기</MdButton>
      </div>
    </div>
  );
}

window.HealthInputScreen = HealthInputScreen;
