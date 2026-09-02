/* ===================== 관계 별 · 채워 넣기 / 세컨비 드릴다운 =====================
   '채워 넣기' = 핸드폰 주소록을 불러와 → 한 사람을 고르면 → 그 사람에 대해 입력.
   '세컨비와 대화' = 주소록의 사람을 골라 → 그 사람에 대해 드릴다운 대화.
   관계 노드 그래프(sb-relgraph)와 같은 카테고리·색 언어를 공유한다. */

const REL_CATS = window.SB_DATA.relations.input.cats; // → data/screens/relations.json
const REL_CCOLOR = Object.fromEntries(REL_CATS.map((c) => [c.id, c.color]));
const REL_CNAME = Object.fromEntries(REL_CATS.map((c) => [c.id, c.name]));
const REL_TIERS = window.SB_DATA.relations.input.tiers; // → data/screens/relations.json

/* 핸드폰 주소록 — 관계 그래프에 이미 담은 사람(tracked) + 아직 안 담은 사람.
   tracked 는 sb-relgraph 의 PEOPLE 과 같은 id·관계로 맞춘다. */
const REL_CONTACTS = window.SB_DATA.relations.input.contacts; // → data/screens/relations.json (앞 9명 tracked, 뒤 8명 아직 담지 않은 주소록의 다른 사람들)

function relDaysAgo(iso) {
  try {
    const d = new Date(iso + 'T00:00:00'); const now = new Date('2026-06-28T00:00:00');
    const n = Math.round((now - d) / 86400000);
    if (n <= 0) return '오늘';
    if (n === 1) return '어제';
    if (n < 7) return `${n}일 전`;
    if (n < 30) return `${Math.floor(n / 7)}주 전`;
    return `${Math.floor(n / 30)}개월 전`;
  } catch (e) { return ''; }
}

/* 원형 이니셜 아바타 — 관계 카테고리 색(없으면 중립) */
function RelAvatar({ name, cat, size = 42 }) {
  const C = window.SB.C;
  const col = cat ? REL_CCOLOR[cat] : null;
  const ch = (name || '?').trim().slice(0, name && /[A-Za-z]/.test(name[0]) ? 1 : 1);
  return (
    <div style={{ width: size, height: size, flex: '0 0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center',
      background: col ? `color-mix(in srgb, ${col} 26%, rgba(12,19,38,.6))` : 'rgba(127,178,255,.14)',
      border: `1.5px solid ${col || 'rgba(127,178,255,.3)'}`, color: col || '#CFE0F7',
      fontWeight: 800, fontSize: size * 0.4 }}>
      {ch}
    </div>
  );
}

