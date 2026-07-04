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
{ id: 'museum', x: 50, y: 187, domain: '뮤지엄', kind: '함께 배우기', star: 'Alkaid', level: 4,
  line: 'AI가 걸어온 길을 거닐며, 세컨비가 나를 이해하는 원리도 함께 배워요.', route: 'museum' }];


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
  face: 'assets/deepspace/secondb-head-front.png', blank: 'assets/deepspace/secondb-head-blank.png',
  accent: '#A78BFA', soft: 'rgba(167,139,250,.16)', onSoft: '#E2D6FF', glow: 'rgba(167,139,250,.5)' },
{ id: 'meta', name: '메타비', tag: 'Meta-B', desc: '나를 객관적으로 들여다보는 뇌',
  face: 'assets/deepspace/secondb-meta-face.png', blank: 'assets/deepspace/secondb-meta-blank.png',
  accent: '#46B6FF', soft: 'rgba(70,182,255,.16)', onSoft: '#BFE7FF', glow: 'rgba(70,182,255,.5)' },
{ id: 'twi', name: '트위비', tag: 'Twi-B', desc: '내 데이터로 엉뚱한 가능성을 여는 뇌',
  face: 'assets/deepspace/secondb-twi-face.png', blank: 'assets/deepspace/secondb-twi-blank.png',
  accent: '#CFC4E8', soft: 'rgba(207,196,232,.16)', onSoft: '#EDE7F7', glow: 'rgba(245,230,190,.55)' }];


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


window.SB = { C, STARS, STAR_LINES, POLARIS_GUIDE, NAV, CHAT_MODES, COMPANION, OBSERVATIONS, RECORDS, BIGFIVE, ERAS, CAPTURE_MODES };

/* =====================================================================
   M3 PRIMITIVES
   ===================================================================== */
const { useState, useRef, useEffect } = React;

/* Inline-SVG icon set (M3 geometry, 24dp grid, 2dp rounded strokes), keyed by
   Material Symbols names so the rest of the code reads as canonical M3. Inline
   SVG (not the Symbols webfont) keeps icons as glyphs in html-to-image, PDF and
   PPTX export, where the variable webfont falls back to ligature text. */
