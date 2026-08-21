/* ============================================================
   2nd-Brain · B-series new surfaces
   GrowthTrendScreen : 별 밝기 변화 추이 (B5)
   MotivationScreen  : 동기 검사 — 자기결정성(SDT) (B6)
   StrengthsScreen   : 강점 검사 — 대표 강점 랭킹 (B6)
   WidgetScreen      : 앱 밖 표면 — 위젯·잠금화면·알림 (B7)
   AuthScreen        : 회원/로그인 (B8)
   Export: window.{GrowthTrendScreen, MotivationScreen, StrengthsScreen, WidgetScreen, AuthScreen}
   ============================================================ */
const { useState: useSf } = React;

/* ===================== B5 · 별 밝기 변화 추이 ===================== */
function GrowthTrendScreen({ t, go }) {
  const C = window.SB.C;
  // overall brightness over 8 weeks (0~100)
  const series = [28, 31, 30, 38, 44, 47, 55, 62];
  const W = 300, H = 120, pad = 6;
  const max = 70, min = 20;
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / (max - min)) * (H - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;

  const events = [
    { w: '이번 주', star: '관계', from: 'L2', to: 'L3', why: '통화 녹음 3건 반영', up: true },
    { w: '2주 전', star: '커리어', from: 'L2', to: 'L3', why: '인터뷰로 몰입 패턴 확인', up: true },
    { w: '4주 전', star: '건강', from: 'L2', to: 'L1', why: '기록 공백 · 밝기 감소', up: false },
    { w: '6주 전', star: '성장', from: 'L1', to: 'L2', why: '회상 인터뷰 시작', up: true },
  ];

  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 2px' }}>밝기 변화</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 14, wordBreak: 'keep-all' }}>
        지난 8주, 당신의 별자리는 꾸준히 또렷해지고 있어요.
      </div>

      {/* trend chart */}
      <MdCard variant="elevated" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="md-label-large" style={{ color: C('on-surface') }}>전체 밝기</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: C('primary') }}>
            <Icon name="trending_up" size={16} />+34% · 8주
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="sb-trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C('primary')} stopOpacity="0.32" />
              <stop offset="100%" stopColor={C('primary')} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#sb-trend)" />
          <path d={line} fill="none" stroke={C('primary')} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => i === pts.length - 1 && (
            <circle key={i} cx={p[0]} cy={p[1]} r="4.5" fill={C('primary')} stroke={C('surface')} strokeWidth="2" />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {['8주', '', '', '4주', '', '', '', '지금'].map((l, i) => (
            <span key={i} className="md-label-small" style={{ color: C('on-surface-variant'), fontSize: 10 }}>{l}</span>
          ))}
        </div>
      </MdCard>

      {/* per-star sparkbars */}
      <SectionLabel>별마다 변화</SectionLabel>
      <MdCard variant="filled" style={{ padding: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[['커리어', 3, 4], ['관계', 2, 4], ['성장', 2, 3], ['건강', 2, 2], ['재정', 1, 2]].map(([k, was, now]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="md-body-medium" style={{ color: C('on-surface'), width: 52, flex: '0 0 auto' }}>{k}</span>
              <div style={{ flex: 1 }}><ProgressLinear value={(now / 5) * 100} color={now > was ? C('primary') : 'var(--warn)'} /></div>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('on-surface-variant'), width: 56, textAlign: 'right', flex: '0 0 auto' }}>
                L{was}→L{now}
              </span>
            </div>
          ))}
        </div>
      </MdCard>

      {/* milestones */}
      <SectionLabel>밝기 이력</SectionLabel>
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: C('outline-variant') }} />
        {events.map((e, i) => (
          <div key={i} style={{ position: 'relative', paddingBottom: i < events.length - 1 ? 16 : 0 }}>
            <span style={{ position: 'absolute', left: -22, top: 3, width: 12, height: 12, borderRadius: 0,
              background: e.up ? C('primary') : 'var(--warn)', boxShadow: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="md-title-small" style={{ color: C('on-surface') }}>{e.star}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: e.up ? C('primary') : 'var(--warn)' }}>{e.from}→{e.to}</span>
              <span style={{ flex: 1 }} />
              <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{e.w}</span>
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2, wordBreak: 'keep-all' }}>{e.why}</div>
          </div>
        ))}
      </div>
      <MdButton variant="tonal" icon="ios_share" full style={{ marginTop: 16 }} onClick={() => go('share')}>이 변화를 카드로 공유</MdButton>
    </ScreenPad>
  );
}

