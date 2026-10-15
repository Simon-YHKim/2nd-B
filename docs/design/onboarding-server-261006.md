# 첫 실행 표식(환영 · 첫날 되돌아보기) 서버 claim 설계 (Q-261004-40 = A)

- 작성: 2026-10-06 18:36 KST · 발행: Claude Code (코디네이터 세션 2ndb-74 의 마무리 E 갈래)
- 기준: origin/main `b5cff385` (2026-10-06 18:30 KST). main 줄 번호는 이 커밋 기준입니다. #2092 줄 번호는 그 PR 의 head `1105efd7` 기준입니다.
- 상태: **설계 초안. 코드 · 마이그레이션 파일 없음.** Simon 이 10절에서 고르면 그 답으로 다시 구현합니다.
- 마이그레이션 번호: **0219 예약**(DECISIONS `26.10.06 03:19`). 이 문서는 파일을 만들지 않습니다.
- 관련 PR: #2092(첫 구현 `fix/qa261006-onboard40`, draft · 게이트 r1 · r2 BLOCK, draft 로 둡니다) · #2043(기기 저장소를 계정별 키로, 게이트 3회 뒤 뺌).

> **결정 원문** (DECISIONS.md `26.10.05 19:53`, Q-261004-40 = A): 온보딩 완료를 프로필의 완료 시각 열(서버)에
> 기록하고 앱은 서버 값을 따른다, TTFV 첫 기록 되돌아보기도 계정당 한 번. 이유: 기기 저장소를 계정별로 나누는
> 수정이 탭 간 경합 · 저장 실패 · 삭제 울타리와 얽혀 수렴하지 않았다(W-12). 뒤집는 조건: 없음.
>
> **멈춤 기록** (Simon 10-06 답, DECISIONS.md `26.10.06 18:40`): #2092 게이트 2회차에도 신규 지적이 6건 늘어
> 코드 PR 을 멈추고 설계 문서부터 씁니다.

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 무엇이 문제인가 | 환영(온보딩) 완료와 첫날 되돌아보기(/ttfv) 열람이 **기기 전역 키 둘**에만 남습니다(`src/lib/onboarding/state.ts:7`, `src/lib/onboarding/ttfv-gate.ts:13`). 새 기기 · 시크릿 창 · 재설치에서 기존 계정에 둘 다 다시 나오고(QA-LEGACY W-12), 같은 기기의 다른 계정이 남긴 표식이 쓰입니다. |
| #2092 가 수렴하지 않은 이유 (추론) | "계정당 한 번"을 **클라이언트 캐시와 나중 쓰기**로 맞추려 했습니다. 서버는 시각을 첫 값으로 지키지만(#2092 `0219:115-118`) 화면 진입을 허락하지는 않아서, 캐시가 낡거나 · 응답이 늦거나 · 세션이 바뀌거나 · 탭이 둘이면 진입이 한 번 더 열렸습니다. r1 게이트가 이미 "동시 진입까지 막으려면 서버의 조건부 진입 획득 결과가 필요하다"고 적었습니다(astra r1 CDA-01 최소 패치). |
| 이 설계의 중심 | **진입 전에 서버가 한 번만 허락합니다(claim).** 허락은 조건부 UPDATE 한 번으로 정해지고, 허락받은 요청만 화면을 엽니다. 서버가 답하지 못하면 열지 않습니다(fail-closed). 모든 답은 로그인 세션 번호에 묶여 다른 로그인으로 새지 않습니다. |
| 무엇이 줄어드나 | #2092 클라이언트 저장소(`account-first-run.ts` 379줄)의 확인 번호 · 재검증 · 재전송 계수 · 세션 표식 메모리가 거의 필요 없어집니다. 서버 SQL 은 늘고 앱 상태는 줄어듭니다. |
| 추천 | 7절 **엄격안**. |

---

## 1. 문제 정의

### 1.1 지금 main 의 흐름

