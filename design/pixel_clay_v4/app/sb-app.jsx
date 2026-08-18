/* ============================================================
   2nd-Brain · App shell (픽셀 폰 프레임 · 컴패니언 · NavBar · 라우터 · 트윅)
   PIXEL-CLAY 판 — 사각 프레임, 도트 별하늘, 디더 스크림. Loaded last.
   ============================================================ */
const { useState: useS, useRef: useR, useEffect: useE } = React;
const PXCApp = window.PIXELCLAYDesignSystem_ca692b;

const PHONE_W = 390,PHONE_H = 820;
const ROOTS = ['home', 'capture', 'chat', 'records', 'settings'];
/* 로그인 전 흐름 — 폰 크롬(창·앱바·탭바) 없이 별하늘 위에 전체화면으로 뜬다 */
const GATE_ROUTES = ['auth', 'signup', 'pwreset', 'dobgate', 'profilesetup', 'peer-token'];
const TITLES = { me: '북극성', record: '별가루 상세', interview: '심층 인터뷰', bigfive: '검증 · Big Five', audit: '성장 · 과거의 나',
  star: '별', iden: 'IDEN · 포터블 정체성', connect: '데이터 연동', plans: '요금제', museum: 'AI 뮤지엄',
  callrec: '통화 녹음', attachment: '애착 유형', northstar: '북극성 문장', inbox: '알림', values: '가치관', ratify: '확인 이력',
  trend: '밝기 변화', motivation: '동기', strengths: '강점', widget: '앱 밖에서', auth: '로그인', ops: '오늘의 비서',
  focus: '일일 집중', reminders: '예약 리마인더', import: '외부 가져오기', datareview: '내 데이터 리뷰', share: '공유 카드', imagine: '공상하기',
  peer: '보여지는 나', pwreset: '비밀번호 재설정', profilesetup: '프로필 완성',
  reward: '담기 가속', digest: '주간 다이제스트',
  'audit-full': '라이프 오딧', domains: '내 영역', lifeinput: '영역 기록', hobbyinput: '취미·여가 기록', healthinput: '건강 기록', careerinput: '성과 입력', drilldown: 'Drill Down', healthdata: '건강 데이터 항목',
  relcontacts: '주소록', relperson: '사람 기록',
  dobgate: '생년월일 확인', permissions: '권한 관리', privacy: '개인정보 · 약관', support: '지원 · 공지', manual: '사용 매뉴얼', reasoning: '리즈닝', notices: '공지사항',
  signup: '회원가입', 'consent-notice': '동의 항목 안내', terms: '정책 및 약관', refund: '정책 및 약관', 'privacy-policy': '정책 및 약관', notfound: '없는 화면이에요',
  'ipip-neo': '성격 정밀검사', esm: '가벼운 체크인', insights: '인사이트', research: '연결 찾기', discover: '트렌드',
  'capture-full': '전체 담기', formats: '내보내기 형식', 'import-hub': '가져오기',
  wiki: '지식', srs: '언어 복습', review: '점검', 'digest-today': '오늘의 정리',
  career: '커리어', milestones: '목표', ledger: '이번 달 점검', 'side-project': '사이드 프로젝트',
  growth: '나의 변화', reading: '내 책장', meals: '이번 주 식단', 'peer-invites': '나를 아는 사람들에게 묻기', community: '커뮤니티',
  account: '계정', profile: '나', subscription: '구독 관리', theme: '테마 · 글꼴', rlss: '삶의 만족도 (RLSS)',
  'peer-token': '남이 보는 나', rest: '휴식', people: '관계', crisis: '도움 연결', applock: '사용자 인증' };
/* 대조 라우트 — 기존판과 브리프판을 한 화면에서 토글로 비교 */
const COMPARE_ROUTES = ['hobbyinput', 'relcontacts', 'digest'];

/* ---- 공유 별하늘 (도트 버전) — 시드 70730219 · 별 96개 그대로 ---- */
const SB_SKY = { w: 390, h: 820 };
function sbSkyRng(seed) {let s = seed >>> 0;return () => {s = s * 1664525 + 1013904223 >>> 0;return s / 4294967296;};}
const SB_SKY_STARS = (() => {
  const r = sbSkyRng(70730219),cols = ['var(--c05)', 'var(--c05)', 'var(--ds-polaris)', 'var(--c08)'],out = [];
  for (let i = 0; i < 96; i++) out.push({
    x: Math.round(r() * SB_SKY.w), y: Math.round(r() * SB_SKY.h),
    r: +(0.6 + r() * 1.7).toFixed(2), o: +(0.28 + r() * 0.62).toFixed(2),
    tw: r() < 0.3, dly: +(r() * 4.6).toFixed(2), c: cols[r() * cols.length | 0]
  });
  return out;
})();
const SB_SKY_CONST = [
{ pts: [[40, 120], [86, 150], [120, 118], [168, 160], [120, 118], [104, 206]] },
{ pts: [[300, 92], [342, 134], [316, 196], [268, 166], [342, 134], [372, 108]] },
{ pts: [[58, 642], [112, 612], [150, 662], [212, 628]] },
{ pts: [[252, 470], [300, 500], [286, 558], [332, 540]] }];
/* 별자리 선 → 8px 간격 점선 도트 (대각선 AA 회피) */
const SB_CONST_DOTS = (() => {
  const dots = [];
  SB_SKY_CONST.forEach((cn) => {
    for (let i = 0; i < cn.pts.length - 1; i++) {
      const [x1, y1] = cn.pts[i],[x2, y2] = cn.pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1),n = Math.max(2, Math.round(len / 9));
      for (let k = 1; k < n; k++) dots.push([Math.round(x1 + (x2 - x1) * k / n), Math.round(y1 + (y2 - y1) * k / n)]);
    }
    cn.pts.forEach((p) => dots.push([Math.round(p[0]), Math.round(p[1]), 1]));
  });
  return dots;
})();

