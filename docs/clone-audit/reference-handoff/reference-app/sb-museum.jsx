/* ============================================================
   2nd-Brain · AI 뮤지엄 — 2축 타임라인
   X축 = 시간(연표) · Y축 = 카테고리 2레인
     상단 레인: AI와 세계의 흐름 (세계사적 사건)
     하단 레인: AI 발전사
   좌우 드래그/스와이프로 시간 여행 · 이벤트 탭 → 상세 시트
     (본문 · 해시태그 · 이어진 사건 · 자료/논문 링크)
   Export: window.MuseumScreen, window.MuseumDeck(alias), window.MUSEUM
   ============================================================ */
const { useState: useMsS, useRef: useMsR, useEffect: useMsE } = React;

/* ---- lanes ---- */
const MZ_LANES = {
  world: { id: 'world', label: 'AI와 세계의 흐름', en: 'WORLD', icon: 'public',
    accent: '#5B9DFF', tint: 'rgba(91,157,255,.16)', ink: '#D4E6FF' },
  ai: { id: 'ai', label: 'AI 발전사', en: 'AI', icon: 'auto_awesome',
    accent: '#9A86FF', tint: 'rgba(154,134,255,.16)', ink: '#E7DEFF' }
};

/* ---- events (id, lane, year(number for x), ylabel(display), title, sub, body, tags, rel[ids], refs[{kind,label}]) ---- */
const MUSEUM = [
/* ===== AI와 세계의 흐름 ===== */
{ id: 'w_ww2', icon: 'military_tech', lane: 'world', year: 1942, ylabel: '1939–45', title: '2차 세계대전', sub: '전쟁이 계산을 끌어올리다',
  body: '암호를 풀기 위한 거대한 계산 수요가 최초의 전자식 컴퓨터를 낳았다. 앨런 튜링의 봄베와 콜로서스, 그리고 1945년 에니악(ENIAC)으로 이어진 계산의 폭발이 훗날 \u2018생각하는 기계\u2019라는 질문의 토대가 됐다.',
  tags: ['#앨런튜링', '#암호해독', '#에니악', '#이미테이션게임'],
  rel: ['a_turing'], refs: [{ kind: 'event', label: '에니악(ENIAC) · 1945' }, { kind: 'film', label: '영화 〈이미테이션 게임〉' }] },
{ id: 'w_sputnik', icon: 'satellite_alt', lane: 'world', year: 1957, ylabel: '1957', title: '스푸트니크 충격', sub: '냉전이 과학에 돈을 붓다',
  body: '소련의 인공위성 발사로 미국이 과학기술에 막대한 투자를 쏟았다. 이 흐름이 대학과 연구소에 컴퓨팅·AI 연구의 자금을 댔고, 곧 다트머스 회의로 이어졌다.',
  tags: ['#냉전', '#우주경쟁', '#NASA', '#아르파'],
  rel: ['a_dartmouth'], refs: [{ kind: 'event', label: 'NASA·ARPA 설립 · 1958' }] },
{ id: 'w_moon', icon: 'rocket_launch', lane: 'world', year: 1969, ylabel: '1969', title: '아폴로 11호', sub: '컴퓨터, 사람을 달에 보내다',
  body: '아폴로 가이던스 컴퓨터가 인류를 달에 안착시켰다. 작은 컴퓨터가 생명을 건 판단을 돕는다는 신뢰가 사회에 자리 잡기 시작했다.',
  tags: ['#달착륙', '#아폴로11', '#NASA'],
  rel: [], refs: [{ kind: 'event', label: '아폴로 가이던스 컴퓨터' }] },
{ id: 'w_intel', icon: 'memory', lane: 'world', year: 1971, ylabel: '1971', title: '인텔 4004', sub: '컴퓨터가 칩 하나로',
  body: '최초의 상용 마이크로프로세서가 등장했다. 무어의 법칙을 따라 값싸고 빨라진 연산이 훗날 AI를 현실로 만들 토양을 깔았다.',
  tags: ['#반도체', '#무어의법칙', '#마이크로프로세서'],
  rel: ['a_alexnet'], refs: [{ kind: 'product', label: '인텔 4004' }] },
{ id: 'w_www', icon: 'travel_explore', lane: 'world', year: 1991, ylabel: '1991', title: '월드 와이드 웹', sub: '데이터의 바다가 열리다',
  body: '팀 버너스리가 웹을 공개하며 인류의 기록이 디지털로 폭증했다. 이 방대한 데이터가 훗날 딥러닝과 거대 언어모델을 먹여 살린다.',
  tags: ['#인터넷', '#WWW', '#팀버너스리'],
  rel: ['a_dl2006'], refs: [{ kind: 'event', label: 'CERN · 웹 공개' }] },
{ id: 'w_dotcom', icon: 'trending_down', lane: 'world', year: 2000, ylabel: '2000', title: '닷컴 버블', sub: '기대와 거품, 그리고 붕괴',
  body: '인터넷에 대한 과열된 기대가 거품으로 터졌다. 기술의 약속과 현실 사이의 간극 \u2014 훗날 AI 붐을 바라보는 거울이 된다.',
  tags: ['#닷컴버블', '#IT거품', '#나스닥'],
  rel: [], refs: [{ kind: 'event', label: '나스닥 폭락 · 2000' }] },
{ id: 'w_iphone', icon: 'smartphone', lane: 'world', year: 2007, ylabel: '2007', title: '아이폰 등장', sub: '모두의 손에 컴퓨터',
  body: '스마트폰이 일상을 바꿨다. 수십억 개의 카메라·센서·터치가 만든 데이터가 모바일 AI와 딥러닝 학습의 연료가 됐다.',
  tags: ['#스마트폰', '#애플', '#모바일', '#앱스토어'],
  rel: ['a_alexnet'], refs: [{ kind: 'product', label: 'iPhone' }, { kind: 'event', label: '앱스토어 · 2008' }] },
{ id: 'w_gfc', icon: 'account_balance', lane: 'world', year: 2008, ylabel: '2008', title: '글로벌 금융위기', sub: '데이터로 위험을 읽다',
  body: '리먼 브라더스 붕괴가 세계 경제를 흔들었다. 이후 금융·산업이 데이터와 알고리즘으로 위험을 관리하려는 수요가 폭발했다.',
  tags: ['#리먼브라더스', '#서브프라임', '#금융위기'],
  rel: [], refs: [{ kind: 'event', label: '리먼 사태 · 2008' }] },
{ id: 'w_covid', icon: 'coronavirus', lane: 'world', year: 2020, ylabel: '2020', title: '코로나19 팬데믹', sub: '디지털 대전환을 앞당기다',
  body: '원격근무·비대면이 일상이 되며 디지털 전환이 몇 년을 앞당겼다. 클라우드·화상·자동화 수요가 폭증했고, AI 도구가 일과 삶에 빠르게 스며들었다.',
  tags: ['#팬데믹', '#재택근무', '#줌', '#디지털전환'],
  rel: ['a_gpt3', 'a_chatgpt'], refs: [{ kind: 'event', label: '원격근무·화상회의 확산' }] },
{ id: 'w_genai', icon: 'palette', lane: 'world', year: 2022, ylabel: '2022', title: '생성AI 붐', sub: 'AI가 대중문화가 되다',
  body: '이미지·글을 만드는 AI가 사회 전반의 화두가 됐다. 창작·교육·노동에 대한 기대와 불안이 동시에 터져 나왔다.',
  tags: ['#생성AI', '#달리', '#미드저니', '#밈'],
  rel: ['a_chatgpt'], refs: [{ kind: 'product', label: 'DALL·E · Midjourney' }] },
{ id: 'w_regul', icon: 'gavel', lane: 'world', year: 2024, ylabel: '2024', title: 'AI 규제·일상화', sub: '사회가 규칙을 묻다',
  body: '저작권·일자리·안전을 둘러싼 논의가 본격화되고, 각국이 AI 규제의 틀을 세우기 시작했다. AI가 \u2018기술\u2019을 넘어 \u2018사회 제도\u2019의 문제가 됐다.',
  tags: ['#EUAIAct', '#저작권', '#일자리', '#AI안전'],
  rel: ['a_agent'], refs: [{ kind: 'event', label: 'EU AI Act' }] },

/* ===== AI 발전사 ===== */
{ id: 'a_turing', icon: 'psychology', lane: 'ai', year: 1950, ylabel: '1950', title: '튜링 테스트', sub: '생각하는 기계라는 질문',
  body: '앨런 튜링이 "기계가 생각할 수 있는가"를 측정 가능한 질문으로 바꿨다. 대화만으로 사람과 기계를 구별할 수 없다면 그것을 지능이라 부르자는 제안.',
  tags: ['#튜링테스트', '#이미테이션게임', '#앨런튜링'],
  rel: ['w_ww2', 'a_dartmouth'], refs: [{ kind: 'paper', label: 'Computing Machinery and Intelligence (1950)' }] },
{ id: 'a_dartmouth', icon: 'groups', lane: 'ai', year: 1956, ylabel: '1956', title: '다트머스 회의', sub: 'AI의 탄생',
  body: '한여름의 워크숍에서 \u2018인공지능(AI)\u2019이라는 이름이 처음 붙었다. 이 분야가 하나의 학문으로 출발한 공식적인 순간.',
  tags: ['#AI탄생', '#존매카시', '#1956'],
  rel: ['a_perceptron'], refs: [{ kind: 'event', label: '다트머스 워크숍 · 존 매카시' }] },
{ id: 'a_perceptron', icon: 'hub', lane: 'ai', year: 1958, ylabel: '1958', title: '퍼셉트론', sub: '신경망의 씨앗',
  body: '로젠블랫의 퍼셉트론은 뇌의 뉴런을 본떠 학습하는 최초의 모델이었다. 지금의 딥러닝으로 이어지는 연결주의의 첫 불씨.',
  tags: ['#신경망', '#퍼셉트론', '#연결주의'],
  rel: ['a_winter', 'a_backprop'], refs: [{ kind: 'paper', label: 'The Perceptron · 로젠블랫' }] },
{ id: 'a_winter', icon: 'ac_unit', lane: 'ai', year: 1969, ylabel: '1969', title: '첫 AI 겨울', sub: '한계의 증명',
  body: '퍼셉트론의 한계(XOR 문제)가 수학적으로 증명되며 신경망 연구가 긴 침체에 들어갔다. 규칙 기반 기호주의가 한동안 주류가 됐다.',
  tags: ['#AI겨울', '#XOR', '#기호주의'],
  rel: [], refs: [{ kind: 'paper', label: 'Perceptrons · 민스키 & 페퍼트' }] },
{ id: 'a_backprop', icon: 'cached', lane: 'ai', year: 1986, ylabel: '1986', title: '역전파', sub: '신경망의 부활',
  body: '오차를 거슬러 가중치를 고치는 역전파가 다층 신경망의 학습을 가능하게 했다. 신경망이 첫 겨울에서 깨어나는 결정적 열쇠.',
  tags: ['#역전파', '#딥러닝씨앗', '#힌튼'],
  rel: ['a_alexnet'], refs: [{ kind: 'paper', label: 'Learning representations by back-propagating errors' }] },
{ id: 'a_deepblue', icon: 'emoji_events', lane: 'ai', year: 1997, ylabel: '1997', title: '딥블루', sub: '체스판 위의 승부',
  body: 'IBM의 딥블루가 세계 체스 챔피언 카스파로프를 이겼다. 특정 영역에서 기계가 인간 최고수를 넘은 상징적 사건.',
  tags: ['#IBM', '#체스', '#카스파로프'],
  rel: ['a_alphago'], refs: [{ kind: 'event', label: 'IBM Deep Blue vs 카스파로프' }] },
{ id: 'a_dl2006', icon: 'layers', lane: 'ai', year: 2006, ylabel: '2006', title: '딥러닝 재점화', sub: '깊게 쌓는 법',
  body: '힌튼이 깊은 신경망을 효과적으로 학습시키는 길을 다시 열었다. \u2018딥러닝\u2019이라는 말이 본격적으로 쓰이기 시작했다.',
  tags: ['#딥러닝', '#힌튼', '#DBN'],
  rel: ['a_alexnet'], refs: [{ kind: 'paper', label: 'A Fast Learning Algorithm for Deep Belief Nets' }] },
{ id: 'a_alexnet', icon: 'visibility', lane: 'ai', year: 2012, ylabel: '2012', title: '알렉스넷', sub: '눈을 뜨다',
  body: '딥 신경망이 이미지넷 인식 대회에서 압도적 격차로 우승했다. GPU로 학습한 딥러닝 시대의 시작을 알린 분수령.',
  tags: ['#이미지넷', '#GPU', '#엔비디아', '#AlexNet'],
  rel: ['a_alphago', 'w_iphone'], refs: [{ kind: 'paper', label: 'ImageNet Classification with Deep CNNs' }, { kind: 'event', label: 'ImageNet 대회' }] },
{ id: 'a_alphago', icon: 'grid_on', lane: 'ai', year: 2016, ylabel: '2016', title: '알파고', sub: '직관을 두다',
  body: '알파고가 바둑 최고수 이세돌을 4:1로 이겼다. 계산이 불가능하다던 직관의 영역마저 학습으로 넘어선 순간.',
  tags: ['#딥마인드', '#이세돌', '#바둑'],
  rel: ['a_transformer'], refs: [{ kind: 'event', label: '딥마인드 · 이세돌 5국' }, { kind: 'film', label: '다큐 〈알파고〉' }] },
{ id: 'a_transformer', icon: 'transform', lane: 'ai', year: 2017, ylabel: '2017', title: '트랜스포머', sub: '주목하라',
  body: '"Attention is all you need" \u2014 문맥을 한눈에 보는 구조가 등장했다. 오늘의 모든 거대 언어모델의 뼈대가 된 설계.',
  tags: ['#어텐션', '#구글', '#Transformer'],
  rel: ['a_gpt3'], refs: [{ kind: 'paper', label: 'Attention Is All You Need (2017)' }] },
{ id: 'a_gpt3', icon: 'open_in_full', lane: 'ai', year: 2020, ylabel: '2020', title: 'GPT-3', sub: '클수록 똑똑하다',
  body: '1750억 개의 매개변수. 모델을 키우는 것만으로 새로운 능력이 \u2018창발\u2019한다는 사실이 드러났다.',
  tags: ['#오픈AI', '#스케일링', '#1750억'],
  rel: ['a_chatgpt'], refs: [{ kind: 'paper', label: 'Language Models are Few-Shot Learners' }] },
{ id: 'a_chatgpt', icon: 'forum', lane: 'ai', year: 2022, ylabel: '2022', title: '챗GPT', sub: '모두의 AI',
  body: '대화형 AI가 두 달 만에 1억 사용자에 닿았다. 전문가의 도구였던 AI가 일상의 언어가 된 순간.',
  tags: ['#오픈AI', '#챗봇', '#1억사용자'],
  rel: ['a_agent', 'w_genai'], refs: [{ kind: 'product', label: 'ChatGPT' }] },
{ id: 'a_agent', icon: 'smart_toy', lane: 'ai', year: 2024, ylabel: '2023–', title: '에이전트 시대', sub: '스스로 일하는 AI',
  body: '모델이 도구를 쥐고(RAG·도구 사용) 여러 AI가 협업하며, 목표만 주면 스스로 계획하고 실행하기 시작했다. 대답하는 AI에서 일하는 AI로.',
  tags: ['#자율에이전트', '#RAG', '#코파일럿', '#멀티에이전트'],
  rel: ['a_2ndb'], refs: [{ kind: 'event', label: '멀티·자율 에이전트' }, { kind: 'product', label: '도구 사용 · RAG' }] },
{ id: 'a_2ndb', icon: 'neurology', lane: 'ai', year: 2026, ylabel: '곧', title: '두 번째 뇌', sub: '나를 아는 AI', here: true,
  body: '세상을 아는 AI를 넘어, 나를 아는 AI로. 당신의 기록으로 자라 당신만의 북극성을 함께 찾는 자리 \u2014 세컨비가 선 곳이다.',
  tags: ['#나를아는AI', '#북극성', '#세컨비'],
  rel: [], refs: [] }];

