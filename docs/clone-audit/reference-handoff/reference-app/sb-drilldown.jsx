/* ===================== 커리어 별 · Drill Down (3C4P) =====================
   별 화면 'Drill Down' 버튼 → 이 화면. 성과를 두 단계로 더 깊이 판다.
   ① 3C4P 입력 — 3C(Customer·Company·Competitor)로 'Why',
                  4P(Product·Place·Price·Promotion)로 'What + How'
   ② 세컨비와의 Drill Down — 채운 3C4P를 토대로 세컨비가 먼저 더 깊이
                  파고드는 질문을 건네는 대화로 이어진다.
   배경/뒤로가기/제목은 앱 셸이 띄운다. 입력 구조는 '성과 입력'과 같은 언어. */

/* 3C / 4P 큰 띠 — 프레임워크 구분 */
function DdBand({ C, code, label, why }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '20px 0 12px' }}>
      <span style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', minWidth: 44, height: 32, padding: '0 13px', borderRadius: 999,
        background: C('tertiary-container'), color: C('on-tertiary-container'), fontWeight: 800, fontSize: 16, letterSpacing: '.5px' }}>{code}</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="md-title-medium" style={{ color: C('on-surface'), lineHeight: 1.15 }}>{label}</span>
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{why}</span>
      </div>
    </div>
  );
}

/* C / P 한 묶음 헤더 + 필드들 ('성과 입력'의 CiSection과 같은 톤) */
function DdGroup({ C, icon, title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name={icon} size={17} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
        <span className="md-title-small" style={{ color: C('on-surface') }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 1 }}>{children}</div>
    </div>
  );
}

/* 경험 유형 — 선택 팝업 옵션 */
const DD_EXP_TYPES = ['학업', '학교 프로젝트', '교내 동아리', '대외활동 (교외 동아리)', '연구/개발', '공모전/대회', '인턴', '아르바이트', '계약직/파견직', '정규 입사 경험', '개인 사업/창업/사이드 프로젝트'];