const ICON_SVG = {
  star_shine: '<path d="M12 3c.5 3.8 2.7 6 6.5 6.5-3.8.5-6 2.7-6.5 6.5-.5-3.8-2.7-6-6.5-6.5 3.8-.5 6-2.7 6.5-6.5Z"/>',
  auto_awesome: '<path d="M11 3c.4 3.2 2.3 5.1 5.5 5.5-3.2.4-5.1 2.3-5.5 5.5-.4-3.2-2.3-5.1-5.5-5.5C8.7 8.1 10.6 6.2 11 3Z"/><path d="M18 13c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z"/>',
  add_circle: '<circle cx="12" cy="12" r="8.4"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  forum: '<path d="M3 5h12v8H7l-4 3.2z"/><path d="M8 13.2V15h9l3 2.4V9.5h-2.5"/>',
  inventory_2: '<path d="M3.5 7.5h17V20h-17z"/><path d="M3.5 7.5 5.5 4h13l2 3.5M12 7.5v4M9.5 11.5h5"/>',
  person: '<circle cx="12" cy="8" r="3.7"/><path d="M5.4 20c0-3.6 3-5.8 6.6-5.8s6.6 2.2 6.6 5.8"/>',
  signal_cellular_alt: '<path d="M6 20v-4.5M12 20v-8.5M18 20V7"/>',
  wifi: '<path d="M4.5 10.5a11 11 0 0 1 15 0M7.8 14a6 6 0 0 1 8.4 0"/><circle cx="12" cy="17.6" r="1.1"/>',
  battery_full: '<rect x="3.5" y="8" width="16" height="9" rx="2.2"/><path d="M21.2 11v3"/>',
  arrow_back: '<path d="M15 5 8 12l7 7M8 12h11"/>',
  arrow_forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  north_east: '<path d="M7 17 17 7M9 7h8v8"/>',
  chevron_right: '<path d="m9 6 6 6-6 6"/>',
  chevron_left: '<path d="m15 6-6 6 6 6"/>',
  document_scanner: '<path d="M5 7V4h3M19 7V4h-3M5 17v3h3M19 17v3h-3M4 12h16"/>',
  expand_more: '<path d="m6 9 6 6 6-6"/>',
  expand_less: '<path d="m6 15 6-6 6 6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  edit_note: '<path d="M4 7h12M4 12h7M4 17h5M14.5 16l4.2-4.2 2.5 2.5L17 18.5h-2.5z"/>',
  link: '<path d="M9 15 15 9" transform="rotate(0 12 12)"/><path d="M8.5 12H6.5a3 3 0 1 1 0-6h3M15.5 6h2a3 3 0 1 1 0 6h-3" transform="rotate(45 12 12)"/>',
  photo_camera: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.4"/><circle cx="12" cy="13.7" r="3.3"/><path d="M8.5 7.5 10 4.5h4l1.5 3"/>',
  mic: '<rect x="9.4" y="3.5" width="5.2" height="11" rx="2.6"/><path d="M6 11.2a6 6 0 0 0 12 0M12 17.2V20.5"/>',
  check_circle: '<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12 2.5 2.6 4.7-5.2"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  send: '<path d="M4.5 12 20 5l-3 14.5-4.8-4.8-4.7 2z"/><path d="M12.2 16.7 17 7"/>',
  bedtime: '<path d="M20 14.2A8 8 0 1 1 10.2 4.4 6.8 6.8 0 0 0 20 14.2Z"/>',
  lightbulb: '<path d="M9.2 17h5.6M10 20h4M8.6 14.2a5 5 0 1 1 6.8 0c-.8.7-1.2 1.4-1.4 2.1h-4c-.2-.7-.6-1.4-1.4-2.1Z"/>',
  bubble_chart: '<circle cx="9" cy="10" r="4"/><circle cx="17" cy="8" r="2.3"/><circle cx="16.4" cy="15.6" r="3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4.2 4.2"/>',
  inbox: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h4a3 3 0 0 0 8 0h4"/>',
  sell: '<path d="M4 11V4h7l9 9-7 7z"/><circle cx="8" cy="8" r="1.4"/>',
  drive_file_move: '<path d="M3 6h6l2 2h10v11H3z"/><path d="M10 13.5h6m0 0-2.4-2.4M16 13.5l-2.4 2.4"/>',
  delete: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
  task_alt: '<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12 2.5 2.6 4.7-5.2"/>',
  cloud_off: '<path d="M3 3l18 18M7.3 8.4A5.5 5.5 0 0 1 18 9.2a4 4 0 0 1 1.3 7.6M6.2 10A4 4 0 0 0 6.5 18h9"/>',
  radio_button_unchecked: '<circle cx="12" cy="12" r="8"/>',
  trending_up: '<path d="M4 16l5-5 3 3 8-8M15 6h5v5"/>',
  replay: '<path d="M6 12a6 6 0 1 0 1.8-4.3M7 4v4h4"/>',
  badge: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="M9.5 4h5v2.8h-5z"/><circle cx="9" cy="12.5" r="1.8"/><path d="M14 11.5h4M14 14.5h4M6.2 16.3h6.5"/>',
  ios_share: '<path d="M12 3.5 8.5 7M12 3.5 15.5 7M12 3.5v11.5"/><path d="M7 10.5H5.5v9.5h13v-9.5H17"/>',
  visibility: '<path d="M2.5 12s3.8-6.5 9.5-6.5S21.5 12 21.5 12 17.7 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  warning: '<path d="M12 4 21 19.5H3L12 4Z"/><path d="M12 10.5v4"/><path d="M12 16.8v.4"/>',
  workspace_premium: '<circle cx="12" cy="9" r="5.4"/><path d="m9.2 13.2-2 7.3 4.8-2.8 4.8 2.8-2-7.3"/>',
  tune: '<path d="M4 7h9M17.5 7H20M4 17h2.5M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  auto_stories: '<path d="M12 6.2C9.8 4.8 6.8 4.4 4 5v12.5c2.8-.6 5.8-.2 8 1.2 2.2-1.4 5.2-1.8 8-1.2V5c-2.8-.6-5.8-.2-8 1.2Z"/><path d="M12 6.2v12.5"/>',
  workspaces: '<circle cx="12" cy="6" r="2.6"/><circle cx="6.5" cy="16" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/>',
  notifications: '<path d="M6 16V10a6 6 0 0 1 12 0v6l2 2.5H4z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
  play_circle: '<circle cx="12" cy="12" r="8.4"/><path d="M10.3 8.8 15.5 12l-5.2 3.2z"/>',
  verified: '<path d="m12 3 2 1.8 2.7-.3.9 2.6 2.5 1-.8 2.6.8 2.6-2.5 1-.9 2.6-2.7-.3L12 21l-2-1.8-2.7.3-.9-2.6-2.5-1 .8-2.6-.8-2.6 2.5-1 .9-2.6 2.7.3z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  shield: '<path d="M12 3.5 19 6v5c0 4.6-3 7.9-7 9.5-4-1.6-7-4.9-7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  sentiment_satisfied: '<circle cx="12" cy="12" r="8.4"/><path d="M8.4 14a4.4 4.4 0 0 0 7.2 0"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
  insights: '<path d="M4 5v14h16"/><path d="M7 15l3.2-3.2 2.4 2.4L17 9.6"/><path d="m18.6 5.4.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L16.6 8l1.5-.6z"/>',
  self_improvement: '<circle cx="12" cy="5.6" r="2.1"/><path d="M12 9v3.2M5 13.5c2-1 4.5-1 7 1 2.5-2 5-2 7-1M8 18.5h8"/>',
  group: '<circle cx="9" cy="9" r="3"/><path d="M3.6 18.8a5.4 5.4 0 0 1 10.8 0M16 6.2a3 3 0 0 1 0 5.6M17 12.4a5.4 5.4 0 0 1 3.4 6.4"/>',
  apps: '<circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="18" cy="6" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/><circle cx="6" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/>',
  filter_list: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  block: '<circle cx="12" cy="12" r="8.4"/><path d="m6.3 6.3 11.4 11.4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  calendar_today: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  event: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/><path d="M9 13.5h3v3H9z"/>',
  today: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/><circle cx="12" cy="15" r="1.6"/>',
  schedule: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 1.9"/>',
  alarm: '<circle cx="12" cy="13" r="6.8"/><path d="M12 9.6V13l2.6 1.6M4.6 6 7.5 3.4M19.4 6l-2.9-2.6"/>',
  local_fire_department: '<path d="M12 3.5c2.4 3 4.3 5 4.3 8.4a4.3 4.3 0 1 1-8.6 0c0-1.5.5-2.6 1.3-3.6.3 1 .9 1.6 1.7 1.9.8-1.6-.5-3.4 1.3-6.7Z"/>',
  school: '<path d="M3 9.2 12 5l9 4.2-9 4.2-9-4.2Z"/><path d="M7 11.4v3.8c0 1 2.2 2.1 5 2.1s5-1.1 5-2.1v-3.8M21 9.2v5.2"/>',
  fitness_center: '<path d="M3.5 9.5v5M6 8v8M18 8v8M20.5 9.5v5M6 12h12"/>',
  directions_run: '<circle cx="14" cy="4.8" r="2"/><path d="M5.5 20.5 9 15.5l.6-4.6-3 1.5-1 3M9.6 10.9 13 12.4l2.2 4M13.4 12 17 13"/>',
  cardiology: '<path d="M12 20s-7-4.4-7-9.4A3.6 3.6 0 0 1 12 7a3.6 3.6 0 0 1 7 3.6C19 15.6 12 20 12 20Z"/><path d="M5.2 12.3h3l1.4-2.8 2 5 1.5-2.6h3.7"/>',
  monitor_weight: '<rect x="4" y="4" width="16" height="16" rx="3.2"/><path d="M9 12.4a3 3 0 0 1 6 0"/><path d="M12 12.4 13.6 9.6"/>',
  monitor_heart: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.6"/><path d="M5.5 12.2h3l1.3-2.6 2 4.6 1.4-2.4h4.3"/>',
  devices: '<rect x="3" y="6" width="11" height="8" rx="1.6"/><path d="M2 16.5h13"/><rect x="15.5" y="9" width="6.5" height="9.2" rx="1.4"/>',
  water_drop: '<path d="M12 3.6c3.5 4 5.5 6.6 5.5 9.6a5.5 5.5 0 1 1-11 0c0-3 2-5.6 5.5-9.6Z"/>',
  restaurant: '<path d="M6 3v7M8.5 3v4.2a2.5 2.5 0 0 1-5 0V3M6 10v11M16.5 3c-1.6 0-2.6 2.2-2.6 5.2s1 4 2.6 4m0-9.2V21"/>',
  code: '<path d="M9 8 5 12l4 4M15 8l4 4-4 4"/>',
  menu_book: '<path d="M12 6.2C9.6 4.8 6.6 4.6 4 5.4v12.4c2.6-.8 5.6-.6 8 .8 2.4-1.4 5.4-1.6 8-.8V5.4c-2.6-.8-5.6-.6-8 .8Zm0 0v12.8"/>',
  description: '<path d="M6 3h8l4 4v14H6z"/><path d="M13.5 3v4.2H18M9 12.5h6M9 16h6"/>',
  checklist: '<path d="M10 7h10M10 12.5h10M10 18h10M4 7l1.4 1.4L8 6M4 17l1.4 1.4L8 16"/>',
  savings: '<path d="M4.5 13a6 5.5 0 0 1 11.5-2.2c1.2.3 2 1.3 2 2.5v1.7h-1.8M16 16.5V19M7 16.5V19M12.5 8.3A3 3 0 0 0 8 8.8"/><circle cx="13.5" cy="11.5" r="0.9"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m5 18 5-5 3 3 3-2.5 4 4"/>',
  calendar_today_alt: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/>',
  star: '<path d="M12 4 14.6 9.2 20.3 10 16.2 14.1 17.2 19.7 12 17 6.8 19.7 7.8 14.1 3.7 10 9.4 9.2z"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2 3.4 2 3.4H6"/>',
  format_quote: '<path d="M6 14c0-2.6 1.3-4.2 3.8-4.6M6 14h3.6v-2.6H6zM14 14c0-2.6 1.3-4.2 3.8-4.6M14 14h3.6v-2.6H14z"/>',
  shopping_bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  payments: '<rect x="3" y="6.5" width="13.5" height="9" rx="1.6"/><circle cx="9.7" cy="11" r="2"/><path d="M19.5 9.2v8.3H6.5"/>',
  dark_mode: '<path d="M20 14.2A8 8 0 1 1 10.2 4.4 6.8 6.8 0 0 0 20 14.2Z"/>',
  wb_sunny: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.2M9.5 3.5h5"/>',
  label: '<path d="M4 6.5h10.2l4.8 5.5-4.8 5.5H4z"/>',
  favorite: '<path d="M12 20s-7-4.4-7-9.4A3.6 3.6 0 0 1 12 7a3.6 3.6 0 0 1 7 3.6C19 15.6 12 20 12 20Z"/>',
  dashboard: '<rect x="4" y="4" width="6.8" height="9" rx="1.4"/><rect x="13.2" y="4" width="6.8" height="5" rx="1.4"/><rect x="4" y="15" width="6.8" height="5" rx="1.4"/><rect x="13.2" y="11" width="6.8" height="9" rx="1.4"/>',
  sentiment_neutral: '<circle cx="12" cy="12" r="8.4"/><path d="M8.6 14.6h6.8"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
  sentiment_dissatisfied: '<circle cx="12" cy="12" r="8.4"/><path d="M8.4 15.4a4.4 4.4 0 0 1 7.2 0"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
  sentiment_very_satisfied: '<circle cx="12" cy="12" r="8.4"/><path d="M7.6 13a5 5 0 0 0 8.8 0"/><circle cx="9" cy="9.6" r="1"/><circle cx="15" cy="9.6" r="1"/>',
  sentiment_very_dissatisfied: '<circle cx="12" cy="12" r="8.4"/><path d="M8 16.2a4.6 4.6 0 0 1 8 0"/><circle cx="9" cy="10.2" r="1"/><circle cx="15" cy="10.2" r="1"/>',
  book: '<path d="M12 6.2C9.6 4.8 6.6 4.6 4 5.4v12.4c2.6-.8 5.6-.6 8 .8 2.4-1.4 5.4-1.6 8-.8V5.4c-2.6-.8-5.6-.6-8 .8Zm0 0v12.8"/>',
  military_tech: '<circle cx="12" cy="8.5" r="4.3"/><path d="m12 6.5.6 1.4 1.5.2-1.1 1 .3 1.5-1.3-.7-1.3.7.3-1.5-1.1-1 1.5-.2z"/><path d="M9.4 12.5 8 21l4-2.3L16 21l-1.4-8.5"/>',
  satellite_alt: '<rect x="9.4" y="9.4" width="5.2" height="5.2" rx="0.8" transform="rotate(45 12 12)"/><path d="m7.2 7.2-2.4-.7.6-2.1 2.4 1.8M16.8 16.8l2.4.7-.6 2.1-2.4-1.8M16.5 7.5 19 5M7.5 16.5 5 19"/>',
  rocket_launch: '<path d="M12 3c2.5 1.6 3.8 4.2 3.8 7.4L14.5 15h-5l-1.3-4.6C8.2 7.2 9.5 4.6 12 3Z"/><circle cx="12" cy="9" r="1.5"/><path d="M9.6 15.4 7.6 21M14.4 15.4 16.4 21M12 15.5V21"/>',
  memory: '<rect x="7" y="7" width="10" height="10" rx="1.4"/><rect x="10" y="10" width="4" height="4" rx="0.6"/><path d="M9.5 4.5v2.5M14.5 4.5v2.5M9.5 17v2.5M14.5 17v2.5M4.5 9.5H7M4.5 14.5H7M17 9.5h2.5M17 14.5h2.5"/>',
  travel_explore: '<circle cx="11" cy="11" r="6.5"/><path d="M4.5 11h13M11 4.5c2 1.8 2 11.2 0 13M11 4.5c-2 1.8-2 11.2 0 13M15.8 15.8 20 20"/>',
  trending_down: '<path d="M4 8l5 5 3-3 8 8M15 18h5v-5"/>',
  smartphone: '<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M10.5 18h3"/>',
  account_balance: '<path d="M4 9.5 12 4.5l8 5M5 9.5h14M7 9.5V17M11 9.5V17M13 9.5V17M17 9.5V17M4.5 17.5h15"/>',
  coronavirus: '<circle cx="12" cy="12" r="3.5"/><path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.3 6.3 8 8M16 16l1.7 1.7M17.7 6.3 16 8M8 16l-1.7 1.7"/>',
  palette: '<path d="M12 4a8 8 0 1 0 0 16c1.3 0 1.8-1 1.8-1.9 0-1.3 1-1.9 2.2-1.9H18a3 3 0 0 0 3-3c0-4.5-4-7-9-7Z"/><circle cx="8.5" cy="11.5" r="1"/><circle cx="12" cy="8.7" r="1"/><circle cx="15.5" cy="11.5" r="1"/>',
  gavel: '<path d="m13.4 8.6-6 6 2 2 6-6zM14 6l4 4M16 4l4 4M5 20h7"/>',
  psychology: '<path d="M15.5 20v-2.8c1.8-1 3-2.9 3-5.2A6 6 0 0 0 6.6 11c0 1.5.7 2.6.7 3.8V20"/><path d="M12 12.5c0-1 .8-1.3.8-2.1A1 1 0 0 0 11 9.7"/>',
  groups: '<circle cx="9" cy="9.5" r="2.6"/><path d="M3.8 18a5.2 5.2 0 0 1 10.4 0M16 7.5a2.6 2.6 0 0 1 0 5M17 12.5a5 5 0 0 1 3.2 5.5"/>',
  hub: '<circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="7" r="1.6"/><circle cx="19" cy="7" r="1.6"/><circle cx="5" cy="17" r="1.6"/><circle cx="19" cy="17" r="1.6"/><path d="m6.4 8 4 2.8M17.6 8l-4 2.8M6.4 16l4-2.8M17.6 16l-4-2.8"/>',
  ac_unit: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5M9.8 8 12 6l2.2 2M14.2 16 12 18l-2.2-2"/>',
  cached: '<path d="M6 12a6 6 0 0 1 10-4.5M18 12a6 6 0 0 1-10 4.5M16 4v3.5h-3.5M8 20v-3.5h3.5"/>',
  emoji_events: '<path d="M8 4.5h8V8a4 4 0 0 1-8 0zM8 6H5.5v1.2A2.5 2.5 0 0 0 8 9.7M16 6h2.5v1.2A2.5 2.5 0 0 1 16 9.7M10 12.8h4M9.5 19.5h5M12 12.8v6.7"/>',
  layers: '<path d="m12 4 8 4.5-8 4.5-8-4.5zM4 13l8 4.5L20 13"/>',
  grid_on: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.2"/><path d="M9.3 4.5v15M14.7 4.5v15M4.5 9.3h15M4.5 14.7h15"/>',
  transform: '<path d="M4 7h10M14 7l-3-2.5M14 7l-3 2.5M20 17H10M10 17l3-2.5M10 17l3 2.5"/>',
  open_in_full: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
  smart_toy: '<rect x="5" y="8" width="14" height="10" rx="2.4"/><path d="M12 5v3M3.5 12V14.5M20.5 12V14.5M9 18.5v1.5M15 18.5v1.5"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
  neurology: '<path d="M9.2 5.5A3 3 0 0 0 6 8.4a3 3 0 0 0-.8 5.5l.3.2v1.4a3 3 0 0 0 4 2.8M14.8 5.5A3 3 0 0 1 18 8.4a3 3 0 0 1 .8 5.5l-.3.2v1.4a3 3 0 0 1-4 2.8M12 5.2v13.6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/>',
  lan: '<rect x="9" y="3.5" width="6" height="4.5" rx="1"/><rect x="3.5" y="15.5" width="6" height="5" rx="1"/><rect x="14.5" y="15.5" width="6" height="5" rx="1"/><path d="M12 8v3.5M6.5 15.5v-2.5h11v2.5M12 11.5v4"/>',
  database: '<ellipse cx="12" cy="5.8" rx="6.8" ry="2.6"/><path d="M5.2 5.8v12.4c0 1.4 3 2.6 6.8 2.6s6.8-1.2 6.8-2.6V5.8M5.2 12c0 1.4 3 2.6 6.8 2.6s6.8-1.2 6.8-2.6"/>',
  chat: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 19 16h-7l-4 3.3V16H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"/><path d="M8 9.8h8M8 12.6h5"/>',
  rule: '<path d="m4.5 7 1.6 1.6L9.3 5.3M4.5 16l1.6 1.6 3.2-3.3M12.5 8h7M12.5 16.5h7"/>',
  photo_library: '<rect x="6.5" y="3.5" width="14" height="13" rx="2"/><path d="M3.5 7.5v11A1.5 1.5 0 0 0 5 20h11"/><circle cx="11" cy="8" r="1.5"/><path d="m6.8 13 3.4-2.9 3 2.5 2.3-2.2 4 3.6"/>',
  bolt: '<path d="M13 3 5 13.2h5L10.5 21l8.5-10.8H13z"/>',
  south: '<path d="M12 4v14M6.5 12.5 12 18l5.5-5.5"/>',
  add_a_photo: '<path d="M20.5 8.5V18a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H8l1.5-2.5h4M12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M18.5 4v4M16.5 6h4"/>'
};

