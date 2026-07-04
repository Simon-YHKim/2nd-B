/* ============================================================
   2nd-Brain · Flows & onboarding
   Onboarding(로그인) · Coachmark(첫 이용 가이드) · CallRecScreen(통화녹음)
   · AttachmentScreen(애착 ECR) · NorthStarEditor(북극성 문장) · InboxScreen(알림)
   Export: window.{OnboardingScreen, Coachmark, CallRecScreen,
           AttachmentScreen, NorthStarEditor, InboxScreen}
   ============================================================ */
const { useState: useFS, useEffect: useFE, useRef: useFR } = React;

/* ===================== ONBOARDING · 로그인 ===================== */
function OnboardingScreen({ onDone }) {
  const C = window.SB.C;
  const [step, setStep] = useFS(0);
  const slides = [
    { tag: '2ND-BRAIN', title: '나를 알아가는 AI', icon: 'bubble_chart',
      body: '세컨비는 당신을 구성하는\n별가루들이 궁금해요.\n당신의 별가루를 보여주고,\n어떤사람인지 알려주세요!' },
    { tag: '알아가기', title: '흩어진 일상이\n별자리가 돼요', icon: 'star_shine',
      body: '커리어·재정·관계·건강·성장·휴식. 일곱 영역의 별로 지금의 나를 한눈에 봐요.' },
    { tag: '곁에서 돕기', title: '아는 만큼\n도와줘요', icon: 'lightbulb',
      body: '당신을 알게 된 만큼 비서가 돼요. 돈 쓰는 결, 쉬는 법, 하루 계획까지 당신에게 맞는 조언을 건네요.' },
    { tag: '함께 배우기', title: 'AI의 원리도\n같이 배워요', icon: 'school',
      body: '세컨비가 어떻게 당신을 이해하는지, AI 뮤지엄에서 그 원리를 쉽고 재미있게 풀어줘요.' },
  ];
  const last = step === slides.length;

  if (last) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(120% 80% at 50% 12%, #173659, #070A13 72%), #070A13', padding: '0 24px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center' }}>
          <div style={{ animation: 'sb-bob 4s ease-in-out infinite' }}>
            <img src="assets/deepspace/secondb-head-front.png" alt="세컨비" style={{ width: 168, height: 168, filter: 'drop-shadow(0 10px 26px rgba(70,90,200,.5))' }} />
          </div>
          <div className="md-headline-small" style={{ color: '#EAF2FF', marginTop: 8 }}>시작할까요?</div>
          <div className="md-body-medium" style={{ color: 'rgba(214,230,255,.7)', maxWidth: 250, wordBreak: 'keep-all' }}>로그인하면 어느 기기에서나 당신의 별자리를 이어서 볼 수 있어요.</div>
        </div>
        <div style={{ paddingBottom: 22 }}>
          <window.AuthProviders onPick={onDone} />
        </div>
      </div>
    );
  }

  const s = slides[step];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(120% 80% at 50% 16%, #173659, #070A13 74%), #070A13', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20 }}>
        <button onClick={() => setStep(slides.length)} style={{ background: 'none', border: 'none', color: 'rgba(159,228,255,.7)', fontSize: 14, cursor: 'pointer' }}>건너뛰기</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 28, display: 'grid', placeItems: 'center',
          background: 'rgba(70,182,255,.14)', border: '1px solid rgba(70,182,255,.3)' }}>
          <Icon name={s.icon} size={44} style={{ color: '#7FD0FF' }} />
        </div>
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.2em', color: '#7FB6FF' }}>{s.tag}</div>
        <div className="md-headline-medium" style={{ color: '#EAF2FF', whiteSpace: 'pre-line', lineHeight: 1.22 }}>{s.title}</div>
        <div className="md-body-large" style={{ color: 'rgba(214,230,255,.72)', maxWidth: 270, wordBreak: 'keep-all', whiteSpace: 'pre-line' }}>{s.body}</div>
      </div>
      <div style={{ paddingBottom: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, display: 'flex', gap: 7 }}>
          {slides.map((_, i) => (
            <span key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 9999,
              background: i === step ? '#46B6FF' : 'rgba(255,255,255,.45)', transition: 'all .3s' }} />
          ))}
        </div>
        <MdButton variant="filled" trailingIcon="arrow_forward" onClick={() => setStep(step + 1)}>다음</MdButton>
      </div>
    </div>
  );
}

