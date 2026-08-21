# cowork 콘솔 발주서 — 2026-08-17

브랜치 `Simon-YHKim/Key-perfomance` 의 23 커밋을 운영에 반영하기 위해 **콘솔 접근이
필요한 작업만** 모았다. 코드 작업은 이미 끝났고 `npm run verify` 는 로컬에서
448 suites / 3,717 tests 그린이다.

**순서가 중요하다. 작업 A 를 건너뛰고 머지하면 신규 가입이 전부 깨진다.**

---

## 0. 공통 규칙 (어기면 되돌려야 한다)

- **main 직접 push 금지.** 항상 PR. 자동 머지는 CI 그린일 때만.
- **시크릿 하드코딩 절대 금지.** 값은 Simon 이 직접 입력한다.
- **`git add -A` 금지.** 파일을 명시해서 스테이징한다.
- **마이그레이션은 운영 적용 전 dry-run 확인.**
- **확인 못 한 것은 `UNVERIFIED` 로 표기.** 추측을 사실처럼 쓰지 않는다.
- em dash 금지 · 임상 어휘 금지 (정본 `src/lib/safety/lexicon.ts`).

프로젝트 ref `zoacryukmdeivmolvyhj`

---

## 1. 지금 상태

| 항목 | 값 |
|---|---|
| `origin/main` HEAD | `4c2d8571` |
| 작업 브랜치 | `Simon-YHKim/Key-perfomance` (origin/main 대비 **23 커밋**) |
| 이 브랜치가 추가한 마이그레이션 | `0127_users_display_name.sql` · `0128_health_pref_backstop.sql` |
| 이 브랜치가 바꾼 엣지 함수 | `gemini-proxy` · `peer-respond` |
| 로컬 verify | 448 suites / 3,717 tests 그린 |