if (window.MZ_EXTRA) Array.prototype.push.apply(MUSEUM, window.MZ_EXTRA);
MUSEUM.sort((a, b) => a.year - b.year);
const MZ_DETAIL = window.MZ_DETAIL || {};

/* ---- geometry ---- */
const MZ = {
  START: 1936, END: 2028, PXY: 100, PAD: 88,
  TH: 400, AXIS: 196, NODE_W: 118, NODE_H: 84, GAP: 16, VGAP: 10
};
MZ.W = MZ.PAD * 2 + (MZ.END - MZ.START) * MZ.PXY;
const mzX = (y) => MZ.PAD + (y - MZ.START) * MZ.PXY;

/* ---- starfield (deterministic, painted behind the timeline) ---- */
const MZ_SKY = { w: 440, h: 900 };
function mzRng(seed) {let s = seed >>> 0;return () => {s = s * 1664525 + 1013904223 >>> 0;return s / 4294967296;};}
const MZ_STARS = (() => {
  const r = mzRng(20260317),cols = ['#CFE0FF', '#CFE0FF', '#C9BEFF', '#FFFFFF'],out = [];
  for (let i = 0; i < 96; i++) out.push({
    x: +(r() * MZ_SKY.w).toFixed(1), y: +(r() * MZ_SKY.h).toFixed(1),
    r: +(0.5 + r() * 1.7).toFixed(2), o: +(0.18 + r() * 0.62).toFixed(2),
    tw: r() < 0.22, dly: +(r() * 4.5).toFixed(2), c: cols[r() * cols.length | 0]
  });
  return out;
})();
const MZ_CONST = [
{ c: '#5B9DFF', o: 0.55, pts: [[44, 84], [90, 126], [138, 102], [178, 150], [138, 102], [118, 196]] },
{ c: '#9A86FF', o: 0.5, pts: [[332, 70], [374, 118], [348, 178], [298, 150], [374, 118], [406, 92]] },
{ c: '#7FA8FF', o: 0.42, pts: [[58, 742], [112, 710], [152, 760], [214, 726], [152, 760], [178, 816]] }];

