/* ============================================================
   2nd-Brain · Layer-B 확장 + propose→ratify 이력
   ValuesScreen   : 가치관 검증틀 (Schwartz 기반, 핵심 가치 랭킹)
   RatifyScreen   : 세컨비 제안 ↔ 나의 결정 이력 (승인/보류/거절·되돌리기)
   Export: window.{ValuesScreen, RatifyScreen}
   ============================================================ */
const { useState: useVS } = React;

/* ===================== 가치관 (Values · 레이어 B) ===================== */
const VALUES = [
  { k: '자율성', en: 'Self-Direction', v: 78, note: '스스로 정하고 움직일 때 가장 나다워요' },
  { k: '성장', en: 'Stimulation', v: 71, note: '새로움과 배움이 당신을 끌어당겨요' },
  { k: '진정성', en: 'Authenticity', v: 66, note: '겉과 속이 같기를 바라요' },
  { k: '관계·돌봄', en: 'Benevolence', v: 58, note: '가까운 사람을 챙기는 마음' },
  { k: '성취', en: 'Achievement', v: 49, note: '해냈다는 감각을 좋아해요' },
  { k: '안정', en: 'Security', v: 37, note: '예측 가능함은 우선순위가 낮아요' },
];

function ValuesScreen({ t, go }) {
  const C = window.SB.C;
  const top = VALUES.slice(0, 3);
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 4px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface') }}>가치관</div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: C('tertiary-container'), color: C('on-tertiary-container') }}>L2</span>
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16 }}>숨은 결(레이어 B) · 무엇을 중요하게 여기는지</div>

      {/* top-3 highlight */}
      <div style={{ position: 'relative', borderRadius: 16, padding: 18, overflow: 'hidden',
        background: C('primary-container'), border: `1px solid ${C('outline-variant')}` }}>
        <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.14em', color: C('on-primary-container'), opacity: .8, marginBottom: 12 }}>CORE VALUES · 핵심 가치</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {top.map((v, i) => (
            <div key={v.k} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', borderRadius: 12,
              background: i === 0 ? C('primary') : C('surface'), border: `1px solid ${i === 0 ? C('primary') : C('outline-variant')}` }}>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, color: i === 0 ? C('on-primary') : C('on-surface-variant') }}>{i + 1}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: i === 0 ? C('on-primary') : C('on-surface'), marginTop: 4 }}>{v.k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ranked bars */}
      <SectionLabel>가치 스펙트럼</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {VALUES.map((v) => (
          <div key={v.k}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="md-body-medium" style={{ color: C('on-surface'), fontWeight: 600 }}>{v.k}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('on-surface-variant') }}>{v.en}</span>
            </div>
            <ProgressLinear value={v.v} color={C('tertiary')} />
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>{v.note}</div>
          </div>
        ))}
      </div>

      <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 14, marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
          <div className="md-body-medium" style={{ color: C('on-secondary-container'), wordBreak: 'keep-all' }}>
            <b>자율성</b>이 가장 높아요. 일·관계에서 ‘스스로 정하는’ 선택을 반복해 온 기록이 이 추정을 받쳐요.
          </div>
        </div>
      </MdCard>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="tonal" icon="forum" style={{ flex: 1 }} onClick={() => go('interview')}>가치 인터뷰</MdButton>
        <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => go('bigfive')}>다른 검증틀</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== 승인 이력 (propose → ratify) ===================== */
