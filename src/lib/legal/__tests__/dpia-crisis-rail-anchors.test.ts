import fs from "node:fs";
import path from "node:path";

// 경로가 풀리고 줄도 있는데, 그 줄이 문서가 말하는 그것이 아닌 경우.
//
// Round40 은 "존재하지 않는 파일"을, Round43 은 "이름으로 못 찾거나 여럿에
// 걸리는 파일"을 닫았다. 둘 다 경로 검사다. 남은 것은 **경로 검사가 원리적으로
// 못 보는 것**이다 - 파일도 있고 줄도 있는데 그 줄이 다른 내용인 경우.
//
// 이 문서에서 가장 크게 벌어져 있던 것이 하필 가장 안전에 가까운 주장이었다:
// `fixedCrisisResponse` 가 아홉 자리에서 `:266-298` 로 인용돼 있었는데 실제
// 위치는 `:408-438` 이다. **"위기 응답은 사람이 쓴 고정 템플릿이고 모델이
// 만들지 않는다"를 확인하러 간 사람은 그 자리에서 의미 분류기의 시스템
// 프롬프트를 읽게 된다** - 정확히 반대 결론이 나오는 자리다.
//
// 아래 표는 그 재읽기의 결과를 못박는다. 표가 손으로 쓰인 이유는 "인용 옆의
// 심볼"을 기계로 뽑으면 이 문서에서 일곱 쌍밖에 안 나오기 때문이다(측정값).
// 일곱 개짜리 검사로 백예순다섯 건을 지킨다고 말하는 것이 더 나쁘다.
const ROOT = process.cwd();
const DPIA = path.join(ROOT, "docs", "legal", "DPIA-2ndB-minors-draft.md");
const doc = fs.readFileSync(DPIA, "utf8").replace(/\r\n/g, "\n");

const read = (rel: string): string[] => fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);

interface Anchor {
  /** 문서가 적고 있는 인용, 그대로. */
  cite: string;
  /** 그 범위 안에 반드시 있어야 하는 문자열. */
  symbol: string;
  /** 왜 이 자리가 중요한가 - 틀렸을 때 읽는 사람이 무엇을 잘못 믿게 되는가. */
  why: string;
  /** **코드가 하는 일**과 **코드가 자기에 대해 적어 둔 말**은 다른 종류의 근거다.
   *
   *  기본값은 `"code"` 이고, 그 경우 심볼은 주석을 걷어낸 뒤에도 남아야 한다.
   *  주석만 남는 자리를 근거로 받으면 "동작이 그렇다"와 "주석이 그렇다고 한다"가
   *  같은 신호가 된다 - 이 세션이 계속 만나는 결함 모양이다.
   *
   *  ⚠ 실제로 그 구멍으로 하나가 들어와 있었다. 문서가 미성년 1388 라우팅을
   *  `classifier.ts:58-67` 에 인용했는데, 그 범위는 **다른 함수(`matchesTerm`)의
   *  꼬리 + 주석 블록**이고 실행되는 코드가 한 줄도 없다. 주석에 `1388` 이
   *  적혀 있어서 어떤 대조도 울지 않았다.
   *
   *  `"comment"` 는 **주장 자체가 "코드가 이렇게 적어 두었다"일 때만** 쓴다.
   *  지금 둘뿐이고, 둘 다 문서가 그 문장을 근거로 인용하고 있다. */
  evidence?: "code" | "comment";
}

/** 주석을 걷어낸 텍스트.
 *
 *  ⚠ `://` 앞을 지키지 않으면 `https://...` 뒤가 통째로 잘려서, 주석이 아닌 값이
 *  사라진 채 "심볼 없음" 이 뜬다 - 검사기가 틀리고 대상이 멀쩡한 경우다. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map(line => line.replace(/(^|[^:\w])\/\/.*$/, "$1"))
    .join("\n");
}

/** 앵커가 대조해야 하는 텍스트. 기본은 코드, 명시했을 때만 주석 포함. */
function evidenceText(anchor: Anchor, cite = anchor.cite): string {
  const raw = slice(cite).text;
  return anchor.evidence === "comment" ? raw : stripComments(raw);
}

const S = "src/lib/llm/safety.ts";
const C = "src/lib/safety/classifier.ts";
const P = "src/lib/privacy/prefs.ts";
const R = "src/lib/ops/recommend.ts";
const A = "src/lib/auth/consent-age.ts";
const D = "supabase/functions/delete-account/index.ts";
const X = "supabase/functions/export-account/index.ts";
const W = "src/lib/wiki/export.ts";
const AC = "src/lib/auth/AuthContext.tsx";
const AD = "src/lib/ads/policy.ts";
const CV = "src/lib/chat/conversation.ts";
const AT = "src/lib/analytics/__tests__/analytics.test.ts";
const LR = "scripts/check-legal-review.ts";

