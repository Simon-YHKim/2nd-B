# LLM-ROUTING.md — purpose-키 모델·리즈닝 라우팅 정본

> **Status**: 설계 정본 (D-26, 2026-07-04). 3관점 패널(quality / cost-freetier / product-safety) → 별도 심판 병합으로 결정.
> 허브 기록: `AI Infra/Communication/DECISIONS.md` D-26. 상세 리포트: `Output/ai-harness-routing-20260704.html` (로컬).
> **이 문서가 `PURPOSE_TIER`(현행)와 향후 `PURPOSE_ROUTE`(목표 스키마)의 단일 SoT다.**

## 0. 원칙 (전 행 공통)

1. **라우팅 키 = purpose(상황)** — 구독 티어가 아니다. SAME-QUALITY 불변식(`src/lib/entitlements/tiers.ts` 헤더, plans 카피 "더 비싸도 더 나은 나를 주지 않는다")에 따라 티어는 COUNTS/FEATURES/HISTORY만 차등한다. 라우팅 테이블에 tier 필드는 의도적으로 없다.
2. **품질 최우선, 비용은 구조로** (Simon 지시 2026-07-04): 자기이해 서사 표면(persona/axis/digest/ttfv/advisor/northstar)은 좋은 모델 + 높은 리즈닝. 비용 절감은 모델 다운그레이드가 아니라 캐시·통합·배치·RAG로 달성한다.
3. **2-Phase**: Phase 1(현재→2026-08-17 XPRIZE 제출) = Gemini 백본 온리(C1/C2, $0 무료 티어). Phase 2(제출 후) = 3사(Gemini/OpenAI/Anthropic) 품질-우선 라우팅.
   **Phase 2 비용 게이트 = 통과 (Simon 지시, 2026-07-04 "phase2 진행하고")** — 코드는 전부 배선 완료, 활성화는 운영 스위치: ① Supabase 시크릿 `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 세팅 ② `claude-proxy`/`openai-proxy` 배포 ③ 클라 `EXPO_PUBLIC_LLM_PHASE=2` 플립. 스위치 전까지 기본값은 Phase 1(전량 Gemini, 행동 변화 0).
   **OCR 핀 (Simon 지시, 2026-07-04 "OCR 작업은 무조건 gemini 사용하자")**: `capture_ocr`은 모든 Phase에서 무조건 Gemini — 벤더 failover 없음, 예외 없음. 기술적으로도 gemini-proxy만 이미지 inline-data를 통과시킨다. 코드 강제: `src/lib/llm/routing.ts` GEMINI_PINNED_PURPOSES + 이미지 입력 전역 Gemini 강제.
4. **C1 유지**: 비-Gemini 벤더는 전부 Supabase 엣지 프록시 경유(claude-proxy 기존, openai-proxy는 claude-proxy 포크 ~1h 템플릿). 클라이언트에 타 벤더 SDK/키 절대 금지.
5. **C9 유지**: lexicon 전 행 pre-classify + red 단락 + 출력 재분류/swap은 어떤 라우팅에서도 제거 불가. 시맨틱 레이어는 제거가 아니라 **복구**(§3 P0-1).
6. **thinking 시맨틱 어댑터**: Phase 1 열은 Gemini 3.x `thinking_level`(minimal/low/medium/high) 기준. 2.5 세대로 스필오버 시 `thinkingBudget`으로 번역(minimal≈512, off=0). Phase 2 열은 각 벤더 네이티브(Anthropic adaptive+`output_config.effort`, OpenAI `reasoning_effort`). 추상 effort 1필드 + 벤더·세대별 번역 어댑터가 목표 구현.

## 1. P0 결함 (라우팅 이전에 고쳐야 하는 것)

| # | 결함 | 위치 | 상태 |
|---|---|---|---|
| P0-1 | **prod 시맨틱 위기분류 무음 사망**: classifySafety가 non-Vertex 라이브에서 lexicon-only로 조용히 강등 (직결 API-key 클라이언트가 spend-cap 우회라 의도적으로 null) | `src/lib/llm/safety.ts:83-91` | 백로그 #1 — 잔여 (위기 eval set + 세이프티 승인 게이트 선행) |
| P0-2 | **임베딩 라이브 경로 사망**: `text-embedding-004`는 2026-01-14 셧다운됨 | `src/lib/llm/gemini.ts` EMBED_MODEL | ✅ P0 레인에서 수리 — gemini-embedding-2(768 MRL) + proxy `op:'embed'`(웹 경로) + 배치 백필 + 0068 리셋 + 리서치 버튼 재생성 배선 |
| P0-3 | **엣지 경유 lite 콜 400**: gemini-proxy MODELS_ALLOWED={2.5-flash, 2.5-pro}뿐 → lite 티어(clipper_classify)가 엣지 빌드에서 model_not_allowed | `supabase/functions/gemini-proxy/index.ts` | ✅ P0 레인에서 수리 — allowlist에 lite+3.x, GEMINI_MODELS_ALLOWED env, pro-클래스 패턴 핀 |
| P0-4 | **audit_qa 시스템 프롬프트 전무** — 라이브 무유도 출력 | `src/lib/records/create.ts` | ✅ 이 브랜치에서 수정 |

## 2. 라우팅 매트릭스 (최종 병합판)

표기: `[S]` = responseSchema/structured output 의무. P1 = Phase 1 Gemini(모델 @ thinking_level). P2 = Phase 2 벤더(모델 @ 네이티브 effort).

### A. 라이브 purpose

| # | purpose (최종명) | P1: Gemini | P2: 3-vendor | 근거 |
|---|---|---|---|---|
| A1 | secondb_chat | 3.5-flash @ minimal + 안정 프리픽스 캐시 + RAG top-8 + 최근 6턴 | Claude sonnet-5 @ low + prompt caching + 스트리밍 | 첫토큰 <3s. KO 산문 최상. RAG/캐시 후 실비 ~$10-30/mo@100DAU |
| A2 | advisor (brain 기능게이트 유지) | 3.5-flash @ high | Claude sonnet-5 @ high | 만장일치. 근거기반 ≤4문장+반성질문, post-save 10s 여유 |
| A3 | audit_qa | 3.1-flash-lite @ off + 시스템 프롬프트(✅) | 3.5-flash @ minimal | 고빈도(오딧 코어루프)는 lite 버킷으로; 품질 레버=프롬프트 |
| A4 | interview_probe | 3.5-flash @ minimal + 최근 8-10QA 윈도 | 동일 (Gemini 잔류) | **pro→flash 강등 만장일치**(레이어 선택은 결정적, LLM은 질문 1개 초안). ≤2s 천장 |
| A5 | persona_narrative (구 persona_chat@build) | 3.5-flash @ high (캐시 착지 전 medium) + read-back 캐시 + 입력 윈도잉 | **Claude opus-4-8 @ high** — KO 산문 파일럿(vs sonnet-5 @ xhigh) 통과 후 확정 | VERY HIGH 플래그십 "who am I". 캐시로 rare화 → opus 비용 무시 가능 |
| A6 | gap_synthesize (seen-lens + peer) | 3.5-flash @ low + minor 플래그 픽스 + 캐시 | Claude sonnet-5 @ low | 숫자만 입력, 민감 표현 수위 |
| A7 | self_model_propose [S] | 3.5-flash @ medium | Claude sonnet-5 @ high | propose→ratify 원장 진입 — schema 우선 |
| A8 | northstar_propose [S] | 3.5-flash @ high (✅ PURPOSE_TIER 등재) | Claude sonnet-5 @ high | 25자 KO 정체성 문장. per-tap 8s 예산이 opus 배제 |
| A9 | axis_estimate [S] | 3.5-flash @ high + 출력 lexicon 게이트 신설 (✅ 등재) | **Claude opus-4-8 @ high**, batch | VERY HIGH 심리 구인 해석. 입력 극소(≤24×140ch) → opus도 ~$0.02/콜 |
| A10 | persona_synthesis [S] | 3.5-flash @ high (기존 최상 계약 유지) | **Claude opus-4-8 @ xhigh** + Batch -50% | VERY HIGH·rare·결정적 압축 입력 = 최고 리즈닝 적임 |
| A11 | clipper_classify [S] | 3.1-flash-lite @ off (P0-3 픽스 후) + G8 summary 필드 흡수 | 동일 (Google lite) | throwaway·비준가능. 만장일치 |
| A12 | capture_ocr | 3.5-flash @ minimal (✅ 직결 경로 thinking off) | 동일 (Google) | 전사에 thinking 무가치(만장일치). lite 이미지 품질 미검증 → flash |
| A13 | capture_voice (STT) | **온디바이스 우선**; 클라우드 폴백 = Vertex 2.5-flash @ off (무학습) + 사이즈 캡 | 동일 | 음성 원본을 무료 티어(학습 사용)로 전송 금지. proxy audio 미통과 |
| A14 | source_ingest [S] (구 knowledge_lookup) | 3.5-flash @ low + 입력 캡 16k chars + 펜싱 | 동일 (Google — 1M ctx) | 사용자 노출 4질문은 low+좋은 프롬프트로 충분 |
| A15 | import_ingest [S] | 3.5-flash @ low + 입력 캡 + KO 시스템 프롬프트 추가 | 동일 | EN-only 시스템이 실버그 |
| A16 | template_propose [S] | 3.5-flash @ low | 동일 | 공유 스토어 = 주입 벡터 → schema+양측 lexicon 게이트 |
| A17 | **ops_daily_brief** [S] (ops_recommend + star_insight(G2) + companion_observation(G3) 통합) | 3.5-flash @ medium, 일 1회 Batch 선계산; OpsHomeScreen 무과금 refire 버그 픽스 | Claude sonnet-5 @ medium + daily Batch | 유저당 일 1콜로 통합 = **-1,700 RPD 최대 레버**. 수치는 코드가 결정적 주입 |
| A18 | **safety_classify** [S] (신설 purpose — proxy 경유 복구) | 3.1-flash-lite @ off + strict schema; 시맨틱 스코핑(입력=자유텍스트 purpose만/출력=산문 purpose만); YELLOW·conf<0.6 → 3.5-flash @ minimal 에스컬레이션 | 동일 + **outage 시에만** gpt-5.4-nano @ none 교차벤더 폴백. **fable 금지**(refusal) | P0-1 복구가 본체. 위기 eval set + 세이프티 오너 승인 게이트 선행 |
| A19 | embed_index (embedTexts) | **gemini-embedding-2 @ 768dim MRL** + 배열 배치(50콜→1) + 생성/수정 자동 임베드 + zero-vector 영구스킵 픽스 + **전량 재임베드** | 동일 | P0-2. 004 벡터와 혼재 금지 |

### G. proto GAP purpose (신설 예정 — 라우팅 선지정)

| # | purpose | P1: Gemini | P2: 3-vendor | 근거 |
|---|---|---|---|---|
| G1 | digest_weekly [S] | 3.5-flash @ high, 주간 Batch — 통계는 코드가 결정적 계산, LLM은 서사만; **conf%는 schema 제외, 시스템 계산** | **Claude opus-4-8 @ xhigh** + Batch -50% | VERY HIGH 인과 암시 claim = 최대 신중함 표면. 주1회 → 유저당 월 ~$0.1 |
| G2 | (star_insight — A17에 흡수, 캐시 서빙 ≤1s) | 콜 0 | 동일 | |
| G3 | (companion_observation — A17에 흡수) | 콜 0 | 동일 | 도메인별 부분 폴백(전일 캐시) |
| G4 | callrec_summarize [S] | STT=온디바이스 전용; 요약=Vertex 2.5-flash @ low (무학습); Vertex 미구성 배포 = 기능 플래그 OFF | Claude sonnet-5 @ low via claude-proxy | 타인 발화 = 무료 티어 전송 절대 금지 (프라이버시 최상) |
| G5 | cluster_infer [S] (cluster_discover+link_infer) | 3.5-flash @ medium, Batch + kNN 프리필터(A19 의존) | **OpenAI gpt-5.4 @ medium** + Batch (Gemini free 폴백 유지) | openai-proxy 검증 앵커 + failover 좌석 + 구조분석 |
| G6 | trend_narrate | rule 코어 + 3.1-flash-lite @ low (서사문만) | 동일 | stakes MED — LLM 지분 최소화 |
| G7 | chat_capture_summarize [S] | 3.1-flash-lite @ low, Batch | 동일 | background job, AnalysisDock 큐잉 |
| G8 | (record_summarize — A11 clipper_classify summary 필드에 흡수) | 콜 0 | 동일 | -300 RPD |
| G9 | ttfv_first_insight [S] | 3.5-flash @ high — 온보딩 조기 kickoff 선계산; 헤징 문형+evidence[2] 필수 schema | Claude sonnet-5 @ xhigh (선계산) | VERY HIGH 첫인상. 선계산 마진에서 신뢰성 > 한계 품질 (opus 승급 경로 명시) |
| G10 | (peer variant — A6 gap_synthesize에 흡수; informant n<3 = 무조건 템플릿) | 템플릿 우선; LLM 시 3.5-flash @ low | Claude sonnet-5 @ low | LLM 콜 회피가 최선의 안전+비용 |
| G11 | imagine_divergent (구 imagine 재바인딩 — 트위비) | 3.5-flash @ minimal | 동일 | LOW·발산·인터랙티브 ≤5s |

**Phase 2 좌석 요약**: Claude 12석(자기이해 서사+챗+조언: A1/A2/A5/A6/A7/A8/A9/A10/A17/G1/G4/G9/G10) · Google 13석(분류·멀티모달·ingest·안전·임베딩·발산·인터뷰) · OpenAI 1석(G5)+A18 outage 폴백. **각 Claude 행의 장애 폴백 = 해당 행의 Phase 1 배정**. `claude-fable-5` 전면 배제(만장일치 — $10/$50 + 30일 보존 요건 + refusal 리스크가 저널·위기인접 신뢰 약속과 충돌). **P2 COGS @100 DAU ≈ $60-90/mo(post-intro 단가)** — 헤비 brain 유저 ~$3-6/mo << ₩19,900.

## 3. 구조 최적화 백로그 (임팩트 순)

1. **safety_classify 복구+스코핑+에스컬레이션** (P0-1): 직결 클라이언트 폐기→proxy purpose, 입력 시맨틱=자유텍스트 purpose만·출력=산문 purpose만(lexicon은 전 행 유지), 2단 에스컬레이션, 폴백 체인+메트릭, spend-cap 예약 버킷. **선행: 위기 eval set + 세이프티 오너 승인.**
2. △(allowlist·env·pro핀은 P0 레인에서 착지; 서버소유 PURPOSE_ROUTE·rpdBudget은 잔여) **proxy allowlist·서버소유 라우팅** (P0-3): {3.5-flash, 3.1-flash-lite, gemini-embedding-2, 2.5 스필오버} env-enum 허용, PURPOSE_ROUTE 서버 정본화, per-purpose rpdBudget, sub-brain pro→flash 무언 다운그레이드 제거. **클라 env(EXPO_PUBLIC_MODEL_*) 갱신과 락스텝 배포**(스테일 시 무음 2.5 트래픽).
3. ✅(P0 레인) **임베딩 마이그레이션** (P0-2): 004→gemini-embedding-2 768 MRL(`outputDimensionality:768` + 정규화 주의), 배열 배치, 자동 임베드, 전량 재임베드.
4. **프롬프트·주입면 일제 수리**: audit_qa 시스템(✅), 인터뷰 트랜스크립트/phase1 원문/persona 엔트리 펜싱, phase1·import 입력 캡, URL sanitize, import KO 시스템, `[SYSTEM]` user-turn 핵 대신 네이티브 systemInstruction.
5. ✅(P0 레인) **persona read-back 캐시 + 입력 윈도잉**: personas 테이블 읽기 복원(staleness key=count+max created_at), 인터뷰 전문 제외/요약. Phase 2 opus 경제성의 열쇠.
6. △(TTL 캐시+forceFresh는 P0 레인에서 착지; daily-brief 통합은 잔여) **ops_daily_brief 통합 + refire 버그 픽스**: G2×7+G3×7+A17 → 일 1콜 JSON, OpsHomeScreen 탭전환 무과금 auto-refire 차단.
7. **chat RAG + 히스토리 윈도 + 컨텍스트 캐싱**: blind first-50 스냅샷→kNN top-8+recency, 최근 6턴(현행 0턴), **정적 시스템+persona 프리픽스(캐시 경계) 뒤에 RAG 블록**(캐시 적중률 보호).
8. **responseSchema 전면화 + conf 시스템 계산**: A7/A8/A9/A11/A15/A16/A17/G1/G9에 persona_synthesis 계약(closed vocab+grounding filter+lexicon 게이트) 이식; parse실패 vs thin-data UX 분리.
9. **Batch/선계산 레인**: digest·daily-brief·classify·ingest·cluster·trend·embeds → Batch API(-50%)+아침 선계산. **Batch의 free-tier 가용성 실측 필요**(불가 시 오프피크 sync 트리클).
10. **Phase 2 프록시 계약 완성**: claude-proxy에 adaptive thinking+`output_config.effort`+structured output+스트리밍(현행 max_tokens만), openai-proxy 포크+공유 spend counter 합류, crisis lexicon `_shared/` 모듈화(3벌 드리프트 해소). **비용 게이트 확인 대상.**

## 4. 택소노미 마이그레이션 (26종 최종)

- **분리**: `persona_chat` → `persona_narrative` / `gap_synthesize` / `self_model_propose` (3 콜사이트가 의미 상이 — 감사·라우팅 정밀화)
- **리네임**: `knowledge_lookup` → `source_ingest` ✅(2026-07-18 이행 — wiki phase1 4질문 intake), `clipper_template_propose` → `template_propose`
- **재바인딩**: `imagine` → `imagine_divergent` (트위비/발산; 원장 연속성 위해 기존 enum 재사용)
- **신설**: `digest_weekly`, `ops_daily_brief`, `trend_narrate`, `cluster_infer`, `chat_capture_summarize`, `callrec_summarize`, `ttfv_first_insight`, `safety_classify`, `embed_index`,
  `reasoning_connect` ✅(2026-07-18 신설·이행 — `/reasoning` 딥런 도메인-연결 배치(0092). D-26 이후 리즈닝 개편이 낳은 라이브 콜사이트로, `cluster_infer`(위키 클러스터 근거·P2 OpenAI 좌석)와는 별개 purpose. 현행 라우팅 = Gemini pro @ high(콜사이트 명시 인자); P2 좌석은 컷오버 런북에서 결정 — PHASE2_VENDOR 미등재로 Gemini 잔류)
- **삭제**: `capture_classify`(dead), `journal_reflect` ✅(2026-07-18 이행 — 아래 감사 연속성 참조), `persona_chat`(3분할). `planner`는 PREMIUM_PURPOSES에서 축소 검토.
- 구→신 purpose 매핑 테이블을 감사 로그 연속성용으로 유지.

### 감사 연속성 (ai_audit_log 구 라벨 → 현행 purpose)

purpose 컬럼은 free text라 과거 행은 그대로 남는다 (persona_chat 3분할 선례). 대시보드·감사 조회 시 아래로 해석:

| 구 라벨 (행 생성 시기) | 현행 purpose | 비고 |
|---|---|---|
| `journal_reflect` (#1061 이전) | (dead) | 옛 저널 반성 질문 — record_summarize는 clipper 흡수 |
| `journal_reflect` (#1061~#1069, /reasoning 기록 배치) | `reasoning_connect` | 리즈닝 개편기가 임시 재사용한 라벨 |
| `knowledge_lookup` (wiki phase1 intake) | `source_ingest` | A14 리네임 |
| `knowledge_lookup` (#1061~#1069, /reasoning 자료 배치) | `reasoning_connect` | 동일 시기 임시 재사용 — 시기+콜 형태(JSON connections 스키마)로 구분 |

**목표 스키마** (서버 proxy가 정본 소유):
```
PURPOSE_ROUTE[purpose] = {
  p1: { model, thinking },          // Gemini 세대별 어댑터 통과
  p2: { vendor, model, effort },    // 벤더별 네이티브 시맨틱 어댑터 통과
  schemaRef?, latencyClass, safetyScope, privacyClass, batchEligible, rpdBudget, cache?
}
// tier 필드 의도적 부재 (SAME-QUALITY)
```

## 5. 운영 게이트·감시 항목

- **배포 게이트**: AI Studio rate-limit 대시보드 실측(무료 RPD 수치는 전부 서드파티 추정), Batch free-tier 가용성 실측, 위기 eval set(A18).
- **파산점**: 통합·캐시 적용 시 free tier ~150-170 DAU. 초과 사다리: lite↔flash 교차 스필 → 2.5 버킷 → Vertex(과금) → Tier-1 승급. XPRIZE 증빙 촬영일은 Vertex 고정.
- **유저 캡 × 프로젝트 풀**: brain 1명(500콜/일)이 공유 무료 풀의 ~13% — per-purpose rpdBudget + 글로벌 일일 예산 + fair-share 스로틀 필요. interview 세션(현행 무게이트 50콜) 예산 필수.
- **단가 캘린더**: claude-sonnet-5 인트로($2/$10)는 2026-08-31 만료 → Phase 2 COGS는 post-intro($3/$15) 기준으로 산정 완료.
- **2.5 핀 sunset 감시**: A13/G4가 audio 검증 때문에 2.5-flash 고정 — 3.5-flash audio eval 통과를 트리거로 마이그레이션(오너 지정). 직결 Vertex 레인은 spend counter 밖 → 캡 회계 편입 필요.
- **폐기 명시**: types.ts:42의 "티어별 낮은 effort" 계획은 SAME-QUALITY 위반으로 폐기(✅ 주석 수정). `EXPO_PUBLIC_REASONING_PROVIDER` seam은 **모델 티어**(purpose 유래) 키잉이라 위반은 아니나, purpose-키 PURPOSE_ROUTE로 대체 예정.

## 6. 이 브랜치에서 구현된 것

**커밋 1 (Phase 1 무비용 코어)**
1. `PURPOSE_TIER`: interview_probe pro→flash 강등, northstar_propose/axis_estimate 명시 등재 (`src/lib/llm/types.ts`)
2. audit_qa 시스템 프롬프트 신설 (`src/lib/records/create.ts`) — P0-4
3. capture_ocr 직결 경로 thinking off (`src/lib/llm/gemini.ts` THINKING_OFF_PURPOSES)
4. SAME-QUALITY 충돌 주석 정리 + 이 문서

**커밋 2 (Phase 2 배선 — Simon GO 2026-07-04)**
1. `supabase/functions/_shared/llm-proxy-common.ts` — crisis lexicon·auth·CORS·caps·스키마 정규화 공통 모듈 (3벌 드리프트 해소 1단계; gemini-proxy 이관은 후속)
2. `claude-proxy` 업그레이드: 기본 `claude-sonnet-5`, D-26 purpose→model 서버 맵(opus-4-8 좌석: persona_narrative/axis_estimate/persona_synthesis/digest_weekly; `ANTHROPIC_PURPOSE_MODELS` JSON env로 무코드 오버라이드 — A5 KO 파일럿 스위치), `thinking: adaptive` + `output_config.effort`, responseSchema→json_schema 정규화 통과, refusal 감지(+refusal 감사 마커), max_tokens 사다리 상향(thinking 포함 예산)
3. `openai-proxy` 신설: gpt-5.4 기본(cluster_infer 좌석) + gpt-5.4-nano(safety outage 폴백 좌석), `reasoning_effort` 매핑, `response_format json_schema(strict:false)`, 공유 `bump_gemini_spend` 카운터 + 위기 게이트 + 감사 — config.toml 등록
4. 클라이언트 `src/lib/llm/routing.ts`: `EXPO_PUBLIC_LLM_PHASE=2` 게이트, PHASE2_VENDOR 좌석(Claude 8석 라이브 purpose; secondb_chat은 스트리밍 착지까지 의도적 제외), PHASE2_EFFORT, **OCR/voice Gemini 핀 + 이미지 입력 전역 Gemini 강제**
5. persona_chat 3분할: `persona_narrative`/`gap_synthesize`/`self_model_propose` (콜사이트·목·테스트 포함)
6. `ReasoningEffort`에 `medium` 추가(전 벤더 사다리 정합), `AuditMeta.reasoningProvider`에 `openai` 추가
7. `vendor-routing.test.ts` 신설 (Phase 게이트·좌석·핀·effort 매트릭스 검증)

**Simon 잔여 운영 스텝 (Phase 2 실제 개통)**
- [ ] Supabase Dashboard: `ANTHROPIC_API_KEY`(워크스페이스 2ndb-reasoning, 크레딧 확인) / `OPENAI_API_KEY` 시크릿 세팅
- [ ] `supabase functions deploy claude-proxy openai-proxy` (verify_jwt 유지)
- [ ] 웹 배포 env `EXPO_PUBLIC_LLM_PHASE=2` 플립 → 라이브 스모크(어드바이저 1건, persona 1건)
- [ ] A5 KO-산문 파일럿(opus-4-8 vs sonnet-5) — 실패 시 `ANTHROPIC_PURPOSE_MODELS`로 무코드 전환

나머지(§3 백로그 — chat 스트리밍/RAG, safety_classify 복구, 임베딩 이관, ops_daily_brief 통합, Batch 레인)는 후속 레인으로 분배한다. 모델 세대 전환(2.5→3.5/3.1)은 env 변경이며 allowlist(P0-3)와 락스텝.

## 6.1 벤더 백본 스위치 — `EXPO_PUBLIC_LLM_VENDOR` (2026-07-06)

> ⚠️ 위 §6 커밋2의 "Claude 8석 라이브"·§2의 좌석 요약은 **STALE**. **#829(2026-07-06)** 로 9개 추론 좌석의 `PHASE2_VENDOR`가 **OpenAI(gpt-5.4)** 로 재지정됨(Anthropic 크레딧 소진). 그러나 현재 OpenAI도 미펀딩(크레딧 $0)이라 **실사용 백본 = Gemini(`EXPO_PUBLIC_LLM_PHASE=1`)**. 정본은 `src/lib/llm/routing.ts`.

코드 수술 없이 **env 하나로** 추론 좌석의 벤더를 고른다. `resolveVendorForPurpose` 우선순위:

| 순위 | 조건 | 결과 |
|---|---|---|
| 1 | `hasImage` 또는 OCR/voice 핀(`GEMINI_PINNED_PURPOSES`) | **항상 Gemini** (스위치도 못 이김) |
| 2 | `EXPO_PUBLIC_LLM_VENDOR` ∈ {gemini, openai, claude} | 그 벤더로 **전 추론 좌석**. 비-좌석(챗·분류·인터뷰)은 Gemini 유지 |
| 2 | `EXPO_PUBLIC_LLM_VENDOR` = perPurpose | 좌석별 `PHASE2_VENDOR` 맵 |
| 3 | 미설정 | 후방호환: `EXPO_PUBLIC_LLM_PHASE`≠2 → 전량 Gemini, =2 → `PHASE2_VENDOR` 맵 |

- **기본값(미설정/`=gemini`) = 100% Gemini($0)** — 현재 상태.
- **롤백(즉시 $0)**: `EXPO_PUBLIC_LLM_VENDOR=gemini`.
- 모델 선택은 서버 env(`ANTHROPIC_MODEL`/`OPENAI_MODEL` + `*_PURPOSE_MODELS`)로 이미 가능 — 클라 스위치는 벤더(프록시)만 고른다(C1).
- outage failover(벤더 오류 → gemini-proxy 1회 재시도)는 유지 → 벤더 미펀딩이어도 fail-safe.
- 테스트: `vendor-routing.test.ts`(스위치 전 분기) + `vendor-routing-live.test.ts`(=claude → claude-proxy 배선).

**나중에 유료 벤더 켤 때 (전환 런북 — 지금 실행 X):**
- **claude**: Anthropic 크레딧 충전 → `EXPO_PUBLIC_LLM_VENDOR=claude` → 웹 재배포. (claude-proxy 이미 배포/키.)
- **openai**: OpenAI 결제수단+크레딧 → `OPENAI_API_KEY` 시크릿 주입 → openai-proxy 재배포(v1이 #829 이전) → `EXPO_PUBLIC_LLM_VENDOR=openai`.
- 저한도 검증(QA `.env.test`): 해당 프록시 `gap_synthesize`→200 + `modelUsed` 접두어. 경계 422/403/401.

## Axis key attribution (D-27) — (벤더 × 모델 × 리즈닝) 축별 API 키

라우팅이 `purpose → vendor → model → clampedEffort` 를 정한 뒤, 프록시는 그 **조합 전용 키**로 벤더를 호출한다. → 벤더 청구/사용량 대시보드에서 **키별 = 조합별**로 사용량·비용이 분리 집계된다. (모든 키가 같은 결제 계정에 청구됨 — 분리는 "귀속"이지 별도 결제계정이 아니다.)

**시크릿 네이밍** (env-var 안전: 대문자+언더스코어): `{PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}`

- `PREFIX` ∈ {`ANTHROPIC`, `OPENAI`, `GEMINI`}. 모델 슬러그: `claude-sonnet-5→SONNET5`, `claude-opus-4-8→OPUS48`, `gpt-5.4→GPT54`, `gpt-5.4-nano→GPT54NANO`, `gemini-2.5-flash→G25FLASH` 등. 미등록 모델은 대문자+영숫자 압축으로 자동 슬러그(코드 변경 없이 조합명 획득).
- `EFFORT` = 프록시가 실제 upstream에 보내는 **clamped effort**(대문자). `max`는 `xhigh`로 접힘.
- **정본 구현**: `supabase/functions/_shared/axis-key-name.ts`(순수·Deno-free·단위테스트) + `llm-proxy-common.ts:resolveApiKey`(Deno env 래퍼). 각 프록시가 model+clampedEffort 계산 직후 호출.

**폴백 규칙(호출 불파손)**: 조합 전용 시크릿이 없거나 비어 있으면 벤더 **BASE 키**(`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`)로 폴백하고 `console.warn` 1줄. 그 호출 사용량은 base 키에 잡힌다. base 키는 반드시 유지(프록시는 base 없으면 500).

**전체 매트릭스**(벤더별 모델 × effort ladder 전수 — Simon 결정: 모델 유동성 + 모델·리즈닝별 통계). `현재 도달` = 현 코드가 실제로 그 조합을 upstream에 보낼 수 있는지(나머지는 상한 상향/모델 이동 대비 선발급):

| 시크릿명 | model | effort | 현재 도달 | 대표 purpose |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY__SONNET5__LOW` | claude-sonnet-5 | low | ✅ | gap_synthesize |
| `ANTHROPIC_API_KEY__SONNET5__MEDIUM` | claude-sonnet-5 | medium | ✅ | ops_recommend, ops_daily_brief |
| `ANTHROPIC_API_KEY__SONNET5__HIGH` | claude-sonnet-5 | high | ✅ | advisor, self_model_propose, northstar_propose |
| `ANTHROPIC_API_KEY__SONNET5__XHIGH` | claude-sonnet-5 | xhigh | ✅ | ttfv_first_insight |
| `ANTHROPIC_API_KEY__OPUS48__LOW` | claude-opus-4-8 | low | ⛔ 선발급 | — |
| `ANTHROPIC_API_KEY__OPUS48__MEDIUM` | claude-opus-4-8 | medium | ⛔ 선발급 | — |
| `ANTHROPIC_API_KEY__OPUS48__HIGH` | claude-opus-4-8 | high | ✅ | persona_narrative, axis_estimate |
| `ANTHROPIC_API_KEY__OPUS48__XHIGH` | claude-opus-4-8 | xhigh | ✅ | persona_synthesis, digest_weekly |
| `OPENAI_API_KEY__GPT54__NONE` | gpt-5.4 | none | ⛔ 선발급 | — |
| `OPENAI_API_KEY__GPT54__LOW` | gpt-5.4 | low | ✅ | gap_synthesize |
| `OPENAI_API_KEY__GPT54__MEDIUM` | gpt-5.4 | medium | ✅ | ops_recommend, ops_daily_brief, cluster_infer |
| `OPENAI_API_KEY__GPT54__HIGH` | gpt-5.4 | high | ✅ | advisor·persona_narrative·self_model_propose·northstar_propose·axis_estimate·persona_synthesis†·digest_weekly†·ttfv_first_insight† |
| `OPENAI_API_KEY__GPT54__XHIGH` | gpt-5.4 | xhigh | ⛔ 선발급 | — (openai-proxy가 reasoning 좌석을 high로 clamp) |
| `OPENAI_API_KEY__GPT54NANO__NONE` | gpt-5.4-nano | none | ✅ | safety_classify |
| `OPENAI_API_KEY__GPT54NANO__{LOW..XHIGH}` | gpt-5.4-nano | low/medium/high/xhigh | ⛔ 선발급 | — |