function Icon({ name, fill, size = 24, weight, grade, style }) {
  const path = ICON_SVG[name] || ICON_SVG.workspaces;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={fill ? 1.4 : 2} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'inline-block', flex: '0 0 auto', verticalAlign: 'middle', ...style }}
    dangerouslySetInnerHTML={{ __html: path }} />);

}

/* Filled / tonal / elevated / outlined / text · pill, 40dp tall */
function MdButton({ variant = 'filled', icon, trailingIcon, children, onClick, full, size = 'm', style, disabled }) {
  const base = {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
    height: size === 'l' ? 56 : size === 's' ? 32 : 40,
    padding: size === 'l' ? '0 28px' : size === 's' ? '0 14px' : '0 24px',
    borderRadius: 9999, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: 500,
    fontSize: size === 'l' ? 16 : 14, letterSpacing: '0.1px',
    width: full ? '100%' : 'auto',
    transition: 'box-shadow .2s, background .2s'
  };
  const skins = {
    filled: { background: C('primary'), color: C('on-primary') },
    tonal: { background: C('secondary-container'), color: C('on-secondary-container') },
    tertiary: { background: C('tertiary-container'), color: C('on-tertiary-container') },
    elevated: { background: C('surface-container-low'), color: C('primary'), boxShadow: 'var(--md-sys-elevation-level1)' },
    outlined: { background: 'transparent', color: C('primary'), border: `1px solid ${C('outline-variant')}` },
    text: { background: 'transparent', color: C('primary'), padding: '0 12px' }
  };
  return (
    <button className="md-interactive" disabled={disabled} onClick={disabled ? undefined : onClick}
    style={{ ...base, ...skins[variant], cursor: disabled ? 'default' : 'pointer', ...style }}>
      <span className="md-state" />
      {icon && <Icon name={icon} size={18} />}
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </button>);

}

