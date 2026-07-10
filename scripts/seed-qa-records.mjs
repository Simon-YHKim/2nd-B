// seed-qa-records.mjs — idempotent QA-account life-log (domain records) seed.
//
// WHY: the persistent AI-QA account (qa.ai.b18807@example.com, see .env.test) has
// almost no free-text records, so the constellation home renders every domain star
// dark and the domain/timeline/museum/trends surfaces only ever show empty states.
// This makes the reference-vs-app visual verification impossible. This script seeds
// ~100 realistic Korean life-log NOTES spread across the seven DOMAIN stars, with a
// deliberate brightness gradient (career/growth rich → recreation/collect dim) so
// the home constellation shows a realistic spread rather than all-max or all-dark.
//
// STORAGE MECHANISM (source of truth: src/lib/records/create.ts,
// src/lib/persona/domain-stars.ts, src/lib/persona/load-domain-levels.ts):
//   • Records are rows in the `records` table (kind="note" → NO AI call, safe).
//   • A record is attached to a domain star by the reserved tag `domain:<id>`
//     (domainTagFor). The seven ids: career, finance, growth, relation, health,
//     recreation, collect.
//   • load-domain-levels derives each star's L1~L5 purely from its records:
//     count band (0→L1, 1-4→L2, 5-14→L3, >=15→L4) with a one-band RECENCY
//     downgrade when the newest entry is older than 60 days (§4.5 ④). Organized
//     ratio is 1.0 here (every row carries non-system user tags), so count +
//     recency are the only levers, and L5 (ratify/device) is intentionally out.
//
// GRADIENT (levels the seed targets):
//   career 20, growth 18  — recent  → L4 (rich)
//   relation 14, health 13, finance 12 — recent → L3 (mid)
//   recreation 13, collect 12 — dated 62-86 days ago → recency downgrade → L2 (dim)
//   Total: 102 records. northStar = mean of the seven → a believable mid-glow.
//
// IDEMPOTENCY: every seeded row carries the DISTINCT tag "qa_seed_domain" (NOT
// "qa_seed", which belongs to the assessment seed). On each run we DELETE only the
// QA user's own rows tagged qa_seed_domain, then insert fresh. The assessment seed
// (qa_seed) is never matched, so it is untouched. RLS (auth.uid() = user_id) is the
// hard boundary — the password-grant session can only see/write the QA account.
//
// HONESTY INVARIANT: bodies are internally consistent, plausible synthetic life-log
// entries, and EVERY row's `conclusion` field clearly labels it as synthetic QA seed
// data (never a real respondent). Nothing here should be read as a real person's log.
//
// USAGE (from the worktree or repo root):
//   node scripts/seed-qa-records.mjs
// Env resolution order: process.env > $SEED_ENV_DIR/.env(.test) > <repo>/.env(.test)
//   > <main-worktree-root>/.env(.test) (a git worktree keeps only .env.test locally;
//   the Supabase URL + public anon key live in the main worktree root .env).
// Required keys: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (public
// anon key), QA_TEST_EMAIL, QA_TEST_PASSWORD. Never prints secrets.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const envDirs = [];
if (process.env.SEED_ENV_DIR) envDirs.push(resolve(process.env.SEED_ENV_DIR).replace(/\\/g, "/"));
envDirs.push(repoRoot);
// A git worktree keeps only .env.test locally; the Supabase URL + public anon key
// live in the MAIN worktree root. If repoRoot is under ".worktrees/<name>", add the
// main root as a fallback so the seed runs unchanged from the worktree.
const wtIdx = repoRoot.indexOf("/.worktrees/");
if (wtIdx !== -1) envDirs.push(repoRoot.slice(0, wtIdx));

const fileEnv = {};
for (const dir of envDirs) {
  for (const name of [".env", ".env.test"]) {
    const parsed = parseEnvFile(join(dir, name));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in fileEnv)) fileEnv[k] = v; // earlier dirs win
    }
  }
}
const env = (key) => process.env[key] ?? fileEnv[key];

