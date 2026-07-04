/* ============================================================
   2nd-Brain · App shell (phone frame · companion header · M3 nav · router · tweaks)
   Mounts the app. Loaded last.
   ============================================================ */
const { useState: useS, useRef: useR, useEffect: useE } = React;

const PHONE_W = 390,PHONE_H = 820;
const ROOTS = ['home', 'capture', 'chat', 'records', 'settings'];
const TITLES = { me: '북극성', record: '별가루 상세', interview: '심층 인터뷰', bigfive: '검증 · Big Five', audit: '성장 · 과거의 나',
  star: '별', iden: 'IDEN · 포터블 정체성', connect: '데이터 연동', plans: '요금제', museum: 'AI 뮤지엄', exhibit: 'AI 뮤지엄',
  callrec: '통화 녹음', attachment: '애착 유형', northstar: '북극성 문장', inbox: '알림', values: '가치관', ratify: '승인 이력',
  trend: '밝기 변화', motivation: '동기', strengths: '강점', widget: '앱 밖에서', auth: '로그인', ops: '오늘의 비서',
  focus: '일일 집중', reminders: '예약 리마인더', import: '외부 가져오기', datareview: '내 데이터 리뷰', share: '공유 카드', imagine: '공상하기',
  peer: '보여지는 나', triage: '정리함', research: '연결 찾기', pwreset: '비밀번호 재설정', profilesetup: '프로필 완성',
  journal: '저널', reward: '담기 가속', digest: '주간 다이제스트',
  'audit-full': '라이프 오딧', domains: '내 영역', lifeinput: '영역 기록', hobbyinput: '취미·여가 기록', healthinput: '건강 기록', careerinput: '성과 입력', drilldown: 'Drill Down', healthdata: '건강 데이터 항목',
  relcontacts: '주소록', relperson: '사람 기록',
  dobgate: '생년월일 확인', permissions: '권한 관리', privacy: '개인정보 · 약관', support: '지원 · 공지', manual: '사용 매뉴얼' };

/* ---- shared constellation wallpaper (common backdrop behind every screen) ---- */
const SB_SKY = { w: 390, h: 820 };
const SB_COSMIC = 'radial-gradient(122% 72% at 50% -6%, rgba(40,86,150,.34), transparent 60%), radial-gradient(86% 54% at 86% 12%, rgba(120,96,210,.20), transparent 58%), #060912';
function sbSkyRng(seed) {let s = seed >>> 0;return () => {s = s * 1664525 + 1013904223 >>> 0;return s / 4294967296;};}
const SB_SKY_STARS = (() => {
  const r = sbSkyRng(70730219),cols = ['#CFE0FF', '#CFE0FF', '#C9BEFF', '#FFFFFF'],out = [];
  for (let i = 0; i < 96; i++) out.push({
    x: +(r() * SB_SKY.w).toFixed(1), y: +(r() * SB_SKY.h).toFixed(1),
    r: +(0.6 + r() * 1.7).toFixed(2), o: +(0.28 + r() * 0.62).toFixed(2),
    tw: r() < 0.3, dly: +(r() * 4.6).toFixed(2), c: cols[r() * cols.length | 0]
  });
  return out;
})();
const SB_SKY_CONST = [
{ c: '#5B9DFF', o: 0.5, pts: [[40, 120], [86, 150], [120, 118], [168, 160], [120, 118], [104, 206]] },
{ c: '#9A86FF', o: 0.42, pts: [[300, 92], [342, 134], [316, 196], [268, 166], [342, 134], [372, 108]] },
{ c: '#7FA8FF', o: 0.4, pts: [[58, 642], [112, 612], [150, 662], [212, 628]] },
{ c: '#8FB6FF', o: 0.34, pts: [[252, 470], [300, 500], [286, 558], [332, 540]] }];