function MzSky() {
  return (
    <svg viewBox={`0 0 ${MZ_SKY.w} ${MZ_SKY.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
      {MZ_CONST.map((cn, i) =>
      <g key={i} opacity={cn.o}>
          <polyline points={cn.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={cn.c} strokeOpacity="0.34" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          {cn.pts.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r="1.5" fill={cn.c} opacity="0.85" />)}
        </g>
      )}
      {MZ_STARS.map((s, i) =>
      <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.c}
      opacity={s.tw ? undefined : s.o} className={s.tw ? 'mz-tw' : undefined}
      style={s.tw ? { animationDelay: s.dly + 's' } : undefined} />
      )}
    </svg>);

}
const MzSkyMemo = React.memo(MzSky);

/* place a lane's events into 2 stagger rows; returns map id→pos */
function mzPlace(list, nearTop, farTop) {
  const tops = [nearTop, farTop];
  const lastX = [-1e9, -1e9];
  const minGap = MZ.NODE_W + 8;
  const out = {};
  [...list].sort((a, b) => a.year - b.year).forEach((ev) => {
    const natural = mzX(ev.year);
    const fits0 = natural - lastX[0] >= minGap;
    const fits1 = natural - lastX[1] >= minGap;
    let row;
    if (fits0 && fits1) row = lastX[0] <= lastX[1] ? 0 : 1; // both free → balance
    else if (fits0) row = 0;else
    if (fits1) row = 1;else
    row = lastX[0] <= lastX[1] ? 0 : 1; // both blocked → soonest-free
    const x = (row === 0 ? fits0 : fits1) ? natural : lastX[row] + minGap; // nudge only if needed
    lastX[row] = x;
    const top = tops[row];
    out[ev.id] = { x, top, cy: top + MZ.NODE_H / 2, row };
  });
  return out;
}

const refIcon = { paper: 'article', product: 'devices', event: 'event', film: 'movie' };
const refKo = { paper: '논문', product: '제품', event: '사건', film: '영상' };

/* representative ‘image’ plate per event: lane-tinted gradient + watermark glyph */
function MzPlate({ ev, L, radius = 13, glyph = 56, glyphOpacity = 0.22 }) {
  return (
    <React.Fragment>
      <span style={{ position: 'absolute', inset: 0, borderRadius: radius,
        background: `linear-gradient(135deg, ${L.accent}3a 0%, ${L.accent}12 48%, rgba(7,10,19,.5) 100%)` }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: radius, opacity: .55,
        background: `radial-gradient(82% 120% at 84% 18%, ${L.accent}33, transparent 62%)` }} />
      <Icon name={ev.icon || L.icon} size={glyph} style={{ position: 'absolute', right: -6, bottom: -10,
        color: L.accent, opacity: glyphOpacity, pointerEvents: 'none' }} />
    </React.Fragment>);

}

/* ===================== detail sheet ===================== */
const MZ_BY_YEAR = [...MUSEUM].sort((a, b) => a.year - b.year || (a.lane < b.lane ? -1 : 1));
function MzSheet({ ev, byId, onClose, onJump, go, order }) {
  const C = window.SB.C;
  const sw = useMsR({ down: false, x: 0, y: 0, axis: null, dx: 0 });
  const [dx, setDx] = useMsS(0);
  const dirRef = useMsR(0);
  useMsE(() => {dirRef.current = 0;});
  if (!ev) return null;
  const L = MZ_LANES[ev.lane];
  const D = MZ_DETAIL[ev.id] || {};
  const idx = order ? order.findIndex((e) => e.id === ev.id) : -1;
  const total = order ? order.length : 0;
  const step = (d) => {const j = idx + d;if (order && order[j]) {dirRef.current = d;setDx(0);onJump(order[j]);}};
  const swPD = (e) => {sw.current = { down: true, x: e.clientX, y: e.clientY, axis: null, dx: 0 };};
  const swPM = (e) => {if (!sw.current.down) return;const a = e.clientX - sw.current.x,b = e.clientY - sw.current.y;
    if (!sw.current.axis && (Math.abs(a) > 8 || Math.abs(b) > 8)) sw.current.axis = Math.abs(a) > Math.abs(b) ? 'x' : 'y';
    if (sw.current.axis === 'x') {let d = a;if (d > 0 && idx <= 0 || d < 0 && idx >= total - 1) d *= 0.3;sw.current.dx = d;setDx(d);}};
  const swPU = () => {if (sw.current.axis === 'x') {const d = sw.current.dx || 0;
      if (d <= -60 && idx < total - 1) step(1);else if (d >= 60 && idx > 0) step(-1);else setDx(0);}
    sw.current.down = false;sw.current.axis = null;sw.current.dx = 0;};
  const animName = dirRef.current > 0 ? 'mz-card-r' : dirRef.current < 0 ? 'mz-card-l' : 'sb-graph-sheet-up';
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(4,7,14,.6)', display: 'flex', alignItems: 'flex-end' }}>
      <style>{`@keyframes mz-card-r{from{transform:translateX(48px);opacity:.25}to{transform:translateX(0);opacity:1}}@keyframes mz-card-l{from{transform:translateX(-48px);opacity:.25}to{transform:translateX(0);opacity:1}}`}</style>
      <div key={ev.id} onClick={(e) => e.stopPropagation()} onPointerDown={swPD} onPointerMove={swPM} onPointerUp={swPU} onPointerCancel={swPU}
        style={{ width: '100%', maxHeight: '90%', overflowY: 'auto', touchAction: 'pan-y',
        background: '#0B1120', borderTopLeftRadius: 24, borderTopRightRadius: 24, border: `1px solid ${L.accent}44`, borderBottom: 'none',
        boxShadow: '0 -10px 40px rgba(0,0,0,.55)', transform: `translateX(${dx}px)`,
        transition: sw.current.down ? 'none' : 'transform .22s var(--md-sys-motion-easing-emphasized)',
        animation: `${animName} .3s var(--md-sys-motion-easing-emphasized)` }}>
        {/* swipe / step between events */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 0' }}>
          <button className="md-interactive" onClick={() => step(-1)} disabled={idx <= 0}
          style={{ position: 'relative', width: 34, height: 34, borderRadius: 9999, border: 'none', display: 'grid', placeItems: 'center', cursor: idx <= 0 ? 'default' : 'pointer', background: 'rgba(255,255,255,.05)', color: idx <= 0 ? 'rgba(255,255,255,.2)' : L.accent }}>
            <span className="md-state" /><Icon name="chevron_left" size={20} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)' }} />
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'rgba(167,183,210,.7)' }}>{idx + 1} / {total}</div>
          </div>
          <button className="md-interactive" onClick={() => step(1)} disabled={idx >= total - 1}
          style={{ position: 'relative', width: 34, height: 34, borderRadius: 9999, border: 'none', display: 'grid', placeItems: 'center', cursor: idx >= total - 1 ? 'default' : 'pointer', background: 'rgba(255,255,255,.05)', color: idx >= total - 1 ? 'rgba(255,255,255,.2)' : L.accent }}>
            <span className="md-state" /><Icon name="chevron_right" size={20} />
          </button>
        </div>
        <div style={{ padding: '10px 20px 24px' }}>
          {/* lane + year */}
          <div style={{ position: 'relative', height: 150, borderRadius: 16, overflow: 'hidden', marginBottom: 14, border: `1px solid ${L.accent}33` }}>
            <MzPlate ev={ev} L={L} radius={16} glyph={150} glyphOpacity={0.26} />
            <image-slot id={`mz-photo-${ev.id}`} mask="inset(0 round 16px)" placeholder=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}></image-slot>
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(8,12,22,.92), rgba(8,12,22,.15) 60%, transparent)' }} />
            <div style={{ position: 'absolute', left: 16, top: 14, zIndex: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: 'rgba(7,10,19,.5)', border: `1px solid ${L.accent}66`, backdropFilter: 'blur(4px)' }}>
                <Icon name={L.icon} size={13} style={{ color: L.accent }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: L.ink, whiteSpace: 'nowrap' }}>{L.label}</span>
              </span>
              {ev.here && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: L.accent, color: '#06121f' }}>지금 여기</span>}
            </div>
            <span style={{ position: 'absolute', right: 12, top: 13, zIndex: 3, pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 9999, background: 'rgba(7,10,19,.5)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(4px)' }}>
              <Icon name="add_a_photo" size={12} style={{ color: 'rgba(231,240,255,.8)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(231,240,255,.8)' }}>사진 추가</span>
            </span>
            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, zIndex: 3, pointerEvents: 'none' }}>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700, color: L.accent, marginBottom: 2 }}>{ev.ylabel}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-.01em', lineHeight: 1.15 }}>{ev.title}</div>
              <div className="md-body-small" style={{ color: L.ink, marginTop: 2 }}>{ev.sub}</div>
            </div>
          </div>
          <div className="md-body-medium" style={{ color: 'rgba(220,232,255,.8)', lineHeight: 1.65, wordBreak: 'keep-all' }}>{ev.body}</div>

          {/* deeper explanation */}
          {D.long &&
          <div className="md-body-medium" style={{ color: 'rgba(199,213,240,.72)', lineHeight: 1.72, wordBreak: 'keep-all', marginTop: 10 }}>{D.long}</div>}

          {/* key facts */}
          {D.facts && D.facts.length > 0 &&
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
            {D.facts.map((f, i) =>
            <div key={i} style={{ padding: '9px 12px', borderRadius: 12, background: L.tint, border: `1px solid ${L.accent}22` }}>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9.5, letterSpacing: '.1em', color: L.accent, marginBottom: 3 }}>{f[0]}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#EAF2FF', wordBreak: 'keep-all', lineHeight: 1.3 }}>{f[1]}</div>
            </div>
            )}
          </div>}

          {/* cause → effect */}
          {(D.cause || D.effect) &&
          <div style={{ marginTop: 18, borderRadius: 14, overflow: 'hidden', border: `1px solid ${L.accent}26`, background: 'rgba(255,255,255,.02)' }}>
            {D.cause &&
            <div style={{ display: 'flex', gap: 11, padding: '11px 13px' }}>
              <Icon name="south" size={15} style={{ color: L.accent, flex: '0 0 auto', marginTop: 1 }} />
              <div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9.5, letterSpacing: '.12em', color: L.accent, marginBottom: 3 }}>배경</div>
                <div style={{ fontSize: 13, color: 'rgba(214,226,248,.82)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{D.cause}</div>
              </div>
            </div>}
            {D.cause && D.effect && <div style={{ height: 1, background: `${L.accent}1e`, margin: '0 13px' }} />}
            {D.effect &&
            <div style={{ display: 'flex', gap: 11, padding: '11px 13px' }}>
              <Icon name="north_east" size={15} style={{ color: L.accent, flex: '0 0 auto', marginTop: 1 }} />
              <div>
                <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9.5, letterSpacing: '.12em', color: L.accent, marginBottom: 3 }}>영향</div>
                <div style={{ fontSize: 13, color: 'rgba(214,226,248,.82)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{D.effect}</div>
              </div>
            </div>}
          </div>}

          {/* hashtags */}
          {ev.tags && ev.tags.length > 0 &&
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
            {ev.tags.map((tg) =>
            <span key={tg} style={{ fontSize: 12, fontWeight: 600, color: L.ink, padding: '5px 11px', borderRadius: 9999, background: L.tint, border: `1px solid ${L.accent}33` }}>{tg}</span>
            )}
          </div>}

          {/* linked events */}
          {ev.rel && ev.rel.filter((id) => byId[id]).length > 0 &&
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.16em', color: 'rgba(167,183,210,.7)', marginBottom: 8 }}>이어진 사건</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ev.rel.filter((id) => byId[id]).map((id) => {const r = byId[id],RL = MZ_LANES[r.lane];return (
                  <button key={id} className="md-interactive" onClick={() => onJump(r)}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <span className="md-state" />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: RL.accent, flex: '0 0 auto', boxShadow: `0 0 8px ${RL.accent}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#EAF2FF' }}>{r.title}</div>
                    <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, color: RL.accent }}>{RL.label} · {r.ylabel}</div>
                  </div>
                  <Icon name="north_east" size={16} style={{ color: 'rgba(255,255,255,.4)' }} />
                </button>);
              })}
            </div>
          </div>}

          {/* references */}
          {ev.refs && ev.refs.length > 0 &&
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.16em', color: 'rgba(167,183,210,.7)', marginBottom: 8 }}>자료 · 논문</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ev.refs.map((rf, i) =>
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: L.tint }}>
                  <Icon name={refIcon[rf.kind] || 'link'} size={17} style={{ color: L.accent }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: '#EAF2FF', wordBreak: 'keep-all' }}>{rf.label}</div>
                  <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'rgba(167,183,210,.6)' }}>{refKo[rf.kind] || '링크'}</div>
                </div>
                <Icon name="open_in_new" size={15} style={{ color: 'rgba(255,255,255,.32)' }} />
              </div>
              )}
            </div>
          </div>}

          {ev.here &&
          <MdButton variant="filled" full trailingIcon="north_east" onClick={() => go('home')} style={{ marginTop: 22, background: L.accent, color: '#06121f' }}>별자리로 돌아가기</MdButton>}
        </div>
      </div>
    </div>);

}