/* ===================== COACHMARK · 첫 이용 가이드 ===================== */
function Coachmark({ onDone }) {
  const C = window.SB.C;
  const [i, setI] = useFS(0);
  const steps = [
    { title: '여기는 당신의 별자리예요', body: '일곱 개 별은 삶의 영역(커리어·재정·관계…)이에요. 밝을수록 더 많이 담긴 거예요.', ring: { top: '24%', left: '50%', w: 262, h: 210 }, arrow: 'up' },
    { title: '별을 눌러보세요', body: '세컨비가 그 별을 소개하고, 여행할지 물어봐요. 누른다고 바로 들어가진 않아요.', ring: { top: '28%', left: '62%', w: 108, h: 108 }, arrow: 'up' },
    { title: '떠오르면 담기', body: '글·링크·사진·음성·할 일을 형식에 맞게 담으면, 세컨비가 알맞은 별로 엮어요.', ring: { bottom: 6, left: '30%', w: 74, h: 72 }, arrow: 'down' },
    { title: '세컨비와 대화해요', body: '나를 아는 세컨비, 객관적인 메타비, 창의적인 트위비. 세 모드로 생각을 넓혀요.', ring: { bottom: 6, left: '50%', w: 74, h: 72 }, arrow: 'down' },
  ];
  const s = steps[i];
  const last = i === steps.length - 1;
  const r = s.ring;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      <div onClick={() => (last ? onDone() : setI(i + 1))} style={{ position: 'absolute', inset: 0, background: 'rgba(4,6,12,.78)' }} />
      {/* spotlight ring */}
      <div style={{ position: 'absolute',
        top: r.top, bottom: r.bottom, left: r.left, width: r.w, height: r.h,
        transform: r.left ? 'translateX(-50%)' : 'none', marginTop: r.top ? -(r.h / 2) : 0,
        borderRadius: r.h > 120 ? 24 : '50%', border: '2px solid #7FD0FF', boxShadow: '0 0 0 4px rgba(70,182,255,.25), 0 0 28px rgba(70,182,255,.5)', pointerEvents: 'none' }} />
      {/* tip card */}
      <div style={{ position: 'absolute', left: 20, right: 20, ...(s.arrow === 'up' ? { top: '54%' } : { bottom: 110 }) }}>
        <div style={{ background: 'rgba(9,20,40,.97)', border: '1px solid rgba(70,182,255,.34)', borderRadius: 16, padding: 18, boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 26, height: 26 }} />
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.1em', color: '#7FB6FF' }}>가이드 {i + 1}/{steps.length}</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#EAF7FF' }}>{s.title}</div>
          <div className="md-body-medium" style={{ color: '#A7E0FF', marginTop: 6, lineHeight: 1.5, wordBreak: 'keep-all' }}>{s.body}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <button onClick={onDone} style={{ background: 'none', border: 'none', color: 'rgba(159,228,255,.92)', fontSize: 13, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', flex: 1, textAlign: 'left' }}>다시 보지 않기</button>
            <MdButton variant="filled" size="s" trailingIcon={last ? 'check' : 'arrow_forward'} onClick={() => (last ? onDone() : setI(i + 1))}>{last ? '시작하기' : '다음'}</MdButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== CALL RECORDING · 통화 녹음 플로우 ===================== */
function CallRecScreen({ t, go }) {
  const C = window.SB.C;
  const [phase, setPhase] = useFS('idle'); // idle → rec → stt → result
  const [secs, setSecs] = useFS(0);
  useFE(() => {
    if (phase !== 'rec') return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useFE(() => { if (phase === 'stt') { const id = setTimeout(() => setPhase('result'), 1800); return () => clearTimeout(id); } }, [phase]);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  if (phase === 'stt') return <LoadingState label="통화를 받아 적는 중" sub="기기 안에서 음성을 텍스트로 바꾸고 있어요. 녹음 파일은 곧 삭제돼요." />;

  if (phase === 'result') {
    const transcript = [
      { who: '상대', text: '이번 주말에 시간 괜찮아? 오랜만에 얼굴 보자.' },
      { who: '나', text: '응 좋아. 요즘 일이 많아서 사람 보는 게 좀 줄었더라.' },
      { who: '상대', text: '너 원래 사람 만나면 충전되는 스타일이잖아.' },
    ];
    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        <ScreenPad>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 14px' }}>
            <Icon name="task_alt" fill size={22} style={{ color: C('primary') }} />
            <span className="md-title-large" style={{ color: C('on-surface') }}>녹음을 분석했어요</span>
          </div>

          <SectionLabel>받아 적은 통화 · 3분 12초</SectionLabel>
          <MdCard variant="filled" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {transcript.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, height: 'fit-content',
                  background: l.who === '나' ? C('primary') : C('surface-container-highest'), color: l.who === '나' ? C('on-primary') : C('on-surface-variant') }}>{l.who}</span>
                <span className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{l.text}</span>
              </div>
            ))}
          </MdCard>

          <SectionLabel>세컨비의 제안 · 반영할까요?</SectionLabel>
          <MdCard variant="filled" style={{ background: C('tertiary-container'), padding: 14 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
              <div className="md-body-medium" style={{ color: C('on-tertiary-container'), wordBreak: 'keep-all' }}>
                <b>관계</b>·<b>건강</b> 별과 이어지는 통화예요. 사람을 만나면 충전되는 결이 한 번 더 보였어요.
              </div>
            </div>
          </MdCard>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {['관계', '건강', '사람과 충전'].map((tg) => <MdChip key={tg} variant="input" icon="sell">{tg}</MdChip>)}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => go('home')}>버리기</MdButton>
            <MdButton variant="filled" icon="check" style={{ flex: 2 }} onClick={() => go('records')}>승인하고 위키에 담기</MdButton>
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Icon name="lock" size={14} /> 원본 음성은 저장하지 않았어요. 텍스트만 남아요.
          </div>
        </ScreenPad>
      </div>
    );
  }

  // idle / rec
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 28px', textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 150, height: 150, display: 'grid', placeItems: 'center' }}>
          {phase === 'rec' && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255,90,90,.4)', animation: 'sb-ping 1.6s ease-out infinite' }} />}
          <div style={{ width: 120, height: 120, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: phase === 'rec' ? C('error-container') : C('surface-container-highest') }}>
            <Icon name="mic" fill={phase === 'rec'} size={52} style={{ color: phase === 'rec' ? C('error') : C('on-surface-variant') }} />
          </div>
        </div>
        {phase === 'rec' ? (
          <>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 30, fontWeight: 700, color: C('on-surface') }}>{mmss}</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 30 }}>
              {[14, 24, 32, 20, 28, 16, 26, 18, 30, 14].map((h, i) => (
                <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: C('error'), animation: `sb-pulse 0.8s ${i * 0.08}s ease-in-out infinite` }} />
              ))}
            </div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>통화를 녹음하고 있어요. 끝나면 자동으로 받아 적어요.</div>
          </>
        ) : (
          <>
            <div className="md-title-large" style={{ color: C('on-surface') }}>통화 녹음</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), maxWidth: 264, wordBreak: 'keep-all' }}>통화를 기기 안에서 받아 적고, 세컨비가 어울리는 별로 엮어요.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 290, marginTop: 4, textAlign: 'left' }}>
              {[
                ['graphic_eq', '받아 적은 뒤 음성 파일은 곳바로 삭제돼요'],
                ['lock', '통화 내용은 이 기기를 벗어나지 않아요'],
                ['campaign', '상대에게 녹음 사실을 먼저 알려 주세요'],
              ].map(([ic, d]) => (
                <div key={ic} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: C('surface-container-highest') }}>
                  <Icon name={ic} size={18} style={{ color: C('primary'), flex: '0 0 auto' }} />
                  <span className="md-body-small" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{d}</span>
                </div>
              ))}
              <div className="md-label-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 2, wordBreak: 'keep-all' }}>Android · iOS 모두 기기에 맞는 방식으로 안전하게 녹음해요</div>
            </div>
          </>
        )}
      </div>
      <div style={{ padding: '12px 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phase === 'rec' ? (
          <React.Fragment>
            <MdButton variant="filled" full icon="check" onClick={() => setPhase('stt')} style={{ background: C('error'), color: C('on-error') }}>녹음 멈추고 분석</MdButton>
            <MdButton variant="text" full onClick={() => { setSecs(0); setPhase('idle'); }}>취소 · 저장 안 함</MdButton>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <MdButton variant="filled" full icon="mic" onClick={() => { setSecs(0); setPhase('rec'); }}>녹음 시작</MdButton>
            <MdButton variant="text" full onClick={() => go('settings')}>다음에 할게요</MdButton>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ===================== ATTACHMENT · 애착(ECR) 검증틀 ===================== */
function AttachmentScreen({ t, go }) {
  const C = window.SB.C;
  // 회피(avoidance) low, 불안(anxiety) mid → 안정에 가까움
  const avoid = 32, anx = 48;
  const x = avoid, y = anx; // 0..100 grid
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 4px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface') }}>애착 유형</div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: C('tertiary-container'), color: C('on-tertiary-container') }}>L3</span>
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>확신 58%</span>
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16 }}>숨은 결(레이어 B) · 관계 도메인을 ECR 척도로 본 모습</div>

      {/* 2-axis map */}
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden',
          background: `linear-gradient(135deg, ${C('primary-container')}55, ${C('surface-container')})` }}>
          {/* quadrant labels */}
          {[['안정', 8, 8], ['몰입', 8, 'r'], ['회피', 'b', 8], ['혼란', 'b', 'r']].map(([lb, v, h], i) => (
            <span key={i} className="md-label-medium" style={{ position: 'absolute',
              ...(v === 'b' ? { bottom: 8 } : { top: 8 }), ...(h === 'r' ? { right: 10 } : { left: 10 }),
              color: C('on-surface-variant'), opacity: .7 }}>{lb}</span>
          ))}
          {/* axes */}
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: C('outline-variant') }} />
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: C('outline-variant') }} />
          {/* my point */}
          <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: C('primary'), boxShadow: `0 0 0 6px ${C('primary')}33, 0 0 16px ${C('primary')}` }} />
          </div>
          <span style={{ position: 'absolute', left: '50%', bottom: 4, transform: 'translateX(-50%)', fontSize: 11, color: C('on-surface-variant') }}>← 회피 낮음 · 높음 →</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span className="md-title-medium" style={{ color: C('on-surface') }}>안정형에 가까움</span>
          <span className="md-body-small" style={{ color: C('on-surface-variant') }}>· 회피 {avoid} · 불안 {anx}</span>
        </div>
      </MdCard>

      <RatifyBlock id="attachment" confidence={58} evidence={12} evidenceLabel="관계 별 기록"
        estimate="가까운 사람에겐 먼저 다가가되, 바쁠 땐 거리를 두시는 것 같아요."
        onEvidence={() => go('ratify')} onRefine={() => go('interview')} />

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="tonal" icon="forum" style={{ flex: 1 }} onClick={() => go('interview')}>관계 인터뷰</MdButton>
        <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => go('bigfive')}>Big Five 보기</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== NORTH STAR · 문장 생성·편집 ===================== */