const ANCHORS: Anchor[] = [
  { cite: `${S}:408-438`, symbol: "fixedCrisisResponse",
    why: "위기 응답이 사람이 쓴 고정 템플릿이라는 주장의 근거. 어긋나면 의미 분류기 프롬프트를 읽게 된다." },
  { cite: `${S}:287-390`, symbol: "classifySafety",
    why: "3층 방어 중 둘째 층(의미 분류기)." },
  { cite: `${S}:177-199`, symbol: "mergeResults",
    why: "RED-wins 병합. 이게 아니면 '보수적으로 합친다'는 주장에 근거가 없다." },
  { cite: `${S}:179-187`, symbol: "indexOf",
    why: "모르는 zone 을 RED 로 취급하는 fail-closed 순위. 위기에서 열리지 않는다는 주장." },
  { cite: `${S}:56-68`, symbol: "Suicide CARE",
    why: "KO/EN 마커 목록. 어느 임상 근거를 쓰는지가 여기서 확인된다." },
  { cite: `${S}:92`, symbol: "EXPO_PUBLIC_USE_VERTEX",
    why: "키 없는 웹 빌드에서 의미 층이 꺼진다는 잔여위험 서술의 근거." },
  { cite: `${S}:412,424`, symbol: "crisisHotlines",
    why: "미성년 라우팅이 실제로 핫라인 목록을 부르는 자리." },
  { cite: `${C}:70-79`, symbol: "crisisHotlines",
    why: "(locale, minor) → 핫라인 표시 순서." },
  { cite: `${C}:73-75`, symbol: "KR_1388",
    why: "미성년에게 1388 이 먼저 온다는 주장. 순서가 주장의 내용이다." },
  { cite: `${C}:70-90`, symbol: "1388",
    why: "⚠ 이 앵커는 **산문 낱말을 일부러 심볼로 쓴다.** 다른 앵커에서는 금기지만 여기서는 그게 목적이다 - 문서가 미성년 라우팅을 여덟 자리에서 주장하며 전부 '1388' 이라고 산문으로 적고, 그중 한 자리가 `:58-67`(주석 블록)을 가리키고 있었다. 심볼이 `KR_1388` 이면 산문 '1388' 과 안 겹쳐서 그 자리는 **한 번도 대조되지 않는다.** 산문 낱말로 잡아야 여덟 자리 전부가 검사에 들어온다. 주석을 걷은 뒤에도 남아야 하므로(evidence 기본값) 주석에 적힌 `1388` 로는 통과할 수 없다." },
  { cite: `${LR}:14`, symbol: "365",
    why: "검토 주기 365일이 **실제로 사는 자리**. 문서는 이 숫자를 `lexicon.ts:455-456` 에 인용하고 있었는데 그 범위는 주석 두 줄이고 `365` 라는 글자가 아예 없다(숫자는 :459 주석, 실제 상수는 여기). 주기가 바뀌면 문서가 조용히 틀려진다." },
  { cite: `${C}:91-116`, symbol: "classifyInput",
    why: "3층 방어 중 첫째 층(동기 렉시콘 백스톱)." },
  { cite: `${C}:142-159`, symbol: "containsAnalysisForbidden",
    why: "비임상 어휘 가드 C-LEX 의 구현." },
  { cite: `${P}:55-62`, symbol: "defaultPrivacyPrefs",
    why: "'바깥으로 나가는 설정은 전부 기본 꺼짐' - 이 문서 전체 개인정보 자세의 하중을 받는 주장." },
  { cite: `${P}:95-99`, symbol: "MINOR_PROMOTABLE_KEYS",
    why: "미성년이 스스로 켤 수 있는 유일한 둘. 목록 자체가 주장의 내용이다." },
  { cite: `${P}:125`, symbol: "VISIBLE_PRIVACY_KEYS",
    why: "실제로 토글로 그려지는 셋. D-12 정직성 제약." },
  { cite: `${P}:137-140`, symbol: "isPrivacyPrefEditable",
    why: "미성년 UI 잠금. 서버 클램프와 짝을 이루는 클라이언트 쪽." },
  { cite: `${R}:127-134`, symbol: "recommendationsAllowed",
    why: "추천이 명시적 동의 없이는 안 도는 게이트. D-20 이 열어 둔 구멍을 닫은 자리." },
  { cite: `${R}:235`, symbol: "exportUserWiki",
    why: "저널이 프롬프트에 안 들어간다는 주장의 **실제 근거**. includeRecords 를 안 넘기는 그 호출." },
  { cite: `${R}:248-250`, symbol: "UNTRUSTED",
    why: "스냅샷을 신뢰하지 않는 데이터로 감싸는 자리. 클립된 페이지가 프롬프트를 조종하지 못한다는 주장." },
  { cite: `${R}:199-273`, symbol: "recommendForDomain",
    why: "추천이 무엇을 프로파일링하는지 - 그 함수 자체." },
  { cite: `${A}:28-33`, symbol: "DIGITAL_CONSENT_AGE",
    why: "어느 나라 동의 연령이 적용되는가 - 미성년 DPIA 에서 이보다 무거운 표는 없다." },
  { cite: `${D}:165-177`, symbol: "Array.isArray(removed)",
    why: "지움이 부분적으로 끝날 수 있다는 사실을 코드가 관측하는 자리. 이게 없으면 문서의 '지워졌다'가 관측되지 않은 주장이 된다." },
  { cite: `${D}:150-164`, symbol: "listErr",
    why: "페이지 단위 버킷 정리 루프 - Art.17 삭제 주장의 실제 근거. ⚠ 심볼로 `raw-clippings` 를 썼다가 걸렸다: 그건 버킷 **이름**이라 산문에도 나오고, 옆 인용(:113-121)이 인접 창 안에 들어와 멀쩡한 문장이 위반이 됐다. **앵커 심볼은 산문에 나올 수 없을 만큼 구체적이어야 한다.**" },
  { cite: `${X}:97-115`, symbol: "consent_records",
    why: "Art.20 이식성이 실제로 무엇을 담아 오는가. 6.1.3 이 '빠져 있다'고 나열하던 여덟 범주가 바로 이 목록이다." },
  { cite: `${X}:20-24`, symbol: "gemini_spend_daily", evidence: "comment",
    why: "일부러 뺀 저장소 셋. 빼는 것 자체가 아니라 **응답에 적어 돌려준다는 것**이 통제이고, 그 목록을 코드가 주석으로 적어 둔 자리라서 주석이 근거다." },
  { cite: `${W}:240`, symbol: "includeRecords",
    why: "저널이 기본으로 안 실린다는 주장의 **실제 근거** - 그 삼항 연산이 없으면 기본값이 무의미하다." },
  { cite: `${AT}:96-131`, symbol: "remain inert",
    why: "Sentry 가 **일부러** 닫혀 있다는 주장의 근거. 문서가 '설정됐으나 안 쓴다'가 아니라 '울타리가 있고 조건이 적혀 있다'고 말하려면 그 울타리를 지키는 검사가 실재해야 한다." },
  { cite: `${AC}:132`, symbol: "MINOR_AGE_CEILING",
    why: "미성년 여부가 실제로 정해지는 비교. 이 문서 전체가 이 한 줄 위에 서 있다." },
  { cite: `${AD}:58`, symbol: "input.isMinor !== false",
    why: "미성년에게 광고가 안 나간다는 주장의 fail-closed 지점 - null 도 막는다는 것이 주장의 내용이다." },
  { cite: `${AD}:11-13`, symbol: "NEVER see ads", evidence: "comment",
    why: "그 규칙을 코드가 스스로 적어 둔 자리 - 주장 자체가 '코드가 이렇게 적어 두었다'라서 주석이 근거다." },
  { cite: `${CV}:338`, symbol: "SYSTEM_PROMPT_HEADER",
    why: "대화 프롬프트가 실제로 조립되는 자리 - 무엇이 모델에 들어가는지의 근거." },
  { cite: "src/lib/ops/recommend.ts:199-207", symbol: "recommendationsAllowed(input.minor",
    why: "엔진이 호출부와 **독립적으로** 게이트를 다시 본다는 주장의 근거. 493행이 '통제가 어느 한 화면에 기대지 않는다'고 말하는 근거가 이 한 줄이다 - 화면 잠금이 사라져도 스냅샷이 LLM 에 안 간다." },
  { cite: "src/screens/deepspace/dds-ops-screen.tsx:588-595", symbol: "recommendationsAllowed",
    why: "미성년 추천 잠금이 **배송되는 화면에서** 실제로 불리는 자리. ⚠ 원래 `src/app/ops.tsx:111` 을 가리켰는데 그 줄은 `OpsLegacy` 안이었고, 그 렌더러는 2026-09-08 에 `legacy/screens/ops.tsx` 로 나갔다 (그 전에는 `ops.tsx:501` 이 deep-space 일 때 위임해서 **어떤 배포도 그리지 않았다**). 잠금은 실재하는데 좌표가 죽어 있었다 - 회차 60(/data)·61(/audit) 과 같은 부류의 세 번째다." },
  // ── 통제 표(C-*)가 인용하는 코드 ──────────────────────────────────────────
  //
  // 회차 69 에 재서 넣었다: 문서에서 **변호사가 가장 먼저 읽는 표**인데, 열한
  // 통제 중 **셋의 인용을 어떤 앵커도 덮지 않고 있었다.** 그 셋이 정확히 이번에
  // 결함이 나온 자리다 - C-SENS 는 상태 칸이 낡아 있었고(회차 64·67 이 본문에서
  // 아홉 자리를 고쳤는데 표 칸만 살아남았다), C-DEL 은 함수가 아니라 **함수를
  // 언급하는 주석**을 가리키고 있었다.
  { cite: "db/migrations/0031_consent_records.sql:26-28", symbol: "sensitive_data_ack",
    why: "C-SENS 가 서는 스키마. 세 ack 중 PIPA §23 별도 동의를 잡는다 - 법적 무게가 가장 큰 것." },
  { cite: "db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:103-136", symbol: "auth.uid()",
    why: "C-AUDIT 의 '위조 불가 RPC' 주장이 서는 **한 줄**. user_id 를 클라이언트가 못 보내고 서버가 찍는다는 것이 위조 불가의 전부다. 함수 이름이 아니라 이 호출을 잡는 이유다." },
  { cite: "src/lib/records/delete-bulk.ts:262", symbol: "requestAccountDeletion",
    why: "C-DEL 의 종국적 삭제 진입점. ⚠ 문서는 `:178-185` 를 가리켰는데 그것은 이 함수를 **언급하는 주석**이다 - 통제 전체의 무게를 그 인용이 지고 있었다. 회차 68 의 '내용 있는 줄' 검사로는 안 잡힌다(주석도 내용이다). 심볼 앵커만이 본다." },
  { cite: "src/screens/deepspace/DeepSpaceDesignScreens.tsx:2792", symbol: "recommendationsAllowed(isMinor",
    why: "같은 잠금의 **두 번째 배송 호출부**. 493행이 호출부를 둘 이름 부르는데 이쪽만 앵커가 없었다. ⚠ 문서는 `:2786` 을 인용했고 그 줄은 **빈 줄**이다 - 여섯 줄 위. 회차 68 이 '인용이 아무것도 아닌 줄에 앉아 있다' 를 전수로 재서 찾았다(365건 중 이 한 건)." },
  { cite: `${D}:66-78`, symbol: "userIdFromJwt",
    why: "지울 계정을 클라이언트가 못 고른다는 IDOR 주장의 근거." },
  { cite: "src/lib/analytics/index.ts:245-252", symbol: "isMinor === false",
    why: "미성년에게 제품 분석이 안 붙는다는 주장의 **실제 게이트**. 문서는 세 자리에서 `:74`(AnalyticsEvent 타입 유니온)를 가리키고 있었다 - 타입 선언은 아무도 막지 않는다. ⚠ 심볼로 함수 이름 `canLoadProductAnalytics` 를 쓰려다 바꿨다: 회차 51·53 의 교훈대로 **이름은 그 이름이 가리키는 것이 바뀌어도 살아남는다.** 주장의 내용은 술어다." },
  { cite: "scripts/check-mascot-voice.ts:13-17", symbol: "personas.secondb.greeting",
    why: "의인화 가드가 **바로 그 키를 이름으로 지켜본다**는 근거. 문서는 '유일한 가드는 어휘 렉시콘'이라고 적어 이 게이트를 부정하고 있었다 - 회차 50 의 부류(있는 통제를 없다고 적기)." },
  { cite: "src/lib/persona/center.ts:92", symbol: "우리가 자주 머문",
    why: "1인칭 복수 화법 주장의 **실제 문자열**. 문서는 그것을 서술하는 주석(:4, :23)을 인용하고 있었다 - 주장은 참인데 근거가 '코드가 그렇다고 적어 둔 말'이었다." },
  { cite: "db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:87", symbol: "'external_analytics', false",
    why: "미성년에게 외부 분석이 서버에서 잠긴다는 주장의 실제 줄. ⚠ 문서가 `:88` 을 인용했는데 그 줄은 `'llm_training', false` 다 - **클라이언트 키 집합에서 가지쳐진 키**(회차 57·58)를 두 다른 설정의 근거로 가리키고 있었다." },
  { cite: "db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:86", symbol: "'recommendations', false",
    why: "미성년 추천 잠금의 서버 쪽 절반. D-20 화면 게이트와 짝을 이룬다 - 화면이 뚫려도 이 클램프가 남는다." },
  { cite: "db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:36-74", symbol: "block_self_tier_change",
    why: "한 문장으로 `minor_tier='adult' + prefs 전부 true` 를 쓰던 탈출구를 막은 트리거. 미성년 잠금 전체가 이 위에 선다." },
  { cite: "db/migrations/0012_crisis_events.sql:30-32", symbol: "Intentionally NO policies", evidence: "comment",
    why: "위기 원장이 사용자에게 안 보인다는 주장의 근거 - 정책이 없으면 거부다. 주장 자체가 '정책을 일부러 안 만들었다' 라서 주석이 근거다." },
  { cite: "db/migrations/0030_server_age_gate.sql:18-49", symbol: "age_years < 14",
    why: "14세 미만 자가가입을 서버가 막는다는 주장(C10)의 실제 비교. 미성년 DPIA 의 바닥선이다." },
  { cite: "db/migrations/0030_server_age_gate.sql:62-67", symbol: "users_active_has_tier",
    why: "활성 계정은 반드시 tier 를 갖는다는 제약 - 서버 파생이 우회되지 않는다는 주장의 근거." },
  { cite: "db/migrations/0033_minor_privacy_enforcement.sql:40-57", symbol: "NEW.minor_tier = 'minor_self'",
    why: "생년월일 정정으로 성인이 미성년이 될 때 개인정보 키를 다시 잠그는 자리. INSERT 만 보던 구멍을 메운 것이 이 조건이다." },
  { cite: "db/migrations/0033_minor_privacy_enforcement.sql:52", symbol: "'llm_training', false",
    why: "⚠ 회차 57 이 이 키를 '더 이상 존재하지 않는다'고 적었다가 58 에서 정정한 자리. 클라이언트 키 목록에서는 가지쳐졌지만 **서버 트리거는 여전히 쓴다** - 읽을 때 버려질 뿐이다. 둘은 구분되는 상태다." },
  { cite: "src/lib/auth/consent-selections.ts:20-21", symbol: "sensitiveData",
    why: "PIPA §23 별도 동의가 실제로 별개 항목으로 수집된다는 주장. 서비스 동의에 묻어 가지 않는다는 것이 주장의 내용이다." },
  { cite: "src/lib/supabase/consent.ts:124-126", symbol: "sensitive_data_ack",
    why: "동의 ack 셋이 **실제로 원장 행에 실리는** 자리. 일곱 자리가 '수집·기록된다'로 고쳐졌고, 그 주장이 서는 곳이 여기다. 주석이 아니라 쓰기다." },
  { cite: "src/lib/supabase/consent.ts:14-21", symbol: "WIRED at sign-up", evidence: "comment",
    why: "동의 기록이 UI 수집 **뒤에** 쓰인다는 불변식의 기록. 문서가 이 주석을 'still read null (stale)' 이라고 인용했었다." },
  { cite: `${A}:8-12`, symbol: "the country signal landed", evidence: "comment",
    why: "관할 신호가 **언제** 붙었는지의 날짜 기록. 문서가 세 자리에서 '신호 없음'을 주장하며 **바로 이 범위를 인용**하고 있었다 - 인용된 줄이 인용한 주장을 반증하는 상태였다. 주장 자체가 '코드가 이 날짜를 적어 두었다' 라서 주석이 근거다." },
  { cite: `${P}:103-105`, symbol: "were pruned", evidence: "comment",
    why: "문서가 credit 하던 `llm_training`/`persona_export`/`persona_share` 가 **왜 없는지**의 기록. 없는 설정을 통제로 적는 것을 막는다(회차 45 의 부류)." },
  // ⚠ 회차 57 이 여기에 `src/app/wiki.tsx:359` / `exportContextPack` 앵커를 두었다.
  // 회차 63 에서 지웠다: 그 줄은 `WikiLegacy` 안이고 어떤 배포도 그리지 않는다.
  // **맞는 함수 이름을 죽은 사본에 고정한 것**이라, 지키는 대상이 없었다.
  // 배송되는 위키 화면(`dds-wiki-records-screens.tsx`)에는 마크다운 내보내기 자체가
  // 없다 - 그 사실은 legal-citations-not-in-dead-renderers.test.ts 가 지킨다.
  { cite: `${CV}:293-296`, symbol: "wiki_snapshot",
    why: "스냅샷이 실제로 신뢰하지 않는 데이터로 감싸지는 자리. 문서는 프롬프트 문자열 블록을 가리키고 있었다." },
  { cite: `${R}:54`, symbol: "SNAPSHOT_CHAR_LIMIT",
    why: "600자 캡의 실제 상수. 문서는 임베딩 벤더 라벨 주석을 가리키고 있었다." },
  { cite: "src/lib/safety/lexicon.ts:460", symbol: "LEXICON_LAST_LEGAL_REVIEW",
    why: "법무 검토 날짜가 실제로 사는 자리. 문서가 이 상수를 `lexicon.ts:331`(한국어 금지어 목록의 한 줄)에도 인용하고 있었고, 같은 상수를 두 줄에 인용하면 하나는 반드시 틀리다." },
  { cite: "src/lib/safety/lexicon.ts:372-375", symbol: "ANALYSIS_JURISDICTION_FORBIDDEN",
    why: "관할별 목록이 자동 게이트에 안 붙어 있다는 주장의 대상. 문서는 스캔 면제 목록의 한 줄을 가리키고 있었다." },
  { cite: `${A}:108-121`, symbol: "deviceRegionCode",
    why: "그 표에 실제로 닿는 해석기. 2026-08-16 에 기기 지역 신호가 붙었는데 문서는 다섯 자리에서 '신호 없음'이라 적고 있었다." },
];