/* ===================== 주소록 피커 ===================== */
function RelContactsScreen({ t, go, param }) {
  const C = window.SB.C;
  const mode = (param && param.mode) || 'fill'; // 'fill' | 'chat'
  const star = param && param.star;
  const [q, setQ] = React.useState('');

  const ql = q.trim().toLowerCase();
  const match = (c) => !ql || c.name.toLowerCase().includes(ql) || (c.cat && REL_CNAME[c.cat].includes(ql)) || c.phone.includes(ql);
  const tracked = REL_CONTACTS.filter((c) => c.tracked && match(c));
  const others = REL_CONTACTS.filter((c) => !c.tracked && match(c));

  const pick = (c) => {
    if (mode === 'chat') {
      const rel = c.cat ? REL_CNAME[c.cat] : '주소록의 사람';
      try {
        window.__sbPendingSeed = {
          mode: '2nd',
          title: `${c.name} 돌아보기`,
          intro: `${c.name}${/[a-zA-Z]$/.test(c.name) ? '' : '님'} 이야기를 해볼까요? ${c.tracked ? `지금까지 담긴 기록으로 보면 ‘${rel}’ 결의 사이예요. ` : '아직 담긴 기록이 적은 분이에요. '}요즘 이 사람과는 어떤가요? 떠오르는 장면 하나만 들려줘도 제가 이어서 여쭤볼게요.`,
        };
      } catch (e) {}
      go('chat');
    } else {
      go('relperson', { person: c, star });
    }
  };

  const Row = (c) => (
    <button key={c.id} type="button" onClick={() => pick(c)} className="md-interactive"
      style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
        border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', borderRadius: 14 }}>
      <span className="md-state" />
      <RelAvatar name={c.name} cat={c.cat} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="md-body-large" style={{ color: C('on-surface'), fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          {c.cat &&
            <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, color: REL_CCOLOR[c.cat], whiteSpace: 'nowrap',
              background: `color-mix(in srgb, ${REL_CCOLOR[c.cat]} 18%, transparent)`, borderRadius: 9999, padding: '2px 8px' }}>
              {REL_CNAME[c.cat]}
            </span>}
        </div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.phone} · 최근 연락 {relDaysAgo(c.last)}
        </div>
      </div>
      <Icon name={mode === 'chat' ? 'bubble_chart' : 'edit_note'} size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 20px' }}>
        <div style={{ padding: '0 4px' }}>
          <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>
            {mode === 'chat' ? '누구에 대해 이야기할까요?' : '누구를 담을까요?'}
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 12, wordBreak: 'keep-all' }}>
            <Icon name="contacts" size={14} style={{ color: C('primary'), verticalAlign: '-2px', marginRight: 4 }} />
            내 주소록에서 불러왔어요. {mode === 'chat' ? '한 사람을 고르면 세컨비가 그 사람에 대해 깊이 물어봐요.' : '한 사람을 고르면 그 사람에 대해 기록할 수 있어요.'}
          </div>
        </div>

        {/* 검색 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', margin: '0 4px 14px', borderRadius: 9999,
          background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
          <Icon name="search" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 관계 · 번호 검색" aria-label="주소록 검색"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: C('on-surface'), fontSize: 15, outline: 'none', fontFamily: 'var(--md-ref-typeface-plain)' }} />
          {q && <button type="button" onClick={() => setQ('')} aria-label="지우기" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C('on-surface-variant'), display: 'flex', padding: 0 }}><Icon name="close" size={18} /></button>}
        </div>

        {tracked.length > 0 &&
          <div style={{ marginBottom: 8 }}>
            <div className="md-label-medium" style={{ color: C('on-surface-variant'), padding: '0 12px', margin: '4px 0 2px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Icon name="hub" size={14} style={{ color: C('primary') }} /> 이미 별에 담은 사람
            </div>
            {tracked.map(Row)}
          </div>}

        {others.length > 0 &&
          <div>
            <div className="md-label-medium" style={{ color: C('on-surface-variant'), padding: '0 12px', margin: '12px 0 2px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Icon name="person_add" size={14} /> 주소록의 다른 사람
            </div>
            {others.map(Row)}
          </div>}

        {tracked.length === 0 && others.length === 0 &&
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C('on-surface-variant') }} className="md-body-medium">
            ‘{q}’와 맞는 연락처가 없어요.
          </div>}
      </div>
    </div>
  );
}

/* ===================== 한 사람에 대해 입력 ===================== */
const relInput = (C) => ({
  width: '100%', boxSizing: 'border-box', border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
  background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none',
});

function RelFieldLabel({ C, icon, children, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {icon && <Icon name={icon} size={15} style={{ color: accent ? C('primary') : C('on-surface-variant'), flex: '0 0 auto' }} />}
      <span className="md-label-medium" style={{ color: accent ? C('primary') : C('on-surface-variant'), fontWeight: accent ? 700 : 500, whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}

function RelPersonScreen({ t, go, param }) {
  const C = window.SB.C;
  const person = (param && param.person) || REL_CONTACTS[0];
  const star = param && param.star;
  const [cat, setCat] = React.useState(person.cat || '');
  const [tier, setTier] = React.useState(person.tier != null ? String(person.tier) : '1');
  const [nick, setNick] = React.useState('');
  const [meaning, setMeaning] = React.useState('');
  const [recent, setRecent] = React.useState('');
  const [care, setCare] = React.useState('');
  const [day, setDay] = React.useState('');
  const [done, setDone] = React.useState(false);

  const filled = [cat, nick.trim(), meaning.trim(), recent.trim(), care.trim(), day].filter(Boolean).length;

  if (done) {
    return (
      <ScreenPad>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 440, gap: 18, textAlign: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C('primary-container'), color: C('on-primary-container') }}>
            <Icon name="check" size={42} stroke={2.4} />
          </div>
          <div className="md-headline-small" style={{ color: C('on-surface') }}>담았어요</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', maxWidth: 290 }}>
            <b>{person.name}</b>에 대한 기록을 <b>관계 별</b>로 엮는 중이에요. 관계의 결과 챙길 것을 기억해 둘게요.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <MdButton variant="tonal" icon="bubble_chart" onClick={() => { try { window.__sbPendingSeed = { mode: '2nd', title: `${person.name} 돌아보기`, intro: `${person.name}에 대해 방금 담아주셨네요. 이어서 더 들려주실래요? 요즘 이 사람과의 사이는 어떤가요?` }; } catch (e) {} go('chat'); }}>세컨비와 더</MdButton>
            <MdButton variant="filled" icon="hub" onClick={() => { if (star) go('star', star); else go('home'); }}>관계 별 보기</MdButton>
          </div>
        </div>
      </ScreenPad>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 14px' }}>
        {/* 사람 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '10px 2px 4px' }}>
          <RelAvatar name={person.name} cat={cat || person.cat} size={56} />
          <div style={{ minWidth: 0 }}>
            <div className="md-headline-small" style={{ color: C('on-surface'), fontWeight: 700 }}>{person.name}</div>
            <div className="md-body-small" style={{ color: C('on-surface-variant') }}>
              {person.phone} · 최근 연락 {relDaysAgo(person.last)}
            </div>
          </div>
        </div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '6px 2px 16px', wordBreak: 'keep-all' }}>
          이 사람과 <b style={{ color: C('on-surface') }}>나의 관계</b>를 적어요. 사실 나열이 아니라 <b style={{ color: C('on-surface') }}>어떤 사이인지·무엇을 챙기는지</b>가 세컨비에게 가장 중요한 신호예요.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 관계 유형 */}
          <div>
            <RelFieldLabel C={C} icon="diversity_3" accent>관계</RelFieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {REL_CATS.map((c) =>
                <MdChip key={c.id} variant="filter" selected={cat === c.id} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.name}</MdChip>
              )}
            </div>
          </div>

          {/* 친밀도 */}
          <div>
            <RelFieldLabel C={C} icon="favorite">친밀도</RelFieldLabel>
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9999, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
              {REL_TIERS.map(([k, lab]) => {
                const on = tier === k;
                return (
                  <button key={k} type="button" onClick={() => setTier(k)} className="md-interactive"
                    style={{ flex: 1, position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 9999, padding: '8px 0',
                      fontSize: 13.5, fontWeight: on ? 700 : 500, fontFamily: 'var(--md-ref-typeface-plain)',
                      background: on ? C('primary') : 'transparent', color: on ? C('on-primary') : C('on-surface-variant') }}>
                    <span className="md-state" />{lab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 호칭/별명 */}
          <div>
            <RelFieldLabel C={C} icon="badge">호칭 · 별명</RelFieldLabel>
            <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="평소 부르는 이름 (예: 지미, 누나)" style={relInput(C)} aria-label="호칭·별명" />
          </div>

          {/* 의미 — 가장 중요 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="favorite" size={15} style={{ color: C('primary') }} />
              <span className="md-label-medium" style={{ color: C('primary'), fontWeight: 700, whiteSpace: 'nowrap' }}>이 사람은 나에게</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C('on-primary-container'), background: C('primary-container'), borderRadius: 9999, padding: '2px 8px', whiteSpace: 'nowrap', flex: '0 0 auto' }}>★ 가장 중요</span>
            </div>
            <textarea value={meaning} onChange={(e) => setMeaning(e.target.value)} rows={3} aria-label="이 사람은 나에게"
              placeholder="어떻게 만났고 어떤 사이인지. 예: ‘대학 동아리에서 만나 10년째. 힘들 때 제일 먼저 떠오르는 사람.’"
              style={{ ...relInput(C), resize: 'none', lineHeight: 1.5, border: `1.5px solid ${C('primary')}`,
                background: `color-mix(in srgb, ${C('primary-container')} 45%, ${C('surface-container-highest')})` }} />
          </div>

          {/* 근황 */}
          <div>
            <RelFieldLabel C={C} icon="schedule">요즘 이 사람은</RelFieldLabel>
            <textarea value={recent} onChange={(e) => setRecent(e.target.value)} rows={2} aria-label="요즘 이 사람은"
              placeholder="최근 함께한 일·근황. 예: ‘이직 준비로 바빠 연락이 뜸했다.’" style={{ ...relInput(C), resize: 'none', lineHeight: 1.5 }} />
          </div>

          {/* 챙길 것 */}
          <div>
            <RelFieldLabel C={C} icon="flag">챙길 것 · 신경 쓰이는 점</RelFieldLabel>
            <textarea value={care} onChange={(e) => setCare(e.target.value)} rows={2} aria-label="챙길 것"
              placeholder="잊지 말 것·풀어야 할 것. 예: ‘다음 주 생일, 지난번 약속 미뤄 미안한 마음.’" style={{ ...relInput(C), resize: 'none', lineHeight: 1.5 }} />
          </div>

          {/* 중요한 날짜 — 달력 */}
          <div>
            <RelFieldLabel C={C} icon="event">중요한 날 (생일 · 기념일)</RelFieldLabel>
            <DatePickerField C={C} icon="cake" label="날짜" hint="달력에서 골라요" value={day} onChange={setDay} />
          </div>
        </div>
      </div>

      {/* 저장 바 */}
      <div style={{ padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" icon="check" style={{ width: '100%' }} disabled={filled === 0} onClick={() => setDone(true)}>
          {filled ? `${person.name} 담기` : '한 가지라도 적어요'}
        </MdButton>
      </div>
    </div>
  );
}

window.RelContactsScreen = RelContactsScreen;
window.RelPersonScreen = RelPersonScreen;
