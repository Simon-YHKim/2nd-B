/* ============================================================
   2nd-Brain · shared data + Material 3 UI primitives
   Exposes to window: SB (data), and M3 primitives
   (Icon, MdButton, MdIconButton, MdCard, MdChip, MdNavBar,
    Companion, MoodDot, SegBtn, ProgressLinear)
   ============================================================ */

const C = (v) => `var(--md-sys-color-${v})`;

/* ---- Layer A: 7 life-domain stars (북두칠성) + 북극성 (Polaris, layer C output).
   The 7 visible stars are LIFE DOMAINS (입력), not psychology constructs — those
   moved to the hidden validation layer B (see BIGFIVE / 북극성 종합). Polaris keeps
   its synthesis role; the 'Soul Core' name is dropped (PRD §4). ---- */
const STARS = [
{ id: 'polaris', x: 140, y: -16, big: true, label: '북극성', kind: '북극성', star: 'Polaris',
  line: '7개의 별을 모으면, 내가 또렷해져요.', route: 'me' },
{ id: 'career', x: 228, y: 90, domain: '커리어', kind: '도메인', star: 'Dubhe', level: 3,
  line: '무엇을 만들고 쌓아왔나요?', route: 'star' },
{ id: 'finance', x: 230, y: 131, domain: '재정', kind: '도메인', star: 'Merak', level: 2,
  line: '돈은 나의 무엇을 말해주나요?', route: 'star' },
{ id: 'relation', x: 174, y: 152, domain: '관계', kind: '도메인', star: 'Phecda', level: 3,
  line: '가까운 사람들과 나는 어떤가요?', route: 'star' },
{ id: 'growth', x: 151, y: 126, domain: '성장', kind: '도메인', star: 'Megrez', level: 3,
  line: '어느 시기가 지금의 나를 만들었나요?', route: 'star' },
{ id: 'health', x: 108, y: 135, domain: '건강', kind: '도메인', star: 'Alioth', level: 2,
  line: '요즘 내 컨디션과 리듬은요?', route: 'star' },
{ id: 'leisure', x: 76, y: 143, domain: '휴식', kind: '도메인', star: 'Mizar', level: 2,
  line: '무엇이 나를 쉬게 하나요?', route: 'star' },
{ id: 'community', x: 50, y: 187, domain: '커뮤니티', kind: '포탈', star: 'Alkaid', portal: true,
  line: '같은 별을 그리는 사람들이 있어요. 서로의 기록에서 배워요.', route: 'community' }];


/* dipper outline: bowl quad (closed) + handle polyline. Pointer→Polaris drawn in home. */
const STAR_LINES = [
'M228,90 L230,131 L174,152 L151,126 Z',
'M151,126 L108,135 L76,143 L50,187'];

const POLARIS_GUIDE = 'M230,131 L228,90 L140,-16';

/* ---- Bottom navigation. Constellation is the canonical home (PRD §9); the
   other tabs are the persistent entry points (담기 · 세컨비 · 위키 · 북극성 종합). ---- */
const NAV = [
{ id: 'home', label: '별자리', icon: 'star_shine' },
{ id: 'capture', label: '담기', icon: 'add_circle' },
{ id: 'chat', label: '세컨비', icon: 'forum' },
{ id: 'records', label: '위키', icon: 'inventory_2' },
{ id: 'settings', label: '설정', icon: 'tune' }];


/* ---- 3 conversation lenses. Each recolors the chat UI (PRD: no 공상모드). ---- */
const CHAT_MODES = [
{ id: '2nd', name: '세컨비', tag: '2nd-B', desc: '나를 가장 잘 아는 두 번째 뇌',
  face: window.SB_HEAD['head-front'], blank: window.SB_HEAD['head-blank'],
  accent: 'var(--ds-nebula)', soft: 'rgba(167,139,250,.16)', onSoft: 'var(--ds-nebula-soft)', glow: 'rgba(167,139,250,.5)' },
{ id: 'meta', name: '메타비', tag: 'Meta-B', desc: '나를 객관적으로 들여다보는 뇌',
  face: window.SB_HEAD['meta-face'], blank: window.SB_HEAD['meta-blank'],
  accent: 'var(--ds-core)', soft: 'rgba(70,182,255,.16)', onSoft: 'var(--c11)', glow: 'rgba(70,182,255,.5)' },
{ id: 'twi', name: '트위비', tag: 'Twi-B', desc: '내 데이터로 엉뚱한 가능성을 여는 뇌',
  face: window.SB_HEAD['twi-face'], blank: window.SB_HEAD['twi-blank'],
  accent: 'var(--ds-polaris)', soft: 'rgba(207,196,232,.16)', onSoft: 'var(--c07)', glow: 'rgba(245,230,190,.55)' }];


/* ---- Companion (small head) context lines per screen ---- */
const COMPANION = {
  home: { t: '오늘도 왔네요. 7개의 삶 별이 당신을 비추고 있어요.', tip: '가장 어두운 도메인부터 채워보면 좋아요.', mood: 'positive' },
  capture: { t: '방금 떠오른 걸 흘려보내지 말아요.', tip: '한 줄이면 충분해요. 정리는 제가 할게요.', mood: 'neutral' },
  chat: { t: '무엇이든 물어봐요. 당신 기록에서 찾아 답할게요.', tip: '"요즘 나 어때?"처럼 물어도 돼요.', mood: 'neutral' },
  records: { t: '담은 별가루이 124개, 위키로 엮였어요.', tip: '받은항목에 미분류 8개가 기다리고 있어요.', mood: 'neutral' },
  me: { t: '7개 별을 모아 지금의 당신을 그렸어요.', tip: '더 고르게 채울수록 북극성이 또렷해져요.', mood: 'positive' },
  settings: { t: '필요한 것만 켜고, 나머지는 꺼두세요.', tip: '연동과 권한은 언제든 바꿀 수 있어요.', mood: 'neutral' },
  bigfive: { t: '외향성은 관계·휴식 별이 함께 받쳐줘요.', tip: '여러 도메인이 같이 가리키면 더 또렷해져요.', mood: 'positive' },
  audit: { t: '시기를 하나 고르면 그때의 당신을 같이 떠올려봐요.', tip: '기억은 또렷하지 않아도 괜찮아요.', mood: 'neutral' },
  interview: { t: '같은 걸 여러 번 되물을게요. 더 또렷해지려고요.', tip: '답이 매번 달라도 괜찮아요.', mood: 'neutral' },
  record: { t: '이 별가루은 \'관계\' 별과 이어져요.', tip: '태그를 직접 고치면 더 잘 분류해요.', mood: 'neutral' }
};