function slice(cite: string): { file: string; text: string; lines: number } {
  const [file, spec] = cite.split(":");
  const lines = read(file);
  const numbers = spec.split(/[,\-\s]+/).filter(Boolean).map(Number);
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return { file, text: lines.slice(Math.max(0, lo - 1), hi).join("\n"), lines: lines.length };
}

test("표가 실제로 채워져 있다 - 0건 통과를 막는다", () => {
  expect(ANCHORS.length).toBeGreaterThanOrEqual(10);
  expect(new Set(ANCHORS.map(a => a.cite)).size).toBe(ANCHORS.length);
});

/** `12` · `12-34` · `12,34` 를 줄 번호 집합으로. */
function spread(spec: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.trim().split("-").map(Number);
    if (!Number.isFinite(a)) continue;
    for (let n = a; n <= (Number.isFinite(b) ? b : a); n += 1) out.add(n);
  }
  return out;
}

test("통제 표의 'Implemented' 행은 앵커가 덮는 코드를 인용한다", () => {
  // **변호사가 문서에서 가장 먼저 읽는 표**가 통제 표다. 열한 행이 각각
  // "이 통제는 구현돼 있다" 고 말하고 그 근거로 코드를 인용한다.
  //
  // 회차 69 에 세어 보니 **셋의 인용을 어떤 앵커도 덮지 않았고**, 그 셋이
  // 정확히 이번에 결함이 나온 자리였다:
  //
  //   C-SENS   상태 칸이 "collection UI pending" - 회차 64·67 이 본문에서
  //            같은 주장을 아홉 자리 고쳤는데 **표 칸만 살아남았다.**
  //   C-DEL    `requestAccountDeletion()` 의 인용이 `:178-185` 인데 그것은
  //            함수가 아니라 **함수를 언급하는 주석**이다(함수는 `:262`).
  //   C-AUDIT  '위조 불가 RPC' 를 주장하는데 그 근거가 안 지켜지고 있었다.
  //
  // 정확히 같은 인용 문자열을 요구하지 않는다 - **범위가 겹치면** 그 코드는
  // 지켜지고 있는 것이다. C-AGE 가 `0030:18-67` 을 인용하고 앵커는 `:18-49` 와
  // `:62-67` 을 잡는데, 문자열로 재면 없는 구멍이 만들어진다.
  const anchoredLines = new Map<string, Set<number>>();
  for (const a of ANCHORS) {
    const at = a.cite.lastIndexOf(":");
    const file = a.cite.slice(0, at);
    const set = anchoredLines.get(file) ?? new Set<number>();
    for (const n of spread(a.cite.slice(at + 1))) set.add(n);
    anchoredLines.set(file, set);
  }

  const CITE = /`([A-Za-z0-9_@.][A-Za-z0-9_@./()-]*\.(?:tsx?|sql|json|md|ya?ml)):([0-9][0-9,\-]*)`/g;
  const rows = doc.split("\n").filter(l => l.startsWith("| **C-"));
  // 표를 못 읽으면 아래 단언이 영원히 초록이다.
  //
  // ⚠ 하한이 처음엔 `>= 10` 이었는데 변이 검증이 잡았다. 표가 열한 행이므로
  //   **한 행이 사라져도 통과**했다 - 정확히 이 검사가 막아야 할 일인데.
  //   오늘 수를 하한으로 둔다: 통제가 늘어나는 것은 자유고, **조용히 줄어드는
  //   것은 아니다.** 통제를 실제로 없앨 때는 이 수도 같이 내리면 된다.
  expect(rows.length).toBeGreaterThanOrEqual(11);

  const uncovered = rows
    .filter(row => /\|\s*Implemented/.test(row))
    .filter(row => {
      for (const m of row.matchAll(CITE)) {
        const lines = anchoredLines.get(m[1]);
        if (lines && [...spread(m[2])].some(n => lines.has(n))) return false;
      }
      return true;
    })
    .map(row => (/\| \*\*(C-[A-Z0-9]+)\*\*/.exec(row) ?? [, row.slice(0, 40)])[1]);
  expect(uncovered).toEqual([]);
});