```
홈 DeepSpaceShell.tsx
  profileGate                                   :103-117 (프로필 · 연령 경계, 그대로 둠)
  onboardingComplete === null → 로더            :120   ← useOnboardingComplete() = 기기 키 (state.ts:130)
  !onboardingComplete → /onboarding             :121
  autoTriggerTTFV === null → 로더               :126   ← useAutoTriggerTTFV() = 기기 키 (ttfv-gate.ts:93)
  autoTriggerTTFV → /ttfv                       :127

/onboarding 끝내기 · 건너뛰기
  markOnboardingComplete() → 기기 키에 시각       src/app/onboarding.tsx:99 · state.ts:48-60
  환영 소리 (skipped 반영)                       onboarding.tsx:79,101

/ttfv 콘텐츠가 보이면
  onContentReady → markTTFVSeen() → 기기 키       src/app/ttfv.tsx:31 · TTFVScreen.tsx:431-434
  빈 콘텐츠는 표시하지 않음 (#1530: 빈 화면이 단 한 번의 기회를 쓰지 않게)

대기 기록 가져오기 안내도 같은 두 훅을 씀          src/lib/capture/use-import-pending.ts:49-50
```

### 1.2 무엇이 틀리나

| 증상 | 원인 |
|---|---|
| 새 기기 · 시크릿 창 · 재설치에서 기존 계정에 환영 → /ttfv 가 다시 나옴(W-12) | 서버에 표식이 없음 |
| 같은 기기에서 계정 A 의 표식으로 계정 B 가 둘 다 건너뜀 | 키가 계정과 무관한 전역 키(`ONBOARDING_KEY`) |
| 기기 저장소를 계정별 키로 나누는 수정(#2043) | 탭 간 경합 · 저장 실패 · 삭제 울타리에서 게이트 3회 수렴하지 않음(DECISIONS `26.10.05 04:3x`) |

### 1.3 #2092 가 한 것

| 층 | 내용 |
|---|---|
| 서버 | `users.onboarding_completed_at` · `users.ttfv_seen_at` + 본인 전용 RPC 둘(`mark_onboarding_completed` · `mark_ttfv_seen`, 첫 값 우선, `0219:100-168`) + 기존 사용자 이행(기록 · 자료가 있는 계정 → `created_at`, `0219:89-95`) |
| 클라이언트 | `src/lib/onboarding/account-first-run.ts`(379줄): 서버 읽기 실패면 기기 값(`:233-237`), 쓰기는 기다리지 않음(`:301-317`), 미확인 표식 최대 3회 재전송(`:196-205`), /ttfv 전에 재검증(`:247-269` · `ttfv-gate.ts:135-168`) |

### 1.4 운영 규모

| 항목 | 값 | 출처 |
|---|---|---|
| 전체 계정 | 15 | #2092 본문 (2026-10-06 11:29 KST 읽기 전용 집계) |
| 기록 · 자료가 있는 계정 | 5 | 같은 곳 |
| 최근 24시간 가입 | 0 | 같은 곳 |
| 스토어 출시 | 없음 | #2094 본문 · #2094 `0218:111` (2026-10-06 기준) |

---

## 2. #2092 게이트 지적

게이트 원문: `E:/Coding Infra/reports/qa-legacy-261004/gates/cd-onboard40-{astra,daybreak}-r{1,2}.txt`.
r2 에서 처음 나온 번호 6건 = astra 2(CDA2-01 · CDA2-02) + daybreak 4(CD2-01 · CD2-02 · CD2-03 · CD2-04). 두 게이트가 같은 결함을 다른 번호로 적은 것은 한 줄로 묶었습니다.

| # | 묶음 | 게이트 ID (회차 · 상태) | 심각도 | 지적 요약 | 근거 (#2092) |
|---|---|---|---|---|---|
| 1 | 두 탭 · 낡은 캐시로 /ttfv 가 한 번 더 열림 | CDA-01 (astra r1 → r2 일부 · daybreak r2 일부) | medium | 두 탭이 함께 "안 봄"을 확인하면 둘 다 진입합니다. 첫 값 우선은 시각 덮어쓰기만 막고 화면 진입은 막지 않습니다. | `ttfv-gate.ts:157-167` · `0219:150-153` |
| 2 | 재검증 실패를 서버 확인으로 셈 | CD2-02 (daybreak r2 신규) · astra r2 CDA-01 재현 경로 | medium | 재검증이 실패해도 확인 번호를 올려, 낡은 "안 봄" 답으로 /ttfv 를 엽니다. | `account-first-run.ts:262-265` |
| 3 | 같은 계정의 새 로그인 세션을 구분하지 못함 | CD2-01 (daybreak r2 신규) | medium | 소유자 감시는 소유자 값이 바뀔 때만 답을 버립니다. 같은 uid 의 새 로그인에서는 옛 답을 그대로 씁니다. | `account-first-run.ts:120-127` · main `account-epoch.ts:63-65` |
| 4 | 옛 로그인의 RPC 응답이 새 로그인 확인으로 채택됨 | CDA2-01 (astra r2 신규) | medium | 읽기에는 세대 검사가 있지만 표식 RPC 응답에는 없습니다. A → 로그아웃 → A 에서 늦게 온 옛 응답이 새 확인이 됩니다. | `account-first-run.ts:284-299` |
| 5 | 서버에 안 닿은 표식이 메모리에만 있음 | CDA-02 (astra r1 → r2 원 범위 닫힘 · daybreak r2 일부) | medium | 쓰기 실패 뒤 재전송 전에 앱이 꺼지면 표식이 사라지고 같은 계정에 환영이 다시 나옵니다. | `account-first-run.ts:73-79` · `:301-317` |
| 6 | 시간 초과가 "전송 중" 표시를 먼저 풂 | CDA2-02 (astra r2 신규) · CD2-03 (daybreak r2 신규) | low | 8초 시간 초과는 기다림만 끝내고 요청은 살아 있습니다. 재진입이 같은 RPC 를 겹쳐 보냅니다. `recordMark` 반복 호출은 재전송 상한을 보지 않습니다. | `account-first-run.ts:271-299` · main `src/lib/async/with-timeout.ts:37-50` |
| 7 | 되돌리기 파일의 `COMMIT` 이 바깥 트랜잭션까지 확정 | CD2-04 (daybreak r2 신규) | low | `BEGIN` 안에서 `\i` 로 넣으면 파일 끝 `COMMIT` 이 호출자의 다른 변경까지 확정합니다. | `rollback/0219_down.sql:21-32` |
| 8 | 읽기 실패 때 다른 계정의 기기 표식을 믿음 (기존) | CDA-04 (astra) = CD-02 (daybreak), r1 · r2 열림 | medium | B 의 서버 읽기가 실패하면 A 가 남긴 전역 기기 키로 B 가 두 화면을 건너뜁니다. | `ttfv-gate.ts:121-125` · `state.ts:164-167` |
| 9 | 웹 저장 예외가 화면 이동을 멈춤 (기존) | CDA-05 (astra r1 · r2 열림) | medium | `localStorage.setItem` 예외가 끝내기의 `router.replace` 를 막습니다. | `state.ts:69-82` · `onboarding.tsx:95-110` |
| 10 | anon 의 INSERT 사후조건 누락 | CD-03 (daybreak r1 · r2 열림) | low | 두 열에 대한 anon INSERT 권한 검사가 없습니다(지금 쓸 수 있는 길은 없음). | `0219:175-180` |
| 11 | 삭제 울타리 뒤에도 표식 쓰기 | CD-05 (daybreak r1 · r2 열림) | low | 두 RPC 가 `account_deletion_tombstones` 를 보지 않습니다. r2 의 자동 재전송이 그 구간에 닿을 수 있습니다. | `0219:111-123,146-158` · main `0192:82-95` |
| 12 | 보이지 않은 캐러셀에 래치가 켜짐 | CDA-03 (astra r1 → r2 판단 불가 · daybreak r2 일부) | low | 래치가 실제로 캐러셀을 그리는지와 무관하게 렌더 중에 켜집니다. | `onboarding.tsx:80-96` |

r2 에서 닫힌 지적: CD-01(A → 로그아웃 → A 에서 캐시 재사용, 소유자 감시로 닫힘) · CD-04(되돌리기 부분 적용, 트랜잭션으로 닫힘). 둘 다 이 설계에서도 유지합니다.

---

## 3. 설계 원칙 (불변식)

| # | 원칙 | 막는 것 (2절 묶음) |
|---|---|---|
| P1 | 자동 진입(/onboarding · /ttfv)은 **서버 허락(claim)을 받은 요청만** 합니다. 허락은 조건부 UPDATE 한 번이 정합니다. | 1 |
| P2 | 서버가 답하지 못하면 **자동 진입하지 않습니다**(fail-closed). 로그인한 계정은 기기 표식을 읽지 않습니다. | 2 · 8 |
| P3 | 모든 서버 답(읽기 · claim · 완료)은 보낼 때의 **세션 번호**를 들고 돌아오고, 지금 세션 번호와 같을 때만 채택합니다. | 3 · 4 · 6 |
| P4 | "한 번"은 **진입하는 순간 이미 서버에 적혀 있습니다.** 나중 쓰기(완료 · 열람)가 실패해도 다시 열리지 않습니다. 그래서 재전송 · durable outbox 가 필요 없습니다. | 5 · 6 |
| P5 | 빈 콘텐츠는 기회를 쓰지 않습니다(#1530 유지). 허락받은 /ttfv 가 비면 서버에 돌려줍니다(release). | #1530 회귀 방지 |
| P6 | 쓰기 RPC 는 삭제 울타리를 봅니다. | 11 |
| P7 | 되돌리기는 단독 실행 전용입니다. | 7 |

---

## 4. 서버 (0219)

### 4.1 `public.users` 의 열

| 열 | 뜻 | 쓰는 함수 |
|---|---|---|
| `onboarding_claimed_at` | 환영 자동 진입을 허락한 시각(기회 사용) | `claim_first_run('onboarding')` |
| `onboarding_completed_at` | 끝내기 · 건너뛰기 시각(첫 값 우선) | `finish_first_run('onboarding', …)` |
| `ttfv_claimed_at` | 첫날 되돌아보기 자동 진입을 허락한 시각. 빈 콘텐츠로 돌려주면 NULL | `claim_first_run('ttfv')` · `finish_first_run('ttfv','empty', …)` |
| `ttfv_claim_token` | 허락받은 그 진입의 증표(uuid). 돌려주기 · 완료가 대조 | `claim_first_run('ttfv')` |
| `ttfv_seen_at` | 콘텐츠가 실제로 보인 시각(첫 값 우선) | `finish_first_run('ttfv','shown', …)` |

모두 `users` 행의 열이라 계정 삭제(행 삭제)와 계정 내보내기(`users.*`)를 그대로 따릅니다(#2092 본문 · 두 게이트의 동의 · 개인정보 축). 새 표가 없어 삭제 등록부(0189)에 더할 것이 없습니다.

### 4.2 상태 기계

```
환영 (onboarding)
  [필요] ──claim 성공──▶ [허락됨] ──finish completed | skipped──▶ [끝냄]
  [필요] 조건: onboarding_claimed_at IS NULL AND onboarding_completed_at IS NULL
  [허락됨] 에서 앱이 꺼져도 다시 자동으로 열리지 않음 (건너뛰기와 같은 결과)

첫날 되돌아보기 (ttfv)
  [열림] ──claim 성공──▶ [허락됨] ──finish shown──▶ [봄]
    ▲                        │
    └──finish empty (증표 일치)┘
  [열림] 조건: ttfv_seen_at IS NULL AND ttfv_claimed_at IS NULL
              AND now() 가 기준 시각 + 24시간 안
              (기준 시각 = COALESCE(onboarding_completed_at, onboarding_claimed_at))
  [허락됨] 에서 앱이 꺼지거나 finish 가 닿지 않으면 그대로 [허락됨] → 다시 자동으로 열리지 않음 (fail-closed)
```

두 탭이 동시에 `claim` 을 보내면 같은 행의 UPDATE 가 줄을 서고, `… IS NULL` 조건을 먼저 통과한 한 요청만 `granted` 를 받습니다. 읽기만으로 정하면 두 탭이 함께 NULL 을 볼 수 있어서(묶음 1) 읽기가 아니라 UPDATE 가 정합니다.

### 4.3 함수

| 함수 | 하는 일 | 돌려주는 것 |
|---|---|---|
| `claim_first_run(p_user_id uuid, p_kind text)` | 본인 확인 → 삭제 울타리 확인 → 4.2 조건의 조건부 `UPDATE … RETURNING`. 줄이 바뀐 요청만 허락 | `{granted, reason, token, marks}`. `reason` = `granted` · `done` · `held` · `window` · `not_onboarded` |
| `finish_first_run(p_user_id uuid, p_kind text, p_outcome text, p_token uuid)` | 환영: `completed` · `skipped` → `onboarding_completed_at` 첫 값. ttfv `shown`: `ttfv_seen_at` 첫 값, 증표가 NULL(주소로 직접 연 /ttfv)이면 `ttfv_claimed_at` 도 비어 있을 때 채움. ttfv `empty`: 증표가 같고 `ttfv_seen_at` 이 NULL 일 때만 `ttfv_claimed_at` · `ttfv_claim_token` 을 비움 | `marks` |
| 읽기 | 새 함수 없음. 기존 `users_self_select`(0009) + 0140 이 남긴 SELECT 로 다섯 열을 읽음 | |

공통: `SECURITY DEFINER` · `SET search_path = ''` · `auth.uid() = p_user_id` 아니면 42501(`0219:111-113` 과 같음) · `REVOKE ALL … FROM PUBLIC, anon` · `GRANT EXECUTE … TO authenticated`(`check:definer-grants`).
삭제 울타리: `account_deletion_tombstones` 가 있으면 `account_deletion_in_progress` 로 거부합니다. 잠금 순서는 0192 의 삭제 처리와 같게 맞춥니다(구현 때 `0192_account_deletion_completion_fence.sql:82-95` 와 0217 설계의 tombstone 정의를 다시 읽고 정함, 지금은 미확인). 단순 사전 조회만 두면 동시성 틈이 남는다는 astra r2 지적을 따릅니다.

### 4.4 기존 사용자 이행

#2092 규칙을 유지합니다(`0219:83-98`). 기록 또는 자료가 있는 계정 → `onboarding_completed_at = onboarding_claimed_at = created_at`. `ttfv_*` 는 채우지 않습니다(`created_at` 이 24시간을 넘었으면 창 밖이라 자동 진입이 없음). FORCE RLS(0178) 때문에 이행 구간만 `row_security = off`. 2026-10-06 집계 기준 5 계정을 채우고 10 계정은 다음 방문에 환영을 한 번 봅니다(#2092 본문, 적용 시점에 다시 셉니다).

---

## 5. 클라이언트

### 5.1 세션 번호

| 항목 | 내용 |
|---|---|
| 무엇으로 | 로그인 토큰의 `session_id` 클레임. 앱은 이미 이 값을 안정된 세션 식별자로 씁니다(`src/lib/auth/auth-storage-schema.ts:31` `sessionIdFromAccessToken` · `AuthContext.tsx:233-235` 복구 증명 결속). 토큰 갱신에는 그대로이고 새 로그인에서 바뀝니다. |
| 왜 이벤트 번호가 아닌가 | 같은 사용자에게도 `TOKEN_REFRESHED` 와 재진입 때의 `SIGNED_IN` 이 다시 옵니다. AuthContext 는 이를 같은 사용자의 반복 이벤트로 다룹니다(`AuthContext.tsx:217-219`, 탭 포커스는 `:1042`). 이벤트를 세면 같은 세션을 새 세션으로 오인합니다. |
| 어떻게 쓰나 | 첫 실행 답 = (소유자, session_id) 에 묶음. 요청을 보낼 때 그 쌍을 잡고, 돌아왔을 때 다르면 버립니다. 소유자 감시(`onAccountOwnerChange`)는 그대로 두고 session_id 비교를 더합니다. |
| 확인할 것 | 옛 JWT 처럼 `session_id` 가 없으면 자동 진입하지 않습니다(P2). 실제 운영 토큰에 클레임이 있는지는 구현 때 확인합니다(미확인). |

### 5.2 홈 게이트 순서

1. `profileGate` 그대로(`DeepSpaceShell.tsx:103-117`). 프로필 미완성 · 연령 경계가 먼저입니다.
2. 첫 실행 표식 읽기(SELECT, 8초). 실패 · 시간 초과 → 자동 진입 없이 홈. 다음 홈 진입 · 앱이 앞으로 올 때 다시 읽습니다(세션당 상한 3회).
3. 환영이 [필요] → `claim_first_run('onboarding')` → `granted` 면 /onboarding, 아니면 홈.
4. 첫날 되돌아보기가 [열림] → `claim_first_run('ttfv')` → `granted` 면 증표를 들고 /ttfv, 아니면 홈.
5. claim 응답이 8초 안에 오지 않으면 홈. **늦게 온 `granted` 는 따르지 않습니다**(화면이 갑자기 바뀌지 않게). 그 기회는 쓰인 채로 남습니다(fail-closed).

대기 기록 가져오기 안내(`use-import-pending.ts`)는 같은 답을 읽되 claim 은 하지 않습니다(진입하는 화면이 아님).

### 5.3 화면

| 화면 | 바뀌는 것 |
|---|---|
| /onboarding | 끝내기 · 건너뛰기 → `finish` 를 기다립니다(8초). 실패하면 "저장하지 못했습니다" + 다시 시도 · 홈으로. 홈으로 가도 `onboarding_claimed_at` 이 있어 다시 자동으로 열리지 않습니다. main 의 `skipped` · 환영 소리(`onboarding.tsx:79,101`)는 보존합니다. 래치는 캐러셀을 실제로 그리는 분기에서만 켭니다(묶음 12). 웹 저장은 try/catch 로 최선 노력만 합니다(묶음 9). |
| /ttfv | 증표를 받은 진입: 콘텐츠가 보이면 `finish shown`, 비면 `finish empty`. 지금 `TTFVScreen` 은 빈 경우 아무것도 부르지 않으므로(`TTFVScreen.tsx:431`) 빈 경우 콜백을 새로 둡니다. 증표 없이 주소로 연 /ttfv 는 지금처럼 보여 주고, 콘텐츠가 보이면 `finish shown`(증표 NULL)으로 열람만 기록합니다. |
| 기기 키 | 로그아웃 상태에서 /onboarding 을 주소로 직접 연 경우에만 씁니다(로그인 벽 2026-07-15 이후 이 길뿐, #2092 본문). 로그인한 계정은 읽지 않습니다(묶음 8). |

### 5.4 durable outbox 가 필요한가

**엄격안에서는 필요 없습니다.** "한 번"은 claim 때 서버에 이미 적히기 때문입니다(P4). 나중 쓰기가 사라지면 이렇게 됩니다.

| 사라진 쓰기 | 결과 | 사용자에게 |
|---|---|---|
| 환영 `finish` | `onboarding_claimed_at` 이 있어 다시 자동으로 열리지 않음. 첫날 창 기준은 `claimed_at` 으로 대신 | 차이 없음 |
| ttfv `finish shown` | `ttfv_seen_at` 은 비지만 `ttfv_claimed_at` 이 있어 다시 열리지 않음 | 차이 없음(열람 시각 기록만 빔) |
| ttfv `finish empty` | 허락된 채로 남아 첫날 되돌아보기를 자동으로는 다시 못 봄 | 드물게 기회를 잃음(빈 콘텐츠 + 그 순간 네트워크 끊김) |

outbox 를 두면 기기 저장소를 계정별로 다시 다뤄야 해서 #2043 이 멈춘 문제(탭 간 경합 · 저장 실패 · 삭제 울타리)가 그대로 돌아옵니다. 단순안을 고르더라도 outbox 는 만들지 말고 묶음 5 를 "알고 남김"으로 두기를 권해요.

---

## 6. 게이트 지적 대응표

| 묶음 | 게이트 ID | 엄격안 | 단순안 (#2092 + 작은 수정) |
|---|---|---|---|
| 1 두 탭 · 낡은 캐시 | CDA-01 | **닫힘**: claim 한 요청만 허락 | **남음**: 알고 남김으로 적어야 함 |
| 2 재검증 실패를 확인으로 셈 | CD2-02 | **해당 없음**: 재검증이 없고 실패 = 진입 없음 | 닫음: 실패를 확인으로 세지 않고 홈 |
| 3 같은 계정 새 세션 | CD2-01 | **닫힘**: session_id | 닫음: 같은 작업 |
| 4 옛 RPC 응답 채택 | CDA2-01 | **닫힘**: session_id | 닫음: 같은 작업 |
| 5 메모리 표식 소실 | CDA-02 | **닫힘**: P4 | **남음**: 재시작 뒤 환영 한 번 더 |
| 6 시간 초과 · 겹친 전송 | CDA2-02 · CD2-03 | **닫힘**: 재전송 없음, 늦은 답은 session_id · 증표로 무해 | 닫음: "전송 중" 해제를 결과 도착에 묶음 |
| 7 되돌리기 COMMIT | CD2-04 | 닫힘: 단독 실행 전용 | 같음 |
| 8 다른 계정 기기 표식 | CDA-04 = CD-02 | 닫힘: 로그인 계정은 기기 표식을 안 읽음 | 같음 |
| 9 웹 저장 예외 | CDA-05 | 닫힘: try/catch | 같음 |
| 10 anon INSERT 검사 | CD-03 | 닫힘: 사후조건에 추가 | 같음 |
| 11 삭제 울타리 | CD-05 | 닫힘: 0192 잠금 순서 | 같음 |
| 12 래치 | CDA-03 | 닫힘: 그리는 분기에서만 | 같음 |

---

## 7. 단순안과 엄격안

| | 단순안 | **엄격안 (추천)** |
|---|---|---|
| 무엇 | #2092 를 유지하고 묶음 2 · 3 · 4 · 6~12 를 고침. 묶음 1 · 5 는 "출시 전이라 드문 중복 표시를 받아들인다"로 남김 | 3~5절 |
| 남는 일 | 두 탭이 함께 진입하면 /ttfv 두 번 · 쓰기 실패 + 재시작이면 환영 한 번 더 | 중복 없음. 대신 드물게 기회를 잃음(claim 뒤 앱 종료 · 빈 콘텐츠 돌려주기 실패) |
| 서버가 답하지 못할 때 | 자동 진입 없음(묶음 8 수정 뒤) | 같음 |
| 0219 가 없는 DB | 로그인 계정은 자동 진입 없음 | 같음. 그래서 "적용 먼저, 게시 나중"이 더 중요함 |
| 앱 상태 | 캐시 · 확인 번호 · 재검증 · 재전송 계수 + 수정 | session_id + 요청마다 한 번 기다림 (줄어듦, 추정) |
| 서버 | 열 2 · RPC 2 | 열 5 · RPC 2 |
| 게이트 수렴 전망 (추론) | 남긴 1 · 5 를 게이트 지시문에 "알고 남김"으로 적지 않으면 다시 지적됨. 캐시 경로가 남아 새 경합 지적이 나올 수 있음 | 상태 경로가 적어 지적할 면이 좁음. 다만 RPC · 울타리 잠금 · 이행 SQL 이 새 검토 대상 |
| 일 | 작음 | 중간 (#2092 의 이행 규칙 · SQL 회귀 · 변이 목록 재사용) |

추천은 **엄격안**이에요.
1. Simon 결정 문장이 "계정당 한 번"입니다. 단순안은 그 문장이 깨지는 경우를 일부러 받아들이는 안입니다.
2. 엄격안은 앱 쪽 상태를 줄여 게이트가 볼 경합 경로 자체를 줄입니다. #2092 가 두 회차에 걸쳐 고친 것은 대부분 그 캐시 경로였습니다.
3. 출시 전이고 계정이 15 개라 이행 부담이 작습니다.

---

## 8. 마이그레이션 0219 개요

| 부분 | 내용 | #2092 대비 |
|---|---|---|
| ① 열 | 4.1 의 다섯 열(모두 NULL 허용, 기본값 없음) + COMMENT | 둘 → 다섯 |
| ② 이행 | 4.4 (`row_security = off` 구간만) | 같은 규칙, `onboarding_claimed_at` 도 채움 |
| ③ 함수 | `claim_first_run` · `finish_first_run` (4.3) | `mark_*` 둘을 대체 |
| ④ 권한 | `REVOKE ALL … FROM PUBLIC, anon` → `GRANT EXECUTE … TO authenticated` (마지막에) | 같음 |
| ⑤ 사후조건 | 다섯 열 × (authenticated, anon) × (INSERT, UPDATE) 권한 0 (CD-03) · 두 함수가 SECURITY DEFINER 이고 `search_path` 가 빈 값 | anon INSERT 추가 |
| 되돌리기 | **단독 실행 전용**: 파일 안에 `BEGIN`/`COMMIT` 을 두지 않고 `psql -X -v ON_ERROR_STOP=1 --single-transaction -f` 로만 실행(CD2-04). `SET LOCAL lock_timeout` → 함수 둘 → 열 다섯 삭제. 되돌린 뒤 새 앱은 자동 진입을 하지 않으므로 그동안 새 계정은 환영을 못 봅니다(받아들임) | 파일 안 BEGIN/COMMIT(`0219_down.sql:21-32`)을 뺌 |

---

## 9. 운영 적용 순서 (모두 GO 대상)

1. 구현 PR(draft)이 게이트를 통과할 때까지 머지하지 않습니다.
2. GO(마이그레이션 묶음, DECISIONS `26.10.05 19:53` ④) → 적용 직전 이행 대상 계정 수를 다시 셉니다 → 0219 적용.
3. PR 머지 → 웹 게시(publish 디스패치) → android-release 가 APK 를 만듦(`.github/workflows/android-release.yml:37-39`) → QA 설치본 교체(Simon 폰).
4. 사후 읽기 집계: 계정별 (claimed, completed, seen) 개수.

창: 2~3 사이 옛 웹 · 옛 APK 는 기기 키를 그대로 씁니다(지금과 같음). 3 이후 남은 옛 QA APK 도 기기 키를 쓰므로 교체로 닫습니다. 엄격안의 새 앱은 0219 가 없는 DB 에서 자동 진입을 하지 않으므로, 2 와 3 의 순서를 바꾸면 그 사이 새 계정이 환영을 못 봅니다.

---

## 10. Simon 에게 물을 것

| # | 질문 | 안 정하면 막히는 것 | 추천 |
|---|---|---|---|
| Q1 | 엄격안 · 단순안 중 무엇으로 갈까요? | 0219 · 구현 착수 | **엄격안** |
| Q2 | 엄격안에서 claim 뒤 앱이 꺼지거나 빈 콘텐츠 돌려주기가 실패하면 그 계정은 첫날 되돌아보기를 자동으로 다시 보지 못합니다(주소로 직접 열기는 됨). 중복 대신 이 손실을 받아들일까요? | 4.2 상태 기계 | 예. 대안은 15분 임대 뒤 다시 허락하는 것인데, 그러면 손실 대신 드문 중복이 생겨요. |
| Q3 | 환영도 claim 으로 할까요? 중간에 앱을 닫으면 환영이 다시 자동으로 나오지 않습니다(건너뛰기와 같은 결과). | 4.2 · 5.3 | 예 |
| Q4 | 서버가 답하지 못하면 자동 진입 없이 홈으로 보낼까요? 장애 중 처음 들어온 새 계정은 환영을 건너뛰고 다음 방문에 봅니다. | 5.2 | 예 |
| Q5 | 단순안을 고른다면, 두 탭 동시 진입과 재시작 뒤 환영 한 번 더를 "알고 남김"으로 게이트 지시문에 적을까요? 적지 않으면 매 회차 다시 지적됩니다. | 게이트 운영 | 단순안일 때만 예 |
| Q6 | #2092 는 구현 PR 이 열릴 때 닫고 브랜치는 남길까요? 재사용: 이행 규칙 · `row_security` 처리 · SQL 회귀 레인 · 변이 목록 · 소유자 감시. | PR 정리 | 예 |
| Q7 | 삭제 울타리 확인은 지금 0192 기준으로 넣고, 0217(삭제 영수증 설계)이 tombstone 을 바꾸면 따라갈까요? | 4.3 | 예 |

---

## 11. 확인 · 추론 구분, 하지 않은 것

**확인 (읽거나 세어서):**
- main `b5cff385` 의 줄 번호: `DeepSpaceShell.tsx:103-127` · `state.ts:7,48-60,130` · `ttfv-gate.ts:13,93` · `ttfv.tsx:31` · `onboarding.tsx:79,99,101` · `TTFVScreen.tsx:431-434` · `use-import-pending.ts:49-50` · `account-epoch.ts:63-65` · `auth-storage-schema.ts:31` · `AuthContext.tsx:217-219,233-235,1042` · `0192:80-96` · `android-release.yml:37-39` (git show 로 읽음).
- #2092 head `1105efd7` 의 `0219_users_first_run_marks.sql:60-190` · `account-first-run.ts` 전체 · `ttfv-gate.ts:1-190`, PR 본문(gh, 2026-10-06).
- 게이트 원문 네 개(`cd-onboard40-{astra,daybreak}-r{1,2}.txt`)의 판정 표를 직접 읽음. r2 에서 처음 나온 번호 6건(astra 2 + daybreak 4)을 셈.

**남이 잰 값을 인용 (이 세션에서 재지 않음):** 계정 15 · 기록 있는 계정 5 · 최근 가입 0 · 운영 `postgres` 의 `rolbypassrls = true`(#2092 본문).

**추론 (실행 · 측정하지 않음):**
- #2092 가 수렴하지 않은 원인, 엄격안이 앱 상태를 줄인다는 판단, 두 안의 게이트 수렴 전망(게이트가 이 설계를 본 적은 없습니다).
- 조건부 UPDATE 가 두 탭 중 하나만 허락한다는 것(PostgreSQL 행 잠금의 일반 동작, 실행 재현 안 함).
- 운영 토큰에 `session_id` 클레임이 있다는 것(앱 코드가 그렇게 가정하고 있음, 운영 토큰은 보지 않음).
- 0192 와 같은 잠금 순서로 울타리를 볼 수 있다는 것(구현 때 확인).

**하지 않은 것:** 코드 · 마이그레이션 파일 작성, 테스트 · 게이트 실행, 운영 DB 조회 · 쓰기, Edge 배포, 웹 게시, 에뮬레이터 · adb, 앱 LLM 호출.
