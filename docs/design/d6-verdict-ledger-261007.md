# D6 판정 원장 설계안 — 인터뷰 대화록 · 층 판정 · 비준 제안·결정 (초안)

- 상태: **초안.** 코드 · 마이그레이션 · 저장소 파일 변경 없음. 운영 적용은 Simon 승인 뒤.
- 작성: 2026-10-07 03:44 KST(PowerShell `Korea Standard Time`) · 발행: Claude Code(재설계 세션이 맡긴 설계 갈래)
- 기준 커밋: origin/main `2ccb81c8f17193e0fe8a21a6464d916f372f0ede`(2026-10-07 03:10 KST, #2127). 아래 `파일:줄` 은 모두 이 커밋 기준이다.
- 함께 읽은 것(읽기만):
  - PR #2122(0218 `records.system_tags`, head `9f2cdfca`) diff.
  - 브랜치 `origin/fix/qa261007-interview`(PR 없음 · 운영 미적용). 0220 은 `aae23e1b`, 브랜치 머리는 03:44 기준 `6fea477a` 이고 아직 움직이고 있다. **이 문서의 가장 큰 전제가 이 브랜치라서 0.2절에 따로 적었다.**
- 근거 결정: DECISIONS.md `26.10.07 01:20` D4 · D5 · D6, `02:24` RD-261007-04. 03:00 보정 · 03:08 · 02:42 발주 메모는 발주문에서 인용했고, 기준 커밋의 DECISIONS.md 에는 아직 없다(STATE.md 최종 갱신 02:34).


> ## ⚠ 먼저 읽을 것 — 재설계 세션 정정 (2026-10-07 04:16 KST)
>
> 이 초안은 조사 갈래가 03:44 에 쓴 것을 **고치지 않고** 그대로 올린다. 다만 아래 두 곳은 그 뒤에 사실이 바뀌었거나 결정과 어긋난다.
>
> 1. **0.2절의 해석은 03:00 결정과 어긋난다.** `DECISIONS.md:82`(26.10.07 03:00) 원문: *"인터뷰 판정의 내용만 D6로 옮기고, D6의 마이그레이션은 재설계가 자기 범위의 새 번호로 만든다. 0220은 인터뷰 판정에 쓰지 않는다"*. 이 초안은 "0220 의 표를 유일한 원장으로 두고 0220 안에서 고친다"를 추천하는데, 그건 이 결정을 뒤집는 안이다. 재설계 세션의 추천은 **결정대로**(D6 이 #2131 의 코드를 가져와 0225 에서 다섯 곳을 고친다)이고, Simon 결정 **RD-261007-06** 을 기다린다. 결정 전까지 2.1 · 2.2 · 5절은 "0220 + 열"을 "0225 가 같은 표를 새로 만든다"로도 읽는다(열 목록은 같다).
>    - 0220 브랜치는 이제 PR **#2131**(draft, 10-07 03:39)이다. 작성 세션(2ndb-74)은 04:0x 에 03:00 결정을 확인하고 #2131 을 `6fea477a` 에서 멈췄다(머지 · 운영 적용 · 추가 커밋 없음).
> 2. **번호: 0227 은 더 이상 비어 있지 않다.** `fix/qa261007-delrcpt` 가 03:46 에 0229 를 0227 로 옮겼다(`3e64dba4`). 지금 빈 번호는 0225 · 0226 과 0232 이후다. D6 은 **0225(표 · 함수) · 0226(삭제 등록부)** 만 먼저 잡고, 5.1 의 "0227 클라이언트 쓰기 회수"는 그때 빈 번호로 한다. 5.1 표의 0229 충돌(Q2)은 그 이동으로 풀렸다.
>
> 03:00 · 03:08 · 02:42 결정은 이제 main 의 `DECISIONS.md:70-89` 에 원문으로 있다(#2129).

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 무엇을 만드나 | 표 다섯 개(대화록 머리 · 대화록 턴 · 제안·결정 원장 · 소유자 없는 집계 · 응답 블록 id)와 판정 원장 확장, 서버 함수 11개(화면 5 · 프록시 3 · 내부 3) + 레코드 삭제 트리거 1, 클라이언트 직접 쓰기 회수 1건 |
| 판정 원장 | **하나뿐이다.** 0220 브랜치의 `interview_probe_verdicts` 를 그 원장으로 삼고 D6 이 열을 더한다. 새 판정 표는 만들지 않는다(0.2절) |
| 대화록 | '담기' 때 서버 함수가 턴 단위로 `interview_transcript_turns` 에 쓴다. 판정 행은 `(transcript_id, turn_no)` 로 그 턴을 가리킨다. 이게 "층 판정(basis=추론)을 레코드에 턴 번호로 연결"이다 |
| 저장하지 않은 대화 | 원문은 처음부터 서버에 가지 않는다. 판정 행은 숫자만 남긴 주 단위 집계로 접은 뒤 지우고, 그 세션의 감사 행 해시를 비운다(D2) |
| 비준 | 시기 카드(`seven:`) 승인 · 거절 · 빗나간 곳이 **한 표**(`period_card_proposals`)에 남는다. 승인 행이 곧 '그때의 나' 문장 저장소이고, L5 행(`star_tier_history`)은 서버 함수만 쓴다 |
| 클라이언트가 못 하게 되는 것 | `interview_coverage` INSERT · UPDATE, `star_tier_history` 의 `ratify` 행 쓰기. 회수는 새 앱이 다 나간 뒤 별도 번호로 한다(5절) |
| 바꾸지 않는 것 | 인터뷰 규칙(P1~P7) · 층 이름(울림 포함) · 밝기 정의(`levelFromCells`) · 미성년 게이트 · LLM 호출 수 |
| 마이그레이션 | 0225(표 · 함수) · 0226(삭제 등록부) · 0227(클라이언트 쓰기 회수). 0220 은 쓰지 않는다. 0228 · 0229 는 다른 브랜치가 잡고 있다(5.1절) |

### 0.1 그림 — 무엇이 어디로 가나

```
 [인터뷰 화면]                          [프록시: openai · claude 공용 모듈]              [DB]
  답 1개 보냄 ── interviewTurn 메타 ──▶  감사 행(C3, 지금 그대로) ─────────────────▶ ai_audit_log
  (원문은 프롬프트 안에만)               모델 출력에서 answeredLayer 읽기
                                          로컬 문턱 재계산 · 최종 인정(rule_set)
                                          answer_digest = sha256(세션:턴:답)
                                          record_interview_probe_verdict ─────────▶ interview_probe_verdicts (숫자·열거값 + 해시 1개)
  막힌 답 · 그만 · 오류 턴 ── 서버로 안 감(모델 호출 없음)

  '여기까지'/끝 ── close_interview_session(종료 사유) ───────────────────────────▶ interview_sessions
  '담기' ── createRecord(clientRequestId=interview:<세션>) ───────────────────────▶ records (+system_tags, 0218)
        └─ commit_interview_session(세션, 레코드, 턴 목록) ──┬─ 원문 턴 쓰기 ─────▶ interview_transcripts / _turns
                                                              ├─ 판정 행 ↔ 턴 연결 · 해시 대조 · 빠진 턴 채움
                                                              └─ 칸 계산 · 원자적 증가 ──▶ interview_coverage
  저장 안 함 / 화면 떠남 / 앱 종료(6시간)
        └─ discard / sweep ─▶ fold: 숫자만 주 단위 집계 ─▶ interview_unsaved_rollup (소유자 없음)
                                     판정 행 · 세션 행 삭제, 감사 행 해시 비움 ─▶ ai_audit_log

 [/review] 시기 카드 제안 ── self_model_propose + periodCard 메타 ─▶ 프록시: 인용 ⊂ 보낸 근거 확인
                                                                     record_period_card_proposal ─▶ period_card_proposals(proposed)
           승인 / 거절 / 빗나간 곳 ── decide_period_card ─────────────────────────────▶ 같은 행 상태 변경
                                                         승인이면 서버가 ─────────────────▶ star_tier_history(seven:, L5, ratify)
 [세컨비 대화] R 이 붙인 블록 id ── contextBlocks 메타 ─▶ 프록시 ─▶ ai_audit_context_blocks (id 만)
```

### 0.2 가장 먼저 정할 것 — 0220 브랜치와 "판정 원장은 하나"

조사 중 발견: `origin/fix/qa261007-interview` 에 **0220 판정 원장 구현이 이미 있다**(커밋 `aae23e1b` 2026-10-07 03:14, 다른 세션 `session_01QQDQS2…`, PR 없음, 운영 미적용). 들어 있는 것:

- 표 `interview_sessions` · `interview_probe_verdicts`(판정 호출 1회 = 1행, 원문·해시 없음)
- 함수 `record_interview_probe_verdict`(service_role) · `close_interview_session` · `commit_interview_session(uuid)` · `anonymize_interview_sessions`(6시간 뒤 소유자 NULL) · 뷰 `interview_scene_metrics` · `interview_coverage` 감소 금지 트리거
- 프록시 쓰기 `supabase/functions/_shared/interview-verdict.ts`(openai-proxy 에만 연결)
- `0229_interview_sessions_erasure_registry.sql`

발주의 "판정 원장 둘 금지(0220 용 별도 표 금지)"와 "0220 번호는 쓰지 않는다(0216~0220 배정 유지)"를 함께 읽으면 **0220 의 표가 그 하나의 원장이고, D6 은 별도 판정 표를 만들지 않고 그것을 넓힌다**가 맞는 해석이다(추론). 그런데 0220 브랜치는 03:00 보정과 다섯 군데에서 어긋난다:

| # | 0220 브랜치 | D6 이 요구하는 것 | 근거 |
|---|---|---|---|
| 1 | 저장 안 한 세션을 소유자 NULL · 날짜로 접은 **세션 단위 행**으로 남김(`anonymize_interview_sessions`) | 숫자 · 열거값만 남긴 **집계**, 세션 행 없음 | 03:00 보정 |
| 2 | 감사 연결(`audit_id`)만 끊고 감사 행 해시는 그대로 | 그 세션의 감사 행 해시를 비움 | 03:00 보정 · D2 |
| 3 | `turn_seq` = 장면 안 답 순번. 대화록 턴 번호 · 대화록 표 없음 | 대화록 턴 번호로 연결 | D6 |
| 4 | 최종 인정을 `commit` 이 `credited AND pass` 로 그때 계산 | 행마다 모델 판정 · 로컬 판정 · **최종 인정** · 규칙 판 따로 | 02:42 메모, 03:00 '애매하면 센다'는 no_verdict 에만 |
| 5 | 쓰는 곳이 openai-proxy 뿐 | interview_probe 는 S0.5 에서 Claude Sonnet 으로 간다 → claude-proxy 도 같은 모듈 | DECISIONS `26.10.07 01:20` S0.5 좌석 표 |

**추천 (Q1):** 0220 은 아직 머지 · 적용 전이므로 1 · 2 · 4 · 5 와 3 의 열(`turn_no` · `answer_digest`)을 **0220 안에서** 고치고(원장 모양을 한 번만 정한다), D6 의 0225 는 대화록 · 제안·결정 · 집계 · 블록 id 와 commit v2 만 맡는다. 이 문서는 그 경우와 "0220 이 지금 모양으로 먼저 적용된 경우"를 모두 쓸 수 있게 판정 원장 DDL 을 `0220 + 추가 열` 로 적었다(2.2절).

---

## 1. 지금 무엇이 어디에 저장되나 (사실)

### 1.1 인터뷰 한 번의 흐름과 저장 지점

| 단계 | 지금 코드 | 저장되는 것 | 근거 |
|---|---|---|---|
| 씨앗 질문 | 고정 표에서 꺼냄, 모델 호출 없음. `sceneStart: true` 는 메모리에만 있음 | 없음 | `src/app/interview.tsx:521`, `src/lib/interview/probe.ts:79-86`("Session-only metadata, no change to stored transcript/schema") |
| 답 보냄 | 위기 분류 → red 면 위기 경로로 가고 **답은 대화에서 빠짐** | 위기 원장(경계 모듈) | `interview.tsx:552-566` |
| 그만 · 건너뛰기 | `answerDisposition` 이 그만이면 대화 종료, 건너뛰기면 질문만 붙임(답 턴 없음) | 없음 | `interview.tsx:568-578`, `src/lib/interview/continuity.ts:7-20` |
| 로컬 막힘 | 모르겠다 · 짧은 답(ko 8 · en 14자 미만, 감정층 제외)은 모델에 안 보내고 발판 | 없음 | `interview.tsx:340-344,593-612`, `continuity.ts:24-31` |
| 판정 호출 | `nextProbe` → `callLlm(purpose: interview_probe)` | `ai_audit_log` 1행(사용자 · 프롬프트 djb2 · 출력 djb2 · 지연 · 토큰) | `probe.ts:477-519`, `supabase/functions/openai-proxy/index.ts:1095-1119`(해시 `:1102-1103`) |
| 모델 판정 | 출력 JSON 의 `answeredLayer` 를 **화면이** 읽어 비교하고 버림. 인정 여부는 메모리의 `answered` | 없음 | `probe.ts:509,592-597`, `interview.tsx:434-443`, `continuity.ts:41-45` |
| 같은 층 세 번 실패 | 발판 2번 뒤 대화 전체 종료 | 없음 | `interview.tsx:452-467`, `src/lib/interview/stuck.ts:30` |
| 대화 끝 | `finish()` 는 사유 인자가 없고 8곳에서 불림 | 없음 | `interview.tsx:306-312` · 호출 `:386,449,466,471,484,572,621,848` |
| 말문 후보 | 칩을 누르면 입력창을 채움. 고쳤는지 그대로인지 모름 | 없음 | `interview.tsx:791-801` |
| 담기 | 대화 전체를 `질문: / 답변:` 한 덩어리로 `records` 1행 | `records.body`(턴 경계 소실) · `tags`(→ #2122 뒤 `system_tags`) | `interview.tsx:641-666`, #2122 diff `interview.tsx` hunk |
| 칸 | 화면이 `coverage - base` 로 증분 계산 → `addCoverage` 가 저장값을 읽어 **절대값 upsert** | `interview_coverage` | `interview.tsx:674-680`, `src/lib/interview/coverage-store.ts:65-84` |
| 별 등급 기록 | 저장 직후 화면이 일곱 등급을 `seven:` 행으로 insert(origin `interview`) | `star_tier_history` | `interview.tsx:685`, `src/lib/persona/seven-tier-history.ts:64-104` |
| 저장 시 red | 위기 안내 후 return — 레코드는 저장됐고 칸 · 등급은 안 씀 | `records` 만 | `interview.tsx:667-670` |

### 1.2 비준(/review)의 흐름과 저장 지점

| 단계 | 지금 코드 | 저장되는 것 | 근거 |
|---|---|---|---|
| 후보 | 시기마다 열린 층 ≥ 2 | 없음 | `src/lib/persona/seven-proposal-context.ts:28-29,58-70` |
| 근거 | 인터뷰 레코드 최대 40개를 **레코드 단위** `[record:<id>]` 로 600자씩 | 없음 | `seven-proposal-context.ts:98-121` |
| 제안 | 화면이 프롬프트를 만들어 `self_model_propose` 호출. 모델이 낸 `citations` 는 파싱만 하고 화면이 쓰지 않음 | 감사 행만 | `src/lib/persona/propose-self-model.ts:101-104,110-131`, `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1935-1972` |
| 거절 | 제안을 버리고 끝. 분석 이벤트만(동의 게이트) | **없음** | `DeepSpaceDesignScreens.tsx:1981-1989` |
| 승인 | 화면이 `star_tier_history` 에 `seven:<별>` L5 · `ratify` · 인용 = **보낸 근거 전부** 를 직접 insert. 제안 문장(`after`)은 어디에도 안 남음 | `star_tier_history` 1행 | `DeepSpaceDesignScreens.tsx:1993-2010`, `seven-tier-history.ts:96-104` |
| 옛 축 승인 | 같은 화면이 옛 별에도 `ratify` 를 직접 insert | `star_tier_history` | `DeepSpaceDesignScreens.tsx:1997-2000`, `src/lib/persona/record-star-tiers.ts:58-99` |
| 쓰기 권한 | `star_tier_history_owner_all` 이 `FOR ALL` → 클라이언트가 임의의 `ratify` 행을 넣어 L5 를 만들 수 있음 | — | `db/migrations/0045_star_tier_history.sql`, `0061_rls_initplan_optimize.sql` |

### 1.3 남지 않는 것 (D6 이 메우는 칸)

| 정보 | 지금 | D6 뒤 |
|---|---|---|
| 턴 경계가 있는 대화록 | 없음(한 덩어리 `records.body`) | `interview_transcript_turns` |
| 턴마다 모델 판정 · 로컬 판정 · 최종 인정 | 없음(메모리) | 판정 원장 행 |
| 장면 id · 질문 종류 · 말문 후보 그대로 여부 | 없음 | 판정 원장 · 대화록 턴 |
| 종료 사유 | 없음 | `interview_sessions.end_reason` |
| 저장 안 한 대화의 깊이 · 종료 분포 | 없음 | `interview_unsaved_rollup`(소유자 없음) |
| 비준 거절 · 빗나간 곳 | 없음 | `period_card_proposals.status/miss_text` |
| 승인한 '그때의 나' 문장 | 없음 | `period_card_proposals.proposal_text`(status ratified) |
| 모델이 실제로 인용한 근거 | 버려짐 | `evidence_cited`(보낸 집합의 부분집합, 서버 확인) |
| 세컨비 응답이 쓴 블록 | 없음 | `ai_audit_context_blocks` |

### 1.4 신뢰 공백 (D6 이 닫는 것)

- `interview_coverage`: 정책은 소유자 일치, 값 검사는 `answers >= 0` 하나(`db/migrations/0143_interview_coverage.sql:50,63-74`, 0144 는 initplan 만). 클라이언트가 임의 정수를 쓸 수 있다.
- `star_tier_history`: `FOR ALL`(0045 · 0061). `ratify` 행 직접 insert 로 L5 를 만들 수 있다. 0060 주석이 "ratify proposal's free-form citations are NOT trusted here (no real-id whitelist yet)" 라고 스스로 적고 있다(`0060_star_tier_history_evidence.sql`).
- 0195 의 북극성 카드는 이미 서버가 근거 집합을 고정하고(`reserve_polaris_generation`) 결과의 `evidenceRefs ⊂ evidence` 를 확인한다(`db/migrations/0195_polaris_generation_allowance.sql:246-257`). 시기 카드는 그 장치가 없다.

---

## 2. 표 스키마 (DDL 초안)

공통 규칙(0143 · 0195 · 0220 에서 이미 쓰는 것 그대로):

- 최상위 `BEGIN/COMMIT` 없음(Supabase CLI 가 감쌈). `SET LOCAL lock_timeout`.
- 새 표는 `ENABLE` + `FORCE ROW LEVEL SECURITY`, 그리고 `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` 뒤 필요한 것만 다시 준다(Supabase 기본 권한 함정, 0143:88-96).
- 함수는 `SECURITY DEFINER SET search_path = ''`, 같은 파일에서 `REVOKE ... FROM PUBLIC, anon`(새 함수에 EXECUTE 가 자동으로 붙음). GRANT 는 파일 끝에(`check:definer-grants` Rule A 정규식 사정, 0143:76-79).
- 시기 · 층 · 열거값은 TS 한 곳(`src/lib/interview/verdict-ledger.ts`, 0220 브랜치)이 원본이고 SQL CHECK 는 그 사본이다. 사본이 어긋나지 않게 jest 대조 테스트를 둔다(6절 T-12).

### 2.1 세션 — `interview_sessions` (0220 + D6 변경)

0220 그대로(`id` 클라이언트 uuid · `owner_id` · `period` · `locale` · `started_at` · `last_seen_at` · `ended_at` · `end_reason` · `local_blocks` · `scaffolds` · `committed_at`). D6 변경:

```sql
-- (Q1 = 0220 안에서 고침) 아래를 0220 원문에 반영. (0220 이 먼저 적용됨) 0225 에서 ALTER.
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS record_id uuid NULL
    REFERENCES public.records(id) ON DELETE SET NULL,      -- 담기로 만든 레코드. 삭제 처리는 2.7 트리거가 먼저 한다
  ADD COLUMN IF NOT EXISTS vendor text NULL
    CONSTRAINT interview_sessions_vendor_check CHECK (vendor IN ('openai','claude','mock'));
-- 종료 사유: 0220 목록 + 'switch_declined'(03:00 보정의 "다른 장면으로 갈까요?"에 아니오, 규칙 적용 뒤에만 나옴)
ALTER TABLE public.interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_end_reason_check;
ALTER TABLE public.interview_sessions ADD CONSTRAINT interview_sessions_end_reason_check CHECK (end_reason IN (
  'complete','user_end','user_stop','skip_exhausted','scaffold_exhausted','verdict_exhausted',
  'switch_declined','no_question','day_limit','crisis','error','left'));
-- 0220 의 anonymized_at · interview_sessions_anonymized_shape 는 쓰지 않는다:
-- 저장 안 한 세션은 행을 남기지 않고 집계로 접는다(2.5). (0220 이 먼저 적용됐다면 0225 에서 DROP)
```

### 2.2 판정 원장 — `interview_probe_verdicts` (0220 + D6 열) — **유일한 판정 원장**

목표 모양(★ = D6 이 더하는 것):

| 열 | 형 | 쓰는 쪽 | 뜻 |
|---|---|---|---|
| `id` | uuid PK | 서버 | |
| `session_id` | uuid FK → sessions ON DELETE CASCADE | 프록시 | 장면 id 의 앞쪽 |
| `audit_id` | uuid UNIQUE NULL | 프록시 | 그 호출의 `ai_audit_log.id`. fold 때 해시 비우기에 씀 |
| ★`prior_audit_ids` | uuid[] NOT NULL DEFAULT '{}' | 프록시 | 같은 턴의 앞선 호출(장애 전환 재시도, `src/lib/llm/boundary.ts:706`) — 해시 비우기 대상 |
| `scene_seq` | int 1..10000 | 클라이언트 메타 | 장면 번호(장면 id = 세션 + 장면 번호) |
| `turn_seq` | int 1..10000 | 클라이언트 메타 | 장면 안 답 순번(0220 의미 그대로) |
| ★`turn_no` | int 1..20000 NULL | 클라이언트 메타 · commit | **대화록 전체에서의 턴 번호**(질문 · 답 모두 셈, 1부터). `UNIQUE (session_id, turn_no)` |
| ★`transcript_id` | uuid NULL | commit | 담기 뒤 대화록 머리. `(transcript_id, turn_no)` → 턴 FK |
| `asked_layer` | text NULL | 클라이언트 메타(프록시가 프롬프트 끝줄과 대조) | 겨냥 층 |
| `probe_kind` | text | 클라이언트 메타 | `seed` · `drill` · `scaffold` · `confirm` (★`switch_offer` 는 규칙 적용 뒤) |
| `local_gate` | text | **프록시 재계산** | `pass` · `short` · `non_answer` · `mismatch` · `unverified` |
| `model_layer` | text NULL | **프록시가 출력에서 읽음** | 모델 판정 |
| `verdict` | text | 프록시 / commit | 프록시: `credited` · `none` · `other_layer` · `no_verdict` · `unasked` · `error`. ★commit 이 채우는 클라이언트 행: `local_block` · `control` · `unrecorded` |
| ★`final_credit` | boolean NOT NULL | 프록시(규칙 모듈) / commit(false) | **최종 인정.** 칸 계산은 이것만 본다 |
| ★`rule_set` | text NOT NULL DEFAULT 'r0' | 프록시 | 최종 인정을 낸 규칙 판. 기준선 동안 `r0` 고정(6절 T-11) |
| ★`source` | text NOT NULL DEFAULT 'proxy' | — | `proxy` · `client`(commit 이 채운 행) |
| ★`link_state` | text NULL | commit | `linked` · `text_mismatch` · `undelivered` · `orphan`. NULL = 담기 전 |
| ★`vendor` | text NULL(프록시 행은 CHECK 로 필수) | 프록시 | `openai` · `claude`. 좌석이 바뀌는 동안 기준선을 벤더별로 가르기 위해(S0.5) |
| `opener_unedited` | boolean | 클라이언트 메타 | 말문 후보를 그대로 보냈나 |
| ★`openers_offered` | smallint 0..2 NULL | 프록시 | 이 응답이 낸 말문 후보 수(M6 분모) |
| `answer_len_bucket` | smallint 0..3 NULL | 프록시 | 0-4 · 5-7 · 8-13 · 14+ |
| ★`answer_digest` | text NULL (`^[0-9a-f]{64}$`) | 프록시 | `sha256(session_id ':' turn_no ':' 답)`. commit 이 대조 뒤 비움, fold 때 행과 함께 사라짐 |
| ★`call_count` | smallint NOT NULL DEFAULT 1 | 프록시 | 같은 턴 호출 수 |
| `created_at` | timestamptz | 서버 | |

```sql
ALTER TABLE public.interview_probe_verdicts
  ADD COLUMN IF NOT EXISTS prior_audit_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS turn_no integer NULL
    CONSTRAINT interview_probe_verdicts_turn_no_check CHECK (turn_no BETWEEN 1 AND 20000),
  ADD COLUMN IF NOT EXISTS transcript_id uuid NULL,
  ADD COLUMN IF NOT EXISTS final_credit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rule_set text NOT NULL DEFAULT 'r0'
    CONSTRAINT interview_probe_verdicts_rule_set_check CHECK (rule_set ~ '^r[0-9]{1,3}[a-z0-9-]{0,16}$'),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'proxy'
    CONSTRAINT interview_probe_verdicts_source_check CHECK (source IN ('proxy','client')),
  ADD COLUMN IF NOT EXISTS link_state text NULL
    CONSTRAINT interview_probe_verdicts_link_state_check
      CHECK (link_state IN ('linked','text_mismatch','undelivered','orphan')),
  ADD COLUMN IF NOT EXISTS vendor text NULL
    CONSTRAINT interview_probe_verdicts_vendor_check CHECK (vendor IN ('openai','claude')),
  ADD COLUMN IF NOT EXISTS openers_offered smallint NULL
    CONSTRAINT interview_probe_verdicts_openers_check CHECK (openers_offered BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS answer_digest text NULL
    CONSTRAINT interview_probe_verdicts_digest_check CHECK (answer_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS call_count smallint NOT NULL DEFAULT 1
    CONSTRAINT interview_probe_verdicts_call_count_check CHECK (call_count BETWEEN 1 AND 50);

ALTER TABLE public.interview_probe_verdicts DROP CONSTRAINT IF EXISTS interview_probe_verdicts_verdict_check;
ALTER TABLE public.interview_probe_verdicts ADD CONSTRAINT interview_probe_verdicts_verdict_check CHECK (verdict IN (
  'credited','none','other_layer','no_verdict','unasked','error',      -- 프록시가 본 것
  'local_block','control','unrecorded'));                              -- commit 이 채운 클라이언트 보고
ALTER TABLE public.interview_probe_verdicts ADD CONSTRAINT interview_probe_verdicts_source_shape CHECK (
  (source = 'proxy'  AND verdict NOT IN ('local_block','control','unrecorded') AND vendor IS NOT NULL)
  OR (source = 'client' AND verdict IN ('local_block','control','unrecorded','error')
      AND audit_id IS NULL AND model_layer IS NULL AND final_credit = false));
-- 새 행은 턴 번호가 있어야 한다. 0220 시절 행(있다면)은 rule_set 'r0-0220' 로 표시해 예외.
ALTER TABLE public.interview_probe_verdicts ADD CONSTRAINT interview_probe_verdicts_turn_no_required
  CHECK (turn_no IS NOT NULL OR rule_set = 'r0-0220') NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS interview_probe_verdicts_turn_key
  ON public.interview_probe_verdicts (session_id, turn_no) WHERE turn_no IS NOT NULL;
-- 대화록 턴 FK 는 2.3 표를 만든 뒤:
ALTER TABLE public.interview_probe_verdicts ADD CONSTRAINT interview_probe_verdicts_turn_fk
  FOREIGN KEY (transcript_id, turn_no)
  REFERENCES public.interview_transcript_turns (transcript_id, turn_no) ON DELETE CASCADE;
```

- 원문은 없다. 해시는 `answer_digest` 하나이고 담기 · 폐기 때 사라진다(0220 의 "원문 · 해시 없음"과 다른 점, 0220 이 Q1 로 고친다면 그 주석도 바꿔야 한다).
- 클라이언트 권한 0(0220 그대로). 본인도 직접 읽지 못하고, 내보내기 함수(3.9)로만 자기 담은 세션을 읽는다.
- "층 판정(basis=추론)을 레코드에 턴 번호로 연결"은 뷰로 드러낸다(S2 의 레코드 층이 그대로 합칠 수 있게):

```sql
CREATE OR REPLACE VIEW public.record_layer_inferences WITH (security_invoker = true) AS
SELECT t.record_id, v.turn_no, v.asked_layer AS layer, 'inferred'::text AS basis,
       v.final_credit, v.verdict, v.model_layer, v.local_gate, v.rule_set
  FROM public.interview_probe_verdicts v
  JOIN public.interview_transcripts t ON t.id = v.transcript_id
 WHERE v.link_state = 'linked';
-- service_role 만 SELECT (권한 블록에서)
```

### 2.3 원문 표 — `interview_transcripts` · `interview_transcript_turns` (D6 신설)

D6 원문 그대로 "턴 경계가 살아 있는 인터뷰 대화록은 원문 표에". 쓰는 곳은 `commit_interview_session` 하나다. **저장을 고른 대화만** 온다 — 저장하지 않은 대화의 원문은 서버에 한 번도 가지 않는다(0143:29-31 의 규율과 같다).

```sql
CREATE TABLE IF NOT EXISTS public.interview_transcripts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid        NOT NULL UNIQUE REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  -- 담기로 만든 레코드. 레코드를 지우면 대화록도 지워진다(D5 '사용자 삭제는 실제 삭제').
  record_id     uuid        NOT NULL UNIQUE REFERENCES public.records(id) ON DELETE CASCADE,
  period        text        NOT NULL CHECK (period IN ('infancy','school','twenties','later','work','now')),
  locale        text        NOT NULL CHECK (locale IN ('ko','en')),
  turn_count    smallint    NOT NULL CHECK (turn_count BETWEEN 1 AND 4000),
  -- D4: 저장 때 위기 판정(createRecord 의 C9)이면 대화록 전체를 AI 처리에서 뺀다.
  ai_hold       boolean     NOT NULL DEFAULT false,
  -- D5: 앱은 원문을 고치지 않고 새 판을 더한다. 지금은 새 판을 만드는 길이 없다(예약 열).
  superseded_by uuid        NULL REFERENCES public.interview_transcripts(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_transcript_turns (
  transcript_id   uuid     NOT NULL REFERENCES public.interview_transcripts(id) ON DELETE CASCADE,
  user_id         uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- RLS · 삭제 등록부용
  turn_no         integer  NOT NULL CHECK (turn_no BETWEEN 1 AND 4000),   -- 판정 원장 turn_no(integer)와 같은 형(FK)
  role            text     NOT NULL CHECK (role IN ('interviewer','user')),
  scene_seq       smallint NOT NULL CHECK (scene_seq BETWEEN 1 AND 10000),
  asked_layer     text     NULL CHECK (asked_layer IN ('fact','feeling','meaning','belief','echo')),
  -- 질문 턴: 누가 쓴 문장인가. model = LLM 질문, fixed = 씨앗 · 발판 · 되묻기 · 대체 질문.
  -- 답 턴: 언제나 user. (위키에 쌓이는 것이 "그 사람이 실제로 한 말"인지 가리기 위해, interview.tsx:787-790)
  origin          text     NOT NULL CHECK (origin IN ('user','model','fixed')),
  ask_kind        text     NULL CHECK (ask_kind IN ('seed','drill','scaffold','confirm','loop_check','switch_offer','fallback')),
  opener_unedited boolean  NULL,                        -- 답 턴만
  text            text     NOT NULL CHECK (char_length(text) BETWEEN 1 AND 8000),
  ai_hold         boolean  NOT NULL DEFAULT false,      -- D4 턴 단위(Q13: red 답 턴을 남길 때)
  PRIMARY KEY (transcript_id, turn_no),
  CHECK ((role = 'user') = (origin = 'user')),
  CHECK (role = 'user' OR opener_unedited IS NULL)
);
CREATE INDEX IF NOT EXISTS interview_transcripts_user_idx ON public.interview_transcripts (user_id, period, created_at);

-- 원문은 앱이 고치지 않는다: UPDATE 는 누구에게도 없다(SECURITY DEFINER 함수 제외 — 그 함수도 쓰지 않는다).
ALTER TABLE public.interview_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcripts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcript_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcript_turns FORCE ROW LEVEL SECURITY;
CREATE POLICY interview_transcripts_select_own ON public.interview_transcripts
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY interview_transcripts_delete_own ON public.interview_transcripts
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY interview_transcript_turns_select_own ON public.interview_transcript_turns
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY interview_transcript_turns_delete_own ON public.interview_transcript_turns
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
REVOKE ALL ON TABLE public.interview_transcripts, public.interview_transcript_turns
  FROM PUBLIC, anon, authenticated, service_role;
-- 끝의 권한 블록: GRANT SELECT, DELETE ... TO authenticated; GRANT SELECT ... TO service_role;
```

**원문이 두 벌이 되는 과도기 (Q3).** 담기는 지금처럼 `createRecord` 가 `records.body` 에 같은 대화를 한 덩어리로 쓴다(`records.body` 를 읽는 곳 — 북극성 근거 `0218` · 시기 제안 `seven-proposal-context.ts:98-106` · 임베딩 · 위키 — 을 이번에 바꾸지 않기 위해). 그래서:

- **원본은 턴 표, `records.body` 는 그 파생본**으로 정의한다. `commit` 이 `records.body` 가 턴 목록을 정해진 형식(`질문: …` / `답변: …`, en `Q:` / `A:`, 빈 줄 구분 — `interview.tsx:641-645` 와 같은 식)으로 이어 붙인 것과 **바이트 단위로 같은지** 확인하고 다르면 거절한다. 렌더러는 TS 한 곳(`src/lib/interview/transcript.ts` 신설)과 그 SQL 사본이고, 둘의 출력 대조를 테스트로 박는다(T-13).
- S2 에서 `records.body` 읽는 쪽을 읽기 계층 R 로 옮기면 인터뷰 레코드의 body 는 생성물이 되거나 비워진다. 그 전까지 두 벌은 "같은 내용을 commit 이 확인한 상태"로만 존재한다.
- 레코드 편집으로 body 가 바뀌면 턴 표와 어긋난다(지금 레코드는 `records_owner_all FOR ALL`). D5 의 '새 판 추가'는 S2 범위라 여기서는 막지 않고 **어긋남을 집계 쿼리로 셀 수 있게만** 둔다(미해결, Q3).

### 2.4 제안·결정 원장 — `period_card_proposals` (D6 신설, RD-261007-04 + 03:00 보정의 "한 저장소")

제안 1건 = 1행. 승인 · 거절 · 빗나간 곳은 **같은 행의 상태**다. 승인된 행의 `proposal_text` 가 곧 '그때의 나' 문장이다.

```sql
CREATE TABLE IF NOT EXISTS public.period_card_proposals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_kind       text        NOT NULL DEFAULT 'period' CHECK (card_kind IN ('period')),  -- 북극성 카드는 Q16
  star_id         text        NOT NULL CHECK (star_id IN ('infancy','school','twenties','later','work','now')),
  request_key     text        NOT NULL CHECK (char_length(request_key) BETWEEN 8 AND 120),
  audit_id        uuid        NULL,                     -- self_model_propose 호출의 감사 행(FK 없음: 감사 행은 계정 삭제 뒤에도 남는다)
  vendor          text        NOT NULL CHECK (vendor IN ('openai','claude')),
  proposal_text   text        NOT NULL CHECK (char_length(proposal_text) BETWEEN 1 AND 280),   -- propose-self-model.ts:99
  rationale       text        NULL     CHECK (char_length(rationale) <= 600),                 -- propose-self-model.ts:100
  -- 서버가 모델에 보낸 근거(프록시가 프롬프트 안에서 확인한 표식). 턴 단위: record:<uuid>#t<n>
  evidence_sent   text[]      NOT NULL,
  -- 모델이 인용했고 evidence_sent 안에 있는 것만. 비면 행을 만들지 않는다.
  evidence_cited  text[]      NOT NULL,
  content_sha     text        NOT NULL CHECK (content_sha ~ '^[0-9a-f]{64}$'),  -- CAS 대조값(3.7)
  level_before    smallint    NOT NULL CHECK (level_before BETWEEN 1 AND 5),
  status          text        NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','ratified','declined','missed','expired','void')),
  miss_text       text        NULL CHECK (char_length(miss_text) BETWEEN 1 AND 500),  -- '빗나간 곳'(사용자 원문)
  miss_ai_hold    boolean     NOT NULL DEFAULT false,                                -- D4: 위기 판정이면 AI 입력에서 뺌
  decided_at      timestamptz NULL,
  superseded_by   uuid        NULL REFERENCES public.period_card_proposals(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key),
  CHECK (cardinality(evidence_sent) BETWEEN 1 AND 40),
  CHECK (cardinality(evidence_cited) BETWEEN 1 AND 40 AND evidence_cited <@ evidence_sent),
  CHECK (array_to_string(evidence_sent, ',') ~ '^record:[0-9a-f-]{36}(#t[0-9]{1,4})?(,record:[0-9a-f-]{36}(#t[0-9]{1,4})?)*$'),
  CHECK ((status = 'missed') = (miss_text IS NOT NULL)),
  CHECK ((status = 'proposed') = (decided_at IS NULL)),
  CHECK (superseded_by IS NULL OR status = 'ratified')
);
-- 별마다 '지금 서 있는' 승인 카드는 하나, 결정을 기다리는 제안도 하나.
CREATE UNIQUE INDEX IF NOT EXISTS period_card_current_ratified
  ON public.period_card_proposals (user_id, star_id) WHERE status = 'ratified' AND superseded_by IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS period_card_one_open
  ON public.period_card_proposals (user_id, star_id) WHERE status = 'proposed';

ALTER TABLE public.period_card_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_card_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY period_card_proposals_select_own ON public.period_card_proposals
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY period_card_proposals_delete_own ON public.period_card_proposals
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
REVOKE ALL ON TABLE public.period_card_proposals FROM PUBLIC, anon, authenticated, service_role;
-- 끝의 권한 블록: GRANT SELECT, DELETE TO authenticated; GRANT SELECT TO service_role.
```

- 인용 형식 `record:<uuid>#t<n>` 은 지금 쓰기 경계의 정규식(`record-star-tiers.ts:43-44` `RESOLVABLE_CITATION`, `#` 허용)을 그대로 통과한다. 그래서 `star_tier_history.evidence_citations` 에 바뀐 것 없이 실린다.
- RD-261007-04: 북극성 카드의 LLM 입력에는 "승인된 시기 카드가 인용한 원문 발췌"를 싣는다 → `evidence_cited` 가 턴 단위라 그 발췌를 정확히 짚을 수 있다(북극성 쪽 배선은 범위 밖).

### 2.5 소유자 없는 집계 — `interview_unsaved_rollup` (D6 신설, 03:00 보정)

저장하지 않은 세션(명시적 저장 안 함 · 담기 없이 떠남 · 앱 종료)과, 저장했다가 레코드를 지운 세션을 접어 넣는 곳. **소유자 열 · 세션 id · 원문 · 해시 · 시각이 없다.** 주(KST 월요일) 단위다.

```sql
CREATE TABLE IF NOT EXISTS public.interview_unsaved_rollup (
  week_kst        date     NOT NULL CHECK (extract(isodow FROM week_kst) = 1),
  period          text     NOT NULL CHECK (period IN ('infancy','school','twenties','later','work','now')),
  locale          text     NOT NULL CHECK (locale IN ('ko','en')),
  vendor          text     NOT NULL CHECK (vendor IN ('openai','claude','mock','none')),
  rule_set        text     NOT NULL CHECK (rule_set ~ '^r[0-9]{1,3}[a-z0-9-]{0,16}$'),
  outcome         text     NOT NULL CHECK (outcome IN ('left','discarded','deleted_after_save')),
  end_reason      text     NOT NULL CHECK (end_reason IN (
                    'complete','user_end','user_stop','skip_exhausted','scaffold_exhausted','verdict_exhausted',
                    'switch_declined','no_question','day_limit','crisis','error','left')),
  sessions        integer  NOT NULL DEFAULT 0 CHECK (sessions >= 0),
  scenes          integer  NOT NULL DEFAULT 0 CHECK (scenes >= 0),
  scenes_hist     integer[] NOT NULL DEFAULT '{0,0,0,0,0,0}',   -- 세션당 장면 1,2,3,4,5,6+
  depth_hist      integer[] NOT NULL DEFAULT '{0,0,0,0,0,0}',   -- 장면 도달 깊이 0..5
  judged          integer  NOT NULL DEFAULT 0,                  -- 프록시 행
  v_credited      integer  NOT NULL DEFAULT 0,
  v_none          integer  NOT NULL DEFAULT 0,
  v_other_layer   integer  NOT NULL DEFAULT 0,
  v_no_verdict    integer  NOT NULL DEFAULT 0,
  v_unasked       integer  NOT NULL DEFAULT 0,
  v_error         integer  NOT NULL DEFAULT 0,
  final_credit    integer  NOT NULL DEFAULT 0,
  gate_short      integer  NOT NULL DEFAULT 0,
  gate_untrusted  integer  NOT NULL DEFAULT 0,                  -- mismatch + unverified
  local_blocks    integer  NOT NULL DEFAULT 0,                  -- 세션 행의 클라이언트 보고 셈
  scaffold_answers   integer NOT NULL DEFAULT 0,
  scaffold_recovered integer NOT NULL DEFAULT 0,
  opener_unedited    integer NOT NULL DEFAULT 0,
  openers_offered    integer NOT NULL DEFAULT 0,
  layer_judged       integer[] NOT NULL DEFAULT '{0,0,0,0,0}',  -- 층별(fact..echo)
  layer_other        integer[] NOT NULL DEFAULT '{0,0,0,0,0}',
  layer_no_verdict   integer[] NOT NULL DEFAULT '{0,0,0,0,0}',
  layer_credited     integer[] NOT NULL DEFAULT '{0,0,0,0,0}',
  PRIMARY KEY (week_kst, period, locale, vendor, rule_set, outcome, end_reason),
  CHECK (cardinality(scenes_hist) = 6 AND cardinality(depth_hist) = 6
     AND cardinality(layer_judged) = 5 AND cardinality(layer_other) = 5
     AND cardinality(layer_no_verdict) = 5 AND cardinality(layer_credited) = 5)
);
ALTER TABLE public.interview_unsaved_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_unsaved_rollup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.interview_unsaved_rollup FROM PUBLIC, anon, authenticated, service_role;
-- 끝의 권한 블록: GRANT SELECT TO service_role. 쓰기는 fold 함수(SECURITY DEFINER)만.
```

- `text` 열은 전부 CHECK 열거값이다. 사후 조건 DO 블록이 "이 표에 열거값 아닌 text 열 0개"를 확인한다(T-15, 하지 말 것 "집계 행에 원문 금지").
- 소유자 열이 없으니 삭제 등록부 생성기(`scripts/generate-erasure-registry.ts`, "소유자 열을 가진 public 표")의 대상이 아니다.
- 한계(추론): 감사 행은 C3 로 사용자 · 시각 · purpose 를 계속 갖는다(`erasure-registry.json:44-48` retained). 사용자가 아주 적은 동안 "그 주 그 시기"의 집계 칸을 감사 행과 대조하면 누구의 대화인지 짐작할 수 있다. 그래서 주 단위로 접고, 보고 때 5세션 미만 칸을 가린다(Q7).

### 2.6 응답이 쓴 블록 id — `ai_audit_context_blocks` (D6 신설, 계약만 · R 이 채움)

02:42 메모 "R 출력에 응답이 사용한 블록 id 목록(내용 없이)". 읽기 계층 R 은 기준 커밋에 아직 없다(`git grep '읽기 계층|block_id'` 0건). 여기서는 감사 쪽 자리와 프록시 쓰기만 정한다.

```sql
CREATE TABLE IF NOT EXISTS public.ai_audit_context_blocks (
  audit_id       uuid        PRIMARY KEY REFERENCES public.ai_audit_log(id) ON DELETE CASCADE,
  purpose        text        NOT NULL CHECK (purpose IN ('secondb_chat')),
  reader_version text        NOT NULL CHECK (reader_version ~ '^r[0-9]{1,4}$'),
  -- R 이 이번 응답의 문맥에 실은 블록. id 만, 내용 없음.
  block_ids      text[]      NOT NULL CHECK (cardinality(block_ids) <= 64),
  -- 응답 형식이 인용을 내면 그것(블록 id 의 부분집합). 없으면 NULL.
  cited_ids      text[]      NULL CHECK (cited_ids IS NULL OR cited_ids <@ block_ids),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (array_to_string(block_ids, ',') ~ '^$|^(record|wiki|card|idcard|source):[A-Za-z0-9._#-]{1,120}(,(record|wiki|card|idcard|source):[A-Za-z0-9._#-]{1,120})*$')
);
ALTER TABLE public.ai_audit_context_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_context_blocks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_audit_context_blocks FROM PUBLIC, anon, authenticated, service_role;
-- 끝의 권한 블록: GRANT SELECT TO service_role. 쓰기는 record_context_blocks(3.8)만. 보관 90일(2.8).
```

- 소유자 열을 두지 않는다. 사용자는 감사 행(`user_id`)으로만 이어지고, 행의 수명은 감사 행(연쇄)과 90일 정리 중 짧은 쪽이다.
- 블록 id 접두사(`record:` · `wiki:` · `card:` · `idcard:` · `source:`)는 **제안**이다. R 의 블록 모양이 정해지면 그쪽 형식을 따른다(Q10).

### 2.7 트리거 — 레코드를 지우면 (D5)

```sql
-- 인터뷰 레코드를 지우면: 그 세션의 판정 행을 집계로 접고(outcome deleted_after_save), 감사 행 해시를 비우고,
-- 판정 행 · 세션 행을 지운다. 대화록은 records FK 연쇄로 지워진다. 그 레코드를 인용한 시기 카드는 void.
CREATE FUNCTION public.interview_record_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ ... $$;
CREATE TRIGGER interview_record_erasure BEFORE DELETE ON public.records
  FOR EACH ROW WHEN (OLD.kind = 'audit_response')
  EXECUTE FUNCTION public.interview_record_erasure();
```

- 순서: 0195 의 `lock_polaris_record_erasure`(BEFORE DELETE 문장 단위)가 먼저 잠금을 잡고, 이 행 단위 트리거가 그 뒤에 돈다(`0195:369-372`). 행 단위 BEFORE 라 FK 연쇄보다 먼저 fold 할 수 있다.
- 시기 카드: 인용(`evidence_cited`)에 `record:<OLD.id>` 로 시작하는 것이 있으면 `proposed` 는 `void`, `ratified` 는 행을 지운다(0195 `erase_polaris_record_evidence` 가 역할 카드를 지우는 것과 같은 규율, `0195:352-365`). 그 카드가 만든 `star_tier_history` 의 `ratify` 행도 같은 인용으로 찾아 지운다 → **그 별이 L5 에서 내려온다.** 칸(`interview_coverage`)은 건드리지 않는다. 둘 다 밝기에 닿는 일이라 Q5 로 확인받는다.

### 2.8 RLS · 권한 · 삭제 등록부 · 보관 기간

| 표 | 클라이언트 | service_role | 삭제 등록부(제안) | 보관 |
|---|---|---|---|---|
| `interview_sessions` | 없음(RPC 만) | SELECT | `account_delete_only`(0220 의 0229 제안 그대로). 사유에 "레코드 삭제 트리거 · fold 가 지운다" 를 적는다 | 담은 세션: 레코드와 같이. 안 담은 세션: 마지막 활동 6시간 뒤 fold(Q6) |
| `interview_probe_verdicts` | 없음 | SELECT | 소유자 열 없음 → 등록부 밖(0220 과 같음). 세션 FK 연쇄 | 세션과 같이 |
| `interview_transcripts` | SELECT · DELETE(본인) | SELECT | `client_erasable`, order 29(records 30 앞, `erasure-registry.json:284-288`) | 레코드와 같이 |
| `interview_transcript_turns` | SELECT · DELETE(본인) | SELECT | `client_erasable`, order 28 | 레코드와 같이 |
| `period_card_proposals` | SELECT · DELETE(본인) | SELECT | `client_erasable`, order 49(star_tier_history 50 앞) | 승인: 계정 · 근거 삭제 때까지. 미결: 30일 뒤 `expired`. 거절 · 빗나감 · 만료 · void: 365일 뒤 삭제(Q15) |
| `interview_unsaved_rollup` | 없음 | SELECT | 소유자 없음 → 등록부 밖 | 730일(0063 `purge_star_tier_history(730)` 과 같은 길이) |
| `ai_audit_context_blocks` | 없음 | SELECT | 소유자 없음 → 등록부 밖. 감사 행 연쇄 | 90일 |
| `interview_coverage`(0143) | 0227 뒤 SELECT 만 | — | `account_delete_only` 그대로(`erasure-registry.json:168-172`) | 그대로 |
| `star_tier_history`(0045) | 0227 뒤 SELECT · DELETE · INSERT(`ratify` 아닌 행) | — | `client_erasable` 그대로(DELETE 정책 유지라 G3 통과, `erasure-registry.json:351-355`) | 0063 그대로 |

- 등록부 행은 0225 가 아니라 **등록부 전용 파일 0226** 이 더한다(0195 · 0198 · 0220 의 0229 와 같은 분리 — 0189 롤백이 그 파일만 다시 적용할 수 있게, `scripts/erasure-registry-forward.ts` G7).
- `client_erasable` 은 G3 가 DELETE 정책을 요구하므로 대화록 두 표 · 제안 표에 본인 DELETE 정책을 둔다. 턴 하나를 따로 지우면 그 턴의 판정 행도 FK 연쇄로 지워진다(D5 "원장 참조에도 같은 규칙").

### 2.9 0218 `records.system_tags` 와의 관계

- 03:08: #2122(0218)는 D6 착수 전에 머지한다. D6 은 0218 을 **전제**로 한다(사전 조건 DO 블록이 `records.system_tags` 존재를 확인).
- `commit_interview_session` 은 받은 `record_id` 가 `system_tags @> '{interview}'` · `kind = 'audit_response'` · `audit_period = 세션 시기` · `client_request_id = 'interview:' || 세션 id` 인지 확인한다. `tags`(사용자 태그)는 읽지 않는다 — 0218 이 없앤 결함을 다시 들이지 않기 위해.
- D6 은 레코드에 새 표식을 더하지 않는다. 대화록 · 판정과 레코드의 연결은 FK 다. 표식이 필요해지면 `system_tags`(0218 모양 제약: 16개 이하, `[A-Za-z0-9_.:-]{1,64}`)에 쓴다.
- 시기 제안 근거는 #2122 뒤 `system_tags` 에서 찾는다(#2122 diff `seven-proposal-context.ts` hunk). D6 은 그 위에서 레코드 단위를 **턴 단위**로 바꾼다(4절).
- 롤백 순서: 0225 를 먼저 내리고 0218 을 내린다(0218_down 이 표식을 `tags` 로 되돌리면 commit 의 확인이 실패한다).

---

## 3. 서버 쪽

### 3.1 프록시가 판정을 기록하는 지점

| 프록시 | 자리 | 근거 |
|---|---|---|
| openai-proxy | 감사 행 insert(`index.ts:1095-1119`) · 동의 재확인(`:1128-1133`) **뒤**, 응답(`:1135`) **앞** | 0220 브랜치가 같은 자리에 `recordInterviewVerdict` 를 넣었다 |
| claude-proxy | 감사 행(`claude-proxy/index.ts:597`) · 동의 재확인(`:627`) 뒤, 응답(`:633`) 앞 | S0.5 에서 interview_probe · self_model_propose · secondb_chat 이 Claude 로 간다. 지금 좌석 표는 셋 다 claude 가 없다(`_shared/llm-proxy-common.ts:58,66-67`) |

- 공용 모듈 셋: `_shared/interview-verdict.ts`(0220, 확장) · `_shared/period-card-proposal.ts`(신설) · `_shared/context-blocks.ts`(신설). 두 프록시는 같은 한 줄씩만 부른다.
- 규칙: 원장 쓰기 실패는 응답을 막지 않는다(감사 행과 같은 규율). 동의를 철회한 호출(재확인 실패)은 아무것도 쓰지 않는다. 메타가 없거나 어긋나면 쓰지 않는다(옛 앱 호환).
- **메타는 프롬프트에 들어가지 않는다.** 프록시는 `system` · `user` 를 받은 그대로 모델에 보낸다. 판정 원장 · 종료 사유 · 집계 같은 행동 데이터는 어떤 프롬프트에도 실리지 않는다(하지 말 것 "행동 데이터를 interview_probe 문맥에 넣지 않음", T-16).

interview_probe 에서 프록시가 직접 만드는 필드:

| 필드 | 어떻게 |
|---|---|
| `model_layer` · `verdict` | 출력 JSON `answeredLayer`(0220 `readModelLayer` · `judgeVerdict`) |
| `local_gate` | 프롬프트 마지막 줄 `A (<층>): <답>` 이 메타의 답과 같은지 확인 후 같은 함수로 재계산(같지 않으면 `unverified`, 다르면 `mismatch`) |
| `final_credit` | 공용 규칙 모듈 `finalCredit(rule_set, verdict, local_gate)`. `r0` = 지금 화면 규칙 그대로(`credited AND pass`, `continuity.ts:41-45`). 03:00 보정 규칙('애매하면 센다'는 `no_verdict` 에만)은 기준선 뒤 `r1` 로 |
| `openers_offered` | 출력 `openers` 를 `readOpeners` 와 같은 규칙으로 센 수(`probe.ts:568-580`) |
| `answer_digest` | `sha256(session_id + ':' + turn_no + ':' + answerText)`(Deno `crypto.subtle`) |
| `vendor` | 프록시 자신 |

### 3.2 RPC 표

발주 예시 이름과의 대응: `record_interview_turn` → `record_interview_probe_verdict`(0220 이름 유지) · `finish_interview_session` → `close_interview_session`(0220) · `ratify_period_card` + `decide_proposal` → `decide_period_card` 하나(승인 쓰는 길을 둘로 두지 않기 위해).

| 함수 | 호출자 | DEFINER | 인자 | 반환 | 멱등 |
|---|---|---|---|---|---|
| `record_interview_probe_verdict` v2 | 프록시(service_role) | 예 | 0220 의 14개 + `p_turn_no int, p_rule_set text, p_final_credit bool, p_vendor text, p_openers_offered int, p_answer_digest text` | `text`: recorded · replaced · no_account · session_not_owned · session_committed · session_mismatch · scene_regressed · session_full | `audit_id` UNIQUE + `(session_id, turn_no)` UNIQUE: 같은 턴 재호출은 **나중 것이 이김**(`call_count+1`, 앞 `audit_id` 는 `prior_audit_ids` 로) |
| `close_interview_session` | 화면(authenticated) | 예 | 0220 그대로(종료 사유 목록만 2.1) | `text` | 처음 사유가 이김 |
| `commit_interview_session` v2 | 화면 | 예 | `p_session_id uuid, p_record_id uuid, p_turns jsonb, p_crisis_hold boolean DEFAULT false` | `jsonb {status, user_turns, ledger_rows, cells_added, mismatches, orphans}` | 세션당 한 번(`committed_at`). 두 번째는 `already_committed` + 첫 결과 |
| `discard_interview_session` | 화면 | 예 | `p_session_id uuid` | `text`: discarded · not_found · already_committed | 없으면 not_found |
| `record_period_card_proposal` | 프록시 | 예 | `p_user_id uuid, p_audit_id uuid, p_vendor text, p_star text, p_request_key text, p_proposal_text text, p_rationale text, p_sent jsonb, p_cited text[], p_level_before int` | `jsonb {proposal_id, content_sha}` 또는 `{status:'rejected', reason}` | `(user_id, request_key)` UNIQUE |
| `decide_period_card` | 화면 | 예 | `p_proposal_id uuid, p_expected_sha text, p_decision text, p_miss_text text DEFAULT NULL, p_miss_ai_hold boolean DEFAULT false` | `jsonb {status, level, was_l5_before}` | 같은 결정 재호출 = 같은 결과 |
| `record_context_blocks` | 프록시 | 예 | `p_audit_id uuid, p_purpose text, p_reader_version text, p_block_ids text[], p_cited_ids text[]` | `text` | `audit_id` PK, `ON CONFLICT DO NOTHING` |
| `export_my_interview_judgements` | 본인(authenticated) | 예(`owner_id = auth.uid()` 고정) | `p_since timestamptz` | `TABLE(...)`(7.3) | 읽기 전용(`STABLE`) |
| `fold_interview_session` | 내부 | 예 | `p_session_id uuid, p_outcome text` | `void` | 없으면 아무것도 안 함 |
| `sweep_interview_sessions` | pg_cron · service_role | 예 | `p_batch int DEFAULT 5000` | `int` | `FOR UPDATE SKIP LOCKED` |
| `erase_audit_hashes` | 내부 | 예 | `p_ids uuid[], p_purpose text` | `int` | 이미 비운 행은 그대로 |

공통: `SET search_path = ''`, 객체는 모두 `public.`/`pg_catalog.` 로 적는다. service_role 전용 함수는 첫 줄에서 `public.billing_request_role() IS DISTINCT FROM 'service_role'` 이면 42501(0220 과 같은 관용구). 권한: 프록시 전용은 `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`, 화면용은 `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`, 내부용은 `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role`.

### 3.3 `commit_interview_session` v2 — 칸을 서버가 계산한다

`p_turns` 원소: `{n, role, scene, layer, ask_kind, origin, text, opener_unedited, state}` — `state` 는 답 턴만 `judged` · `unsettled` · `local_block` · `control`.

1. `auth.uid()` 필수. 세션을 `FOR UPDATE`, `owner_id = auth.uid()` · `committed_at IS NULL` 확인(이미 담았으면 `already_committed`). 세션 행이 없으면(유휴 6시간으로 이미 접힘, Q6) 2단계의 레코드 확인을 통과할 때만 세션 행을 새로 만들고 모든 답 턴을 클라이언트 행(`unrecorded`)으로 채운다 — 대화록은 남고 칸은 0, 상태 `ledger_expired`.
2. 레코드 확인: `user_id = auth.uid()`, `kind = 'audit_response'`, `system_tags @> '{interview}'`, `audit_period = 세션 시기`, `client_request_id = 'interview:' || p_session_id`.
3. 턴 확인: 1..4000개, `n` 이 1부터 빈틈없이, 역할 · 길이 · 열거값. 렌더링한 본문이 `records.body` 와 같은지(2.3). 다르면 `transcript_mismatch` 로 거절.
4. 대화록 머리 · 턴 insert. `p_crisis_hold` 면 `interview_transcripts.ai_hold = true`.
5. **판정 행 맞추기** — 답 턴마다 정확히 한 행:
   - 그 `turn_no` 의 프록시 행이 있으면 `answer_digest` 와 `sha256(세션:n:text)` 대조 → 같으면 `link_state = linked`(단 `state = unsettled` 면 `undelivered` — 화면이 그 응답을 못 받고 다시 물은 턴), 다르면 `text_mismatch`. `transcript_id` 를 채우고 `answer_digest` 를 비운다.
   - 없으면 클라이언트 행을 넣는다: `local_block` → `local_block`, `control` → `control`, `unsettled` → `error`, `judged` → `unrecorded`(프록시가 못 쓴 호출: 옛 프록시 · 쓰기 실패 · 모의 모드). `source = client`, `final_credit = false`, `link_state = linked`.
   - 대화록에 없는 턴 번호의 프록시 행(화면이 버린 늦은 응답 등)은 `orphan`, `transcript_id` NULL.
6. 칸: `final_credit AND link_state = 'linked' AND (ended_at IS NULL OR created_at <= ended_at)` 인 행을 `(asked_layer)` 로 묶어 **장면마다 층당 1** 을 `interview_coverage` 에 원자적으로 더한다(0220 `commit` 의 CTE 그대로, LAST-04 해소). `p_crisis_hold` 면 더하지 않는다 — 지금 화면이 저장 시 red 면 칸을 안 쓰는 것과 같다(`interview.tsx:667-670`).
7. `committed_at`, `record_id`, 반환. 반환의 `ledger_rows` 는 `transcript_id = 이 대화록` 인 판정 행 수, `user_turns` 는 답 턴 수 — **둘이 같아야 하고 함수가 끝에서 확인한다**(완료조건 1의 서버 쪽 불변식).

### 3.4 `fold_interview_session` · `sweep_interview_sessions` · `discard_interview_session` — D2 흔적 0

```
fold(session, outcome):
  ① 세션 · 판정 행을 주(KST) × 시기 × 언어 × 벤더 × 규칙 판 × outcome × 종료 사유(없으면 'left')로 세어
     interview_unsaved_rollup 에 upsert(+=). 원문 · id · 시각은 넘기지 않는다.
  ② 판정 행의 audit_id ∪ prior_audit_ids → erase_audit_hashes(…, 'interview_probe')
  ③ 판정 행 삭제 → 세션 행 삭제(대화록이 있으면 레코드 FK 연쇄가 따로 지운다)
sweep: committed_at IS NULL AND last_seen_at < now() - 6h → fold(…, 'left')   ← 매시(0220 의 cron 자리 재사용)
discard: 본인 · 미커밋 → fold(…, 'discarded')                                  ← 화면이 저장 없이 떠날 때 바로
```

- `erase_audit_hashes`: `UPDATE ai_audit_log SET prompt_hash = '', output_hash = '' WHERE id = ANY(p_ids) AND purpose = p_purpose`. 두 열은 `NOT NULL` 이라(`db/migrations/0004_ai_audit_log.sql:10-11`) 빈 문자열로 둔다. 감사 행 자체 · 사용자 · 시각 · 토큰은 남는다(C3 를 약하게 하지 않는다, D2 원문). 링크 스크랩(D2, S6a)도 같은 함수를 써야 한다(Q8).
- 한계: 프록시가 판정 행을 못 쓴 호출(쓰기 실패)의 감사 행은 세션과 이어지지 않아 해시가 남는다. 감사 행에 `session_id` 를 두지 않는 이상 막을 수 없다(미해결, 수치는 `unrecorded` 로 셀 수 있다).

### 3.5 `record_period_card_proposal` — 근거는 "모델이 인용했고 서버가 보낸 집합 안"

프록시(self_model_propose, 메타 `periodCard: {star, requestKey, levelBefore, sent: [{ref, len, sha256}]}`):

1. `sent` 의 각 `ref` 가 전달할 user 프롬프트 안에 `[record:<id>#t<n>]` 표식으로 실제로 있는지 확인. 없는 ref 는 버린다(= 서버가 보낸 집합).
2. 모델 응답 파싱(`after` · `rationale` · `citations`) — `parseSelfModelProposal` 과 같은 규칙, 같은 어휘 검사(`isPresentableProposal`). 통과 못 하면 행을 만들지 않는다(화면이 걸러 낸 제안이 원장에 '미결'로 남지 않게).
3. `cited = citations ∩ sent`. `record:<id>` 처럼 턴 번호 없이 인용하면 그 레코드의 보낸 턴 전부로 펼친다. 비면 행 없음.
4. RPC: 각 ref 가 본인 레코드 · `audit_response` · `system_tags @> {interview}` · 그 별의 시기 · 대화록 턴 존재 · 답 턴 · `ai_hold = false` 인지 확인하고, `sha256(left(턴 text, len))` 이 보낸 해시와 같은지 대조(발췌 해시, Q9 B). 하나라도 틀리면 그 ref 를 `sent` 에서 뺀다. 같은 별의 이전 `proposed` 는 `expired`. insert, `content_sha = sha256(proposal_text ‖ rationale ‖ cited)`.
5. 응답 JSON 에 `periodCardProposalId` · `contentSha` 를 더한다(추가 필드, 옛 화면은 무시).

### 3.6 `decide_period_card` — 0195 `ratify_polaris_role_card` 의 규율 재사용

| 단계 | 0195 원본 | 여기 |
|---|---|---|
| 소유자 | `auth.uid() IS DISTINCT FROM p_user_id` → 42501(`0195:303`) | 행의 `user_id = auth.uid()` 아니면 `not_found`(남의 제안 존재를 드러내지 않음) |
| 계정 살아 있음 | `assert_polaris_account_active`(`0195:61-70,304`) | 같은 함수 재사용(이름은 polaris 지만 내용은 삭제 펜스 공용) |
| 직렬화 | `pg_advisory_xact_lock(hashtext('polaris:'…))`(`0195:306`) | `hashtext('period_card:' || uid)` |
| CAS | 카드 내용(`-'status'`)이 같아야(`0195:311-312`) | `p_expected_sha = content_sha` 아니면 `period_card_changed` |
| 상태 검사 | 이미 ratified 면 return, proposed 아니면 오류(`0195:314-315`) | 같은 결정이면 같은 결과, `proposed` 아니면 `invalid_period_card` |

결정별:

- `ratified`: 인용 근거가 아직 있는지 다시 확인(없으면 `void` + `period_card_evidence_changed`). 같은 별의 지금 승인 카드에 `superseded_by = 이 id`. 이 행 `ratified`. **서버가** `star_tier_history` 에 `(user_id, 'seven:'||star_id, 5, 'ratify', evidence_cited)` insert. 반환 `was_l5_before` 는 쓰기 전 `ratify` 행 유무(지금 화면이 쓰기 전에 읽어 L5 소리를 정하는 것, `DeepSpaceDesignScreens.tsx:2004-2011`).
- `declined`: 상태만.
- `missed`: `p_miss_text` 1..500자 필수, `miss_ai_hold` 는 화면의 C9 분류 결과(서버는 의미 분류를 못 한다 — LLM 경로는 어차피 경계 모듈과 프록시의 위기 검사를 다시 지난다).
- 레벨: 승인 = 5(`applyRatify` 의 승인 결과, `DeepSpaceDesignScreens.tsx:1851-1853`), 그 밖 = 변화 없음.

### 3.7 `record_context_blocks`

프록시(secondb_chat, 메타 `contextBlocks: {readerVersion, blockIds, citedIds?}`)가 감사 행 뒤에 부른다. 형식이 맞지 않는 id 는 통째로 버린다(내용 문자열이 섞여 들어오는 것을 막기 위해 — 정규식이 접두사 + 120자 제한). `cited ⊄ block_ids` 면 `cited` 만 버린다.

### 3.8 cron

| 이름 | 주기 | 함수 |
|---|---|---|
| `sweep-interview-sessions` | 매시 23분(0220 의 `anonymize-interview-sessions` 를 교체) | `sweep_interview_sessions()` |
| `expire-period-card-proposals` | 매일 | `proposed` 30일 → `expired`, 결정된 비승인 365일 → 삭제 |
| `purge-interview-rollup` | 매일 | 730일 지난 주 |
| `purge-ai-audit-context-blocks` | 매일 | 90일 지난 행 |

---

## 4. 클라이언트 변경 범위 (데이터 층만 · 화면은 UI 세션)

### 4.1 데이터 층 파일 (재설계 세션 몫)

| 파일 | 바뀌는 것 |
|---|---|
| `src/lib/interview/verdict-ledger.ts` (0220 브랜치) | 메타에 `turnNo`. 열거값에 `local_block` · `control` · `unrecorded` · `switch_offer` · `switch_declined`. `INTERVIEW_RULE_SET = 'r0'` |
| `src/lib/interview/answer-gate.ts` (0220 브랜치) | `finalCredit(ruleSet, verdict, localGate)` — 화면 · 프록시가 같은 함수. `r0` = `continuity.ts:41-45` 와 같은 결과(테스트로 대조) |
| `src/lib/interview/session-ledger.ts` (0220 브랜치) | `saveInterview({sessionId, turns, …})` = `createRecord(clientRequestId: 'interview:'+세션)`(`src/lib/records/create.ts:337`, 0178 재시도 안전) → `commit_interview_session` v2. `discardInterviewSession`. 0220 의 `needsClientCoverageFallback` 는 0227 전까지만 |
| `src/lib/interview/transcript.ts` (신설) | 턴 목록 ⇄ 본문 렌더러 하나(`interview.tsx:641-645` 의 식을 옮김), `turnsForCommit(history)` |
| `src/lib/interview/probe.ts` | `InterviewTurn` 에 `askKind` · `origin` · `openerUnedited` 타입만(세션 메모리 필드). 프롬프트 조립은 그대로 |
| `src/lib/interview/coverage-store.ts` | `addCoverage` 삭제(0227 전 폴백은 `session-ledger.ts` 안으로). `loadCoverage` 그대로 |
| `src/lib/persona/period-cards.ts` (신설) | `decidePeriodCard(...)` RPC 래퍼, `loadRatifiedPeriodCards(userId)`(승인 문장 읽기) |
| `src/lib/persona/seven-proposal-context.ts` | 근거를 **턴 단위**로: `interview_transcript_turns`(답 턴, `ai_hold = false`)에서 `[record:<id>#t<n>]` 블록을 만들고, `sent` 목록(ref · 길이 · 해시)을 함께 돌려줌. 대화록이 없는 옛 레코드는 레코드 단위 폴백 |
| `src/lib/persona/propose-self-model.ts` | `sevenStar` 대상일 때 `periodCard` 메타를 실어 보내고 응답의 `periodCardProposalId` · `contentSha` 를 제안에 붙임 |
| `src/lib/persona/seven-tier-history.ts` | `recordSevenTiers` 의 origin 에서 `ratify` 제거(`interview` · `rebuild` 만). `loadSevenRatified` 그대로 |
| `src/lib/persona/record-star-tiers.ts` | origin `ratify` 를 거부(false). 옛 축은 RD-261007-04 로 동결 |
| `src/lib/llm/types.ts` · `boundary.ts` | `interviewTurn`(0220) · `periodCard` · `contextBlocks` 메타를 **해당 purpose 일 때만** 본문에 실음, 응답 추가 필드 통과 |
| `supabase/functions/_shared/interview-verdict.ts` · `period-card-proposal.ts` · `context-blocks.ts` + 두 프록시 각 한 줄 | 3.1 |

Context Guardian 규칙(세션당 수정 파일 5개)에 맞춰 PR 을 나눈다: ① DB(0225 · 0226 + SQL 회귀) ② 프록시 공용 모듈 ③ 인터뷰 데이터 층 ④ 비준 데이터 층 ⑤ 0227. ③ · ④ 는 0220 브랜치 파일과 겹치므로 Q1 뒤에 연다(분업 규칙 "겹치면 멈추고 묻는다", DECISIONS `26.10.07 01:12`).

### 4.2 직접 쓰기를 없애는 경로

| 지금 직접 쓰기 | 바뀐 뒤 | 언제 막히나 |
|---|---|---|
| `interview.tsx:680` `addCoverage` → `interview_coverage` upsert | `commit_interview_session` 이 계산 | 0227(INSERT · UPDATE 회수 + 정책 삭제) |
| `DeepSpaceDesignScreens.tsx:2010` `recordSevenTiers(…, "ratify")` | `decide_period_card` 가 서버에서 insert | 0227(`ratify` INSERT 를 막는 정책) |
| `DeepSpaceDesignScreens.tsx:1997` 옛 축 `recordStarTiers(… origin ratify)` | 없음(동결) — 화면에서 옛 대상 버튼을 내림 | 0227 |
| `interview.tsx:685` `recordSevenTiers` origin `interview` | **그대로 둔다**(8주 그래프용 관측 행. L5 를 만들 수 없고 서버가 같은 문턱을 SQL 로 한 벌 더 갖지 않게 — STATE 지표 8 "문턱 정의 위치") | 막지 않음 |

### 4.3 UI 세션에 보낼 발주 (`_sync/TO-CLI.md`, 화면 파일)

1. `src/app/interview.tsx`: 세션 id 생성 · 판정 호출에 메타 · `finish(reason)` → `close_interview_session` · `keepIt` → `saveInterview` · 저장 없이 떠나면 `discardInterviewSession`(저장 안 한 대화는 화면을 떠나면 어차피 다시 담을 수 없다) · (선택) 끝 화면 "저장하지 않고 나가기". ⚠ 0220 브랜치가 이미 이 파일을 107줄 바꿨다(`git diff --stat`) → Q1 뒤.
2. `src/screens/deepspace/DeepSpaceDesignScreens.tsx` /review: `handleDecision` → `decidePeriodCard`, 거절 옆에 "빗나간 곳" 입력(C9 분류 후 보냄), 옛 축 대상 버튼 내리기(RD-261007-04 동결).
3. 문구: B안 말투 · 5개 로케일 대칭. 새 금지어 없음.

---

## 5. 마이그레이션 번호 · 운영 적용 순서 · 롤백

### 5.1 번호 (2026-10-07 03:3x 원격 브랜치 전수 확인)

| 번호 | 상태 |
|---|---|
| 0214 · 0215 | PR-7c(#2110) · main |
| 0216 | main |
| 0217 | `fix/qa261007-delrcpt`(삭제 영수증) |
| 0218 | #2122 |
| 0219 | #2121 |
| 0220 | `fix/qa261007-interview`(판정 원장) — D6 은 쓰지 않음 |
| 0221 | main |
| 0222 | SSV GO-5b 몫으로 잡힘(`docs/HANDOFF.md:100,133`, 로컬 우편함 `_sync/TO-GUI.md:1123` "0214 · 0216~0222 를 다른 작업이 잡아"). ⚠ HANDOFF:133 원문은 "SSV GO-5b 는 **0222 이후**" — GO-5b 가 0222 한 개로 끝나는지 미확인. 0225 를 쓰기 전에 SSV 세션과 확인(Q2) |
| 0223 · 0224 | main(운영 적용 02:30) |
| **0225 · 0226 · 0227** | **비어 있음 → D6 제안** |
| 0228 | `fix/qa261007-delrcpt`(`0228_account_deletion_ops_erasure_registry`) |
| 0229 | **두 브랜치가 같이 씀** — delrcpt(`0229_account_deletion_tombstones_erasure_registry_reason`) · interview(`0229_interview_sessions_erasure_registry`). D6 범위는 아니지만 먼저 머지되는 쪽 뒤에 다른 쪽 CI 가 깨진다(Q2) |
| 0230 · 0231 | main |

| 파일 | 내용 |
|---|---|
| `0225_interview_transcript_ledger.sql` | 사전 조건(0143 · 0195 · 0218 · 0220 표 · `erasure_registry` · pg_cron) → 2.1 · 2.2 변경 → 2.3 ~ 2.6 표 → 2.7 트리거 → 3.2 함수(0220 의 `record_interview_probe_verdict` · `commit_interview_session(uuid)` 옛 시그니처는 **남겨 둔다** — 옛 화면용, 0227 에서 삭제) → cron 교체 → 권한 블록 → 사후 조건 DO |
| `0226_interview_transcript_erasure_registry.sql` | 등록부 행 3개 추가 + `interview_sessions` 사유 갱신(G7 생성 블록, `rollback/0189_down.sql` c_names 에 추가, 등록부 행 수 고정값 이동) |
| `0227_interview_client_write_revoke.sql` | 아래 |

```sql
-- 0227: 새 화면이 웹 게시 · QA APK 에 모두 나가고, 두 프록시가 판정을 쓰는 것이 확인된 뒤에만.
DROP POLICY IF EXISTS interview_coverage_insert_own ON public.interview_coverage;
DROP POLICY IF EXISTS interview_coverage_update_own ON public.interview_coverage;
REVOKE INSERT, UPDATE ON TABLE public.interview_coverage FROM authenticated;

DROP POLICY IF EXISTS star_tier_history_owner_all ON public.star_tier_history;
CREATE POLICY star_tier_history_select_own ON public.star_tier_history
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY star_tier_history_delete_own ON public.star_tier_history          -- client_erasable(G3) 유지
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY star_tier_history_insert_own_observation ON public.star_tier_history
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND evidence_origin IS DISTINCT FROM 'ratify');
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.star_tier_history FROM authenticated;  -- 0060 "Append-only"

DROP FUNCTION IF EXISTS public.commit_interview_session(uuid);      -- 0220 옛 시그니처
-- 사후 조건: authenticated 가 interview_coverage 에 INSERT/UPDATE 권한 0, star_tier_history UPDATE 0,
--            ratify INSERT 를 허용하는 정책 0 — has_table_privilege · pg_policies 로 확인
```

### 5.2 운영 적용 순서 (전부 Simon GO 대상)

```
 0. 선행: #2122 머지 + 0218 적용(03:08) · Q1(0220 과 한 원장) 답 · Q2(0229) 정리
 1. 0220 적용(Q1 = 0220 안에서 고침이면 고친 판)                    ← 2ndb-74 묶음 GO
 2. 0225 + 0226 적용 → 사후 조건 · 읽기 전용 대조(함수 definer · search_path · 권한 · cron 1개)
 3. 프록시 배포: openai-proxy(+ claude-proxy 는 S0.5 좌석 이동과 같은 배포)   ← 배포 먼저
    · 함수가 없으면 쓰기를 건너뛰는 fail-soft 라 순서가 바뀌어도 응답은 안 깨진다
 4. 데이터 층 PR ③ ④ + UI 세션 화면 PR 머지 → 웹 게시(workflow_dispatch publish) → QA APK      ← 화면 나중
 5. QA E2E 1회(6절 T-01 · T-04) · 유료 호출 수 회(interview_probe 1세션)
 6. 기준선 기간(7절) — 규칙 · 층 이름 · 밝기 정의 변경 금지, rule_set 'r0' 고정
 7. 0227 적용 — 조건: 새 앱 비율 확인(옛 앱의 '담기'·승인은 0227 순간 실패 문구로 끝난다)
 8. 기준선 보고 뒤 규칙 r1(03:00 보정: 두 번 시도 뒤 "다른 장면으로 갈까요?" · no_verdict 만 '애매하면 센다')
```

### 5.3 롤백

| 파일 | 하는 일 | 데이터 |
|---|---|---|
| `rollback/0227_down.sql` | `star_tier_history_owner_all FOR ALL` 복원(0061 식), 세 정책 삭제, `interview_coverage` 정책 · GRANT 복원(0143 · 0144 식), 옛 `commit(uuid)` 복원 | 손실 없음 |
| `rollback/0225_down.sql` | 새 함수 · 트리거 · cron · 뷰 삭제, 0220 함수 본문 · cron 복원, 2.1 · 2.2 의 새 CHECK · 열 삭제. **표 다섯 개는 남긴다**(데이터 보존 롤백) | 손실 없음. 표를 지우는 것은 별도 파괴 단계 — 그 전에 승인 카드(`period_card_proposals` status ratified, 사용자 데이터)를 내보낸다 |
| `0226` | 0189 롤백 왕복 목록에 포함(G7) | — |

순서: 0227 → 0225/0226 → (필요하면) 0220 → 0218. 롤백 뒤에도 칸(0143)은 그대로라 밝기는 안 바뀐다. 단, 0225 이후 서버가 쓴 `seven:` `ratify` 행은 남는다(L5 유지).

---

## 6. 완료조건 테스트 목록

| # | 완료조건 / 금지 | 테스트 | 종류 | 무엇을 세나 |
|---|---|---|---|---|
| T-01 | QA E2E 인터뷰 1회 → 판정 원장 행 수 = 사용자 답 턴 수 | `scripts/qa/d6-interview-e2e.ts`(Playwright headless, 커밋된 QA 계정, 웹 게시본) + 읽기 전용 SQL | E2E | 답 3개(판정 2 · '모르겠어요' 1) 후 담기 → `count(verdicts WHERE transcript_id = T)` = `count(turns WHERE transcript_id = T AND role = 'user')` = 3, `source = client` 1행 |
| T-02 | (같은 불변식, 로컬) | `db/tests/d6_interview_ledger_regression.sql` "commit reconciles one row per user turn" | SQL(dry-run 잡) | 프록시 행 n개 + 막힘 m개 + 오류 k개 → `ledger_rows = user_turns`, 늦은 응답 1개 → `orphans = 1` |
| T-03 | (같은 불변식, 화면 쪽) | `src/lib/interview/__tests__/transcript-turns.test.ts` | jest | `turnsForCommit` 의 턴 번호 = 메타의 `turnNo`, 렌더 결과 = `keepIt` 본문 |
| T-04 | 클라이언트가 `interview_coverage` 와 `star_tier_history` `ratify` 행을 직접 쓰는 경로 0 | `db/tests/d6_client_write_revoke_regression.sql` | SQL(RLS) | authenticated 로: coverage INSERT/UPDATE → 42501 · `ratify` INSERT → RLS 위반 · 기존 행 UPDATE → 42501 · `interview` INSERT 성공 · 본인 DELETE 성공 · 남의 행 0 |
| T-05 | (같은 것, 소스) | `src/lib/__tests__/no-client-ledger-writes.test.ts` | jest(정적) | `src/` 에서 `from("interview_coverage")` 뒤 insert/upsert/update 0건, `recordSevenTiers(` · `recordStarTiers(` 에 `ratify` 인자 0건, `evidence_origin: "ratify"` 0건 |
| T-06 | 비준 거절 → 제안·결정 원장 1행 | SQL 회귀 "decline leaves one row" + `src/lib/persona/__tests__/period-cards.test.ts` | SQL + jest | 제안 기록 → `declined` → `request_key` 로 1행 · status declined · `decided_at` 있음, 재호출 같은 결과, `star_tier_history` 0행 증가 |
| T-07 | 승인 = 같은 행 `ratified` + L5 는 서버만 | SQL 회귀 "ratify writes seven: L5 once" | SQL | 1행 ratified · `seven:<별>` ratify 1행 · 인용 = `evidence_cited` · CAS 틀린 sha → `period_card_changed` · 남의 제안 → not_found |
| T-08 | 근거 = 인용 ∩ 보낸 집합 | `supabase/functions/_shared/__tests__/period-card-proposal.test.ts` + SQL CHECK | jest + SQL | 프롬프트에 없는 ref 버림 · 인용 밖 ref 버림 · 비면 행 없음 · `evidence_cited <@ evidence_sent` 위반 insert 실패 |
| T-09 | 세컨비 응답 1회마다 블록 id 가 감사 쪽에 | `context-blocks.test.ts`(jest) + SQL 회귀 + R 배선 뒤 E2E(세컨비 1회 → `ai_audit_context_blocks` 1행, `audit_id` = 그 호출) | jest + SQL + E2E | id 만(내용 문자열 거부), `cited ⊄ block_ids` 거부 |
| T-10 | verify 초록 | `npm run verify` + `check:constraints` · `check:erasure-registry` · `check:definer-grants` · supabase dry-run(SQL 회귀 포함) | CI | 종료코드 0 |
| T-11 | 기준선 전에 규칙 · 층 이름 · 밝기 정의 변경 금지 | `answer-gate.test.ts`: `INTERVIEW_RULE_SET === 'r0'` 이고 `finalCredit('r0', …)` = `confirmedAnswer` 의 진리표 / `LAYER_LABEL.ko.echo === 'L5 · 울림'`(`probe.ts:125`) / `levelFromCells` 표 고정 | jest | 바꾸려면 테스트와 DECISIONS 줄을 같은 PR 에서 |
| T-12 | 열거값 사본 일치 | `ledger-enum-parity.test.ts` | jest | TS 목록 = 0225 의 CHECK · RPC 허용목록(파일을 읽어 대조) |
| T-13 | 원문 두 벌이 같다 | `transcript-render-parity.test.ts` + SQL 회귀 | jest + SQL | TS 렌더러와 SQL 렌더러 출력이 같은 바이트(ko · en · 줄바꿈 · 이모지) · 다르면 commit 거절 |
| T-14 | 판정 원장 둘 금지 | `single-verdict-ledger.test.ts` | jest(정적) | `db/migrations/*.sql` 의 `CREATE TABLE` 중 판정 열(`model_layer` · `verdict`)을 가진 표 = 1 |
| T-15 | 집계 행에 원문 금지 | 0225 사후 조건 DO + SQL 회귀 | SQL | `interview_unsaved_rollup` 의 text 열이 전부 CHECK 열거값, uuid · timestamptz 열 0, fold 뒤 세션 id 가 어디에도 없음, 감사 행 해시 = '' |
| T-16 | 행동 데이터를 interview_probe 문맥에 넣지 않음 | `probe-context-isolation.test.ts` | jest(정적 + 단위) | `probe.ts` 가 `session-ledger` · `verdict-ledger` 의 읽기 함수를 import 하지 않음, 프록시가 interview_probe 의 `system/user` 를 받은 그대로 보냄 |
| T-17 | 건강값 LLM 금지 | `seven-proposal-context.test.ts` 추가 | jest | 근거 질의가 대화록 답 턴(`audit_response` + `system_tags interview`)만 읽음, 다른 kind · 건강 · 가져오기 레코드 0 |
| T-18 | 미성년 게이트 유지 | 기존 미성년 테스트 무변경 + 새 RPC 가 나이를 보지도 열지도 않음 | jest + SQL | 기존 테스트 통과, 새 함수 본문에 `minor` · `age` 분기 0 |
| T-19 | D2 흔적 0 | SQL 회귀 "discard folds and erases" | SQL | discard 뒤 세션 · 판정 행 0, 집계 +1, 그 감사 행 `prompt_hash = '' AND output_hash = ''`, 대화록 0 |

---

## 7. 기준선 지표 · 계산 SQL 초안 · 판정 일치율 CSV

### 7.1 지표 정의

| 지표 | 정의 | 분모 |
|---|---|---|
| other_layer 비율 | `verdict = 'other_layer'` / 판정 행 | 판정 행 = 프록시 행 중 `credited · none · other_layer · no_verdict` |
| no_verdict 비율 | `verdict = 'no_verdict'` / 판정 행 | 같음 |
| 종료 사유 분포 | 세션 수를 `end_reason` 별로 | 서버에 흔적이 있는 세션(판정 호출 또는 close 가 1번 이상). 열자마자 나간 대화는 세지 못한다 |
| 세션당 장면 수 | 평균 `scenes / sessions` 와 히스토그램(1 · 2 · 3 · 4 · 5 · 6+) | 같음 |
| 저장률 | (담은 세션 + 담았다 지운 세션) / 전체 세션 | 6시간이 안 지난 미결 세션은 빼고 |

모두 **벤더 · 규칙 판 · 언어별로** 나눠 본다. 좌석이 OpenAI → Claude 로 옮겨가는 동안의 기준선이 섞이지 않게(S0.5), en 프롬프트에는 말문 후보 규칙이 없어(`probe.ts:386-390` ko 만, `:433` en) 말문 지표가 언어마다 다를 수 있어서다(추론).

### 7.2 계산 SQL 초안 (service_role, 읽기 전용)

담은 세션을 집계 표와 같은 모양으로 펴는 뷰 하나를 두고, 지표는 둘을 합쳐 계산한다.

```sql
CREATE OR REPLACE VIEW public.interview_saved_weekly WITH (security_invoker = true) AS
WITH v AS (
  SELECT * FROM public.interview_probe_verdicts WHERE link_state = 'linked'
), per_session AS (            -- 세션 한 줄로 먼저 접는다
  SELECT s.id,
         date_trunc('week', s.started_at AT TIME ZONE 'Asia/Seoul')::date AS week_kst,   -- KST 월요일
         s.period, s.locale, COALESCE(s.vendor, 'none') AS vendor,
         COALESCE(s.end_reason, 'left') AS end_reason,
         COALESCE((SELECT min(x.rule_set) FROM v x WHERE x.session_id = s.id), 'r0') AS rule_set,
         (SELECT count(DISTINCT x.scene_seq) FROM v x WHERE x.session_id = s.id) AS scenes,
         (SELECT count(*) FROM v x WHERE x.session_id = s.id AND x.source = 'proxy'
             AND x.verdict IN ('credited','none','other_layer','no_verdict'))      AS judged,
         (SELECT count(*) FROM v x WHERE x.session_id = s.id AND x.verdict = 'other_layer') AS v_other_layer,
         (SELECT count(*) FROM v x WHERE x.session_id = s.id AND x.verdict = 'no_verdict')  AS v_no_verdict,
         (SELECT count(*) FROM v x WHERE x.session_id = s.id AND x.final_credit)            AS final_credit
    FROM public.interview_sessions s
   WHERE s.committed_at IS NOT NULL
)
SELECT week_kst, period, locale, vendor, rule_set, 'saved'::text AS outcome, end_reason,
       count(*)::int           AS sessions,
       sum(scenes)::int        AS scenes,
       sum(judged)::int        AS judged,
       sum(v_other_layer)::int AS v_other_layer,
       sum(v_no_verdict)::int  AS v_no_verdict,
       sum(final_credit)::int  AS final_credit
  FROM per_session
 GROUP BY week_kst, period, locale, vendor, rule_set, end_reason;
-- 장면 히스토그램 · 깊이 · 층별 열은 같은 per_session 에 열을 더해 집계 표(2.5)와 같은 모양으로 맞춘다.
-- 담았다가 지운 세션은 fold 로 집계 표(outcome deleted_after_save)에 가 있으므로 두 번 세지 않는다.
```

```sql
-- :from_week, :to_week (KST 월요일), :rule = 'r0'
WITH allw AS (
  SELECT week_kst, period, locale, vendor, rule_set, outcome, end_reason,
         sessions, scenes, judged, v_other_layer, v_no_verdict
    FROM public.interview_saved_weekly
  UNION ALL
  SELECT week_kst, period, locale, vendor, rule_set, outcome, end_reason,
         sessions, scenes, judged, v_other_layer, v_no_verdict
    FROM public.interview_unsaved_rollup
)
-- ① other_layer · no_verdict 비율 (벤더 · 언어별)
SELECT vendor, locale, sum(judged) AS judged,
       round(sum(v_other_layer)::numeric / NULLIF(sum(judged),0), 3) AS other_layer_rate,
       round(sum(v_no_verdict)::numeric  / NULLIF(sum(judged),0), 3) AS no_verdict_rate
  FROM allw WHERE rule_set = :rule AND week_kst >= :from_week AND week_kst < :to_week
 GROUP BY vendor, locale;

-- ② 종료 사유 분포
SELECT end_reason, sum(sessions) AS sessions,
       round(sum(sessions)::numeric / sum(sum(sessions)) OVER (), 3) AS share
  FROM allw WHERE week_kst >= :from_week AND week_kst < :to_week
 GROUP BY end_reason ORDER BY sessions DESC;

-- ③ 세션당 장면 수
SELECT round(sum(scenes)::numeric / NULLIF(sum(sessions),0), 2) AS scenes_per_session
  FROM allw WHERE week_kst >= :from_week AND week_kst < :to_week;

-- ④ 저장률
SELECT round(sum(sessions) FILTER (WHERE outcome IN ('saved','deleted_after_save'))::numeric
             / NULLIF(sum(sessions),0), 3) AS save_rate,
       sum(sessions) AS sessions
  FROM allw WHERE week_kst >= :from_week AND week_kst < :to_week;

-- 보고 규칙: 칸의 sessions < 5 면 값 대신 '<5' 로 가린다(Q7)
```

층별 거부율(M3) · 발판 회복(M5) · 말문 후보(M6) · 장면 깊이(M1)는 같은 표의 `layer_*` · `scaffold_*` · `opener_*` · `depth_hist` 열로 같은 방식이다(`docs/design/interview-measurement-261006.md` 2절 정의 그대로).

**기준선 기간(Q14):** 0225 적용 + 새 화면 게시 다음 날부터 2주, 단 판정 행 30개 미만이면 늘린다. 지금 운영에서 이 좌석의 비QA 실호출은 매우 적다(설계 문서 1.1: `interview_probe` 감사 83행 중 openai 6, 2026-10-06 실측 · 인용) — 기준선은 사실상 Simon · QA 계정 몇 세션이 된다는 점을 보고에 함께 적는다.

### 7.3 Simon 계정 판정 일치율 — 읽기 전용 CSV

`export_my_interview_judgements(p_since)` 는 **호출한 본인의 담은 세션만** 돌려준다(DEFINER 지만 `owner_id = auth.uid()` 고정, 안 담은 세션은 이미 집계로 접혀 없다). 실행은 Simon 이 자기 계정으로(Q11 A).

```
npm run export:interview-judgements -- --since 2026-10-07 > E:/2ndB-private/judgements-261021.csv
```

| 열 | 예 | 출처 |
|---|---|---|
| `session_day` | 2026-10-08 | 세션 시작일(KST) |
| `period` · `locale` | school · ko | 세션 |
| `scene_seq` · `turn_no` | 1 · 4 | 판정 행 |
| `probe_kind` · `question_origin` | drill · model | 앞 질문 턴 |
| `question_text` | 그때 어떤 기분이었나요? | 대화록 질문 턴 |
| `answer_text` | 창피했는데 티를 안 냈어요 | 대화록 답 턴 |
| `opener_unedited` | false | 판정 행 |
| `asked_layer` · `local_gate` · `model_layer` · `verdict` · `final_credit` · `rule_set` · `vendor` | feeling · pass · feeling · credited · true · r0 · openai | 판정 행 |
| `end_reason` | user_end | 세션 |
| `human_layer` · `human_credit` · `note` | (빈칸 — Simon 이 채움) | — |

- UTF-8, 첫 줄 머리. 엑셀에서 한글이 깨지면 `--bom` 옵션(기본은 BOM 없음).
- 일치율: 채운 파일을 같은 스크립트가 읽어(`--score`) **인정 일치율** = `human_credit == final_credit` 비율, **층 일치율** = `human_layer == COALESCE(model_layer,'none')` 비율, 6×6 혼동표를 출력한다. 업로드 · 저장소 커밋 없음(본인 원문이 들어 있다).

---

## 8. 열린 질문

| # | 질문 | 추천 | 안 정하면 막히는 것 |
|---|---|---|---|
| Q1 | 0220 브랜치(`fix/qa261007-interview`)의 표를 하나뿐인 판정 원장으로 둘까요? 그렇다면 03:00 보정과 어긋난 다섯 곳(0.2절)을 0220 안에서 고칠까요, 0225 에서 고칠까요? | 0220 안에서(머지 · 적용 전이라 한 번에 모양을 정함). 2ndb-74 세션에 발주 메모 | 착수 자체 — 같은 표를 두 세션이 바꾸게 된다 |
| Q2 | 0229 를 두 브랜치(delrcpt · interview)가 같이 씁니다. 어느 쪽이 옮길까요? 그리고 SSV GO-5b 의 "0222 이후"가 0225~0227 과 겹치지 않는지 확인해 D6 이 세 번호를 잡아도 될까요? | 0229 는 조정자가 정함. 0225~0227 은 SSV 세션 확인 뒤 D6 이 잡음 | 두 PR 중 늦게 머지되는 쪽의 CI · 0225 파일 이름 |
| Q3 | 과도기에 원문을 두 벌(턴 표 · `records.body`) 두고 commit 이 같음을 확인하는 방식으로 갈까요? | 예. S2 에서 `records.body` 를 파생으로 바꿈. 레코드 편집으로 생기는 어긋남은 그때까지 세기만 | 원문 표 DDL · commit 3단계 |
| Q4 | S2 의 일반 원문 표가 생기면 `interview_transcripts` 를 그 자식(채널 interview)으로 옮길까요? | 예. 지금은 독립 표, S2 가 흡수(D6 뒤집는 조건 "S2 실측에서 턴 단위 저장이 이관을 막을 때"와 같은 자리) | 0225 표 이름 · 키 |
| Q5 | 담은 인터뷰를 지우면 그 기록을 인용한 승인 카드와 L5 행도 지울까요? 칸은 그대로 둡니다 | 카드 · L5 는 지움(0195 역할 카드와 같은 규율, D5), 칸은 유지(기준선 전 밝기 정의 변경 금지) | 2.7 트리거 본문 |
| Q6 | 저장 안 한 세션을 접는 유휴 기준 6시간(0220)을 유지할까요? 끝 화면을 6시간 넘게 열어 두고 담으면 칸이 0 이 됩니다 | 6시간 유지. 화면을 떠날 때는 바로 discard | sweep 주기 · `ledger_expired` 처리 |
| Q7 | 소유자 없는 집계를 주 단위로, 보고 때 5세션 미만 칸을 가리는 것으로 충분할까요? 감사 행(사용자 · 시각)은 C3 로 남습니다 | 예 + 법무 확인 요청 목록에 한 줄 | 집계 표 키 |
| Q8 | 감사 행 해시를 비우는 값을 `''`(NOT NULL 유지)로 할까요? 링크 스크랩(D2, S6a)과 같은 함수를 쓸까요? | `''` · 공용 함수 `erase_audit_hashes` 하나 | 함수 본문 · S6a 중복 구현 |
| Q9 | 시기 카드 근거 검증 강도: (A) 프롬프트 표식만 (B) +발췌 해시 대조 (C) 서버가 근거를 골라 프롬프트를 만듦(0195 방식) | B. C 는 S1 의 Claude 이전과 함께 볼 일 | `record_period_card_proposal` 인자 |
| Q10 | 응답 블록 id 를 부속 표(90일)에 둘까요, `ai_audit_log` 열(영구)에 둘까요? 블록 id 형식은 R 이 정할까요? | 부속 표 · R 이 형식 결정 | 완료조건 4(T-09) |
| Q11 | 판정 일치율 CSV: (A) Simon 이 자기 계정으로 내보냄 (B) 운영자가 Simon GO 로 읽기 전용 SQL | A | 일치율 측정 시작 |
| Q12 | 옛 축 비준(`recordStarTiers` ratify)은 RD-261007-04 동결에 따라 0227 뒤 막힙니다. /review 의 옛 대상 버튼을 내리는 화면 발주를 보낼까요? | 예 | 0227 적용(옛 버튼이 실패 문구를 보임) |
| Q13 | D4 를 인터뷰에 적용해 위기 판정 답 턴을 대화록에 `ai_hold` 로 남길까요? 지금은 그 답이 대화에서 빠집니다(`interview.tsx:552-566`) | 기준선 뒤 P7 과 함께. 스키마는 준비됨 | 지금 막히는 것 없음 — 기준선 뒤 다시 묻거나 폐기 |
| Q14 | 기준선 기간: 2주 또는 판정 행 30개 중 늦은 쪽으로 할까요? | 예 | 규칙 r1(03:00 보정) 착수 시점 |
| Q15 | 제안 보관: 미결 30일 만료, 거절 · 빗나감 · 만료 365일 삭제로 할까요? | 예 | 정리 cron |
| Q16 | 북극성 역할 카드(`personas.patterns.role_cards_v1`, 0195)도 같은 제안·결정 원장으로 옮길까요? | 이번엔 시기 카드만(`card_kind` 열을 열어 둠). 북극성은 생성이 꺼져 있다(`polaris_generation_config.enabled = false`, 0218 주석 인용) | 지금 막히는 것 없음 |

---

## 9. 확인 · 추론 · 미확인, 하지 않은 것

**확인(읽어서):** 기준 커밋의 `src/app/interview.tsx` · `src/lib/interview/{probe,continuity,stuck,session-end,coverage-store,periods}.ts` · `db/migrations/{0004,0045,0060,0061,0063,0143,0144,0178,0195}` · `src/lib/persona/{seven-tier-history,seven-proposal-context,propose-self-model,record-star-tiers,load-seven-levels}.ts` · `DeepSpaceDesignScreens.tsx:1829-2027` · `openai-proxy/index.ts:676-835,1040-1175` · `claude-proxy/index.ts` 감사 · 동의 · 응답 줄 · `_shared/llm-proxy-common.ts:58,66-67` · `db/erasure-registry.json` 해당 항목 · `docs/design/interview-measurement-261006.md` · DECISIONS.md 01:20 ~ 02:41 · STATE.md. #2122 diff(0218 · `interview.tsx` · `seven-proposal-context.ts` hunk). 0220 브랜치의 0220 SQL 전문 · `_shared/interview-verdict.ts` · 프록시 · 경계 diff · `verdict-ledger.ts` · `session-ledger.ts` 일부. 원격 브랜치의 0214 ~ 0231 번호 점유.

**추론:** 0.2절의 해석("0220 이 그 하나의 원장"), 소유자 없는 집계의 재식별 위험, en 말문 후보 차이가 지표에 미치는 영향, 0227 시점의 옛 앱 영향, 기준선 표본 크기.

**미확인:** 운영 DB 의 현재 상태(이번에 운영 조회 0건 — 0195 적용 · `enabled=false` 는 0218 주석 인용), 0220 브랜치의 최신 커밋(`6fea477a`) 내용, 읽기 계층 R 의 블록 모양(코드 없음), claude-proxy 의 응답 파싱 경로가 openai-proxy 와 같은 `text` 를 내는지, `createRecord` 가 본문을 바꾸지 않고 저장하는지는 `create.ts:324` 한 줄로만 확인(정규화 경로 전수 미확인), 03:00 보정 · 03:08 · 02:42 메모의 원문(발주문 인용만).

**하지 않은 것:** 코드 · 마이그레이션 · 저장소 파일 작성, 테스트 · 게이트 실행, 운영 조회 · 쓰기 · 배포, LLM 호출, 0220 브랜치 변경.
