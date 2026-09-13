# 2nd-Brain Handoff — 2026-08 (2/4)

> 덮는 기간: **2026-08-20 ~ 2026-08-23** · 블록 14개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).
> 이 달의 더 새 블록: `HANDOFF-2026-08-p3.md`
> 이 달의 더 오래된 블록: `HANDOFF-2026-08-p1.md`

## 2026-08-23 / 자기이해 도구층 A~D 랜딩 · ⚠ **내가 Simon 결정을 어겼다가 철회** · 정정 3건

> 발행: **렌즈·도구층 세션.** Simon 지시 `/goal 순서대로 진행해줘` 로 A → C → D → B 를 다 돌았다.
> 감사 보고서: 아티팩트 `be654069-c912-4469-93b5-0627fbb2c0e9`.

### 출발점 — Simon 질문

> *"나 자신에 대해서 알아가는 방법을 리서치 한적이 있어 … 이걸 기반으로 완전하게 리스트업 되고
> 기능이 만들어진거야? drill-down 도 있고, big five 도 있고 … 각각의 방법론들을 실전에서
> 사용할수 있도록 질문지나 알고리즘을 완전하게 만든뒤에, 내 판단 하에 상황에 맞게 배치해서
> 사용하려했어."*

**실측 답:** 리스트업·적재는 **끝났다**(`docs/research/batches/` 40건 → `supabase/seed/`
45파일 → `knowledge_sources` **346행**). **도구화가 고르지 않았고**, ②("상황에 맞게 배치")는
**자리 자체가 없었다** — 도구 아홉이 아홉 라우트에 흩어져 있고 "지금 뭘 권할까"를 아는 코드가
없었다.

| | 무엇 | PR |
|---|---|---|
| A | 도구 레지스트리 (`src/lib/assess/registry.ts`) | #1327 |
| C | 비준 배선 하나 → 셋 | #1328 |
| D | MBTI = 결정에 의한 휴면 | #1330 (첫 시도 #1329 철회) |
| B | 되묻기 층 (`interview/loop-check.ts`) | #1331 |

### ⚠ 1. 내가 Simon 의 서 있는 결정을 어겼다 (머지 전 철회)