function MdIconButton({ name, fill, variant = 'standard', onClick, size = 40, iconSize = 24, style, title }) {
  const skins = {
    standard: { background: 'transparent', color: C('on-surface-variant') },
    filled: { background: C('primary'), color: C('on-primary') },
    tonal: { background: C('secondary-container'), color: C('on-secondary-container') },
    outlined: { background: 'transparent', color: C('on-surface-variant'), border: `1px solid ${C('outline-variant')}` }
  };
  return (
    <button className="md-interactive" onClick={onClick} title={title}
    style={{ width: size, height: size, borderRadius: 9999, border: 'none', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...skins[variant], ...style }}>
      <span className="md-state" />
      <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}><Icon name={name} fill={fill} size={iconSize} /></span>
    </button>);

}

function MdCard({ variant = 'filled', children, onClick, style, className }) {
  const skins = {
    filled: { background: C('surface-container-highest'), border: 'none' },
    elevated: { background: C('surface-container-low'), boxShadow: 'var(--md-sys-elevation-level1)', border: 'none' },
    outlined: { background: C('surface'), border: `1px solid ${C('outline-variant')}` }
  };
  return (
    <div className={'md-card ' + (onClick ? 'md-interactive ' : '') + (className || '')} onClick={onClick}
    style={{ borderRadius: 12, padding: 16, ...skins[variant], cursor: onClick ? 'pointer' : 'default', ...style }}>
      {onClick && <span className="md-state" />}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>);

}