function SbStarfield() {
  return (
    <svg viewBox={`0 0 ${SB_SKY.w} ${SB_SKY.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" shapeRendering="crispEdges"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {SB_CONST_DOTS.map((d, i) =>
      <rect key={'c' + i} x={d[0]} y={d[1]} width={d[2] ? 2 : 1} height={d[2] ? 2 : 1} fill={d[2] ? 'var(--c03)' : 'var(--c02)'} />
      )}
      {SB_SKY_STARS.map((s, i) => {
        const sz = s.r < 1.1 ? 1 : s.r < 1.8 ? 2 : 3;
        const fill = s.tw ? undefined : s.o < 0.45 ? 'var(--c02)' : s.o < 0.68 ? 'var(--c03)' : s.c;
        return <rect key={i} x={s.x} y={s.y} width={sz} height={sz} fill={fill}
        className={s.tw ? 'ds-tw' : undefined} style={s.tw ? { animationDelay: s.dly + 's' } : undefined} />;
      })}
    </svg>);
}
const SbStarfieldMemo = React.memo(SbStarfield);

/* ---- Status bar ---- */
function StatusBar({ onHome }) {
  const C = window.SB.C;
  const [now, setNow] = useS(new Date());
  useE(() => {const id = setInterval(() => setNow(new Date()), 20000);return () => clearInterval(id);}, []);
  const hh = now.getHours(),mm = String(now.getMinutes()).padStart(2, '0');
  const onDark = onHome ? 'var(--ds-star)' : C('on-surface');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 22px 6px',
      fontSize: 12, fontWeight: 700, color: onDark, fontFamily: 'var(--md-ref-typeface-mono)' }}>
      <span>{hh}:{mm}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <Icon name="signal_cellular_alt" size={16} />
        <Icon name="wifi" size={16} />
        <span aria-label="배터리" style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <span style={{ width: 14, height: 8, background: 'currentColor', boxShadow: 'inset 2px 2px 0 0 var(--ds-space), inset -2px -2px 0 0 var(--ds-space)' }} />
          <span style={{ width: 2, height: 4, background: 'currentColor' }} />
        </span>
      </div>
    </div>);
}

/* ---- Companion — 픽셀 대화창(DialogBox) 판. 초상 탭 = 리즈닝 대화, 그 외엔 최근 자료·결과·혼잣말 피드 ---- */
function Companion({ screen, expression, dataState, go, env }) {
  const RS = window.SBReasoning;
  const [rm, setRm] = React.useState(false);
  const [, force] = React.useState(0);
  React.useEffect(() => RS ? RS.subscribe(() => force((x) => x + 1)) : undefined, []);
  const empty = screen === 'records' && dataState === '빈';
  const off = screen === 'records' && dataState === '오프라인';
  const st = RS && RS.state;
  const variant = !st ? null : st.running ? 'run' : st.left <= 0 ? 'out' : st.auto ? 'auto' : 'idle';
  const runRecent = (n) => RS.run(RS.MATERIALS.slice(0, n).map((m) => m.id), env);
  const feed = React.useMemo(() => window.SB.dialogFeed(), []);
  /* 위키 대화창은 튜토리얼 역할만 — 이 화면에 무엇이 있는지 한 번 알려주고 물러난다 */
  const isWiki = screen === 'records';
  const [tourDone, setTourDone] = React.useState(() => { try { return localStorage.getItem('sb_wiki_tour') === '1'; } catch (e) { return false; } });
  const finishTour = () => { try { localStorage.setItem('sb_wiki_tour', '1'); } catch (e) {} setTourDone(true); };
  const mood = rm && st ? variant === 'out' ? 'negative' : variant === 'auto' ? 'neutral' : 'positive' : expression || 'neutral';

  let pages;
  if (empty) pages = [{ kind: '담아내기', line: '아직 담은 별가루이 없어요. 첫 한 줄을 담아볼까요?' }];
  else if (off) pages = [{ kind: '동기화', line: '오프라인이에요. 담은 건 저장됐다가 연결되면 자동으로 동기화돼요.' }];
  else if (rm && st) {
    pages = [
    variant === 'idle' ? { kind: '리즈닝', line: `새로 담은 자료 3건이 있어요. 지금 별을 이어볼까요? · 이번 주 ${st.left}회 남음`,
      choices: [{ label: '지금 잇기', icon: 'bolt', on: () => runRecent(3) }, { label: '골라서', icon: 'tune', on: () => go && go('reasoning') }] } :
    variant === 'auto' ? { kind: '자동 리즈닝 ON', line: `담는 대로 제가 알아서 잇고 있어요. 방금 회고를 커리어 별에 연결했어요. · ${st.left}회 남음`,
      choices: [{ label: '지금 더', icon: 'bolt', on: () => runRecent(1) }, { label: '자동 끄기', icon: 'tune', on: () => RS.setAuto(false) }] } :
    variant === 'run' ? { kind: '잇는 중', line: `선택한 ${st.running.total}건을 읽고 있어요… ${Math.min(st.running.done + 1, st.running.total)} / ${st.running.total}`,
      choices: [{ label: '취소', icon: 'stop_circle', on: () => RS.cancel() }] } :
    { kind: '다 썼어요', line: '이번 주 리즈닝을 다 썼어요. 일요일에 2회 채워져요.',
      choices: [{ label: '1회 받기', icon: 'play_circle', on: () => RS.grant(1) }, { label: '업그레이드', icon: 'rocket_launch', on: () => go && go('plans') }] }];
  } else if (isWiki) pages = window.SB.WIKI_TOUR;
  else pages = feed;

  /* 튜토리얼을 마쳤으면 대화창 대신 다시 부를 작은 단추만 남긴다 */
  if (isWiki && tourDone && !rm) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 10px' }}>
        <button onClick={() => setTourDone(false)} aria-label="세컨비 안내 다시 보기" className="md-interactive"
        style={{ position: 'relative', width: 44, height: 44, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer',
          pointerEvents: 'auto', background: 'var(--panel)', boxShadow: 'var(--ds-edge)' }}>
          <span className="md-state" />
          <SbHead size={32} expression="neutral" track={false} />
        </button>
      </div>);
  }

  return (
    <div style={{ padding: '14px 12px 10px' }}>
      <window.DialogBox pages={pages} compact
      onPage={isWiki ? ((i) => { if (i >= window.SB.WIKI_TOUR.length - 1) setTimeout(finishTour, 2400); }) : undefined}
      head={
      <div onClick={(e) => { e.stopPropagation(); setRm((v) => !v); }} role="button" tabIndex={0} title="세컨비 — 리즈닝"
      style={{ cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <SbHead size={48} expression={mood} track />
      </div>} />
    </div>);
}

/* ---- Top app bar ---- */
function TopAppBar({ title, onBack, action }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px 6px 4px', height: 56 }}>
      <MdIconButton name="arrow_back" onClick={onBack} title="뒤로" />
      <span className="md-title-large" style={{ color: C('on-surface'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      {action && <div style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'flex', alignItems: 'center', paddingRight: 4 }}>{action}</div>}
    </div>);
}

/* 별자리 탭 아이콘 — 홈의 4꼭짓점 픽셀 별과 같은 형태 (9×9 그리드) */
function NavStar({ on }) {
  /* PixStar 와 같은 방식 — 선택 시 뒤에 더 큰 별을 겹친다. opacity 없이 색으로만 구분. */
  const S = (px, fill) => (
    <svg viewBox="0 0 9 9" width={px} height={px} shapeRendering="crispEdges" aria-hidden="true"
      style={{ display: 'block', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: px, height: px, maxWidth: 'none' }}>
      <rect x="4" y="0" width="1" height="9" fill={fill} />
      <rect x="0" y="4" width="9" height="1" fill={fill} />
      <rect x="3" y="3" width="3" height="3" fill={fill} />
    </svg>);
  return (
    /* 형제 탭의 Icon 은 size 를 버킷으로 스냅해 실제로 16px 로 그려진다 — 잉크 크기를 맞춘다.
       선택 후광은 액센트 칩 위에서 보이는 밝은 별빛으로. */
    <span style={{ position: 'relative', display: 'block', width: 16, height: 16 }}>
      {on && S(16, 'var(--ds-star)')}
      {S(12, 'currentColor')}
    </span>);
}

/* ---- Navigation bar (하단 5탭) ---- */
function NavBar({ active, onNav }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', height: 80, paddingTop: 8, background: C('surface-container'),
      boxShadow: '0 calc(-1*var(--u)) 0 0 var(--edge-soft)' }}>
      {window.SB.NAV.map((n) => {
        const on = active === n.id;
        return (
          <button key={n.id} onClick={() => onNav(n.id)} aria-current={on ? 'page' : undefined} className="md-interactive"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: 48 }}>
            <span className="md-state" />
            <div style={{ width: 64, height: 36, display: 'grid', placeItems: 'center',
              background: on ? C('primary') : 'transparent', boxShadow: on ? 'var(--ds-edge)' : 'none',
              color: on ? C('on-primary') : C('on-surface-variant') }}>
              {n.id === 'home'
                ? <NavStar on={on} />
                : <Icon name={n.icon} fill={on} size={32} />}
            </div>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: on ? 700 : 400, color: on ? C('on-surface') : C('on-surface-variant') }}>{n.label}</span>
          </button>);
      })}
    </div>);
}

/* ---- screen registry ---- */
function ScreenBody({ name, t, go, param, active, env, onBack }) {
  switch (name) {
    case 'home':return <ConstellationHome t={t} onStar={go} active={active} />;
    case 'capture':return <CaptureScreen t={t} go={go} env={env} />;
    case 'chat':return <ChatScreen t={t} go={go} env={env} param={param} onBack={onBack} />;
    case 'records':return <RecordsScreen t={t} go={go} env={env} />;
    case 'me':return <MeScreen t={t} go={go} />;
    case 'star':return <StarScreen t={t} go={go} param={param} onBack={onBack} />;
    case 'record':return <RecordDetailScreen t={t} go={go} param={param} />;
    case 'interview':return <InterviewScreen t={t} go={go} />;
    case 'bigfive':return <BigFiveScreen t={t} go={go} />;
    case 'audit':return <AuditScreen t={t} go={go} />;
    case 'iden':return <IdenScreen t={t} go={go} />;
    case 'connect':return <ConnectScreen t={t} go={go} />;
    case 'plans':return <PlansScreen t={t} go={go} />;
    case 'settings':return <SettingsScreen t={t} go={go} env={env} />;
    case 'museum':return <MuseumScreen t={t} go={go} param={param} />;
    case 'callrec':return <CallRecScreen t={t} go={go} />;
    case 'attachment':return <AttachmentScreen t={t} go={go} />;
    case 'northstar':return <NorthStarEditor t={t} go={go} />;
    case 'inbox':return <InboxScreen t={t} go={go} />;
    case 'values':return <ValuesScreen t={t} go={go} />;
    case 'ratify':return <RatifyScreen t={t} go={go} />;
    case 'trend':return <GrowthTrendScreen t={t} go={go} />;
    case 'motivation':return <MotivationScreen t={t} go={go} />;
    case 'strengths':return <StrengthsScreen t={t} go={go} />;
    case 'widget':return <WidgetScreen t={t} go={go} />;
    case 'auth':return <AuthScreen t={t} go={go} />;
    case 'ops':return <OpsScreen t={t} go={go} env={env} />;
    case 'focus':return <FocusScreen t={t} go={go} />;
    case 'reminders':return <RemindersScreen t={t} go={go} param={param} />;
    case 'import':return <ImportScreen t={t} go={go} env={env} />;
    case 'datareview':return <DataReviewScreen t={t} go={go} env={env} />;
    case 'share':return <ShareCardScreen t={t} go={go} env={env} />;
    case 'imagine':return <ImagineScreen t={t} go={go} />;
    case 'peer':return <PeerScreen t={t} go={go} />;
    case 'pwreset':return <PwResetScreen t={t} go={go} />;
    case 'profilesetup':return <ProfileSetupScreen t={t} go={go} onBack={onBack} />;
    case 'dobgate':return <DobGateScreen t={t} go={go} />;
    case 'permissions':return <PermissionsScreen t={t} go={go} />;
    case 'privacy':return <PrivacyScreen t={t} go={go} />;
    case 'support':return <SupportScreen t={t} go={go} />;
    case 'audit-full':return <LifeAuditScreen t={t} go={go} />;
    case 'domains':return <DomainDashScreen t={t} go={go} />;
    case 'lifeinput':return <DomainInputScreen t={t} go={go} param={param} />;
    case 'hobbyinput':return <CompareRest t={t} go={go} env={env} onBack={onBack} />;
    case 'healthinput':return <HealthInputScreen t={t} go={go} param={param} />;
    case 'careerinput':return <CareerInputScreen t={t} go={go} param={param} />;
    case 'drilldown':return <DrillDownScreen t={t} go={go} param={param} />;
    case 'relcontacts':return <ComparePeople t={t} go={go} env={env} onBack={onBack} />;
    case 'relperson':return <RelPersonScreen t={t} go={go} param={param} />;
    case 'healthdata':return <HealthDataScreen t={t} go={go} />;
    case 'manual':return <ManualScreen t={t} go={go} />;
    case 'reward':return <RewardScreen t={t} go={go} />;
    case 'digest':return <CompareDigest t={t} go={go} env={env} onBack={onBack} />;
    case 'reasoning':return <ReasoningScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'notices':return <NoticesScreen t={t} go={go} env={env} />;
    case 'signup':return <SignUpScreen t={t} go={go} env={env} />;
    case 'consent-notice':return <ConsentNoticeScreen t={t} go={go} param={param} />;
    case 'terms':return <LegalScreen t={t} go={go} param={{ doc: 'terms' }} />;
    case 'privacy-policy':return <LegalScreen t={t} go={go} param={{ doc: 'privacy-policy' }} />;
    case 'refund':return <LegalScreen t={t} go={go} param={{ doc: 'refund' }} />;
    case 'notfound':return <NotFoundScreen t={t} go={go} />;
    case 'ipip-neo':return <IpipNeoScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'esm':return <EsmScreen t={t} go={go} env={env} />;
    case 'insights':return <InsightsScreen t={t} go={go} env={env} />;
    case 'research':return <ResearchScreen t={t} go={go} env={env} />;
    case 'discover':return <DiscoverScreen t={t} go={go} env={env} />;
    case 'capture-full':return <CaptureFullScreen t={t} go={go} env={env} param={param} onBack={onBack} />;
    case 'formats':return <FormatsScreen t={t} go={go} param={param} />;
    case 'import-hub':return <ImportHubScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'wiki':return <WikiScreen t={t} go={go} param={param} />;
    case 'srs':return <SrsScreen t={t} go={go} onBack={onBack} />;
    case 'review':return <ReviewScreen t={t} go={go} onBack={onBack} />;
    case 'digest-today':return <DigestTodayScreen t={t} go={go} onBack={onBack} />;
    case 'career':return <CareerScreen t={t} go={go} onBack={onBack} />;
    case 'milestones':return <MilestonesScreen t={t} go={go} onBack={onBack} />;
    case 'ledger':return <LedgerScreen t={t} go={go} onBack={onBack} />;
    case 'side-project':return <SideProjectScreen t={t} go={go} onBack={onBack} />;
    case 'growth':return <GrowthScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'reading':return <ReadingScreen t={t} go={go} onBack={onBack} />;
    case 'meals':return <MealsScreen t={t} go={go} onBack={onBack} />;
    case 'peer-invites':return <PeerInvitesScreen t={t} go={go} onBack={onBack} />;
    case 'community':return <CommunityScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'account':return <AccountScreen t={t} go={go} onBack={onBack} />;
    case 'profile':return <ProfileHubScreen t={t} go={go} onBack={onBack} />;
    case 'subscription':return <SubscriptionScreen t={t} go={go} onBack={onBack} />;
    case 'theme':return <ThemeScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'rlss':return <RlssScreen t={t} go={go} onBack={onBack} />;
    case 'peer-token':return <PeerTokenScreen t={t} go={go} param={param} />;
    case 'rest':return <RestBoardScreen t={t} go={go} />;
    case 'people':return <PeopleMapScreen t={t} go={go} />;
    case 'crisis':return <CrisisDemoScreen t={t} go={go} env={env} onBack={onBack} />;
    case 'applock':return <AppLockScreen t={t} go={go} env={env} onBack={onBack} />;
    default:return null;
  }
}

const EXPR = { '긍정': 'positive', '중립': 'neutral', '부정': 'negative' };
const PAL = { '미드나잇': 'midnight', '신스웨이브': 'synthwave' };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "headScale": 1,
  "expression": "중립",
  "bubbleText": "",
  "paletteName": "미드나잇",
  "dark": true,
  "starLevel": 3,
  "motion": 70,
  "homeVariant": "A",
  "chatVariant": "A",
  "captureVariant": "A",
  "dataState": "채움"
} /*EDITMODE-END*/;

function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  /* 라우트를 첫 렌더부터 복원한다 — 효과로 미루면 공지 가드가 복원 전 기본값('home')을 보고 잘못 뜬다 */
  const savedRoute = (() => { try { return JSON.parse(localStorage.getItem('sb_route')) || {}; } catch (e) { return {}; } })();
  const [root, setRoot] = useS(savedRoute.root || 'home');
  const [stack, setStack] = useS(savedRoute.stack || []);
  const [param, setParam] = useS(savedRoute.param !== undefined ? savedRoute.param : null);
  const [scale, setScale] = useS(1);
  const [job, setJob] = useS(null);
  const [toast, setToast] = useS(null);
  const [sheet, setSheet] = useS(null);
  const [noticeView, setNoticeView] = useS(null); // {idx, pager} — 공지 팝업 (신기능 B)
  const [crisisView, setCrisisView] = useS(null); // {locale, minor} — 위기 라우팅 (셸 최상위 오버레이)
  const [moreSheet, setMoreSheet] = useS(false);  // 홈 코너 더보기 시트
  const jobRef = useR(null);
  const toastRef = useR(null);
  const [features, setFeatures] = useS({ autotag: true, notify: false, applock: false, ondevice: true, callrec: false, captureFree: false });
  const [connections, setConnections] = useS({ cal: false, health: true, notion: false });
  const [graphLabels, setGraphLabels] = useS(() => {try {const s = JSON.parse(localStorage.getItem('sb_graphlabels'));return s && s.mode ? s : { mode: 'zoom', threshold: 0.9 };} catch (e) {return { mode: 'zoom', threshold: 0.9 };}});
  useE(() => {try {localStorage.setItem('sb_graphlabels', JSON.stringify(graphLabels));} catch (e) {}}, [graphLabels]);
  const [onboarded, setOnboarded] = useS(() => {try {return localStorage.getItem('sb_onboarded') === '1';} catch (e) {return false;}});
  const [coachDone, setCoachDone] = useS(() => {try {return localStorage.getItem('sb_coach') === '1';} catch (e) {return false;}});
  /* 인트로 → 로그인/회원가입 → 프로필 설정 → 별자리. TTFV는 프로필을 마친 뒤에만 뜨다. */
  const finishOnboard = () => {try {localStorage.setItem('sb_onboarded', '1');} catch (e) {}setRoot('home');setStack(['auth']);setOnboarded(true);};
  const finishCoach = () => {try {localStorage.setItem('sb_coach', '1');} catch (e) {}setCoachDone(true);};
  const resetGuide = () => {try {localStorage.removeItem('sb_onboarded');localStorage.removeItem('sb_coach');} catch (e) {}setRoot('home');setStack([]);setOnboarded(false);setCoachDone(false);};

  // palette + theme → <html>
  useE(() => {
    const el = document.documentElement;
    el.setAttribute('data-palette', PAL[tw.paletteName] || 'midnight');
    el.classList.toggle('theme-dark', !!tw.dark);
    el.classList.toggle('theme-light', !tw.dark);
  }, [tw.paletteName, tw.dark]);

  // 공지 후 첫 실행 — 별자리(홈)에 들어왔을 때만 1회 자동 팝업
  useE(() => {
    const cur = stack.length ? stack[stack.length - 1] : root;
    if (onboarded && cur === 'home' && window.SBNotices && window.SBNotices.needsAutoPopup()) setNoticeView({ idx: 0, pager: false });
  }, [onboarded, root, stack]);

  // persist route
  useE(() => {try {let p = null;try {p = JSON.parse(JSON.stringify(param ?? null));} catch (e2) {p = null;}localStorage.setItem('sb_route', JSON.stringify({ root, stack, param: p }));} catch (e) {}}, [root, stack, param]);

  // scale phone to fit
  useE(() => {
    const fit = () => {
      const m = 24,w = window.innerWidth,h = window.innerHeight;
      if (w <= m || h <= m) {requestAnimationFrame(fit);return;}
      setScale(Math.max(0.2, Math.min(1, (w - m) / PHONE_W, (h - m) / PHONE_H)));
    };
    fit();window.addEventListener('resize', fit);return () => window.removeEventListener('resize', fit);
  }, []);

  const returnRef = React.useRef(null);
  const go = (name, p) => {
    const cur = stack.length ? stack[stack.length - 1] : root;
    if (name === 'chat') { if (cur !== 'chat') returnRef.current = { root, stack: [...stack], param }; }
    else { returnRef.current = null; }
    if (ROOTS.includes(name)) {setRoot(name);setStack([]);setParam(null);} else
    {setParam(p || null);setStack((s) => [...s, name]);}
  };
  const back = () => {
    const r = returnRef.current;
    if (r) { returnRef.current = null; setRoot(r.root); setStack(r.stack); setParam(r.param); return; }
    if (stack.length) { setStack((s) => s.slice(0, -1)); return; }
    if (root !== 'home') setRoot('home');
  };

  // debug nav for spec capture
  useE(() => {
    window.__sb = {
      jump: (name, p) => {
        if (ROOTS.includes(name)) {setRoot(name);setStack([]);setParam(null);} else
        {setParam(p || null);setStack([name]);}
      },
      overlay: (which) => {
        setOnboarded(which !== 'onboard');
        setCoachDone(which !== 'onboard' && which !== 'coach');
        setRoot('home');setStack([]);
      }
    };
  }, []);

  const showToast = (tt) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(tt);
    toastRef.current = setTimeout(() => setToast(null), 5200);
  };
  const startJob = (label, opts = {}) => {
    if (jobRef.current) clearInterval(jobRef.current);
    setJob({ label, pct: 4 });
    jobRef.current = setInterval(() => {
      setJob((j) => {
        if (!j) return j;
        const pct = j.pct + 7 + Math.random() * 11;
        if (pct >= 100) {
          clearInterval(jobRef.current);jobRef.current = null;
          setTimeout(() => {setJob(null);showToast({ msg: opts.doneMsg || '분석이 끝났어요', action: opts.action, goTo: opts.goTo });}, 420);
          return { ...j, pct: 100 };
        }
        return { ...j, pct };
      });
    }, 300);
  };

  const current = stack.length ? stack[stack.length - 1] : root;
  const isHome = current === 'home';
  const isSub = !ROOTS.includes(current);
  const immersive = isHome || current === 'records' || current === 'esm' || current === 'capture-full' || current === 'import-hub' ||
    current === 'wiki' || current === 'srs' || current === 'review' || current === 'digest-today' || current === 'career' || current === 'peer-invites' ||
    current === 'community' || current === 'account' ||
    COMPARE_ROUTES.includes(current);
  /* 감사 회신 §4 — career는 도메인 렌즈 성격이므로 museumLike로 재분류 */
  const museumLike = current === 'museum' || current === 'star' || current === 'rest' || current === 'people';
  const gate = GATE_ROUTES.includes(current); /* 로그인 게이트 — 창·앱바·탭바 없이 전체화면 */
  const windowed = !immersive && !museumLike && !gate;

  const t = {
    headScale: tw.headScale, expression: EXPR[tw.expression] || 'neutral', bubbleText: tw.bubbleText,
    starLevel: tw.starLevel, motion: tw.motion, homeVariant: tw.homeVariant,
    chatVariant: tw.chatVariant, captureVariant: tw.captureVariant, dataState: tw.dataState
  };
  const env = {
    dark: tw.dark, setDark: (v) => setTweak('dark', v),
    palette: tw.paletteName, setPalette: (v) => setTweak('paletteName', v),
    dataState: tw.dataState, setDataState: (v) => setTweak('dataState', v),
    features, setFeature: (k, v) => setFeatures((s) => ({ ...s, [k]: v })),
    connections, setConnection: (k, v) => setConnections((s) => ({ ...s, [k]: v })),
    graphLabels, setGraphLabel: (k, v) => setGraphLabels((s) => ({ ...s, [k]: v })),
    resetGuide,
    logout: () => {setRoot('home');setStack(['auth']);setParam(null);},
    startJob, showToast,
    openNotice: (idx, pager) => setNoticeView({ idx, pager: !!pager }),
    openCrisis: (opts) => setCrisisView({ locale: (opts && opts.locale) || 'ko', minor: !!(opts && opts.minor) }),
    openSheet: (node) => setSheet(node), closeSheet: () => setSheet(null)
  };
  const C = window.SB.C;
  const showCompanion = current === 'records';   /* 담기 화면에서는 세컨비를 띄우지 않는다 */

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--c00)', overflow: 'hidden' }}>
      <div data-phone-frame style={{ position: 'absolute', left: '50%', top: '50%', width: PHONE_W, height: PHONE_H,
        transform: `translate(-50%,-50%) scale(${scale})`, transformOrigin: 'center',
        padding: 4, background: 'var(--c01)', flex: '0 0 auto',
        boxShadow: '0 0 0 4px var(--c02), 0 0 0 8px var(--c00), 0 0 0 9px var(--c02)' }}>
        <div data-screen-label={isHome ? '홈 · 별자리' : TITLES[current] || current}
        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', isolation: 'isolate',
          background: tw.dark ? 'var(--ds-space)' : C('surface'), color: C('on-surface'), display: 'flex', flexDirection: 'column' }}>

          {tw.dark &&
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
            <SbStarfieldMemo />
          </div>}

          <div style={{ position: immersive || museumLike || gate ? 'absolute' : 'relative', top: 0, left: 0, right: 0, zIndex: 8 }}>
            <StatusBar onHome={immersive || museumLike || gate} />
          </div>

          {isHome && !gate &&
          <button onClick={() => go('inbox')} className="md-interactive" data-home-chrome aria-label="알림"
          style={{ position: 'absolute', top: 48, left: 16, zIndex: 8, width: 40, height: 40,
            border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: 'var(--panel)', boxShadow: 'var(--ds-edge)', color: 'var(--c05)' }}>
              <span className="md-state" />
              <Icon name="notifications" size={18} />
              <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, background: 'var(--ds-ember)' }} />
            </button>
          }

          {/* 홈 공지 버튼 — 확성기 + 안읽음 점 (신기능 B 진입 2) */}
          {isHome && !gate &&
          <button onClick={() => setNoticeView({ idx: 0, pager: false })} className="md-interactive" data-home-chrome aria-label="공지사항"
          style={{ position: 'absolute', top: 48, right: 16, zIndex: 8, width: 40, height: 40,
            border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: 'var(--panel)', boxShadow: 'var(--ds-edge)', color: 'var(--c05)' }}>
              <span className="md-state" />
              <Icon name="campaign" size={18} />
              {window.SBNotices && window.SBNotices.unread() > 0 &&
              <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, background: 'var(--ds-core)' }} />}
            </button>
          }

          {/* 뮤지엄 코너 버튼 — 별자리 7번째 슬롯이 커뮤니티로 바뀌면서 홈 코너로 이동 */}
          {isHome && !gate &&
          <button onClick={() => go('museum')} className="md-interactive" data-home-chrome aria-label="AI 뮤지엄"
          style={{ position: 'absolute', top: 96, left: 16, zIndex: 8, width: 40, height: 40,
            border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: 'var(--panel)', boxShadow: 'var(--ds-edge)', color: 'var(--c05)' }}>
              <span className="md-state" />
              <Icon name="auto_stories" size={18} />
            </button>
          }

          {/* 더보기 — 주제별 시트로 전 화면 진입 */}
          {isHome && !gate &&
          <button onClick={() => setMoreSheet(true)} className="md-interactive" data-home-chrome aria-label="더보기"
          style={{ position: 'absolute', top: 96, right: 16, zIndex: 8, width: 40, height: 40,
            border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: 'var(--panel)', boxShadow: 'var(--ds-edge)', color: 'var(--c05)' }}>
              <span className="md-state" />
              <Icon name="apps" size={18} />
            </button>
          }

          {gate &&
          <div style={{ position: 'relative', zIndex: 9, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
            <ScreenBody name={current} t={t} go={go} param={param} env={env} onBack={back} active />
          </div>}

          {/* 위키 — 그래프가 화면을 다 쓰도록 대화창을 하단(탭바 위)으로 내린다 */}
          {!gate && showCompanion && current === 'records' &&
          <div style={{ position: 'absolute', bottom: 84, left: 0, right: 0, zIndex: 6, pointerEvents: 'none' }}>
            <Companion screen={current} expression={t.expression} dataState={t.dataState} go={go} env={env} />
          </div>}

          {!gate && (windowed ?
          <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', padding: '12px 12px 14px' }}>
            {/* 배경은 pixel-deepspace.css 의 [data-window].ds-window 가 정한다 — 인라인으로 덮으면 창이 사라진다 */}
            <div data-window className="ds-window" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {showCompanion ?
              <Companion screen={current} expression={t.expression} dataState={t.dataState} go={go} env={env} /> :
              isSub && current !== 'star' && current !== 'reasoning' ? <TopAppBar title={TITLES[current] || current} onBack={back} /> : null}
              <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
                <ScreenBody name={current} t={t} go={go} param={param} env={env} onBack={back} active />
              </div>
            </div>
          </div> :

          <React.Fragment>
            <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: immersive || museumLike ? 'hidden' : 'auto',
              '--sb-lens-top': museumLike ? '116px' : '4px' }}>
              <ScreenBody name={current} t={t} go={go} param={param} env={env} onBack={back} active />
            </div>
            {museumLike &&
            <div className="ds-topscrim" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 7, pointerEvents: 'none', paddingTop: 34,
              background: tw.dark ? 'var(--ds-space)' : C('surface') }}>
              <div style={{ pointerEvents: 'auto' }}><TopAppBar title={current === 'star' ? param && param.domain || window.SB.STARS && window.SB.STARS[1] && window.SB.STARS[1].domain || '별' : TITLES[current] || current} onBack={back} action={current === 'star' && window.SB.StarGauge ? React.createElement(window.SB.StarGauge, { level: param && param.level || 1, related: (window.DOMAIN_META && param && window.DOMAIN_META[param.id] || {}).related, C }) : null} /></div>
            </div>}
          </React.Fragment>)}

          {!gate && <NavBar active={ROOTS.includes(current) ? current : root} onNav={go} />}

          {job && <AnalysisDock job={job} />}
          {toast && <Toast toast={toast} onAction={() => {setToast(null);if (toast.goTo) go(toast.goTo);}} onClose={() => setToast(null)} />}
          {sheet && <MdBottomSheet open onClose={() => setSheet(null)}>{sheet}</MdBottomSheet>}

          {/* 더보기 시트 — 오늘의 정리 고정 + 주제별 섹션 */}
          {moreSheet && window.MoreSheet &&
          <MdBottomSheet open onClose={() => setMoreSheet(false)}>
            <window.MoreSheet go={(r, p) => { setMoreSheet(false); go(r, p); }} />
          </MdBottomSheet>}

          {/* 위기 라우팅 — 셸 최상위. 상태바·독까지 완전히 덮는다 */}
          {crisisView && window.CrisisRouter &&
          <window.CrisisRouter locale={crisisView.locale} minor={crisisView.minor} onClose={() => setCrisisView(null)} />}

          {/* 공지 팝업 (신기능 B) */}
          {noticeView && window.SB.NOTICES && window.NoticeDialog &&
          <window.NoticeDialog notice={{ ...window.SB.NOTICES[noticeView.idx], latest: noticeView.idx === 0 }}
          index={noticeView.idx} total={window.SB.NOTICES.length} pager={noticeView.pager}
          onPrev={() => setNoticeView((v) => ({ ...v, idx: Math.max(0, v.idx - 1) }))}
          onNext={() => setNoticeView((v) => ({ ...v, idx: Math.min(window.SB.NOTICES.length - 1, v.idx + 1) }))}
          onList={() => {window.SBNotices.markRead(window.SB.NOTICES[noticeView.idx].id);setNoticeView(null);go('notices');}}
          onConfirm={() => {window.SBNotices.markRead(window.SB.NOTICES[noticeView.idx].id);setNoticeView(null);}} />}

          {!onboarded && <OnboardingScreen onDone={finishOnboard} />}
          {onboarded && !coachDone && isHome && <Coachmark onDone={finishCoach} />}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="세컨비" />
        <TweakSlider label="머리 크기" value={tw.headScale} min={0.7} max={1.4} step={0.05} unit="×" onChange={(v) => setTweak('headScale', v)} />
        <TweakRadio label="표정" value={tw.expression} options={['긍정', '중립', '부정']} onChange={(v) => setTweak('expression', v)} />
        <TweakText label="말풍선 (홈)" value={tw.bubbleText} placeholder="비우면 기본 인사" onChange={(v) => setTweak('bubbleText', v)} />

        <TweakSection label="테마" />
        <TweakRadio label="팔레트" value={tw.paletteName} options={['미드나잇', '신스웨이브']} onChange={(v) => setTweak('paletteName', v)} />
        <TweakToggle label="다크 모드" value={tw.dark} onChange={(v) => setTweak('dark', v)} />

        <TweakSection label="별 · 모션" />
        <TweakSlider label="별 밝기 (L)" value={tw.starLevel} min={1} max={5} step={1} onChange={(v) => setTweak('starLevel', v)} />
        <TweakSlider label="모션 강도" value={tw.motion} min={0} max={100} unit="%" onChange={(v) => setTweak('motion', v)} />

        <TweakSection label="앱 공통 상태 · 어디서나" />
        <TweakRadio label="공통" value={tw.dataState} options={['로딩', '오류', '오프라인']} onChange={(v) => setTweak('dataState', v)} />

        <TweakSection label="위키 콘텐츠 · 채움은 별자리 그래프" />
        <TweakRadio label="콘텐츠" value={tw.dataState} options={['채움', '빈']} onChange={(v) => setTweak('dataState', v)} />
      </TweaksPanel>
    </div>);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