function DrillDownScreen({ t, go, param }) {
  const C = window.SB.C;
  const HEAD = 'assets/deepspace/secondb-head-front.png';

  // 경험 개요 — 3C4P 이전, 이 경험이 무엇인지 먼저
  const [summary, setSummary] = React.useState('');
  const [expType, setExpType] = React.useState('');
  const [typeOpen, setTypeOpen] = React.useState(false);

  // 3C — Why
  const [cust, setCust] = React.useState({ target: '', need: '' });
  const [comp, setComp] = React.useState({ where: '', goal: '', problem: '', role: '' });
  const [rival, setRival] = React.useState({ who: '', applied: '' });
  // 4P — What + How
  const [prod, setProd] = React.useState({ result: '', meaning: '' });
  const [place, setPlace] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [promo, setPromo] = React.useState('');

  const sC = (set) => (k, v) => set((s) => ({ ...s, [k]: v }));

  // ② 세컨비와의 Drill Down — 채운 3C4P를 토대로 세컨비가 먼저 더 깊이 묻는다.
  const goChat = () => {
    const pick = [comp.problem, prod.result, cust.target].filter((x) => x && x.trim());
    const lead = (summary && summary.trim())
      ? `「${summary.trim()}」${expType ? ` · ${expType}` : ''} — 이 경험을 한 겹 더 파고들어 볼게요.`
      : '좋아요. 3C4P로 적어주신 걸 바탕으로 한 겹 더 파고들어 볼게요.';
    const ctx = pick.length
      ? `\n\n적어주신 걸 보면 「${pick.slice(0, 2).join(' · ')}」가 이 성과의 중심 같아요.`
      : '';
    const intro = `${lead}${ctx}\n\n먼저 하나 — 같은 상황을 다른 사람이 맡았어도 같은 결과가 나왔을까요? 결과를 가른 결정적 한 수는 무엇이었나요?`;
    // 'chat'은 루트라 go()가 param을 초기화함 → 전역 시드로 전달, ChatScreen이 마운트 시 소비
    try { window.__sbPendingSeed = { title: 'Drill Down · 커리어', mode: '2nd', intro }; } catch (e) {}
    go('chat');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 14px' }}>
        {/* 세컨비 안내 */}
        <MdCard variant="filled" style={{ background: C('tertiary-container'), padding: 14, margin: '4px 0 6px' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <img src={HEAD} alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
            <div className="md-body-medium" style={{ color: C('on-tertiary-container'), wordBreak: 'keep-all' }}>
              성과를 <b>3C로 'Why'</b>, <b>4P로 'What·How'</b>를 채워 분해해 볼게요. 다 적으면 이걸 토대로 제가 더 깊이 파고드는 질문을 드릴게요.
            </div>
          </div>
        </MdCard>

        {/* 경험 개요 — 한 줄 요약 + 경험 유형 (3C4P 이전) */}
        <DdGroup C={C} icon="label" title="경험 개요">
          <Field C={C} icon="format_quote" label="경험 한 줄 요약" hint="어떻게 했고, 결과는? — 한 줄로" value={summary} onChange={setSummary} multiline />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon name="apps" size={15} style={{ color: C('on-surface-variant') }} />
              <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>경험 유형</span>
            </div>
            <button type="button" className="md-interactive" onClick={() => setTypeOpen(true)}
              style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer',
                background: C('surface-container-highest'), color: expType ? C('on-surface') : C('on-surface-variant'),
                fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, textAlign: 'left' }}>
              <span className="md-state" />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{expType || '경험 유형 선택'}</span>
              <Icon name="south" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            </button>
          </div>
        </DdGroup>

        {/* ── 3C · Why ── */}
        <DdBand C={C} code="3C" label="왜 했는가" why="Why" />

        <DdGroup C={C} icon="group" title="Customer · 고객">
          <Field C={C} icon="group" label="혜택을 받는 대상" hint="예) 가입 직후 이탈하던 20–30대" value={cust.target} onChange={(v) => sC(setCust)('target', v)} />
          <Field C={C} icon="favorite" label="대상이 필요로 한 것" hint="예) 가입 직후 '뭘 해야 할지' 빠르게 아는 것" value={cust.need} onChange={(v) => sC(setCust)('need', v)} multiline />
        </DdGroup>

        <DdGroup C={C} icon="account_balance" title="Company · 자사">
          <Field C={C} icon="account_balance" label="내가 속했던 곳" hint="예) 테크컴퍼니 노바 · 디자인 플랫폼팀" value={comp.where} onChange={(v) => sC(setComp)('where', v)} />
          <Field C={C} icon="flag" label="본인(팀)의 목표" hint="예) 온보딩 완료율을 끌어올리기" value={comp.goal} onChange={(v) => sC(setComp)('goal', v)} multiline />
          <Field C={C} icon="warning" label="문제 · 원인 (혹은 기회 상황)" hint="예) 1단계에서 40% 이탈 — 첫 화면 정보 과다" value={comp.problem} onChange={(v) => sC(setComp)('problem', v)} multiline />
          <Field C={C} icon="badge" label="팀 내에서 나의 역할" hint="예) 플로우 설계 · 실험 리드" value={comp.role} onChange={(v) => sC(setComp)('role', v)} />
        </DdGroup>

        <DdGroup C={C} icon="travel_explore" title="Competitor · 경쟁사">
          <Field C={C} icon="search" label="조사한 대상" hint="예) 동종 앱 3종의 온보딩 플로우" value={rival.who} onChange={(v) => sC(setRival)('who', v)} />
          <Field C={C} icon="rule" label="조사 후 적용한 내용" hint="예) 3단계 → 1단계로 압축, 진행률 표시 도입" value={rival.applied} onChange={(v) => sC(setRival)('applied', v)} multiline />
        </DdGroup>

        {/* ── 4P · What + How ── */}
        <DdBand C={C} code="4P" label="무엇을 · 어떻게" why="What + How" />

        <DdGroup C={C} icon="shopping_bag" title="Product · 상품">
          <Field C={C} icon="emoji_events" label="결과" hint="예) 온보딩 완료율 52% → 71%" value={prod.result} onChange={(v) => sC(setProd)('result', v)} multiline />
          <Field C={C} icon="format_quote" label="결과의 의미" hint="예) 신규 30일 잔존이 동반 상승 — 첫 경험이 핵심" value={prod.meaning} onChange={(v) => sC(setProd)('meaning', v)} multiline />
        </DdGroup>

        <DdGroup C={C} icon="hub" title="Place · 위치">
          <Field C={C} label="문제 해결을 할 수 있었던 장소 · 지점 · 채널" hint="예) 앱 첫 실행 온보딩 · 푸시 리마인드" value={place} onChange={setPlace} multiline />
        </DdGroup>

        <DdGroup C={C} icon="payments" title="Price · 가격">
          <Field C={C} label="생산성 관점 (비용 감소 · 효율 · 시간 단축 등)" hint="예) 온보딩 관련 CS 문의 30% 감소" value={price} onChange={setPrice} multiline />
        </DdGroup>

        <DdGroup C={C} icon="rocket_launch" title="Promotion · 마케팅">
          <Field C={C} label="알리기 관점" hint="예) 개선 사례를 사내 위클리·블로그로 공유" value={promo} onChange={setPromo} multiline />
        </DdGroup>
      </div>

      {/* submit bar — ② 세컨비와의 Drill Down */}
      <div style={{ padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" icon="bubble_chart" style={{ width: '100%' }} onClick={goChat}>세컨비와 Drill Down</MdButton>
      </div>

      {/* 경험 유형 선택 팝업 */}
      {typeOpen &&
        <window.MdBottomSheet open onClose={() => setTypeOpen(false)}>
          <div className="md-title-large" style={{ color: C('on-surface'), padding: '0 4px', marginBottom: 2 }}>경험 유형</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), padding: '0 4px', marginBottom: 12 }}>이 경험이 어디에 해당하나요?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {DD_EXP_TYPES.map((opt) => {
              const on = expType === opt;
              return (
                <button key={opt} type="button" className="md-interactive" onClick={() => { setExpType(opt); setTypeOpen(false); }}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
                    border: 'none', borderRadius: 12, padding: '13px 14px', cursor: 'pointer', textAlign: 'left',
                    background: on ? C('secondary-container') : 'transparent', color: on ? C('on-secondary-container') : C('on-surface'),
                    fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, fontWeight: on ? 700 : 500 }}>
                  <span className="md-state" />
                  <span style={{ wordBreak: 'keep-all' }}>{opt}</span>
                  {on && <Icon name="check" size={20} style={{ color: C('on-secondary-container'), flex: '0 0 auto' }} />}
                </button>
              );
            })}
          </div>
        </window.MdBottomSheet>
      }
    </div>
  );
}

window.DrillDownScreen = DrillDownScreen;