const RATIFY = [
  { id: 1, src: '통화 녹음', icon: 'mic', target: '관계 별', from: 'L2', to: 'L3', decision: '승인', when: '방금', note: '“사람 만나면 충전” 신호 확인' },
  { id: 2, src: '심층 인터뷰', icon: 'forum', target: '외향성', from: '41', to: '47', decision: '승인', when: '1시간 전', note: '먼저 다가가는 패턴 4건' },
  { id: 3, src: '기록 분석', icon: 'inventory_2', target: '리듬 별', from: 'L2', to: 'L3', decision: '보류', when: '오늘', note: '근거가 더 필요해요' },
  { id: 4, src: '캘린더 연동', icon: 'workspaces', target: '건강 별', from: 'L1', to: 'L2', decision: '거절', when: '어제', note: '내가 동의하지 않은 추정' },
  { id: 5, src: '심층 인터뷰', icon: 'forum', target: '애착 유형', from: '—', to: '안정형', decision: '승인', when: '2일 전', note: 'ECR 12문항 응답' },
];
const DEC = {
  '승인': { c: 'var(--md-sys-color-primary)', bg: 'var(--md-sys-color-primary-container)', on: 'var(--md-sys-color-on-primary-container)', icon: 'check_circle' },
  '보류': { c: '#F7B955', bg: 'rgba(247,185,85,.18)', on: '#F7B955', icon: 'replay' },
  '거절': { c: 'var(--md-sys-color-error)', bg: 'var(--md-sys-color-error-container)', on: 'var(--md-sys-color-on-error-container)', icon: 'close' },
};

function RatifyScreen({ t, go }) {
  const C = window.SB.C;
  const [filter, setFilter] = useVS('전체');
  const filters = ['전체', '승인', '보류', '거절'];
  const list = RATIFY.filter((r) => filter === '전체' || r.decision === filter);
  const counts = { 승인: RATIFY.filter((r) => r.decision === '승인').length, 보류: RATIFY.filter((r) => r.decision === '보류').length, 거절: RATIFY.filter((r) => r.decision === '거절').length };

  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>승인 이력</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 14, wordBreak: 'keep-all' }}>
        세컨비는 제안하고, 반영은 늘 당신이 정해요. 어떤 분석도 동의 없이 별에 반영되지 않아요.
      </div>

      {/* summary */}
      <MdCard variant="filled" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', textAlign: 'center' }}>
          {[['제안', RATIFY.length, C('on-surface')], ['승인', counts.승인, C('primary')], ['보류', counts.보류, '#F7B955'], ['거절', counts.거절, C('error')]].map(([lb, n, col], i) => (
            <div key={lb} style={{ flex: 1, borderLeft: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 22, fontWeight: 700, color: col }}>{n}</div>
              <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginTop: 2 }}>{lb}</div>
            </div>
          ))}
        </div>
      </MdCard>

      {/* filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {filters.map((f) => <MdChip key={f} variant="filter" selected={filter === f} onClick={() => setFilter(f)}>{f}</MdChip>)}
      </div>

      {/* timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((r) => {
          const d = DEC[r.decision];
          return (
            <MdCard key={r.id} variant="outlined" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                  background: C('surface-container-highest'), color: C('on-surface-variant') }}>
                  <Icon name={r.icon} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>{r.src}</div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: d.bg, color: d.on }}>
                  <Icon name={d.icon} size={13} />{r.decision}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="md-title-small" style={{ color: C('on-surface') }}>{r.target}</span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, color: C('on-surface-variant') }}>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13 }}>{r.from}</span>
                  <Icon name="arrow_forward" size={14} />
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13, color: r.decision === '승인' ? d.c : C('on-surface-variant') }}>{r.to}</span>
                </span>
                <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{r.when}</span>
              </div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8, wordBreak: 'keep-all' }}>{r.note}</div>
              {r.decision === '승인' && (
                <MdButton variant="text" size="s" icon="replay" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => {}}>되돌리기</MdButton>
              )}
              {r.decision === '보류' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <MdButton variant="tonal" size="s" icon="check" onClick={() => {}}>지금 승인</MdButton>
                  <MdButton variant="text" size="s" onClick={() => go('interview')}>근거 더 보기</MdButton>
                </div>
              )}
            </MdCard>
          );
        })}
      </div>
    </ScreenPad>
  );
}

Object.assign(window, { ValuesScreen, RatifyScreen });
