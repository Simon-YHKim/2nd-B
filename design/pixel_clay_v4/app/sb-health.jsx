/* =====================================================================
   건강 전용 렌즈 — 회복 대시보드
   첨부 "2nd-Brain 앱 화면 프로토타입(v2+)"의 건강 화면(TODAY·TRENDS·INSIGHTS)을
   앱의 다크 코스믹 + 시안 토큰으로 옮긴 것. 수치는 예시.
   window.SB.HealthLens 로 노출 → StarScreen 에서 health 일 때 렌더.
   ===================================================================== */
(function () {
  const useHS = React.useState;

  // Health Connect ∩ HealthKit 교집합 — 아이폰·갤럭시 양쪽에서 동일하게 읽히는 타입.
  // on: 현재 연동으로 수집 중 → 녹색 체크 / false: 연동 시 수집(아직 미수집)
  const HEALTH_TYPES = [
    { icon: 'directions_run', k: '활동 · 운동', on: true, items: ['걸음', '거리', '활동 칼로리', '총 칼로리', '층수', '운동 세션', 'VO₂max'] },
    { icon: 'monitor_weight', k: '신체 조성', src: '인바디', on: true, items: ['체중', '키', '체지방률', '제지방량', 'BMI'] },
    { icon: 'cardiology', k: '바이탈', on: true, items: ['심박수', '안정시 심박', 'HRV', '산소포화도', '호흡수', '체온', '혈압', '혈당'] },
    { icon: 'bedtime', k: '수면', on: true, items: ['수면 단계 (렘·얕은·깊은)', '수면 시간'] },
    { icon: 'restaurant', k: '영양 · 수분', on: false, items: ['섭취 칼로리', '영양소', '수분'] },
    { icon: 'self_improvement', k: '마음챙김', on: false, items: ['명상 세션'] }];

  const HEALTH_SOURCES = [
    { icon: 'monitor_heart', k: '삼성 헬스', sub: '걸음 · 수면 · 심박', on: true },
    { icon: 'favorite', k: 'Apple 건강', sub: '활동 · 바이탈', on: true },
    { icon: 'monitor_weight', k: '인바디', sub: '체성분 · 체지방', on: true },
    { icon: 'devices', k: 'Galaxy Watch', sub: '실시간 센서', on: true },
    { icon: 'fitness_center', k: 'Fitbit', sub: '아직 연결 안 됨', on: false }];

  /* 회복 링 — 번들 ringProgress */
  function RecoveryRing({ C, value = 72 }) {
    return (
      <div style={{ position: 'relative', width: 120, height: 120, flex: '0 0 auto' }}>
        <window.PxChart type="ringProgress" data={value} label={`회복 ${value}%`}
        options={{ w: 40, h: 40, scale: 3 }} style={{ minHeight: 0, width: 120, height: 120 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 30, lineHeight: 1, color: C('on-surface'), fontWeight: 700 }}>{value}</div>
            <div className="md-label-small" style={{ color: C('on-surface-variant'), letterSpacing: '.06em', marginTop: 3 }}>회복</div>
          </div>
        </div>
      </div>);

  }

  function Pill({ C, k, icon, v, unit, warn }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 0, background: C('surface-container-high'), border: `1px solid ${C('outline-variant')}` }}>
        <Icon name={icon} size={17} style={{ color: warn ? 'var(--danger)' : C('primary'), flex: '0 0 auto' }} />
        <span className="md-body-small" style={{ color: C('on-surface-variant'), flex: 1, whiteSpace: 'nowrap' }}>{k}</span>
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 15, color: warn ? 'var(--danger)' : C('on-surface'), whiteSpace: 'nowrap', fontWeight: 700 }}>
          {v}{unit && <span className="md-label-small" style={{ color: C('on-surface-variant'), fontWeight: 400 }}> {unit}</span>}
        </span>
      </div>);

  }

  function Stat({ C, icon, n, sub, k }) {
    return (
      <div style={{ textAlign: 'center', padding: '14px 8px', borderRadius: 0, background: C('surface-container-high'), border: `1px solid ${C('outline-variant')}` }}>
        <Icon name={icon} size={18} style={{ color: C('primary') }} />
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 24, lineHeight: 1.1, color: C('on-surface'), marginTop: 6, fontWeight: 700 }}>
          {n}{sub && <span style={{ fontSize: 12, fontWeight: 400 }}>{sub}</span>}
        </div>
        <div className="md-label-small" style={{ color: C('on-surface-variant'), marginTop: 4 }}>{k}</div>
      </div>);

  }

  function Tag({ C, kind, children }) {
    const map = {
      fact: { bg: C('primary'), fg: C('on-primary'), border: 'transparent' },
      link: { bg: 'transparent', fg: 'var(--ds-polaris)', border: 'var(--ds-polaris)' },
      nudge: { bg: 'transparent', fg: 'var(--warn)', border: 'var(--warn)' } };
    const s = map[kind] || map.fact;
    return (
      <span className="md-label-small" style={{ fontWeight: 700, borderRadius: 0, padding: '2px 9px', background: s.bg, color: s.fg, border: `1px solid ${s.border}`, letterSpacing: '.03em' }}>{children}</span>);

  }

  function InsightRow({ C, icon, h, s, first }) {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0', borderTop: first ? 'none' : `1px solid ${C('outline-variant')}` }}>
        <div style={{ width: 34, height: 34, borderRadius: 0, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('surface-container-highest') }}>
          <Icon name={icon} size={18} style={{ color: C('primary') }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="md-body-medium" style={{ color: C('on-surface'), fontWeight: 700, wordBreak: 'keep-all' }}>{h}</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2, wordBreak: 'keep-all' }}>{s}</div>
        </div>
      </div>);

  }

  function HealthLens({ C }) {
    // 이번 주 수면 리듬
    const days = [
    { d: '월', h: 6.5, cond: 'low' }, { d: '화', h: 7, cond: 'ok' }, { d: '수', h: 5.5, cond: 'low' },
    { d: '목', h: 7.5, cond: 'good' }, { d: '금', h: 6, cond: 'ok' }, { d: '토', h: 8.5, cond: 'good' }, { d: '일', h: 7, cond: 'ok' }];
    const condColor = { good: C('primary'), ok: C('tertiary'), low: 'var(--warn)' };
    const avg = (days.reduce((s, x) => s + x.h, 0) / days.length).toFixed(1);

    // 체지방률 12주 (예시) — 23.4 → 19.1, 목표 18
    const fat = [23.4, 23.0, 22.6, 21.8, 21.4, 20.9, 20.4, 20.0, 19.7, 19.4, 19.2, 19.1];
    const fMax = 24,fMin = 17.5,fpX = (i) => 16 + i * (268 / (fat.length - 1));
    const fpY = (v) => 12 + (fMax - v) / (fMax - fMin) * 80;
    const goalY = fpY(18);
    const fatPts = fat.map((v, i) => `${fpX(i).toFixed(1)},${fpY(v).toFixed(1)}`).join(' ');


    return (
      <React.Fragment>
        {/* ── 회복 ── */}
        <SectionLabel>오늘의 회복</SectionLabel>
        <MdCard variant="outlined" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <RecoveryRing C={C} value={72} />
            <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 0 }}>
              <Pill C={C} k="수면" icon="bedtime" v="6h 40m" />
              <Pill C={C} k="HRV" icon="favorite" v="58" unit="ms ↓" warn />
              <Pill C={C} k="안정시 심박" icon="cardiology" v="58" unit="bpm" />
            </div>
          </div>
        </MdCard>

        {/* ── 오늘의 움직임 ── */}
        <SectionLabel>오늘의 움직임</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <Stat C={C} icon="directions_run" n="7,842" k="걸음" />
          <Stat C={C} icon="local_fire_department" n="420" k="활동 kcal" />
          <Stat C={C} icon="self_improvement" n="10" sub="m" k="명상" />
        </div>

        {/* ── 추세 · 체지방 ── */}
        <SectionLabel action={
        <span className="md-label-small" style={{ color: C('primary'), fontWeight: 700 }}>−4.3%p · 12주</span>
        }>몸의 추세</SectionLabel>
        <MdCard variant="outlined" style={{ padding: 16 }}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>체지방률</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>23.4%</span>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: C('on-surface') }}>19.1%</span>
          </div>
          <window.PxChart type="line" data={fat} label="체지방률 12주 추세"
          options={{ w: 96, h: 34, dots: true, scale: 3 }} style={{ minHeight: 0, marginTop: 4 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span style={{ width: 10, height: 2, background: 'var(--ds-core)', flex: '0 0 auto' }} />
            <span className="md-label-small" style={{ color: C('primary'), fontWeight: 700 }}>목표 18%</span>
          </div>
          <div className="md-label-small" style={{ color: C('on-surface-variant'), marginTop: 2 }}>12주간 −4.3%p · 목표까지 1.1%p</div>
        </MdCard>

        {/* ── 수면 · 최근 7일 ── */}
        <SectionLabel action={
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>평균 {avg}h</span>
        }>수면 · 최근 7일</SectionLabel>
        <MdCard variant="outlined" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 116, gap: 7, borderBottom: `1px solid ${C('outline-variant')}`, paddingBottom: 9 }}>
            {days.map((x) => {
              const short = x.h < 7;
              const col = short ? 'var(--warn)' : 'var(--c11)';
              return (
              <div key={x.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span className="md-label-small" style={{ color: short ? 'var(--warn)' : C('on-surface-variant'), fontWeight: 700, marginBottom: 5 }}>{x.h}</span>
                  <div style={{ width: '66%', height: `${x.h / 9 * 78}px`, borderRadius: 0, background: `linear-gradient(to top, ${col}, ${col}99)` }} />
                </div>);

            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
            {days.map((x) =>
            <span key={x.d} className="md-label-small" style={{ flex: 1, textAlign: 'center', color: C('on-surface-variant') }}>{x.d}</span>
            )}
          </div>
          <div className="md-label-small" style={{ color: C('on-surface-variant'), marginTop: 11, display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'keep-all' }}>
            <span style={{ width: 10, height: 10, borderRadius: 0, background: 'var(--warn)', flex: '0 0 auto' }} />
            주황 막대 = 7시간 미만
          </div>
        </MdCard>

        {/* ── 발견 (인사이트) ── */}
        <SectionLabel action={<Tag C={C} kind="fact">사실</Tag>}>이번 주 변화</SectionLabel>
        <MdCard variant="outlined" style={{ padding: '2px 14px' }}>
          <InsightRow C={C} first icon="bedtime" h="수면이 35분 줄었어요" s="이번 주 평균 6h20m · 지난주 6h55m" />
          <InsightRow C={C} icon="cardiology" h="안정시 심박이 3일 연속 올랐어요" s="54 → 58 bpm · 짧은 수면과 함께 나타나요" />
        </MdCard>

        <SectionLabel action={<Tag C={C} kind="link">연결</Tag>}>너만의 패턴</SectionLabel>
        <MdCard variant="outlined" style={{ padding: 16 }}>
          <div className="md-body-medium" style={{ color: C('on-surface'), fontWeight: 700, wordBreak: 'keep-all' }}>잘 잔 다음날, 더 많이 움직여요</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), margin: '3px 0 6px', wordBreak: 'keep-all' }}>7시간↑ 잔 다음날 활동량이 높은 편 · 당신 데이터 기준</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>활동</span>
            <window.PxChart type="scatter" data={[[1,1],[2,2],[3,3],[4,4],[5,3.6],[6,5],[7,5.6],[8,6.4],[9,6.8]]} label="수면-활동 산점도"
            options={{ w: 96, h: 34, scale: 3 }} style={{ minHeight: 0, flex: 1 }} />
          </div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), textAlign: 'right', marginTop: 2 }}>수면 →</div>
        </MdCard>

        <div className="md-label-small" style={{ color: C('on-surface-variant'), textAlign: 'center', margin: '14px 4px 0', wordBreak: 'keep-all' }}>
          ⚠ 인사이트는 참고용이며 의료 진단이 아니에요.
        </div>

      </React.Fragment>);
  }

  /* ── 건강 데이터 항목 (설정 › 데이터) — 수집 중인 항목엔 녹색 체크 ── */
  function HealthDataScreen({ t, go }) {
    const C = window.SB.C;
    const onCount = HEALTH_TYPES.filter((c) => c.on).length;
    return (
      <ScreenPad>
        <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>건강 데이터 항목</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16, wordBreak: 'keep-all' }}>
          어디서 읽어와(연동 현황) 무엇이 수집되는지(수집 항목) 한눈에 볼 수 있어요. <b style={{ color: 'var(--ok)' }}>녹색 체크</b>는 지금 수집 중인 항목이에요.
        </div>

        <MdCard variant="filled" style={{ background: C('surface-container'), padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="check_circle" size={20} style={{ color: 'var(--ok)', flex: '0 0 auto' }} />
            <span className="md-body-medium" style={{ color: C('on-surface'), flex: 1, minWidth: 0, wordBreak: 'keep-all' }}>{HEALTH_TYPES.length}개 분류 중 <b>{onCount}개</b>를 수집 중이에요</span>
            <MdButton variant="text" onClick={() => go('connect')}>연동</MdButton>
          </div>
        </MdCard>

        {/* 연동 현황 — 어디서 읽어오는지 */}
        <SectionLabel>연동 현황</SectionLabel>
        <MdCard variant="outlined" style={{ padding: '2px 14px' }}>
          {HEALTH_SOURCES.map((s, i) =>
          <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 0, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('surface-container-highest') }}>
                <Icon name={s.icon} size={20} style={{ color: s.on ? C('primary') : C('on-surface-variant') }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-label-large" style={{ color: C('on-surface') }}>{s.k}</div>
                <div className="md-label-small" style={{ color: C('on-surface-variant') }}>{s.sub}</div>
              </div>
              {s.on ?
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ok)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <Icon name="check_circle" size={17} style={{ color: 'var(--ok)' }} />연결됨
                </span> :
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C('on-surface-variant'), fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <Icon name="radio_button_unchecked" size={16} style={{ color: C('on-surface-variant') }} />연결 안 됨
                </span>}
            </div>
          )}
        </MdCard>

        {/* 수집 항목 — 무엇이 수집되는지 */}
        <SectionLabel>수집 항목</SectionLabel>
        <MdCard variant="outlined" style={{ padding: '2px 14px' }}>
          {HEALTH_TYPES.map((c, i) =>
          <div key={c.k} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 0, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('surface-container-highest') }}>
                <Icon name={c.icon} size={20} style={{ color: c.on ? C('primary') : C('on-surface-variant') }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="md-label-large" style={{ color: C('on-surface'), whiteSpace: 'nowrap' }}>{c.k}</span>
                  {c.src && <span className="md-label-small" style={{ color: C('on-surface-variant') }}>· {c.src}</span>}
                  {c.on ?
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', color: 'var(--ok)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <Icon name="check_circle" size={16} style={{ color: 'var(--ok)' }} />수집 중
                    </span> :
                  <span style={{ marginLeft: 'auto', color: C('on-surface-variant'), fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>연동 시 수집</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {c.items.map((it) =>
                <span key={it} style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: C('on-surface-variant'), padding: '3px 9px', borderRadius: 0, background: C('surface-container-high'), border: `1px solid ${C('outline-variant')}` }}>{it}</span>
                )}
                </div>
              </div>
            </div>
          )}
        </MdCard>

        <div className="md-label-small" style={{ color: C('on-surface-variant'), margin: '12px 4px 0', display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'keep-all' }}>
          <Icon name="hub" size={13} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
          아이폰 · 갤럭시 양쪽에서 같은 신호를 읽어, 한곳에 모아요.
        </div>
      </ScreenPad>);

  }

  window.SB = window.SB || {};
  window.SB.HealthLens = HealthLens;
  window.HealthDataScreen = HealthDataScreen;
})();