**UNVERIFIED**: 운영 DB 의 현재 마이그레이션 수준. 직전 핸드오프(2026-08-13)는
`0125` 까지 적용 완료라고 적었고 그 뒤 `0126_community_chat.sql` 이 main 에
머지됐다(PR #1211). **0126 이 운영에 적용됐는지 먼저 확인할 것.**

---

## 2. 작업 A — 마이그레이션 0127 운영 적용 (최우선 · 차단 요소)

### 왜 최우선인가

`src/lib/supabase/auth.ts:724-730` 의 `ensureUserProfile` 이 `users` 에
**`display_name` 을 무조건 INSERT** 한다. 컬럼이 없으면 PostgREST 가 그 INSERT 를
거부하고, **신규 가입이 100% 실패한다.**

따라서 순서는 하나뿐이다: **0127 적용 → 그다음 머지·배포.** 반대로 하면
컬럼이 생기기 전까지 가입이 죽는다.

### 무엇을

1. 운영 DB 의 현재 마이그레이션 수준 확인 (0126 포함 여부).
2. `db/migrations/0127_users_display_name.sql` dry-run 후 적용.
   - `display_name text` 추가 + 40자 CHECK. 파괴적 요소 없음, 기존 행은 NULL.
3. 0126 이 아직이면 0126 을 먼저 적용한다(번호 순서).

### 완료 판정

- `users` 에 `display_name` 컬럼 존재.
- 기존 행이 지워지거나 변형되지 않았다.

---

## 3. 작업 B — 마이그레이션 0128 운영 적용

### 왜

`0100` 이 건강 데이터(PIPA 민감정보) 직접 쓰기를 **미성년만** 막고 성인은 열어뒀다.
`health_import = false` 인 성인, 즉 **한 번도 켠 적 없는 모든 성인**이
PostgREST 로 `health_samples` 에 직접 쓸 수 있었다. `0128` 이 같은 트리거에
성인 동의 검사를 추가한다.

### 무엇을

`db/migrations/0128_health_pref_backstop.sql` dry-run 후 적용.

### 주의

- 트리거 함수 `reject_minor_health_rows` 를 `CREATE OR REPLACE` 한다. 이름은 그대로.
- 파일 끝의 `REVOKE ... FROM anon` 두 줄을 지우지 말 것. 새 함수는 Supabase 가
  anon 에 EXECUTE 를 자동 부여한다. `npm run check:definer-grants` 가 강제한다.

### 완료 판정

- `health_import` 가 false 인 성인 계정으로 `health_samples` INSERT 를 시도하면
  `health_consent_required` 로 거부된다.
- 미성년 거부(`minor_health_locked`)는 그대로 동작한다.

---

## 4. 작업 C — 엣지 함수 2개 재배포

### peer-respond (안전 수정 · 먼저)

**왜**: peer 응답 폼에 만 14세 미만 차단이 없었다. 서버가 생년을 받아 거부하도록
고쳤는데, **배포 전까지 그 구멍은 열려 있다.**

**무엇을**: `supabase/functions/peer-respond` 배포.

**완료 판정**: `birthYear` 없이 POST → `400 birth_year_required`,
14세 미만 생년 → `403 too_young`.

### gemini-proxy

**왜**: 허용 모델 목록이 열거라 `gemini-3.5-flash` 에서 멈춰 있었다. 그 위 세대는
설정해도 `400 model_not_allowed` 가 났다. 패턴으로 바꿨고, 서버가 등급 안에서
모델을 고를 수 있는 env 오버라이드를 추가했다.

**무엇을**: `supabase/functions/gemini-proxy` 배포.

**완료 판정**:
- 기존 호출(`gemini-2.5-flash`)이 그대로 동작한다. **이게 제일 중요하다.**
- `GEMINI_MODEL_FLASH` 를 세우면 flash 등급 호출이 그 모델로 나간다.
- 패턴 밖 문자열(예: `gpt-5.6`)은 여전히 `400 model_not_allowed`.

### 하지 말 것

- `src/lib/llm/gemini.ts` 를 지우거나 우회하지 말 것. 이름만 gemini 일 뿐
  **모든 LLM 호출이 지나는 단일 경계 모듈**이고 감사기록(C3)·안전분류(C9)가
  전부 여기 걸려 있다.

---

## 5. 작업 D — 저장소 시크릿 · 변수 (모델 자동 최신화)

`.github/workflows/model-refresh.yml` 이 매일 04:00 KST 에 돈다. 아래가 없으면
**실패가 아니라 보고만 하고 끝난다**(안전한 기본값).

### 시크릿 (Settings > Secrets and variables > Actions > Secrets)

| 이름 | 없으면 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | 승격 대신 `supabase secrets set` 명령만 출력 |
| `SUPABASE_PROJECT_REF` | 위와 같음 (`zoacryukmdeivmolvyhj`) |
| `ANTHROPIC_API_KEY` | Claude 좌석 건너뜀 |
| `OPENAI_API_KEY` | 추론 좌석 건너뜀 |
| `GEMINI_API_KEY` | OCR·음성 좌석 건너뜀 |

**UNVERIFIED**: 벤더 키 3개가 이미 **저장소 시크릿**으로 있는지. Supabase 함수
시크릿과는 별개 저장소다. 콘솔에서 확인할 것.

### 변수 (선택, Variables 탭)

| 이름 | 용도 |
|---|---|
| `MODEL_REFRESH_APPLY` | `false` 로 두면 보고 전용. 비워두면 승격함 |
| `MODEL_PIN_<좌석>` | 그 좌석을 고정. 되돌리기 수단 |

좌석: `ANTHROPIC_SONNET` · `ANTHROPIC_OPUS` · `OPENAI_FRONTIER` ·
`GOOGLE_FLASH` · `GOOGLE_FLASH_LITE` · `GOOGLE_PRO`

### 첫 실행은 손으로

Actions 탭에서 `Model refresh` 를 `workflow_dispatch` 로 한 번 돌리고
**run summary 를 읽어라.** 무엇을 승격했는지 거기 찍힌다. 자동 스케줄에
맡기기 전에 눈으로 한 번 본다.

### 되돌리기

문제가 생기면 그 좌석에 `MODEL_PIN_<좌석>=<이전 모델>` 을 세우고 다시 돌린다.
배포 불필요.

---

## 6. 작업 E — PR 생성 (Simon 확인 후)

23 커밋. Simon 이 "PR 은 내 확인 후에" 라고 했으므로 **확인 없이 열지 말 것.**

열 때 본문에 넣을 것:

- 작업 A·B 마이그레이션이 **머지 전에** 적용됐다는 확인
- 작업 C 엣지 함수 2개가 배포됐다는 확인
- `npm run verify` 결과

---

## 7. 순서 요약

```
1. 운영 마이그레이션 수준 확인 (0126 포함 여부)
2. 0127 적용            <- 이거 없이 머지하면 가입이 죽는다
3. 0128 적용
4. peer-respond 배포     <- 안전 수정
5. gemini-proxy 배포
6. 저장소 시크릿 등록 + model-refresh 수동 1회 실행 + summary 확인
7. Simon 확인 후 PR
```
