/* ============================================================
   2nd-Brain · CrisisRouter — 위기 라우팅 (감사 회신 §7-1 명세)
   red-zone 판정 시 LLM 호출 없이 이 표면으로 단락. 쿼터 미차감.
   톤 규칙: 차분한 뉴트럴 — 위험색·경고 아이콘·애니메이션 금지.
   세컨비는 중립 무드 소형 1개까지. 단일 상태(4상태 불요).
   Export: window.CrisisRouter · window.CrisisDemoScreen
   ============================================================ */
const { useState: useCr } = React;

/* 핫라인 — 관할·연령에 따라 행 구성이 달라진다 */
const CRISIS_LINES = {
  ko_adult: [{ num: '109', label: '자살예방 상담전화', sub: '24시간 · 무료' }],
  ko_minor: [
    { num: '1388', label: '청소년 상담전화', sub: '24시간 · 무료' },
    { num: '109', label: '자살예방 상담전화', sub: '24시간 · 무료' }],
  en: [{ num: '988', label: 'Suicide & Crisis Lifeline', sub: '24/7 · Free' }]
};

function CrisisRouter({ locale = 'ko', minor = false, onClose }) {
  const C = window.SB.C;
  const lines = locale === 'en' ? CRISIS_LINES.en : minor ? CRISIS_LINES.ko_minor : CRISIS_LINES.ko_adult;
  return (
    <div className="ds-scrim" role="dialog" aria-modal="true" aria-label="도움 연결"
    style={{ position: 'absolute', inset: 0, zIndex: 95, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 20 }}>
      <div className="ds-window" style={{ margin: 'var(--u)', padding: '22px 20px 18px', background: C('surface-container') }}>
        {/* 중립 무드 소형 머리 1개 — 장식 없음 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <SbHead size={48} expression="neutral" track={false} />
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), textAlign: 'center', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          지금 많이 힘드신 것 같아요.
        </div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 8, lineHeight: 1.65, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          혼자 견디지 않으셔도 돼요. 지금 바로 이야기를 들어줄 사람이 있어요.
        </div>

        {/* 핫라인 행 — 전화 걸기는 OS 다이얼러로 위임 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          {lines.map((l) => (
            <a key={l.num} href={`tel:${l.num}`} className="md-interactive"
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', minHeight: 48,
              background: C('surface-container-high'), boxShadow: 'var(--ds-edge)', textDecoration: 'none' }}>
              <span className="md-state" />
              <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
                <Icon name="phone" size={17} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{l.label}</span>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{l.sub}</span>
              </span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 15, fontWeight: 700, color: 'var(--c11)', flex: '0 0 auto' }}>{l.num}</span>
            </a>))}
        </div>

        {/* 고지 — 저장·차감 없음 */}
        <div style={{ marginTop: 18, padding: '11px 13px', background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            입력한 내용은 저장되지 않아요 · 횟수가 차감되지 않아요
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <MdButton variant="outlined" full onClick={onClose}>닫기</MdButton>
        </div>
      </div>
    </div>);
}

/* ── 시연 화면 — 트리거 지점과 관할/연령 조합을 한자리에서 확인 ── */
const CRISIS_SURFACES = [
{ id: 'chat', label: '세컨비 대화', sub: '전송 직전 분류 → 단락' },
{ id: 'capture', label: '담기 · 일기', sub: '저장 후 분류 → 라우팅' },
{ id: 'voice', label: '음성 전사', sub: '전사문 미노출 + 라우팅' },
{ id: 'callrec', label: '통화 녹음', sub: '전사 폐기 + 라우팅' },
{ id: 'northstar', label: '북극성 문장', sub: '저장 전 분류' },
{ id: 'reasoning', label: '리즈닝 배치', sub: '1건이라도 red면 런 전체 중단 + 환불' }];

function CrisisDemoScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const [locale, setLocale] = useCr('ko');
  const [minor, setMinor] = useCr(false);
  const open = () => env && env.openCrisis && env.openCrisis({ locale, minor });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '10px 0 4px', wordBreak: 'keep-all', textWrap: 'pretty' }}>
          입력이 red-zone으로 분류되면 AI 호출 없이 이 표면으로 곧장 넘어가요.
        </div>
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginBottom: 14 }}>
          LLM 미호출 · 쿼터 미차감 · 입력 원문 미저장
        </div>

        {/* 관할 · 연령 */}
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>관할 · 연령</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {[['ko', '한국어'], ['en', 'English']].map(([k, l]) => (
            <button key={k} onClick={() => setLocale(k)} className="md-interactive"
            style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 36,
              background: locale === k ? C('primary') : C('surface-container-highest'),
              color: locale === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
              <span className="md-state" />{l}
            </button>))}
        </div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', minHeight: 48 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>미성년(만 18세 미만)</span>
              <span className="md-body-small" style={{ color: C('on-surface-variant') }}>1388 행이 위에 추가돼요</span>
            </span>
            <MdSwitch checked={minor} onChange={setMinor} />
          </div>
        </MdCard>

        {/* 표시될 핫라인 미리보기 */}
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 6px' }}>표시될 핫라인</div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {(locale === 'en' ? CRISIS_LINES.en : minor ? CRISIS_LINES.ko_minor : CRISIS_LINES.ko_adult).map((l, i) => (
            <div key={l.num} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <Icon name="phone" size={15} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
              <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>{l.label}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: 'var(--c11)' }}>{l.num}</span>
            </div>))}
        </MdCard>

        <div style={{ marginTop: 16 }}>
          <MdButton variant="filled" full icon="shield" onClick={open}>이 조합으로 열어보기</MdButton>
        </div>

        {/* 트리거 지점 */}
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '20px 0 6px' }}>이 표면이 뜨는 지점</div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {CRISIS_SURFACES.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span style={{ width: 6, height: 6, background: 'var(--ds-core)', flex: '0 0 auto' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>{s.label}</span>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>{s.sub}</span>
              </span>
            </div>))}
        </MdCard>

        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 16, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          확정 카피는 앱 레포 locales/ko/safety.json에 있어요. 여기서는 자리와 행 수만 맞춰 뒀습니다.
        </div>
      </div>
    </div>);
}

Object.assign(window, { CrisisRouter, CrisisDemoScreen, CRISIS_LINES });