/* ---- Companion observations: simple read-outs on the user's current state,
   cycled in constellation (dipper) order — career → finance → relation →
   growth → health → leisure → catchall. Shown ~10s each, then advances. ---- */
const OBSERVATIONS = [
{ star: '커리어', mood: 'positive', t: '이번 주 커리어 별이 가장 밝았어요. 새로 시도한 일이 3건 쌓였네요.' },
{ star: '재정', mood: 'neutral', t: '재정 기록이 2주째 잠잠해요. 구독 점검을 미뤄두셨더라고요.' },
{ star: '관계', mood: 'thinking', t: '관계 별이 조금 어두워졌어요. 가까운 사람에게 안부를 전한 지 6일째예요.' },
{ star: '성장', mood: 'positive', t: '성장 별엔 독서 메모가 꾸준히 쌓이는 중이에요. 개방성 신호가 또렷해요.' },
{ star: '건강', mood: 'thinking', t: '요즘 평균 수면이 5.6시간이에요. 건강 별이 작은 신호를 보내고 있어요.' },
{ star: '휴식', mood: 'neutral', t: '이번 주 \'쉼\' 태그가 0건이에요. 휴식 별이 비어 가고 있어요.' },
{ star: '담아내기', mood: 'neutral', t: '아직 어디에도 못 담은 별가루이 8개 있어요. 정리하면 별이 더 또렷해져요.' }];


/* ── 대화 피드 — 최근 담긴 자료 · 분석 결과 · 세컨비 혼잣말이 섞인 페이지 큐.
   대화창의 ▼ 를 누르면 다음 페이지로 넘어간다. ── */
const SB_MONOLOGUE = [
{ t: '…오늘은 별이 잘 보이는 밤이네요.' },
{ t: '음… 이 기록은 어디에 둘까요.' },
{ t: '조용하네요. 나쁜 뜻은 아니고요.' },
{ t: '별가루을 만지면 손끝이 반짝여요.' },
{ t: '가끔은 아무것도 담지 않아도 괜찮아요.' },
{ t: '가만히 보고 있으면, 별이 조금씩 자라요.' }];
const SB_RESULTS = {
r1: '\'지금의 나\' 별로 보냈어요. 외향성 신호가 하나 늘었어요.',
r2: '\'리듬\' 별에 이었어요. 몰입 주제가 이번 달만 4번째예요.',
r3: '아직 어느 별에도 못 뒀어요. 한 줄만 더 있으면 정할 수 있어요.',
r4: '\'일 · 성장\' 두 별에 걸쳤어요. 독서 태그가 붙었어요.',
r5: '\'관계\' 별로 갔어요. 6일 만의 관계 기록이에요.' };
/* 세컨비가 한 번씩 꺼내는 AI 뮤지엄 이야기 — 뜨면 '보러가기' 버튼이 함께 붙는다 */
const SB_MUSEUM_TALK = [
{ id: 'a_turing', t: '1936년에 튜링이 계산이 뭔지부터 다시 물었어요. 그 질문이 지금 저를 만들었죠.' },
{ id: 'a_dartmouth', t: '1956년 한여름 워크숍에서 \u2018인공지능\u2019이라는 말이 처음 붙었어요.' },
{ id: 'a_eliza', t: '1966년 일라이자는 되묻기만 했는데 사람들이 마음을 열었대요. 듣는 게 절반이더라고요.' },
{ id: 'a_perceptron', t: '퍼셉트론은 사진 한 장 구분에도 방 하나가 필요했어요. 지금은 주머니에 들어오죠.' },
{ id: 'a_alphago', t: '2016년 이세돌과의 4국. 사람이 기계를 이긴 마지막 한 판으로 남았어요.' },
{ id: 'a_transformer', t: '2017년에 나온 한 논문이 판을 바꿨어요. 저도 그 구조 위에 서 있어요.' },
{ id: 'w_www', t: 'CERN의 낡은 컴퓨터 한 대가 최초의 웹 서버였어요. 종이 한 장 붙여뒀대요 — 끄지 마세요.' },
{ id: 'w_moon', t: '아폴로 11호의 컴퓨터는 지금 계산기보다 느렸어요. 그래도 달에 갔죠.' }];

/* 위키 첫 진입 튜토리얼 — 이 화면에 무엇이 있는지만 알려주고 물러난다 */
const SB_WIKI_TOUR = [
{ kind: '위키', line: '담은 별가루이 여기 모여요. 비슷한 것끼리 선으로 이어져 별자리가 돼요.' },
{ kind: '둘러보기', line: '끌어서 옮기고, 두 손가락(휠)으로 크기를 바꿔요. 점을 누르면 그 기록이 열려요.' },
{ kind: '필터', line: '왼쪽 위 필터로 별·기간·태그를 좁혀 볼 수 있어요. 오른쪽 위 숫자는 지금 보이는 개수예요.' }];