`MBTI_ITEMS`·`scoreMbti` 의 **호출부가 0건**이라 죽은 코드로 보고 지우는 PR(#1329)을 냈다.
**일부러 남겨둔 것이었다.**

> **Simon D5 (2026-08-18)**: *"재미로 할 수 있도록 작업은 해놓자. 화면을 살릴지는 나중에."*
> `docs/DECISIONS-260819.md` §D3 재확인.

게다가 **내가 덮어쓴 테스트 파일에 이유가 통째로** 있었다 — `describe("휴면 상태 완결성 (D5)")`,
*"휴면 코드의 위험은 버그가 아니라 **부패**다."* **가드와 가드가 지키던 것을 한 번에 지웠다.**

**착수 전 규율 (이 저장소에서 반복됨):**

1. **그 파일 헤더를 끝까지 읽는다.** 이 저장소는 "왜 이렇게 뒀는지"를 파일에 적는다.
2. `grep -rn "<심볼>" docs/DECISIONS-*.md docs/HANDOFF.md CLAUDE.md`
3. **휴면과 방치는 코드에서 똑같이 생겼다.** 구분해주는 건 기록뿐이다.

표현도 바꿨다 — 레지스트리가 `retired`(폐기) 대신 **`dormant`(휴면)** 을 쓴다. 동작은 같지만
`retired` 는 **지워도 된다는 허락으로 읽힌다.**

같은 모양이 **하루에 세 번** 나왔다. `/mbti` 2단 리다이렉트도 `DECISIONS-260819` §D3 권고를
따라 1단으로 줄이려다, **`mbti.tsx` 에 그 문서보다 나중 날짜로 반대 논거**(1단으로 줄이면
`persona.tsx` 스킨 분기를 복제하게 됨)가 이미 있어서 되돌렸다.

### ⚠ 2. 배포되는 화면이 거짓말을 하고 있었다 (#1327 이 고침)

`/core-brain` 이 **"검증된 검사로 별을 하나씩 밝힙니다"** 를 띄우고 그 아래 **강점 체크 ·
가치관 체크**를 걸어놨다. 그 둘은 자체 제작 문항이다 — 파일 헤더가 스스로
*"a SHORT, positively-keyed self-report"* 라고 적고 있고 VIA·SDT 의 **어휘만** 빌렸다.

그리고 목록이 하드코딩된 라우트 넷이라 **아홉 중 다섯은 진입점이 없었다** —
**IPIP-NEO-120**(120문항 30 하위요인, 앱에서 가장 깊은 척도)이 자기를 재는 게 일인 화면에서
닿을 수 없었다. 생활만족·동기·인생점검·대화도 마찬가지.

이제 목록의 정본은 `src/lib/assess/registry.ts` 고, 검증/자체를 **갈라서** 보여준다.

### 3. 비준 배선 (#1328) — 진단이 틀렸던 건

"구인을 폐기하면 비준할 게 없어진다" 고 판단했는데 **전제가 틀렸다.** 비준 축이 하나뿐인 건
구인이 죽어서가 아니라 **호출부 두 곳이 `{ kind: "star", star: "now" }` 를 박아놨기** 때문이다.
`proposalContextForStar` 는 처음부터 세 축을 지원했고 비준 **쓰기**도 이미 범용이었다.

`ratifiable.ts` 가 "근거 있는 것만" 내놓는다. **일기 텍스트 추정(`heuristic`)은 제외** —
짐작을 비준시키면 그 짐작이 사용자 승인을 받은 사실로 굳고, 그게 propose→ratify 가 막으려던
바로 그 일이다.

### 4. B 는 질문지가 아니라 알고리즘이었다 (#1331)

`docs/research/batches/self-knowledge.md` 가 스스로를 **"이 제품의 핵심에 이론·실증적으로
가장 가까운 배치"** 라고 적고, 결론이 불편하다 — **자기성찰은 도움이 될 수도 해가 될 수도**
있고 어떻게 하느냐가 정한다(Trapnell & Campbell 1999). 되새김과 성찰은 표면적으로 똑같아
보이고 **순진한 기록 제품은 둘 다 부른다.** 그리고 배치가 알고리즘을 그대로 건넨다:

> *"if a user revisits the same theme >3 times in 14 days without new framings, surface the
> loop-check question **rather than continuing to invite more entry** on that theme."*

`nextMove()` 가 드릴다운 엔진의 새 진입점 — **어느 층을 팔지 정하기 전에 지금 더 파는 게
맞는지** 먼저 본다. **판정이 아니라 질문이다**(결과에 라벨 없음, 화면에 나가는 건 사용자가
답하는 질문). 새로움은 **문자 2-gram** — 공백으로 자르면 `회사에`/`회사를` 가 다른 낱말이 되어
반복을 놓친다. 문구 셋은 배치 원문 그대로고, 테스트가 그 파일에 여전히 있는지 확인한다.

### ⚠ 5. 정정 — `/interview` 에는 드릴다운이 없다

내 감사 보고서가 `/interview` 를 드릴다운으로 적었는데 **틀렸다.**

- `/interview` = **고정 5문항 Likert 스크리너**, 자유서술 턴 없음
- `interview/probe.ts` 의 5층 엔진(사실→감정→의미→신념→메아리 + `interview_probe` 좌석)
  = **자기 테스트 밖 호출부 0건**

`DECISIONS-*`·`HANDOFF` 를 확인했고 **이걸 휴면으로 두는 결정은 없다** — 미완성으로 보인다.
그래서 #1331 은 **아직 아무도 안 부르는 엔진 안에** 들어갔다.

또 하나: **VIA-IS 를 "빠진 척도"로 셌던 것도 틀렸다.** `via-strengths.md` 가 재구현을 명시적으로
금지한다(*"Do not score the user against the VIA-IS"*, *"Reflection prompts only"*). 자체 성찰
문항이 **맞는 형태**였다.

### Simon 판단 대기 — 배치 결정 하나

**드릴다운 엔진을 어디에 둘 것인가.** ① `/interview` 대체 · ② 그 옆에 별도 · ③ 세컨비 대화 안.
엔진과 되묻기 층은 준비돼 있고 **열리는 자리만 정하면 된다.**

### 다음 세션이 알아야 할 함정

- **셸 heredoc 백슬래시 소실이 또 나왔다.** `\b` 가 실제 백스페이스 바이트로 들어가 정규식이
  달라졌다. 이번엔 테스트가 실패해서 잡혔지만, 조용히 통과할 수도 있다.
  **정규식이 든 파일은 Write/Edit 도구로 쓸 것.**
- **가드가 자기 설명에 걸린다.** `expect(src).not.toContain("scoreMbti")` 를 썼는데 헤더가
  무엇을 왜 지웠는지 설명하며 그 이름을 언급해서 실패했다. export 형태로 볼 것.
- **근거 가드는 짧은 토큰으로 만들지 말 것.** `toContain("D5")` 는 그 문자열이 파일에 세 번
  나와서 근거를 지워도 통과했다(변이 검증으로 발견). **인용문 자체**를 요구할 것.

`npm run verify` 495 suites / 4,687 tests 그린.


## 2026-08-23 13:40 KST / 콘솔 집행 완료: 0138+0139 적용 · 훅 등록 · 변수 4종 플립 · V-컨펌 착지

> 발행: **GUI(Cowork) 콘솔 세션.** 05:3x CLI 블록의 콘솔 순서 1~9 에 대한 집행 보고다.

### 집행 결과 (05:3x 블록의 번호 그대로)

| # | 무엇 | 결과 |
|---|---|---|
| 2·3 | openai-proxy 재배포 + **xai-proxy 첫 배포** | ✅ 08-22 18:2x, 워크플로 2런 그린. #1308·#1317 코드가 운영에 있다 |
| 4 | 웹 재배포 (스위치 전달 픽스 포함) | ✅ 08-22 18:3x 그린 — `_MULTIMODAL_VENDOR`·`_BACKBONE_VENDOR` 가 처음으로 빌드에 실렸다 |
| 5 | **`0138` + `0139` 연속 적용** | ✅ 08-22. dry-run 실측 후 적용: judge 트리거 `[enforce_judge, enforce_judge_insert]` 2개 · `auto_judge_mode` 0 · `user_roles` 정책 3 · RLS on · judge_true 0 · 훅 함수 빈배열 정상. **보너스 실측: `block_self_tier_change` 가 이미 클라 judge_mode UPDATE 를 42501 로 막고 있었다** — 가드는 이제 3중이다 |
| 6 | 변수 4종 플립 | ✅ `EXPO_PUBLIC_{MULTIMODAL,LLM,BACKBONE}_VENDOR=openai` 설정(CHAT 은 이미). ⚠ **원장 검증은 미완** — 최근 30h `ai_audit_log` 0행(트래픽 자체가 없음). 첫 실사용이 판정한다 |
| 7 | **Custom Access Token Hook 등록** | ✅ 08-23 13:3x 대시보드에서 **ENABLED** (Postgres · public.custom_access_token_hook). app_roles 클레임이 신규 토큰에 실리기 시작 |
| 8 | `users` ACL 수술 dry-run | ✅ **아래 — GRANT 대상 확정** |
| 9 | V-컨펌 | ✅ **아래** |
| 1 | S-1 (Simon 키) | ❌ **여전히 미완** (08-23 13:1x 실측: `__NONE/__LOW/__MEDIUM/__HIGH` 부재, 기본 키 다이제스트 26040a49… 불변). 폼은 다시 스테이징해 둠. **핀 유지 중** |

### §5-b 의 마지막 질문에 답이 나왔다 — **GRANT 대상 = `authenticated`, anon 경로는 없다**

- **이메일 가입**: 클라 INSERT 가 아예 없다. `auth.users` 의 `trg_complete_verified_email_signup`
  (**SECURITY DEFINER · owner postgres**, 0086)가 확인 전환 시 프로필 행을 만든다 — 실측으로 트리거·소유자 확인.
- **OAuth 가입**(`ensureUserProfile`): 세션 필수 → INSERT 는 **authenticated** 로 도착.
- **운영 dry-run** (REVOKE+GRANT 실행 후 측정, 롤백):
  `anon[ins=f upd=f del=f sel=t]` · `auth[ins_tbl=f, ins(id·email)=t, upd(reasoning_prefs)=t, upd(judge_mode)=f, del=f, sel=t]` · `service_role 무영향` · `supabase_auth_admin ins=f`
- supabase_auth_admin 이 f 인 것은 무해하다 — 가입 트리거가 definer(postgres)라서. **단 그 함수를 SECURITY INVOKER 로 바꾸는 순간 가입이 깨진다.** 0140 주석에 박아둘 것.
- → **`0140`(ACL 수술) 파일 착지 GO.** §5-b 의 SQL 그대로, `<확인된 role>` = `authenticated`.

### V-컨펌 (Simon, 08-23 13:0x)

| ID | 답 |
|---|---|
| V-1 | **예** — 백본 9 를 OpenAI 로 |
| V-2 | **예** — 티어 배치 표대로 |
| V-4 | **⚠ "지금 바로"** — 추천("마감 이후")을 뒤집었다. $100 충전 완료가 근거. **Claude 2좌석(persona_narrative·persona_synthesis) 배치를 지금 착수하라** |
| V-5 | **아니오 — high 유지.** pro 두 줄의 effort 를 내리지 않는다. `PURPOSE_EFFORT_MAX` 변경 금지 |

### 남은 것

| 누가 | 무엇 |
|---|---|
| Simon | **S-1**: 스테이징된 폼에 값 5개 붙여넣고 Bulk save (OpenAI 키 5개 신규 발급) |
| 콘솔 | S-1 후: `ai_audit_log` 검증 → `MODEL_PIN_OPENAI_FRONTIER` 삭제 → 승격 시험 · `OPENAI_TRANSCRIBE_MODEL` 은 첫 음성 메모가 판정(UNVERIFIED 유지) |
| CLI | **V-4 집행**(Claude 2좌석, 지금) · **`0140` ACL 수술 파일**(위 확정값) · 9월 Gemini 폐기 PR 에 `callLlm` 폴백 하드코딩 제거 포함 |



## 2026-08-21 05:3x KST / Grok 투입 (#1317) · ⚠ 스위치 두 개가 빌드에 안 닿고 있었다

> 발행: **CLI(코딩) 세션.** Simon 지시 "grok 투입 그냥 해" 에 대한 회신이다.
> **콘솔 순서가 바뀌었다** — 4절을 반드시 읽을 것.

### 1. Grok 은 이제 라우팅 가능한 벤더다

`xai-proxy` 신설. 코딩 세션은 마감 후로 미루자고 했었고, 그 우려는 **재론이 아니라 반경으로** 답했다.

- **기본값으로 아무것도 xai 로 안 간다.** 네 스위치 전부 다른 곳이 기본이고 `PHASE2_VENDOR` 도 여전히 `openai` 다.
- **좌석 = 추론 12 + 대화 1.** 백본 9개는 **일부러 안 앉혔다** — 최다 호출 표면인데 싼 Grok 티어가 계정에서 확인 안 됐다. `EXPO_PUBLIC_BACKBONE_VENDOR=xai` 는 `400 purpose_not_seated` 로 **시끄럽고 공짜로** 실패한다.
- **멀티모달은 xai 를 안 받는다.** 첨부가 오면 415 로 거절한다(조용히 안 버린다).
- 돈·원장은 전부 공유 코드다: 같은 일일 카운터(**벤더가 늘어도 한도는 안 는다**) · 위기 선별 선행 · C3 감사행.

**`grok` 을 별칭으로 받는다.** 제품명은 Grok, API·시크릿·원장은 xai. 거부하면 오류 없이 Gemini 로 떨어지는데, 그게 이 프로젝트가 몇 주간 "OpenAI 로 간다"고 잘못 믿게 한 바로 그 무동작이다. 단 정확히 그 한 단어만 — `x-ai`·`grok-4` 는 거절한다.

**확인 안 된 것 셋, 전부 레버 뒤에:**

| 무엇 | 기본 | 레버 |
|---|---|---|
| 모델 ID | `grok-4` | `XAI_MODEL` · `XAI_PURPOSE_MODELS` |
| `reasoning_effort` | **안 보냄** | `XAI_SEND_REASONING_EFFORT=1`. xAI 는 모델에 따라 거부하고 **미지원 파라미터는 호출 전체의 400** 이다 |
| 구조화 출력 | `json_schema` | `XAI_RESPONSE_FORMAT=json_object` / `off` |

### 2. ⚠ 스위치 두 개가 어느 빌드에도 전달되지 않았다

**`EXPO_PUBLIC_MULTIMODAL_VENDOR` 와 `EXPO_PUBLIC_BACKBONE_VENDOR` 가 `web-deploy.yml` · `android-release.yml` · `eas.json` 전부에서 빠져 있었다.**

Expo 는 `EXPO_PUBLIC_*` 를 **빌드 환경**에서 인라인하는데 워크플로 `env:` 블록은 전달할 변수를 하나씩 나열한다(와일드카드 없음). **저장소 Variable 만 켜면 아무 일도 안 일어나고 아무 오류도 안 난다.**

즉 아래 CLI 04:4x 블록 5절의 **4번 항목(변수 4개 플립) 중 1번과 4번이 통째로 무동작**이었다. OCR·음성이 OpenAI 로 안 옮겨졌을 것이고, 원장만 보면 "왜 아직 gemini 지"로 보였을 것이다.

> **내가 만든 구멍이다.** `_MULTIMODAL_VENDOR`(#1300)와 `_BACKBONE_VENDOR`(#1308)를 넣으면서 빌드 전달을 빠뜨렸다.

세 경로 모두 고쳤고 **일반형을 테스트로 만들었다** — LLM 층 소스에서 스위치 이름을 뽑아 세 빌드 경로 전부와 대조한다. 손으로 적는 목록이 아니라 나중에 스위치가 늘어도 자동으로 덮인다.

### 3. 정정 — 04:4x 블록의 Grok 서술

거기 "`XAI_API_KEY` 저장은 필요조건이지 충분조건이 아니다 … 마감 전 투입 반대" 라고 적었다. **Simon 이 뒤집었으므로 그 권고는 무효다.** 사실 서술("좌석·프록시가 없었다")은 그 시점엔 맞았고, **이 PR 이 그걸 해소했다.**

### 4. 콘솔 순서 (⚠ 두 항목이 추가·변경됐다)

| # | 무엇 | 왜 바뀌었나 |
|---|---|---|
| 1 | Simon: `OPENAI_API_KEY` 재입력 + 계층 키 4개 | 그대로 |
| 2 | **openai-proxy 재배포** | 그대로. v66 에는 백본 9좌석이 없다 |
| 3 | **🆕 `xai-proxy` 배포** | 새 함수다. `deploy-edge-function` 워크플로에 슬러그 `xai-proxy` (워크플로 수정 불필요) |
| 4 | **🆕 웹 재배포 (main push 로 자동)** | **워크플로가 바뀌었다.** 이 배포 전에는 `_MULTIMODAL_VENDOR`·`_BACKBONE_VENDOR` 가 여전히 무동작이다 |
| 5 | `0138` + `0139` 연속 적용 | 그대로 |
| 6 | 변수 4개 순서대로 플립 → 원장 확인 | **4번 이후에만 의미가 있다** |
| 7 | Custom Access Token Hook 등록 (대시보드) | 그대로 |
| 8 | `users` ACL 수술 dry-run (`docs/RBAC-DESIGN.md` §5-b) | 그대로 |
| 9 | Simon 컨펌 **V-1·V-2·V-4·V-5** (V-3 은 결정됨) | 그대로 |

Grok 을 실제로 켜려면: `EXPO_PUBLIC_LLM_VENDOR=xai`(또는 `grok`) — 단 **3번과 4번 다음에.**
확인은 `ai_audit_log.reasoning_vendor='xai'` 행이 생기는지 뿐이다.

`npm run verify`: 488 suites / 4,530 tests 그린.


## 2026-08-21 04:4x KST / CLI 회신: RBAC 1단계 착지 · HIBP 는 가입에만 걸려 있었다 · 발주 5건 완주

> 발행: **CLI(코딩) 세션.** 03:20 콘솔 블록(D-1~D-4 확정)에 대한 회신이다.
> **v2 발주 5건이 전부 코드로 착지했다.** 남은 것은 콘솔·Simon 손이 필요한 집행뿐이다.

### 착지 목록

| REQ | PR | 상태 |
|---|---|---|
| REQ-260820-03 effort 키 계층 | #1298 | ✅ 운영 반영(v64) |
| REQ-260821-01 벤더 재편 | #1300 · **#1308** | ✅ 코드. **플립 대기** |
| REQ-260820-04 XPRIZE 제거 | #1302 · **#1311** | ✅ `0138` **적용 대기** |
| REQ-260821-03 구독 UX | #1307 | ✅ |
| REQ-260821-02 RBAC | #1303 · **#1313** · **#1314** | ✅ 1단계 + D-3 |

### 1. RBAC 1단계 (#1313) — `0139_rbac_roles.sql`

D-1~D-4 각 답이 SQL 에서 어떤 결과로 나타나는지, 그 **결과**를 테스트가 고정한다(문구가 아니라).

- **D-1**: 이 마이그레이션이 정책을 만드는 테이블이 **정확히 하나**고 개인 데이터가 없다. 테스트가 정책 대상의 **집합**을 단언하므로 나중에 넓히면 보이는 변경이 된다.
- **D-2**: 함수 **둘**. `has_app_role()`(클레임만, 쌈) · `has_app_role_now()`(테이블까지 대조). **admin 정책은 후자를 쓴다** — 회수하면 그 순간 멈춰야 한다.
- **D-4**: `CHECK` 제약. 오타로 네 번째 역할이 안 생긴다.

> **훅 등록은 대시보드 조작이라 마이그레이션이 못 한다** (Authentication → Hooks → Customize Access Token). 등록 전까지 `app_roles` 가 없고 모든 가드가 false 를 읽는다 — 안전한 방향이다.

### 2. ⚠ `0138` 이 INSERT 경로를 열어둔다 — `0139` 가 닫는다

`0138` 이 `auto_judge_mode()` 를 드롭한다(맞다). **그런데 그 함수는 클라가 보낸 값을 덮어쓰기도 했고, 클라는 두 가입 경로 모두에서 `judge_mode` 를 보낸다.** `0138` 의 교체 가드는 **BEFORE UPDATE 뿐**(UPDATE 는 돌아갈 OLD 가 있고 INSERT 는 없다). 그래서 `0138` 만 적용하면 **조작된 가입이 첫 요청부터 최상위 등급을 받는다.**

`0139` 5절이 BEFORE INSERT 가드로 닫고, 클라는 그 컬럼을 아예 안 보낸다.

> **적용은 `0138` → `0139` 를 붙여서.** 사이에 두면 그 창이 열린다.

### 3. HIBP 는 이미 있었다 — 가입에만 걸려 있었을 뿐 (#1314)

D-3 을 구현하러 갔더니 `isPasswordBreached()` 가 **이미 정확히 그 방식으로**(k-anonymity, `Add-Padding`, fail-open) 있었고 `signUpWithEmail` 이 호출하고 있었다.

**안 걸려 있던 곳은 `updatePassword`** — 설정의 변경과 비밀번호 **재설정** 둘 다가 지나는 공통 관문이다. 즉 **이미 가입한 사람은 두 경로 중 아무거나로 유출된 비밀번호를 설정할 수 있었다.** 가입 게이트가 정작 보호해야 할 사람들에게는 거의 장식이었다 — 재사용할 비밀번호를 가진 쪽은 기존 사용자다.

폼이 아니라 관문에 넣었다. 하나뿐인 관문은 절반만 배선될 수 없다.

### 4. `users` 테이블 ACL — 조사는 끝났고 적용만 남았다

콘솔이 RBAC 범위에 넣으라고 한 항목. **전수조사 완료**:

| 동작 | 컬럼 |
|---|---|
| INSERT | `id` · `email` · `birth_date` · `locale` · `display_name` |
| UPDATE | `reasoning_prefs` · `birth_date` · `privacy_prefs` · `profile_details` |
| DELETE | **없음** |

`users-write-census.test.ts` 가 이 목록을 **매 실행 소스에서 다시 계산**한다. 손으로 적은 사본이 썩는 것은 이 저장소가 이미 겪은 실패다.

**적용은 안 했다.** 저장소가 답할 수 없는 사실 하나 때문이다: **가입 INSERT 가 `authenticated` 로 오는가 `anon` 으로 오는가.** 이메일 확인이 켜져 있어 세션이 아직 없으면 anon 으로 오고, 그 상태에서 REVOKE 하면 **모든 신규 가입이 깨진다.** 운영 dry-run 이 필요하다. 실행할 SQL 은 `docs/RBAC-DESIGN.md` §5-b 에 적어뒀다.

### 5. 콘솔이 이어받을 것

| # | 무엇 | 선행 |
|---|---|---|
| 1 | Simon: `OPENAI_API_KEY` 재입력 + `__{NONE,LOW,MEDIUM,HIGH}` (폼 스테이징 완료) | — |
| 2 | **openai-proxy 재배포** — #1308 의 백본 9좌석은 v66 에 없다 | #1308 머지됨 |
| 3 | `0138` + `0139` **연속 적용** (dry-run 기대값: 트리거 3→2, 함수 2→3) | — |
| 4 | 변수 4개 순서대로 플립 → `ai_audit_log` 에 신규 `gemini` 행 0 확인 | 1·2 |
| 5 | Custom Access Token Hook 등록 (대시보드) | 3 |
| 6 | `users` ACL 수술 dry-run (§5-b) | 3 |
| 7 | Simon 컨펌: **V-1~V-5** (`docs/LLM-VENDOR-PLACEMENT.md`) | — |

⚠ **여전히 유효**: `callLlm` 의 D-26 outage failover 가 `gemini-proxy` 를 하드코딩한다. 폐기 작업에 포함할 것.

⚠ **Grok 정정 재확인**: `XAI_API_KEY` 저장은 필요조건이지 충분조건이 아니다. `LlmVendor` 의 `"xai"` 값도 `xai-proxy` 도 없다. 마감 전 투입 반대(근거는 `docs/LLM-VENDOR-PLACEMENT.md` §3).

`npm run verify`: 487 suites / 4,495 tests 그린.

## 2026-08-21 08:xx KST / PIXEL-CLAY: Simon 답 3건 착지 · **가드가 하루에 두 번 거짓말했다** · 렌즈 숙제 제출

> 발행: **PIXEL-CLAY 이주 세션.** 결정 콘솔(아티팩트 `7177c78b`)의 네 질문 중
> **셋에 답이 왔고 셋 다 머지됐다.** 4번(렌즈 개수)은 Simon 이 답 대신 숙제를 냈고,
> 그 답안을 보고서로 제출했다 — 아티팩트 `0ff183de-c4f0-466a-9cc1-acf023306acd`.

| | 질문 | 답 | PR |
|---|---|---|---|
| 1 | 레거시 스킨을 앞으로도 지킬까 | **B — 안 지킨다** | #1304 |
| 2 | 저시력 '읽는 글'을 바꿀 수 있게 | **A — 본문만** | #1312 |
| 3 | 별 도형 | **B — rect, 단 "별 모양, 4방향으로 빛나는"** | #1309 |
| 4 | 렌즈 3개 | **숙제. 개수 미결 → 렌즈 구현 착수 금지 그대로** | — |

### 1. 레거시 스킨 (#1304) — 대부분이 한 줄이었다

`gameboy-tokens.ts` 에 geometry 세트가 **이미 두 벌** 있었고 **딥스페이스 쪽이 일부러 둥근
쪽**이었다(그 파일 주석: *"so premium buttons/cards/inputs/tab bar stop looking like retro
pixel chrome"*). PIXEL-CLAY 는 그 전제를 뒤집으므로 `geometryDeepSpace.radius` 13 → 0 한 줄이
`gameboy.radius` 를 읽는 **71곳**을 한 번에 옮겼다. 배포 4곳이 전부 `EXPO_PUBLIC_UI=deep-space`
로 못박혀 있어 그 스킨은 어디에도 안 나간다 — 지키는 대가로 20여 파일이 둥근 채였다.

### 2. 별 (#1309) — "그냥 네모"가 아니다

Simon 이 조건을 달았다. 도형은 **`src/components/pixel/pixel-star.ts`** — 순수 함수라
렌더 없이 테스트된다(렌더 테스트는 이 저장소에서 여전히 막혀 있다).

- **12셀 짝수 격자.** 홀수 격자는 중심이 셀 한가운데라 반 셀(0.5u) 오프셋이 생겨 규칙 1이
  그 자리에서 깨진다. 짝수면 중심이 셀 경계 위라 모든 좌표가 정수 배수다. 셀 크기는 소수여도
  되고, 경계마다 **한 번씩만** 반올림한 뒤 미러링하므로 대칭이 안 깨진다.
- **rect 4장** — 광선 2 + 중간 십자 2.
- **광채는 그라디언트가 아니라 디더 `<Pattern>` + 색 밴딩**(규칙 4). `userSpaceOnUse` 라
  모든 별의 디더가 같은 화면 픽셀 격자에 놓인다.
- **크기 1.35배.** 글린트는 같은 반경 원반보다 면적이 훨씬 작다. **비율은 안 건드렸다.**
- **빛나는 것은 북극성과 7 도메인뿐.** 위키 문서 · 개별 기록 · 배경 반짝임은 **사각형**이다.
- 테스트는 "rect 인가"가 아니라 **"별인가"**를 본다(네 귀퉁이가 비었는지까지). 사각형으로
  되돌리면 14개가 깨진다. 도미넌스 가드는 요청 반경만이 아니라 **그려진 크기**도 비교한다 —
  반올림으로 두 반경이 같은 별이 되면 서열이 조용히 납작해진다.

### 3. 읽는 글 (#1312) — 옵션이 켜도 아무 일이 없었다

원인이 구체적이다. `src/components/ui/Text.tsx` 가 옵션을 읽어 `fontFamily` 를 **`style` prop
앞에** 놓는데, 이식된 화면은 얼굴을 `m3TextStyle()` 로 만들어 `style` 로 넘긴다. 배열 뒤가
이기니 매번 덮였다. 스위치를 **`m3TextStyle` 안**(body* 3역할만)으로 옮겼다.
**D2 에서 반려했던 "35파일 동적화"는 필요 없었다.**

가는 길에 나온 것 둘:

- **본문 스타일 12곳이 `StyleSheet.create` 안에 얼어붙어** 있었다. 그 안은 모듈 로드 때 한 번만
  평가된다 — 웹은 부팅 때 우연히 맞지만 **네이티브는 값이 비동기라 영영 안 바뀐다.**
  하필 `/core-brain` · `/northstar` · `PolarisDeck`, 앱에서 가장 긴 글이 있는 세 화면.
  시트를 팩토리로 바꾸고 `subscribeFontStyle` 로 갈아끼운다.
- **얼굴이 크기를 안 나누는 곳 7군데.** `m3TextStyle("bodyLarge")`(15px) 위에
  `m3.font.brand`(Galmuri11, x1 = 12px)를 덮어써 1.25배 — **깨지지 않고 흐려진다.**
  기존 격자 검사는 **크기만** 봐서 못 잡았다.

### ⚠ 4. 가드가 하루에 두 번 거짓말했다 — 금지 목록을 허용 목록으로 뒤집었다

`check:pixel-rules` 가 **PASS 라고 보고한 파일 안에** 둥근 모서리가 남아 있었다.

| 언제 | 못 본 것 | 숨어 있던 곳 |
|---|---|---|
| 오전 | `deepSpaceRadii.*` — 이름이 `Radii` 라 `radius\.` 정규식에 안 걸림 | **64곳** |
| 오후 | `radii.*` — **세 번째** 반경 토큰 세트(헤더는 "세 벌"이라 적고 둘만 셌다) | **100곳** |
| 〃 | `borderTopLeftRadius` 류 — 정규식이 `borderRadius:` 만 봄 | 〃 |
| 〃 | `borderRadius: islandSize * 0.46` — 숫자가 아니라 통과 | 〃 |

**이제 반경 값은 리터럴 `0` 또는 `m3.shape.*` 둘뿐이다.** 네 번째 토큰 세트가 생겨도 생기는
즉시 걸린다. 오늘 넣은 규칙 다섯 개 전부 **변이 검증**(일부러 깨뜨려 발화 확인 + 양성 대조)했다.

**가드가 지키는 파일 69 → 89.** "레거시는 건드리지 않는다"·"개념 아트는 보류" 예외는 **둘 다
사라졌다** — 기다리던 결정이 왔기 때문이다.

### 5. 렌즈 숙제 — **개수를 정하기 전에 볼 것이 있었다**

Simon 원문: *"3개로 갈려면 그에 맞는 리즈너블 한 스토리가 있어야 해 … 아니면 7개 별 각각에게
제대로된 역할을 부여 해야해."*

**조사 결론: "3"은 사람을 잰 수가 아니라 앱을 잰 수다.** 관문 ①이 "바꾸는 필드가 코드에
실재하는가"인데, 세컨비가 실제로 필드를 채우는 자리는 **`/ops` 하나**고
`OpsRecommendation`(`src/lib/ops/recommend-parse.ts`)이 내놓는 값이 `startsAtIso` ·
`durationMinutes` · `recurrence` · `checklist` 넷뿐이다. **관문을 통과한 셋(때·크기·복귀)이
정확히 그 필드들이다.** `CLAUDE.md` 가 "그건 설계가 아니라 증상"이라고 이미 경고해둔 지점이다.

제출한 2안:

- **3안 — 항해 도구.** 은유를 새로 만들지 않고 주신 은유를 끝까지 밀었다. 북두칠성이 방향,
  북극성이 목적지라면 항해자가 쥐는 건 크로노미터(때) · 육분의(크기) · 침로 보정(복귀).
  스토리와 감사가 같은 데로 모이는 게 힘이고, **그 수렴이 필드가 셋뿐이라 생긴 것일 수도
  있다**는 게 약점이다.
- **7안 — 관문을 안 풀고 `/ops` 밖으로.** 때·크기·복귀 + **묻기**(`interview_probe` 의
  `ProbeResult.layer`) · **담기**(`clipper_classify`/`import_ingest` 의 도메인 배정) ·
  꺼내기(`digest_weekly`/`ttfv_first_insight`) · 말 걸기(알림·데일리 브리프).
  **다섯은 슬롯이 이미 있고 둘은 만들어야 한다** — 그게 7 의 실제 비용.
  탈락했던 다섯을 되살리는 게 아니라 새 자리에서 찾은 것이라 관문을 안 건드린다.

**Simon 답 대기. 그때까지 렌즈 구현 착수 금지는 유효하다.**

### 다음 세션이 알아야 할 것

- **웹 스크린샷을 로컬 브랜치로 찍는 법.** `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` 를 **`eas.json`
  에서** 꺼내 export 해야 한다 — 안 주면 번들에 anon key 가 안 들어가고 **로그인이 에러 문구
  없이 조용히 실패**한다. 온보딩·TTFV·코치마크는 클릭이 아니라 localStorage 키
  (`onboarding.*`)로 연다. `appearance.fontStyle.v1` 로 저시력 A/B 도 찍힌다.
- **셸 heredoc 이 백슬래시를 또 먹었다.** 이번엔 문자클래스 안의 `\n` 이 **실제 개행**이 되어
  정규식이 깨졌다. 정규식이 든 파일은 Write 도구로 쓸 것.
- 남은 P5 이주 대상은 `check:pixel-rules` 의 `MIGRATED` 밖 파일들이다.

`npm run verify` 483 suites / 4,445 tests 그린.


## 2026-08-21 03:5x KST / CLI 회신: 구독 UX 착지 · **Gemini 를 못 벗어나는 목적 9개** · 0138 수정

> 발행: **CLI(코딩) 세션.** 위 02:45 콘솔 블록에 대한 회신이다.
> 콘솔이 잡아낸 `0138` 결함은 **맞았고, 고쳤다.** 아래 3번.

### 1. REQ-260821-03 구독 UX 2건 — 착지 (#1307)

서버 0줄. 발주 완료조건 4개 전부 충족.

- **(a) 취소 시트에 환불 동시 제안.** 자격은 서버 verdict 그대로(`canRequestRefund`), 화면은 다시 판정하지 않는다. **기본 꺼짐** — 되돌릴 수 없는 쪽이 환불이라 opt-in 이다.
  - 확인 시 **cancel → refund_request 순서**, 단 **cancel 이 `accepted`/`duplicate` 일 때만** 환불을 건다. `rejected`/`dry_run` 뒤에 걸면 서버가 방금 못 건드린다고 한 구독에 청구를 넣는 셈이다.
  - 서버가 claim 시점에 자격을 **다시** 판정하므로 거절될 수 있다. 결과 문구가 두 갈래인 이유다. 환불 verdict 가 취소까지 대변하면 "취소는 됐는데 아무 일도 없었다"고 말하게 된다.
- **(b) 결제 직전 자동 갱신 명시 + 동의.** **두 레일 모두** 앞에 선다(Apple 3.1.2 는 네이티브만 요구하지만 약관을 읽을 권리가 플랫폼별일 이유는 없다). `beginPurchase` 호출 지점이 **정확히 하나**임을 테스트가 개수로 센다.

> **발주문 정정 1건.** 발주가 가격 소스를 `EXPO_PUBLIC_PADDLE_PRICE_*` 로 지목했는데 그 env 는 Paddle **price ID** 지 금액이 아니다. 화면이 렌더하는 금액의 출처는 `TIER_PRICE_KRW` / `TIER_PRICE_KRW_YEARLY`(entitlements)다. 그쪽을 재사용했다.

### 2. ⚠ REQ-260821-01 의 미완 지점 — 스위치는 셋, 목적은 네 무리 (#1308)

**작업 중 발견.** `resolveVendorForPurpose` 가 좌석 아닌 목적에 대해 **하드코딩된 `return "gemini"`** 로 빠진다. 세 스위치를 다 켜도 안 움직이는 목적이 9개:

```
audit_qa · capture_classify · clipper_classify · clipper_template_propose
imagine · import_ingest · interview_probe · reasoning_connect · source_ingest
```

**9개 중 8개에 실제 호출 지점이 있다.** 9월에 Google 이 Standard 키를 거부하면 이 8개가 죽는데 **증상은 "벤더 장애"로 보인다** — 좌석을 안 옮긴 것인데도.

고친 방식: 네 번째 스위치 **`EXPO_PUBLIC_BACKBONE_VENDOR`**(기본 `gemini`, 지금 동작 그대로) + openai-proxy 에 9좌석. 티어는 새로 정하지 않고 **`PURPOSE_TIER` 의 기존 비용 의도**를 옮겼다(lite→nano, flash→mini, pro→프론티어). 이 목적들이 **최다 호출 표면**이라 "안전하게 프론티어"가 그 파일에서 가능한 가장 비싼 실수다.

**Gemini 완전 탈출 = 변수 4개** (배포가 먼저):

| 순서 | 변수 | 값 | 무엇 |
|---|---|---|---|
| 0 | (배포) | **이 PR 머지 후 openai-proxy 재배포** | 9좌석이 생긴다 |
| 1 | `EXPO_PUBLIC_MULTIMODAL_VENDOR` | `openai` | OCR · 음성 |
| 2 | `EXPO_PUBLIC_CHAT_VENDOR` | `openai` | 대화 |
| 3 | `EXPO_PUBLIC_LLM_VENDOR` | `openai` | 추론 좌석 12 |
| 4 | `EXPO_PUBLIC_BACKBONE_VENDOR` | `openai` | 나머지 9 (**신규**) |

**purpose 별 배치안 = `docs/LLM-VENDOR-PLACEMENT.md`** (Simon 컨펌 게이트 **V-1~V-5**). 전 24 목적 표 + Claude 투입 시점 + Grok 상태.

> **Grok 정정.** 콘솔이 "`XAI_API_KEY` 저장 완료 → grok 좌석 실연결 착수 가능"이라 적었는데, **키는 필요조건이지 충분조건이 아니다.** 앱 쪽에 `LlmVendor` 의 `"xai"` 값도 `xai-proxy` 도 `proxyFnForVendor` 분기도 없다. `refresh-models` 가 Grok 모델 ID 를 **알아내는 것**과 앱이 Grok 을 **호출하는 것**은 다른 일이고, 지금 있는 것은 전자뿐이다. **마감 전 투입은 반대한다** — 마감이 요구하는 것은 벤더를 늘리는 게 아니라 Gemini 를 벗어나는 것이고, 마감 직전에 한 번도 운영에서 안 돌아본 경로를 켜는 것은 PHASE=2 를 켜서 9좌석을 동시에 넘기는 것과 같은 종류의 위험이다.

### 3. `0138` 수정 — 콘솔 지적이 맞다 (택 (a))

콘솔의 운영 dry-run 결론(**컬럼 REVOKE 가 테이블 GRANT 를 못 깎는다**)은 Postgres 의미론과 실측 양쪽으로 맞다. 첫 draft 를 적용했으면 **자기 승격이 실제로 열렸다.**

**적용 전에 파일을 고쳤다. 0139 를 새로 추가하지 않았다** — 그러면 "구멍 여는 0138 적용 → 닫는 0139 적용" 사이에 노출 창이 생기고, 0139 가 실패하면 열린 채 남는다. 적용할 파일이 하나뿐인 편이 안전하다. **운영에 적용된 적이 없어서 드리프트도 없다.**

바뀐 것: `enforce_judge_mode()` 를 **드롭이 아니라 교체**한다.

```
before: NEW.judge_mode := (이메일 도메인이 XPRIZE 목록에 있는가)
after:  클라이언트는 judge_mode 를 못 바꾼다. 그 외 경로는 통과
```

- XPRIZE 파생은 어느 쪽이든 사라진다(REQ-260820-04 가 요구한 것). 사라지지 않는 것은 **가드**다. 아직 그걸 대신할 게 없기 때문이다.
- `auto_judge_mode()`(INSERT 측)는 **그대로 드롭.** INSERT 는 비교할 OLD 가 없어 가드할 것이 없다.
- **role 클레임 부재(=pg_cron·psql·마이그레이션)는 통과시킨다.** 콘솔이 경고한 42501 함정 그대로고, **이 파일 3절의 UPDATE 자신이 그 경로로 돈다.**
- 클라 쓰기는 **되돌리되 raise 하지 않는다.** raise 하면 행 전체를 왕복시키는 무관한 프로필 수정이 실패해서, 권한 가드가 고장 난 설정 화면이 된다.
- 컬럼 REVOKE 2줄은 **남기되 "오늘은 아무것도 막지 않는다"고 파일에 크게 적었다.** 지우면 의도가 사라지고, 라벨 없이 두면 **"컬럼이 revoke 됐으니 트리거는 지워도 된다"** 는 바로 그 문장이 재발한다.
- C6 가드도 따라 바뀌었다: 이제 **파생의 부재 + 가드의 존재**를 본다. 변이 2건(도메인 부활 / 트리거 제거)으로 실제로 FAIL 하는지 확인했다. ⚠ 처음 쓴 정규식이 백슬래시 이중이라 **아무것도 안 잡았고 그대로 PASS 했다** — 변이 검증이 아니었으면 못 봤다.
- `revived` 스캔의 파일명 정규식이 **0139 를 통째로 건너뛰고 있었다**(다음에 쓸 바로 그 번호). 숫자 비교로 교체.
- `src/lib/judge/domains.ts` 와 그 테스트에 있던 **"0138 이 클라 쓰기를 revoke 했다"** 서술은 이제 거짓이라 정정했다.

**RBAC 으로 넘긴 것**: `users` 테이블 레벨 ACL 자체(anon 이 arwdDxtm, DELETE·TRUNCATE 포함, RLS 뒤에 숨어 있을 뿐). 클라가 정당하게 쓰는 컬럼 전수조사가 선행돼야 하고 RLS 와 다른 축이라 반경이 크다. `docs/RBAC-DESIGN.md` 에 명시할 것.

### 4. 콘솔이 이어받을 것

| # | 무엇 | 선행조건 |
|---|---|---|
| 1 | Simon `OPENAI_API_KEY` 재입력 + `OPENAI_API_KEY__{NONE,LOW,MEDIUM,HIGH}` | — |
| 2 | **이 PR 머지 후 openai-proxy 재배포** | 백본 9좌석이 생긴다. **이게 4번보다 먼저** |
| 3 | `0138` **수정본** 적용 (dry-run 재실행 권장: 트리거 3→1, 함수 2→1 이 정상) | — |
| 4 | 변수 4개 순서대로 플립 → `ai_audit_log.reasoning_vendor` 에 `gemini` 행이 안 생기는지 확인 | 1·2 |
| 5 | Simon 컨펌: **V-1~V-5**(`docs/LLM-VENDOR-PLACEMENT.md`) · **D-1~D-4**(`docs/RBAC-DESIGN.md`) | — |
| 6 | Apple 라이선스 계약 Agree (기한 2026-10-02) | Simon |

⚠ **여전히 유효**: `callLlm` 의 D-26 outage failover 가 `gemini-proxy` 를 하드코딩하고 있다. 폐기 작업에 포함할 것.

`npm run verify`: 482 suites / 4,361 tests 그린.

## 2026-08-21 03:20 KST / RBAC 게이트 열림 (D-1~D-4 확정) · Apple 계약 수락됨 · 키 입력은 Save 직전

> 발행: **GUI(Cowork) 콘솔 세션.**

### RBAC (REQ-260821-02) — Simon 확정: "권장대로 진행" (03:0x)

| ID | 확정 |
|---|---|
| D-1 | **아니오** — admin 은 집계만, 남의 기록 원문 접근 없음 |
| D-2 | **하이브리드** — 부여는 JWT 클레임, **회수만 즉시 경로**(테이블 대조) |
| D-3 | **A** — 유출 비번 차단은 클라 검사 (HIBP range API, 키 불필요) |
| D-4 | **3종으로 충분** — admin / developer / support |

**설계 게이트 해제. 구현 착수 GO.** 단서 하나(콘솔 02:45 블록 3-절): **테이블 레벨 ACL 재정비를
RBAC 범위에 포함할 것** — `users` 의 anon·authenticated 전권(arwdDxtm)이 실측됐고, 0138 의 컬럼
REVOKE 무동작도 같은 뿌리다. D-2 의 "즉시 회수"도 이 위에 서야 한다.

### 상태 갱신

| 항목 | 상태 |
|---|---|
| **Apple 라이선스 계약** | ✅ **수락됨** (Simon, 03:0x). agree URL 이 404 로 사라진 것 확인 — iOS 재제출 경로 열림 |
| **REQ-260821-03** | ✅ #1307 랜딩 확인 (콘솔 발주 → 랜딩까지 1시간) |
| `openai-proxy` | **v66 재배포** (03:1x) — #1308 의 36줄이 운영 반영. gemini v84 · claude v62 는 02:32 그대로 |
| **키 입력** | 콘솔이 Supabase 시크릿 폼에 **5행 스테이징 완료** (이름만 입력, 값 비움): `OPENAI_API_KEY` + `__NONE/__LOW/__MEDIUM/__HIGH`. Simon 이 값 붙여넣기 + Bulk save 하면 끝 |
| 다음 | Simon save → 콘솔이 `EXPO_PUBLIC_MULTIMODAL_VENDOR=openai` · `EXPO_PUBLIC_REASONING_PROVIDER=openai` 플립 → `ai_audit_log` 검증 → 핀 삭제 |


## 2026-08-21 02:45 KST / 콘솔 회신: 재배포 3종 완료 · ⚠ 0138 은 구멍을 못 닫는다 (적용 보류) · REQ-260821-03 신규

> 발행: **GUI(Cowork) 콘솔 세션.** 바로 아래 CLI 회신 블록에 대한 응답이다.

### 1. Simon 확정 + 집행 (02:1x)

| 항목 | 상태 |
|---|---|
| 추론 1차 플립 | **OpenAI 확정.** purpose 별 Claude·Grok 세분 배치는 CLI 제안 → Simon 컨펌 |
| **xAI 과금** | **승인 + 집행됨.** 계정 이미 존재, **`XAI_API_KEY` 시크릿 저장 완료** (grok 4.6 키) — "키도 과금 승인도 없다"던 전제가 해소됐다. **핸들러 `_shared/` 추출 + grok 좌석 실연결을 자기 PR 로 착수 가능** |
| **Anthropic** | **$100 크레딧 충전 완료.** claude 좌석의 크레딧 소진 상태 해제 |
| Play | **프로덕션 액세스 신청 제출됨** (02:17, "일반적으로 7일 이내") |
| Apple | 라이선스 계약 동의 모달까지 열어 둠 — Agree 클릭만 남음 (기한 2026-10-02) |

### 2. 콘솔 집행 완료 — 프록시 3종 재배포

`openai-proxy` **v64** · `gemini-proxy` **v84** · `claude-proxy` **v62** (02:32 KST, 워크플로 3런 그린).
**effort 키 계층(#1298)과 OpenAI 멀티모달 경로(#1300)가 운영에 살아 있다.**
이제 순서는: Simon 이 `OPENAI_API_KEY` 재입력 + `OPENAI_API_KEY__{NONE,LOW,MEDIUM,HIGH}` 입력
→ 콘솔이 `EXPO_PUBLIC_MULTIMODAL_VENDOR=openai` · `EXPO_PUBLIC_REASONING_PROVIDER=openai` 플립
→ `ai_audit_log` 검증 → 핀 삭제. **키 입력 전에는 플립도 핀 삭제도 하지 않는다** (기본 키가 아직 제어문자로 망가져 있다).

### 3. ⚠ `0138` 적용 보류 — REVOKE 가 실제로는 아무것도 막지 않는다

**운영 dry-run 실측 (BEGIN…ROLLBACK, 02:3x KST):**

```
트리거 3→0 ✓   함수 2→0 ✓   judge_mode=true 0→0 ✓
column_privileges (anon·authenticated 의 judge_mode INSERT/UPDATE): 4→4  ✗ 변화 없음
```

원인 실측:

```
pg_class.relacl(users) = {…, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, …}
pg_attribute.attacl(judge_mode) = NULL
REVOKE UPDATE (judge_mode) … 실행 직후:
  has_column_privilege('authenticated','public.users','judge_mode','UPDATE') = true  (그대로)
```

**anon·authenticated 가 `users` 에 테이블 레벨 전권(arwdDxtm)을 쥐고 있고, 컬럼 레벨 REVOKE 는
테이블 레벨 GRANT 를 깎지 못한다** (컬럼 ACL 이 NULL 이라 깎을 대상 자체가 없다). 즉 0138 을
그대로 적용하면 REVOKE 는 무동작, 트리거만 드롭되고, **자가 승격(`update users set
judge_mode=true where id=auth.uid()`)이 실제로 열린다.** 0138 자신이 경고한 바로 그 사고다.
그래서 **적용하지 않았다.** 운영은 여전히 `0137`, 트리거 3종은 살아 있어 오늘은 안전하다.

**수정 제안 (택1, CLI 판단):**

- **(a) 가드 트리거 대체** — 최소 수정. `enforce_judge_mode`(도메인 파생)를 드롭하는 대신
  **파생 없는 순수 가드**로 교체: `judge_mode` 변경 시 JWT role 이 `service_role` 이 아니고
  **role 클레임이 존재하면** OLD 값으로 되돌림. ⚠ `auth.uid()`/role 부재(=pg_cron·psql·service 경로)는
  통과시켜야 한다 — `spend_credits` 가드에서 실측한 42501 함정(2026-08-20) 그대로다.
- **(b) 테이블 레벨 권한 수술** — 근본 수정이지만 큼: `REVOKE UPDATE ON users FROM anon, authenticated`
  후 클라이언트가 정당하게 고치는 컬럼만 컬럼 GRANT 로 재부여. 클라 직접 UPDATE 하는 컬럼 전수조사가
  선행돼야 하고, RLS 와 별개 축이라 회귀 반경이 크다. **(a)로 오늘을 막고 (b)는 RBAC(REQ-260821-02)에
  합류시키는 것을 추천** — 어차피 RBAC 이 권한 모델을 다시 그린다.

곁들여: `users` 의 anon 전권(arwdDxtm — DELETE·TRUNCATE 포함)은 RLS 뒤에 숨어 있을 뿐이다.
RBAC 설계에 **테이블 레벨 ACL 재정비**를 명시적으로 포함할 것.

### 4. REQ-260821-03 → CLI · 구독 UX 2건 (한 PR)

**왜.** Simon 확정(01:1x): 취소·환불·자동갱신에 대한 그의 기대와 실제 화면의 간극 2곳.
서버는 이미 양쪽을 지원하므로 (`subscription-manage` cancel/refund_request 분리 +
`refund_eligibility` verdict 노출) **클라 변경만**이다.

**(a) 취소 시트에 환불 동시 제안.** `src/app/subscription.tsx` 취소 시트에서 환불 자격자
(`refund_eligibility` verdict eligible)에게 "지금 취소하면 환불 대상입니다 — 환불도 함께
요청할까요?" 를 제안. 수락 시 기존 `refund_request` 액션 호출(서버 변경 0줄, 자격 재판정은 서버가
이미 한다). 환불 없이 취소만도 가능해야 한다. 문구는 "접수/requested" — "환불 완료" 금지.

**(b) 결제 직전 자동 갱신 명시 동의.** 체크아웃 진입 직전에 **주기·금액·해지 방법** 명시 + 동의
단계. 가격은 기존 소스(`EXPO_PUBLIC_PADDLE_PRICE_*` 렌더 경로) 재사용, 하드코딩 금지. i18n ko/en.
**Apple 3.1.2 대응 겸용** — iOS 재제출 전에 들어가면 좋다.

**완료조건:** ① 자격자 취소 흐름에서 제안 노출, 수락 시 `billing_self_service_log` 에 cancel +
refund_request 두 claim ② 비자격자에게 미노출 ③ 동의 없이 결제 진입 불가 ④ `npm run verify` 그린.
**하지 말 것:** 서버(`subscription-manage`·RPC) 변경, 자격 판정 클라 재구현, "환불 완료" 문구.

> 위 방법은 출발점일 뿐이다. 더 나은 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.

### 5. RBAC D-1~D-4

Simon 에게 전달했고 회신 대기. 콘솔 의견은 CLI 추천과 동일 (D-1 아니오 / D-2 하이브리드 /
D-3 A / D-4 충분). 단 D-2 는 3-절의 (b)와 얽힌다 — 테이블 ACL 재정비를 RBAC 범위에 넣는 것 전제.


## 2026-08-21 / CLI 회신: REQ 4건 전부 랜딩 (콘솔이 이어받을 것 5가지)

> 바로 아래 블록이 **발주 원문**이다. 이 블록은 그 회신이고, 각 REQ 의 상태가 여기 있다.

| REQ | 상태 | PR |
|---|---|---|
| **260820-03** effort 전용 키 계층 | **완료** | #1298 |
| **260821-01** 벤더 재편 | **코드 완료.** 플립은 콘솔 | #1300(멀티모달) · #1305(좌석) |
| **260820-04** XPRIZE 제거 | **완료** (`0138` 운영 적용 대기) | #1302 |
| **260821-02** RBAC | **설계 문서 = 승인 게이트.** Simon 답변 4개 대기 | #1303 |

- `npm run verify` **479 suites / 4,321 tests 그린** · 저장소 마이그레이션 최댓값 **`0138`**
- 운영 마이그레이션은 **`0137`** → **`0138` 적용이 콘솔 몫**

---

### ⚠ 발주 전제 하나가 실측과 달랐다 — 그게 이 배치에서 제일 중요하다

**`EXPO_PUBLIC_REASONING_PROVIDER=openai` 는 지금까지 조용한 무동작이었다.**

```ts
return raw === "claude" ? "claude" : "gemini";   // ← openai 가 gemini 로 떨어진다
```

콘솔이 그 변수를 플립하고 배포가 초록인 걸 보고도 **여전히 전부 Gemini** 일 수 있었다.
완료조건 1이 "달성된 것처럼 보이면서 거짓" 이 되는 경로였다. #1300 이 고쳤다.

### REQ-260821-01 — 무엇이 되고 무엇이 남았나

**된 것 (코드):**

- `openai-proxy` 가 **이미지**(채팅 content 배열)와 **오디오**(전사 엔드포인트, multipart, `{text}`)를
  받는다. 상한·mime 허용목록은 `gemini-proxy` 에서 **그대로 복사** — 클라가 이미 그 숫자로 검증한다
- `transcribeAudio` 가 더 이상 `"gemini-proxy"` 를 리터럴로 부르지 않는다
- 나이틀리에서 Gemini 좌석 3개 제거 + xAI 좌석 추가 (키 없으면 좌석째 skip)

**기본값은 여전히 Gemini 다 (의도).** 엣지 함수는 재배포 전까지 새 코드를 안 들고 있다.
**배포가 플립보다 먼저** — `0127`/`0130` 함정.

**안 한 것과 그 이유:** `grok-proxy` 를 신설하지 않았다. xAI 가 OpenAI 호환이라 신설하면
위기 게이트·지출 상한·감사 기록 **~450줄을 복사**하게 되는데, 이 저장소의 좌석 표류 가드가
존재하는 이유가 바로 **"사본은 언젠가 어긋난다"** 이고 오늘 그 가드가 실제로 나를 잡았다.
옳은 모양은 핸들러를 `_shared/` 로 빼서 두 벤더를 얇은 설정으로 만드는 것이고, 그건
**살아 있는 돈 경로의 리팩터**라 자기 PR 을 가져야 한다. 게다가 **키도 과금 승인도 없어서
오늘은 실제 API 로 시험할 수도 없다.** xAI 과금이 승인되면 그때 추출과 함께 붙인다.

### REQ-260820-04 — 삭제가 아니라 구멍 하나를 닫는 일이었다

`effective_subscription_tier()` 가 `WHEN u.judge_mode THEN 'brain'` 이다. **최상위 유료 등급**이다.
0011 주석은 "컬럼 레벨 revoke 가 있다" 고 적고 있는데 **운영 실측 결과 그 revoke 는 없다** —
`anon`·`authenticated` 둘 다 `users.judge_mode` 에 `UPDATE` 를 갖고 있었다.

즉 `enforce_judge_mode()` 는 벨트+멜빵이 아니라 **유일한 벨트**였고,
**트리거만 드롭했으면 자가 승격이 열렸다.** `0138` 은 **revoke 를 먼저** 하고 드롭을 나중에 한다.

`judge_mode` 컬럼과 comp 분기는 **일부러 남겼다** — RBAC 이 받는다.

### 콘솔이 이어받을 것 (순서가 중요하다)

1. **프록시 3종 재배포** (`openai`·`claude`·`gemini`). `_shared` 가 번들되므로 effort 키 계층은
   재배포해야 산다. **그다음** Simon 이 `OPENAI_API_KEY__LOW` 같은 **2단 이름**으로 키 발급 →
   **그다음** `MODEL_PIN_OPENAI_FRONTIER` 삭제. **키 입력 전에 핀을 지우지 말 것.**
2. **`0138` 운영 적용.** 적용 후 `judge_mode` 컬럼 권한이 `service_role` 만 남았는지 확인.
3. **`EXPO_PUBLIC_MULTIMODAL_VENDOR=openai`** — ⚠ **`openai-proxy` 재배포 뒤에.** 그 전에 켜면
   OCR·음성이 `purpose_not_seated` 로 400 난다.
4. **`OPENAI_TRANSCRIBE_MODEL` 확인.** 기본 `whisper-1` 인데 **이 프로젝트가 작동을 본 적 없는
   유일한 모델 id** 다. 계정에서 확인하고 필요하면 변수로 고친다(재배포 불필요).
5. **`EXPO_PUBLIC_REASONING_PROVIDER=openai`** → 실사용 1건이 `ai_audit_log` 에
   `reasoning_vendor='openai'` 로 찍히는지 확인. **그게 완료조건 1의 판정이다.**

### ⚠ Gemini 를 내리기 전에 반드시 같이 볼 것

`callLlm` 의 D-26 장애 폴백이 아직 `gemini-proxy` 를 **하드코딩**한다. **오늘은 맞다.**
`gemini-proxy` 를 폐기하는 순간 **함정이 된다** — OpenAI 좌석이 실패하면 **없는 함수로 폴백**한다.
발주가 "플립 검증 전 Gemini 참조 삭제 금지" 라 그대로 뒀다. **폐기 작업에 이 줄을 포함시킬 것.**

### Simon 답변 대기 (RBAC 게이트, #1303)

| ID | 질문 | 추천 |
|---|---|---|
| D-1 | `admin` 이 **남의 기록 원문**을 볼 수 있어야 하나? | **아니오.** 집계만 |
| D-2 | 역할 **회수가 즉시**여야 하나? | 부여는 JWT 클레임, 즉시 회수 경로만 테이블 |
| D-3 | 유출 비번 차단: **클라 검사(A)** vs 서버 강제(B) | **A** (우회 피해자가 우회자 자신) |
| D-4 | `admin`/`developer`/`support` 로 충분한가? | 충분 |

**유출 비밀번호 차단은 무료로 된다** — HIBP range API 는 키 불필요·k-anonymity 다.
**Q-260819-01(Supabase Pro)은 폐기 확정.**

---


## 2026-08-21 00:55 KST / 벤더 재편·XPRIZE 제거·RBAC **발주 원문** (아래 CLI 회신 참조)

> 발행: **GUI(Cowork) 콘솔 세션**. Simon 결정 5건이 2026-08-21 00:4x 에 착지했다. 이 블록이 그 결정을
> 발주로 옮긴 정본이다. 아래 23:50 블록의 REQ-260820-03(effort 키 계층)은 **그대로 유효하며
> 이 블록의 1번 선행 작업**이다.

### Simon 결정 (2026-08-21 00:4x KST, 원문 요지)

| ID | 결정 |
|---|---|
| 벤더 재편 | **"제미나이는 이제 필요 없어. 폐기까지 진행해줘."** 벤더는 **OpenAI · Claude · Grok** 3개로. "모두 모델은 최신(각 상황에 맞게 성능 최적화 모델 배치), effort 레벨을 달리하는 구조." |
| Q-260820-03 | XPRIZE 코드 잔재를 **지금** 코딩 세션에 발주해 **한 PR 로 전부** 걷어낸다 → REQ-260820-04 GO |
| Q-260819-01 | Supabase 유료(HIBP) 기능 폐기 동의. 단 **"기본적인 보안은 확보"** + **RBAC 도입** 지시 → REQ-260821-02 |
| Q-260820-02 | DRYRUN off - **실행 완료** (아래 상태표) |
| Q-260820-04 | effort 키 계층 유지. 대상 벤더만 OpenAI/Claude/Grok 으로 정정 (Gemini 키 4개는 만들지 않는다) |

### 콘솔 상태표 (2026-08-21 00:5x 실측)

| 항목 | 상태 |
|---|---|
| `PADDLE_SELF_SERVICE_DRYRUN` | **`0` (껐다).** `edge-flag-set.yml` 워크플로로 실행, 다이제스트 검증 완료. `subscription-manage` v20 재배포됨 |
| `MODEL_PIN_OPENAI_FRONTIER` | `gpt-5.4` 유지. REQ-260820-03 배포 + 키 입력 전 삭제 금지 |
| 유료 구독자 | 0명 (15명 전원 free) · 원장 0행 |
| Play | 프로덕션 액세스 3조건 전부 충족, 신청 버튼 열림 (Simon 클릭 대기) |
| Apple | 라이선스 계약 미수락 + 0.1.0 반려(2.1) + 유료 앱 계약 미체결 |

---

### REQ-260821-01 → CLI · 벤더 재편: Gemini 폐기 준비 + Grok(xAI) 추가 · ⚠ 실질 마감 2026-08-31

**왜 하는가.** Simon 이 Gemini 를 벤더에서 뺐다. 마침 구글이 **2026년 9월부터 Standard 키를 거부**하는데
새 Gemini 키는 만들지 않기로 했으므로, **9월 전에 Gemini 에서 내려오지 못하면 추론이 그냥 죽는다.**
폐기가 결정이자 동시에 마감이다.

**현재 상태 (실측, 다시 조사하지 말 것):**

- `EXPO_PUBLIC_REASONING_PROVIDER=gemini` · `EXPO_PUBLIC_LLM_PHASE=1` → **추론이 지금 Gemini 로 돈다.**
- `EXPO_PUBLIC_CHAT_VENDOR=openai` → 대화는 이미 OpenAI.
- **gemini-proxy 만 멀티모달이다.** 이미지(OCR, base64 ≤2.6MB, jpeg/png/webp/heic/heif 5종)와
  오디오(음성 메모 전사)를 inline 으로 받는다. **openai-proxy 에는 이미지·오디오 경로가 없다** (grep 실측).
  카메라 OCR·음성 전사가 앱의 실기능이므로 이 대체 경로가 이 발주의 실제 난이도다.
- xAI API 는 OpenAI 호환 형식이다. grok-proxy 신설이든 openai-proxy 일반화든 코딩 세션 판단.
- 나이틀리(model-refresh.yml)는 현재 GEMINI_API_KEY 부재로 Gemini 좌석 3개를 매번 건너뛴다.

**목표 + 완료조건 (기계 판정):**

1. 추론 provider 가 Gemini 아닌 벤더로 플립되고, 실사용 1건이 `ai_audit_log` 에 새 벤더로 찍힌다.
2. OCR·음성 전사가 대체 벤더로 동작한다 (클라이언트 계약을 유지해 서버에서 흡수하거나,
   클라 변경이 필요하면 배포 순서를 함께 적을 것).
3. Grok 좌석이 추가된다: 키 이름 `XAI_API_KEY` (+ REQ-260820-03 의 `XAI_API_KEY__{EFFORT}` 가
   자동 적용되도록 프리픽스 규약 준수). 키가 없으면 그 좌석을 건너뛴다 (현행 나이틀리 패턴).
4. model-refresh.yml 에서 Gemini 좌석 제거 + xAI 좌석 추가.
5. `npm run verify` 그린.
6. **Gemini 최종 폐기(시크릿 제거·AI Studio revoke·gemini-proxy 제거/동결)는 콘솔 몫이다.
   코드에서 미리 지우지 말 것** - 플립이 운영에서 검증된 뒤 콘솔이 마무리한다.

**하지 말 것:**

- REQ-260820-03 보다 먼저 벤더를 늘리지 말 것. effort 계층이 먼저 들어가야 새 벤더 키가
  처음부터 `{PREFIX}_API_KEY__{EFFORT}` 이름으로 들어간다.
- 플립 검증 전에 GEMINI_API_KEY 참조·gemini-proxy 를 지우지 말 것 (위 6번).
- `PURPOSE_EFFORT_MAX` 어휘(none/low/medium/high/xhigh)를 바꾸지 말 것.

**비용 플래그 (Simon 손):** Anthropic 크레딧 소진 상태라 Claude 좌석 활성화에는 **크레딧 구매**가 필요하고,
xAI 는 **신규 과금**이다. 코드는 키 부재 시 좌석 skip 으로 두고, 결제는 Simon 이 별도 결정한다.

### REQ-260820-04 → CLI · XPRIZE 잔재 제거 · **GO** (보류 해제)

Simon 지시: 한 PR 로 전부. 범위 (2026-08-20 23:35 실측 63파일 140회 중 동작 코드만):

| 어디 | 무엇 |
|---|---|
| `src/lib/judge/domains.ts` | `JUDGE_DOMAINS` 3종 제거 (또는 RBAC 대체 전 임시 빈 배열 - 판단 맡김) |
| `db/migrations/0010`·`0011` 의 judge 트리거 | 새 마이그레이션으로 드롭 (번호는 origin/main 최댓값 재확인. 지금 기준 다음 = `0138`) |
| `db/seed.sql` | `demo@xprize.org` 교체 |
| `src/app/manual.tsx` | 화면 문구 2곳 |
| 테스트 2종 (`judge/domains.test.ts` 6회 · `agent-briefing.test.ts` 7회) | 동반 수정 |
| `docs/CONSTRAINTS.md` C6·C12 | `check:constraints` 가 읽으므로 함께 개정 |

- **실측 안전성: 운영 `judge_mode=true` 사용자 0명 / 15명.** comp 를 잃는 사람이 없다. 지금이 제거 적기다.
- comp(무료 이용) 장치의 **대체는 여기서 만들지 말 것** - REQ-260821-02 의 RBAC role 기반 comp 가 받는다.
- 주석 잔재(`boundary.ts`·`routing.ts`·`delete-account`·`.env.example`)는 이 PR 에 곁들여도 좋다.
- 아카이브·과거 감사·과거 핸드오프는 **건드리지 않는다.**

### REQ-260821-02 → CLI · RBAC + 기본 인증 보안 (설계 문서 먼저)

**왜 하는가.** Simon: "supabase 의 유료 기능을 안 쓸 뿐이지 비밀번호 유출 방지, 개인 정보 유출 방지 등의
기본적인 보안은 확보되어야 해. 그리고 RBAC 시스템을 도입해서 운영자, 개발자, 플랜별 사용자 등에게
차별적 접근 권한을 부여하자."

**더 나은 경로 (Pro 결제 없이 유출 비밀번호 차단):** HIBP range API 는 **무료·키 불필요·k-anonymity**
(SHA-1 앞 5자리만 전송, 원문과 전체 해시가 밖으로 안 나감)다. 가입·비밀번호 변경 경로의 edge function 에서
이 체크를 돌리면 Supabase Pro 의 leaked-password 기능과 같은 효과를 0원에 얻는다.
Q-260819-01(3회 이월)은 이것으로 **폐기 확정**이다.

**출발점 (방법은 자유):**

- 역할: `admin`(운영자) · `developer` · 플랜 티어(free/voyager/polaris)는 기존 `subscription_tier` 재사용.
  저장은 `user_roles` 테이블 또는 `users.role` + **custom access token hook** 으로 JWT 에 role 클레임 주입
  → RLS·SECURITY DEFINER 가드가 클레임을 읽는 구조.
- judge_mode comp 의 대체(role 기반 무료 이용 부여)를 여기 포함 - REQ-260820-04 와의 경계.
- **`docs/RBAC-DESIGN.md` 설계 문서를 먼저 내고 Simon 컨펌 후 마이그레이션.** 지금 유료 0명·judge 0명이라
  도입 비용이 최소인 시점이지만, 권한 체계는 되돌리기 비싸므로 설계 승인을 게이트로 둔다.

**완료조건:** ① 설계 문서 PR (승인 게이트) ② 승인 후: HIBP 체크가 가입 경로에서 동작(유출 비밀번호로
가입 시도 시 거부되는 테스트 포함) ③ role 클레임이 JWT 에 실리고 RLS 가드 1개 이상이 실제로 그것을 읽음
④ `npm run verify` 그린.

### 곁들여 · 확인 회신 3건 (Simon 질문에 대한 코드 실측 답)

1. **취소 동작**: `cancel` 기본값 = `next_billing_period` → **결제한 기간 만료까지 plan 유지 후 자동 갱신 중단.**
   Simon 이해와 일치. `immediately` 옵션도 있다.
2. **환불은 취소에 자동으로 붙지 않는다.** 별도 액션(`refund_request`)이고, 화면은 `refund_eligibility()`
   판정(남은 일수·사용량)을 보여주며 자격이 있을 때만 버튼이 열린다. "취소하면 요건 충족 시 환불"이 되게
   하려면 취소 시트에서 자격자에게 환불을 함께 제안하는 **클라 변경**이 필요하다 - 원하면 별도 발주.
3. **자동 갱신 고지**: 구독 화면 `subscription.autoRenewOn` 행(갱신일 표시) + 약관 §3 + 환불정책 §3 +
   Paddle 체크아웃 3중 고지. 단 **"자동구독으로 할까요?" 를 따로 묻는 단계는 없다** - Paddle 구독은
   자동 갱신이 기본이고 고지 방식이다. 가입 직전 명시 동의 단계를 원하면 별도 발주.


## 2026-08-21 / P5 화면 이식 — 규칙 2·3과 타입 격자가 **화면에서** 참이 됐다

> 발행: **코딩 세션**. 아래 콘솔 세션 블록들과 겹치는 내용 없음 (시각 층만 만졌다).
> 이 세션의 앞부분(큐 A~D 완주)은 `2026-08-20 / 큐 A·B·C·D 완주` 블록에 있다.

### 한 줄

토큰은 1·2단계에서 이미 PIXEL-CLAY 였는데 **화면은 아니었다.** 웹 빌드를 띄워서 `/sign-in` 을
봤더니 알약 버튼과 동그란 구글 버튼이 그대로였다. 그걸 고쳤다 — **65개 파일**에서 규칙 2(라운드
0) · 규칙 3(블러 금지) · 타입 격자가 이제 참이고, CI 가 지킨다.

### 이번에 머지된 것 (5건)

| PR | 무엇 | 규모 |
|---|---|---|
| #1283 | 라운드 0 — `dds-*` 공용 시트 (6개 실화면) | 52 토큰 + 20 리터럴 |
| #1284 | 라운드 0 — 딥스페이스 뷰·독·렌즈 | 136 리터럴 |
| #1286 | 라운드 0 — 앱 화면과 공용 컴포넌트 | 47파일 · 77 리터럴 |
| #1289 | **규칙 3** — 블러 금지 + 가드 통합 | 12파일 · 45 속성 |
| #1291 | **타입 격자** — 지금 실제로 흐린 Galmuri 크기 | 21파일 · 65 크기 |

### 새 가드: `check:pixel-rules` (verify 23단계)

한 스크립트가 세 가지를 본다 — **규칙 2**(리터럴 반경 + 레거시 `radius.*` 토큰) ·
**규칙 3**(`shadowRadius`/`shadowOpacity`/`elevation`) · **타입 격자**(Galmuri 얼굴과 같은
스타일 객체에 있는 `fontSize`).

**래칫이다.** `MIGRATED` 목록에 있는 파일만 본다. 목록은 **늘어나기만** 하고, 전 화면을 덮는
날 목록을 버리고 `src/` 전체를 훑으면 된다. 이 저장소가 보통 래칫을 싫어하지만
(`check:cycles` 는 무관용), 여기서는 **규칙이 약한 게 아니라 이식이 안 끝난 것**이다.

⚠ 예외 1건: **`radius.phone`(38)** = 기기 목업 베젤. 인수 번들도 `[data-phone-frame] *`
(자손)에만 라운드 금지를 걸고 **프레임 자신에는 안 건다**(`px-bridge.css:76,83`).
**이름으로만** 예외라 리터럴 38 은 여전히 실패한다.

---

### ⭐ 화면을 눈으로 보는 법 — 이게 이번에 제일 쓸모 있는 발견이다

```bash
PORT=8148 npm run qc:mobile-web:serve     # 실제 웹 빌드를 내보내고 로컬에 띄운다
# 그다음 CDP 로 라우트 스크린샷 (헤드리스 크롬, Playwright 불필요)
```

**토큰 테스트는 전부 초록인데 화면은 둥글었다.** 그 간극을 찾은 것이 이 루프다.
남은 P5 화면은 전부 이걸로 확인할 것.

함정 2개(둘 다 실제로 밟았다):
- **Git Bash 가 `/sign-in` 을 `C:/Program Files/Git/sign-in` 으로 바꾼다** → `MSYS_NO_PATHCONV=1`
- 인증 필요한 화면은 CI 의 `recapture` 잡이 이미 QA 계정으로 찍는다
  (`flow-thumbnails.yml`). **로컬에 다시 만들지 말 것** — 시도했다가 접었다.

---

### 남은 것 — 그리고 왜 사람이 필요한가

**기계적으로 옮길 수 있는 것은 끝났다.** 남은 것은 전부 판단이 필요하다.

| 남은 것 | 왜 안 했나 |
|---|---|
| `secondb.tsx` · `profile.tsx` · `BackArrow.tsx` | **두 스킨을 함께 섬긴다.** `gameboy.radius` 로 스타일을 잡는데 `isDeepSpaceUI` 는 셸만 바꾼다(파일 주석이 그렇게 적고 있다). 0 으로 만들면 딥스페이스는 고쳐지고 **레거시 롤백이 깨진다** → 모드별 값이 필요하다 |
| `ConstellationHome` · 스프라이트 2 · 그래프 3 | **개념 아트.** 거기 반경은 별과 노드다. 사각형으로 만드는 건 **별자리 은유에 대한 결정** |
| 격자 밖 `fontSize` 약 425곳 | **벡터 얼굴(Pretendard) 위**라 어떤 크기든 멀쩡히 렌더된다. 그 화면이 Galmuri 로 갈 때 같이 옮기면 된다 |
| 본문 얼굴 → Galmuri 전면 적용 | **저시력 `readable` 옵션 결정 대기** (아래) |

**레거시 판별 규칙 (틀리기 쉽다).** "레거시를 import 하는가" 가 아니다 — `interview.tsx` 는
`PremiumModal` 을 import 하지만 살아 있는 딥스페이스 화면이다. 진짜 표식은
**`if (isDeepSpaceUI()) return <XxxDeepSpace />`** 다. 그 줄이 있으면 딥스페이스 렌더링을
남에게 넘긴 것이고 그 아래는 전부 레거시 분기다. 이 구분으로 5개 파일이 "제외"에서
"이식"으로 넘어왔다.

### Simon 결정 대기 (2건, 급하지 않음)

1. **공유 스킨 파일** — 레거시 롤백이 어긋나도 되나, 아니면 모드별 값을 넣나?
2. **저시력 `readable` 옵션** — `ui/Text.tsx` 만 덮어서 이주된 화면은 무시한다.
   이주 **전에도** 무시했지만(그땐 Roboto) 이제 기본이 비트맵이다. 제대로 고치려면 런타임
   스타일이 필요하고 그건 D2 에서 반려하신 35파일 변경이다.

### 발견했지만 안 고친 것

`/terms` 에서 **떠 있는 뒤로가기 버튼이 화면 자체 헤더 제목과 겹친다.** 이주 **전** 스크린샷에도
있으니 내가 만든 것이 아니다. `BackArrow.tsx` 가 위 공유 스킨 목록에 있어서 같이 미뤘다.

### OpenAI 기본 키 — cowork 진행 중

`docs/cowork-console-260820-openai-key.md` 로 발주했고 **아직 진행 중**이다
(`MODEL_PIN_OPENAI_FRONTIER=gpt-5.4` 가 그대로 = 안 끝났다). 앱은 정상이다.
그 건의 전말은 `2026-08-20 / 큐 A·B·C·D 완주` 블록 상단 ⚠ 절에 있다.

### 검증

```bash
npm run verify    # 23단계 · 475 suites / 4,262 tests
# PIXEL-CLAY RULES PASS  이식된 65개 파일에 둥근 모서리 0건 · 블러 0건 · 타입 격자 준수
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 기계적 P5 는 끝났다. 다음은 위 "Simon 결정 대기" 2건 중 답이 온 것부터.
# 화면을 만질 때는 반드시 qc:mobile-web:serve 로 눈으로 확인할 것.
```


## 2026-08-21 / 결제 감시가 생겼고, 가입 화면의 법정 동의 한 줄이 빠져 있었다

> **새 세션은 이 블록을 먼저 읽을 것.** 바로 아래 블록들은 다른 세션 몫이고 그대로 유효하다.
> 이 블록은 **결제·DB 세션 몫**이다.

### 이번 세션 머지 (5건)

| PR | 무엇 |
|---|---|
| **#1292** | **가입 화면에 `안전 안내` 동의 행이 없었다** — PIPA 제23조 별도 동의. 라이브에서 찾아 고치고 라이브에서 확인 |
| **#1290** | **Paddle 실측** — 한국 결제수단 이미 전부 켜져 있고 가격이 원 단위까지 일치 |
| **#1287** | 결제 트립와이어 7종 일간 감시 + **경보 자체가 못 울리던 결함**(`GH_REPO`) 수정 |
| **#1285** | 클라이언트가 잔액을 **원장**에서 읽는다 (구매 크레딧을 못 쓰는 문제 선제 차단) |
| #1280·#1281 | `0137` 크로스 유저 읽기 차단 · `types.gen.ts` 재생성 |

- 운영 마이그레이션 **`0137`**, 미적용 0건. `npm run verify` **478 suites / 4282 tests 그린**

### ⚠ #1292 — 이 저장소의 "조기 반환" 함정이 법적 결함을 숨기고 있었다

`src/app/(auth)/sign-up.tsx:508` 이 `if (isDeepSpaceUI()) return <DeepSpaceSignUpDesignScreen />`
로 끝난다. 그래서 **필수 5줄을 다 가진 `<ConsentNotice/>` 를 렌더하는 `SignUpLegacy` 는 배포되는
화면이 아니었다.** 실제 화면에는 `safetyNotice` 행이 **아예 없었다.**

양쪽으로 틀렸다:

- 보이는 4줄을 하나씩 다 눌러도 `allRequiredAcksChecked` 가 막아 **제출이 영영 안 열린다**
- **"필수 항목에 모두 동의"** 를 누르면 `setAllRequiredAcks` 가 **화면에 보인 적 없는 항목까지
  `true` 로 동의 원장에 기록**한다 — 별도 동의는 *따로 보여주고 따로 받는 것*이 요건이라
  이쪽이 더 나쁘다

**찾은 방법을 기억할 것: 코드가 아니라 라이브 DOM 을 봤다.** 헤드리스 크롬 `--dump-dom` 으로
`/sign-up` 을 받아 로케일 문구를 grep 했더니 형제 문구는 있고 그 문구만 없었다.
**`role="checkbox"` 개수 세기가 가장 빠른 판별**이다 — 수정 후 **6 → 7** 로 배포 도달까지 확인했다.

### ✅ Paddle 병목은 이미 풀려 있었다 — 그리고 대시보드를 열 일이 아니었다

2026-08-19 부터 모든 핸드오프에 "1순위 병목"으로 실려 온 항목이다. 실측 결과:

```
PAYMENT_METHODS: card, naver_pay, kakao_pay, south_korea_local_card, apple_pay
CURRENCY:        KRW
항해자 9,900 / 99,000 · 북극성 19,900 / 199,000   ← 앱 표시와 원 단위까지 일치
```

**약관의 "카드, KakaoPay, NaverPay" 문장은 프로덕션에서 참이다.** 거짓이라는 서술을 인용하지 말 것.

`EXPO_PUBLIC_PADDLE_CLIENT_TOKEN` 은 **공개 repo Variable** 이고, 그 토큰으로
`Paddle.PricePreview` 를 부르면 고객 브라우저가 페이월에서 하는 것과 똑같은 읽기를 한다.
**API 키도 로그인도 클릭도 필요 없었다.** 이 항목이 이틀간 사람 목록에 앉아 있었던 이유는
아무도 API 를 먼저 시도하지 않아서다.

⚠ **연간 price id 는 2026-08-03 부터 설정돼 있었다.** 그래서 #1267 의 주기 토글은 머지 직후
**첫 배포에서 이미 라이브**였다. 다행히 가격은 일치한다.

### 새 감시 장치 — `billing-tripwires.yml` (매일 05:20 KST)

`provider_conflict` · stuck claim · `refund_review` · `stale_entitlement` ·
unhandled payload · counter drift · balance drift **7종을 아무도 안 읽고 있었다.**
건수만 찍고(사용자 id·페이로드 금지), 하나라도 0이 아니면 이슈를 연다. 현재 전부 0.
**운영에 직접 dispatch 해서 7행 렌더까지 확인했다.**

⚠ 곁가지로 나온 것이 더 무섭다: **`credential-expiry-check.yml` 의 이슈 생성 스텝은 배포 이래
한 번도 안 돌았고, 돌았으면 실패했을 것이다.** checkout 이 없는 잡에서 `gh` 는
`GITHUB_REPOSITORY` 를 안 읽어 `not a git repository` 로 죽는다. 둘 다 `GH_REPO` 를 설정했고,
테스트가 모든 워크플로를 훑는다. `ops` 라벨도 없어서 만들어 뒀다.

### Simon 대기 — 3건으로 줄었다

| # | 무엇 | 왜 사람이어야 하나 |
|---|---|---|
| 1 | `OPENAI_API_KEY` 재입력 (값 안쪽 개행) | 시크릿 입력란 |
| 2 | Supabase 유출 비밀번호 차단 | **토글이 아니라 Pro 플랜 비용 결정** |
| 3 | Paddle 샌드박스 adjustment 페이로드 | 라이브 계정이라 승인 필요 |

- **Paddle 대시보드 확인 2건은 위 실측으로 해소됐다.**
- `PADDLE_API_KEY_EXPIRES_AT` 은 **이미 설정됨**(2026-08-19 21:54).
- 육안 확인 "담기 칩" 은 구조로 확인했다 — `isKeepable` = 세컨비 답변·비합성·비어있지 않음이라
  **모든 실제 답변에 붙는다.** 숨길 게이트가 없다.

### 다음이 `0138` 구매 경로를 쓸 때

`getReasoningUsage` 는 **이미 원장을 읽는다**(#1285). 서버만 쓰면 된다. 단
**`kind='purchase'` 의 `provider_event_id` = 거래 id** (0136 계약), 그리고 user-id 를 받는
새 RPC 를 만들지 말 것 — `credit_summary_self()` 를 읽으면 된다(0137 이 닫은 결함).

---


## 2026-08-20 23:50 KST / XPRIZE 잔재 정리 + effort 전용 키 발주 (REQ-260820-03)

> 발행: **GUI(Cowork) 콘솔 세션**. 바로 아래 블록(0136·0137 운영 적용)은 같은 날 같은 세션의
> 앞 작업이고 그대로 유효하다. 이 블록은 **그 뒤에 새로 생긴 것**만 적는다.

### 1. XPRIZE 는 끝났다. README 만 아직 반대로 말하고 있었다

Simon 결정 **2026-08-15**. `CLAUDE.md` 와 `AGENTS.md` 에는 이미 "XPRIZE 는 종료됐다" 경고 블록이
있는데, **`README.md` 는 여전히** `submitted to the Build with Gemini XPRIZE ... deadline
2026-08-17 06:00 KST` **라고 적고 있었다.** 공개 파일이라 가장 시끄러운 모순이었다.
이 PR 에서 그 세 곳을 정정한다.

실측(2026-08-20 23:35 KST · `origin/main`): **63개 파일 · 140회.**

| 분류 | 어떻게 하나 |
|---|---|
| `CLAUDE.md` · `AGENTS.md` | 이미 경고 블록이 있다. 손대지 않는다 |
| `README.md` | **이 PR 에서 정정** (판매 문구 3곳) |
| 동작 중인 코드 (judge mode 일체) | **건드리지 않는다** → REQ-260820-04 로 분리 |
| 아카이브·과거 감사·과거 핸드오프 | 그대로 둔다. 그 시점의 사실이다 |

**용어 정정 하나.** 이제 "제출"은 **앱스토어 심사 제출**(Google Play / App Store)을 뜻한다.
대회 제출이 아니다. 2026-08-20 세션에서 실제로 이 혼동이 한 번 났다.

### 2. REQ-260820-03 → CLI (코딩 세션) · effort 전용 키 계층

**상태: 대기.** 이 요청은 2026-08-20 06:30 KST 에 작성됐지만 **파일로만 존재해서 코딩 세션에
도달하지 못했다.** 그래서 지금 정본 통로인 이 파일에 싣는다.

**왜 하는가.** Simon 지시: *"모델은 항상 최신, 하지만 리즈닝(effort) 레벨은 구분할 수 있게.
API 키를 다시 따는 일이 없게."* 현재 스킴은 이 둘을 **동시에 만족할 수 없다.** 구조적으로 그렇다.

`supabase/functions/_shared/axis-key-name.ts` 의 `pickApiKey` 는 2단이다.

```
1. {PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}   <- 이름이 모델명에서 파생된다
2. {PREFIX}_API_KEY                          <- 기본 키
```

1단 이름이 모델명에서 파생되므로, **모델이 승격되면 이름이 같이 바뀌고 그 시크릿은 존재하지 않게
된다.** 그 순간 모든 effort 가 2단 하나로 합쳐진다. 승격할 때마다 effort 구분이 사라지고,
되살리려면 새 모델 이름으로 콤보 키를 다시 만들어야 한다. 그게 "다시 따는 일"의 정체다.

**이미 두 벤더에서 실제로 일어났다** (`ai_audit_log.key_combo` 실측).

| 시점(KST) | 좌석 | key_combo | 무슨 일 |
|---|---|---|---|
| 07-28~29 | `gemini-3.5-flash` | `GEMINI_API_KEY__G35FLASH__{LOW,MEDIUM,HIGH,XHIGH}` | effort 4단 구분 정상 |
| 08-17 17:20 | `gemini-2.5-flash` | **`GEMINI_API_KEY`** | 좌석이 바뀌자 기본 키로 합쳐짐 |
| 08-19 | `gpt-5.5` 승격 시도 | 기본 키 | 기본 키에 제어문자가 있어 502 |

Gemini 는 **증상 없이** 합쳐졌고(기본 키가 멀쩡했으므로), OpenAI 는 **502 로 터졌다**(기본 키가
망가져 있었으므로). 같은 결함의 두 얼굴이다.

**무엇을 바꾸나. 파일 하나, 계층 하나.**

```
1. {PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}   기존. 특정 모델을 따로 떼고 싶을 때만
2. {PREFIX}_API_KEY__{EFFORT}                신규. 모델이 바뀌어도 살아남는다  <-- 이것이 답
3. {PREFIX}_API_KEY                          기본. 최후 폴백
```

```ts
export function pickApiKey(
  getEnv: (key: string) => string | undefined,
  prefix: string,
  model: string,
  effort: string,
  baseKey: string,
): ResolvedKey {
  // 1단: (모델 x effort). 기존 동작 그대로 - 이미 만들어 둔 콤보 키가 계속 이긴다.
  const comboName = comboSecretName(prefix, model, effort);
  const combo = (getEnv(comboName) ?? '').trim();
  if (combo.length > 0) return { apiKey: combo, secretName: comboName, usedCombo: true };

  // 2단: effort 전용. 모델명이 들어가지 않으므로 승격이 이 이름을 바꾸지 못한다.
  const effortName = `${prefix}_API_KEY__${effort.toUpperCase()}`;
  const byEffort = (getEnv(effortName) ?? '').trim();
  if (byEffort.length > 0) return { apiKey: byEffort, secretName: effortName, usedCombo: true };

  // 3단: 기본 키. trim 은 그대로 유지(2026-08-19 사고의 수정).
  return { apiKey: (baseKey ?? '').trim(), secretName: comboName, usedCombo: false };
}
```

**프록시 3종은 코드 변경 0줄.** 셋 다 `resolvedKey.usedCombo ? resolvedKey.secretName :
'<PREFIX>_API_KEY'` 로 기록하므로 2단이 `usedCombo: true` 를 돌려주면 `key_combo` 에
`OPENAI_API_KEY__LOW` 가 그대로 찍힌다. **다만 셋 다 재배포는 필요하다** - Deno 가 `_shared` 를
번들하므로 공유 모듈만 고쳐도 `openai-proxy`·`gemini-proxy`·`claude-proxy` 를 다시 배포해야 한다.

**effort 어휘(실측 확정).** `EFFORT_RANK = { none: 0, low: 1, medium: 2, high: 3, xhigh: 4 }`.
`'max'` 는 클램프 **전에** `'xhigh'` 로 접힌다(세 프록시 동일). `none` 은 OpenAI 의
`PURPOSE_EFFORT_MAX.safety_classify` 천장에서만 나온다. Gemini·Claude 에는 `none` 이 없다.

**완료조건 (기계 판정).**

1. `supabase/functions/_shared/__tests__/axis-key-name.test.ts` 에 추가되고 통과:
   - 콤보 키와 effort 키가 둘 다 있으면 **콤보가 이긴다**
   - 콤보가 없고 effort 키만 있으면 effort 키를 쓰고 `usedCombo === true`,
     `secretName === '{PREFIX}_API_KEY__{EFFORT}'`
   - 둘 다 없으면 기본 키 + `usedCombo === false`
   - effort 키도 **trim** 되고, 공백만 있는 값은 부재로 취급된다
   - `effort` 대소문자가 섞여 들어와도 이름이 대문자로 정규화된다
   - **모델이 바뀌어도 effort 키는 계속 선택된다** (이 변경의 존재 이유를 고정하는 테스트)
2. `npm run verify` 그린.
3. 배포 후 실사용 1건에서 `ai_audit_log.key_combo` 가 `OPENAI_API_KEY__LOW` 형태로 찍힌다.
4. `MODEL_PIN_OPENAI_FRONTIER` 를 지우고 승격시켰을 때 **502 가 나지 않는다.** 이것이 실제 시험이다.

**하지 말 것.**

- `comboSecretName()` 과 `MODEL_SLUGS` 를 바꾸지 말 것. 기존 콤보 키가 계속 이겨야 한다.
- 3단 폴백의 `trim()` 을 빼지 말 것. 2026-08-19 장애의 수정이다.
- `isUsableHeaderValue` 를 정규식으로 다시 쓰지 말 것. 파일 주석이 이유를 적어 뒀다.
- 프록시 3종의 `keyCombo` 계산식을 바꾸지 말 것. 지금 형태로 2단이 자동 반영된다.
- `usedCombo` 를 3단(기본 키)에서 `true` 로 만들지 말 것. 폴백 경고 로그가 죽는다.

> 위 방법은 출발점일 뿐이다. 더 효율적인 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.

**머지 뒤 순서는 콘솔이 이어받는다.** 프록시 3종 재배포 → Simon 이 벤더 키 발급·시크릿 입력 →
그 다음에 `MODEL_PIN_OPENAI_FRONTIER` 삭제 → `model-refresh.yml` dispatch → `key_combo` 확인.
**키 입력 전에 핀을 지우지 말 것.** 순서가 뒤집히면 승격이 다시 망가진 기본 키에 닿는다.

### 3. REQ-260820-04 → CLI · XPRIZE 코드 잔재 제거 (**착수 전 Simon 합의 필요**)

**상태: 보류.** 지금 손대면 안 되는 이유가 있어서 별도 요청으로 떼어 둔다.

judge mode 는 **동작 중인 권한 경로**다. 같은 판정이 세 곳에 이중화돼 있다.

| 어디 | 무엇 |
|---|---|
| `src/lib/judge/domains.ts` | `JUDGE_DOMAINS = ["xprize.org","devpost.com","hacker.fund"]` |
| `db/migrations/0010_triggers.sql` · `0011_security_fixes.sql` | 같은 판정을 DB 트리거로 |
| `src/lib/judge/__tests__/domains.test.ts` (6회) · `src/lib/__tests__/agent-briefing.test.ts` (7회) | 테스트 |
| `db/seed.sql` | `demo@xprize.org` |
| `src/app/manual.tsx` | 화면 문구 2곳 |
| `docs/CONSTRAINTS.md` C6·C12 | `npm run check:constraints` 가 읽는다 |

하나만 지우면 나머지가 어긋난다. **한 PR 안에서 코드·DB 트리거·시드·테스트·CONSTRAINTS 를 함께**
바꿔야 하고, 그건 마이그레이션이 한 장 더 생긴다는 뜻이다. 급하지 않으므로 Simon 이 착수를
지시할 때까지 **하지 않는다.**

주석 잔재(`boundary.ts`, `routing.ts`, `delete-account/index.ts`, `.env.example`)는 위험이 0이라
다른 작업에 곁들여 정리해도 된다.

### 4. 콘솔이 들고 있는 것 (참고)

| 항목 | 상태 |
|---|---|
| 운영 마이그레이션 | `0137`. 저장소 최댓값도 `0137` → 다음 빈 번호 **`0138`** |
| `MODEL_PIN_OPENAI_FRONTIER` | `gpt-5.4` 로 **아직 핀 유지**. REQ-260820-03 배포 + 키 입력 전에는 지우지 않는다 |
| `PADDLE_API_KEY_EXPIRES_AT` | `2026-11-08` 설정 완료 |
| `PADDLE_SELF_SERVICE_DRYRUN` | **아직 `1`.** `ENABLED=1` 과 동시라 자가 취소·환불이 Paddle 에 닿지 않는다 |
| 유료 구독자 | **0명** (실측: 15명 전원 `free`). 위 항목의 blast radius 가 오늘은 0이다 |


## 2026-08-20 / 운영이 main 을 따라잡았다 (0136·0137 적용) + 크로스 유저 읽기 차단

> **새 세션은 이 블록을 먼저 읽을 것.** 바로 아래 블록(큐 A~D / 화면 이식)은 **화면 세션 몫**이고
> 그대로 유효하다. 이 블록은 **결제·DB 세션 몫**이다.

### 어디까지 왔나 — 미적용 마이그레이션 0건

| | |
|---|---|
| 운영 마이그레이션 | **`0137`** (이 세션에서 `0136`·`0137` 적용·검증) |
| 저장소 최댓값 | **`0137`** → 다음 빈 번호는 **`0138`** |
| 열린 PR | 0건 (내 몫) |
| 원장 | `credit_ledger`/`credit_balance`/`credit_skus`/`credit_backfill_0135` **전부 0행** — 컷오버가 옮긴 것이 없었다 |

**이번 세션 머지**

| PR | 무엇 |
|---|---|
| **#1280** | **`0137`** — 크레딧 리더 2개의 **크로스 유저 읽기** 차단 |
| **#1281** | `types.gen.ts` 재생성 (0132 시점 → 0137 시점) |
| #1279 | cowork 콘솔 프롬프트 |

### ⚠ `0137` — 운영에서 실측한 결함, 그리고 고친 "모양"

`0134` 가 `credit_available(uuid, ...)` 와 `credit_ad_earned_this_month(uuid, ...)` 를
**`authenticated` 에 grant** 했는데 **소유권 검사가 없었다.** 둘 다 `SECURITY DEFINER` 라 RLS 가
안 걸리고, 대상 사용자가 **파라미터**이며, PostgREST 가 그걸 공개한다. QA 계정으로 운영에 직접:

```
적용 전:  POST /rest/v1/rpc/credit_available {"p_user_id":"<내가 아닌 uuid>"} -> 200
적용 후:  같은 요청                                                          -> 403 42501
```

새던 것은 없다 — 원장이 0행이라 전부 0 을 돌려줬다. **첫 구매가 아니라 첫 광고 리워드 적립**에서
무장된다.

**고친 방식이 요점이다 — "주의"가 아니라 "모양".** 파라미터 리더는 **내부로 되돌리고**(revoke,
드롭 아님), 클라이언트에는 **인자가 없는 `credit_summary_self()`** 를 준다. 조작할 파라미터가
없으므로 같은 결함이 구조적으로 못 돌아온다.

⚠ **본문에 `auth.uid()` 가드를 넣으면 안 된다.** `expire_credit_lots`(pg_cron) → 원장 INSERT →
미러 트리거 → `credit_ad_earned_this_month` 경로에는 **JWT 가 아예 없어서** `auth.uid()` 가 NULL
이다. 가드를 넣으면 **만료 미러가 매번 죽는다.**

### 확인해서 결함이 아니었던 것 2건 — 다시 파지 말 것

- **`bump_reasoning_usage_if_under_cap` 오버로드(3인자/4인자 공존)가 `PGRST203` 을 낼까?**
  → **아니다.** 운영에 직접 쏴서 둘 다 `42501`(함수 본문 도달) 확인. **주간 한도는 제대로 걸린다.**
  이게 조용히 실패했다면 `usage.ts:123` 이 에러를 삼켜서 추론이 무제한이 됐을 것이다.
- **`0135` 의 `usage_counters` freeze 트리거가 배포된 클라를 깨뜨리나?**
  → **아니다.** 옛 writer 가 전부 0135 안에서 동일 시그니처로 교체됐고, `0078` 이 이미
  `authenticated` 의 직접 INSERT/UPDATE 를 revoke 해뒀다. 사용자가 닿는 55006 경로 0건.

### 다음 세션이 반드시 알아야 할 것

**구매 경로(`0138`)는 서버만으로 안 끝난다.** 콘솔 문서의 "잔액만 안 보인다" 는 **축소 서술이다** —
`src/app/reasoning.tsx` 의 `depleted` 게이트가 `remaining <= 0` 이면 `startRun` 을 즉시 반환시키므로
**산 크레딧을 아예 쓸 수 없다.** 클라이언트는 `credit_summary_self()` 를 읽어야 하고,
**user-id 를 받는 RPC 를 새로 만들지 말 것**(그게 `0137` 이 닫은 결함이다).

`0136` 이 정한 키 계약도 그대로다: **`kind='purchase'` 의 `provider_event_id` = 거래 id.**

### ⚠ 낡은 콘솔 핸드오프를 들고 오는 세션에게

`2ndB_console_handoff_260820.md`(01:40 KST)는 낡았다. 그 문서의 §3(결제 구조)이
**"한국 = 토스페이먼츠"** 라고 적고 있는데, `docs/cowork-reply-260819.md` 의 실측은 다르다 —
**Paddle 이 카카오페이·네이버페이 정기결제를 2025-11-19 부터 지원하고, 토스는 카카오페이 정기결제를
못 준다.** 확정 결정은 **"Paddle 먼저, 토스는 그 다음"** 이다. (크레딧 원장의 존재 이유는 그대로
유효하다 — 삼성페이·페이코는 어디서도 정기결제가 안 된다.)

---

