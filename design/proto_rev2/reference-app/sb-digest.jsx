/* ============================================================
   2nd-Brain · 저널 · 리워드 광고(opt-in) · 주간 다이제스트
   - JournalScreen : 시계열 일지 — 담은 별가루/대화를 날짜별로 흐르듯
   - RewardScreen  : 리워드 광고 opt-in — 횟수만 획득(품질 불변), 다크패턴 0
   - DigestScreen  : 주간 다이제스트 — 서사형 요약 + 트렌드 감지(propose→ratify)
   Export: window.JournalScreen, window.RewardScreen, window.DigestScreen
   ============================================================ */
const { useState: useDs, useEffect: useDe, useRef: useDr } = React;

/* ===================== 저널 (시계열 일지) ===================== */
function JournalScreen({ t, go }) {
  const C = window.SB.C;
  const [filter, setFilter] = useDs('전체');

  // day-grouped diary entries. mood: 0 dim → 1 bright
  const DAYS = [
    { date: '6월 24일', wd: '화', mood: 0.72, items: [
      { time: '오후 9:14', type: 'voice', icon: 'mic', dom: '휴식', tone: 'tertiary',
        text: '산책하며 떠오른 생각 — 혼자 걷는 시간이 제일 정리가 잘 된다.' },
      { time: '오후 3:02', type: 'link', icon: 'link', dom: '성장', tone: 'primary',
        text: '담아둔 아티클: 몰입과 회복의 균형에 대해' },
      { time: '오전 8:40', type: 'text', icon: 'edit_note', dom: '건강', tone: 'secondary',
        text: '어제 6시간 반 잤는데 컨디션은 의외로 괜찮음.' },
    ] },
    { date: '6월 23일', wd: '월', mood: 0.48, items: [
      { time: '오후 7:55', type: 'chat', icon: 'auto_awesome', dom: '관계', tone: 'primary',
        text: '세컨비와 대화: 엄마에게 먼저 전화한 일에 대해' },
      { time: '오후 1:20', type: 'text', icon: 'edit_note', dom: '커리어', tone: 'secondary',
        text: '회의에서 의견을 먼저 꺼냈다. 작지만 평소와 달랐다.' },
    ] },
    { date: '6월 21일', wd: '토', mood: 0.61, items: [
      { time: '오후 5:30', type: 'photo', icon: 'photo_camera', dom: '휴식', tone: 'tertiary',
        text: '러닝 후 한강. 오랜만에 멀리 봤다.' },
      { time: '오전 11:08', type: 'link', icon: 'link', dom: '재정', tone: 'secondary',
        text: '담아둔 링크: 30대 자산 배분 기본기' },
      { time: '오전 9:00', type: 'voice', icon: 'mic', dom: '성장', tone: 'primary',
        text: '주말 아침 음성 메모 — 이번 달 돌아보기' },
    ] },
  ];

  const FILTERS = [
    { k: '전체', icon: 'apps' }, { k: '글', icon: 'edit_note', type: 'text' },
    { k: '링크', icon: 'link', type: 'link' }, { k: '음성', icon: 'mic', type: 'voice' },
    { k: '대화', icon: 'auto_awesome', type: 'chat' },
  ];
  const match = (it) => filter === '전체' || FILTERS.find(f => f.k === filter)?.type === it.type;
  const days = DAYS.map(d => ({ ...d, items: d.items.filter(match) })).filter(d => d.items.length);

  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '6px 0 2px' }}>
        <div style={{ flex: 1 }}>
          <div className="md-headline-small" style={{ color: C('on-surface'), fontWeight: 700 }}>저널</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 2 }}>
            담은 것들이 하루하루 흐르는 일지예요.
          </div>
        </div>
        <MdButton variant="tonal" size="s" icon="edit" onClick={() => go('capture')}>오늘 쓰기</MdButton>
      </div>

      {/* filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0 4px', margin: '0 -16px', paddingLeft: 16, paddingRight: 16 }}>
        {FILTERS.map(f => {
          const on = filter === f.k;
          return (
            <button key={f.k} className="md-interactive" onClick={() => setFilter(f.k)}
              style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
                borderRadius: 9999, whiteSpace: 'nowrap', cursor: 'pointer',
                border: `1px solid ${on ? 'transparent' : C('outline-variant')}`,
                background: on ? C('secondary-container') : 'transparent',
                color: on ? C('on-secondary-container') : C('on-surface-variant') }}>
              <span className="md-state-layer"></span>
              <Icon name={f.icon} size={17} />
              <span className="md-label-large">{f.k}</span>
            </button>
          );
        })}
      </div>

      {/* timeline */}
      {days.length === 0 ? (
        <div style={{ textAlign: 'center', color: C('on-surface-variant'), padding: '60px 20px' }}>
          <Icon name="filter_list" size={30} />
          <div className="md-body-medium" style={{ marginTop: 10 }}>이 형식으로 담은 게 아직 없어요.</div>
        </div>
      ) : days.map((d, di) => (
        <div key={di} style={{ marginTop: 18 }}>
          {/* day header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999,
              background: `color-mix(in srgb, ${C('primary')} ${Math.round(d.mood * 100)}%, ${C('surface-variant')})` }}></span>
            <span className="md-title-small" style={{ color: C('on-surface'), fontWeight: 700 }}>{d.date}</span>
            <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{d.wd}요일 · {d.items.length}개</span>
          </div>

          {/* entries with rail */}
          <div style={{ position: 'relative', paddingLeft: 26 }}>
            <div style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, background: C('surface-variant') }}></div>
            {d.items.map((it, ii) => (
              <button key={ii} className="md-interactive" onClick={() => go('record', { title: it.text, dom: it.dom })}
                style={{ position: 'relative', display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: C('surface-container'), border: `1px solid ${C('outline-variant')}`,
                  borderRadius: 16, padding: '12px 14px', marginBottom: 10 }}>
                <span className="md-state-layer"></span>
                {/* node dot */}
                <span style={{ position: 'absolute', left: -22, top: 16, width: 12, height: 12, borderRadius: 9999,
                  background: C('surface'), border: `2px solid ${C(it.tone)}` }}></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Icon name={it.icon} size={16} style={{ color: C(it.tone) }} />
                  <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{it.time}</span>
                  <span style={{ flex: 1 }}></span>
                  <span className="md-label-small" style={{ color: C('on-surface-variant'),
                    background: C('surface-variant'), padding: '2px 8px', borderRadius: 9999 }}>{it.dom}</span>
                </div>
                <div className="md-body-medium" style={{ color: C('on-surface'), lineHeight: 1.45 }}>{it.text}</div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="md-label-medium" style={{ textAlign: 'center', color: C('on-surface-variant'), padding: '16px 0 4px' }}>
        더 이전 기록은 위키에서 볼 수 있어요
      </div>
    </ScreenPad>
  );
}

/* ===================== 리워드 광고 (opt-in) ===================== */
function RewardScreen({ t, go }) {
  const C = window.SB.C;
  const head = 'assets/deepspace/secondb-head-front.png';
  const [balance, setBalance] = useDs(() => {
    try { return parseInt(localStorage.getItem('sb.boost') || '5', 10); } catch (e) { return 5; }
  });
  const [watching, setWatching] = useDs(false);
  const [pct, setPct] = useDs(0);
  const [earned, setEarned] = useDs(false);
  const tref = useDr(null);

  const watch = () => {
    if (watching) return;
    setWatching(true); setPct(0); setEarned(false);
    tref.current = setInterval(() => {
      setPct(p => {
        if (p >= 100) {
          clearInterval(tref.current);
          setWatching(false); setEarned(true);
          setBalance(b => { const n = b + 5; try { localStorage.setItem('sb.boost', String(n)); } catch (e) {} return n; });
          return 100;
        }
        return p + 4;
      });
    }, 60);
  };
  useDe(() => () => clearInterval(tref.current), []);

  const GUARANTEES = [
    { icon: 'verified', t: '분석 품질은 그대로예요', s: '광고를 봐도 세컨비가 더 똑똑해지지 않아요. 횟수만 늘어요.' },
    { icon: 'shield', t: '민감한 화면엔 안 띄워요', s: '통화 녹음·심층 인터뷰·정체성 화면에서는 광고가 없어요.' },
    { icon: 'sentiment_satisfied', t: '안 봐도 다 쓸 수 있어요', s: '광고는 선택이에요. 핵심 기능은 광고 없이 그대로 동작해요.' },
  ];

  return (
    <ScreenPad>
      {/* hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 0 8px' }}>
        <div style={{ position: 'relative', width: 76, height: 76 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
            background: `radial-gradient(circle, ${C('primary')}33, transparent 70%)` }}></div>
          <img src={head} alt="" style={{ width: 76, height: 76, objectFit: 'contain', position: 'relative' }} />
        </div>
        <div className="md-headline-small" style={{ color: C('on-surface'), fontWeight: 700, marginTop: 8 }}>담기 가속</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 4, maxWidth: 280 }}>
          짧은 영상을 보면 오늘의 <b style={{ color: C('on-surface') }}>담기 가속</b>이 늘어나요. 분석 품질이 아니라 양이에요.
        </div>
      </div>

      {/* balance */}
      <MdCard variant="filled" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, marginTop: 8 }}>
        <Icon name="bolt" size={26} style={{ color: C('tertiary') }} />
        <div style={{ flex: 1 }}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>오늘 남은 담기 가속</div>
          <div className="md-headline-small" style={{ color: C('on-surface'), fontWeight: 700 }}>{balance}회</div>
        </div>
        {earned && (
          <span className="md-label-large" style={{ color: C('on-tertiary-container'), background: C('tertiary-container'),
            padding: '6px 12px', borderRadius: 9999, whiteSpace: 'nowrap' }}>+5 받음</span>
        )}
      </MdCard>

      {/* watch */}
      <MdCard variant="outlined" style={{ padding: 16, marginTop: 12 }}>
        {watching ? (
          <div>
            <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>영상 재생 중…</span><span>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 9999, background: C('surface-variant'), overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: C('primary'), transition: 'width .06s linear' }}></div>
            </div>
            <div className="md-label-small" style={{ color: C('on-surface-variant'), marginTop: 8 }}>건너뛰기는 보상 없이 언제든 가능해요.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="play_circle" size={28} style={{ color: C('primary') }} />
            <div style={{ flex: 1 }}>
              <div className="md-title-small" style={{ color: C('on-surface'), fontWeight: 600 }}>30초 영상 보고 +5</div>
              <div className="md-label-small" style={{ color: C('on-surface-variant') }}>하루 최대 4번까지</div>
            </div>
            <MdButton variant="filled" size="s" onClick={watch}>보기</MdButton>
          </div>
        )}
      </MdCard>

      {/* honesty guarantees */}
      <SectionLabel>광고에 대한 3가지 약속</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {GUARANTEES.map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 16,
            background: C('surface-container'), border: `1px solid ${C('outline-variant')}` }}>
            <Icon name={g.icon} size={22} style={{ color: C('primary'), flexShrink: 0, marginTop: 2 }} />
            <div>
              <div className="md-title-small" style={{ color: C('on-surface'), fontWeight: 600 }}>{g.t}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2, lineHeight: 1.45 }}>{g.s}</div>
            </div>
          </div>
        ))}
      </div>

      {/* opt-out → plans */}
      <button className="md-interactive" onClick={() => go('plans')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
          marginTop: 16, padding: '14px 16px', borderRadius: 16, background: 'transparent',
          border: `1px solid ${C('outline-variant')}`, color: C('on-surface') }}>
        <span className="md-state-layer"></span>
        <Icon name="block" size={20} style={{ color: C('on-surface-variant') }} />
        <div style={{ flex: 1 }}>
          <div className="md-title-small" style={{ fontWeight: 600 }}>광고 아예 안 보기</div>
          <div className="md-label-small" style={{ color: C('on-surface-variant') }}>플러스로 올리면 담기 가속이 늘 충분해요</div>
        </div>
        <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
      </button>
    </ScreenPad>
  );
}

