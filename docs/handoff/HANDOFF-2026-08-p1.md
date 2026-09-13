# 2nd-Brain Handoff — 2026-08 (1/4)

> 덮는 기간: **2026-08-18 ~ 2026-08-20** · 블록 7개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).
> 이 달의 더 새 블록: `HANDOFF-2026-08-p2.md`

## 2026-08-20 / 큐 A·B·C·D 완주 — P5 화면 이식이 그 세션의 다음 차례

> 보고서(그림 포함): <https://claude.ai/code/artifact/26b94152-8c7d-408d-ba33-9201c562dc5a>

### 어디까지 왔나

- main HEAD: `f1003d7c`
- 테스트: **473 suites 그린** (`npm run verify`, 22단계)
- working tree: clean · 열린 PR: 0건 (내 몫)
- 마이그레이션 최댓값: **`0136`** → 다음은 `0137`. 이번 세션은 DB 를 **안 건드렸다**

**이번 세션 머지 (4건)**

| PR | 무엇 |
|---|---|
| **#1273** | **PIXEL-CLAY 토큰 2단계** — 간격 `--u` 2px · 타입 Galmuri 격자 · 폰트 4종 벤더링 |
| **#1275** | **프리미티브** — 잘린 모서리 베벨 · 디더 타일 · 가라앉는 누름 |
| #1272 | 모델 승격이 좌석 밖으로 새던 것 차단 (좌석별 JSON 으로) |
| #1274 | 프록시 기본 API 키 trim + `MODEL_PIN` 이 진짜 되돌리게 |

### ⚠ Simon 확인이 필요한 것 — **1건, 운영에 영향 있음**

**`OPENAI_API_KEY` 기본 시크릿 값이 헤더로 쓸 수 없는 상태다.**

