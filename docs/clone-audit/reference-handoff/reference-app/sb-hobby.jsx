/* ===================== 휴식(여가) 전용 입력: 취미·여가 페르소나 신호 수집기 =====================
   '활동 나열'이 아니라 왜·얼마나·어떤 맥락으로 하는지(=페르소나 신호)를 담는다.
   휴식 별 → '채워 넣기' 진입. (attached hobby-input-ui.html 의 앱 내 포팅) */

const HOBBY_CATS = ['운동', '창작', '학습', '수집', '게임', '소셜', '휴식·힐링', '탐험·여행', '요리·음식', '기타'];
const HOBBY_STATUS = [['active', '지속중'], ['dormant', '휴면'], ['aspirational', '하고싶음']];

function hbIntensity(v) {
  if (v <= 2) return '가볍게 (1~2)';
  if (v <= 4) return '취미 수준 (3~4)';
  if (v <= 6) return '진지함 (5~6)';
  if (v <= 8) return '깊이 몰입 (7~8)';
  return '과몰입·정체성 (9~10)';
}
function hbSocial(v) {
  if (v <= 2) return '철저히 혼자';
  if (v <= 4) return '혼자 선호';
  if (v <= 6) return '반반';
  if (v <= 8) return '함께 선호';
  return '무조건 함께';
}

let HB_UID = 1;
function hbBlank() {
  return { id: HB_UID++, name: '', cat: '', freq: '', intensity: 5, social: 5, status: 'active', motiv: '', detail: '', focus: '', cost: '' };
}
function hbSample() {
  return { id: HB_UID++, name: '클라이밍 (볼더링)', cat: '운동', freq: '2년차 · 주2회(화·일)',
    intensity: 8, social: 4, status: 'active',
    motiv: '문제풀이 쾌감 > 운동효과. 한 수씩 베타 짜는 게 코드 디버깅이랑 같은 뇌를 씀.',
    detail: '지구력보다 파워무브 선호. 실내 위주, 자연암장은 연 2~3회.',
    focus: 'V5 정체 구간 돌파, 손가락 부상 관리.', cost: '월 15만원 · 주 4시간' };
}

const hbInput = (C) => ({
  width: '100%', boxSizing: 'border-box', border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
  background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none'
});

/* small field label */
function HbLabel({ C, icon, children, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {icon && <Icon name={icon} size={15} style={{ color: accent ? C('primary') : C('on-surface-variant'), flex: '0 0 auto' }} />}
      <span className="md-label-medium" style={{ color: accent ? C('primary') : C('on-surface-variant'), fontWeight: accent ? 700 : 500, whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}

/* labeled range with end captions */
function HbSlider({ C, label, value, min, max, valueLabel, ends, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
        <span className="md-label-medium" style={{ color: C('on-surface-variant'), whiteSpace: 'nowrap' }}>{label}</span>
        <span className="md-label-medium" style={{ color: C('primary'), fontWeight: 700, whiteSpace: 'nowrap' }}>{valueLabel}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(ev) => onChange(+ev.target.value)}
        style={{ width: '100%', accentColor: C('primary') }} aria-label={label} />
      {ends &&
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
          <span className="md-label-small" style={{ color: C('on-surface-variant'), whiteSpace: 'nowrap' }}>{ends[0]}</span>
          <span className="md-label-small" style={{ color: C('on-surface-variant'), whiteSpace: 'nowrap' }}>{ends[1]}</span>
        </div>}
    </div>
  );
}

/* status segmented control */
function HbSeg({ C, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9999, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
      {HOBBY_STATUS.map(([k, lab]) => {
        const on = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} className="md-interactive"
            style={{ flex: 1, position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 9999, padding: '8px 0',
              fontSize: 13.5, fontWeight: on ? 700 : 500, fontFamily: 'var(--md-ref-typeface-plain)',
              background: on ? C('primary') : 'transparent', color: on ? C('on-primary') : C('on-surface-variant') }}>
            <span className="md-state" />{lab}
          </button>
        );
      })}
    </div>
  );
}