/* ===================== MUSEUM 타임라인 ===================== */
function MuseumScreen({ t, go }) {
  const C = window.SB.C;
  const scroller = useMsR(null);
  const drag = useMsR({ down: false, x: 0, sl: 0, moved: false });
  const [sel, setSel] = useMsS(null);
  const [scrollX, setScrollX] = useMsS(0);
  const rafId = useMsR(0);
  const dialDown = useMsR(false);
  const anim = useMsR({ raf: 0, mode: 'idle', vx: 0, target: 0 });

  const world = MUSEUM.filter((e) => e.lane === 'world');
  const ai = MUSEUM.filter((e) => e.lane === 'ai');
  // world above axis (near row just above, far row higher); ai below
  const nearW = MZ.AXIS - MZ.GAP - MZ.NODE_H,farW = MZ.AXIS - MZ.GAP - MZ.NODE_H - MZ.VGAP - MZ.NODE_H;
  const nearA = MZ.AXIS + MZ.GAP,farA = MZ.AXIS + MZ.GAP + MZ.NODE_H + MZ.VGAP;
  const posW = mzPlace(world, nearW, farW);
  const posA = mzPlace(ai, nearA, farA);
  const pos = { ...posW, ...posA };
  const byId = Object.fromEntries(MUSEUM.map((e) => [e.id, e]));

  // connectors (dedup pairs)
  const links = [];
  const seen = new Set();
  MUSEUM.forEach((e) => (e.rel || []).forEach((rid) => {
    if (!pos[rid] || !pos[e.id]) return;
    const key = [e.id, rid].sort().join('|');if (seen.has(key)) return;seen.add(key);
    const a = pos[e.id],b = pos[rid];
    const src = a.x <= b.x ? e : byId[rid];
    links.push({ key, x1: a.x, y1: a.cy, x2: b.x, y2: b.cy, color: MZ_LANES[src.lane].accent, ids: [e.id, rid] });
  }));

  const decades = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  const bandCenter = {
    world: (MZ.AXIS - MZ.GAP - 2 * MZ.NODE_H - MZ.VGAP + (MZ.AXIS - MZ.GAP)) / 2,
    ai: (MZ.AXIS + MZ.GAP + (MZ.AXIS + MZ.GAP + 2 * MZ.NODE_H + MZ.VGAP)) / 2
  };

  useMsE(() => {const el = scroller.current;if (el) el.scrollLeft = mzX(2022) - el.clientWidth / 2;
    return () => {if (anim.current.raf) cancelAnimationFrame(anim.current.raf);};}, []);

  // ---- smooth motion engine: inertia after a flick + eased dial seek ----
  const clampScroll = (v) => {const el = scroller.current;if (!el) return v;return Math.max(0, Math.min(v, el.scrollWidth - el.clientWidth));};
  const stopAnim = () => {if (anim.current.raf) cancelAnimationFrame(anim.current.raf);anim.current.raf = 0;anim.current.mode = 'idle';anim.current.vx = 0;};
  const tick = () => {
    const el = scroller.current,a = anim.current;
    if (!el) {a.raf = 0;return;}
    if (a.mode === 'inertia') {
      a.vx *= 0.935;
      let nl = el.scrollLeft + a.vx;const max = el.scrollWidth - el.clientWidth;
      if (nl <= 0) {nl = 0;a.vx = 0;} else if (nl >= max) {nl = max;a.vx = 0;}
      el.scrollLeft = nl;
      if (Math.abs(a.vx) < 0.35) {a.mode = 'idle';a.raf = 0;return;}
    } else if (a.mode === 'dial') {
      const d = a.target - el.scrollLeft;
      if (Math.abs(d) < 0.5) {el.scrollLeft = a.target;a.mode = 'idle';a.raf = 0;return;}
      el.scrollLeft += d * 0.24;
    } else {a.raf = 0;return;}
    a.raf = requestAnimationFrame(tick);
  };
  const ensureTick = () => {if (!anim.current.raf) anim.current.raf = requestAnimationFrame(tick);};

  const jumpTo = (ev) => {
    stopAnim();setSel(ev);
    const el = scroller.current;if (el) el.scrollTo({ left: clampScroll(mzX(ev.year) - el.clientWidth / 2), behavior: 'smooth' });
  };

  // mouse drag-to-pan with flick inertia (touch uses native momentum scroll)
  const onDown = (e) => {if (e.pointerType !== 'mouse') return;stopAnim();const el = scroller.current;drag.current = { down: true, x: e.clientX, sl: el.scrollLeft, moved: false, lastX: e.clientX, lastT: performance.now(), vx: 0 };};
  const onMove = (e) => {if (!drag.current.down) return;const dx = e.clientX - drag.current.x;if (Math.abs(dx) > 4) drag.current.moved = true;scroller.current.scrollLeft = drag.current.sl - dx;
    const now = performance.now(),dt = now - drag.current.lastT;
    if (dt > 0) {drag.current.vx = (e.clientX - drag.current.lastX) / dt;drag.current.lastX = e.clientX;drag.current.lastT = now;}};
  const onUp = () => {if (!drag.current.down) return;drag.current.down = false;
    let v = -drag.current.vx * 16;v = Math.max(-90, Math.min(90, v));
    if (Math.abs(v) > 1.4) {anim.current.mode = 'inertia';anim.current.vx = v;ensureTick();}};
  const tapNode = (ev) => {if (drag.current.moved) {drag.current.moved = false;return;}setSel(ev);};
  const onWheel = (e) => {const el = scroller.current;if (!el) return;if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;if (!e.deltaY) return;stopAnim();el.scrollLeft = clampScroll(el.scrollLeft + e.deltaY);};

  // year dial ↔ scroll (two-way)
  const onScroll = (e) => {const sl = e.currentTarget.scrollLeft;if (rafId.current) return;rafId.current = requestAnimationFrame(() => {rafId.current = 0;setScrollX(sl);});};
  const dialSeek = (clientX, tr) => {let f = (clientX - tr.left) / tr.width;f = f < 0 ? 0 : f > 1 ? 1 : f;const yr = MZ.START + f * (MZ.END - MZ.START);const el = scroller.current;if (!el) return;anim.current.mode = 'dial';anim.current.target = clampScroll(mzX(yr) - el.clientWidth / 2);ensureTick();};
  const onDialDown = (e) => {dialDown.current = true;stopAnim();try {e.currentTarget.setPointerCapture(e.pointerId);} catch (_) {}dialSeek(e.clientX, e.currentTarget.getBoundingClientRect());};
  const onDialMove = (e) => {if (dialDown.current) dialSeek(e.clientX, e.currentTarget.getBoundingClientRect());};
  const onDialUp = () => {dialDown.current = false;};

  const Node = (ev) => {
    const p = pos[ev.id],L = MZ_LANES[ev.lane],on = sel && sel.id === ev.id;
    return (
      <button key={ev.id} onClick={() => tapNode(ev)} className="md-interactive"
      style={{ position: 'absolute', left: p.x - MZ.NODE_W / 2, top: p.top, width: MZ.NODE_W, height: MZ.NODE_H,
        padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', borderRadius: 14, background: '#0B1120',
        border: `1.5px solid ${on ? L.accent : ev.here ? L.accent + 'aa' : 'rgba(255,255,255,.12)'}`,
        boxShadow: on ? `0 8px 22px rgba(0,0,0,.5), 0 0 0 3px ${L.accent}33` : ev.here ? `0 0 16px ${L.accent}55` : '0 6px 16px rgba(0,0,0,.4)',
        zIndex: on ? 6 : 3, transition: 'border-color .2s, box-shadow .2s' }}>
        <MzPlate ev={ev} L={L} radius={12} glyph={62} glyphOpacity={on ? 0.34 : 0.22} />
        <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,9,16,.94) 16%, rgba(6,9,16,.32) 54%, transparent)' }} />
        <span className="md-state" />
        <span style={{ position: 'absolute', top: 7, left: 10, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 700, color: L.accent, letterSpacing: '.04em', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{ev.ylabel}</span>
        {ev.here && <span style={{ position: 'absolute', top: 8, right: 9, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 8.5, fontWeight: 800, color: L.accent, letterSpacing: '.1em' }}>NOW</span>}
        <span style={{ position: 'absolute', left: 10, right: 9, bottom: 8, fontSize: 12.5, fontWeight: 700, color: '#fff', lineHeight: 1.16, wordBreak: 'keep-all', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}>{ev.title}</span>
      </button>);

  };

  const viewW = scroller.current ? scroller.current.clientWidth : 360;
  const curYear = Math.max(MZ.START, Math.min(MZ.END - 1, MZ.START + (scrollX + viewW / 2 - MZ.PAD) / MZ.PXY));
  const yearFrac = (curYear - MZ.START) / (MZ.END - MZ.START);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', boxSizing: 'border-box', paddingTop: 92,
      background: 'radial-gradient(120% 60% at 50% 4%, rgba(40,86,150,.42), transparent 58%), radial-gradient(86% 56% at 86% 16%, rgba(120,96,210,.22), transparent 58%), #05070F' }}>
      <style>{`@keyframes mz-tw{0%,100%{opacity:.2}50%{opacity:.92}}.mz-tw{animation:mz-tw 4.5s ease-in-out infinite}.mz-hscroll::-webkit-scrollbar{height:0;width:0;display:none}`}</style>
      <MzSkyMemo />
      {/* range + swipe hint */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 8px' }}>
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10.5, fontWeight: 700, color: 'rgba(159,184,222,.7)', letterSpacing: '.04em' }}>1936 — 2026</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9.5, color: 'rgba(159,184,222,.7)', whiteSpace: 'nowrap' }}>
          <Icon name="swipe" size={13} style={{ color: 'rgba(159,184,222,.7)' }} />좌우로 시간 탐색
        </span>
      </div>

      {/* timeline viewport: horizontal scroller + pinned Y-axis */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
      <div ref={scroller} className="mz-hscroll" onScroll={onScroll} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', touchAction: 'pan-x', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', display: 'flex', alignItems: 'center', cursor: drag.current.down ? 'grabbing' : 'grab' }}>
        <div style={{ position: 'relative', width: MZ.W, height: MZ.TH, flex: '0 0 auto' }}>
          {/* svg: gridlines, axis, stems, connectors */}
          <svg width={MZ.W} height={MZ.TH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            {/* decade gridlines */}
            {decades.map((d) => <line key={d} x1={mzX(d)} y1={14} x2={mzX(d)} y2={MZ.TH - 8} stroke="rgba(127,178,255,.09)" strokeWidth="1" />)}
            {/* axis */}
            <line x1={MZ.PAD - 30} y1={MZ.AXIS} x2={MZ.W - MZ.PAD + 30} y2={MZ.AXIS} stroke="rgba(127,178,255,.35)" strokeWidth="1.5" />
            {/* now marker */}
            <line x1={mzX(2026)} y1={20} x2={mzX(2026)} y2={MZ.TH - 8} stroke="#9A86FF" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="3 4" />
            {/* connectors */}
            {links.map((lk) => {
                const active = sel && lk.ids.includes(sel.id);
                const mx = (lk.x1 + lk.x2) / 2,my = (lk.y1 + lk.y2) / 2 + (Math.abs(lk.x1 - lk.x2) < 4 ? 0 : lk.y1 < lk.y2 ? -18 : 18);
                return <path key={lk.key} d={`M ${lk.x1} ${lk.y1} Q ${mx} ${my} ${lk.x2} ${lk.y2}`} fill="none"
                stroke={lk.color} strokeOpacity={active ? .9 : .22} strokeWidth={active ? 2 : 1.2} />;
              })}
            {/* stems + axis dots */}
            {MUSEUM.map((ev) => {const p = pos[ev.id],L = MZ_LANES[ev.lane],on = sel && sel.id === ev.id;
                const inner = p.top < MZ.AXIS ? p.top + MZ.NODE_H : p.top; // bottom edge if above, top edge if below
                return <g key={ev.id}>
                <line x1={p.x} y1={MZ.AXIS} x2={p.x} y2={inner} stroke={on ? L.accent : L.accent} strokeOpacity={on ? .8 : .3} strokeWidth={on ? 1.8 : 1} />
                <circle cx={p.x} cy={MZ.AXIS} r={on ? 5 : 3.5} fill={L.accent} />
                {on && <circle cx={p.x} cy={MZ.AXIS} r="8" fill="none" stroke={L.accent} strokeOpacity=".5" />}
              </g>;
              })}
          </svg>
          {/* decade labels on axis */}
          {decades.map((d) =>
            <div key={d} style={{ position: 'absolute', left: mzX(d), top: MZ.AXIS + 8, transform: 'translateX(-50%)',
              fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 700, color: 'rgba(159,184,222,.5)', pointerEvents: 'none' }}>{d}</div>
            )}
          {/* nodes */}
          {MUSEUM.map(Node)}
        </div>
      </div>
        {/* pinned Y-axis lane labels (stay while timeline scrolls) */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 42, pointerEvents: 'none', zIndex: 9, display: 'flex', alignItems: 'center',
          background: 'linear-gradient(to right, rgba(7,10,19,.95) 28%, rgba(7,10,19,.5) 72%, transparent)' }}>
          <div style={{ position: 'relative', height: MZ.TH, width: '100%' }}>
            {Object.values(MZ_LANES).map((L) =>
            <div key={L.id} style={{ position: 'absolute', left: 7, top: bandCenter[L.id], transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: L.accent, boxShadow: `0 0 8px ${L.accent}` }} />
              <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 11, fontWeight: 800, letterSpacing: '.02em', color: L.ink, textShadow: '0 1px 6px rgba(0,0,0,.9)', whiteSpace: 'nowrap' }}>{L.label}</span>
            </div>
            )}
          </div>
        </div>
      </div>
      {/* year dial / scrubber */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px 14px' }}>
        <div style={{ width: 52, flex: '0 0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 21, fontWeight: 800, lineHeight: 1, color: '#CFFAFF', letterSpacing: '-.01em' }}>{Math.round(curYear)}</div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '.22em', color: 'rgba(159,184,222,.55)', marginTop: 3 }}>YEAR</div>
        </div>
        <div onPointerDown={onDialDown} onPointerMove={onDialMove} onPointerUp={onDialUp} onPointerCancel={onDialUp}
        style={{ position: 'relative', flex: 1, height: 44, borderRadius: 13, cursor: 'pointer', touchAction: 'none', background: 'rgba(11,17,32,.6)', border: '1px solid rgba(127,178,255,.16)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 1, background: 'rgba(159,184,222,.16)' }} />
          {[1945, 1955, 1965, 1975, 1985, 1995, 2005, 2015, 2025].map((d) => {const f = (d - MZ.START) / (MZ.END - MZ.START);return (
              <div key={'m' + d} style={{ position: 'absolute', left: `${f * 100}%`, top: '50%', height: 7, marginTop: -3.5, width: 1, background: 'rgba(159,184,222,.13)' }} />);
          })}
          {decades.map((d) => {const f = (d - MZ.START) / (MZ.END - MZ.START);return (
              <React.Fragment key={d}>
              <div style={{ position: 'absolute', left: `${f * 100}%`, top: 7, bottom: 14, width: 1, background: 'rgba(159,184,222,.2)' }} />
              <div style={{ position: 'absolute', left: `${f * 100}%`, bottom: 3, transform: 'translateX(-50%)', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 8, color: 'rgba(159,184,222,.5)' }}>{'’' + String(d).slice(2)}</div>
            </React.Fragment>);
          })}
          <div style={{ position: 'absolute', left: `${yearFrac * 100}%`, top: 5, bottom: 5, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <div style={{ width: 2.5, height: '100%', borderRadius: 2, background: 'linear-gradient(#9FE4FF,#5B9DFF)', boxShadow: '0 0 10px rgba(91,157,255,.85)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 13, height: 13, borderRadius: '50%', background: '#CFFAFF', border: '2px solid #5B9DFF', boxShadow: '0 0 10px rgba(159,228,255,.9)' }} />
          </div>
        </div>
      </div>
      <MzSheet ev={sel} byId={byId} onClose={() => setSel(null)} onJump={jumpTo} go={go} order={MZ_BY_YEAR} />
    </div>);

}

window.MuseumScreen = MuseumScreen;
window.MuseumDeck = MuseumScreen; /* alias — 'exhibit' route falls back to the timeline */
window.MUSEUM = MUSEUM;