test("문서가 이 인용들을 실제로 담고 있다", () => {
  // 표만 맞고 문서가 다른 숫자를 적고 있으면 이 검사는 아무것도 안 지킨다.
  const missing = ANCHORS.filter(a => !doc.includes("`" + a.cite + "`")).map(a => a.cite);
  expect(missing).toEqual([]);
});

test("표 자체가 코드에 대해 참이다", () => {
  // ⚠ 이 검사를 한 번 **없앴다가** 변이 검증이 잡아서 되살렸다. 아래 인접
  // 검사로 갈아끼웠는데, 그건 **문서가 심볼 이름을 인용 옆에 적었을 때만**
  // 발동한다. 문서가 "fenced as untrusted" 라고 소문자 산문으로 쓰면 앵커
  // `UNTRUSTED` 는 한 번도 대조되지 않는다 - 표가 코드에 대해 거짓이어도
  // 아무도 모른다.
  //
  // 둘은 다른 명제다:
  //   이 검사  - 표가 코드에 대해 참인가 (문서와 무관)
  //   아래 검사 - 문서가 그 표와 어긋나지 않는가
  // 하나로 합칠 수 없다.
  const broken = ANCHORS.filter(a => !evidenceText(a).includes(a.symbol)).map(
    a => `${a.cite} 안에 ${a.symbol} 없음 - ${a.why}`,
  );
  expect(broken).toEqual([]);
});