function HbActivityCard({ C, it, idx, total, onChange, onDelete, onMove }) {
  const set = (k, v) => onChange({ ...it, [k]: v });
  const missingMotiv = it.name.trim() && !it.motiv.trim();
  const arrow = (dir, disabled) =>
    <button type="button" onClick={() => onMove(idx, dir)} disabled={disabled} aria-label={dir < 0 ? '위로' : '아래로'}
      style={{ border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer', padding: 1, display: 'flex',
        color: disabled ? C('outline-variant') : C('on-surface-variant') }}>
      <Icon name={dir < 0 ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={20} />
    </button>;

  return (
    <MdCard variant="outlined" style={{ padding: 16 }}>
      {/* head: rank · name · reorder · delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 26, height: 26, flex: '0 0 auto', borderRadius: 8, background: C('secondary-container'), color: C('on-secondary-container'),
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{idx + 1}</span>
        <input value={it.name} onChange={(ev) => set('name', ev.target.value)} placeholder="활동 이름 (예: 클라이밍)" aria-label="활동 이름"
          style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: `2px solid ${C('outline-variant')}`, background: 'transparent',
            color: C('on-surface'), fontSize: 16, fontWeight: 700, padding: '6px 2px', outline: 'none', fontFamily: 'var(--md-ref-typeface-plain)' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>{arrow(-1, idx === 0)}{arrow(1, idx === total - 1)}</div>
        <button type="button" onClick={onDelete} aria-label="삭제"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C('on-surface-variant'), padding: 4, display: 'flex' }}>
          <Icon name="delete" size={19} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* category */}
        <div>
          <HbLabel C={C} icon="category">분류</HbLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {HOBBY_CATS.map((c) =>
            <MdChip key={c} variant="filter" selected={it.cat === c} onClick={() => set('cat', it.cat === c ? '' : c)}>{c}</MdChip>
            )}
          </div>
        </div>

        {/* freq */}
        <div>
          <HbLabel C={C} icon="history">빈도 · 경력</HbLabel>
          <input value={it.freq} onChange={(ev) => set('freq', ev.target.value)} placeholder="예: 2년차 · 주2회" style={hbInput(C)} aria-label="빈도·경력" />
        </div>

        {/* sliders */}
        <HbSlider C={C} label="강도" value={it.intensity} min={1} max={10} valueLabel={hbIntensity(it.intensity)} ends={['가볍게', '정체성']} onChange={(v) => set('intensity', v)} />
        <HbSlider C={C} label="사회성" value={it.social} min={0} max={10} valueLabel={hbSocial(it.social)} ends={['혼자', '함께']} onChange={(v) => set('social', v)} />

        {/* status */}
        <div>
          <HbLabel C={C} icon="toggle_on">상태</HbLabel>
          <HbSeg C={C} value={it.status} onChange={(v) => set('status', v)} />
        </div>

        {/* cost */}
        <div>
          <HbLabel C={C} icon="paid">지출 · 시간</HbLabel>
          <input value={it.cost} onChange={(ev) => set('cost', ev.target.value)} placeholder="예: 월 15만원 · 주 4시간" style={hbInput(C)} aria-label="지출·시간" />
        </div>

        {/* motivation — the #1 signal */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="favorite" size={15} style={{ color: C('primary') }} />
            <span className="md-label-medium" style={{ color: C('primary'), fontWeight: 700 }}>동기</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C('on-primary-container'), background: C('primary-container'), borderRadius: 9999, padding: '2px 8px' }}>★ 가장 중요</span>
          </div>
          <textarea value={it.motiv} onChange={(ev) => set('motiv', ev.target.value)} rows={3} aria-label="동기"
            placeholder="왜 하는지가 핵심. 예: '문제풀이 쾌감 > 운동효과. 베타 짜는 게 디버깅이랑 같은 뇌.'"
            style={{ ...hbInput(C), resize: 'none', lineHeight: 1.5, border: `1.5px solid ${C('primary')}`,
              background: `color-mix(in srgb, ${C('primary-container')} 45%, ${C('surface-container-highest')})` }} />
          {missingMotiv &&
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Icon name="info" size={13} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
              <span className="md-label-small" style={{ color: C('on-surface-variant') }}>동기를 채울수록 세컨비가 더 또렷이 읽어요.</span>
            </div>}
        </div>

        {/* detail */}
        <div>
          <HbLabel C={C} icon="tune">디테일 · 취향</HbLabel>
          <textarea value={it.detail} onChange={(ev) => set('detail', ev.target.value)} rows={2} aria-label="디테일·취향"
            placeholder="남들과 구별되는 구체점. 예: '지구력보다 파워무브 선호, 실내 위주.'"
            style={{ ...hbInput(C), resize: 'none', lineHeight: 1.5 }} />
        </div>

        {/* focus */}
        <div>
          <HbLabel C={C} icon="flag">현재 화두</HbLabel>
          <input value={it.focus} onChange={(ev) => set('focus', ev.target.value)} placeholder="예: V5 정체 돌파, 부상 관리" style={hbInput(C)} aria-label="현재 화두" />
        </div>
      </div>
    </MdCard>
  );
}