function NorthStarEditor({ t, go }) {
  const C = window.SB.C;
  const [val, setVal] = useFS('나를 깊이 이해해 더 나답게 산다.');
  const suggests = [
    '나를 깊이 이해해 더 나답게 산다.',
    '흩어진 나를 모아, 매일 한 뼘 더 또렷해진다.',
    '남의 속도가 아닌 나의 리듬으로 산다.',
  ];
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>북극성 문장</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16, wordBreak: 'keep-all' }}>
        일곱 별을 종합해 세컨비가 제안한 문장이에요. 당신의 언어로 다듬어보세요.
      </div>

      {/* current */}
      <div style={{ position: 'relative', borderRadius: 16, padding: 18, overflow: 'hidden',
        background: 'radial-gradient(120% 100% at 50% 0%, rgba(167,139,250,.22), rgba(10,15,26,.6))', border: '1px solid rgba(167,139,250,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'radial-gradient(circle,#fff,#A78BFA 84%)', boxShadow: '0 0 12px rgba(167,139,250,.8)' }} />
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, letterSpacing: '.12em', color: '#D6C4FF' }}>NORTH STAR</span>
        </div>
        <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={2}
          style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', outline: 'none',
            color: '#EAF2FF', fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 20, fontWeight: 600, lineHeight: 1.4 }} />
      </div>

      <SectionLabel>세컨비 제안</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {suggests.map((s) => {
          const on = s === val;
          return (
            <MdCard key={s} variant={on ? 'outlined' : 'filled'} onClick={() => setVal(s)}
              style={{ padding: 14, border: on ? `1.5px solid ${C('primary')}` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name={on ? 'check_circle' : 'auto_awesome'} fill={on} size={20} style={{ color: on ? C('primary') : C('tertiary'), flex: '0 0 auto' }} />
                <span className="md-body-medium" style={{ color: C('on-surface'), flex: 1, wordBreak: 'keep-all' }}>{s}</span>
              </div>
            </MdCard>
          );
        })}
        <MdButton variant="text" icon="replay" style={{ alignSelf: 'flex-start' }} onClick={() => {}}>다른 제안 받기</MdButton>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => go('me')}>취소</MdButton>
        <MdButton variant="filled" icon="check" style={{ flex: 2 }} onClick={() => go('me')}>이 문장으로 저장</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== INBOX · 알림·제안 ===================== */
function InboxScreen({ t, go }) {
  const C = window.SB.C;
  const items = [
    { icon: 'auto_awesome', accent: C('primary'), title: '살펴볼 변화가 보여요', body: '관계·휴식 별에서 새 신호가 보여요. 맞는지 확인해 주실래요?', time: '방금', route: 'bigfive', cta: '확인하기' },
    { icon: 'calendar_today', accent: C('tertiary'), title: '주간 다이제스트가 도착했어요', body: '이번 주 많이 담은 영역과 떠오른 관심을 정리했어요. 비준 전 제안이에요.', time: '월 오전 9:00', route: 'digest', cta: '읽어보기' },
    { icon: 'forum', accent: C('tertiary'), title: '관계 별이 인터뷰를 기다려요', body: '최근 통화 3건에서 새 신호가 보여요. 3분이면 또렷해져요.', time: '1시간 전', route: 'interview', cta: '인터뷰 하기' },
    { icon: 'inbox', accent: C('secondary'), title: '정리함에 8개가 쌓였어요', body: '미분류 별가루을 태그·보관·삭제로 정리해요.', time: '오늘', route: 'records', cta: '정리하기' },
    { icon: 'mic', accent: C('primary'), title: '통화 녹음 1건 분석 대기', body: '받아 적은 통화의 반영 여부를 정해주세요.', time: '어제', route: 'callrec', cta: '검토하기' },
  ];
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 12px' }}>알림</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <MdCard key={i} variant="filled" onClick={() => go(it.route)} style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                background: C('surface-container'), color: it.accent }}>
                <Icon name={it.icon} fill size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="md-title-small" style={{ color: C('on-surface'), flex: 1, wordBreak: 'keep-all' }}>{it.title}</span>
                  <span className="md-label-small" style={{ color: C('on-surface-variant'), flex: '0 0 auto' }}>{it.time}</span>
                </div>
                <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>{it.body}</div>
                <MdButton variant="text" size="s" trailingIcon="arrow_forward" style={{ marginTop: 6, paddingLeft: 0 }} onClick={(e) => { e.stopPropagation(); go(it.route); }}>{it.cta}</MdButton>
              </div>
            </div>
          </MdCard>
        ))}
      </div>
    </ScreenPad>
  );
}

Object.assign(window, { OnboardingScreen, Coachmark, CallRecScreen, AttachmentScreen, NorthStarEditor, InboxScreen });