† = `PHASE2_EFFORT`는 xhigh 요청이지만 `openai-proxy`의 `PURPOSE_EFFORT_MAX`가 `high`로 clamp → 실제 upstream = high. 그래서 `GPT54__XHIGH`는 현재 **도달 불가**.

- **Anthropic 전체 8** (2 모델 × 4 effort) / **OpenAI 전체 10** (2 모델 × 5 effort). 유료 총 **18**.
- **Gemini**($0 백본): 코드 배선은 3프록시 동일(uniform). **운영 결정(Simon, 2026-07-10) — Gemini는 `gemini-3.5-flash`(슬러그 `G35FLASH`) 하나만 사용.** 따라서 조합 키는 `GEMINI_API_KEY__G35FLASH__{LOW,MEDIUM,HIGH,XHIGH}` **4개만 발급·등록(완료)**. 다른 Gemini 모델(2.5-flash/-flash-lite/-pro, 3.1-flash-lite)은 미사용 → 조합 키 없음(호출 시 base `GEMINI_API_KEY` 폴백). ($0라 벤더-대시보드 비용 귀속 실익은 작고, 모델·리즈닝별 통계는 아래 감사로그 컬럼으로 커버.)

  > **→ Claude Code 인계 명시:** **Gemini 좌석 = `gemini-3.5-flash` 전용.** 위 4개 조합 키가 실제로 쓰이려면 **앱의 Gemini 라우팅이 `gemini-3.5-flash`로 가야** 한다 — `EXPO_PUBLIC_MODEL_LITE/_FLASH/_PRO`(또는 `types.ts`의 `PURPOSE_TIER`→`MODELS` 매핑)를 `gemini-3.5-flash`로 핀할 것. 아니면 다른 모델 슬러그(`G25FLASH` 등)로 조회돼 base 키로 폴백된다. `gemini-proxy`의 `MODELS_ALLOWED`에는 `gemini-3.5-flash`가 이미 포함돼 있어 프록시단 변경은 불필요.

**감사로그 재분해(0073)** — 키가 못 나누는 축(purpose·user·time)까지 SQL로 재분해. `ai_audit_log`에 nullable 컬럼 추가: `purpose`, `reasoning_vendor`(gemini/claude/openai), `reasoning_effort`(clamped), `key_combo`(사용 시크릿명 또는 base), `total_tokens`(벤더 usage). 서비스롤 프록시가 기록(네이티브 `log_ai_audit` RPC 경로는 미변경 → NULL). 예:

```sql
-- 조합별(벤더×모델×effort) 호출·토큰 집계 (최근 30일)
select reasoning_vendor, model_used, reasoning_effort, key_combo,
       count(*) calls, sum(total_tokens) tokens
from ai_audit_log
where created_at >= now() - interval '30 days' and reasoning_vendor is not null
group by 1,2,3,4 order by tokens desc nulls last;
```

**결제 선행(현 블로커)**: OpenAI org $0·결제수단 없음, Anthropic 크레딧 소진. 키를 넣어도 펀딩 전엔 429/402→502. **발급·저장·배선·문서는 지금 가능(무과금)**, 실사용은 펀딩 후. 앱 기본은 Gemini($0) 유지, 유료 벤더 플립은 별건 승인(위 전환 런북).
