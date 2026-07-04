/* ============================================================
   2nd-Brain · 북극성 종합 (layer C) — 7 도메인 별 + 검증 레이어 B + 포터블 정체성
   Export: window.MeScreen
   ============================================================ */
function MeScreen({ t, go }) {
  const C = window.SB.C;
  const level = t.starLevel ?? 3;
  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {/* data-generated persona deck — swipe through facets (PRD §3.1) */}
      <window.PersonaDeck go={go} />

      <div style={{ padding: '4px 16px 20px' }}>
        {/* layer B — hidden validation layer (밝기 정직성) */}
        <SectionLabel action={<MdButton variant="text" onClick={() => go('bigfive')}>검증 보기</MdButton>}>숨은 결 · 검증틀</SectionLabel>
        <MdCard variant="filled" onClick={() => go('bigfive')} style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="bubble_chart" size={22} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
            <div className="md-body-medium" style={{ color: C('on-surface'), flex: 1, wordBreak: 'keep-all' }}>
              도메인 데이터가 Big Five·애착 같은 검증틀을 삼각측량해요. <b>별빛</b>은 얼마나 넣었는지, <b>확신</b>은 얼마나 검증됐는지 — 둘은 달라요.
            </div>
            <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
          </div>
        </MdCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
          <MdButton variant="tonal" size="s" style={{ width: '100%' }} onClick={() => go('bigfive')}>Big Five</MdButton>
          <MdButton variant="tonal" size="s" style={{ width: '100%' }} onClick={() => go('attachment')}>애착</MdButton>
          <MdButton variant="tonal" size="s" style={{ width: '100%' }} onClick={() => go('values')}>가치관</MdButton>
          <MdButton variant="tonal" size="s" style={{ width: '100%' }} onClick={() => go('motivation')}>동기</MdButton>
          <MdButton variant="tonal" size="s" style={{ width: '100%' }} onClick={() => go('strengths')}>강점</MdButton>
          <MdButton variant="tonal" size="s" style={{ width: '100%' }} onClick={() => go('peer')}>보여지는 나</MdButton>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <MdCard variant="filled" onClick={() => go('trend')} style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="trending_up" size={20} style={{ color: C('primary'), flex: '0 0 auto' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-body-medium" style={{ color: C('on-surface') }}>밝기 변화</div>
                <div className="md-body-small" style={{ color: C('primary') }}>+34% · 8주</div>
              </div>
            </div>
          </MdCard>
          <MdCard variant="filled" onClick={() => go('ratify')} style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="task_alt" fill size={20} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-body-medium" style={{ color: C('on-surface') }}>승인 이력</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>제안·결정</div>
              </div>
            </div>
          </MdCard>
        </div>

        {/* IDEN card */}
        <SectionLabel>포터블 정체성</SectionLabel>
        <MdCard variant="elevated" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, background: C('tertiary-container') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="badge" fill size={26} style={{ color: C('on-tertiary-container') }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 14, color: C('on-tertiary-container') }}>simon.iden</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: C('surface'), color: C('on-surface-variant') }}>v2.1</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: C('primary'), color: C('on-primary') }}>서명됨</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="md-label-medium" style={{ color: C('tertiary'), flex: 1 }}>NORTH STAR</div>
                  <button onClick={(e) => { e.stopPropagation(); go('northstar'); }} className="md-interactive" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C('tertiary'), fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 8 }}>
                    <span className="md-state" /><Icon name="edit" size={14} />다듬기
                  </button>
                </div>
                <div className="md-body-medium" style={{ color: C('on-surface'), marginTop: 3 }}>“나를 깊이 이해해 더 나답게 산다.”</div>
              </div>
              <div>
                <div className="md-label-medium" style={{ color: C('primary') }}>BIG FIVE</div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13, color: C('on-surface'), marginTop: 3 }}>O72 C58 E41 A67 N39</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <MdButton variant="tertiary" icon="ios_share" style={{ flex: 1 }} onClick={() => go('iden')}>AI에 전달</MdButton>
              <MdButton variant="outlined" icon="visibility" style={{ flex: 1 }} onClick={() => go('iden')}>미리보기</MdButton>
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="lock" size={14} /> 민감한 항목은 가리고 내보낼 수 있어요.
            </div>
          </div>
        </MdCard>

        {/* settings rows */}
        <SectionLabel>계정</SectionLabel>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {[
            { icon: 'workspaces', label: '데이터 연동', sub: '캘린더 · 건강 · Notion', route: 'connect' },
            { icon: 'workspace_premium', label: '요금제 · 항해자', sub: '횟수·보관·내보내기 한도', route: 'plans' },
            { icon: 'tune', label: '설정', sub: '테마 · 권한 · 개인정보', route: 'settings' },
            { icon: 'auto_stories', label: 'AI 뮤지엄', sub: 'AI 발전사 8 카테고리', route: 'museum' },
          ].map((row, i) => (
            <div key={row.label} className="md-interactive" onClick={() => go(row.route)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px', borderRadius: 10,
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', cursor: 'pointer' }}>
              <span className="md-state" />
              <Icon name={row.icon} size={22} style={{ color: C('on-surface-variant') }} />
              <div style={{ flex: 1 }}>
                <div className="md-body-large" style={{ color: C('on-surface') }}>{row.label}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{row.sub}</div>
              </div>
              <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
            </div>
          ))}
        </MdCard>
      </div>
    </div>
  );
}

window.MeScreen = MeScreen;