/* assist / filter / input / suggestion chip */
function MdChip({ children, icon, selected, onClick, variant = 'assist', style }) {
  const sel = selected && variant === 'filter';
  return (
    <button className="md-interactive" onClick={onClick}
    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 32, padding: icon ? '0 14px 0 10px' : '0 16px', borderRadius: 8, cursor: 'pointer',
      border: sel ? 'none' : `1px solid ${C('outline-variant')}`,
      background: sel ? C('secondary-container') : 'transparent',
      color: sel ? C('on-secondary-container') : C('on-surface-variant'),
      whiteSpace: 'nowrap', flex: '0 0 auto',
      fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: 500, fontSize: 14, letterSpacing: '0.1px', ...style }}>
      <span className="md-state" />
      {sel && <Icon name="check" size={18} />}
      {icon && !sel && <Icon name={icon} size={18} />}
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </button>);

}

function ProgressLinear({ value, color, track, height = 8 }) {
  return (
    <div style={{ height, borderRadius: 9999, background: track || C('surface-variant'), overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', borderRadius: 9999,
        background: color || C('primary'), transition: 'width .5s var(--md-sys-motion-easing-emphasized)' }} />
    </div>);

}

const MOOD = {
  positive: 'var(--sb-mood-positive)',
  neutral: 'var(--sb-mood-neutral)',
  negative: 'var(--sb-mood-negative)'
};