function sbDialogFeed() {
  const pages = [];
  RECORDS.slice(0, 5).forEach((r, i) => {
    pages.push({ kind: '방금 담김', meta: `${r.time} · ${r.type === 'text' ? '글' : r.type === 'link' ? '링크' : r.type === 'voice' ? '음성' : r.type === 'photo' ? '사진' : '할 일'}로 담았어요.`, line: r.title,
      route: 'record', routeParam: r, cta: '이 글 보기', ctaIcon: 'description' });
    if (SB_RESULTS[r.id]) pages.push({ kind: '분석 결과', line: SB_RESULTS[r.id],
      route: 'record', routeParam: r, cta: '이 글 보기', ctaIcon: 'description' });
    if (i % 2 === 1) pages.push({ kind: '혼잣말', line: SB_MONOLOGUE[(i / 2 | 0) % SB_MONOLOGUE.length].t });
  });
  OBSERVATIONS.forEach((o, i) => {
    pages.push({ kind: o.star, line: o.t });
    if (i % 3 === 2) pages.push({ kind: '혼잣말', line: SB_MONOLOGUE[(3 + i / 3 | 0) % SB_MONOLOGUE.length].t });
    /* 관찰 두 개마다 뮤지엄 한 조각 — 보러가기 버튼이 붙는다 */
    if (i % 2 === 1) {
      const m = SB_MUSEUM_TALK[(i / 2 | 0) % SB_MUSEUM_TALK.length];
      pages.push({ kind: 'AI 뮤지엄', line: m.t, route: 'museum', routeParam: { focusId: m.id }, cta: '보러가기' });
    }
  });
  return pages;
}

/* ---- Mock records ---- */
const RECORDS = [
{ id: 'r1', type: 'text', icon: 'edit_note', title: '오늘 회의에서 내가 먼저 말을 꺼냈다', time: '방금', tags: ['외향성', '일'], star: '지금의 나' },
{ id: 'r2', type: 'link', icon: 'link', title: '몰입에 대한 칼 뉴포트 글', time: '2시간 전', tags: ['리듬', '학습'], star: '리듬' },
{ id: 'r3', type: 'voice', icon: 'mic', title: '산책하며 떠오른 생각 (0:42)', time: '오전 9:14', tags: ['미분류'], star: null },
{ id: 'r4', type: 'photo', icon: 'photo_camera', title: '서점에서 찍은 책 표지', time: '어제', tags: ['독서'], star: '일 · 성장' },
{ id: 'r5', type: 'todo', icon: 'check_circle', title: '엄마에게 전화하기', time: '어제', tags: ['관계'], star: '관계 · 지식' },
{ id: 'r6', type: 'text', icon: 'edit_note', title: '요즘 너무 쫓기듯 산다는 느낌', time: '2일 전', tags: ['리듬', '신경성'], star: '리듬' }];


const BIGFIVE = [
{ k: '개방성', v: 72 },
{ k: '성실성', v: 58 },
{ k: '외향성', v: 41, delta: 6 },
{ k: '우호성', v: 67 },
{ k: '신경성', v: 39 }];


const ERAS = [
{ k: '유아기', range: '0–6세', level: 1 },
{ k: '아동기', range: '7–12세', level: 2 },
{ k: '청소년기', range: '13–18세', level: 3 },
{ k: '청년기', range: '19–28세', level: 4 },
{ k: '현재', range: '지금', level: 3 }];


const CAPTURE_MODES = [
{ id: 'text', icon: 'edit', label: '글' },
{ id: 'link', icon: 'link', label: '링크' },
{ id: 'photo', icon: 'photo_camera', label: '사진' },
{ id: 'voice', icon: 'mic', label: '음성' },
{ id: 'todo', icon: 'check_circle', label: '할 일' }];


window.SB = { C, STARS, STAR_LINES, POLARIS_GUIDE, NAV, CHAT_MODES, COMPANION, OBSERVATIONS, RECORDS, BIGFIVE, ERAS, CAPTURE_MODES, dialogFeed: sbDialogFeed, WIKI_TOUR: SB_WIKI_TOUR };

/* =====================================================================
   M3 PRIMITIVES
   ===================================================================== */
const { useState, useRef, useEffect } = React;

/* ── Brand glyphs — 16×16 픽셀 그리드에 정수 좌표 rect 로만 그린다.
   곡선·안티에일리어싱 0. 네이버 N(Galmuri 글자)과 같은 결. ── */
function PixBrand({ name, size = 20 }) {
  const G = {
    /* 말풍선 + 왼쪽 아래 꼬리 */
    kakao: [[4,2,8,1],[2,3,12,1],[1,4,14,4],[2,8,12,1],[4,9,8,1],[5,10,3,1],[4,11,3,1],[3,12,3,1]],
    /* 옥토캣 — 뾰족한 귀, 모서리 깎은 둥근 머리, 짧은 다리, 왼쪽 아래 꼬리 갈고리 */
    github: [[3,1,2,1],[11,1,2,1],[3,2,3,1],[10,2,3,1],[3,3,10,1],[2,4,12,1],[1,5,14,4],[2,9,12,1],[3,10,10,1],[4,11,3,1],[9,11,3,1],[0,10,2,1],[0,11,1,1]],
    /* 잎 + 줄기 + 몸통 + 오른쪽 위 베어문 자국(2×3) + 갈라진 아래 */
    apple: [[9,0,3,1],[10,1,2,1],[8,2,1,1],[4,3,3,1],[9,3,3,1],[3,4,9,1],[2,5,9,3],[2,8,11,2],[3,10,10,2],[4,12,8,1],[5,13,2,1],[9,13,2,1]]
  };
  const cells = G[name] || [];
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" fill="currentColor"
    aria-hidden="true" style={{ flex: '0 0 auto' }}>
      {cells.map((c, i) => <rect key={i} x={c[0]} y={c[1]} width={c[2]} height={c[3]} />)}
    </svg>);
}