function SbStarfield() {
  return (
    <svg viewBox={`0 0 ${SB_SKY.w} ${SB_SKY.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <style>{`@keyframes sbsky-tw{0%,100%{opacity:.28}50%{opacity:.95}}.sbsky-tw{animation:sbsky-tw 4.6s ease-in-out infinite}`}</style>
      {SB_SKY_CONST.map((cn, i) =>
      <g key={i} opacity={cn.o}>
          <polyline points={cn.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={cn.c} strokeOpacity="0.32" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          {cn.pts.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r="1.4" fill={cn.c} opacity="0.8" />)}
        </g>
      )}
      {SB_SKY_STARS.map((s, i) =>
      <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.c}
      opacity={s.tw ? undefined : s.o} className={s.tw ? 'sbsky-tw' : undefined}
      style={s.tw ? { animationDelay: s.dly + 's' } : undefined} />
      )}
    </svg>);

}
const SbStarfieldMemo = React.memo(SbStarfield);

/* ---- Status bar (live time, no hardcoded 9:41) ---- */
function StatusBar({ onHome }) {
  const C = window.SB.C;
  const [now, setNow] = useS(new Date());
  useE(() => {const id = setInterval(() => setNow(new Date()), 20000);return () => clearInterval(id);}, []);
  const hh = now.getHours(),mm = String(now.getMinutes()).padStart(2, '0');
  const onDark = onHome ? '#CCFAFF' : C('on-surface');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 22px 6px',
      fontSize: 14, fontWeight: 600, color: onDark, fontFamily: 'var(--md-ref-typeface-plain)' }}>
      <span>{hh}:{mm}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="signal_cellular_alt" size={17} />
        <Icon name="wifi" size={17} />
        <Icon name="battery_full" size={17} />
      </div>
    </div>);

}

/* ---- Companion header (small head + speech bubble; no tracking) ---- */
function Companion({ screen, expression, dataState }) {
  const C = window.SB.C;
  const OBS = window.SB.OBSERVATIONS;
  const empty = screen === 'records' && dataState === '빈';
  const off = screen === 'records' && dataState === '오프라인';
  const override = empty ?
  { star: '담아내기', mood: 'neutral', t: '아직 담은 별가루이 없어요. 첫 한 줄을 담아볼까요?' } :
  off ?
  { star: '동기화', mood: 'neutral', t: '오프라인이에요. 담은 건 저장됐다가 연결되면 자동으로 동기화돼요.' } :
  null;

  // cycle observations in constellation order, ~10s each (paused while an override is showing)
  const [idx, setIdx] = React.useState(0);
  const [shown, setShown] = React.useState(true);
  React.useEffect(() => {
    if (override) return;
    const t = setInterval(() => {
      setShown(false); // fade out
      setTimeout(() => {setIdx((i) => (i + 1) % OBS.length);setShown(true);}, 360);
    }, 10000);
    return () => clearInterval(t);
  }, [override, OBS.length]);

  const obs = override || OBS[idx];
  const mood = expression || obs.mood;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 12px' }}>
      <div style={{ flex: '0 0 auto', animation: 'sb-bob 4s ease-in-out infinite' }}>
        <window.SbHead size={48} expression={mood} track tilt />
      </div>
      <div style={{ flex: 1, position: 'relative', background: C('surface-container-high'), borderRadius: '4px 14px 14px 14px', padding: '10px 14px' }}>
        <span style={{ position: 'absolute', left: -5, top: '50%', width: 9, height: 9, background: C('surface-container-high'),
          borderLeft: `0`, transform: 'translateY(-50%) rotate(45deg)' }} />
        <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(3px)', transition: 'opacity .35s ease, transform .35s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Icon name="star_shine" fill size={12} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: C('tertiary') }}>{obs.star}</span>
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{obs.t}</div>
        </div>
      </div>
    </div>);

}

/* ---- M3 top app bar (for sub-screens) ---- */
function TopAppBar({ title, onBack, action }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px 6px 4px', height: 56 }}>
      <MdIconButton name="arrow_back" onClick={onBack} />
      <span className="md-title-large" style={{ color: C('on-surface'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      {action && <div style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'flex', alignItems: 'center', paddingRight: 4 }}>{action}</div>}
    </div>);

}

/* ---- M3 navigation bar ---- */
function NavBar({ active, onNav }) {
  const C = window.SB.C;
  return (
    <div style={{ display: 'flex', height: 80, paddingTop: 12, background: C('surface-container'),
      borderTop: `1px solid ${C('surface-variant')}` }}>
      {window.SB.NAV.map((n) => {
        const on = active === n.id;
        return (
          <button key={n.id} onClick={() => onNav(n.id)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div className="md-interactive" style={{ position: 'relative', width: 64, height: 32, borderRadius: 9999,
              display: 'grid', placeItems: 'center', background: on ? C('secondary-container') : 'transparent',
              transition: 'background .2s' }}>
              <span className="md-state" />
              <Icon name={n.icon} fill={on} size={24} style={{ color: on ? C('on-secondary-container') : C('on-surface-variant') }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 500, color: on ? C('on-surface') : C('on-surface-variant') }}>{n.label}</span>
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
    case 'museum':return <MuseumScreen t={t} go={go} />;
    case 'exhibit':return <MuseumDeck t={t} go={go} param={param} />;
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
    case 'triage':return <TriageScreen t={t} go={go} />;
    case 'research':return <ResearchScreen t={t} go={go} />;
    case 'pwreset':return <PwResetScreen t={t} go={go} />;
    case 'profilesetup':return <ProfileSetupScreen t={t} go={go} />;
    case 'dobgate':return <DobGateScreen t={t} go={go} />;
    case 'permissions':return <PermissionsScreen t={t} go={go} />;
    case 'privacy':return <PrivacyScreen t={t} go={go} />;
    case 'support':return <SupportScreen t={t} go={go} />;
    case 'audit-full':return <LifeAuditScreen t={t} go={go} />;
    case 'domains':return <DomainDashScreen t={t} go={go} />;
    case 'lifeinput':return <DomainInputScreen t={t} go={go} param={param} />;
    case 'hobbyinput':return <HobbyInputScreen t={t} go={go} param={param} />;
    case 'healthinput':return <HealthInputScreen t={t} go={go} param={param} />;
    case 'careerinput':return <CareerInputScreen t={t} go={go} param={param} />;
    case 'drilldown':return <DrillDownScreen t={t} go={go} param={param} />;
    case 'relcontacts':return <RelContactsScreen t={t} go={go} param={param} />;
    case 'relperson':return <RelPersonScreen t={t} go={go} param={param} />;
    case 'healthdata':return <HealthDataScreen t={t} go={go} />;
    case 'manual':return <ManualScreen t={t} go={go} />;
    case 'journal':return <JournalScreen t={t} go={go} />;
    case 'reward':return <RewardScreen t={t} go={go} />;
    case 'digest':return <DigestScreen t={t} go={go} />;
    default:return null;
  }
}

const EXPR = { '긍정': 'positive', '중립': 'neutral', '부정': 'negative' };
const PAL = { '시안': 'cyan', '바이올렛': 'violet' };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "headScale": 1,
  "expression": "중립",
  "bubbleText": "",
  "paletteName": "시안",
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
  const [root, setRoot] = useS('home');
  const [stack, setStack] = useS([]);
  const [param, setParam] = useS(null);
  const [scale, setScale] = useS(1);
  const [job, setJob] = useS(null);
  const [toast, setToast] = useS(null);
  const [sheet, setSheet] = useS(null);
  const jobRef = useR(null);
  const toastRef = useR(null);
  const [ttfvDone, setTtfv] = useS(() => {try {return localStorage.getItem('sb_ttfv') === '1';} catch (e) {return false;}});
  const [features, setFeatures] = useS({ autotag: true, notify: false, applock: false, ondevice: true, callrec: false, captureFree: false });
  const [connections, setConnections] = useS({ cal: false, health: true, notion: false });
  const [graphLabels, setGraphLabels] = useS(() => {try {const s = JSON.parse(localStorage.getItem('sb_graphlabels'));return s && s.mode ? s : { mode: 'zoom', threshold: 0.9 };} catch (e) {return { mode: 'zoom', threshold: 0.9 };}});
  useE(() => {try {localStorage.setItem('sb_graphlabels', JSON.stringify(graphLabels));} catch (e) {}}, [graphLabels]);
  const [onboarded, setOnboarded] = useS(() => {try {return localStorage.getItem('sb_onboarded') === '1';} catch (e) {return false;}});
  const [coachDone, setCoachDone] = useS(() => {try {return localStorage.getItem('sb_coach') === '1';} catch (e) {return false;}});
  const finishOnboard = () => {try {localStorage.setItem('sb_onboarded', '1');} catch (e) {}setRoot('home');setStack([]);setOnboarded(true);};
  const finishCoach = () => {try {localStorage.setItem('sb_coach', '1');} catch (e) {}setCoachDone(true);};
  const finishTtfv = () => {try {localStorage.setItem('sb_ttfv', '1');} catch (e) {}setTtfv(true);};
  const resetGuide = () => {try {localStorage.removeItem('sb_onboarded');localStorage.removeItem('sb_coach');localStorage.removeItem('sb_ttfv');} catch (e) {}setRoot('home');setStack([]);setOnboarded(false);setCoachDone(false);setTtfv(false);};

  // apply palette + mode to <html>
  useE(() => {
    const el = document.documentElement;
    el.setAttribute('data-palette', PAL[tw.paletteName] || 'cyan');
    el.setAttribute('data-theme', tw.dark ? 'dark' : 'light');
  }, [tw.paletteName, tw.dark]);

  // persist route
  useE(() => {
    try {
      const s = localStorage.getItem('sb_route');
      if (s) {const o = JSON.parse(s);if (o.root) setRoot(o.root);if (o.stack) setStack(o.stack);}
    } catch (e) {}
  }, []);
  useE(() => {try {localStorage.setItem('sb_route', JSON.stringify({ root, stack }));} catch (e) {}}, [root, stack]);

  // scale phone to fit
  useE(() => {
    const fit = () => {
      const m = 24,w = window.innerWidth,h = window.innerHeight;
      // guard against 0-width / constrained mount (embeds, hidden tab, export iframe):
      // retry next frame instead of computing a negative scale.
      if (w <= m || h <= m) {requestAnimationFrame(fit);return;}
      setScale(Math.max(0.2, Math.min(1, (w - m) / PHONE_W, (h - m) / PHONE_H)));
    };
    fit();window.addEventListener('resize', fit);return () => window.removeEventListener('resize', fit);
  }, []);

  const returnRef = React.useRef(null);
  const go = (name, p) => {
    const cur = stack.length ? stack[stack.length - 1] : root;
    // 'chat'으로 진입할 때 어디서 왔는지 기억 → 세컨비 화면의 뒤로가기로 복귀
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

  // debug nav for spec capture (state-only, non-persistent — reload reverts to localStorage)
  useE(() => {
    window.__sb = {
      jump: (name, p) => {
        if (ROOTS.includes(name)) {setRoot(name);setStack([]);setParam(null);} else
        {setParam(p || null);setStack([name]);}
      },
      overlay: (which) => {
        setOnboarded(which !== 'onboard');
        setTtfv(which !== 'onboard' && which !== 'ttfv');
        setCoachDone(which !== 'onboard' && which !== 'ttfv' && which !== 'coach');
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
  const immersive = isHome || current === 'records'; // full-bleed graph screen
  const museumLike = current === 'museum' || current === 'exhibit' || current === 'star'; // full-bleed cosmic; bars float over its OWN starfield so the background is continuous
  const windowed = !immersive && !museumLike; // every non-immersive screen floats as a window over the shared sky

  // mapped tweaks for screens
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
    startJob, showToast,
    openSheet: (node) => setSheet(node), closeSheet: () => setSheet(null)
  };
  const C = window.SB.C;
  const showCompanion = ['capture', 'chat', 'records'].includes(current);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'radial-gradient(120% 90% at 50% 0%, #11151c, #05070b 70%)', overflow: 'hidden' }}>
      <div data-phone-frame style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})`, transformOrigin: 'center',
        borderRadius: 44, padding: 5, background: '#05070b', boxShadow: '0 0 0 8px #14181f, 0 40px 90px rgba(0,0,0,.6)', flex: '0 0 auto' }}>
        <div data-screen-label={isHome ? '홈 · 별자리' : TITLES[current] || current}
        style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 40, overflow: 'hidden', isolation: 'isolate',
          background: tw.dark ? SB_COSMIC : C('surface'), color: C('on-surface'), display: 'flex', flexDirection: 'column' }}>

          {/* shared constellation wallpaper · sits behind every screen (immersive screens paint their own field on top) */}
          {tw.dark &&
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
            <SbStarfieldMemo />
          </div>}

          {/* status bar (overlays the museum's own starfield so it reads as one continuous sky) */}
          <div style={{ position: immersive || museumLike ? 'absolute' : 'relative', top: 0, left: 0, right: 0, zIndex: 8 }}>
            <StatusBar onHome={immersive || museumLike} />
          </div>

          {/* home inbox bell */}
          {isHome &&
          <button onClick={() => go('inbox')} className="md-interactive"
          style={{ position: 'absolute', top: 48, left: 16, zIndex: 8, width: 40, height: 40, borderRadius: 9999,
            border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: 'rgba(20,30,52,.7)', color: '#CFE6FF' }}>
              <span className="md-state" />
              <Icon name="notifications" size={20} />
              <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: '50%', background: '#FF8A5B', boxShadow: '0 0 6px #FF8A5B' }} />
            </button>
          }

          {/* companion robot · records keeps it as a floating overlay; capture/chat get it inside their window */}
          {showCompanion && current === 'records' &&
          <div style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 6, pointerEvents: 'none' }}><Companion screen={current} expression={t.expression} dataState={t.dataState} /></div>}

          {windowed ?
          /* every non-immersive screen floats as a window over the shared constellation sky */
          <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', padding: '12px 12px 14px' }}>
            <div data-window style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 24, overflow: 'hidden',
              background: C('surface'), boxShadow: '0 20px 52px rgba(0,0,0,.5), 0 0 0 1px rgba(150,180,230,.16)' }}>
              {showCompanion ?
              <Companion screen={current} expression={t.expression} dataState={t.dataState} /> :
              isSub && current !== 'star' ? <TopAppBar title={TITLES[current] || current} onBack={back} /> : null}
              <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
                <ScreenBody name={current} t={t} go={go} param={param} env={env} onBack={back} active />
              </div>
            </div>
          </div> :

          <React.Fragment>
            {/* full-bleed screens (home / records / museum / exhibit) */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: immersive || museumLike ? 'hidden' : 'auto' }}>
              <ScreenBody name={current} t={t} go={go} param={param} env={env} onBack={back} active />
            </div>
            {/* museum/exhibit/star: a single top scrim spans from y=0 (behind the status bar) through the title, so the sky reads as one continuous wash with no step at the status-bar edge. Sits below the status bar (z7 < z8) so the time/icons stay crisp. */}
            {museumLike &&
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 7, pointerEvents: 'none', paddingTop: 34,
              background: tw.dark ? 'rgba(8,11,20,.9)' : 'rgba(255,255,255,.92)',
              backdropFilter: 'blur(16px) saturate(120%)', WebkitBackdropFilter: 'blur(16px) saturate(120%)',
              borderBottom: `1px solid ${C('outline-variant')}`, boxShadow: '0 6px 18px rgba(0,0,0,.28)' }}>
              <div style={{ pointerEvents: 'auto' }}><TopAppBar title={current === 'star' ? param && param.domain || window.SB.STARS && window.SB.STARS[1] && window.SB.STARS[1].domain || '별' : TITLES[current] || current} onBack={back} action={current === 'star' && window.SB.StarGauge ? React.createElement(window.SB.StarGauge, { level: param && param.level || 1, related: (window.DOMAIN_META && param && window.DOMAIN_META[param.id] || {}).related, C }) : null} /></div>
            </div>}
          </React.Fragment>}

          {/* bottom nav */}
          <NavBar active={ROOTS.includes(current) ? current : root} onNav={go} />

          {/* non-blocking analysis dock · toast · bottom sheet (불변식 #6) */}
          {job && <AnalysisDock job={job} />}
          {toast && <Toast toast={toast} onAction={() => {setToast(null);if (toast.goTo) go(toast.goTo);}} onClose={() => setToast(null)} />}
          {sheet && <MdBottomSheet open onClose={() => setSheet(null)}>{sheet}</MdBottomSheet>}

          {/* onboarding → first-insight(TTFV) → coachmark → home */}
          {!onboarded && <OnboardingScreen onDone={finishOnboard} />}
          {onboarded && !ttfvDone && <FirstInsight onDone={finishTtfv} />}
          {onboarded && ttfvDone && !coachDone && isHome && <Coachmark onDone={finishCoach} />}
        </div>
      </div>

      {/* TWEAKS */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="세컨비" />
        <TweakSlider label="머리 크기" value={tw.headScale} min={0.7} max={1.4} step={0.05} unit="×" onChange={(v) => setTweak('headScale', v)} />
        <TweakRadio label="표정" value={tw.expression} options={['긍정', '중립', '부정']} onChange={(v) => setTweak('expression', v)} />
        <TweakText label="말풍선 (홈)" value={tw.bubbleText} placeholder="비우면 기본 인사" onChange={(v) => setTweak('bubbleText', v)} />

        <TweakSection label="테마" />
        <TweakRadio label="컬러" value={tw.paletteName} options={['시안', '바이올렛']} onChange={(v) => setTweak('paletteName', v)} />
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