const SUPABASE_URL = env("EXPO_PUBLIC_SUPABASE_URL");
const ANON_KEY = env("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const QA_EMAIL = env("QA_TEST_EMAIL");
const QA_PASSWORD = env("QA_TEST_PASSWORD");

for (const [name, val] of [
  ["EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["EXPO_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY],
  ["QA_TEST_EMAIL", QA_EMAIL],
  ["QA_TEST_PASSWORD", QA_PASSWORD],
]) {
  if (!val) {
    console.error(`Missing ${name} (checked process.env, ${envDirs.map((d) => d + "/.env(.test)").join(", ")})`);
    process.exit(1);
  }
}

// DISTINCT from the assessment seed's "qa_seed" so the DOMAIN rows can never
// delete it. The VALUES self-report row (7th block, added below) DOES join the
// shared "qa_seed" assessment family and is deleted/reinserted by its own
// precise {values,qa_seed} filter, never by SEED_TAG.
const SEED_TAG = "qa_seed_domain";
const ASSESSMENT_TAG = "qa_seed";
// The BFI assessment row carries "bfi"; the values row does not. Counting this
// tag proves the domain + values seeding never nukes the BFI/ECR assessment seed.
const ASSESSMENT_PROOF_TAG = "bfi";
const CONCLUSION = "합성 QA 시드 (실제 응답 아님) · scripts/seed-qa-records.mjs";

// ---------------------------------------------------------------------------
// Domain life-log pools. Each entry: [topic, body, [ko user tags 1-3]]. Realistic,
// internally consistent, clearly-synthetic Korean life-log lines. Counts per domain
// set the brightness gradient (see header).
const POOLS = {
  career: [
    ["스프린트 회고", "이번 스프린트에서 배포 자동화 파이프라인을 손봤다. 롤백 절차가 없어 늘 불안했는데, 원클릭 롤백을 붙이고 나니 마음이 한결 편해졌다.", ["회고", "배포"]],
    ["주간 성과 정리", "이번 주 처리한 티켓 12개 중 8개가 버그 수정이었다. 유지보수 비중이 높아지는 게 걸린다. 다음 주엔 기능 개발에 최소 이틀은 확보하고 싶다.", ["성과", "주간정리"]],
    ["코드 리뷰 문화", "동료 PR을 리뷰하며 네이밍에 대해 길게 코멘트를 남겼다. 지적이 아니라 같이 고민하는 톤으로 쓰려고 신경 썼다.", ["코드리뷰", "협업"]],
    ["발표 준비", "다음 주 팀 세미나에서 캐싱 전략을 발표하기로 했다. 슬라이드 초안을 잡았는데 예시가 부족해 실제 지표를 넣기로 했다.", ["발표", "준비"]],
    ["1on1 메모", "리드와 1on1에서 커리어 방향을 얘기했다. 매니저 트랙보다 시니어 엔지니어 트랙에 관심이 있다고 솔직하게 말했다.", ["1on1", "커리어"]],
    ["장애 대응 회고", "새벽에 알림을 받고 대응했다. 원인은 커넥션 풀 고갈. 임시로 풀 사이즈를 늘렸고 근본 원인은 내일 다시 파야 한다.", ["장애대응", "회고"]],
    ["온보딩 담당", "이번에 합류한 주니어의 온보딩을 맡았다. 문서가 오래돼 절반은 말로 설명했다. 온보딩 문서를 갱신해야겠다고 메모.", ["온보딩", "멘토링"]],
    ["기술 부채 정리", "레거시 모듈 하나를 드디어 걷어냈다. 3년 묵은 TODO였는데 걷어내고 나니 테스트가 40초 빨라졌다.", ["리팩토링", "기술부채"]],
    ["분기 목표 점검", "분기 OKR 중간 점검. 핵심 지표는 순항 중이지만 문서화 목표는 한참 밀렸다. 남은 기간에 몰아 하긴 어려워 보인다.", ["OKR", "목표"]],
    ["회의 줄이기 실험", "이번 주는 회의 없는 수요일을 시도했다. 집중 시간이 확실히 늘어 앞으로도 유지하자고 팀에 제안했다.", ["생산성", "실험"]],
    ["채용 시장 관찰", "요즘 채용 공고를 가볍게 훑었다. 당장 옮길 생각은 없지만 시장이 뭘 원하는지 감을 유지하고 싶다.", ["커리어", "관찰"]],
    ["성과 리뷰 준비", "반기 성과 리뷰를 앞두고 올해 한 일을 쭉 정리했다. 생각보다 많이 했는데 기록을 안 해둬 떠올리는 데 시간이 걸렸다.", ["성과", "회고"]],
    ["협업 마찰 해소", "다른 팀과 API 스펙 조율에서 이견이 있었다. 감정 상하지 않게 문서로 정리해 공유했더니 다음 미팅이 훨씬 매끄러웠다.", ["협업", "커뮤니케이션"]],
    ["학습 시간 확보", "업무 중 학습 시간을 금요일 오후로 고정했다. 새 프레임워크 문서를 읽는 데 썼다.", ["학습", "성장"]],
    ["배포 사고 예방", "배포 전 체크리스트를 만들었다. 사람이 실수하기 쉬운 부분을 자동 검사로 바꾸는 게 목표.", ["배포", "프로세스"]],
    ["설계 결정 기록", "설계 결정 배경을 ADR로 남기기 시작했다. 나중에 왜 이렇게 했는지 물으면 답하기 편할 것 같다.", ["문서화", "설계"]],
    ["몰입한 오후", "오늘 오후엔 완전히 몰입해 어려운 버그를 잡았다. 시간 가는 줄 몰랐고 끝내고 나니 뿌듯했다.", ["몰입", "성취"]],
    ["우선순위 재조정", "백로그가 너무 커져 리드와 함께 우선순위를 다시 매겼다. 안 할 일을 정하는 게 할 일을 정하는 것만큼 중요하다는 걸 느꼈다.", ["우선순위", "기획"]],
    ["피드백 수용", "리뷰에서 내 접근이 과하다는 피드백을 받았다. 처음엔 방어적이었는데 다시 보니 맞는 말이라 단순하게 고쳤다.", ["피드백", "성장"]],
    ["한 주 마무리", "금요일 저녁, 이번 주를 돌아보며 잘한 것 셋과 아쉬운 것 하나를 적었다. 이 습관이 점점 자리를 잡는 느낌.", ["회고", "주간정리"]],
  ],
  growth: [
    ["독서 기록", "'아주 작은 습관의 힘'을 다시 펼쳤다. 정체성 기반 습관 파트가 볼 때마다 새롭다. 어떤 사람이 되고 싶은가로 질문을 바꿔봤다.", ["독서", "습관"]],
    ["온라인 강의", "통계 강의 3주차를 들었다. 베이즈 정리를 손으로 다시 유도해보니 그제야 이해가 됐다.", ["강의", "통계"]],
    ["아침 글쓰기", "매일 아침 10분 글쓰기를 2주째 이어가고 있다. 완성도보다 꾸준함에 집중하니 부담이 줄었다.", ["글쓰기", "습관"]],
    ["새 언어 학습", "일본어 히라가나를 다시 복습했다. 예전에 하다 말았는데 이번엔 앱으로 매일 5분씩만 해보기로.", ["언어", "학습"]],
    ["다큐 시청", "우주 다큐를 봤다. 스케일이 압도적이라 내 고민이 잠깐 작아 보였다. 이런 관점 전환이 가끔 필요하다.", ["다큐", "생각"]],
    ["밋업 참석", "주말 개발자 밋업에 다녀왔다. 발표 하나가 특히 인상 깊어 관련 논문을 저장해뒀다.", ["세미나", "네트워킹"]],
    ["습관 점검", "이번 달 습관 트래커를 돌아봤다. 운동은 잘 지켰는데 독서는 절반만 채웠다. 자기 전 스크롤을 줄이는 게 관건.", ["습관", "점검"]],
    ["필사", "마음에 드는 문단을 필사했다. 손으로 옮겨 적으니 문장의 리듬이 다르게 느껴진다.", ["필사", "독서"]],
    ["낯설게 하기", "안 쓰던 손으로 양치를 해봤다. 사소하지만 익숙함에서 벗어나는 연습이라 생각하니 재밌다.", ["실험", "루틴"]],
    ["강의 노트 정리", "들었던 강의 노트를 위키로 옮기며 내 말로 다시 썼다. 옮기는 과정에서 빈틈이 보였다.", ["정리", "학습"]],
    ["출근길 팟캐스트", "출근길에 인터뷰 팟캐스트를 들었다. 실패를 담담하게 말하는 태도가 좋았다.", ["팟캐스트", "태도"]],
    ["회고 습관화", "매주 일요일 저녁 회고를 캘린더에 고정했다. 알림이 오면 그냥 앉아 15분 쓴다.", ["회고", "습관"]],
    ["관심 분야 확장", "요즘 인지과학 쪽이 끌린다. 입문서 목록을 만들어 하나씩 읽어보기로 했다.", ["관심사", "독서"]],
    ["배운 것 적용", "강의에서 배운 노트 정리법을 실제 프로젝트에 적용해봤다. 효과가 있으면 계속 쓸 생각.", ["적용", "학습"]],
    ["아침 루틴", "기상 후 물 한 잔, 스트레칭, 오늘 할 일 세 가지 적기. 이 순서가 자리를 잡으니 하루 시작이 가볍다.", ["루틴", "아침"]],
    ["실수 복기", "지난주 실수를 복기하며 무엇을 다르게 할지 적었다. 자책보다 다음 행동에 집중하려 한다.", ["복기", "성장"]],
    ["호기심 메모", "왜 하늘은 노을 때 붉을까 문득 궁금해 찾아봤다. 빛의 산란 이야기를 오랜만에 다시 봤다.", ["호기심", "메모"]],
    ["월간 회고", "한 달을 돌아보니 인풋은 많았는데 아웃풋이 적었다. 다음 달은 읽은 걸 짧게라도 써서 남기기로.", ["회고", "월간"]],
  ],
  relation: [
    ["오랜 친구 통화", "대학 때 친구와 오랜만에 한 시간 넘게 통화했다. 근황을 나누다 보니 시간 가는 줄 몰랐다. 다음 달에 얼굴 보기로 약속.", ["친구", "통화"]],
    ["부모님 안부", "주말에 부모님께 전화드렸다. 별일 없는 안부인데도 목소리 들으니 마음이 놓인다.", ["가족", "안부"]],
    ["동료와 점심", "팀 동료와 점심을 먹으며 일 얘기 말고 사는 얘기를 했다. 서로 힘든 점을 툭 터놓으니 가까워진 느낌.", ["동료", "점심"]],
    ["오랜만의 모임", "고등학교 친구들 모임에 나갔다. 다들 변했지만 웃음 코드는 그대로라 편했다.", ["모임", "친구"]],
    ["갈등 정리", "지인과 사소한 오해가 있었는데 먼저 연락해 풀었다. 미루지 않길 잘했다.", ["관계", "화해"]],
    ["새로운 인연", "밋업에서 만난 분과 연락처를 주고받았다. 관심사가 비슷해 다음에 커피 하기로 했다.", ["네트워킹", "인연"]],
    ["저녁 산책 대화", "배우자와 저녁 산책하며 서로의 하루를 자세히 들었다. 별거 아닌 얘기를 나누는 시간이 관계를 지탱하는 것 같다.", ["가족", "대화"]],
    ["감사 표현", "도움 준 선배에게 고맙다고 길게 메시지를 보냈다. 표현하지 않으면 모르니까.", ["감사", "관계"]],
    ["생일 챙기기", "친구 생일이라 작은 선물을 준비했다. 뭘 좋아할지 고민하는 시간 자체가 즐거웠다.", ["친구", "생일"]],
    ["경계 세우기", "부담스러운 부탁을 정중히 거절했다. 어색했지만 나를 지키는 연습이라 생각했다.", ["관계", "경계"]],
    ["이웃과 인사", "엘리베이터에서 이웃과 짧게 인사를 나눴다. 얼굴을 익히니 동네가 조금 더 편해진다.", ["이웃", "일상"]],
    ["멘토와 대화", "예전 멘토님과 오랜만에 만났다. 방향이 흔들릴 때 이야기를 들어주는 사람이 있다는 게 감사하다.", ["멘토", "조언"]],
    ["약속 조율", "다음 주 약속 세 개가 겹쳐 조율했다. 무리하지 않게 하나는 다음으로 미뤘다.", ["약속", "조율"]],
    ["화해 후 기록", "오해가 풀린 뒤 마음이 가벼웠다. 관계는 방치하면 식고 손보면 회복된다는 걸 다시 느꼈다.", ["관계", "회복"]],
  ],
  health: [
    ["아침 러닝", "아침에 5km를 뛰었다. 초반엔 숨이 찼지만 후반엔 페이스가 안정됐다. 끝나고 나니 머리가 맑다.", ["러닝", "운동"]],
    ["수면 기록", "어젯밤 11시에 자서 7시간 잤다. 자기 전 스크린을 껐더니 확실히 잠들기 쉬웠다.", ["수면", "루틴"]],
    ["식단 메모", "오늘은 야채와 단백질 위주로 먹었다. 오후에 나른함이 덜한 걸 보니 점심이 가벼운 게 나은 듯.", ["식단", "건강"]],
    ["홈트 근력", "홈트로 스쿼트와 플랭크를 했다. 자세를 천천히 신경 쓰니 개수보다 질이 중요하다는 걸 느낀다.", ["홈트", "근력"]],
    ["저녁 스트레칭", "종일 앉아 있어 저녁에 폼롤러로 등을 풀었다. 뭉친 게 풀리니 한결 낫다.", ["스트레칭", "회복"]],
    ["물 마시기", "하루 물 2리터를 목표로 텀블러로 체크했다. 의식하니 확실히 더 마셨다.", ["수분", "습관"]],
    ["주말 등산", "주말에 가까운 산에 올랐다. 정상에서 본 풍경 덕분에 일주일 피로가 씻겼다.", ["등산", "주말"]],
    ["컨디션 관리", "목이 칼칼해 오늘은 운동을 쉬고 일찍 잤다. 무리하지 않는 것도 관리다.", ["컨디션", "휴식"]],
    ["점심 걷기", "점심 후 20분을 걸었다. 소화도 잘되고 오후 집중력도 좋아지는 것 같다.", ["걷기", "일상"]],
    ["카페인 조절", "오후 2시 이후 커피를 끊어봤다. 저녁 잠드는 게 눈에 띄게 편해졌다.", ["카페인", "수면"]],
    ["체중 추세", "아침 공복 체중을 쟀다. 크게 변동은 없지만 추세를 보려고 매주 같은 시간에 잰다.", ["체중", "기록"]],
    ["자세 교정", "모니터 높이를 올리고 의자를 조정했다. 목과 어깨 부담이 줄었다.", ["자세", "건강"]],
    ["호흡 명상", "자기 전 10분 호흡 명상을 했다. 생각이 많던 하루였는데 조금 가라앉았다.", ["명상", "수면"]],
  ],
  finance: [
    ["월 예산 점검", "이번 달 카드값을 정리했다. 외식 비중이 예상보다 컸다. 다음 달은 주 2회로 줄여보기로.", ["예산", "지출"]],
    ["선저축 설정", "월급날 자동이체로 저축이 먼저 빠지게 설정했다. 남는 걸 저축하는 게 아니라 저축하고 남기는 방향.", ["저축", "시스템"]],
    ["구독 정리", "안 쓰는 구독 서비스 두 개를 해지했다. 소액이지만 쌓이면 꽤 된다.", ["구독", "절약"]],
    ["적립식 투자", "지수 추종 ETF에 소액 적립식으로 넣기로 했다. 타이밍보다 꾸준함이라는 원칙을 지키려 한다.", ["투자", "ETF"]],
    ["비상금 확보", "비상금을 3개월치 생활비로 맞췄다. 여유 자금이 있으니 마음이 든든하다.", ["비상금", "안정"]],
    ["큰 지출 계획", "노트북 교체를 고민 중이다. 당장은 아니고 다음 분기에 예산을 잡아두기로.", ["지출", "계획"]],
    ["가계부 습관", "가계부를 자기 전 30초만 적는 걸로 바꿨다. 완벽하게 쓰려다 포기하느니 대충이라도 매일.", ["가계부", "습관"]],
    ["환전 분산", "여행 자금 때문에 환율을 며칠 지켜봤다. 조금씩 나눠 환전하기로 했다.", ["환율", "여행"]],
    ["연말정산 대비", "연말정산 대비해 영수증과 공제 항목을 미리 모으기 시작했다.", ["세금", "정리"]],
    ["소비 회고", "이번 주 충동구매를 돌아봤다. 장바구니에 담고 하루 뒤 다시 보니 반은 필요 없었다.", ["소비", "회고"]],
    ["목표 저축 통장", "여행 자금을 위한 별도 통장을 만들었다. 목표가 눈에 보이니 모으는 재미가 있다.", ["저축", "목표"]],
    ["지출 자동 분류", "가계부 앱 카테고리를 손봤다. 자동 분류가 맞아떨어지니 정리 시간이 확 줄었다.", ["가계부", "도구"]],
  ],
  recreation: [
    ["극장 영화", "오랜만에 극장에서 영화를 봤다. 큰 화면과 사운드 덕분에 온전히 몰입했다.", ["영화", "여가"]],
    ["커피 산책", "주말 아침, 좋아하는 카페까지 걸어가 커피 한 잔을 했다. 아무 계획 없는 시간이 필요했다.", ["산책", "휴식"]],
    ["협동 게임", "친구들과 온라인으로 협동 게임을 했다. 이기고 지고를 떠나 같이 웃는 게 좋다.", ["게임", "친구"]],
    ["음악 감상", "오래된 플레이리스트를 다시 들었다. 그때의 기분이 같이 떠올라 잠깐 추억에 잠겼다.", ["음악", "추억"]],
    ["새 레시피", "새 레시피로 파스타를 만들어봤다. 실패는 아니었지만 다음엔 소금을 덜 넣기로.", ["요리", "취미"]],
    ["사진전 관람", "동네 작은 갤러리에서 사진전을 봤다. 조용히 걸으며 보는 시간이 좋았다.", ["전시", "문화"]],
    ["짧은 낮잠", "오후에 20분 낮잠을 잤다. 짧게 잤는데도 개운했다.", ["휴식", "낮잠"]],
    ["밤 드라이브", "저녁에 목적지 없이 드라이브를 했다. 좋아하는 노래를 크게 틀고 창을 살짝 열었다.", ["드라이브", "힐링"]],
    ["반려식물 돌봄", "베란다 화분에 물을 주고 새 잎을 확인했다. 천천히 자라는 걸 보는 재미가 있다.", ["식물", "일상"]],
    ["보드게임", "가족과 보드게임을 했다. 규칙을 두고 티격태격하는 것도 즐거움의 일부.", ["보드게임", "가족"]],
    ["독서 카페", "조용한 카페에서 소설을 읽었다. 일과 무관한 이야기에 빠지니 머리가 식었다.", ["독서", "휴식"]],
    ["산책 사진", "산책하며 눈에 띄는 풍경을 몇 장 찍었다. 잘 찍으려기보다 그냥 담고 싶었다.", ["사진", "산책"]],
    ["무위의 시간", "일요일 오후, 정말 아무것도 안 하고 창밖만 봤다. 이런 무위의 시간도 필요하다.", ["휴식", "여백"]],
  ],
  collect: [
    ["링크 저장", "나중에 읽으려고 긴 글 링크를 담아뒀다. 지금은 시간이 없지만 주말에 볼 것.", ["링크", "나중에"]],
    ["아이디어 메모", "샤워하다 떠오른 앱 아이디어를 급하게 적었다. 될지는 모르지만 일단 담아둔다.", ["아이디어", "메모"]],
    ["인용구", "어디서 본 문장이 좋아 옮겨 담았다. '완벽함이 아니라 방향'이라는 말.", ["인용", "기록"]],
    ["살 것 목록", "떨어진 생필품을 메모했다. 장 볼 때 까먹지 않으려고.", ["쇼핑", "목록"]],
    ["추천받은 책", "지인이 추천한 책 제목을 담아뒀다. 다음 독서 목록에 넣을 것.", ["책", "추천"]],
    ["가볼 곳", "언젠가 가보고 싶은 카페 위치를 저장했다. 근처 갈 일 생기면 들르기.", ["장소", "위시리스트"]],
    ["단상", "문득 든 생각 한 줄. 바쁠수록 왜를 자주 잊는다.", ["단상", "생각"]],
    ["스크린샷 정리", "찍어둔 스크린샷 중 쓸 만한 것만 골라 담았다. 나머지는 정리.", ["정리", "이미지"]],
    ["임시 할 일", "당장 분류하긴 애매한 할 일을 일단 여기 담았다. 나중에 프로젝트로 옮길 것.", ["할일", "임시"]],
    ["선물 아이디어", "가족 선물 아이디어가 떠올라 적어뒀다. 기념일 전에 다시 볼 것.", ["선물", "아이디어"]],
    ["궁금한 단어", "대화 중 모르는 단어가 나와 담아뒀다. 이따 찾아볼 것.", ["단어", "궁금증"]],
    ["잡동사니 보관", "분류 애매한 것들을 일단 여기 모았다. 담아두는 것만으로도 머릿속이 정리된다.", ["잡동사니", "보관"]],
  ],
};

// Recency profile per domain. `recent` domains spread over the last 8 weeks so
// trends/timeline have temporal spread and stay bright. `stale` domains are dated
// 62-86 days ago (>60d) so the §4.5 ④ recency downgrade fires → one band dimmer,
// still inside the 90-day records-feed window so their rows remain visible.
const DAY_MS = 86_400_000;
const RECENCY = {
  career: "recent",
  growth: "recent",
  relation: "recent",
  health: "recent",
  finance: "recent",
  recreation: "stale",
  collect: "stale",
};

/** Deterministic created_at for entry i of N in a domain, so re-runs are stable. */
function createdAtFor(profile, i, n) {
  const frac = n > 1 ? i / (n - 1) : 0;
  const dayAgo = profile === "stale"
    ? 62 + Math.round(frac * 24)   // 62..86 days ago (stale, < 90d feed window)
    : Math.round(frac * 55);        // 0..55 days ago (recent, within 8 weeks)
  const hours = (i * 7) % 24;       // spread across the day so timestamps differ
  const minutes = (i * 13) % 60;
  return new Date(Date.now() - dayAgo * DAY_MS - hours * 3_600_000 - minutes * 60_000).toISOString();
}

function summaryOf(body) {
  return body.length > 60 ? body.slice(0, 57) + "…" : body;
}

// ---------------------------------------------------------------------------
// VALUES self-report seed (7th block). Mirrors src/lib/persona/values-survey.ts:
// 12 items, 2 per value, 6-point Likert (1..6). Per-value = mean of its 2 items,
// normalized (mean-1)/5*100 → 0-100, sorted desc. Confidence = answered-fraction
// × 0.64, capped 0.7 (honest sub-max, NOT 100%). Plain .mjs can't import the TS
// module, so the item→value map and scorer are replicated here EXACTLY.
//
// HONESTY: the scores are COMPUTED from the synthetic responses below with the
// app's exact rule — never hardcoded, never the reference prototype's example
// numbers. The row is tagged qa_seed so it lives with the other assessment seeds
// (bfi/ecr), and labeled clearly synthetic in topic/conclusion.
const VALUES_ITEM = [
  [1, "self_direction"], [2, "self_direction"],
  [3, "stimulation"], [4, "stimulation"],
  [5, "authenticity"], [6, "authenticity"],
  [7, "benevolence"], [8, "benevolence"],
  [9, "achievement"], [10, "achievement"],
  [11, "security"], [12, "security"],
];
// Synthetic, internally consistent 1..6 answers producing a clearly ranked
// spectrum (self_direction highest → security lowest). Scores derive from these.
const VALUES_RESPONSES = {
  1: 6, 2: 5,   // self_direction → mean 5.5 → 90
  3: 4, 4: 4,   // stimulation    → mean 4.0 → 60
  5: 5, 6: 5,   // authenticity   → mean 5.0 → 80
  7: 5, 8: 4,   // benevolence    → mean 4.5 → 70
  9: 4, 10: 3,  // achievement    → mean 3.5 → 50
  11: 3, 12: 2, // security       → mean 2.5 → 30
};

function scoreValues(resp) {
  const sums = {};
  let answered = 0;
  for (const [id, value] of VALUES_ITEM) {
    const raw = resp[id];
    if (typeof raw !== "number" || raw < 1 || raw > 6 || !Number.isFinite(raw)) continue;
    answered += 1;
    sums[value] = sums[value] || { sum: 0, count: 0 };
    sums[value].sum += raw;
    sums[value].count += 1;
  }
  const scores = Object.entries(sums)
    .map(([value, { sum, count }]) => {
      const mean = count > 0 ? sum / count : 0;
      const score = count > 0 ? Math.round(((mean - 1) / 5) * 100) : 0;
      return { value, score };
    })
    .sort((a, b) => b.score - a.score);
  const CEILING = 0.64, HARD_CAP = 0.7;
  const confidence = Math.min(HARD_CAP, Math.round((answered / VALUES_ITEM.length) * CEILING * 100) / 100);
  return { scores, confidence, answered };
}

const VALUE_LABEL_KO = {
  self_direction: "자율성", stimulation: "새로움", authenticity: "진정성",
  benevolence: "돌봄", achievement: "성취", security: "안정",
};

// ---------------------------------------------------------------------------
// STRENGTHS self-report seed (8th block). Mirrors src/lib/persona/strengths-survey.ts:
// 10 items, 2 per strength, 6-point Likert (1..6). Per-strength = mean of its 2
// items, normalized (mean-1)/5*100 → 0-100, sorted desc. Confidence = answered-
// fraction × 0.64, capped 0.7 (honest sub-max, NOT 100%). Plain .mjs can't import
// the TS module, so the item→strength map and scorer are replicated here EXACTLY.
//
// HONESTY: the scores are COMPUTED from the synthetic responses below with the
// app's exact rule — never hardcoded, never the reference prototype's example
// numbers. The row is tagged qa_seed so it lives with the other assessment seeds
// (bfi/ecr/values), and labeled clearly synthetic in topic/conclusion.
const STRENGTHS_ITEM = [
  [1, "curiosity"], [2, "curiosity"],
  [3, "grit"], [4, "grit"],
  [5, "honesty"], [6, "honesty"],
  [7, "empathy"], [8, "empathy"],
  [9, "aesthetics"], [10, "aesthetics"],
];
// Synthetic, internally consistent 1..6 answers producing a clearly ranked
// spectrum (curiosity highest → aesthetics lowest). Scores derive from these.
const STRENGTHS_RESPONSES = {
  1: 6, 2: 5,   // curiosity  → mean 5.5 → 90
  3: 5, 4: 4,   // grit       → mean 4.5 → 70
  5: 4, 6: 4,   // honesty    → mean 4.0 → 60
  7: 4, 8: 3,   // empathy    → mean 3.5 → 50
  9: 3, 10: 2,  // aesthetics → mean 2.5 → 30
};

function scoreStrengths(resp) {
  const sums = {};
  let answered = 0;
  for (const [id, strength] of STRENGTHS_ITEM) {
    const raw = resp[id];
    if (typeof raw !== "number" || raw < 1 || raw > 6 || !Number.isFinite(raw)) continue;
    answered += 1;
    sums[strength] = sums[strength] || { sum: 0, count: 0 };
    sums[strength].sum += raw;
    sums[strength].count += 1;
  }
  const scores = Object.entries(sums)
    .map(([strength, { sum, count }]) => {
      const mean = count > 0 ? sum / count : 0;
      const score = count > 0 ? Math.round(((mean - 1) / 5) * 100) : 0;
      return { strength, score };
    })
    .sort((a, b) => b.score - a.score);
  const CEILING = 0.64, HARD_CAP = 0.7;
  const confidence = Math.min(HARD_CAP, Math.round((answered / STRENGTHS_ITEM.length) * CEILING * 100) / 100);
  return { scores, confidence, answered };
}

const STRENGTH_LABEL_KO = {
  curiosity: "호기심", grit: "끈기", honesty: "정직함",
  empathy: "공감", aesthetics: "심미안",
};

// ---------------------------------------------------------------------------
async function api(path, init = {}, token = ANON_KEY) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function countTag(userId, tag, token) {
  const q = `user_id=eq.${userId}&tags=cs.%7B${tag}%7D&select=id`;
  const rows = await api(`/rest/v1/records?${q}`, {}, token);
  return Array.isArray(rows) ? rows.length : 0;
}

async function main() {
  // 1. Password-grant login (GoTrue REST) — anon key + QA creds only.
  const session = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: QA_EMAIL, password: QA_PASSWORD }),
  });
  const token = session.access_token;
  const userId = session.user?.id;
  if (!token || !userId) throw new Error("Login succeeded but no access_token/user id in response");
  console.log(`Logged in as QA user ${userId}`);

  // Snapshot the BFI/ECR assessment seed count BEFORE, to prove it stays
  // untouched by the domain + values seeding below.
  const assessmentBefore = await countTag(userId, ASSESSMENT_PROOF_TAG, token);
  console.log(`BFI/ECR assessment seed (tag ${ASSESSMENT_PROOF_TAG}) rows before: ${assessmentBefore}`);

  // 2. Idempotency: delete ONLY this user's previous qa_seed_domain rows.
  const delQuery = `user_id=eq.${userId}&tags=cs.%7B${SEED_TAG}%7D`;
  const deleted = await api(`/rest/v1/records?${delQuery}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  }, token);
  console.log(`Removed ${Array.isArray(deleted) ? deleted.length : 0} previous ${SEED_TAG} row(s)`);

  // 3. Build all rows across the seven domains.
  const rows = [];
  const plan = {};
  for (const [domain, pool] of Object.entries(POOLS)) {
    const profile = RECENCY[domain];
    const n = pool.length;
    plan[domain] = n;
    pool.forEach(([topic, body, koTags], i) => {
      rows.push({
        user_id: userId,
        kind: "note", // no AI call — safe
        body,
        topic,
        summary: summaryOf(body),
        conclusion: CONCLUSION,
        // domain: tag routes the record to its star; ko user tags mark it as
        // "organized"; SEED_TAG is the idempotency handle.
        tags: [`domain:${domain}`, ...koTags, SEED_TAG],
        created_at: createdAtFor(profile, i, n),
        prompt: null,
        audit_period: null,
        ai_followup: null,
        structured: null,
      });
    });
  }
  console.log(`Prepared ${rows.length} rows: ${Object.entries(plan).map(([d, c]) => `${d}=${c}`).join(", ")}`);

  // 4. Insert. Chunk to keep each request modest.
  let insertedTotal = 0;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const inserted = await api("/rest/v1/records", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(chunk),
    }, token);
    insertedTotal += Array.isArray(inserted) ? inserted.length : 0;
  }
  console.log(`Inserted ${insertedTotal} row(s).`);

  // 5. Verify: read every seeded row back and bucket by domain. Also inspect
  //    created_at spread to confirm whether the column accepted our override.
  const verifyRows = await api(
    `/rest/v1/records?user_id=eq.${userId}&tags=cs.%7B${SEED_TAG}%7D&select=id,tags,created_at&limit=2000`,
    {},
    token,
  );
  const byDomain = {};
  let minTs = Infinity, maxTs = -Infinity;
  for (const r of verifyRows) {
    const domTag = (r.tags ?? []).find((t) => typeof t === "string" && t.startsWith("domain:"));
    const dom = domTag ? domTag.slice("domain:".length) : "(none)";
    byDomain[dom] = (byDomain[dom] ?? 0) + 1;
    const ts = Date.parse(r.created_at);
    if (Number.isFinite(ts)) { minTs = Math.min(minTs, ts); maxTs = Math.max(maxTs, ts); }
  }

  console.log("\n=== VERIFICATION (read back from PostgREST) ===");
  const order = ["career", "finance", "growth", "relation", "health", "recreation", "collect"];
  let grand = 0;
  for (const d of order) {
    const c = byDomain[d] ?? 0;
    grand += c;
    console.log(`  ${d.padEnd(11)} : ${c}`);
  }
  console.log(`  ${"TOTAL".padEnd(11)} : ${grand}  (all ${SEED_TAG} rows: ${verifyRows.length})`);

  const spanDays = (maxTs - minTs) / DAY_MS;
  const settable = Number.isFinite(spanDays) && spanDays > 3;
  console.log(`\ncreated_at span: ${spanDays.toFixed(1)} days ` +
    `(${new Date(minTs).toISOString().slice(0, 10)} .. ${new Date(maxTs).toISOString().slice(0, 10)})`);
  console.log(`created_at settable on insert: ${settable ? "YES (override honored)" : "NO (DB set its own now())"}`);

  // 6. Values self-report seed (7th block). Idempotency: delete ONLY rows that
  //    carry BOTH "values" AND "qa_seed" — precise to this seed row (the bfi/ecr
  //    assessment rows carry qa_seed but NOT values; domain rows carry neither),
  //    so re-runs replace exactly one values row and never touch anything else.
  const valuesDelQuery = `user_id=eq.${userId}&tags=cs.%7Bvalues,${ASSESSMENT_TAG}%7D`;
  const valuesDeleted = await api(`/rest/v1/records?${valuesDelQuery}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  }, token);
  console.log(`\nRemoved ${Array.isArray(valuesDeleted) ? valuesDeleted.length : 0} previous values self-report row(s)`);

  const values = scoreValues(VALUES_RESPONSES);
  const valuesSummary = values.scores
    .slice(0, 3)
    .map((s) => `${VALUE_LABEL_KO[s.value] ?? s.value}: ${s.score}`)
    .join("  ·  ");
  const valuesRow = {
    user_id: userId,
    kind: "note", // no AI call — safe
    body: JSON.stringify({
      values_responses: VALUES_RESPONSES,
      scores: values.scores,
      confidence: values.confidence,
    }),
    topic: "가치 자기보고 · QA seed",
    summary: valuesSummary,
    conclusion: `자기보고 추정 (진단 아님) · ${CONCLUSION}`,
    // qa_seed (not qa_seed_domain) so it lives with the other assessment seeds.
    tags: ["values", "assessment", ASSESSMENT_TAG],
    created_at: new Date().toISOString(),
    prompt: null,
    audit_period: null,
    ai_followup: null,
    structured: null,
  };
  const valuesInserted = await api("/rest/v1/records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([valuesRow]),
  }, token);
  const vId = Array.isArray(valuesInserted) && valuesInserted[0] ? valuesInserted[0].id : "(none)";
  console.log(`Inserted values self-report ${vId}: confidence ${Math.round(values.confidence * 100)}% · ${valuesSummary}`);

  // Verify the values row reads back via the same contains-filter the app uses.
  const valuesVerify = await api(
    `/rest/v1/records?user_id=eq.${userId}&tags=cs.%7Bvalues,assessment%7D&select=id,topic,tags,created_at&order=created_at.desc&limit=1`,
    {},
    token,
  );
  if (!Array.isArray(valuesVerify) || valuesVerify.length === 0) throw new Error("VERIFY FAILED: no values self-report row");
  console.log(`VERIFY values: ${valuesVerify[0].id} · ${valuesVerify[0].topic}`);

  // 6b. Strengths self-report seed (8th block). Idempotency: delete ONLY rows
  //     carrying BOTH "strengths" AND "qa_seed" — precise to this seed row (the
  //     bfi/ecr assessment rows carry qa_seed but NOT strengths; the values row
  //     carries qa_seed but NOT strengths; domain rows carry neither), so re-runs
  //     replace exactly one strengths row and never touch anything else.
  const strengthsDelQuery = `user_id=eq.${userId}&tags=cs.%7Bstrengths,${ASSESSMENT_TAG}%7D`;
  const strengthsDeleted = await api(`/rest/v1/records?${strengthsDelQuery}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  }, token);
  console.log(`\nRemoved ${Array.isArray(strengthsDeleted) ? strengthsDeleted.length : 0} previous strengths self-report row(s)`);

  const strengths = scoreStrengths(STRENGTHS_RESPONSES);
  const strengthsSummary = strengths.scores
    .slice(0, 3)
    .map((s) => `${STRENGTH_LABEL_KO[s.strength] ?? s.strength}: ${s.score}`)
    .join("  ·  ");
  const strengthsRow = {
    user_id: userId,
    kind: "note", // no AI call — safe
    body: JSON.stringify({
      strengths_responses: STRENGTHS_RESPONSES,
      scores: strengths.scores,
      confidence: strengths.confidence,
    }),
    topic: "강점 자기보고 · QA seed",
    summary: strengthsSummary,
    conclusion: `자기보고 추정 (진단 아님) · ${CONCLUSION}`,
    // qa_seed (not qa_seed_domain) so it lives with the other assessment seeds.
    tags: ["strengths", "assessment", ASSESSMENT_TAG],
    created_at: new Date().toISOString(),
    prompt: null,
    audit_period: null,
    ai_followup: null,
    structured: null,
  };
  const strengthsInserted = await api("/rest/v1/records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([strengthsRow]),
  }, token);
  const sId = Array.isArray(strengthsInserted) && strengthsInserted[0] ? strengthsInserted[0].id : "(none)";
  console.log(`Inserted strengths self-report ${sId}: confidence ${Math.round(strengths.confidence * 100)}% · ${strengthsSummary}`);

  // Verify the strengths row reads back via the same contains-filter the app uses.
  const strengthsVerify = await api(
    `/rest/v1/records?user_id=eq.${userId}&tags=cs.%7Bstrengths,assessment%7D&select=id,topic,tags,created_at&order=created_at.desc&limit=1`,
    {},
    token,
  );
  if (!Array.isArray(strengthsVerify) || strengthsVerify.length === 0) throw new Error("VERIFY FAILED: no strengths self-report row");
  console.log(`VERIFY strengths: ${strengthsVerify[0].id} · ${strengthsVerify[0].topic}`);

  // 7. Prove the Big Five / ECR assessment seed is untouched. Count the "bfi"
  //    tag — the values row does NOT carry it, so this stays a clean, stable
  //    proof that domain + values seeding never deletes the real assessment rows.
  const assessmentAfter = await countTag(userId, ASSESSMENT_PROOF_TAG, token);
  console.log(`\nBFI/ECR assessment seed (tag ${ASSESSMENT_PROOF_TAG}) rows after: ${assessmentAfter} ` +
    `(${assessmentAfter === assessmentBefore ? "UNCHANGED — not touched" : "CHANGED — investigate!"})`);
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