/* ── Brand glyphs for social login (inline SVG, brand-accurate marks) ── */
function BrandGlyph({ name, size = 20 }) {
  const P = {
    apple: '<path d="M16.7 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.3 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.2 0 1.9-1.1 2.6-2.2.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.6zM14.5 6c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z"/>',
    github: '<path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/>',
    kakao: '<path d="M12 3.4C6.9 3.4 2.8 6.7 2.8 10.7c0 2.6 1.7 4.8 4.3 6.1-.2.7-.7 2.5-.8 2.9-.1.5.2.5.4.4.2-.1 2.5-1.7 3.5-2.4.6.1 1.2.1 1.8.1 5.1 0 9.2-3.3 9.2-7.2S17.1 3.4 12 3.4z"/>'
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"
  style={{ flex: '0 0 auto' }} dangerouslySetInnerHTML={{ __html: P[name] }} />;
}

function GoogleGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flex: '0 0 auto' }}>
      <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.3-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6C4.8 19.9 8.1 22 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.5l3.3-2.6z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3.1 14.7 2 12 2 8.1 2 4.8 4.1 3.1 7.5l3.3 2.6C7.2 7.7 9.4 6 12 6z" />
    </svg>);

}

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
  { k: 'kakao', label: '카카오로 계속', node: <BrandGlyph name="kakao" size={22} />, bg: '#FEE500', fg: '#181600' },
  { k: 'naver', label: '네이버로 계속', node: <span style={{ fontWeight: 900, fontSize: 19, lineHeight: 1, fontFamily: 'var(--md-ref-typeface-plain)' }}>N</span>, bg: '#03C75A', fg: '#fff' },
  { k: 'github', label: 'GitHub로 계속', node: <BrandGlyph name="github" size={22} />, bg: '#1F2328', fg: '#fff' },
  { k: 'google', label: 'Google로 계속', node: <GoogleGlyph size={20} />, bg: '#fff', fg: '#111' },
  { k: 'apple', label: 'Apple로 계속', node: <BrandGlyph name="apple" size={22} />, bg: '#fff', fg: '#111' }];

  const Field = ({ icon, ph, val, set, type, trailing }) =>
  <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 54, padding: '0 14px', borderRadius: 14,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(150,190,255,.2)' }}>
      <Icon name={icon} size={20} style={{ color: 'rgba(190,225,255,.62)', flex: '0 0 auto' }} />
      <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph} type={type}
    autoCapitalize="none" autoCorrect="off" spellCheck={false}
    style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
      color: '#EAF7FF', fontSize: 15, fontFamily: 'var(--md-ref-typeface-plain)' }} />
      {trailing}
    </div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* email + password — the base inputs */}
      <Field icon="forum" ph="이메일" val={email} set={setEmail} type="email" />
      <Field icon="lock" ph="비밀번호" val={pw} set={setPw} type={show ? 'text' : 'password'}
      trailing={
      <button onClick={() => setShow((v) => !v)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} className="md-interactive"
      style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent',
        cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'rgba(190,225,255,.62)' }}>
            <span className="md-state" /><Icon name={show ? 'visibility' : 'lock'} size={19} />
          </button>
      } />

      {/* 로그인 / 회원가입 — primary actions */}
      <button onClick={() => pick('login')} className="md-interactive"
      style={{ position: 'relative', height: 52, borderRadius: 9999, border: 'none', cursor: 'pointer', marginTop: 3,
        background: '#46B6FF', color: '#05121f', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15.5, fontWeight: 700, fontFamily: 'var(--md-ref-typeface-plain)' }}>
        <span className="md-state" />로그인
      </button>
      <button onClick={() => pick('signup')} className="md-interactive"
      style={{ position: 'relative', height: 52, borderRadius: 9999, cursor: 'pointer', background: 'transparent',
        border: '1px solid rgba(127,182,255,.5)', color: '#BFE7FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15.5, fontWeight: 600, fontFamily: 'var(--md-ref-typeface-plain)' }}>
        <span className="md-state" />회원가입
      </button>

      {/* social providers — all equal small icon size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 2px' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(180,205,255,.18)' }} />
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        {socials.map((b) =>
        <button key={b.k} onClick={() => pick(b.k)} className="md-interactive" aria-label={b.label} title={b.label}
        style={{ position: 'relative', flex: 1, height: 50, borderRadius: 14,
          border: b.fg === '#111' ? '1px solid rgba(180,205,255,.16)' : 'none',
          cursor: 'pointer', background: b.bg, color: b.fg, display: 'grid', placeItems: 'center' }}>
            <span className="md-state" />{b.node}
          </button>
        )}
      </div>
    </div>);

}

function MoodDot({ mood = 'neutral', size = 10, style }) {
  const c = MOOD[mood];
  return <span style={{ width: size, height: size, borderRadius: 9999, background: c,
    boxShadow: `0 0 8px 1px ${c}`, display: 'inline-block', ...style }} />;
}

/* ── SbHead — the 2ndB companion head with live expression + gaze tracking ──
   Reuses the constellation-home head geometry (masked baked eyes → dynamic
   cyan eyes + mouth) but is fully self-contained: its own pointer/touch
   tracking, idle blink, and expression (eye height + mouth curve) driven by
   `expression` (positive | neutral | negative). Percentage-positioned features
   scale to any `size`. Pass track={false} for a static instance. */
function SbHead({ size = 48, expression = 'neutral', track = true, tilt = true, bob = false, glow = false, style }) {
  const scale = size / 152;
  const rootRef = useRef(null),headRef = useRef(null);
  const leftEyeRef = useRef(null),rightEyeRef = useRef(null),mouthRef = useRef(null);
  const moodC = MOOD[expression] || MOOD.neutral;
  const eyeH = expression === 'positive' ? 13 : expression === 'negative' ? 17 : 16;
  const mouth = expression === 'positive' ?
  { w: 16, h: 7, radius: '0 0 9px 9px', bg: 'transparent', border: '2.5px solid #5FD4FF', borderTop: 'none' } :
  expression === 'negative' ?
  { w: 16, h: 7, radius: '9px 9px 0 0', bg: 'transparent', border: '2.5px solid #5FD4FF', borderBottom: 'none' } :
  { w: 15, h: 3.5, radius: 9, bg: '#5FD4FF', border: 'none' };

  useEffect(() => {
    if (!track) return;
    const cur = { yaw: 0, pitch: 0, tx: 0, ty: 0, ex: 0, ey: 0 };
    const ptr = { x: 0, y: 0 };let last = Date.now();
    let blinkStart = 0,nextBlink = Date.now() + 1400,blink = 1;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)),lerp = (a, b, k) => a + (b - a) * k;
    const setPtr = (cx, cy) => {const el = rootRef.current;if (!el) return;const r = el.getBoundingClientRect();
      ptr.x = cl((cx - (r.left + r.width / 2)) / (window.innerWidth / 2), -1.3, 1.3);
      ptr.y = cl((cy - (r.top + r.height / 2)) / (window.innerHeight / 2), -1.3, 1.3);last = Date.now();};
    const move = (e) => {const p = e.touches ? e.touches[0] : e;if (p) setPtr(p.clientX, p.clientY);};
    window.addEventListener('pointermove', move);window.addEventListener('touchmove', move, { passive: true });
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);const now = Date.now();
      if (now - last > 2200) {ptr.x *= 0.92;ptr.y *= 0.92;}
      cur.yaw = lerp(cur.yaw, ptr.x * 15, 0.1);cur.pitch = lerp(cur.pitch, -ptr.y * 10, 0.1);
      cur.tx = lerp(cur.tx, ptr.x * 4, 0.1);cur.ty = lerp(cur.ty, ptr.y * 3, 0.1);
      cur.ex = lerp(cur.ex, ptr.x * 5.5, 0.18);cur.ey = lerp(cur.ey, ptr.y * 3.5, 0.18);
      if (!blinkStart && now > nextBlink) blinkStart = now;
      if (blinkStart) {const bp = (now - blinkStart) / 130;blink = 1 - Math.sin(Math.min(bp, 1) * Math.PI) * 0.92;if (bp >= 1) {blinkStart = 0;blink = 1;nextBlink = now + 1600 + Math.random() * 3400;}}
      if (headRef.current) headRef.current.style.transform = tilt ? `rotateY(${cur.yaw}deg) rotateX(${cur.pitch}deg) translate3d(${cur.tx * scale}px,${cur.ty * scale}px,0)` : '';
      const eyeT = `translate(${cur.ex * scale}px,${cur.ey * scale}px) scaleY(${blink})`;
      if (leftEyeRef.current) leftEyeRef.current.style.transform = eyeT;
      if (rightEyeRef.current) rightEyeRef.current.style.transform = eyeT;
      if (mouthRef.current) mouthRef.current.style.transform = `translate(${cur.ex * 0.5 * scale}px,${cur.ey * 0.5 * scale}px)`;
    };
    raf = requestAnimationFrame(tick);
    return () => {cancelAnimationFrame(raf);window.removeEventListener('pointermove', move);window.removeEventListener('touchmove', move);};
  }, [track, tilt, scale]);

  return (
    <div ref={rootRef} style={{ position: 'relative', width: size, height: size, flex: '0 0 auto',
      animation: bob ? 'sb-bob 4s ease-in-out infinite' : undefined, ...style }}>
      {glow && <div style={{ position: 'absolute', left: '50%', top: '8%', width: size * 0.62, height: size * 0.62,
        transform: 'translateX(-50%)', borderRadius: '50%', filter: 'blur(6px)', pointerEvents: 'none',
        background: `radial-gradient(circle, ${moodC}aa, ${moodC}44 52%, transparent 76%)`,
        animation: 'sb-dim 3.4s ease-in-out infinite' }} />}
      <div ref={headRef} style={{ position: 'relative', width: size, height: size, transformStyle: 'preserve-3d', willChange: 'transform' }}>
        <img src="assets/deepspace/secondb-head-blank.png" alt="세컨비" draggable="false"
        style={{ width: '100%', height: '100%', display: 'block', filter: 'drop-shadow(0 2px 8px rgba(70,80,160,.35))' }} />
        {/* dark face screen masks the baked eyes so dynamic eyes can track */}
        <div style={{ position: 'absolute', left: '50%', top: '60%', width: '47%', height: '23.5%',
          transform: 'translate(-50%,-50%)', borderRadius: Math.max(3, 10 * scale),
          background: 'linear-gradient(180deg,#0a1020,#03060e 62%)',
          boxShadow: 'inset 0 1px 6px rgba(120,150,255,.18), inset 0 -4px 10px rgba(0,0,0,.6)' }} />
        <div style={{ position: 'absolute', left: '38.5%', top: '58.5%', width: 0, height: 0 }}>
          <div ref={leftEyeRef} style={{ position: 'absolute', left: -5 * scale, top: -8 * scale,
            width: 10 * scale, height: eyeH * scale, borderRadius: 4 * scale,
            background: 'radial-gradient(60% 60% at 50% 42%,#CCFAFF,#46B6FF 72%)',
            boxShadow: `0 0 ${9 * scale}px rgba(70,182,255,.85)`, willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', left: '61.5%', top: '58.5%', width: 0, height: 0 }}>
          <div ref={rightEyeRef} style={{ position: 'absolute', left: -5 * scale, top: -8 * scale,
            width: 10 * scale, height: eyeH * scale, borderRadius: 4 * scale,
            background: 'radial-gradient(60% 60% at 50% 42%,#CCFAFF,#46B6FF 72%)',
            boxShadow: `0 0 ${9 * scale}px rgba(70,182,255,.85)`, willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '65.5%', width: 0, height: 0 }}>
          <div ref={mouthRef} style={{ position: 'absolute', left: -mouth.w * scale / 2, top: 0,
            width: mouth.w * scale, height: mouth.h * scale, borderRadius: mouth.radius,
            background: mouth.bg, border: mouth.border, borderTop: mouth.borderTop, borderBottom: mouth.borderBottom,
            boxShadow: `0 0 ${8 * scale}px rgba(70,182,255,.8)`, willChange: 'transform' }} />
        </div>
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
    <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 14, marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="md-label-small" style={{ color: C('on-secondary-container'), opacity: .7, marginBottom: 3 }}>세컨비의 추정 · 아직 반영 안 됨</div>
          <div className="md-body-medium" style={{ color: C('on-secondary-container'), wordBreak: 'keep-all' }}>{estimate}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          color: confColor, background: C('surface-container-highest'), borderRadius: 9999, padding: '3px 10px' }}>
          <span style={{ width: 7, height: 7, borderRadius: 9999, background: confColor }} />확신 {confidence}%
        </span>
        <button className="md-interactive" onClick={onEvidence} style={{ ...reset,
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          color: C('on-secondary-container'), borderRadius: 9999, padding: '3px 8px' }}>
          <Icon name="link" size={13} />{evidenceLabel} {evidence}건 근거<Icon name="arrow_forward" size={13} />
          <span className="md-state-layer" />
        </button>
      </div>

      {state === 'pending' &&
      <React.Fragment>
          <div className="md-body-small" style={{ color: C('on-secondary-container'), opacity: .8, margin: '12px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={13} />비준하기 전엔 북극성에 반영되지 않아요.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <MdButton variant="filled" icon="task_alt" style={{ flex: 1 }} onClick={() => set('ratified')}>맞아요</MdButton>
            <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => {set('refined');onRefine && onRefine();}}>조금 달라요</MdButton>
          </div>
        </React.Fragment>
      }
      {state === 'ratified' &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: C('surface-container-highest') }}>
          <Icon name="task_alt" size={18} fill style={{ color: C('primary') }} />
          <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>비준했어요 · 북극성에 반영돼요</span>
          <button onClick={() => set('pending')} style={{ ...reset, fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>되돌리기</button>
        </div>
      }
      {state === 'refined' &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: C('surface-container-highest') }}>
          <Icon name="forum" size={18} style={{ color: C('tertiary') }} />
          <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>더 알려주시면 다시 다듬을게요</span>
          <button onClick={() => set('pending')} style={{ ...reset, fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>취소</button>
        </div>
      }
    </MdCard>);

}

