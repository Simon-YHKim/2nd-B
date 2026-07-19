# 리즈닝 16계약 전수 대조 감사 — 2026-07-19 (S2)

> **기준 스펙**: `docs/reasoning-ux-spec_260718.html` "필수 구현 계약" 1~16항 + "대조 검증 기준".
> **감사 기준 커밋**: origin/main `da6be790` (#1088). 방법: 코드 실측(file:line) — 문서·주장 불신, 렌더/호출 체인 추적.
> **판정 요약: PASS 12 · PARTIAL 4 (⑪⑫⑮⑯ — ⑫는 이 브랜치에서 픽스, 나머지 3건은 타트랙 소유라 결함 로그).**
> 라인 번호는 da6be790 기준. 이 브랜치의 픽스로 이동한 라인은 (픽스 후) 표기.

## 판정표

| # | 계약 | 판정 | 핵심 근거 |
|---|---|---|---|
| ① | 상태머신 queued→reserved→running→proposed→ratified (+cancelled/failed/recovered) | **PASS** | 0092:46-47 CHECK enum; queued=클라 직렬 큐 단계 |
| ② | idempotency key 4종 | **PASS** | 0092:55 UNIQUE + :191-198; runs.ts:71-83 |
| ③ | 예약 원자성 + 영속화 전 실패 시 환불 | **PASS** | 0092:189 advisory lock, :313-360, :362-446 |
| ④ | weekly base / monthly reward 분리 — 자동은 reward 절대 미접근 | **PASS** | 0092:222-241; reasoning.tsx:484-495 |
| ⑤ | 비준 전 무쓰기 | **PASS** | proposals 서버 영속; 적용은 비준 후 경로만 |
| ⑥ | proposal 단위 exactly-once 부분 비준 + 미덮어쓰기 | **PASS** | 0092:479-524; reasoning.tsx:461-482, :971-1030 |
| ⑦ | 백그라운드 job 복구 + 전역 task strip 재연결 | **PASS** | reasoning.tsx:637, :740-769; ConstellationHome:342,380 |
| ⑧ | 연령 fail-closed (광고·LLM 보류) | **PASS**(주석) | reasoning.tsx:863, :1036; policy.ts:95 |
| ⑨ | 진입점 동일 command·시트·route | **PASS** | settings.tsx:653; ConstellationHome:621,649,658 |
| ⑩ | 공통 DeepSpaceScreen + 디자인 계약 | **PASS** | reasoning.tsx:1095-1111, :1231-1263 |
| ⑪ | KO/EN 카피 locale key 이행 + parity | **PARTIAL** → [타트랙결함] | 시트는 5로케일 키, 화면 A~E·홈 말풍선은 인라인 삼항 |
| ⑫ | SAME-QUALITY | **PARTIAL → 이 브랜치에서 픽스** | gemini-proxy pro→flash 핀이 reasoning_connect에 적중(티어별 모델 차등) |
| ⑬ | 잔여 분리 표기(주간/월간 + 초기화 시점) | **PASS** | remaining-copy.ts; reasoning.tsx:1060-1066 |
| ⑭ | /records CTA → 단일 limit sheet | **PASS** | ReasoningLimitSheet가 보상 경로 소유; reasoning.tsx:1406 |
| ⑮ | 광고 자격 서버·UI 동시 확인 | **PARTIAL** → [타트랙결함 S1] | UI 풀 게이트 ✓ / SSV 그랜트에 자격 재확인 없음 |
| ⑯ | production dev seam 금지, SSV+txn 멱등 후 +2 | **PARTIAL** → [타트랙결함 S1] | 오늘 위험 0(fail-closed) / 런칭 배선이 클라 그랜트 |

---

## 계약별 상세 근거

### ① 상태머신 — PASS
- DB enum: `db/migrations/0092_reasoning_runs.sql:46-47` — `reserved/running/proposed/ratified/cancelled/failed/recovered` CHECK. 전이 RPC: reserve `:151-281` → start `:283-306` → complete(proposed) `:313-360` → fail `:366-392` / cancel `:394-416` / recover(stale) `:418-446` → ratify `:450-498` / applied `:500-524`.
- `queued`는 서버 행 상태가 아니라 **클라이언트 직렬 큐 단계**: `src/app/reasoning.tsx:259-268` (`enqueueReasoning` 체인) + 아이템 meta "자동 대기 / queued" `:528,:570`. 스펙 취지(대기→예약 순서) 충족 — DB에 별도 열거 불요 판정.

### ② Idempotency 4종 — PASS
- **수동 command**: 탭당 키 1개 생성(`src/lib/reasoning/runs.ts:71-74`) 후 command 전체(예약→완료)에 고정(`src/app/reasoning.tsx:881-901`). 서버 `UNIQUE (user_id, idempotency_key)` `0092:55` + 동일 키 재전송 시 기존 런 반환·무차감 `0092:191-198`. 재탭 이중 실행은 one-active-run 가드 `0092:200-204`가 차단.
- **자동 batch**: 결정적 키 `auto-{refKind}-{refId}` (`runs.ts:81-83`; 콜사이트 `reasoning.tsx:518,:561`) — 같은 자료는 영원히 1회만 예약. 완료된 키 재도착 시 조기 반환 `reasoning.tsx:319-323`.
- **사용량 확정**: 확정=예약 시점 원자 차감(`0092:231-270`)이므로 별도 확정 단계의 중복이 구조적으로 불가능. `complete_reasoning_run`은 idempotent(`0092:341-344` — proposed면 기존 개수 반환).
- **proposal 반영**: ratify는 `status='proposed'` 행만 전이(`0092:479-489`), apply는 `'ratified'` 행만(`0092:516-522`) — 재호출 no-op.
- 잔여 리스크(수용): reserve 커밋 후 응답 유실 → 재탭은 새 키지만 active 가드에 걸려 **차감 없음**, 고아 런은 30분 후 stale 환불(`0092:418-446`, `runs.ts:68`). 이중 차감 경로 부재 확인.

### ③ 예약 원자성 + 환불 — PASS
- per-user 직렬화: `pg_advisory_xact_lock` `0092:189`. 차감은 가드된 단일 upsert(`:231-237` auto, `:244-250` manual base, `:254-263` credit).
- "횟수 확정 후 결과 소실 금지": proposals insert + `proposed` 전이가 한 트랜잭션(`0092:349-358`); 클라는 completeRun 실패 시 failRun으로 환불(`src/app/reasoning.tsx:339-353`).
- 환불 exactly-once: fail/cancel/recover 모두 **전이에 성공한 행에서만** `refund_reasoning_spend` 호출(`0092:362-364` 계약 주석, `:382-390`, `:406-414`, `:434-443`). 환불은 런 행에 **박제된 버킷**으로 착지(`0092:27-28`, `:273-277`) — KST 주/월 경계를 넘겨도 원장 정확.
- 클라 스펜드 경로 fail-closed(`runs.ts:5-10, :93-115`), 환불 경로는 warn-only + 마운트 스윕 보정(`reasoning.tsx:747`).

### ④ 자동 할당 = weekly base only — PASS (중점 재검증)
과거 결함 주장(#1061: 클라 프리체크가 자동 가용량에 monthly reward 포함)은 **서버·클라 양측에서 폐쇄 확인**:
- 서버: auto 분기 `0092:222-241`는 `reward_consumed`/`reward_credits`를 **한 번도 참조하지 않고**, `used < cap - 1` 가드로 수동 1회를 항상 남긴다(자동 천장 free 1 / plus 6 — `0092:17-21` 헤더 명문). credit 소비는 manual step-2에만 존재 `0092:254-263`.
- 클라 미러: `autoRunCanUseQuota` `src/app/reasoning.tsx:484-495`는 `getReasoningUsage().used`(주간 행만 — `src/lib/entitlements/usage.ts:87-92`)와 `cap-1`만 비교, rewardCredits 미사용.
- 구조 테스트 핀: `src/lib/reasoning/__tests__/reasoning-runs-migration.test.ts:74-80` (auto 분기에 reward 접근 부재).
- 수동 소비 순서(base→credit)는 0089와 락스텝: `0089:79-113` ↔ `0092:242-270`.

### ⑤ 비준 전 무쓰기 — PASS
- 제안은 `reasoning_run_proposals`에만 영속(`0092:67-76`, complete `:349-358`) — slim payload, 원문 미포함(`src/app/reasoning.tsx:121-135`).
- domain tag·`reasoning:ratified` 태그·source page 생성은 **비준 후** `applySelectedProposals` → `applyReasoningProposal`(`reasoning.tsx:457-482`)에서만: `updateRecordTags`/`updateSourceTags` + `generateSourcePage`(`:481`). 별 밝기 캐시 무효화도 적용 후만(`:1027`).
- 실행 단계(`produceProposals` `:356-455`)는 읽기 + LLM 호출만 — 사용자 상태 쓰기 0건 실측.

### ⑥ 부분 비준 exactly-once + 동시편집 미덮어쓰기 — PASS
- 서버: ②·③ 참조 (`0092:479-524`).
- 클라: 적용 직전 **최신 행 재독** 후 최신 태그 위에 재구성(`stripDomainTags(latest)` — `reasoning.tsx:461-481`) → 다른 기기의 태그 편집 미덮어쓰기.
- 부분 실패: 적용 성공분은 `pending`에서 즉시 제거(`:996-999`), 실패 시 잔여만 재선택(`:1010-1012`); 마운트 복구는 `proposed`+`ratified`(미적용)만 로드(`src/lib/reasoning/runs.ts:241-284`) — 성공 항목 재시도 경로 부재.

### ⑦ 백그라운드 복구 — PASS (주석 1)
- 전역 task strip: `startTask(mode:"background", resultHref:"/reasoning")` `reasoning.tsx:904-957`; 언마운트 시 `sendToBackground()` `:703`; 홈이 task 상태로 재연결(`src/components/deep-space/ConstellationHome.tsx:342, :380-386` — running 표시 + 진행 화면 CTA).
- 화면 부재 중 오류 보존: `deferredRunErrors` 맵 `:637` + 재입장 시 수거 `:717-738` (limit→시트, safety→CrisisRouter, generic→에러 카드).
- 앱 킬 복구: 마운트마다 `recoverStaleRuns`(환불) → `listPendingProposals`(proposed+ratified 잔여 복원) `:740-769` — 기기 교체 생존(0092 서버 영속).
- 주석: 킬 후 '오류 통지 문구' 자체는 재표시 안 됨 — 서버가 failed/recovered+환불로 정합을 보존하므로 스펙 취지(완료·오류가 증발해 차감만 남는 상태 금지) 충족 판정.

### ⑧ 연령 fail-closed — PASS (주석 2)
- LLM: `isMinor == null`이면 화면 홀드(`reasoning.tsx:1036`), 실행 가드(`:863`), 프로필 프로브 실패 시 재시도 홀드(`:707-715`). 자동 경로도 호출자가 minor를 명시 전달(`:497-584`).
- 광고: 진입 프리체크 `isMinor === false`(`:1139`; 홈 `ConstellationHome:615`) + 시트의 풀 게이트(⑮)와 policy의 null=미성년 취급(`src/lib/ads/policy.ts:37, :95`) — 미확인은 광고 영역 자체 미렌더(스펙 F 상태 전수와 일치, 07-18 에뮬 QA 실증).
- 주석: **서버측** LLM 연령 홀드는 없음(우회 클라 가정 시 잔여) — 스펙 문언은 실행 UX 계약으로 충족; 서버 이빨은 0094(미성년 임포트 클램프)가 임포트 축에만 존재. 잔여로 기록.

### ⑨ 진입점 동일 command·시트·route — PASS
- 설정: `src/app/settings.tsx:653` → `/reasoning`. 홈 말풍선: `ConstellationHome.tsx:649, :658` → `/reasoning`; 고갈 상태 CTA는 **동일 ReasoningLimitSheet**(`:621`)와 `/plans?from=reasoning_limit`(`:630`).
- command는 `runReasoningBatch` 단일 구현(`reasoning.tsx:303`), 한도 시트 단일 컴포넌트(`ReasoningLimitSheet`), 결과 route `/reasoning` 단일(`:909`).

### ⑩ 디자인 계약 — PASS
- `DeepSpaceScreen` `reasoning.tsx:1095`; 뒤로가기 1곳(onBack 사다리 `:1100-1111`); 실행 중 그래픽 1개(일정 속도 궤도 링 `:679-689, :1231-1234` — 퍼센트 비례 금지 주석), 확정 bar는 done 전용(`:1259-1263`); bottom sheet 2종(`:1426-1440`) — 모달 오버레이 아닌 시트.

### ⑪ 카피·i18n — PARTIAL → [타트랙결함: 화면 소유 트랙]
- 이행됨: 한도 시트 `ds.reasoningLimit.*` — `locales/{en,ko,es,pt,id}/deepspace.json` 5로케일; RewardedSheet `ds.reward.*` 동일.
- 미이행: 화면 A~E(reasoning.tsx 전반)와 홈 리즈닝 말풍선(`ConstellationHome.tsx:330-373`)은 **인라인 `ko ? … : …` 삼항** — KO/EN 페어 자체는 존재(대량 결손 아님)하나 locale key 미이행이라 **es/pt/id 사용자는 EN 폴백**을 본다. C7(EN↔KO parity) 위반은 아님.
- UI 파일은 S2 소유 밖 → 결함 로그로 이관(트랙 로그 참조).

### ⑫ SAME-QUALITY — PARTIAL → **이 브랜치에서 픽스**
- **발견**: `supabase/functions/gemini-proxy/index.ts`의 서브브레인 pro→flash 핀(구 :673-675)이 **전 티어 라이브 purpose인 `reasoning_connect`**(콜사이트 `model:"pro"` 명시 — `src/app/reasoning.tsx:386, :427`; `PURPOSE_TIER` 합치 — `src/lib/llm/types.ts:209`)에 적중. `PREMIUM_PURPOSES`(advisor/planner뿐, proxy :168)가 아니므로 403은 없지만, **brain=pro / free·soma·cortex=gemini-2.5-flash**로 서빙 모델이 티어에 키잉 — SAME-QUALITY 불변식(`tiers.ts` 헤더, 스펙 계약 12) 위반.
- **노출 범위**: 웹 라이브는 MODEL_LITE/FLASH/PRO 전부 `gemini-3.5-flash`(`.github/workflows/web-deploy.yml:93-95` 기본값, repo Variables 미설정)라 pro-class 패턴 미적중 = 미노출. **네이티브(EAS)는 `EXPO_PUBLIC_MODEL_*` 미설정 → 기본 `gemini-2.5-pro`(`types.ts:148-158`) → 적중** = 실차등.
- **픽스(이 PR)**: `PRO_FOR_ALL_TIERS = {'reasoning_connect'}` 면제 — 0092 주간 원장이 이미 지출을 묶으므로(free 2/wk) 비용 리스크 미미, 티어별 일일 콜캡은 유지. 회귀 테스트 `src/lib/llm/__tests__/reasoning-connect-routing.test.ts`. **배포는 S5 게이트**(gemini-proxy 재배포 필요).
- 부수 확인: 시트의 SAME-QUALITY 문구 키 존재(`ds.reasoningLimit.sameQuality` — `ReasoningLimitSheet.tsx:218`), 플랜 표기 스펙 F 표와 일치(횟수·기능만).

### ⑬ 잔여 분리 표기 — PASS
- 순수 모듈 `src/lib/reasoning/remaining-copy.ts` (주간: "이번 주 N회 중 M회 남음 · 월요일 초기화" / 월간: "보상 N회 남음 · {월} 말까지" — 초기화 시점 상이 명시).
- 렌더: `reasoning.tsx:1060-1066`(합산 금지 주석 포함) + `:1279-1280`; 시트 meter+resetLine+rewardLine(`ReasoningLimitSheet.tsx:160-181`); 홈 말풍선도 분리 문장(`ConstellationHome.tsx:362-368`). 실행 게이트(`depleted`)는 여전히 base+credit 합(remaining-cap.ts:34-42) — 표기만 분리, 소비는 불변(스펙 결정 5와 일치). 07-18 에뮬 QA 스크린샷 실증 병기(HANDOFF Latest).

### ⑭ /records CTA → 단일 limit sheet — PASS
- 구 dead-end(홈·리즈닝이 `/records` 푸시, 보상 흐름 부재)는 제거 — 현재 고갈 CTA는 시트 오픈: `reasoning.tsx:1406`(선택 보존 주석 명문), 홈 `ConstellationHome:621`. 시트가 광고 실행·그랜트·사용량 갱신을 소유(`ReasoningLimitSheet.tsx:120-137`)하고 오버레이라 원래 선택 상태 복귀 보장(`:6-7` 주석).
- 격리 핀: `src/lib/__tests__/reasoning-execution-isolation.test.ts` — 홈/리즈닝 화면의 `addRewardCredits` 직접 호출 금지.

### ⑮ 광고 자격 — PARTIAL → [타트랙결함 S1]
- UI: `canShowRewardedAds` `src/lib/ads/policy.ts:92-99` — 빌드 플래그·free 티어(null=차단)·`isMinor===false`(null=차단)·명시 동의(null=차단)·허용 라우트(`:76` — "/" 정확일치 + /reasoning) 전부 fail-closed + 시트에서 월 적립 상한 결합(`ReasoningLimitSheet.tsx:105-118`). 스펙 문언 그대로 충족.
- 서버: **자격 재확인 부재** — SSV 그랜트 `grant_reward_credits_ssv`(`0079:30-77`)와 `rewarded-ssv/index.ts:148-180`은 서명·txn 멱등·상한만 검사, Free/성인/동의 여부는 미확인. 실광고 경유라 실효 위험은 낮으나(미성년은 클라에서 광고 자체 불가) 계약 문언("서버와 UI에서 확인")의 서버 절반이 빈다. 광고 인프라는 S1 소유 → 결함 로그.

### ⑯ 실제 보상 검증 — PARTIAL → [타트랙결함 S1] (오늘 라이브 위험 0)
- **production dev seam 금지 = 충족**: `src/lib/ads/rewarded.ts:80-84` — 실 광고 유닛 부재 가드로 non-dev 빌드는 무조건 `completed:false`(런칭 GO 전 유닛 생성 금지 정책). 07-18 QA 실증: 시청 탭 후 `reward_credits` 0 불변(#1068 계약). dev 빌드는 Google TEST 유닛 + `EARNED_REWARD`만 완료 처리(`:111-117`).
- **SSV 체인 = 준비 완료**: `rewarded-ssv/index.ts` ECDSA 검증(`:82-121`) + `REWARD_SSV_ENABLED` fail-closed(`:125`) + `transaction_id` PK 멱등(`0079:22-26, :53-65`) + user FK(0085) + `|chat` 라우팅(`:131-165`).
- **갭(런칭 전 필수)**: ReasoningLimitSheet의 실경로가 **클라이언트 그랜트**(`showRewardedAd()` — `ssvCustomData` 미전달 → `addRewardCredits` `ReasoningLimitSheet.tsx:124-126`). 실유닛 교체 시 이대로면 "+2를 SSV+txn 멱등 통과 뒤에만 확정" 계약을 미충족하고, SSV까지 켜면 이중 지급 벡터(클라 +2 & SSV +2). 런칭 변경 = 시트를 `ssvCustomData: userId`로 전환 + 클라 그랜트 제거(또는 SSV 확정 폴링). S1 소유 → 결함 로그.

---

## 대조 검증 기준 (스펙 하단) 확인

| 기준 | 판정 | 근거 |
|---|---|---|
| tier-map: Free 2 / Soma·Cortex 7 / Brain unlimited | ✓ | `src/lib/entitlements/tier-map.ts:59-64` |
| 0075: +2/watch, 월 상한 20 | ✓ | `0075:43-44` (서버 소유 상수) ↔ `tiers.ts` REWARD_PER_WATCH/REWARD_MONTHLY_CAP ↔ `0079:45-46` ↔ `rewarded-ssv/index.ts:23` — 구조 테스트 핀 |
| 0089: weekly base 먼저, 이후 monthly credit 1개씩 | ✓ | `0089:79-113`; 0092 manual 동일 순서 `:242-270` |
| 자동 가용량 계산에서 monthly reward 제외 | ✓ | 계약 ④ 상세 — 서버·클라 양측 폐쇄 |
| 월요일 00:00 KST ISO week + KST 월 bucket 서버 파생 | ✓ | `0089:53-56`, `0092:206-209`; 클라 미러 `usage.ts:40-66`(구조 테스트가 포맷 핀) |
| Chat 무료 5회/일과 Reasoning ledger 완전 분리 | ✓ | chat=`chat_usage` 일 단위(0076, 0090-0091 별도 보너스 원장) vs reasoning=`usage_counters` 주간행+월간 reward; SSV도 `|chat` suffix로 원장 분기(`rewarded-ssv:131-165`) |
| 0092/0089 CASE ↔ tier-map 락스텝 | ✓ | `0092:213-218`·`0089:61-66` ↔ tier-map — `reasoning-runs-migration.test.ts:58-65` 등 구조 테스트가 핀 |
| 0093 auto pref 서버 저장 | ✓ | `0093` users.reasoning_prefs jsonb + `auto-pref.ts` 서버 우선 해석(07-18 QA 기기 간 동기화 실증) |

## 이 감사가 만든 변경 (같은 브랜치)

1. **⑫ 픽스**: `gemini-proxy` `PRO_FOR_ALL_TIERS` 면제 + 회귀 테스트 (배포 = S5 게이트).
2. **QA-F2(S2-2)**: `0095_ai_audit_purpose_rpc.sql` + 클라 audit purpose/vendor/effort 전달 — 상세는 PR 본문.
3. 회귀 테스트: `reasoning-connect-routing.test.ts`(cluster_infer 재사용 함정 + Phase2/벤더 스위치 불변) · `audit-purpose-continuity.test.ts`.

## 타트랙 결함 로그 (S2 소유 밖 — 수정 금지, 기록만)

| # | 소유 | 내용 |
|---|---|---|
| X1 | S1 | ⑯: ReasoningLimitSheet 실경로가 클라 그랜트(ssvCustomData 미전달) — 런칭 전 SSV-only 전환 + 클라 그랜트 제거 필요(이중 지급 벡터 포함) |
| X2 | S1 | ⑮: `grant_reward_credits_ssv`/`rewarded-ssv`에 Free·성인·동의 서버 재확인 부재 |
| X3 | 화면 소유 트랙 | ⑪: 리즈닝 화면 A~E + 홈 말풍선 카피가 인라인 ko/en 삼항 — es/pt/id는 EN 폴백. locale key 이행 필요 |
| X4 | 빌드 인프라(게이트) | 네이티브(EAS)에 `EXPO_PUBLIC_MODEL_*` 미설정 → 기본 2.5 패밀리로 잔류, 웹(3.5-flash)과 세대 불일치 + D-27 "Gemini=3.5-flash 전용" 운영 결정 미이행. `eas.json` env 3줄 추가 제안(락스텝 배포 주의 — LLM-ROUTING §3-2) |

## 잔여(수용, 소유 무관 기록)

- ⑧ 서버측 LLM 연령 홀드 부재(우회 클라 가정) — 0094는 임포트 축만. 후속: proxy에 minor-미해결 시 보류 게이트 검토.
- ② reserve 응답 유실 후 재탭 시 30분 stale 창 동안 실행 불가(차감은 안전) — UX 개선 여지(active 런 재연결 UI).
