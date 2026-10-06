# LLM 좌석 10개 은퇴 기록 (S0.5, 2026-10-07)

> 작성 2026-10-07 04:20 KST · 발행 Claude Code · 등급 S
>
> **이 문서에 값은 없다.** 이름 · 경로 · 상태만 적는다. 줄 번호는 은퇴 직전 main `b0328692` 기준이다.

## 요약 (코딩 지식 0 기준)

- **무엇을**: 앱이 AI 에게 일을 시키는 자리(좌석) 29개 중, 아무 화면도 부르지 않던 10개를 목록에서 뺐다.
- **왜**: 부르는 곳이 없는데도 서버 허용 목록과 요금 한도표에 남아 있으면, 조작된 앱이 그 자리로 비싼 호출을 보낼 수 있고, 문서와 테스트는 "있는 기능" 처럼 읽힌다. 재설계 결정(좌석은 합치지 않고 줄이기만 한다)에 따른 정리다.
- **지금 어디까지**: 앱 코드 · 서버 프록시 3종 · 모델 갱신 스크립트에서 뺐다. **DB 요금 한도 함수(0185)와 저장소 변수 하나는 일부러 남겨 뒀다** (아래 "남겨 둔 것").

## 무엇이었나

| 좌석 | 하던 일(선언상) | 정책(벤더 · 티어 · 상한) | 호출부 | 운영 원장 |
|---|---|---|---|---|
| `imagine` | 공상 → 구체화 | gemini·openai · pro · high | 0 (`src/app/imagine.tsx:7` 주석이 가리키는 `src/lib/llm/imagine.ts` 는 없음) | 0건 |
| `import_ingest` | 외부 내보내기 파일 분류 | gemini·openai · flash · low | `legacy/screens/import.tsx:123` 뿐(빌드 제외) | 0건 |
| `capture_classify` | 기록 한 건 분류 | gemini·openai · lite · none | 0 | 0건 |
| `capture_voice` | 음성 메모 라우팅 별칭 | 좌석 없음 · audio | 0 (실제 음성은 `voice_transcribe` 라벨, `boundary.ts:1396`) | 0건 |
| `axis_estimate` | 옛 자기이해 축 추정 | 4벤더 · flash · high | 0 (`src/lib/audit/axis-estimate.ts` 는 저장소 밖으로 이동) | gemini 6건, 마지막 2026-07-21 |
| `cluster_infer` | 기록 군집 · 연결 이유 | gemini·openai·xai · flash · medium | 0 | openai 1건(2026-08-20 05:22 KST, 같은 분 배포 스모크로 추정) |
| `ttfv_first_insight` | 첫 통찰 | gemini·openai·xai · flash · xhigh | 0 | 0건 |
| `digest_weekly` | 주간 요약 | 4벤더 · pro · max | 0 | 0건 |
| `crosscheck_challenge` | 북극성 초안 반박 | openai · pro · high | `crosscheck.ts:195` ← `persona-synthesis.ts:303` (런타임 도달 불가) | 0건 |
| `crosscheck_defend` | 반박 뒤 재작성 | claude · pro · max | `crosscheck.ts:230` (같은 이유) | 0건 |

**교차검증(crosscheck) 두 좌석이 "배선은 있는데 도달 불가" 였던 이유.** 유일한 호출자 `role-cards.ts:191` 이 항상 생성 id 를 넘기고(`:164`), 입력도 항상 `life_star`(`:155`)라 `persona-synthesis.ts:300` 에서 교차검증 전에 반환했다. 테스트만 그 길을 탔다.

## 어디서 뺐나

| 자리 | 바뀐 것 |
|---|---|
| `src/lib/llm/types.ts` | `PromptPurpose` 26 → 16, `PURPOSE_TIER` 에서 해당 행 |
| `src/lib/llm/routing.ts` | `PHASE2_VENDOR` · `PHASE2_EFFORT` 행, `MULTIMODAL_PURPOSES` 의 `capture_voice` |
| `src/lib/llm/boundary.ts` | 오프라인 목업 `imagine` · `import_ingest` |
| `src/lib/llm/crosscheck.ts` | 파일 삭제. `persona-synthesis.ts` 의 호출 분기 삭제 |
| `supabase/functions/_shared/llm-proxy-common.ts` | 정책표 29 → 19 키 |
| `openai-proxy` · `claude-proxy` · `xai-proxy` | 좌석 · 상한 표 행, openai 의 교차검증 전용 모델 분기 |
| `scripts/refresh-models.ts` | 승격 목록, `openai-sol` 좌석, `OPENAI_CROSSCHECK_MODEL` 쓰기 |
| `eas.json` · `web-deploy.yml` · `android-release.yml` | `EXPO_PUBLIC_CROSSCHECK` 주입 줄 (읽는 코드가 없어짐) |
| `docs/legal/DPIA-2ndB-minors-draft.md` | Anthropic 행 좌석 셋 → 둘, 코드 줄 인용 28개 이동 |

## 남겨 둔 것 (지우지 말 것)

| 이름 | 어디 | 왜 남겼나 |
|---|---|---|
| 10개 라벨 | DB 함수 `consume_llm_proxy_purpose_quota`(0185)의 표와 CHECK | 넓을 뿐 해가 없다. 재설계 S1 의 0185 교체 마이그레이션이 좁힌다. `llm-proxy-purpose-quota.test.ts` 가 남은 10개를 정확히 고정한다 |
| 10개 라벨 | 옛 `ai_audit_log.purpose` 행 | 원장은 고치지 않는다. `src/lib/ai/audit-reader.ts` 가 표시용 이름을 계속 안다 |
| `EXPO_PUBLIC_CROSSCHECK` | GitHub 저장소 Variable (2026-08-23 설정) | 주입 줄만 뺐다. 값은 이 문서를 읽으라는 표시로 둔다 |
| `OPENAI_CROSSCHECK_MODEL` | Supabase Edge Function Secret (있다면) | 나이틀리 `refresh-models` 가 쓰던 이름. 이제 아무도 쓰거나 읽지 않는다. 존재 여부는 이 PR 에서 확인하지 않았다 |
| `src/lib/lenses/registry.ts:111,130` | 휴면 렌즈의 `surfaces` | 휴면 렌즈의 역사 기록. 되살릴 때 이 표와 함께 고친다 |

## 되살리려면

1. `PromptPurpose` 와 `PURPOSE_TIER` 에 다시 넣고, 새 좌석 규칙대로 **effort 를 명시**한다(CLAUDE.md "LLM 정책").
2. 정책표(`llm-proxy-common.ts`)와 받을 프록시의 좌석표에 같은 키를 넣는다. 0185 는 아직 그 라벨을 안다(S1 교체 전까지).
3. **배포가 먼저, 플립이 나중.** 프록시를 재배포해야 좌석이 생긴다. 앱이 먼저 부르면 `400 purpose_not_seated` 다.
4. 교차검증을 되살리면 `EXPO_PUBLIC_CROSSCHECK` 주입 줄도 세 곳에 되돌리고, 실제 호출자가 생성 id 경로 밖에서 그 길을 타는지부터 확인한다.