function HobbyInputScreen({ t, go, param }) {
  const C = window.SB.C;
  const [items, setItems] = React.useState(() => [hbSample()]);
  const [tipsOpen, setTipsOpen] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const update = (id, next) => setItems((xs) => xs.map((x) => (x.id === id ? next : x)));
  const del = (id) => setItems((xs) => xs.filter((x) => x.id !== id));
  const move = (idx, dir) => setItems((xs) => {
    const j = idx + dir; if (j < 0 || j >= xs.length) return xs;
    const a = xs.slice(); const [m] = a.splice(idx, 1); a.splice(j, 0, m); return a;
  });

  const named = items.filter((x) => x.name.trim()).length;

  if (done) {
    return (
      <ScreenPad>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 440, gap: 18, textAlign: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C('primary-container'), color: C('on-primary-container') }}>
            <Icon name="check" size={42} stroke={2.4} />
          </div>
          <div className="md-headline-small" style={{ color: C('on-surface') }}>담았어요</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', maxWidth: 290 }}>
            취미·여가 신호 <b>{named}개</b>를 <b>휴식 별</b>로 엮는 중이에요. 동기·강도·사회성에서 ‘쉼의 패턴’을 읽어 둘게요.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <MdButton variant="tonal" icon="add" onClick={() => setDone(false)}>더 담기</MdButton>
            <MdButton variant="filled" icon="auto_awesome" onClick={() => { if (param && param.domain) go('star', param); else go('records'); }}>휴식 별 보기</MdButton>
          </div>
        </div>
      </ScreenPad>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 14px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>취미·여가 기록</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 14, wordBreak: 'keep-all' }}>
          활동을 나열하지 말고 <b style={{ color: C('on-surface') }}>왜·얼마나·어떤 맥락</b>으로 하는지 적어요. 세컨비는 그 신호로 ‘어떤 사람인지’를 읽어요.
        </div>

        {/* tips (collapsible) */}
        <MdCard variant="filled" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
          <button type="button" onClick={() => setTipsOpen((v) => !v)} className="md-interactive"
            style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px', textAlign: 'left' }}>
            <span className="md-state" />
            <Icon name="lightbulb" size={18} fill style={{ color: C('tertiary'), flex: '0 0 auto' }} />
            <span className="md-label-large" style={{ color: C('on-surface'), flex: 1 }}>좋은 입력을 위한 팁</span>
            <Icon name={tipsOpen ? 'expand_less' : 'expand_more'} size={20} style={{ color: C('on-surface-variant') }} />
          </button>
          {tipsOpen &&
          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
              ['동기가 1순위', '같은 “독서”도 지식 수집이냐 현실 도피냐로 사람이 갈려요.'],
              ['대조 쌍을 적어요', '“X는 좋은데 Y는 싫다”가 단독 서술보다 정보량 2배예요.'],
              ['욕구로 매핑', '이 활동이 채우는 게 자율성·유능감·관계성 중 무엇인지 떠올려요.'],
              ['상태도 신호', '“하고 싶은데 못 하는 것(휴면·희망)”도 당신을 설명해요.']].
              map(([h, b]) =>
              <div key={h} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: C('tertiary'), flex: '0 0 auto', marginTop: 7 }} />
                  <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
                    <b style={{ color: C('on-surface') }}>{h}.</b> {b}
                  </div>
                </div>
              )}
            </div>}
        </MdCard>

        {/* activity cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((it, idx) =>
          <HbActivityCard key={it.id} C={C} it={it} idx={idx} total={items.length}
            onChange={(next) => update(it.id, next)} onDelete={() => del(it.id)} onMove={move} />
          )}
        </div>

        {items.length === 0 &&
        <div style={{ border: `2px dashed ${C('outline-variant')}`, borderRadius: 16, padding: '30px 20px', textAlign: 'center' }}>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
              아직 활동이 없어요. <b style={{ color: C('on-surface') }}>활동 추가</b>로 시작해요.
            </div>
          </div>}

        {/* add */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <MdButton variant="tonal" icon="add" style={{ flex: 1 }} onClick={() => setItems((xs) => [...xs, hbBlank()])}>활동 추가</MdButton>
          <MdButton variant="text" icon="auto_fix_high" onClick={() => setItems((xs) => [...xs, hbSample()])}>예시 넣기</MdButton>
        </div>
      </div>

      {/* submit bar */}
      <div style={{ padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" icon="check" style={{ width: '100%' }} disabled={named === 0} onClick={() => setDone(true)}>
          {named ? `${named}개 담기` : '활동 이름을 적어요'}
        </MdButton>
      </div>
    </div>
  );
}

window.HobbyInputScreen = HobbyInputScreen;