/* 구글 G — 4색 링 + 오른쪽 가로 막대. 색은 브랜드 규정이라 리터럴 유지. */
function GoogleGlyph({ size = 20 }) {
  const R = '#EA4335', Y = '#FBBC05', Gr = '#34A853', B = '#4285F4';
  const cells = [
    [5,2,6,2,R],[3,4,2,1,R],[11,4,2,1,R],
    [2,5,2,4,Y],
    [2,9,2,2,Gr],[3,11,2,1,Gr],[5,12,6,2,Gr],
    [8,7,6,2,B],[12,9,2,2,B],[11,11,2,1,B]
  ];
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges"
    aria-hidden="true" style={{ flex: '0 0 auto' }}>
      {cells.map((c, i) => <rect key={i} x={c[0]} y={c[1]} width={c[2]} height={c[3]} fill={c[4]} />)}
    </svg>);
}
const BrandGlyph = PixBrand;

/* ── Shared auth form — email + password primary, 로그인 / 회원가입,
   then a row of equal-size social icon buttons under "또 다른 방법".
   Used by both the onboarding last slide and the standalone AuthScreen. ── */
function AuthProviders({ onPick, mode = 'signin' }) {
  const C = window.SB.C;
  const pick = onPick || (() => {});
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [show, setShow] = React.useState(false);
  const socials = [
  { k: 'kakao', label: '카카오로 계속', node: <BrandGlyph name="kakao" size={24} />, bg: '#FEE500', fg: '#181600' },
  { k: 'naver', label: '네이버로 계속', node: <span style={{ fontWeight: 700, fontSize: 24, lineHeight: 1, fontFamily: 'var(--font-ui)' }}>N</span>, bg: '#03C75A', fg: 'var(--c08)' },
  { k: 'github', label: 'GitHub로 계속', node: <BrandGlyph name="github" size={24} />, bg: '#1F2328', fg: 'var(--c08)' },
  { k: 'google', label: 'Google로 계속', node: <GoogleGlyph size={24} />, bg: 'var(--c08)', fg: '#111' },
  { k: 'apple', label: 'Apple로 계속', node: <BrandGlyph name="apple" size={24} />, bg: 'var(--c08)', fg: '#111' }];

  const Field = ({ icon, ph, val, set, type, trailing }) =>
  <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 54, padding: '0 14px', borderRadius: 0,
    background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)' }}>
      <Icon name={icon} size={20} style={{ color: 'var(--fg-muted)', flex: '0 0 auto' }} />
      <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph} type={type}
    autoCapitalize="none" autoCorrect="off" spellCheck={false}
    style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
      color: 'var(--c07)', fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }} />
      {trailing}
    </div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* email + password — the base inputs */}
      <Field icon="forum" ph="이메일" val={email} set={setEmail} type="email" />
      <Field icon="lock" ph="비밀번호" val={pw} set={setPw} type={show ? 'text' : 'password'}
      trailing={
      <button onClick={() => setShow((v) => !v)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} className="md-interactive"
      style={{ position: 'relative', width: 34, height: 34, borderRadius: 0, border: 'none', background: 'transparent',
        cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--fg-muted)' }}>
            <span className="md-state" />
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name="visibility" size={19} />
              {show && <span aria-hidden="true" style={{ position: 'absolute', left: 1, right: 1, top: '50%', height: 2, background: 'currentColor', boxShadow: '0 -2px 0 0 var(--panel-2)' }} />}
            </span>
          </button>
      } />

      {/* 로그인 / 회원가입 — primary actions */}
      <button onClick={() => pick('login')} className="md-interactive"
      style={{ position: 'relative', height: 52, borderRadius: 0, border: 'none', cursor: 'pointer', marginTop: 3,
        background: 'var(--ds-core)', color: 'var(--c01)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, fontFamily: 'var(--md-ref-typeface-plain)' }}>
        <span className="md-state" />로그인
      </button>
      <button onClick={() => pick('signup')} className="md-interactive"
      style={{ position: 'relative', height: 52, borderRadius: 0, cursor: 'pointer', background: 'transparent',
        border: '1px solid rgba(127,182,255,.5)', color: 'var(--c11)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, fontFamily: 'var(--md-ref-typeface-plain)' }}>
        <span className="md-state" />회원가입
      </button>

      {/* social providers — all equal small icon size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 2px' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(180,205,255,.18)' }} />
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        {socials.map((b) =>
        <button key={b.k} onClick={() => pick(b.k)} className="md-interactive" aria-label={b.label} title={b.label}
        style={{ position: 'relative', flex: 1, height: 50, borderRadius: 0,
          border: b.fg === '#111' ? '1px solid rgba(180,205,255,.16)' : 'none',
          cursor: 'pointer', background: b.bg, color: b.fg, display: 'grid', placeItems: 'center' }}>
            <span className="md-state" />{b.node}
          </button>
        )}
      </div>
    </div>);

}

/* ── Shared ratify affordance for layer-B estimates (PRD invariant #1) ──
   Every AI read is a PROPOSAL, never a fact. Shows 확신%(confidence) + 근거(evidence)
   and requires 맞아요 / 조금 달라요 before anything reaches the North Star.
   State persists in localStorage so a reload keeps the user's decision. */
function RatifyBlock({ id, estimate, confidence = 60, evidence = 0, evidenceLabel = '기록', onRefine, onEvidence }) {
  const C = window.SB.C;
  const key = 'sb.ratify.' + id;
  const [state, setState] = React.useState('pending'); // pending | ratified | refined
  React.useEffect(() => {try {const v = localStorage.getItem(key);if (v) setState(v);} catch (e) {}}, [key]);
  const set = (v) => {setState(v);try {localStorage.setItem(key, v);} catch (e) {}};
  const reset = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' };
  const confColor = confidence >= 67 ? C('primary') : confidence >= 45 ? C('tertiary') : C('on-surface-variant');

  return (
    <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 14, marginTop: 26 }}>
      <div style={{ marginTop: -24 }}>
        <window.DialogBox compact kindLabel="세컨비의 짐작 · 아직 반영 안 됨" line={estimate}
        head={<SbHead size={32} track={false} />} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          color: confColor, background: C('surface-container-highest'), borderRadius: 0, padding: '3px 10px' }}>
          <span style={{ width: 7, height: 7, borderRadius: 0, background: confColor }} />확신 {confidence}%
        </span>
        <button className="md-interactive" onClick={onEvidence} style={{ ...reset,
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          color: C('on-secondary-container'), borderRadius: 0, padding: '3px 8px' }}>
          <Icon name="link" size={13} />{evidenceLabel} {evidence}건 근거<Icon name="arrow_forward" size={13} />
          <span className="md-state-layer" />
        </button>
      </div>

      {state === 'pending' &&
      <React.Fragment>
          <div className="md-body-small" style={{ color: C('on-secondary-container'), opacity: .8, margin: '12px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={13} />확인하기 전엔 북극성에 반영되지 않아요.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <MdButton variant="filled" icon="task_alt" style={{ flex: 1 }} onClick={() => set('ratified')}>맞아요</MdButton>
            <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => {set('refined');onRefine && onRefine();}}>조금 달라요</MdButton>
          </div>
        </React.Fragment>
      }
      {state === 'ratified' &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 0, background: C('surface-container-highest') }}>
          <Icon name="task_alt" size={18} fill style={{ color: C('primary') }} />
          <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>확인했어요 · 북극성에 반영돼요</span>
          <button onClick={() => set('pending')} style={{ ...reset, fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>되돌리기</button>
        </div>
      }
      {state === 'refined' &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 0, background: C('surface-container-highest') }}>
          <Icon name="forum" size={18} style={{ color: C('tertiary') }} />
          <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>더 알려주시면 다시 다듬을게요</span>
          <button onClick={() => set('pending')} style={{ ...reset, fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>취소</button>
        </div>
      }
    </MdCard>);

}

Object.assign(window, { AuthProviders, RatifyBlock, BrandGlyph, GoogleGlyph });

/* =====================================================================
   SHARED INPUT PRIMITIVES — calendar date picker + auto-grow textarea
   App-wide rule: any date is chosen from a calendar, never free-typed.
   ===================================================================== */
const SB_WD = ['일', '월', '화', '수', '목', '금', '토'];
function sbFmtDate(v) {
  if (!v) return '';
  const dt = v instanceof Date ? v : new Date(v + 'T00:00:00');
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일 (${SB_WD[dt.getDay()]})`;
}
function sbToISO(dt) {
  const m = String(dt.getMonth() + 1).padStart(2, '0'),d = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${d}`;
}

/* M3 modal date picker — calendar grid, month/year nav, today + selection states.
   Rendered as an absolute overlay inside the phone frame (like ConfirmDialog).
   futureOnly disables past days (e.g. 마감/예약); pastOnly disables future (e.g. 생일·지난 일). */
function CalendarSheet({ value, title = '날짜 선택', onChange, onClose, futureOnly, pastOnly }) {
  const C = window.SB.C;
  const today = new Date();today.setHours(0, 0, 0, 0);
  const initSel = value ? new Date(value + 'T00:00:00') : null;
  const valid = initSel && !isNaN(initSel.getTime());
  const base = valid ? initSel : today;
  const [view, setView] = React.useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const [sel, setSel] = React.useState(valid ? initSel : null);
  const [yearPick, setYearPick] = React.useState(false);

  const y = view.getFullYear(),m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const disabled = (d) => {const dt = new Date(y, m, d);if (futureOnly && dt < today) return true;if (pastOnly && dt > today) return true;return false;};
  const shift = (delta) => setView(new Date(y, m + delta, 1));
  const years = [];for (let yy = today.getFullYear() - 100; yy <= today.getFullYear() + 10; yy++) years.push(yy);

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'var(--ds-scrim-mix)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 344, background: C('surface-container-high'), borderRadius: 0, padding: '20px 16px 14px', boxShadow: 'none' }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), padding: '0 8px' }}>{title}</div>
        <div className="md-headline-small" style={{ color: C('on-surface'), padding: '2px 8px 12px', fontSize: 24, fontWeight: 700 }}>
          {sel ? `${sel.getMonth() + 1}월 ${sel.getDate()}일 (${SB_WD[sel.getDay()]})` : '날짜를 골라요'}
        </div>
        <div style={{ borderTop: `1px solid ${C('outline-variant')}`, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px 6px' }}>
            <button onClick={() => setYearPick((p) => !p)} className="md-interactive"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: C('on-surface'), fontWeight: 700, fontSize: 15, padding: '6px 8px', borderRadius: 0, fontFamily: 'var(--md-ref-typeface-plain)' }}>
              <span className="md-state" />{y}년 {m + 1}월 <Icon name={yearPick ? 'expand_less' : 'expand_more'} size={18} />
            </button>
            <div style={{ flex: 1 }} />
            {!yearPick && <React.Fragment>
              <MdIconButton name="chevron_left" iconSize={22} onClick={() => shift(-1)} />
              <MdIconButton name="chevron_right" iconSize={22} onClick={() => shift(1)} />
            </React.Fragment>}
          </div>

          {yearPick ?
          <div style={{ height: 252, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: 4 }}>
              {years.map((yy) =>
            <button key={yy} onClick={() => {setView(new Date(yy, m, 1));setYearPick(false);}} className="md-interactive"
            style={{ position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 0, padding: '10px 0', fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: yy === y ? 700 : 500,
              background: yy === y ? C('primary') : 'transparent', color: yy === y ? C('on-primary') : C('on-surface') }}>
                  <span className="md-state" />{yy}
                </button>
            )}
            </div> :

          <React.Fragment>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
                {SB_WD.map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '4px 0', color: i === 0 ? C('error') : C('on-surface-variant') }}>{w}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {cells.map((d, i) => {
                if (d === null) return <div key={'e' + i} />;
                const dt = new Date(y, m, d),isSel = sameDay(dt, sel),isToday = sameDay(dt, today),dis = disabled(d);
                return (
                  <button key={d} disabled={dis} onClick={() => setSel(dt)} className={dis ? '' : 'md-interactive'}
                  style={{ position: 'relative', aspectRatio: '1', border: 'none', cursor: dis ? 'default' : 'pointer', borderRadius: 0,
                    background: isSel ? C('primary') : 'transparent',
                    color: dis ? C('outline') : isSel ? C('on-primary') : i % 7 === 0 ? C('error') : C('on-surface'),
                    fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: isSel || isToday ? 700 : 500, opacity: dis ? .45 : 1,
                    boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${C('primary')}` : 'none' }}>
                      <span className="md-state" />{d}
                    </button>);

              })}
              </div>
            </React.Fragment>
          }
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 10 }}>
          <MdButton variant="text" onClick={onClose}>취소</MdButton>
          <MdButton variant="text" onClick={() => {if (sel) onChange(sbToISO(sel));onClose();}}>확인</MdButton>
        </div>
      </div>
    </div>);

}

/* Tappable date field — looks like a text field but opens the calendar. */
function DatePickerField({ icon = 'calendar_today', label, hint = '날짜를 골라요', value, onChange, C, futureOnly, pastOnly }) {
  const CC = C || window.SB.C;
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      {label &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {icon && <Icon name={icon} size={15} style={{ color: CC('on-surface-variant') }} />}
          <span className="md-label-medium" style={{ color: CC('on-surface-variant') }}>{label}</span>
        </div>
      }
      <button onClick={() => setOpen(true)} className="md-interactive"
      style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        border: `1px solid ${CC('outline-variant')}`, borderRadius: 0, padding: '11px 13px', cursor: 'pointer', background: CC('surface-container-highest') }}>
        <span className="md-state" />
        <span style={{ flex: 1, minWidth: 0, color: value ? CC('on-surface') : CC('on-surface-variant'), fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }}>
          {value ? sbFmtDate(value) : hint}
        </span>
        <Icon name="calendar_today" size={18} style={{ color: CC('on-surface-variant') }} />
      </button>
      {open && <CalendarSheet value={value} title={label || '날짜 선택'} futureOnly={futureOnly} pastOnly={pastOnly}
      onChange={onChange} onClose={() => setOpen(false)} />}
    </div>);

}

/* Auto-growing textarea — height follows content (no inner scroll), and on focus
   nudges its scroll container so the caret isn't hidden behind the keyboard/footer.
   Mark the scrolling ancestor with data-scroll for the keyboard-safe nudge. */
function AutoTextarea({ value, onChange, placeholder, C, minRows = 3, style }) {
  const CC = C || window.SB.C;
  const ref = React.useRef(null);
  const resize = () => {const el = ref.current;if (!el) return;el.style.height = 'auto';el.style.height = el.scrollHeight + 'px';};
  React.useEffect(() => {resize();}, [value]);
  const onFocus = (e) => {
    const el = e.target,scroller = el.closest('[data-scroll]');
    setTimeout(() => {
      if (!scroller) return;
      const er = el.getBoundingClientRect(),sr = scroller.getBoundingClientRect();
      const over = er.bottom - (sr.bottom - 16);
      if (over > 0) scroller.scrollTop += over;
    }, 60);
  };
  return (
    <textarea ref={ref} value={value} onChange={(ev) => {onChange(ev.target.value);resize();}} placeholder={placeholder} rows={minRows} onFocus={onFocus}
    style={{ width: '100%', resize: 'none', overflow: 'hidden', minHeight: minRows * 24 + 22, border: `1px solid ${CC('outline-variant')}`, borderRadius: 0, padding: '11px 13px',
      background: CC('surface-container-highest'), color: CC('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, lineHeight: 1.5, outline: 'none', ...style }} />);

}

Object.assign(window, { CalendarSheet, DatePickerField, AutoTextarea, sbFmtDate, TimeSheet });

/* M3 modal time picker — hour/minute dials + AM·PM. Returns a display string like
   "오후 8:00". Rendered as an absolute overlay inside the phone frame. */
function TimeSheet({ value, title = '시간 선택', onChange, onClose }) {
  const C = window.SB.C;
  // parse "오후 8:00" / "오전 9:30" / "23:30" into 24h h/m
  const parse = (v) => {
    if (!v) return { h: 8, m: 0 };
    const pm = /오후|PM/i.test(v),am = /오전|AM/i.test(v);
    const mt = v.match(/(\d{1,2}):(\d{2})/);
    if (!mt) return { h: 8, m: 0 };
    let h = +mt[1];const m = +mt[2];
    if (pm && h < 12) h += 12;if (am && h === 12) h = 0;
    return { h, m };
  };
  const init = parse(value);
  const [h24, setH] = React.useState(init.h);
  const [min, setMin] = React.useState(init.m);
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const setMeridiem = (toPm) => {if (toPm && h24 < 12) setH(h24 + 12);if (!toPm && h24 >= 12) setH(h24 - 12);};
  const setHour12 = (v) => {const base = v % 12;setH(pm ? base + 12 : base);};
  const fmt = () => `${pm ? '오후' : '오전'} ${h12}:${String(min).padStart(2, '0')}`;
  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const Big = ({ active, children }) =>
  <span style={{ fontSize: 45, fontWeight: 700, fontFamily: 'var(--md-ref-typeface-plain)',
    color: active ? C('primary') : C('on-surface'), lineHeight: 1 }}>{children}</span>;

  const Dial = ({ items, sel, onPick, pad2 }) =>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
      {items.map((v) => {
      const on = v === sel;
      return (
        <button key={v} onClick={() => onPick(v)} className="md-interactive"
        style={{ position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 0, padding: '9px 0',
          fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: on ? 700 : 500,
          background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface') }}>
            <span className="md-state" />{pad2 ? String(v).padStart(2, '0') : v}
          </button>);

    })}
    </div>;

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'var(--ds-scrim-mix)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 344, background: C('surface-container-high'), borderRadius: 0, padding: '20px 18px 14px', boxShadow: 'none' }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>{title}</div>

        {/* big read-out + AM/PM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <Big active>{h12}</Big><Big>:</Big><Big>{String(min).padStart(2, '0')}</Big>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 0, overflow: 'hidden', border: `1px solid ${C('outline-variant')}` }}>
            {[['오전', false], ['오후', true]].map(([lb, isPm]) => {
              const on = pm === isPm;
              return (
                <button key={lb} onClick={() => setMeridiem(isPm)} className="md-interactive"
                style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '9px 16px', whiteSpace: 'nowrap', fontSize: 15, fontWeight: on ? 700 : 500,
                  fontFamily: 'var(--md-ref-typeface-plain)', background: on ? C('tertiary-container') : 'transparent',
                  color: on ? C('on-tertiary-container') : C('on-surface-variant') }}>
                  <span className="md-state" />{lb}
                </button>);

            })}
          </div>
        </div>

        <div className="md-label-small" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>시</div>
        <Dial items={hours} sel={h12} onPick={setHour12} />
        <div className="md-label-small" style={{ color: C('on-surface-variant'), margin: '12px 0 6px' }}>분</div>
        <Dial items={mins} sel={min} onPick={setMin} pad2 />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 14 }}>
          <MdButton variant="text" onClick={onClose}>취소</MdButton>
          <MdButton variant="text" onClick={() => {onChange(fmt());onClose();}}>확인</MdButton>
        </div>
      </div>
    </div>);

}

/* ── Shared confirm dialog for destructive / irreversible actions (M3 basic dialog) ── */
function ConfirmDialog({ open, title, body, confirmLabel = '삭제', cancelLabel = '취소', danger, onConfirm, onClose, requireType }) {
  const C = window.SB.C;
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {if (open) setTyped('');}, [open]);
  if (!open) return null;
  const gate = requireType ? typed.trim() === requireType.trim() : true;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center',
      background: 'var(--ds-scrim-mix)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: C('surface-container-high'),
        borderRadius: 0, padding: 24, boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {danger && <Icon name="warning" size={24} style={{ color: C('error') }} />}
          <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 24 }}>{title}</div>
        </div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: requireType ? 16 : 22 }}>{body}</div>
        {requireType &&
        <div style={{ marginBottom: 22 }}>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginBottom: 8, wordBreak: 'keep-all' }}>
            계속하려면 <span style={{ color: C('error'), fontWeight: 700 }}>‘{requireType}’</span> 를 입력해 주세요.
          </div>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireType}
          autoFocus spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 0,
            background: C('surface-container-highest'), color: C('on-surface'), fontSize: 15, outline: 'none',
            border: `1.5px solid ${gate ? C('error') : C('outline-variant')}`, transition: 'border-color .15s' }} />
        </div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <MdButton variant="text" onClick={onClose}>{cancelLabel}</MdButton>
          <MdButton variant="filled" disabled={!gate} onClick={() => {if (!gate) return;onConfirm && onConfirm();onClose && onClose();}}
          style={danger ? { background: gate ? C('error') : C('surface-container-highest'), color: gate ? C('on-error') : C('on-surface-variant'), opacity: gate ? 1 : .7 } : gate ? undefined : { opacity: .5 }}>{confirmLabel}</MdButton>
        </div>
      </div>
    </div>);

}
Object.assign(window, { ConfirmDialog });

/* ===================== 신기능 데이터 · 상태 (리즈닝 · 공지) ===================== */
const NOTICES = [
{ id: 'n_140', type: 'patch', version: 'v1.4.0', date: '2026.07.17', src: '패치노트', when: '오늘', title: '리즈닝이 더 똑똑해졌어요',
  body: { list: [['bolt', '**자동 리즈닝** 토글이 생겼어요. 담는 대로 별을 이어줘요.'], ['hub', '자료를 별로 잇는 속도가 **2배** 빨라졌어요.'], ['graph_3', '위키 그래프가 더 부드럽게 움직여요.']] } },
{ id: 'n_letter', type: 'dev', date: '2026.07.14', src: '세컨비 팀', when: '3일 전', title: '세컨비의 편지 — 우리가 별을 그리는 이유', ptitle: '세컨비의 편지',
  body: { paras: ['안녕하세요, 세컨비를 만드는 팀이에요.', '여러분이 담아준 별가루가 이번 달에만 **12만 개**를 넘었어요. 하나하나가 누군가의 하루라 생각하면 조심스럽고 고맙습니다.', '다음 업데이트에선 \u2018북극성\u2019을 더 또렷하게 다듬고 있어요. 조금만 기다려 주세요.'] } },
{ id: 'n_maint', type: 'maint', date: '2026.07.20 · 03:00\u201305:00', src: '', when: '1주 전', title: '정기 서버 점검 안내', ptitle: '일요일 새벽 서버 점검이 있어요',
  body: { paras: ['이 시간엔 담기·리즈닝이 잠시 멈춰요. 담아둔 자료는 **안전하게 보관**되고 연결되면 자동 동기화돼요.'] } },
{ id: 'n_130', type: 'patch', version: 'v1.3.0', date: '2026.06.26', src: '패치노트', when: '3주 전', title: 'v1.3.0 — AI 뮤지엄이 열렸어요', ptitle: 'AI 뮤지엄이 열렸어요',
  body: { list: [['auto_stories', 'AI 발전사 **8 컬렉션**이 열렸어요. 별자리의 뮤지엄 별에서 입장해요.'], ['image', '전시 도판을 직접 담아 나만의 전시를 완성할 수 있어요.']] } },
{ id: 'n_beta', type: 'dev', date: '2026.06.05', src: '세컨비 팀', when: '6주 전', title: '베타에 함께해줘서 고마워요',
  body: { paras: ['초기 베타의 피드백 덕분에 담기와 위키가 지금의 모습이 됐어요. 늘 고마워요.'] } }];
window.SB.NOTICES = NOTICES;

/* 공지 읽음 상태 — sb_notice_seen(마지막 확인 최신 id) · sb_notice_read(읽은 id 목록) */
window.SBNotices = {
  read() {try {return JSON.parse(localStorage.getItem('sb_notice_read')) || [];} catch (e) {return [];}},
  markRead(id) {
    const r = this.read();if (!r.includes(id)) r.push(id);
    try {localStorage.setItem('sb_notice_read', JSON.stringify(r));if (id === NOTICES[0].id) localStorage.setItem('sb_notice_seen', id);} catch (e) {}
  },
  unread() {const r = this.read();return NOTICES.filter((n) => !r.includes(n.id)).length;},
  needsAutoPopup() {try {return localStorage.getItem('sb_notice_seen') !== NOTICES[0].id;} catch (e) {return true;}}
};

/* 리즈닝 — 주 2회 한도 · 자동 토글 · 비차단 실행 상태 (sb_reasoning_auto / sb_reasoning_quota) */
const REASON_MATS = [
{ id: 'm1', icon: 'notes', title: '회고 — 이번 스프린트에서 배운 것', sub: '글 · 2시간 전', short: '회고', done: '커리어 별에 연결됨' },
{ id: 'm2', icon: 'link', title: '아티클: 딥워크의 조건', sub: '링크 · 어제', short: '딥워크 아티클' },
{ id: 'm3', icon: 'mic', title: '산책 중 음성 메모', sub: '음성 0:42 · 어제', short: '음성 메모' },
{ id: 'm4', icon: 'photo_camera', title: '화이트보드 사진', sub: '사진 · 2일 전', short: '사진' },
{ id: 'm5', icon: 'check_box', title: '할 일: 멘토와 커피챗 잡기', sub: '할일 · 3일 전', short: '할 일' }];
window.SBReasoning = (() => {
  const listeners = new Set();
  const weekKey = () => {const dt = new Date();const sun = new Date(dt);sun.setHours(0, 0, 0, 0);sun.setDate(dt.getDate() - dt.getDay());return sun.toISOString().slice(0, 10);};
  let q = null;try {q = JSON.parse(localStorage.getItem('sb_reasoning_quota'));} catch (e) {}
  if (!q || q.week !== weekKey()) q = { week: weekKey(), left: 2 };
  let auto = false;try {auto = localStorage.getItem('sb_reasoning_auto') === '1';} catch (e) {}
  const st = { auto, left: q.left, running: null, results: {} };
  const save = () => {try {localStorage.setItem('sb_reasoning_quota', JSON.stringify({ week: weekKey(), left: st.left }));localStorage.setItem('sb_reasoning_auto', st.auto ? '1' : '0');} catch (e) {}};
  const emit = () => listeners.forEach((f) => f());
  let timer = null;
  return {
    state: st, MATERIALS: REASON_MATS,
    subscribe(f) {listeners.add(f);return () => listeners.delete(f);},
    setAuto(v) {st.auto = !!v;save();emit();},
    grant(n) {st.left = Math.min(2, st.left + (n || 1));save();emit();},
    cancel() {if (timer) {clearInterval(timer);timer = null;}st.running = null;emit();},
    run(ids, env) {
      if (st.left <= 0 || st.running) return false;
      const list = REASON_MATS.filter((m) => ids.includes(m.id));
      if (!list.length) return false;
      st.left -= 1;save();
      st.running = { ids: [...ids], list, done: 0, total: list.length, pct: 4 };
      emit();
      if (env && env.startJob) env.startJob(`별을 잇는 중 · ${list.length}건`, { doneMsg: '리즈닝이 끝났어요 — 별이 이어졌어요', action: '위키 보기', goTo: 'records' });
      timer = setInterval(() => {
        const r = st.running;if (!r) {clearInterval(timer);timer = null;return;}
        r.pct += 6 + Math.random() * 9;
        r.done = Math.min(r.total, Math.floor(r.pct / (100 / r.total)));
        if (r.pct >= 100) {clearInterval(timer);timer = null;list.forEach((m) => st.results[m.id] = 'done');st.running = null;}
        emit();
      }, 420);
      return true;
    },
    autoRunOnCapture() {if (!st.auto || st.left <= 0 || st.running) return;this.run([REASON_MATS[0].id], null);}
  };
})();

/* 리즈닝 잔여 pip — 픽셀 사각 pip (커스텀 유지, 색은 토큰) */
function QuotaPips({ left, total = 2, small }) {
  const s = small ? 8 : 10;
  return (
    <span style={{ display: 'inline-flex', gap: small ? 4 : 6, alignItems: 'center' }} aria-label={`남은 횟수 ${left} / ${total}`}>
      {Array.from({ length: total }).map((_, i) =>
      <span key={i} style={{ width: s, height: s, background: i < left ? 'var(--ds-core)' : 'var(--sunken)',
        boxShadow: i < left ? '0 0 0 2px var(--edge)' : '0 0 0 2px var(--edge-soft)' }} />)}
    </span>);
}
window.QuotaPips = QuotaPips;
