/* ===================== 커리어 별 · 성과 입력 =====================
   '성과 입력' 버튼 → 이 화면. 이력서형 성과를 또렷한 형식으로 담는다.
   ① 일터: 산업 / 회사 / 부서 / 팀
   ② 역할: 직급 / 직무 / 직책
   ③ 프로젝트: 명 / 기간(달력) — 앱 공통 규칙대로 날짜는 달력에서 고른다
   ④ KPI: 직접 입력 + 고용24 직무 KPI 추천 카드 리스트업
   저장하면 타임라인에 남지만, 세컨비의 페르소나 분석 대상은 아니다(정형 성과). */

function CiSection({ icon, title, hint, C, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Icon name={icon} size={18} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
        <span className="md-title-medium" style={{ color: C('on-surface'), whiteSpace: 'nowrap' }}>{title}</span>
        {hint && <span className="md-label-small" style={{ color: C('on-surface-variant'), opacity: .85, whiteSpace: 'nowrap' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* 태그 입력 — input + 추가/Enter → 제거 가능한 칩 (Tool·기술·이론에 사용) */
function TagInput({ C, icon, label, hint, tags, setTags }) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || tags.includes(v)) { setDraft(''); return; }
    setTags([...tags, v]); setDraft('');
  };
  const remove = (t) => setTags(tags.filter((x) => x !== t));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon && <Icon name={icon} size={15} style={{ color: C('on-surface-variant') }} />}
        <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={hint}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
            background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none' }} />
        <MdButton variant="tonal" icon="add" onClick={add}>추가</MdButton>
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {tags.map((tg) => (
            <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 6px 6px 12px', borderRadius: 999,
              border: `1px solid ${C('outline-variant')}`, background: C('surface-container-highest'), color: C('on-surface'), fontSize: 13, fontWeight: 600 }}>
              {tg}
              <button type="button" onClick={() => remove(tg)} aria-label="삭제"
                style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: C('surface-container-high'), color: C('on-surface-variant'), padding: 0 }}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CareerInputScreen({ t, go, param }) {
  const C = window.SB.C;
  const HEAD = 'assets/deepspace/secondb-head-front.png';
  const careerStar = (window.SB.STARS || []).find((s) => s.id === 'career');

  const [wp, setWp] = React.useState({ industry: '', company: '', dept: '', team: '' });
  const [role, setRole] = React.useState({ rank: '', job: '', title: '' });
  const [proj, setProj] = React.useState('');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [ongoing, setOngoing] = React.useState(false);
  const [kpis, setKpis] = React.useState([]); // { id, name, unit, value }
  const [custom, setCustom] = React.useState('');
  const [summary, setSummary] = React.useState('');       // 핵심 성과 한 줄
  const [freeNote, setFreeNote] = React.useState('');     // 자유 입력
  const [bd, setBd] = React.useState({ problem: '', productivity: '', communication: '' }); // 성과 분해
  const setBdK = (k, v) => setBd((s) => ({ ...s, [k]: v }));
  const [tools, setTools] = React.useState([]);           // 기술 정리 · Tool
  const [skillTags, setSkillTags] = React.useState([]);   // 기술 정리 · 기술
  const [theories, setTheories] = React.useState([]);     // 기술 정리 · 이론
  const [done, setDone] = React.useState(false);
  const cnt = React.useRef(0);

  const setW = (k, v) => setWp((s) => ({ ...s, [k]: v }));
  const setR = (k, v) => setRole((s) => ({ ...s, [k]: v }));

  // 고용24 직무 KPI 추천 — 직무(프로덕트 디자이너) 기반으로 불러온 카드 목록(목업)
  const SUGGEST = [
    { name: '전환율 (CVR)', unit: '%' },
    { name: '리텐션 (D30)', unit: '%' },
    { name: '과업 성공률', unit: '%' },
    { name: '사용성 점수 (SUS)', unit: '점' },
    { name: '순추천지수 (NPS)', unit: '' },
    { name: '출시 리드타임', unit: '일' },
    { name: '디자인 QA 통과율', unit: '%' },
  ];
  const added = (name) => kpis.some((k) => k.name === name);
  const addKpi = (name, unit = '') => { if (!name || added(name)) return; cnt.current += 1; setKpis((xs) => [...xs, { id: 'k' + cnt.current, name, unit, value: '' }]); };
  const setKpiVal = (id, v) => setKpis((xs) => xs.map((k) => k.id === id ? { ...k, value: v } : k));
  const removeKpi = (id) => setKpis((xs) => xs.filter((k) => k.id !== id));
  const addCustom = () => { const n = custom.trim(); if (!n) return; addKpi(n, ''); setCustom(''); };

  const inputStyle = { width: '100%', border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
    background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none' };

  /* success */
  if (done) {
    return (
      <ScreenPad>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 440, gap: 18, textAlign: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C('tertiary-container'), color: C('on-tertiary-container') }}>
            <Icon name="check" size={42} stroke={2.4} />
          </div>
          <div className="md-headline-small" style={{ color: C('on-surface') }}>커리어 별에 담았어요</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', maxWidth: 290 }}>
            성과가 <b>커리어</b> 별 타임라인에 저장됐어요. 다음 단계를 진행하면 세컨비가 이 성과를 분석에 반영해요.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <MdButton variant="tonal" icon="add" onClick={() => { setDone(false); setProj(''); setStart(''); setEnd(''); setOngoing(false); setKpis([]); setSummary(''); setFreeNote(''); setBd({ problem: '', productivity: '', communication: '' }); setTools([]); setSkillTags([]); setTheories([]); }}>또 입력</MdButton>
            <MdButton variant="filled" icon="auto_awesome" onClick={() => { if (careerStar) go('star', careerStar); else go('home'); }}>커리어 별 보기</MdButton>
          </div>
        </div>
      </ScreenPad>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 14px' }}>
        {/* 세컨비 안내 */}
        <MdCard variant="filled" style={{ background: C('tertiary-container'), padding: 14, margin: '4px 0 14px' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <img src={HEAD} alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
            <div className="md-body-medium" style={{ color: C('on-tertiary-container'), wordBreak: 'keep-all' }}>
              성과는 형식이 또렷할수록 좋아요. 일터·역할·프로젝트·KPI를 채우면 커리어 별 타임라인에 그대로 남겨 둘게요.
            </div>
          </div>
        </MdCard>

        {/* 다음 단계 안내 */}
        <MdCard variant="outlined" style={{ padding: '10px 12px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="arrow_forward" size={16} style={{ color: C('on-surface-variant'), flex: '0 0 auto', marginTop: 1 }} />
          <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
            여기까지는 <b style={{ color: C('on-surface') }}>타임라인에 저장</b>돼요. 다음 단계를 진행하면 세컨비가 이 성과를 분석에 반영해요.
          </div>
        </MdCard>

        {/* ① 일터 */}
        <CiSection C={C} icon="apartment" title="일터" hint="산업 · 회사 · 부서 · 팀">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field C={C} icon="domain" label="산업" hint="예) IT · 디자인" value={wp.industry} onChange={(v) => setW('industry', v)} />
            <Field C={C} icon="business" label="회사" hint="예) 테크컴퍼니 노바" value={wp.company} onChange={(v) => setW('company', v)} />
            <Field C={C} icon="account_tree" label="부서" hint="예) 프로덕트 본부" value={wp.dept} onChange={(v) => setW('dept', v)} />
            <Field C={C} icon="groups" label="팀" hint="예) 디자인 플랫폼팀" value={wp.team} onChange={(v) => setW('team', v)} />
          </div>
        </CiSection>

        {/* ② 역할 */}
        <CiSection C={C} icon="badge" title="역할" hint="직급 · 직무 · 직책">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field C={C} icon="military_tech" label="직급" hint="예) 시니어" value={role.rank} onChange={(v) => setR('rank', v)} />
            <Field C={C} icon="work" label="직무" hint="예) 프로덕트 디자이너" value={role.job} onChange={(v) => setR('job', v)} />
            <Field C={C} icon="stars" label="직책" hint="예) 팀 리드 (선택)" value={role.title} onChange={(v) => setR('title', v)} />
          </div>
        </CiSection>

        {/* ③ 프로젝트 */}
        <CiSection C={C} icon="folder_special" title="프로젝트" hint="명 · 기간">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field C={C} icon="bookmark" label="프로젝트 명" hint="예) 디자인 시스템 v2" value={proj} onChange={setProj} />
            <div style={{ display: 'grid', gridTemplateColumns: ongoing ? '1fr' : '1fr 1fr', gap: 12 }}>
              <DatePickerField C={C} icon="calendar_today" label="시작" hint="날짜를 골라요" value={start} onChange={setStart} />
              {!ongoing && <DatePickerField C={C} icon="event" label="종료" hint="날짜를 골라요" value={end} onChange={setEnd} />}
            </div>
            <div>
              <MdChip variant="filter" selected={ongoing} onClick={() => setOngoing((v) => !v)}>진행 중</MdChip>
            </div>
          </div>
        </CiSection>

        {/* ④ KPI */}
        <CiSection C={C} icon="insights" title="KPI · 성과 지표" hint="직접 입력 · 추천에서 담기">
          {/* 담은 KPI */}
          {kpis.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {kpis.map((k) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '8px 8px 8px 12px', background: C('surface-container') }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{k.name}</div>
                  </div>
                  <input value={k.value} onChange={(e) => setKpiVal(k.id, e.target.value)} placeholder="값" inputMode="decimal"
                    style={{ width: 76, textAlign: 'right', border: `1px solid ${C('outline-variant')}`, borderRadius: 9, padding: '7px 9px',
                      background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 14, outline: 'none' }} />
                  {k.unit && <span className="md-label-medium" style={{ color: C('on-surface-variant'), width: 18, flex: '0 0 auto' }}>{k.unit}</span>}
                  <MdIconButton name="close" onClick={() => removeKpi(k.id)} />
                </div>
              ))}
            </div>
          )}

          {/* 직접 입력 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="직접 KPI 추가 (예: 재방문율)"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} style={{ ...inputStyle, flex: 1 }} />
            <MdButton variant="tonal" icon="add" onClick={addCustom}>추가</MdButton>
          </div>

          {/* 고용24 추천 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Icon name="hub" size={15} style={{ color: C('tertiary') }} />
            <span className="md-label-large" style={{ color: C('on-surface') }}>고용24 직무 KPI 추천</span>
            <span className="md-label-small" style={{ color: C('on-tertiary-container'), background: C('tertiary-container'), padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>직무 기반</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGEST.map((s) => {
              const on = added(s.name);
              return (
                <button key={s.name} type="button" onClick={() => addKpi(s.name, s.unit)} disabled={on} className="md-interactive"
                  style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 11, cursor: on ? 'default' : 'pointer',
                    border: `1px solid ${on ? C('tertiary') : C('outline-variant')}`, background: on ? C('tertiary-container') : C('surface-container-highest'),
                    color: on ? C('on-tertiary-container') : C('on-surface'), fontFamily: 'inherit', fontSize: 13, fontWeight: 600, opacity: on ? .9 : 1 }}>
                  <span className="md-state" />
                  <Icon name={on ? 'check' : 'add'} size={15} style={{ color: on ? C('tertiary') : C('on-surface-variant') }} />
                  {s.name}{s.unit ? ` (${s.unit})` : ''}
                </button>
              );
            })}
          </div>
        </CiSection>

        {/* ⑤ 성과 */}
        <CiSection C={C} icon="emoji_events" title="성과" hint="핵심 한 줄 · 자유 기록">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field C={C} icon="star" label="핵심 성과" hint="예) 가입 전환율 18% → 27%로 끌어올림" value={summary} onChange={setSummary} />
            <Field C={C} icon="format_quote" label="자유 입력" hint="배경·과정·결과 등 성과를 자유롭게 적어 보세요." value={freeNote} onChange={setFreeNote} multiline />
          </div>
        </CiSection>

        {/* ⑥ 성과 분해 */}
        <CiSection C={C} icon="lan" title="성과 분해" hint="행동 단위로 쪼개기">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field C={C} icon="psychology" label="문제를 해결하기 위한 행동" hint="예) 이탈 구간을 가설로 나눠 A/B 테스트를 설계함" value={bd.problem} onChange={(v) => setBdK('problem', v)} multiline />
            <Field C={C} icon="bolt" label="생산성을 높인 액션" hint="예) 반복 작업을 컴포넌트화해 작업 시간을 40% 단축" value={bd.productivity} onChange={(v) => setBdK('productivity', v)} multiline />
            <Field C={C} icon="chat" label="의사소통을 잘한 액션" hint="예) 개발·기획과 주 1회 싱크로 의사결정 지연을 없앰" value={bd.communication} onChange={(v) => setBdK('communication', v)} multiline />
          </div>
        </CiSection>

        {/* ⑦ 기술 정리 */}
        <CiSection C={C} icon="layers" title="기술 정리" hint="Tool · 기술 · 이론">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TagInput C={C} icon="apps" label="Tool" hint="예) Figma — 엔터로 추가" tags={tools} setTags={setTools} />
            <TagInput C={C} icon="code" label="기술" hint="예) 디자인 시스템 설계 — 엔터로 추가" tags={skillTags} setTags={setSkillTags} />
            <TagInput C={C} icon="menu_book" label="이론" hint="예) Fitts' Law — 엔터로 추가" tags={theories} setTags={setTheories} />
          </div>
        </CiSection>
      </div>

      {/* submit bar */}
      <div style={{ padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" icon="check" style={{ width: '100%' }} onClick={() => setDone(true)}>성과 담기</MdButton>
      </div>
    </div>
  );
}

window.CareerInputScreen = CareerInputScreen;
