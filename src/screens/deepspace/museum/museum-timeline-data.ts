// AI 뮤지엄 — rev2 2-axis timeline data (P5), transcribed 1:1 from the rev2
// prototype `sb-museum.jsx` (MZ_LANES + MUSEUM + MZ geometry). X = time (linear,
// 100px/yr), Y = lane (world ABOVE the shared axis, ai BELOW). The terminal
// `here` node is 두 번째 뇌 — the product's own place on the timeline.
//
// Content is product copy (KR canonical, PRD §15 lexicon-safe) — edits go
// through the normal PR review, not through code refactors.

export type MuseumLaneId = "world" | "ai";

export interface MuseumLane {
  id: MuseumLaneId;
  label: string;
  en: string;
  icon: string;
  accent: string;
  tint: string;
  ink: string;
}

export type MuseumRefKind = "paper" | "product" | "event" | "film";

export interface MuseumRef {
  kind: MuseumRefKind;
  label: string;
}

export interface MuseumEvent {
  id: string;
  icon: string;
  lane: MuseumLaneId;
  /** Numeric year — drives the X position. */
  year: number;
  /** Display label (may differ from year: '1939–45', '2023–', '곧'). */
  ylabel: string;
  title: string;
  sub: string;
  body: string;
  tags: string[];
  /** Related event ids — drawn as bezier connectors + "이어진 사건" jumps. */
  rel: string[];
  refs: MuseumRef[];
  /** The terminal 2nd-brain node ("지금 여기"). */
  here?: boolean;
}

export const MZ_LANES: Record<MuseumLaneId, MuseumLane> = {
  world: {
    id: "world",
    label: "AI와 세계의 흐름",
    en: "WORLD",
    icon: "public",
    accent: "#5B9DFF",
    tint: "rgba(91,157,255,0.16)",
    ink: "#D4E6FF",
  },
  ai: {
    id: "ai",
    label: "AI 발전사",
    en: "AI",
    icon: "auto_awesome",
    accent: "#9A86FF",
    tint: "rgba(154,134,255,0.16)",
    ink: "#E7DEFF",
  },
};

/** Timeline geometry (prototype MZ) — X is linear in years. */
export const MZ = {
  START: 1936,
  END: 2028,
  /** px per year */
  PXY: 100,
  PAD: 88,
  /** canvas height */
  TH: 400,
  /** the shared horizontal axis Y */
  AXIS: 196,
  NODE_W: 118,
  NODE_H: 84,
} as const;

export const MZ_CANVAS_W = MZ.PAD * 2 + (MZ.END - MZ.START) * MZ.PXY;

export const mzX = (year: number): number => MZ.PAD + (year - MZ.START) * MZ.PXY;