/* ===================== B6 · 동기 검사 (SDT) ===================== */
function MotivationScreen({ t, go }) {
  const C = window.SB.C;
  const sdt = [
    { k: '자율성', en: 'Autonomy', v: 74, note: '스스로 정할 때 동기가 솟아요' },
    { k: '유능감', en: 'Competence', v: 61, note: '해낼 수 있다는 감각이 받쳐줘요' },
    { k: '관계성', en: 'Relatedness', v: 52, note: '함께일 때 조금 더 움직여요' },
  ];
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 4px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface') }}>동기</div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 0, background: C('tertiary-container'), color: C('on-tertiary-container') }}>L2</span>
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>확신 61%</span>
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16 }}>숨은 결(레이어 B) · 무엇이 당신을 움직이나</div>

      {/* intrinsic vs extrinsic balance */}
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div className="md-label-large" style={{ color: C('on-surface'), marginBottom: 10 }}>내적 ↔ 외적 동기</div>
        <div style={{ display: 'flex', height: 38, borderRadius: 0, overflow: 'hidden' }}>
          <div style={{ width: '68%', background: C('primary'), display: 'grid', placeItems: 'center', color: C('on-primary'), fontSize: 12, fontWeight: 700 }}>내적 68%</div>
          <div style={{ width: '32%', background: C('surface-container-highest'), display: 'grid', placeItems: 'center', color: C('on-surface-variant'), fontSize: 12, fontWeight: 700 }}>외적 32%</div>
        </div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all' }}>
          대체로 '하고 싶어서' 움직여요. 보상보다 의미와 호기심이 더 큰 연료예요.
        </div>
      </MdCard>

      <SectionLabel>세 가지 욕구 · 자기결정성</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {sdt.map((s) => (
          <div key={s.k}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="md-body-medium" style={{ color: C('on-surface'), fontWeight: 700 }}>{s.k}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('on-surface-variant') }}>{s.en}</span>
            </div>
            <ProgressLinear value={s.v} color={C('tertiary')} />
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>{s.note}</div>
          </div>
        ))}
      </div>

      <RatifyBlock id="motivation" confidence={61} evidence={18} evidenceLabel="담긴 기록"
        estimate="누가 시켜서보다, 내 방식대로 정할 수 있을 때 가장 오래 가시는 것 같아요."
        onEvidence={() => go('ratify')} onRefine={() => go('interview')} />

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="tonal" icon="auto_awesome" style={{ flex: 1 }} onClick={() => go('strengths')}>강점 보기</MdButton>
        <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => go('bigfive')}>다른 검사</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== B6 · 강점 검사 ===================== */