/* ===================== 주간 다이제스트 ===================== */
function DigestScreen({ t, go }) {
  const C = window.SB.C;
  const [period, setPeriod] = useDs('이번 주');

  const DATA = {
    '이번 주': {
      range: '6월 23일 – 6월 29일', captured: 18, chats: 6,
      tops: [ { dom: '휴식', n: 6, tone: 'tertiary' }, { dom: '성장', n: 5, tone: 'primary' }, { dom: '건강', n: 4, tone: 'secondary' } ],
      trend: { claim: '요즘 ‘회복’과 ‘쉼’에 대한 관심이 올라온 것 같아요', conf: 64, ev: 7 },
      pattern: { claim: '몰입이 높았던 날일수록 다음 날 수면이 짧았어요', conf: 58, ev: 5 },
      next: [
        { icon: 'self_improvement', t: '쉼을 일정으로', s: '이번 주 회복 신호가 약했어요. 30분 산책을 한 칸 잡아둘까요?', route: 'reminders' },
        { icon: 'bedtime', t: '몰입 다음 날 보호', s: '집중한 날 밤은 알림을 줄여 수면을 지킬게요.', route: 'focus' },
      ],
    },
    '지난 주': {
      range: '6월 16일 – 6월 22일', captured: 14, chats: 4,
      tops: [ { dom: '커리어', n: 5, tone: 'secondary' }, { dom: '관계', n: 4, tone: 'primary' }, { dom: '재정', n: 3, tone: 'secondary' } ],
      trend: { claim: '관계에서 먼저 다가서는 시도가 늘었어요', conf: 71, ev: 6 },
      pattern: { claim: '재정 기록은 주로 주말 아침에 담았어요', conf: 52, ev: 4 },
      next: [
        { icon: 'group', t: '관계 모멘텀 잇기', s: '먼저 연락한 흐름이 좋았어요. 한 명 더 떠올려볼까요?', route: 'star' },
      ],
    },
  };
  const d = DATA[period];
  const maxN = Math.max(...d.tops.map(x => x.n));

  return (
    <ScreenPad>
      {/* period segmented */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 9999, background: C('surface-container'),
        border: `1px solid ${C('outline-variant')}`, margin: '6px 0 14px' }}>
        {['이번 주', '지난 주'].map(p => {
          const on = period === p;
          return (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ flex: 1, height: 36, borderRadius: 9999, cursor: 'pointer', border: 'none',
                background: on ? C('secondary-container') : 'transparent',
                color: on ? C('on-secondary-container') : C('on-surface-variant') }}
              className="md-label-large">{p}</button>
          );
        })}
      </div>

      {/* hero */}
      <div style={{ marginBottom: 6 }}>
        <div className="md-label-large" style={{ color: C('primary'), letterSpacing: '.04em' }}>{period}의 2ND-BRAIN</div>
        <div className="md-headline-small" style={{ color: C('on-surface'), fontWeight: 700, marginTop: 2 }}>{d.range}</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 4 }}>
          별가루 <b style={{ color: C('on-surface') }}>{d.captured}개</b> · 세컨비와 대화 <b style={{ color: C('on-surface') }}>{d.chats}번</b>
        </div>
      </div>

      {/* top domains */}
      <SectionLabel>많이 담은 영역</SectionLabel>
      <MdCard variant="filled" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {d.tops.map((x, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="md-title-small" style={{ color: C('on-surface'), fontWeight: 600 }}>{x.dom}</span>
                <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{x.n}개</span>
              </div>
              <div style={{ height: 8, borderRadius: 9999, background: C('surface-variant'), overflow: 'hidden' }}>
                <div style={{ width: Math.round((x.n / maxN) * 100) + '%', height: '100%', background: C(x.tone) }}></div>
              </div>
            </div>
          ))}
        </div>
      </MdCard>

      {/* trend detection — propose→ratify */}
      <SectionLabel>떠오른 관심</SectionLabel>
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="trending_up" size={20} style={{ color: C('tertiary') }} />
          <span className="md-label-large" style={{ color: C('on-surface-variant') }}>세컨비가 감지한 흐름</span>
        </div>
        <RatifyBlock id={'digest-trend-' + period} estimate={d.trend.claim} confidence={d.trend.conf}
          evidence={d.trend.ev} evidenceLabel="기록" onEvidence={() => go('records')} />
      </MdCard>

      {/* pattern — propose→ratify */}
      <SectionLabel>세컨비가 발견한 패턴</SectionLabel>
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="insights" size={20} style={{ color: C('primary') }} />
          <span className="md-label-large" style={{ color: C('on-surface-variant') }}>두 신호의 관계</span>
        </div>
        <RatifyBlock id={'digest-pattern-' + period} estimate={d.pattern.claim} confidence={d.pattern.conf}
          evidence={d.pattern.ev} evidenceLabel="기록" onEvidence={() => go('records')} />
      </MdCard>

      {/* next week suggestions */}
      <SectionLabel>다음 주 제안</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.next.map((n, i) => (
          <button key={i} className="md-interactive" onClick={() => go(n.route)}
            style={{ display: 'flex', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '14px', borderRadius: 16, background: C('surface-container'),
              border: `1px solid ${C('outline-variant')}`, color: C('on-surface') }}>
            <span className="md-state-layer"></span>
            <Icon name={n.icon} size={22} style={{ color: C('primary'), flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div className="md-title-small" style={{ fontWeight: 600 }}>{n.t}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2, lineHeight: 1.45 }}>{n.s}</div>
            </div>
            <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant'), flexShrink: 0 }} />
          </button>
        ))}
      </div>

      {/* footer actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <MdButton variant="tonal" icon="ios_share" full onClick={() => go('share')}>다이제스트 공유</MdButton>
        <MdButton variant="outlined" icon="notifications" full onClick={() => go('settings')}>알림 설정</MdButton>
      </div>
      <div className="md-label-small" style={{ textAlign: 'center', color: C('on-surface-variant'), padding: '14px 0 4px' }}>
        매주 월요일 아침, 비준 전 제안으로 도착해요
      </div>
    </ScreenPad>
  );
}

Object.assign(window, { JournalScreen, RewardScreen, DigestScreen });