앞뒤 공백이 아니라 **값 안쪽**에 개행 같은 것이 있다(#1274 가 trim 을 넣고 재배포해도 여전히 실패).
증상은 `TypeError: Failed to construct 'Request'` → 프록시가 `upstream_unreachable` 로 보고 →
**벤더 장애처럼 보인다.**

원장이 뒷받침한다: **지금까지 성공한 OpenAI 호출은 전부 콤보 키(`OPENAI_API_KEY__<MODEL>__<EFFORT>`)를
썼다.** 기본 키 폴백은 이 프로젝트에서 한 번도 실제로 작동한 적이 없다.

- **할 일**: Supabase 대시보드에서 `OPENAI_API_KEY` 를 줄바꿈 없이 한 줄로 다시 붙여넣기.
  ⚠ **값을 요청하지 말 것 · 채팅·로그·커밋에 남기지 말 것.** 세션은 값을 본 적 없고 볼 필요도 없다.
- **그다음**: `MODEL_PIN_OPENAI_FRONTIER` 변수를 지우고 나이틀리 1회 → `gpt-5.5` 가 정상 착석.
  (대안: `OPENAI_API_KEY__GPT55__LOW` 콤보 키를 만들어도 된다.)

**왜 지금까지 아무도 몰랐나 (2026-08-19 배포 후 실측).** `gpt-5.4` 는 콤보 키가 **모든 effort
등급에 다 있다** — `__LOW` · `__MEDIUM` · `__HIGH`, 그리고 nano 는 `__NONE`. 즉 좌석이 도달할 수
있는 조합이 전부 콤보로 덮여 있어서 **기본 키 경로에 닿을 방법이 아예 없었다.**

그래서 이건 "지금 고장난 것" 이 아니라 **승격할 때마다 무장되는 지뢰**다:

```
모델 승격 → 콤보 이름이 모델명 따라 바뀜 → 새 콤보 없음 → 기본 키 → 터짐
```

**고치는 방법 두 가지, 강도가 다르다:**
1. `OPENAI_API_KEY__GPT55__LOW`(+`__MEDIUM`/`__HIGH`) 콤보 키를 만든다 → **이번 승격만** 풀린다
2. **기본 `OPENAI_API_KEY` 를 고친다** → 앞으로의 **모든** 승격에 대해 풀린다 ← 이쪽 권장

⚠ 세 프록시가 같은 구조라 **Anthropic·Gemini 도 승격 때 같은 방식으로 터질 수 있다.**
지금은 콤보 키가 덮고 있어서 안 보일 뿐이다.

**지금 상태는 안전하다** — 핀으로 `gpt-5.4` 에 되돌려 놓았고 대화는 HTTP 200 정상,
`safety_classify` 도 nano 그대로다.

### 활성 인프라 (변경분)

- `MODEL_REFRESH_APPLY` = **`true`** (이번 세션에 켬)
- `MODEL_PIN_OPENAI_FRONTIER` = **`gpt-5.4`** ← 위 문제가 풀리면 지울 것
- `EXPO_PUBLIC_CHAT_VENDOR=openai` — **실사용 검증 완료** (아래 C 참조)
- openai-proxy **v57 배포됨** (#1274 포함). claude/gemini-proxy 는 같은 수정이 소스에만 있고
  **미배포** — 그쪽 기본 키도 같은 결함일 수 있으나 콤보 키가 있는 한 안 터진다
- 나머지(Supabase 시크릿·GitHub Pages·엣지 배포 워크플로)는 그대로

---

### 다음 작업 큐 — **A 가 화면 이식이다**

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| **A** | **P5 — 화면별 이식** | large | ⭐ 토큰과 프리미티브가 다 섰다. 이제 화면이다 |
| B | 격자 밖 리터럴 크기 138곳 정리 | medium | A 의 일부로 같이 해도 된다 |
| C | 프록시 키 진단 하드닝 | small | `upstream_unreachable` 대신 `malformed_api_key` 로 (아래) |
| D | `GEMINI_API_KEY` 를 나이틀리 시크릿에 추가 | small | **Simon 몫** (키 필요) |

### A 를 시작하는 법

**진입점**: `src/components/pixel/` (프리미티브) + `src/lib/theme/m3.ts` (토큰).

```
1) 화면 하나를 골라 m3TextStyle 을 쓰는지 본다.
   쓰면 -> 타입은 이미 Galmuri 격자 위에 있다. 도형만 옮기면 된다.
   안 쓰면 -> 리터럴 fontSize 를 격자 여섯 값(10/12/15/24/30/45)으로 먼저 옮긴다.
2) 카드/버튼 면을 PixelSurface 로 바꾼다. 잘린 모서리가 생기는지 눈으로 확인.
3) 반투명이 필요한 자리는 PixelDither / PixelScrim. opacity 를 쓰지 말 것.
4) 누르는 것은 PixelPressable. 함수형 Pressable prop 금지(#680).
```

**⚠ 함정 5개 — 이걸 모르면 시간을 버린다**

1. **크기가 곧 서체다.** Galmuri 는 자기 고유 크기(9→10px · 11→12px · 14→15px)의
   **정수배에서만** 선명하다. 격자 밖 크기는 깨지지 않고 **흐려질 뿐**이라 리뷰에서 안 잡힌다.
   `typeface.ts` 의 `faceForSize` 가 크기에서 얼굴을 정한다.
2. **`m3.font.brand` 는 Galmuri14 가 아니라 Galmuri11 이다.** 이름만 보면 반대 같지만
   그 138곳은 실제로 본문이고 11~14px 이다. 바꾸지 말 것.
3. **굵기는 12px·24px 에서만 진짜다.** `galmuri` 패키지가 Bold 를 파는 얼굴은 Galmuri11 뿐이다.
   15/30/45/10px 역할에 700 을 주면 안드로이드에서 가짜 굵기나 시스템 폰트로 떨어진다.
4. **테두리를 `borderWidth` 로 그리지 말 것.** RN 은 모서리를 채워서 잘린 모서리 실루엣이
   사라진다. `PixelSurface` 를 쓰고, 직접 그려야 하면 막대 4개를 양 끝에서 `u` 만큼 물린다.
5. **디더 타일은 @2x/@3x 가 있어야 한다.** 없으면 RN 이 바이리니어로 늘려서 체커가 흐려진다 —
   **실기기에서만 보인다.**

**참조**: `docs/PIXEL-CLAY-MIGRATION.md`(SoT) · `design/pixel_clay_v4/REPO-NOTES.md`(착수 전 필독) ·
`design/pixel_clay_v4/app/px-bridge.css`(단 아래 "브리지가 틀린 곳" 참조)

**⚠ 브리지가 격자와 어긋나는 곳 4건.** `px-bridge.css` 는 크기와 서체를 따로 지정하는데
`headline-small`(24px on Galmuri14 = 1.6배) · `title-large`/`title-medium`/`body-large`
(15px on Galmuri11 = 1.25배)가 분수 배율이다. 번들 자신의 타입 토큰이 반대로 적고 있고
(`--t-lg /* Galmuri14 x1 */`), **격자가 이기게 했다.** 근거는 `m3.ts` 헤더 주석에 있다.

### C 를 시작하는 법 (작음, 이번 사고의 후속)

프록시가 키 모양을 검사해서 `500 server_misconfigured_malformed_api_key` + **시크릿 이름만**
(값은 절대) 돌려주게 한다. 지금은 같은 상황이 `502 upstream_unreachable` 로 나와서
**벤더 장애와 구분이 안 된다** — 이번에 그거 알아내는 데 30분 걸렸다.

### 이번 세션에서 확인된 것 (인용 가능)

- **대화 벤더 전환은 실증됐다.** 클라이언트 번들(`"openai"` 리터럴) · 배포 프록시 좌석 ·
  실호출 200 · 원장 `reasoning_vendor=openai` 네 겹 전부. 서버 소유 라우팅도 실증 —
  `effort:"max"` + 가짜 모델을 보냈는데 원장에 `low` / `gpt-5.4` 로 남았다.
- **`ai_audit_log` 에 gemini 아닌 행이 이번에 처음 생겼다.**
- 나이틀리 dry-run 의 "추론 좌석 9개" 라벨은 **틀렸다** — 전역 킬스위치라 13좌석 전부였다.
  #1272 이후로는 라벨대로 동작한다.

### 적용 중인 정책 (영구)

1. **보고는 항상 Artifact HTML** + 채팅엔 링크와 3~5줄 요약. 그림 최대한
2. CI 그린이면 자동 머지. **`main` 직접 push 금지 — 항상 PR**
3. 워크트리에서 작업. 정본 체크아웃 직접 편집 금지
4. **가드는 변이 검증까지** — 이번 세션 27/27. **그 중 2건이 아무것도 안 지키고 있었다:**
   정규식의 `\b` 가 셸 왕복에서 **실제 백스페이스 바이트**로 망가져 있었고, 다른 하나는
   주석만 남아도 통과하는 `toContain` 이었다. **변이 검증이 없었으면 둘 다 못 찾는다.**
   ⚠ 셸 heredoc 은 백슬래시를 먹는다. 정규식을 쓴 뒤 `grep -P '[\x00-\x1f]'` 로 확인할 것
5. **개수 핀 금지** — `expect(x.length).toBe(N)` 은 치환을 못 잡는다. 이름 목록으로
6. 브라우저는 이름으로 죽이지 않는다 — 내가 spawn 한 PID 만
7. `docs/flow-debugger.html` 은 자동 생성물. dirty 로 떠도 **커밋하지 말고 되돌린다**

### 결제 세션과의 경계

`src/lib/billing` · `src/lib/entitlements` · `db/migrations` · `docs/cowork-*.md` 는
**결제 세션 소유**다. 이번 세션은 그 중 아무것도 안 건드렸다. 다만 `src/app/subscription.tsx` 와
`src/screens/deepspace/dds-plans-screen.tsx` 의 **간격 토큰 한 줄씩**은 고쳤다(토큰 변경의
직접 결과 — 환불 확인 버튼 간격, 법적 링크 히트영역 겹침).

### 핵심 파일 위치

```
docs/PIXEL-CLAY-MIGRATION.md        시각 이주 SoT
design/pixel_clay_v4/REPO-NOTES.md  착수 전 필독
src/lib/theme/m3.ts                 토큰 (이름 M3 · 값 PIXEL-CLAY). 헤더에 격자 규칙
src/components/m3/typeface.ts       크기 -> 얼굴 리졸버
src/components/pixel/               프리미티브 (Surface · Dither · Pressable)
scripts/build-font-subsets.py       Galmuri 서브셋 레시피 (되살린 것)
scripts/build-dither-tiles.py       디더 타일 생성
scripts/refresh-models.ts           모델 최신화 (secretsFor 가 순수 함수)
```

### 검증

```bash
npm run verify    # 22단계 · 473 suites
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(P5 화면 이식)부터 시작.
# 단, Simon 이 OPENAI_API_KEY 를 고쳤는지 먼저 확인할 것 — 위 ⚠ 절 참조
```

---


## 2026-08-20 / 환불 경로 분리(0136) · 연간 결제 · Paddle 키 만료

> **새 세션은 이 블록을 먼저 읽을 것.** 그림 포함 상세 보고:
> <https://claude.ai/code/artifact/5c173f9e-8dae-43de-9fbe-a0ed70a0a5cb>
> 바로 아래 2026-08-20 블록(결정 14건)은 **화면 세션 몫**이고 그대로 유효하다. 이 블록은 **결제 세션 몫**이다.

### 이번 세션에 머지된 것

| PR | 무엇 |
|---|---|
| **#1265** | **`0136` 환불 경로 분리** — 팩 환불이 살아 있는 구독을 날리는 것을 막음 |
| **#1267** | 연간 결제가 화면에서 도달 불가하던 것을 이음 |
| **#1268** | `PADDLE_API_KEY` 만료일을 PR 없이 갱신 가능하게 |

- 테스트: `npm run verify` **그린**. CI 전부 초록(#1265 는 `sql` 드라이런 = `0001`부터 전체 체인)
- **마이그레이션 최댓값은 이제 `0136`. 다음 빈 번호는 `0137`.**

### ⚠ 번호가 바뀌었다 — `0138` 을 찾지 말 것

계획 문서들(0134 헤더, `docs/cowork-console-260820.md` §7)이 환불 분리를 **`0138`** 이라 불렀다.
**구매 경로보다 먼저 있어야 해서 다음 빈 번호인 `0136` 을 가져갔다.**

| 예고에서 부르던 이름 | 실제 |
|---|---|
| `0136` 구매 경로 | **`0137`(예정)** |
| `0137` 만료 크론 | **`0138`(예정)** |
| `0138` 환불 경로 분리 | **`0136` — 머지됨** |

### `0136` 이 실제로 고친 것 — 발주서보다 **한 건 많다**

세 함수가 전부 "그 사용자의 가장 최근 `transaction.completed`" 로 대상 결제를 고르는데,
`paddle_webhook_events` 에 price·product·sku·amount 컬럼이 **아예 없어서** 무엇을 산 결제인지
물을 방법 자체가 없었다.

1. **`claim_billing_self_service`** — Paddle 에 보낼 거래 id 를 고른다. **돈이 틀린다:**
   구독 환불을 신청했는데 크레딧 팩이 환불되고 구독은 계속 청구된다. **원래 발주서에 없던 항목이고
   셋 중 제일 나쁘다.**
2. **`refund_eligibility`** — 7일 창 + 사용량 게이트의 기준점. 팩이 **닫힌 환불창을 다시 연다.**
3. **`apply_billing_refund`** — 전액환불이면 무조건 `tier='free'`. **팩 환불이 구독을 날린다.**

판별자는 **원장 자신**이다(`credit_ledger` purchase lot 을 연 거래 = 일회성 상품).
**오늘 쪽으로 fail-open** — 팩이 0건인 현재 술어가 아무것도 안 걸러서 세 함수 동작이 이전과 같다.
9인자 시그니처 그대로라 **엣지 함수 재배포도 불필요**하다(0127/0130 함정 회피).

### ⚠ 구매 경로(`0137`)를 쓸 사람에게 — 문서보다 나쁘다

콘솔 문서는 "크레딧은 차감되니 기능은 되고 **잔액만 안 보인다**" 라고 적고 있는데 **실측은 더 나쁘다.**
화면이 `remaining <= 0` 이면 **실행 자체를 막는다** — `src/app/reasoning.tsx` 의 `depleted` 게이트가
`startRun` 을 즉시 반환시키고 한도 시트를 연다. 즉 **50개를 사도 쓸 수 없다.**
`getReasoningUsage` 가 `credit_available` 을 읽도록 **반드시 같이** 바꿀 것.

`0136` 이 정한 계약도 지켜야 한다: **`kind='purchase'` 의 `provider_event_id` = 거래 id.**
환불 adjustment 는 `{transaction_id, adjustment_id}` 밖에 안 실어 보낸다(조회는 두 방식 다 받아준다).

### Simon 대기 (콘솔)

| # | 무엇 | 비고 |
|---|---|---|
| 1 | **`0133`·`0134`·`0135`·`0136` 운영 적용** | 프로덕션 실측 **`0132`**. 전부 이것에 막혀 있다 |
| 2 | **Paddle 대시보드 2건** | 한국 결제수단 체크 · KRW 가격. **아직 회신 없음** |
| 3 | `gh variable set PADDLE_API_KEY_EXPIRES_AT --body 2026-11-08` | 안 하면 매주 이슈에 "미설정" 행이 붙는다 |
| 4 | (선택) `EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY` | 설정해야 연간이 화면에 뜬다. Paddle 연간가 = ₩99,000 |

---


## 2026-08-20 / 결정 14건 착지 완료 — 화면 작업(PIXEL-CLAY 2단계)이 그 세션의 다음 차례

### 어디까지 왔나

- main HEAD: `904f1c3a`
- 테스트: **469 suites / 4,070 tests 그린** (`npm run verify`, 22단계)
- working tree: clean · 열린 PR: 0건 (내 몫)
- ~~마이그레이션 최댓값: **`0135`** → 다음 번호는 `0136`~~
  ⚠ **정정(같은 날, 결제 세션): 그때 파일이 없었을 뿐이고 지금은 있다.**
  `db/migrations/0136_refund_path_split.sql` 이 #1265 로 머지됐다.
  **최댓값은 `0136`, 다음 빈 번호는 `0137`.** 이 줄을 근거로 `0136` 을 쓰면 충돌한다.

**이번 세션 머지 (코딩 세션 몫 17건)**

| PR | 무엇 |
|---|---|
| #1244 | 모델 승격 구멍 차단 — 추론 좌석 9개가 검색 전용 모델로 갈 뻔했다 |
| #1245 | **PIXEL-CLAY v4 채택** + 인수 자료 반입 (`design/pixel_clay_v4/`, 112파일) |
| #1246 | 설정 → 개발자 → 화면 전체 목록 (`/dev-screens`) |
| #1247 · #1249 | `CLAUDE.md`·`AGENTS.md` 낡은 사실 정정 + 테스트로 고정 |
| #1251 · #1255 | 캐논이 앱 라우트를 **전부** 안다 (58 → 111, `uncovered = []`) |
| #1252 · #1253 | 조사 헬퍼 + 가드 · PRD 어휘 20곳 |
| #1259 | **결정 14건 기록** (`docs/DECISIONS-260820.md`) |
| **#1263** | **PIXEL-CLAY 토큰 층 1단계** — 라운드 0 · 그림자 제거 · 계단 모션 · midnight |
| #1260 · #1262 · #1264 | 알림 시각 선택 · 대화 저장 안내 · 코드 한국어 분류 가드 |

결제 세션(별도)이 같은 기간에 #1248 #1250 #1256 #1258 #1261 #1265 #1267 을 넣었다.

### 활성 인프라

- Supabase: `SUPABASE_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN` 는 **repo secrets**.
  엣지 배포는 `.github/workflows/deploy-edge-function.yml` (workflow_dispatch)
- 웹: GitHub Pages (`baseUrl: /2nd-B`). **Vercel 아님**
- 개발자 화면을 폰에서 보려면: `gh workflow run web-deploy.yml -f allow_dev_tier=true`
- 대화 벤더: `EXPO_PUBLIC_CHAT_VENDOR=openai` (플립됨, **실사용 검증 미완**)

---

### 다음 작업 큐 — **A 가 화면 작업이다**

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| **A** | **PIXEL-CLAY 토큰 층 2단계 — 간격 + 타입 + 폰트** | large | ⭐ **화면이 실제로 픽셀아트가 되는 단계.** 1단계는 라운드·색만이라 아직 M3 골격이다 |
| B | 화면별 도형·디더 프리미티브 | large | A 다음. 정수 `rect` · 디더 타일 · press translateY |
| C | 대화 벤더 전환 실사용 검증 | small | QA 계정으로 대화 1건 → `ai_audit_log` 확인 |
| D | `MODEL_REFRESH_APPLY` 켜기 | small | #1244 가 선행 조건을 닫았다 (콘솔 몫) |

### A 를 시작하는 법 — 읽어야 할 것과 함정

**진입점**: `src/lib/theme/m3.ts` 의 `m3Spacing` · `m3Type` · `m3Font`.

```
1) src/lib/theme/__tests__/m3.test.ts 의 "아직 안 바꾼 것" 블록을 연다.
   그 블록이 지금 `m3Spacing.s1 === 4` 를 박아두고 있다 —
   **그걸 깨는 것이 2단계의 시작 신호**다. 깨고 나서 블록을 지운다.
2) 목표값: --u = 2px (Simon 결정 P1)
   s1=2 · s2=4 · s3=6 · s4=8 · s5=10 · s6=12 · s8=16
   타입: Galmuri 10/12/15/24/30/45px 만 (PRD §2-4)
3) 폰트 3종 추가 (P3): Galmuri14 · Galmuri9 · GalmuriMono11
   Galmuri11 은 **이미 있다** (assets/fonts/, typography.ts:48-51, OFL 고지 완료).
   원본은 이미 쓰는 `galmuri` npm 패키지. **서브셋 범위와 번들 크기를 먼저 잴 것**
   (.ttf 가 2.5MB).
```

**⚠ 함정 4개 — 이걸 모르면 시간을 버린다**

1. **간격과 타입은 반드시 함께 간다.** 간격만 절반으로 줄이고 16px 본문을 두면
   화면이 조이기만 한다. 이게 1단계에서 멈춘 이유다.
2. **인수 스크린샷 12장은 실제 폰의 두 배 크기다.** `--u:4px`(데스크톱 창)에서 찍혔다.
   2px 로 만들면 시안보다 촘촘하게 보이는 것이 **정상**이다. 시안이 틀린 게 아니다.
3. **`m3.*` 이름을 바꾸지 말 것.** 35개 파일이 `StyleSheet.create` 안에서 모듈
   스코프로 읽는다(`check:cycles` 가 무관용인 이유). **값만** 갈아끼운다.
4. **캐논 토큰은 앱 토큰과 안 묶여 있다.** 이전 문서의 "같은 PR 이어야 한다" 는
   **틀린 경고였다**(#1263 에서 정정). `canon-tokens.test.ts` 는 rev2 프로토타입
   미러를 자기 자신하고만 대조한다.

**참조**: `docs/PIXEL-CLAY-MIGRATION.md`(SoT) · `design/pixel_clay_v4/REPO-NOTES.md`(**착수 전 필독**) ·
`design/pixel_clay_v4/app/px-bridge.css`(웹판 브리지 — 매핑을 지어내지 말고 이걸 따를 것)

### Simon 대기 — **없다**

- **C2 완료 (2026-08-20).** age 개인키가 KeePass 에 보관돼 있음을 Simon 이 확인했다.
  ⚠ **키 값을 요청하지 말 것.** 비대칭이라 백업(암호화)에는 공개키만 쓰고,
  개인키는 복원 드릴 때 Simon 이 로컬에서 직접 넣는다. 런북이 못박아 뒀다 —
  "레포 안에 두지 않는다. 값을 채팅·로그·커밋에 남기지 않는다"
  (`docs/DB-RESTORE-RUNBOOK.md:16`).
- **D2 해결됨** — 결제 세션이 #1267 로 연간 결제 도달 문제를 고쳤다.

### 적용 중인 정책 (영구)

1. **보고는 항상 Artifact HTML** + 채팅엔 링크와 3~5줄 요약. 그림 최대한
2. CI 그린이면 자동 머지. **`main` 직접 push 금지 — 항상 PR**
3. 워크트리에서 작업. 정본 체크아웃 직접 편집 금지
4. **가드는 변이 검증까지** — 일부러 깨뜨려 그 가드가 발화하는지 확인하고 PR 에 적는다
   ("100% 나오게 설계한 실증은 무효")
5. **개수 핀 금지** — `expect(x.length).toBe(N)` 은 치환을 못 잡는다. 이름 목록으로
6. 브라우저는 이름으로 죽이지 않는다 — 내가 spawn 한 PID 만
7. `docs/flow-debugger.html` 은 자동 생성물. dirty 로 떠도 **커밋하지 말고 되돌린다**

### 결제 세션과의 경계

`src/lib/billing` · `src/lib/entitlements` · `db/migrations` · `docs/cowork-*.md` 는
**결제 세션 소유**다. 건드리지 말 것. 그쪽은 지금 A1=D(Paddle 한국 결제수단) 실행 중.

### 핵심 파일 위치

```
docs/DECISIONS-260820.md            결정 14건 정본
docs/PIXEL-CLAY-MIGRATION.md        시각 이주 SoT
design/pixel_clay_v4/REPO-NOTES.md  착수 전 필독 — 어긋나는 곳 6건 + 함정 5건
src/lib/theme/m3.ts                 토큰 (이름 M3 · 값 PIXEL-CLAY)
src/lib/theme/__tests__/m3.test.ts  2단계 시작 신호가 여기 있다
src/lib/dev/screen-index.ts         앱 화면 97개 전수 (캐논과 이름 대조됨)
src/lib/i18n/__tests__/korean-in-code.test.ts   한국어=카피 vs 규칙 분류표
```

### 검증

```bash
npm run verify    # 22단계 · 469 suites / 4,070 tests
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(토큰 층 2단계 — 간격+타입+폰트)부터 시작
```

---


## 2026-08-20 / 한국 결제 방향 확정 + 크레딧 원장 0134·0135 랜딩

> **새 세션은 이 블록을 먼저 읽을 것.** 상세 근거: `docs/cowork-reply-260819.md`,
> 콘솔 큐: `docs/cowork-console-260820.md`

### 어디까지 왔나

- main HEAD: `a227f9a5`
- 이번 세션 머지된 PR (전부 `Simon-YHKim/Cowork-Cowork`):
  - **#1250** `feat(billing)` — 한국 결제 회신 + `0133` 한 사용자=한 결제사 + 죽은 페이월 버튼 수정
  - **#1256** `feat(credits)` — `0134` 크레딧 원장 (inert)
  - **#1258** `feat(credits)` — `0135` 크레딧 이관 (원장 + 카운터 미러)
- 테스트: `npm run verify` **466 suites / 4046 tests 그린**. CI 전부 초록(`sql` 드라이런 포함)
- working tree: `docs/flow-debugger.html` 1개 dirty — **훅이 생성하는 파일이고 내 변경이 아니다.** 건드리지 말 것

### 이번 세션에서 뒤집힌 것 (인용 금지 목록)

**❌ "카카오페이·네이버페이 정기결제는 토스로 해야 한다"** → 반대다.
**Paddle 이 2025-11-19 부터 카카오페이·네이버페이 정기결제를 지원한다.** 토스는 카카오페이
정기결제를 **못 준다**(공식 FAQ 명시). 토스로 옮기면 원하던 걸 얻는 게 아니라 잃는다.

**❌ "네이티브에도 상점을 넣는다"** → **2026-08-20 Simon 정정: 네이티브 X.**
"면제 의도 포기 아니야. 포기하면 안돼." Apple 3.1.3(f) 면제(앱 안에 구매도 구매 유도도 없을 것)를
**자산으로 지킨다.** 상점은 **웹 표면에만**. IAP 불필요, RevenueCat 은 키 없는 scaffold 로 유지.

**❌ "billing 에 isMinor 게이트가 없다 = 뚫린 구멍"** → 2026-08-16 Simon 결정(G1)대로
**차단 대신 고지**이고 고지 카드가 실제로 붙어 있다(`dds-plans-screen.tsx:345-353`).

**❌ "2026-12-31 에 외부 웹링크가 열린다"(어디에도 없다는 뜻으로 읽히면)** → 링크아웃은
**미국·EEA·영국·일본에 이미 있고 한국에만 없다.**

### 확정된 결정 (Simon, 2026-08-19~20)

| 질문 | 답 |
|---|---|
| 결제사 방향 | **Paddle 먼저 켜고, 토스는 그 다음** |
| 한 사용자 = 한 결제사 DB 강제 | **강제** → `0133` |
| 죽은 페이월 버튼 | **지금 고침** → #1250 |
| 크레딧·상점 | **전부 구현.** 남의것 불가 · **웹에만** · 유효기간 표준 준수 |

### 활성 인프라

- Supabase `zoacryukmdeivmolvyhj` — **`0133`·`0134`·`0135` 운영 미적용** (콘솔 작업)
- 마이그레이션 최댓값 `0135`. 다음은 `0136`. (중복 `0092`/`0113`/`0117` 은 기존 이력)
- `PADDLE_API_KEY` **2026-11-08 만료**, `Last used` = `-` (한 번도 안 쓰임 — 고장 아님, fail-closed)
- ASC App ID `6792266942` (iOS 0.1.0 "Prepare for Submission", 미출시)
- Play Alpha 트랙 `4699963527811527343`, KR 단독, 미출시

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **콘솔: `0133`·`0134`·`0135` 운영 적용** + Paddle 대시보드 확인 | small | ⭐ **전부 이것에 막혀 있다.** `docs/cowork-console-260820.md` |
| B | **`0138` 환불 경로 분리** — 아래 ⚠ 참조. `0136` 보다 **먼저** | medium | ⭐ 지금 실재하는 잠재 결함 |
| C | `0136` 구매 경로 (**웹 Paddle 만**) + **클라이언트 읽기 변경** | large | B 이후 |
| D | `PADDLE_API_KEY` 만료 감시 (Simon 승인 대기) | small | 결정 불필요, 시작 허가만 |
| E | 연간 결제가 UI 에서 도달 불가 (`dds-plans-screen.tsx:310-313` 이 cadence 미전달) | small | 별건 |

⚠ **B 를 C 보다 먼저 해야 하는 이유.** `refund_eligibility` 가 "가장 최근
transaction.completed"로 환불창을 잡는데 **상품을 구분하지 않는다.** 크레딧 구매가 생기는 순간
₩4,900 팩이 ₩9,900 구독의 환불 기준점이 되고, `apply_billing_refund` 의 전액환불이
`tier='free'` 로 등급을 회수하므로 **팩 환불이 살아 있는 구독을 날린다.** 지금은 일회성 상품이
없어 안 터진다.

⚠ **C 는 서버만으로 안 끝난다.** `0135` 의 미러가 `reward_credits` 를
`credit_ad_earned_this_month`(**광고분만**)로 재유도하므로 **구매 크레딧은 `usage_counters` 에
안 나타난다.** 클라이언트는 그 컬럼만 읽으므로 **50개를 사도 "0 남음"이 뜬다.**
`getReasoningUsage` 가 `credit_balance`/`credit_available` 를 읽도록 같이 바꿔야 한다.

### 적용 중인 정책 (영구)

1. **CI 그린이면 자동 머지.** PR 필수, main 직접 push 금지.
2. **마이그레이션 번호는 쓰기 직전에 `origin/main` 최댓값 +1 로 재확인**하고 즉시 브랜치 push.
3. **엣지 함수 배포가 변수 플립보다 먼저.** `0127`/`0130` 함정.
4. **새 `SECURITY DEFINER` 함수는 같은 파일에서 `REVOKE ... FROM anon, authenticated` 필수.**
   Supabase 가 생성 즉시 auto-grant 한다. `check:definer-grants` 가 강제하지만 파일별 정규식이라
   놓칠 수 있으니 시그니처별로 명시할 것.
5. **`service_role` 판정은 `billing_request_role()` 로만.** 인라인 `current_setting` 금지(0112 사고).
6. **로컬 DB 가 없다.** 마이그레이션 실증은 PR 의 `sql` 드라이런(0001~최신 전체 체인)이 유일하다.
   이번 세션에 실제로 결함을 잡았다(`CREATE OR REPLACE VIEW` 컬럼 개명 거부).
7. **Simon 보고는 Artifact HTML.** 채팅엔 링크 + 요약만.

### 핵심 파일 위치

```
db/migrations/0133_billing_provider_ownership.sql   한 사용자 = 한 결제사
db/migrations/0134_credit_ledger.sql                크레딧 원장 (inert)
db/migrations/0135_credit_cutover.sql               이관 + 카운터 미러 + freeze
db/migrations/rollback/0135_down.sql                수동 롤백 (번호 글롭 밖)
docs/cowork-reply-260819.md                         한국 결제 근거·행번호 정본
docs/cowork-console-260820.md                       콘솔 작업 큐
src/lib/payments/purchases.ts                       RevenueCat scaffold (구독 모델, 소모품엔 틀림)
src/screens/deepspace/dds-plans-screen.tsx          페이월 (canPurchase 로 죽은 CTA 차단)
```

### 검증

```bash
npm run verify
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A(콘솔 적용 확인) → B(0138) 순서로
```

---


## 2026-08-20 / 결정 14건 확정 + **코딩 세션 몫 전부 착지**

> 결정 전문: `docs/DECISIONS-260820.md`

### 이번에 머지된 것

| PR | 무엇 |
|---|---|
| #1259 | 결정 14건 기록 |
| **#1263** | **PIXEL-CLAY 토큰 층 1단계** — 라운드 0 · 그림자 제거 · 계단 모션 · midnight |
| #1260 | 알림 시각 사용자 선택(B3) + `digest_weekly` 미사용 표기(B2) |
| #1262 | 대화가 안 남는다는 안내 한 번(B1) |
| #1264 | 코드 속 한국어를 카피/규칙으로 분류 + 가드(B4) |

**P1~P5 · B1~B4 전부 처리됐다.** A1~A3 은 결제 세션 소유, C1 보류, C2 는 Simon.

### ⚠ 다음 세션이 알아야 할 것 4가지

1. **토큰 층은 1단계까지다.** 라운드·깊이·모션·색만 바꿨고 **간격과 타입은 그대로**다.
   그 둘은 레이아웃 치수를 바꾸므로 **함께** 가야 한다 — `--u:2px` 격자는 간격을
   절반으로 만들고 타입도 10~15px 로 내린다. 간격만 줄이면 화면이 조이기만 한다.
   `src/lib/theme/__tests__/m3.test.ts` 의 **"아직 안 바꾼 것"** 블록이 그 사실을
   박아뒀다 — **그 테스트가 깨지는 날이 2단계를 시작하는 날**이다. 폰트 3종(P3)도 같은 단계.
2. **`--u` = 2px 라 인수 스크린샷과 달라 보인다.** 그 12장은 4px(데스크톱 창)에서
   찍혔다 — **시안이 실제 폰의 두 배였던 것**이지 시안이 틀린 게 아니다.
   되돌리려면 `m3Spacing` 상수 하나.
3. **"코드에 박힌 한국어 2,553줄" 은 틀린 숫자다.** 꼬리 주석(`// 별자리`)을 세고
   매칭 규칙과 카피를 안 나눈 결과다. 실제 사용자 대면 하드코딩은 **하나**(InlineLoader
   접근성 라벨)였고 고쳤다. 나머지는 번역하면 **앱이 고장 나는** 것들이라
   `korean-in-code.test.ts` 에 **이유와 함께 면제**돼 있다.
4. **캐논 토큰은 앱 토큰과 안 묶여 있다.** 전에 "토큰을 바꾸면 캐논과 같은 PR 이어야
   한다"고 적었는데 **틀렸다** — `canon-tokens.test.ts` 는 rev2 프로토타입 미러를
   자기 자신하고만 대조한다. 진짜 결합부는 `theme/__tests__/m3.test.ts` 다.

> **새 세션은 이 블록을 먼저 읽을 것.** 전문: `docs/DECISIONS-260820.md`

Simon 이 결정 콘솔에서 **14건 전부** 골랐다. 이주를 막던 D1 도 풀렸다.

| | 결정 |
|---|---|
| **이주 (P1~P5)** | `--u` = **2px** · 팔레트 교체 **안 함** · Galmuri **3종 추가** · 디더 = **타일 이미지** · **토큰 층부터** |
| **제품 (B1~B4)** | 대화 저장 **한 번 안내** · `digest_weekly` **보류** · 알림 시각 **사용자 선택** · **코드 박힌 한국어 i18n 이동** |
| **결제 (A1~A3)** | **Paddle 한국 결제수단 켜기** · 소유권 **DB 강제** · 법률문서는 **A1 후 정리** — 전부 결제 세션 소유 |
| **비용 (C1~C2)** | 유출 비밀번호 차단 **보류**(Pro 플랜) · age 키 확인은 Simon |

### ⚠ 착수 전에 알아야 할 것 3가지

1. **`--u` = 2px 라 인수 스크린샷과 달라 보인다.** 그 12장은 `4px`(데스크톱 창)에서 찍혔다.
   시안이 틀린 게 아니라 **실제 폰의 두 배로 찍혀 있었던 것**이다. 되돌리려면 상수 하나.
2. **토큰을 바꾸면 캐논도 같이 바꿔야 한다.** `canon-tokens.test.ts` 가 현행 M3 팔레트 값을
   박아두고 있어서 **같은 PR** 이어야 한다.
3. **`m3.*` 이름은 유지한다.** 35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로 읽으므로,
   값만 갈아끼워야 그 파일들을 안 건드린다(번들의 `px-bridge.css` 가 웹에서 하는 일과 같다).

---


## 2026-08-19 / Simon 회신 도착: V1~V5 확정 · 인수 자료 반입 · 개발자 화면 목록

> **새 세션은 이 블록을 먼저 읽을 것.** 어제 "회신 대기" 로 막혀 있던 것이 전부 풀렸다.
> 아래 이전 블록(2026-08-18)은 **역사 기록**이다 — "Simon 회신 대기" 서술을 인용하지 말 것.

### 이번 세션에 머지된 것

| PR | 무엇 |
|---|---|
| **#1244** | `refresh-models.ts` — 추론 좌석 9개가 검색 전용 모델로 승격될 구멍을 닫음 |
| **#1245** | PIXEL-CLAY v4 채택 + 인수 자료 반입 (`design/pixel_clay_v4/`) |
| **#1246** | 설정 → 개발자 → 화면 전체 목록 (`/dev-screens`) |
| **#1247** | `CLAUDE.md` 낡은 "1순위 결함" 정정 + V1~V6 결정 기록 |
| **#1249** | `AGENTS.md` 포인터화(사본이라 따로 낡아 있었다) + 정정 사실을 테스트로 고정 |
| **#1251** | 캐논이 두 방향 격차를 다 말할 수 있게 + **`check:canon-data` 를 verify 에 편입** |
| **#1252** | 조사 헬퍼(ㄹ 예외 포함) + 하드코딩 조사 유입 차단 가드 |
| **#1253** | PRD 어휘 정책 20곳 적용 (말투는 앱의 합쇼체 유지) |
| **#1254** | `/mbti` 주석 정정 |
| **#1255** | **앱 라우트 53개를 캐논에 등록 — `uncovered` 가 비었다** |

### 결정 결과 (`docs/DECISIONS-260819.md` 가 전문)

- **V1 시각 방향 = PIXEL-CLAY v4.** SoT `docs/PIXEL-CLAY-MIGRATION.md`.
  **착수 전에 `design/pixel_clay_v4/REPO-NOTES.md` 를 읽을 것** — 받은 문서와 저장소가
  어긋나는 곳 6건 + 이식 함정 5건이 실측으로 적혀 있다. 이주는 **미착수**.
- **V2 7번째 별 = 프로필.** 캐논·코드가 이미 그렇다. 바꿀 것 없음.
  의견(개발자 화면 진입)은 `/dev-screens` 로 구현됨.
- **V3 캐논을 현실에 맞춰 갱신.** 이번엔 미커버 핀을 개수 → **이름 목록**으로 바꿨다.
  52개를 실제 등록하는 일은 남았다.
- **V4 전부 가져온다.** 미착수. ⚠ "어휘 47곳" 은 47개 용어가 아니라 **47개 치환 지점**,
  실제 쌍은 11개다.
- **V5 세 이름 + 상태 배지.** cosmic-pixel(폐기) / M3-deepspace(현행) / PIXEL-CLAY v4(채택).
- **V6 7건 — 실측 완료, Simon 판단 대기.** 두 건은 **전제가 틀려 있었다**(D1 연결선은
  이미 그려지고 있고, D2 자동저장은 이미 있다). D5 는 이미 코드에 결정돼 있다.

### ⚠ 새 세션이 알아야 할 정정 3건

1. **`CLAUDE.md` 의 "대화가 위키에 아무것도 안 쓴다 = 1순위 결함" 은 낡았다.**
   #1236(2026-08-18)이 고쳤다. `src/lib/chat/autosave.ts` + `secondb.tsx:520-556,675-687`.
   기본값은 OFF(`chat_autosave`)이고 그건 의도다.
2. **북두칠성→북극성 연결선은 화면에 그려지고 있다.** `ConstellationHome.tsx:85,646`.
   `canonPolarisGuide` **상수**를 읽는 코드가 0건인 것이지 선이 없는 게 아니다.
   문제는 "안 그린다"가 아니라 **"캐논과 따로 논다"**.
3. **앱 라우트 수는 99 가 아니라 97 이다.** 캐논 58 · 프로토타입 92 는 각각 다른 것을 센다.

### 남은 것

**Simon 판단**: V6 7건 · PIXEL-CLAY 이식 결정 D1~D5(특히 D1 `--u` 를 4px 로 고정할지) ·
`auth_leaked_password_protection`(**Pro 플랜이 필요하다 — 콘솔 토글이 아니다**) ·
age 개인키 KeePass 백업.

**코딩 세션**: 큐가 **비었다.** V3·V4 · `gate` 레이아웃 · 조사 헬퍼 · 캐논 등록까지
전부 착지했다(#1251~#1255).

캐논은 이제 **앱의 모든 라우트를 안다**(58 -> 111, `uncovered` 가 빈 집합).
`src/app` 에 화면을 추가하고 캐논에 등록하지 않으면 CI 가 막는다.

⚠ **appOnly 화면은 `layout` 을 선언하지 않는다.** 프로토타입의 렌더링 계약 필드인데
그 화면들은 프로토타입에 없기 때문이다. 렌더 체인에서 뽑으려다 53개 중 35개가 `gate` 로
나오는 오판을 했다 — 라우트 파일의 첫 `return <X` 가 로딩 분기이거나 `DevOnlyRoute`
래퍼라서다. **채우고 싶어지면 그 함정을 먼저 기억할 것.**

앱 화면 이름은 `screens.json` 과 `src/lib/dev/screen-index.ts` **두 곳에 있고 가드가
둘을 묶는다.** 한쪽만 고치면 `canon.test.ts` 가 깨진다.

**콘솔**: `MODEL_REFRESH_APPLY` 켜기(#1244 가 선행 조건을 닫았다) ·
대화 벤더 전환 실사용 검증(QA 계정으로 대화 1건 → `ai_audit_log` 확인).

---


## 2026-08-18 / 캐논이 앱에 대해 검증 가능한 주장을 하게 만듦 + 두 PRD 대조 (회신 도착 — 위 블록 참조)

> **새 세션은 이 블록을 먼저 읽을 것.** Simon 이 두 가지를 들고 온다:
> ① 아래 **"결정 콘솔 V1~V6"** 에 대한 회신(`# PRD 대조 회신 (2026-08-18)` 형식)
> ② **Claude Design 쪽 상세 PRD** 추가분.
> 그 둘이 오기 전에는 **렌즈·시각 방향·7번째 별에 손대지 말 것.** V1 이 나머지를 막고 있다.

### 어디까지 왔나

- main HEAD(작업 시작 시점): `14e0767c`
- 이번 세션 머지된 PR: #1229 #1230 #1231 #1233 #1234 #1236 #1237 #1239 #1240 #1241
- 이 블록의 작업(캐논 개선)은 별도 PR — 아래 "이번 변경" 참조
- 테스트: 캐논 스위트 18/18, 전체 `npm run verify` 그린

### 이번 변경 — 캐논 개선 (근거 실측 기반)

**출발점이 된 발견 4가지 (전부 실측):**

1. **캐논 화면 등록부는 앱에 대해 아무 주장도 하지 않았다.** `screens.json` 58개 항목에
   `route` 키가 **0개**였다. `component` 는 프로토타입의 `window[component]` 심볼이라
   **프로토타입 기준으로는 실재**하지만(→ `sb-*.jsx`), RN 심볼이 아니다.
   `canonScreens` 를 실제로 쓰는 앱 코드는 `src/app/canon.tsx`(개발자용 목록) **하나뿐**.
   나머지 12개 파일은 `canonCareerInput` 같은 **콘텐츠 팩**만 쓴다 — 그건 진짜로 화면에 뿌려진다.
   ⚠ 그래서 "캐논이 앱을 고정한다"는 **콘텐츠 팩에만 참**이었다.
2. **캐논 데이터가 두 벌인데 동기화 장치가 0.**
   `design/proto_rev2/reference-app/data/` (문서상 정본) 와 `public/proto/data/`
   (`src/lib/canon` 이 **실제로 import** 하는 곳). 33개 JSON 이 HEAD 기준 전부 동일했지만
   순전히 손으로 맞춰온 것. 문서상 정본만 고치면 **앱에 안 닿는다.**
3. **유휴 검증기.** `design/proto_rev2/tools/validate-data.mjs` 가 존재하고 `exit 1` 도
   제대로 하는데 **package.json·CI 어디에도 연결돼 있지 않았다.**
4. **`CLAUDE.md` 가 가리키는 `reference-app/README.md` 가 없었다.**

**한 것:**

| 변경 | 내용 |
|---|---|
| `route` 필드 신설 | 58개 전부. **46 매핑 · 12 `null`**(프로토타입 전용). 매핑은 전부 라우트 모듈 헤더를 읽어 확인 — 이름 유추 없음 |
| 미러 동기 | 패치를 `public/proto/data/` 에 복사 (두 벌 md5 일치 확인) |
| `CanonScreen.route` | `string \| null` 필수 필드. `canonRoutedScreens()` / `canonUnroutedScreens()` 추가 |
| 가드 5종 | route 명시 · 파일 실재 · 라우트 중복 금지 · 프로토타입 전용 12개 고정 · 미커버 앱 라우트 **51 핀** |
| 미러 가드 | `canon-mirror.test.ts` — 두 트리 파일목록·내용 동일 (파싱 후 비교라 포맷·줄바꿈은 오탐 안 남) |
| `check:canon-data` | npm 스크립트 신설 (validate-data.mjs) |
| README | `design/proto_rev2/reference-app/README.md` 신설 |

**확정된 매핑 중 이름으로는 못 맞히는 것들** (새 세션이 다시 조사하지 말 것):
`home→index` · `chat→secondb` · `me→core-brain` · `peer→seen` · `ratify→ratifications` ·
`callrec→call-reflection` · `trend→trends` · `share→share-card` · `hobbyinput→rest` ·
`drilldown→career-drilldown` · `relperson→people` · `connect→integrations` ·
`auth→(auth)/sign-in` · `pwreset→(auth)/reset-password` · `profilesetup→(auth)/complete-profile`

**프로토타입 전용 12개(`route: null`)**: audit-full, datareview, dobgate, domains, exhibit,
healthdata, healthinput, lifeinput, relcontacts, reward, triage, widget.
→ 이건 결함이 아니라 **일부러 보이게 둔 격차**다. 화면을 만들면 route 를 채우고 핀을 내린다.

**변이 검증 6/6 통과** (Simon 규칙: 100% 나오게 설계한 실증은 무효):
route 를 없는 파일로 · route 키 삭제 · 두 화면이 한 route · 격차를 몰래 메움 ·
캐논 미등록 화면 추가 · public 만 드리프트 → **전부 해당 가드가 정확히 발화**.

### ⚠ 남은 열린 에러 1건 — 임의로 고치지 말 것

```
npm run check:canon-data
ERROR component not window-exported anywhere: ProfileScreen (screen profile)
```

**진짜다.** 캐논의 7번째 별은 `profile`(Alkaid)인데 **프로토타입에 `ProfileScreen` 이 없다.**
그래서 `check:canon-data` 를 **`verify` 에 넣지 않았다** — 오늘 넣으면 코드 결함이 아니라
디자인 격차로 CI 가 빨개진다. **V2(7번째 별) 가 정해지면 그때 verify 에 편입한다.**

### 두 PRD 대조 결과 (Claude Design PRD ↔ 저장소 캐논)

보고서: <https://claude.ai/code/artifact/cddd820b-3ce5-4564-8117-8721082ba35c>

**일치 7건** — 캔버스 390×820 · 하단 탭 5개와 순서 · propose→ratify · 한 화면 한 메시지 ·
위기 우선/무저장/무차감 · 근거 제시 · 44px 터치. 싸우는 문서가 아니다.

**충돌 3건**

1. **시각 계약이 정반대.** 폰트(Galmuri↔Pretendard) · 라운드(0↔24) · 불투명도(디더↔rgba) ·
   이징(steps()↔M3곡선) · 도형(정수rect↔자유) · 블러(금지↔elevation) — 여섯 항목 전부 반대.
   중간값 없음. `CLAUDE.md:374` 가 승인된 이주 델타로 **"Galmuri/Press Start → Pretendard"** 를
   적어놨고 `EXPO_PUBLIC_UI=legacy` 가 롤백. **단 PIXEL-CLAY v4 는 폐기된 cosmic-pixel 과
   같은 물건이 아니다** — 새로 설계된 체계라 "레거시니까 버린다"로 끝낼 수 없다.
   Claude Design PRD §21 도 스스로 "Simon 비준 대기"라고 적어뒀다.
2. **7번째 별.** Simon D2(2026-08-18) = **개인 프로필**(구현·머지 완료, `/profile` +
   `/profile-details`). 캐논 `constellation.json` 도 `profile`(Alkaid). **Claude Design PRD
   §5-2 는 커뮤니티 포탈.** PRD 가 D2 이전에 쓰인 것으로 보인다.
3. **화면 개수 정본이 셋.** 캐논 58(프로토타입 화면 수) · 실제 앱 라우트 **99**
   (`_`/`+` 제외) · 프로토타입 92 주장.
   ⚠ **이전 보고서에서 "앱 101"이라고 쓴 것은 부정확** — `_layout`/`+html`/`+not-found`
   포함 수였다. 실제 화면 라우트는 99.

**Claude Design PRD 에서 가져와야 할 것** (시각 방향과 무관하게 유효):
어휘 정책 47곳(비준→확인 등) · "당연한 것은 쓰지 않는다" · 조사 자동 판정(숫자는 읽는 소리,
한글은 종성) · 위기 화면 톤 규칙(위험색·경고 아이콘·애니메이션 금지) · 유효성 검사 순서 =
화면 순서 · 환불 자격 없음도 산수와 함께 · **`gate` 레이아웃**(인증·가입처럼 폰 크롬 없는 화면 —
캐논은 레이아웃 3종 고정이라 담을 자리가 없다).

### Simon 회신 대기 — 결정 콘솔 V1~V6

| ID | 질문 | 내가 추천한 것 | 막고 있는 것 |
|---|---|---|---|
| **V1** | 시각 방향 PIXEL-CLAY vs M3 | M3-deepspace 유지 + PIXEL-CLAY 규율만 흡수 | **전 화면** |
| **V2** | 7번째 별 프로필 vs 커뮤니티 | 프로필 유지(D2대로) | 홈·캐논·`check:canon-data` verify 편입 |
| **V3** | 캐논 58 vs 앱 99 | 캐논을 현실에 맞춰 갱신 | 등록 계약 |
| **V4** | CD PRD 에서 지금 가져올 것 | 전부 | 카피·폼 규칙 |
| **V5** | 레거시 이름 규칙 | `cosmic-pixel`(폐기)/`PIXEL-CLAY v4`(후보)/`M3-deepspace`(현행) 로 갈라 부르고 "픽셀" 단독 사용 금지 | 세션 간 혼선 |
| **V6** | 나머지 미결 7건 | V1 먼저, 순차로 | — |

나머지 미결 7건: 북두칠성→북극성 연결선 시안 · 대화 자동저장 기본값(현재 OFF 출시) ·
MBTI 화면 부활 여부(D5 "나중에") · `digest` 이름 혼동(주간 vs 오늘) · 밝기 L1~L5 계산 기준 ·
알림 정책 · EN 카피 착수 시점.

### 콘솔(cowork) 대기 — 코드로 못 하는 것

1. **`pixel-app/2nd-Brain.html` 실측 캡처** — 이 저장소에 없어서 **실제 화면을 한 장도 못 봤다.**
   V1 비준하려면 두 방향을 나란히 봐야 한다. 인계 프롬프트는 위 아티팩트 §10 에 복사 버튼으로 있음.
   확인할 것: 7번째 별이 커뮤니티인지 프로필인지 · 실제 라우트 수 · Galmuri 실렌더 여부 ·
   border-radius 정말 전 화면 0 인지.
2. **`0132` 마이그레이션 prod 적용** (`users.profile_details jsonb`). **미적용이다** —
   `/profile-details` 저장이 에러 토스트로 실패하는 것을 실측 확인함(화면은 안 깨짐).
3. **`auth_leaked_password_protection` 켜기.**
4. **openai-proxy 재배포 → 그 다음에** `EXPO_PUBLIC_CHAT_VENDOR=openai` 플립.
   ⚠ **순서 뒤집으면 대화가 전부 실패한다** (허용목록 밖 purpose 를 `400 purpose_not_seated` 로 자름).

### Simon 소유 (외부)

벤더 API 키 + `SUPABASE_ACCESS_TOKEN` 시크릿 등록 · 스크래치 프로젝트
`ejhkatsgdjfriarlthdv` 삭제 · age 키 KeePass 보관 · 북두칠성→북극성 연결선 디자인 방향.

### 적용 중인 정책 (영구)

1. Simon 보고는 **항상 Artifact HTML** + 채팅엔 링크와 3~5줄 요약만. 그림 최대한.
2. CI 그린이면 자동 머지. 단 `main` 직접 push 금지 — 항상 PR.
3. 워크트리에서 작업. 정본 체크아웃(`E:\2ndB`) 직접 편집 금지.
4. 검증 실증은 **변이 테스트로 가드가 무는지 확인**해야 유효 (100% 나오게 설계한 실증은 무효).
5. 브라우저는 이름으로 죽이지 않는다 — 내가 spawn 한 PID 만.

### 핵심 파일 위치

```
design/proto_rev2/reference-app/          캐논 정본 (JSON 33 + sb-*.jsx 프로토타입)
design/proto_rev2/reference-app/README.md 캐논이 무엇이고 무엇이 아닌지 (이번에 신설)
design/proto_rev2/tools/validate-data.mjs 프로토타입 측 검증 (npm run check:canon-data)
public/proto/data/                        src/lib/canon 이 실제로 import 하는 미러
src/lib/canon/index.ts                    로더 + route 헬퍼
src/lib/canon/__tests__/canon.test.ts     앱 측 가드 (route 실재·중복·격차·51핀)
src/lib/canon/__tests__/canon-mirror.test.ts  두 트리 동기 가드
src/app/profile-details.tsx               7번째 별 상세 입력 (0132 미적용 상태)
src/lib/llm/boundary.ts                   모든 LLM 호출의 단일 경계 (C1)
```

### 검증

```bash
npm run verify            # 전체
npx jest src/lib/canon    # 캐논만 (18 tests)
npm run check:canon-data  # 프로토타입 측 — 현재 의도된 1 error (ProfileScreen)
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# Simon 의 V1~V6 회신 + Claude Design 상세 PRD 를 받고 나서 시작할 것
```

---