Object.assign(window, { Icon, MdButton, MdIconButton, MdCard, MdChip, ProgressLinear, MoodDot, MOOD, SbHead, AuthProviders, RatifyBlock });

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
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 344, background: C('surface-container-high'), borderRadius: 28, padding: '20px 16px 14px', boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), padding: '0 8px' }}>{title}</div>
        <div className="md-headline-small" style={{ color: C('on-surface'), padding: '2px 8px 12px', fontSize: 24, fontWeight: 600 }}>
          {sel ? `${sel.getMonth() + 1}월 ${sel.getDate()}일 (${SB_WD[sel.getDay()]})` : '날짜를 골라요'}
        </div>
        <div style={{ borderTop: `1px solid ${C('outline-variant')}`, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px 6px' }}>
            <button onClick={() => setYearPick((p) => !p)} className="md-interactive"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: C('on-surface'), fontWeight: 600, fontSize: 15, padding: '6px 8px', borderRadius: 8, fontFamily: 'var(--md-ref-typeface-plain)' }}>
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
            style={{ position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 9999, padding: '10px 0', fontSize: 14, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: yy === y ? 700 : 500,
              background: yy === y ? C('primary') : 'transparent', color: yy === y ? C('on-primary') : C('on-surface') }}>
                  <span className="md-state" />{yy}
                </button>
            )}
            </div> :

          <React.Fragment>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
                {SB_WD.map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '4px 0', color: i === 0 ? C('error') : C('on-surface-variant') }}>{w}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {cells.map((d, i) => {
                if (d === null) return <div key={'e' + i} />;
                const dt = new Date(y, m, d),isSel = sameDay(dt, sel),isToday = sameDay(dt, today),dis = disabled(d);
                return (
                  <button key={d} disabled={dis} onClick={() => setSel(dt)} className={dis ? '' : 'md-interactive'}
                  style={{ position: 'relative', aspectRatio: '1', border: 'none', cursor: dis ? 'default' : 'pointer', borderRadius: '50%',
                    background: isSel ? C('primary') : 'transparent',
                    color: dis ? C('outline') : isSel ? C('on-primary') : i % 7 === 0 ? C('error') : C('on-surface'),
                    fontSize: 14, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: isSel || isToday ? 700 : 500, opacity: dis ? .45 : 1,
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
        border: `1px solid ${CC('outline-variant')}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer', background: CC('surface-container-highest') }}>
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
    style={{ width: '100%', resize: 'none', overflow: 'hidden', minHeight: minRows * 24 + 22, border: `1px solid ${CC('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
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
  <span style={{ fontSize: 40, fontWeight: 600, fontFamily: 'var(--md-ref-typeface-plain)',
    color: active ? C('primary') : C('on-surface'), lineHeight: 1 }}>{children}</span>;

  const Dial = ({ items, sel, onPick, pad2 }) =>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
      {items.map((v) => {
      const on = v === sel;
      return (
        <button key={v} onClick={() => onPick(v)} className="md-interactive"
        style={{ position: 'relative', border: 'none', cursor: 'pointer', borderRadius: 9999, padding: '9px 0',
          fontSize: 14.5, fontFamily: 'var(--md-ref-typeface-plain)', fontWeight: on ? 700 : 500,
          background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface') }}>
            <span className="md-state" />{pad2 ? String(v).padStart(2, '0') : v}
          </button>);

    })}
    </div>;

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 344, background: C('surface-container-high'), borderRadius: 28, padding: '20px 18px 14px', boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>{title}</div>

        {/* big read-out + AM/PM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <Big active>{h12}</Big><Big>:</Big><Big>{String(min).padStart(2, '0')}</Big>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C('outline-variant')}` }}>
            {[['오전', false], ['오후', true]].map(([lb, isPm]) => {
              const on = pm === isPm;
              return (
                <button key={lb} onClick={() => setMeridiem(isPm)} className="md-interactive"
                style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '9px 16px', whiteSpace: 'nowrap', fontSize: 14, fontWeight: on ? 700 : 500,
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
      background: 'rgba(0,0,0,.5)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: C('surface-container-high'),
        borderRadius: 28, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {danger && <Icon name="warning" size={24} style={{ color: C('error') }} />}
          <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 22 }}>{title}</div>
        </div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: requireType ? 16 : 22 }}>{body}</div>
        {requireType &&
        <div style={{ marginBottom: 22 }}>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginBottom: 8, wordBreak: 'keep-all' }}>
            계속하려면 <span style={{ color: C('error'), fontWeight: 600 }}>‘{requireType}’</span> 를 입력해 주세요.
          </div>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireType}
          autoFocus spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12,
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