test("그 심볼을 말하는 모든 줄에서, 그 파일 인용이 심볼을 담는다", () => {
  // ⚠ 처음 판은 표의 인용이 문서에 **하나라도** 있으면 통과했다. 변이 검증이
  // 그 구멍을 찾았다: 같은 인용이 문서에 여러 번 나오므로 **한 자리만** 옛
  // 범위로 되돌려도 아무 검사도 울지 않는다. 실제로 이 문서에서 벌어졌던 일이
  // 정확히 그것이다 - `fixedCrisisResponse` 가 아홉 자리에 있었고 그중 셋만
  // 맞았다.
  //
  // 그래서 자리마다 본다: 심볼 이름이 적힌 줄에서 그 파일을 인용하는 **모든**
  // 범위가 심볼을 담아야 한다.
  // ⚠ 줄 전체를 보면 안 된다. 531행 하나가 3층 방어를 설명하며 같은 파일의
  // **네 범위를 서로 다른 주장에** 인용한다. "이 줄이 심볼을 말하니 이 줄의
  // 모든 인용이 그 심볼을 담아야 한다"로 읽으면 멀쩡한 문장이 위반이 된다
  // (처음 판이 그랬고, 여섯 건의 거짓양성이 나왔다). 인접만 본다.
  const WINDOW = 50;
  const broken: string[] = [];
  for (const anchor of ANCHORS) {
    const file = anchor.cite.split(":")[0];
    const pattern = new RegExp("`" + file.replace(/[.]/g, "\\.") + ":([0-9][0-9,\\-\\s]*)`", "g");
    doc.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        const start = Math.max(0, (match.index ?? 0) - WINDOW);
        const near = line.slice(start, (match.index ?? 0) + match[0].length + WINDOW);
        if (!near.includes(anchor.symbol)) continue;
        const cite = `${file}:${match[1].trim()}`;
        if (!evidenceText(anchor, cite).includes(anchor.symbol)) {
          broken.push(`문서 ${index + 1}행: ${cite} 안에 ${anchor.symbol} 없음 - ${anchor.why}`);
        }
      }
    });
  }
  expect(broken).toEqual([]);
});