export const MUSEUM: MuseumEvent[] = [
  // ===== AI와 세계의 흐름 =====
  { id: "w_ww2", icon: "military_tech", lane: "world", year: 1942, ylabel: "1939–45", title: "2차 세계대전", sub: "전쟁이 계산을 끌어올리다",
    body: "암호를 풀기 위한 거대한 계산 수요가 최초의 전자식 컴퓨터를 낳았다. 앨런 튜링의 봄베와 콜로서스, 그리고 1945년 에니악(ENIAC)으로 이어진 계산의 폭발이 훗날 ‘생각하는 기계’라는 질문의 토대가 됐다.",
    tags: ["#앨런튜링", "#암호해독", "#에니악", "#이미테이션게임"],
    rel: ["a_turing"], refs: [{ kind: "event", label: "에니악(ENIAC) · 1945" }, { kind: "film", label: "영화 〈이미테이션 게임〉" }] },
  { id: "w_sputnik", icon: "satellite_alt", lane: "world", year: 1957, ylabel: "1957", title: "스푸트니크 충격", sub: "냉전이 과학에 돈을 붓다",
    body: "소련의 인공위성 발사로 미국이 과학기술에 막대한 투자를 쏟았다. 이 흐름이 대학과 연구소에 컴퓨팅·AI 연구의 자금을 댔고, 곧 다트머스 회의로 이어졌다.",
    tags: ["#냉전", "#우주경쟁", "#NASA", "#아르파"],
    rel: ["a_dartmouth"], refs: [{ kind: "event", label: "NASA·ARPA 설립 · 1958" }] },
  { id: "w_moon", icon: "rocket_launch", lane: "world", year: 1969, ylabel: "1969", title: "아폴로 11호", sub: "컴퓨터, 사람을 달에 보내다",
    body: "아폴로 가이던스 컴퓨터가 인류를 달에 안착시켰다. 작은 컴퓨터가 생명을 건 판단을 돕는다는 신뢰가 사회에 자리 잡기 시작했다.",
    tags: ["#달착륙", "#아폴로11", "#NASA"],
    rel: [], refs: [{ kind: "event", label: "아폴로 가이던스 컴퓨터" }] },
  { id: "w_intel", icon: "memory", lane: "world", year: 1971, ylabel: "1971", title: "인텔 4004", sub: "컴퓨터가 칩 하나로",
    body: "최초의 상용 마이크로프로세서가 등장했다. 무어의 법칙을 따라 값싸고 빨라진 연산이 훗날 AI를 현실로 만들 토양을 깔았다.",
    tags: ["#반도체", "#무어의법칙", "#마이크로프로세서"],
    rel: ["a_alexnet"], refs: [{ kind: "product", label: "인텔 4004" }] },
  { id: "w_www", icon: "travel_explore", lane: "world", year: 1991, ylabel: "1991", title: "월드 와이드 웹", sub: "데이터의 바다가 열리다",
    body: "팀 버너스리가 웹을 공개하며 인류의 기록이 디지털로 폭증했다. 이 방대한 데이터가 훗날 딥러닝과 거대 언어모델을 먹여 살린다.",
    tags: ["#인터넷", "#WWW", "#팀버너스리"],
    rel: ["a_dl2006"], refs: [{ kind: "event", label: "CERN · 웹 공개" }] },
  { id: "w_dotcom", icon: "trending_down", lane: "world", year: 2000, ylabel: "2000", title: "닷컴 버블", sub: "기대와 거품, 그리고 붕괴",
    body: "인터넷에 대한 과열된 기대가 거품으로 터졌다. 기술의 약속과 현실 사이의 간극 — 훗날 AI 붐을 바라보는 거울이 된다.",
    tags: ["#닷컴버블", "#IT거품", "#나스닥"],
    rel: [], refs: [{ kind: "event", label: "나스닥 폭락 · 2000" }] },
  { id: "w_iphone", icon: "smartphone", lane: "world", year: 2007, ylabel: "2007", title: "아이폰 등장", sub: "모두의 손에 컴퓨터",
    body: "스마트폰이 일상을 바꿨다. 수십억 개의 카메라·센서·터치가 만든 데이터가 모바일 AI와 딥러닝 학습의 연료가 됐다.",
    tags: ["#스마트폰", "#애플", "#모바일", "#앱스토어"],
    rel: ["a_alexnet"], refs: [{ kind: "product", label: "iPhone" }, { kind: "event", label: "앱스토어 · 2008" }] },
  { id: "w_gfc", icon: "account_balance", lane: "world", year: 2008, ylabel: "2008", title: "글로벌 금융위기", sub: "데이터로 위험을 읽다",
    body: "리먼 브라더스 붕괴가 세계 경제를 흔들었다. 이후 금융·산업이 데이터와 알고리즘으로 위험을 관리하려는 수요가 폭발했다.",
    tags: ["#리먼브라더스", "#서브프라임", "#금융위기"],
    rel: [], refs: [{ kind: "event", label: "리먼 사태 · 2008" }] },
  { id: "w_covid", icon: "coronavirus", lane: "world", year: 2020, ylabel: "2020", title: "코로나19 팬데믹", sub: "디지털 대전환을 앞당기다",
    body: "원격근무·비대면이 일상이 되며 디지털 전환이 몇 년을 앞당겼다. 클라우드·화상·자동화 수요가 폭증했고, AI 도구가 일과 삶에 빠르게 스며들었다.",
    tags: ["#팬데믹", "#재택근무", "#줌", "#디지털전환"],
    rel: ["a_gpt3", "a_chatgpt"], refs: [{ kind: "event", label: "원격근무·화상회의 확산" }] },
  { id: "w_genai", icon: "palette", lane: "world", year: 2022, ylabel: "2022", title: "생성AI 붐", sub: "AI가 대중문화가 되다",
    body: "이미지·글을 만드는 AI가 사회 전반의 화두가 됐다. 창작·교육·노동에 대한 기대와 불안이 동시에 터져 나왔다.",
    tags: ["#생성AI", "#달리", "#미드저니", "#밈"],
    rel: ["a_chatgpt"], refs: [{ kind: "product", label: "DALL·E · Midjourney" }] },
  { id: "w_regul", icon: "gavel", lane: "world", year: 2024, ylabel: "2024", title: "AI 규제·일상화", sub: "사회가 규칙을 묻다",
    body: "저작권·일자리·안전을 둘러싼 논의가 본격화되고, 각국이 AI 규제의 틀을 세우기 시작했다. AI가 ‘기술’을 넘어 ‘사회 제도’의 문제가 됐다.",
    tags: ["#EUAIAct", "#저작권", "#일자리", "#AI안전"],
    rel: ["a_agent"], refs: [{ kind: "event", label: "EU AI Act" }] },

  // ===== AI 발전사 =====
  { id: "a_turing", icon: "psychology", lane: "ai", year: 1950, ylabel: "1950", title: "튜링 테스트", sub: "생각하는 기계라는 질문",
    body: "앨런 튜링이 “기계가 생각할 수 있는가”를 측정 가능한 질문으로 바꿨다. 대화만으로 사람과 기계를 구별할 수 없다면 그것을 지능이라 부르자는 제안.",
    tags: ["#튜링테스트", "#이미테이션게임", "#앨런튜링"],
    rel: ["w_ww2", "a_dartmouth"], refs: [{ kind: "paper", label: "Computing Machinery and Intelligence (1950)" }] },
  { id: "a_dartmouth", icon: "groups", lane: "ai", year: 1956, ylabel: "1956", title: "다트머스 회의", sub: "AI의 탄생",
    body: "한여름의 워크숍에서 ‘인공지능(AI)’이라는 이름이 처음 붙었다. 이 분야가 하나의 학문으로 출발한 공식적인 순간.",
    tags: ["#AI탄생", "#존매카시", "#1956"],
    rel: ["a_perceptron"], refs: [{ kind: "event", label: "다트머스 워크숍 · 존 매카시" }] },
  { id: "a_perceptron", icon: "hub", lane: "ai", year: 1958, ylabel: "1958", title: "퍼셉트론", sub: "신경망의 씨앗",
    body: "로젠블랫의 퍼셉트론은 뇌의 뉴런을 본떠 학습하는 최초의 모델이었다. 지금의 딥러닝으로 이어지는 연결주의의 첫 불씨.",
    tags: ["#신경망", "#퍼셉트론", "#연결주의"],
    rel: ["a_winter", "a_backprop"], refs: [{ kind: "paper", label: "The Perceptron · 로젠블랫" }] },
  { id: "a_winter", icon: "ac_unit", lane: "ai", year: 1969, ylabel: "1969", title: "첫 AI 겨울", sub: "한계의 증명",
    body: "퍼셉트론의 한계(XOR 문제)가 수학적으로 증명되며 신경망 연구가 긴 침체에 들어갔다. 규칙 기반 기호주의가 한동안 주류가 됐다.",
    tags: ["#AI겨울", "#XOR", "#기호주의"],
    rel: [], refs: [{ kind: "paper", label: "Perceptrons · 민스키 & 페퍼트" }] },
  { id: "a_backprop", icon: "cached", lane: "ai", year: 1986, ylabel: "1986", title: "역전파", sub: "신경망의 부활",
    body: "오차를 거슬러 가중치를 고치는 역전파가 다층 신경망의 학습을 가능하게 했다. 신경망이 첫 겨울에서 깨어나는 결정적 열쇠.",
    tags: ["#역전파", "#딥러닝씨앗", "#힌튼"],
    rel: ["a_alexnet"], refs: [{ kind: "paper", label: "Learning representations by back-propagating errors" }] },
  { id: "a_deepblue", icon: "emoji_events", lane: "ai", year: 1997, ylabel: "1997", title: "딥블루", sub: "체스판 위의 승부",
    body: "IBM의 딥블루가 세계 체스 챔피언 카스파로프를 이겼다. 특정 영역에서 기계가 인간 최고수를 넘은 상징적 사건.",
    tags: ["#IBM", "#체스", "#카스파로프"],
    rel: ["a_alphago"], refs: [{ kind: "event", label: "IBM Deep Blue vs 카스파로프" }] },
  { id: "a_dl2006", icon: "layers", lane: "ai", year: 2006, ylabel: "2006", title: "딥러닝 재점화", sub: "깊게 쌓는 법",
    body: "힌튼이 깊은 신경망을 효과적으로 학습시키는 길을 다시 열었다. ‘딥러닝’이라는 말이 본격적으로 쓰이기 시작했다.",
    tags: ["#딥러닝", "#힌튼", "#DBN"],
    rel: ["a_alexnet"], refs: [{ kind: "paper", label: "A Fast Learning Algorithm for Deep Belief Nets" }] },
  { id: "a_alexnet", icon: "visibility", lane: "ai", year: 2012, ylabel: "2012", title: "알렉스넷", sub: "눈을 뜨다",
    body: "딥 신경망이 이미지넷 인식 대회에서 압도적 격차로 우승했다. GPU로 학습한 딥러닝 시대의 시작을 알린 분수령.",
    tags: ["#이미지넷", "#GPU", "#엔비디아", "#AlexNet"],
    rel: ["a_alphago", "w_iphone"], refs: [{ kind: "paper", label: "ImageNet Classification with Deep CNNs" }, { kind: "event", label: "ImageNet 대회" }] },
  { id: "a_alphago", icon: "grid_on", lane: "ai", year: 2016, ylabel: "2016", title: "알파고", sub: "직관을 두다",
    body: "알파고가 바둑 최고수 이세돌을 4:1로 이겼다. 계산이 불가능하다던 직관의 영역마저 학습으로 넘어선 순간.",
    tags: ["#딥마인드", "#이세돌", "#바둑"],
    rel: ["a_transformer"], refs: [{ kind: "event", label: "딥마인드 · 이세돌 5국" }, { kind: "film", label: "다큐 〈알파고〉" }] },
  { id: "a_transformer", icon: "transform", lane: "ai", year: 2017, ylabel: "2017", title: "트랜스포머", sub: "주목하라",
    body: "“Attention is all you need” — 문맥을 한눈에 보는 구조가 등장했다. 오늘의 모든 거대 언어모델의 뼈대가 된 설계.",
    tags: ["#어텐션", "#구글", "#Transformer"],
    rel: ["a_gpt3"], refs: [{ kind: "paper", label: "Attention Is All You Need (2017)" }] },
  { id: "a_gpt3", icon: "open_in_full", lane: "ai", year: 2020, ylabel: "2020", title: "GPT-3", sub: "클수록 똑똑하다",
    body: "1750억 개의 매개변수. 모델을 키우는 것만으로 새로운 능력이 ‘창발’한다는 사실이 드러났다.",
    tags: ["#오픈AI", "#스케일링", "#1750억"],
    rel: ["a_chatgpt"], refs: [{ kind: "paper", label: "Language Models are Few-Shot Learners" }] },
  { id: "a_chatgpt", icon: "forum", lane: "ai", year: 2022, ylabel: "2022", title: "챗GPT", sub: "모두의 AI",
    body: "대화형 AI가 두 달 만에 1억 사용자에 닿았다. 전문가의 도구였던 AI가 일상의 언어가 된 순간.",
    tags: ["#오픈AI", "#챗봇", "#1억사용자"],
    rel: ["a_agent", "w_genai"], refs: [{ kind: "product", label: "ChatGPT" }] },
  { id: "a_agent", icon: "smart_toy", lane: "ai", year: 2024, ylabel: "2023–", title: "에이전트 시대", sub: "스스로 일하는 AI",
    body: "모델이 도구를 쥐고(RAG·도구 사용) 여러 AI가 협업하며, 목표만 주면 스스로 계획하고 실행하기 시작했다. 대답하는 AI에서 일하는 AI로.",
    tags: ["#자율에이전트", "#RAG", "#코파일럿", "#멀티에이전트"],
    rel: ["a_2ndb"], refs: [{ kind: "event", label: "멀티·자율 에이전트" }, { kind: "product", label: "도구 사용 · RAG" }] },
  { id: "a_2ndb", icon: "neurology", lane: "ai", year: 2026, ylabel: "곧", title: "두 번째 뇌", sub: "나를 아는 AI", here: true,
    body: "세상을 아는 AI를 넘어, 나를 아는 AI로. 당신의 기록으로 자라 당신만의 북극성을 함께 찾는 자리 — 세컨비가 선 곳이다.",
    tags: ["#나를아는AI", "#북극성", "#세컨비"],
    rel: [], refs: [] },
];

/** Chronological order (year, then lane) — drives the sheet prev/next stepping. */
export const MUSEUM_BY_YEAR: MuseumEvent[] = [...MUSEUM].sort(
  (a, b) => a.year - b.year || (a.lane < b.lane ? -1 : 1),
);

export const museumEventById = (id: string): MuseumEvent | undefined =>
  MUSEUM.find((e) => e.id === id);

/** Ref-kind → KR label (prototype mapping: paper/product/event/film). */
export const MUSEUM_REF_LABEL: Record<MuseumRefKind, string> = {
  paper: "논문",
  product: "제품",
  event: "사건",
  film: "영상",
};