function StrengthsScreen({ t, go }) {
  const C = window.SB.C;
  const strengths = [
    { k: '호기심', icon: 'lightbulb', v: 82, note: '새로운 걸 파고드는 힘' },
    { k: '끈기', icon: 'trending_up', v: 74, note: '한번 잡으면 오래 가요' },
    { k: '정직함', icon: 'task_alt', v: 69, note: '겉과 속을 맞추려 해요' },
    { k: '공감', icon: 'forum', v: 63, note: '상대의 결을 잘 읽어요' },
    { k: '심미안', icon: 'auto_awesome', v: 58, note: '좋은 것을 알아봐요' },
  ];
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 4px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface') }}>강점</div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 0, background: C('tertiary-container'), color: C('on-tertiary-container') }}>L2</span>
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>확신 66%</span>
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16 }}>숨은 결(레이어 B) · 당신을 당신답게 하는 것</div>

      {/* signature strengths */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {strengths.slice(0, 3).map((s, i) => (
          <MdCard key={s.k} variant={i === 0 ? 'elevated' : 'filled'} style={{ flex: 1, padding: 14, textAlign: 'center',
            border: i === 0 ? `2px solid ${C('primary')}` : undefined }}>
            <div style={{ width: 40, height: 40, borderRadius: 0, margin: '0 auto 8px', display: 'grid', placeItems: 'center',
              background: i === 0 ? C('primary') : C('secondary-container'), color: i === 0 ? C('on-primary') : C('on-secondary-container') }}>
              <Icon name={s.icon} size={22} />
            </div>
            <div className="md-title-small" style={{ color: C('on-surface') }}>{s.k}</div>
          </MdCard>
        ))}
      </div>

      <SectionLabel>강점 스펙트럼</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {strengths.map((s) => (
          <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name={s.icon} size={20} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="md-body-medium" style={{ color: C('on-surface'), fontWeight: 700 }}>{s.k}</span>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('on-surface-variant') }}>{s.v}</span>
              </div>
              <ProgressLinear value={s.v} color={C('tertiary')} />
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 3 }}>{s.note}</div>
            </div>
          </div>
        ))}
      </div>

      <RatifyBlock id="strengths" confidence={66} evidence={20} evidenceLabel="담긴 기록"
        estimate="낯선 걸 파고드는 호기심이 당신을 가장 멀리 데려가는 힘 같아요."
        onEvidence={() => go('ratify')} onRefine={() => go('interview')} />

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="tonal" icon="forum" style={{ flex: 1 }} onClick={() => go('chat')}>강점 살리기</MdButton>
        <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => go('motivation')}>동기 보기</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== B7 · 앱 밖 표면 (위젯·잠금화면·알림) ===================== */