/** `//` 주석을 걷어낸 소스. 주석은 값의 증거가 아니다. */
function codeWithoutComments(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

test("위기 템플릿 판번호가 코드와 같다", () => {
  // 표가 필요 없는 완전 일반 규칙이다. 문서가 인용하는 모든 위기 템플릿
  // 판번호는 코드에 실재해야 한다. `red-ko-minor-v1` 이 코드가 v2 로 올라간
  // 뒤에도 문서에 넷 남아 있었다 - 개인정보 문서가 잘못된 안전 템플릿 판을
  // 지목하는 것은 줄 번호가 낡은 것과 다른 종류의 오류다.
  //
  // ⚠ 주석을 먼저 걷는다. 변이 검증에서 **코드 쪽** 판번호만 바꿔 봤더니,
  // 같은 파일의 주석이 옛 판번호를 적고 있어서 검사가 통과했다. 주석은 값의
  // 증거가 아니다 - 이 저장소가 주석發 거짓양성에 여러 번 당했고, 이번은 그
  // 반대 방향(거짓음성)이다.
  const inDoc = [...new Set([...doc.matchAll(/`(red-[a-z-]+-v\d+)`/g)].map(m => m[1]))];
  expect(inDoc.length).toBeGreaterThan(0);
  const source = codeWithoutComments(S);
  const absent = inDoc.filter(version => !source.includes(`"${version}"`));
  expect(absent).toEqual([]);
});

/** `PRIVACY_PREF_KEYS = [ ... ]` 안의 키 이름들. */
function privacyPrefKeys(): string[] {
  const source = fs.readFileSync(path.join(ROOT, P), "utf8");
  const block = /export const PRIVACY_PREF_KEYS\s*=\s*\[([\s\S]*?)\]/.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
}

test("문서가 이름 부르는 개인정보 설정이 실제로 설정이다", () => {
  // 판번호 대조와 같은 모양의, 표가 필요 없는 일반 규칙이다.
  //
  // 2026-07-01 에 이 모듈이 `llm_training`·`persona_export`·`persona_share` 를
  // **잘라냈다.** 이유를 스스로 적고 있다 - "어느 것도 강제되거나 보이지
  // 않았다 ... 각각이 거짓 개인정보 약속이었다: 앱이 저장은 하지만 지키지는
  // 않는 설정". 그런데 DPIA 는 그 셋을 **사용자 설정이 꺼두고 있는 항목**으로
  // 계속 적고 있었다. 있지도 않은 스위치를 있다고 말하는 것은 줄 번호가
  // 낡은 것과 다른 종류의 오류다 - 읽는 사람이 **없는 보호장치를 있다고**
  // 믿게 된다.
  //
  // ⚠ 마이그레이션은 그 컬럼을 아직 seed·clamp 한다. 그래서 이 검사는
  // **앱의 설정 계약**만 판정하고, 서버 쪽 서술은 건드리지 않는다.
  const keys = privacyPrefKeys();
  expect(keys.length).toBeGreaterThanOrEqual(5);

  // 문서가 "pref"/"설정" 문맥에서 백틱으로 부르는 이름만 본다. 후보를 코드의
  // 옛 이름 목록이 아니라 **현재 키 집합 + 잘린 셋**으로 고정한다.
  const PRUNED = ["llm_training", "persona_export", "persona_share"];
  const namedAsPref: string[] = [];
  doc.split("\n").forEach((line, index) => {
    // ⚠ 면제를 **줄 단위**로 걸면 안 된다. 처음 판은 재읽기 주석이 달린 줄을
    // 통째로 건너뛰었는데, 정정문이 그 줄 **끝에** 붙으므로 줄 **앞부분**의
    // 본문 서술까지 같이 면제됐다. 변이 검증이 바로 그걸 찾았다: 본문을 옛
    // 문장으로 되돌려도 같은 줄의 주석 때문에 검사가 침묵했다.
    //
    // 그래서 정정문이 시작하는 자리에서 줄을 **자르고 앞부분만** 본다.
    // 주석은 잘린 이름을 말해야 한다(그게 정정문의 내용이다). 본문은 안 된다.
    const marker = line.indexOf("[RE-READ");
    const body = marker >= 0 ? line.slice(0, marker) : line;
    // 서버 쪽 서술은 제외한다: DB 트리거는 그 컬럼을 아직 seed·clamp 한다.
    //
    // ⚠ 예전에는 여기 `clamp` 단어 하나만 있어도 면제했는데, "clamped to false"
    // 는 **앱 설정을 말하는 문장에서도** 쓰인다. 변이 검증이 그걸 찾았다 -
    // 본문을 옛 문장으로 되돌려도 같은 줄의 "clamped" 때문에 침묵했다.
    // 마이그레이션을 **실제로 지목하는** 표시만 면제한다.
    if (/migration|trigger|\b00[0-9]{2}\b|seed/i.test(body)) return;
    for (const pruned of PRUNED) {
      if (body.includes("`" + pruned + "`")) {
        namedAsPref.push(`${index + 1}행 ${pruned}: ${body.trim().slice(0, 70)}`);
      }
    }
  });
  expect(namedAsPref).toEqual([]);
  // 그리고 잘린 셋이 정말 키 집합 밖인지도 확인한다 - 되살아나면 위 규칙이
  // 거꾸로 거짓양성이 된다.
  expect(PRUNED.filter(k => keys.includes(k))).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  test("주석을 걷어낸다 - 줄 끝 주석과 통째 주석 둘 다", () => {
    expect(stripComments('const a = 1; // 1388 이라고 적어만 둔다')).not.toContain("1388");
    expect(stripComments("// KO minor -> [1388, 109]")).not.toContain("1388");
    expect(stripComments('const ids = ["KR_1388"];')).toContain("1388");
  });

  test("주석이 아닌 `://` 는 지킨다", () => {
    // 보호절이 없으면 여기서 값이 통째로 잘린다 - 그러면 검사기가 틀리고
    // 대상이 멀쩡한데 "심볼 없음" 이 뜬다. 앵커 범위에 URL 이 오늘 없더라도
    // 이 대조가 그 절을 붙들어 둔다.
    expect(stripComments('const dsn = "https://configured.invalid/1";')).toContain("configured.invalid");
    expect(stripComments('const u = "https://a.example/x"; // 주석은 걷는다')).toContain("a.example/x");
    expect(stripComments('const u = "https://a.example/x"; // 주석은 걷는다')).not.toContain("주석은 걷는다");
  });

  test("양성 대조 - 범위 밖 심볼을 잡는다", () => {
    // 1행에는 fixedCrisisResponse 가 없다(파일 헤더 주석이다).
    expect(slice(`${S}:1-3`).text.includes("fixedCrisisResponse")).toBe(false);
  });

  test("음성 대조 - 범위 안 심볼은 통과한다", () => {
    expect(slice(`${S}:408-438`).text.includes("fixedCrisisResponse")).toBe(true);
  });

  test("쉼표와 하이픈을 둘 다 읽는다", () => {
    // `:412,424` 는 두 줄이지 412~424 범위가 아니지만, 검사는 최소~최대로
    // 넓게 잡는다. 넓게 잡는 쪽이 거짓양성이 아니라 **거짓음성**으로 기울므로
    // 여기서 그 성질을 드러내 둔다 - 다음 사람이 정확도를 오해하지 않게.
    const wide = slice(`${S}:412,424`);
    expect(wide.text.split("\n")).toHaveLength(13);
  });

  test("면제는 줄이 아니라 정정문 뒤에만 걸린다", () => {
    // 변이 검증이 찾은 구멍의 대조군. 같은 줄에 본문과 정정문이 있을 때,
    // 본문 쪽 위반은 잡히고 정정문 쪽 언급은 통과해야 한다.
    const line = "본문이 `llm_training` 을 설정처럼 적는다. ⚠ **[RE-READ]** `llm_training` 은 잘렸다.";
    const marker = line.indexOf("[RE-READ");
    expect(line.slice(0, marker)).toContain("`llm_training`");
    expect(line.slice(marker)).toContain("`llm_training`");
    // 즉 자르지 않으면 둘을 구분할 수 없다.
    expect(marker).toBeGreaterThan(0);
  });

  test("주석은 값의 증거가 아니다", () => {
    const stripped = codeWithoutComments(S);
    // 판번호는 주석에도 소스에도 나온다. 주석을 걷어도 실제 값은 남는다.
    expect(stripped).toContain('"red-ko-minor-v2"');
    // 그리고 걷어낸 쪽에는 그 주석 문장이 없다.
    expect(stripped).not.toContain("Versions are referenced in the audit log");
  });

  test("파일 길이를 넘는 인용은 잘려서 빈 조각이 된다", () => {
    // Round40 의 가드가 이 경우를 따로 잡는다. 여기서는 조용히 통과하지
    // 않는다는 것만 확인한다.
    const beyond = slice(`${S}:99998-99999`);
    expect(beyond.text).toBe("");
  });
});