function WidgetScreen({ t, go }) {
  const C = window.SB.C;
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 2px' }}>앱 밖에서</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16, wordBreak: 'keep-all' }}>
        앱을 열지 않아도, 세컨비는 당신 곁에 있어요.
      </div>

      {/* home-screen widgets */}
      <SectionLabel>홈 화면 위젯</SectionLabel>
      <div style={{ display: 'flex', gap: 12 }}>
        {/* small widget — today's star */}
        <div style={{ width: 128, height: 128, borderRadius: 0, flex: '0 0 auto', padding: 14, position: 'relative', overflow: 'hidden',
          background: 'radial-gradient(120% 100% at 30% 0%, var(--c02), var(--ds-space) 80%)', boxShadow: 'none' }}>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--c11)' }}>오늘의 별</div>
          <div style={{ position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)', width: 34, height: 34, borderRadius: 0,
            background: 'radial-gradient(circle,var(--ds-star),var(--ds-core) 72%)', boxShadow: 'none' }} />
          <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c07)' }}>관계</div>
            <div style={{ fontSize: 12, color: 'rgba(190,225,255,.7)' }}>오늘 밝아졌어요 · L3</div>
          </div>
        </div>
        {/* medium widget — capture shortcut */}
        <div style={{ flex: 1, height: 128, borderRadius: 0, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: C('surface-container-highest'), boxShadow: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={window.SB_HEAD['head-front']} alt="" style={{ width: 28, height: 28 }} />
            <span className="md-label-large" style={{ color: C('on-surface') }}>지금 떠오른 거 담기</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="md-interactive" style={{ position: 'relative', flex: 1, height: 40, borderRadius: 0, border: 'none', cursor: 'pointer',
              background: C('primary'), color: C('on-primary'), display: 'grid', placeItems: 'center' }}>
              <span className="md-state" /><Icon name="add" size={20} />
            </button>
            <button className="md-interactive" style={{ position: 'relative', flex: 1, height: 40, borderRadius: 0, border: `1px solid ${C('outline-variant')}`, cursor: 'pointer',
              background: 'transparent', color: C('on-surface-variant'), display: 'grid', placeItems: 'center' }}>
              <span className="md-state" /><Icon name="mic" size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* lock-screen */}
      <SectionLabel>잠금화면</SectionLabel>
      <div style={{ borderRadius: 0, padding: '20px 18px', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(160deg,var(--c01),var(--ds-space))', boxShadow: 'none' }}>
        <div style={{ textAlign: 'center', color: 'var(--c07)' }}>
          <div style={{ fontSize: 12, opacity: .7 }}>6월 25일 목요일</div>
          <div style={{ fontSize: 45, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-.02em' }}>9:41</div>
        </div>
        {/* lock-screen complication / notification */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 0,
          background: 'var(--panel-2)' }}>
          <img src={window.SB_HEAD['head-front']} alt="" style={{ width: 34, height: 34, flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c07)' }}>2nd-Brain</div>
            <div style={{ fontSize: 12, color: 'rgba(220,235,255,.85)', wordBreak: 'keep-all' }}>오늘 '관계' 별이 밝아졌어요. 한 줄 남겨볼까요?</div>
          </div>
        </div>
      </div>

      {/* push notification */}
      <SectionLabel>알림</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 0, background: C('surface-container-highest') }}>
        <img src={window.SB_HEAD['head-front']} alt="" style={{ width: 38, height: 38, flex: '0 0 auto' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="md-label-large" style={{ color: C('on-surface') }}>세컨비</span>
            <span className="md-label-small" style={{ color: C('on-surface-variant') }}>· 지금</span>
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 2, wordBreak: 'keep-all' }}>
            새 통찰 1개가 검토를 기다려요. 동의하면 별에 반영할게요.
          </div>
        </div>
      </div>
      <MdButton variant="text" icon="tune" style={{ marginTop: 14 }} onClick={() => go('settings')}>알림 설정</MdButton>
    </ScreenPad>
  );
}

/* ===================== B8 · 회원/로그인 ===================== */
function AuthScreen({ t, go }) {
  const C = window.SB.C;
  const pick = (method) => go(method === 'signup' ? 'signup' : 'profilesetup');
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', overflowY: 'auto' }}>
      <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 26px 0', minHeight: 460 }}>
        {/* brand */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><window.SbHead size={80} expression="positive" track /></div>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c07)', marginTop: 14, wordBreak: 'keep-all' }}>
            2ndB
          </div>
          <div className="md-body-medium" style={{ color: 'var(--c05)', marginTop: 8, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            나를 알아가는 AI, 세컨비와 함께.
          </div>
        </div>

        {/* email · password · 로그인 · 회원가입 · 또 다른 방법 */}
        <window.AuthProviders onPick={pick} />

        {/* forgot password */}
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button onClick={() => go('pwreset')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--c05)', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>비밀번호를 잊으셨나요?</button>
        </div>
      </div>

      {/* 사업자 정보 — 전자상거래법 표기. 동의 문구를 링크 줄에 녹였다 */}
      <div style={{ flex: '0 0 auto', padding: '28px 22px 22px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c05)', marginBottom: 10 }}>(주)하양집</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[['대표', '김세컨'],
            ['주소', '서울특별시 성동구 왕십리로 123, 4층'],
            ['사업자등록번호', '123-45-67890'],
            ['통신판매업 신고번호', '2026-서울성동-0405호'],
            ['개인정보담당', 'kim0405@hayangzip.com'],
            ['대표번호', '070-1234-5678']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              <span style={{ flex: '0 0 auto' }}>{k} :</span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{v}</span>
            </div>))}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', lineHeight: 1.6, marginTop: 12, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          2ndB가 만든 요약과 제안은 참고용이며 의료·법률·재무 전문가의 판단을 대신하지 않습니다. 기록의 권리는 이용자에게 있습니다.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 0', marginTop: 14 }}>
          {[['서비스 이용약관', 'terms'], ['개인정보 처리방침', 'privacy-policy'], ['환불 정책', 'refund']].map(([l, r], i) => (
            <React.Fragment key={r}>
              {i > 0 && <span aria-hidden="true" style={{ width: 'var(--u)', height: 10, background: 'var(--edge-soft)', margin: '0 9px' }} />}
              <button onClick={() => go(r)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--font-micro)', fontWeight: 700, color: 'var(--c05)' }}>{l}</button>
            </React.Fragment>))}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', lineHeight: 1.6, marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          계속하면 위 약관과 처리방침에 동의하게 돼요.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GrowthTrendScreen, MotivationScreen, StrengthsScreen, WidgetScreen, AuthScreen });
