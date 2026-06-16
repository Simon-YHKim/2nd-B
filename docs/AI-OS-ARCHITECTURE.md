# AI-OS Architecture — Personal Context Layer

> 2026-06-16 작성. `docs/ARCHITECTURE.md`(5계층 그래프 정본)의 보강 문서.
> 클리핑 → 정형화 → 인덱싱 → 검색 → 내보내기 파이프라인을 산업 best practice(2025-2026)에 맞춰 설계.
> 모든 결정은 솔로 빌드 · Gemini 고정(C1/C2) · 무료티어($0/mo) · 데드라인 2026-08-17 제약 안에서 내려졌다.

## 0. 프레이밍 — 우리가 만드는 것

2nd-B는 "노트 앱"이 아니라 **Personal Context Layer**다. 사용자의 데이터 저장소 = LLM의 **외부 메모리**이고,
내보내는 파일이 곧 제품의 해자(moat)다. 캐치프레이즈 *"AI 시대 가장 가치있는 자산 = 나 자신"* 의 시스템적 구현.

근거:
- Karpathy "System Prompt Learning"(2025-05): 사전학습=지식, 파인튜닝=습관에 더해 **명시적·재사용 가능한 전략 누적**이 빠진 3번째 패러다임. ChatGPT Memory를 "원시적 구현"이라 평가.
- Anthropic "Context Engineering"(2025-09): 핵심 원칙 = *"원하는 결과 확률을 최대화하는 최소 고신호 토큰 집합."* 기법 = compaction / 외부 메모리 노트 / sub-agent.
- Tiago Forte "AI Second Brain"(2026-04): PKM → **Personal Context Management** 재정의. "AI에게 나에 대해 충분히 줘서 출력이 쓸모있게."

> 정직성 가드: 이것은 **반복 학습 루프**지 자기개선 AGI가 아니다(Karpathy 본인 부인). 카피에서 과장 금지.

## 1. 갭 분석 — 현재 2nd-B에 없는 것

| # | 빠진 것 | 현재 상태 | 위험 |
|---|---|---|---|
| G1 | 인제스트 게이트(저장 전 필터) | 없음. `sources`에 직행 | 무작위/노이즈 데이터 누적 |
| G2 | PII 스크리닝(Gemini 전송 전) | `<UNTRUSTED>` 펜스만(주입 방지용) | 클리핑 글의 *타인* 개인정보가 Gemini로 |
| G3 | 양시간(bi-temporal) 모순 처리 | 없음 | "변하는 나"를 그래프가 표현 못함 |
| G4 | System Prompt Learning 루프 | 없음 | 사용 경험이 복리로 쌓이지 않음 |
| G5 | 크로스벤더 LLM-judge(CI) | 없음 | 안전분류기/품질 검증 루프 부재 |
| G6 | 인덱스/요약-우선 검색 | "dump and fence"(전체 600자 truncate) | 데이터 증가 시 확장 불가 |
| G7 | 타입드 엣지 | `wiki_links` 무타입(가중치=공유태그 수) | 관계의 *의미* 손실 → 패턴 발견 약화 |

## 2. 빌드 블록

각 블록 = [근거] → [2nd-B 현재] → [방안]. 기존 7-Engine 로드맵(Capture/Inference/Memory-RAG/...)의
당겨오기 + 보강이며 재설계가 아니다.

### §1 클리핑 → 고정 스키마 자동정리 (Engine 1 보강)

**근거**: 클리핑+정형화가 인덱싱의 1차 재료. garbage-in이면 엣지·인덱스·내보내기가 전부 오염.

**방안 — 저장 전 게이트 + 2-pass 정규화:**
```
유입
 → ① PII 스크럽 (Presidio 패턴: regex+checksum → NER. 복원 필요시 reversible tokenization)
 → ② 중복제거 3단 (exact hash → MinHash-LSH 근접중복 → 임베딩은 생존분만)
 → ③ 관련성 점수 (Gemini Flash-Lite, 1~5 + 임계값. 미달 폐기. C9→C3 경로, ai_audit_log 기록)
 → ④ 2-pass 정규화
       pass1: 자유서술 요약/추론  (reason-first)
       pass2: responseSchema 강제 → { category, tags[], summary, edges[] }  (format-second)
 → Zod 검증 → 실패시 에러 첨부 재시도(≤N) → dead-letter
```

**핵심 반증(주의)**:
- "structured output = 정확한 output"은 **거짓**. 스키마 통과해도 ~30% 오류 + 제약 디코딩이 추론 10~15% 저하.
  → `reason-first, format-second`(pass1 분리)가 필수.
- 양식 enum(`category`/`tags`)에 **금지 임상어휘 차단**을 박는다(`src/lib/safety/lexicon.ts` 연동). AI가 양식을 따르되 어휘는 제약.

**기술 결정**:
- 구조화 출력: Gemini `responseSchema` + `responseMimeType: application/json` (bare JSON mode 아님).
- 검증: Zod + retry-with-error(Instructor 패턴).

### §2 대량/무작위 덤프 처리 (Engine 1 인프라)

**근거**: 큰 컨텍스트 윈도우가 커버리지를 보장하지 않음(반증). 동기 처리는 타임아웃/부분실패에 취약.

**방안**:
- **pgmq + pg_cron + Edge Functions** 3단: collect → distribute `limit(50)` → process `limit(1)`.
- try-finally 격리(한 건 실패가 큐를 막지 않게), **멱등키 = content hash**(재덤프는 §1-②에서 단락).
- 거대 단일 문서 → **map-reduce 요약 fan-out**(분할 → 병렬요약 → 병합).
- MVP/데모는 동기 단건으로 시작 → 데이터 증가 시 이 인프라로 승격.

### §3 청킹 + 컨텍스트 헤더 (Engine 3 입력단)

**방안**:
- **Recursive 400~512토큰, ~15% 오버랩.** semantic chunking은 비용 대비 이득 없음(NAACL 2025 반증), 과도 오버랩 무익(반증).
- **Contextual Retrieval**(청크마다 "이게 어디 속하는지" 50~100토큰 헤더 선부착) = 검색실패 **35%↓**, 리랭킹 결합 시 **67%↓**. Flash 한 번/청크로 저렴. 단일 최고 ROI.

### §4 인덱스/요약-우선 검색 (Engine 3 — 현재 #1 약점 교체)

**근거**: 현재 매 대화마다 위키 전체를 600자 truncate해 주입 → 데이터 증가 시 붕괴. context rot(Chroma, 18개 모델 전부 입력 증가 시 성능 저하), NoLiMa(32K에서 11/13 모델 성능 반토막).

**방안 — 2단 검색("스캔 후 드릴다운")**:
- Stage1: LLM이 **한 줄 요약 인덱스 + 타입드 이웃**을 스캔 → 관련 node ID 지명.
- Stage2: 그 노드만 풀로 fetch.
- **RAPTOR식 클러스터 요약** = **Pattern Data 티어(snowflake)**에 자연 매핑. 본문 truncate 폐기, 요약 노드로 대체.
- 임베딩: **gemini-embedding-001 @768dim(Matryoshka) + pgvector + RRF 하이브리드**(벡터+tsvector, 정밀도 62%→84%). 무료티어 가능, 배치/캐시로 TPM 회피.
- **풀 GraphRAG 스킵**(LazyGraphRAG 기준 빌드비 $20~500 = 과잉). 타입드 엣지로 **검색 확장**(벡터 히트 후 causes/contradicts 이웃 당기기) = 그래프 엔진 없이 멀티홉 이득.

### §5 타입드 엣지 — 양시간 (G3/G7)

**방안**:
- 고정 enum 6개: **인과(enables) / 시간(precedes) / 모순(contradicts) / 강화(reinforces) / 부분(part-of) / 감정연합.** RDF 풀스택 대신 property-graph 라벨만 차용.
- `edges` 테이블(또는 `wiki_links` 확장): `relationship_type` + **`valid_from`/`valid_until`**.
- **모순 시 둘 다 보존**(Zep/Graphiti bi-temporal, LongMemEval 94.8%) → 저널링에서 "변하는 나" 표현. SimonKWiki 반항권("그건 옛날 나")과 동형.
- 엣지는 **write 시 lazy 분류**(태그 동시출현 + 가벼운 Gemini). 밀집 전관계 그래프 금지(190 vs 19 과잉 경고).
- **시각은 cyan 유지**(CLAUDE.md Visual Tier 규칙). 타입은 데이터/검색 레이어 전용, 색 분기 아님.

### §6 내보내기 — 공용 LLM이 우리 시스템대로 (사용자 핵심 우려)

**근거 & 결론**: 가능하다. 단 "큰 덤프"가 아니라 "2층 구조 + 배치"가 조건.

- **2층 파일**: 짧은 **라우터/인덱스 헤더**(수백 토큰: 정체성 + OS 규칙 + 섹션 목차) + 필요시만 당기는 상세 섹션. llms.txt 패턴(단, llms.txt는 *지시서가 아니라 색인*).
- **규칙은 맨 위, 세션별 요청은 맨 아래.** Anthropic 공식: query-at-end가 품질 **+30%**. lost-in-the-middle U자 곡선 → 중간에 규칙 묻으면 최악. "지시 앞에 박기" 직관은 *절반만* 맞다(규칙=위, 그 세션 할 일=아래).
- **포맷 = SKILL.md + AGENTS.md 프레이밍**(YAML frontmatter + 마크다운 + XML/헤딩 구획). 2025-12 Anthropic 오픈 → OpenAI·MS·Google 채택 → 2026 GPT/Gemini/Claude가 다 읽는 유일한 크로스벤더 표준.
- **소비자 앱 한도 존중**: ChatGPT Custom GPT ~8K자, **Gemini Gems ~4K자**, Claude Projects 무제한. **헤더 단독이 Gems 4K 안에** 들어가게, 상세는 knowledge 첨부.
- **토큰 걱정의 진실**: 대부분 *비용* 문제이고 캐싱이 50~90% 절감(Anthropic 90%/OpenAI 50%/Gemini 75%). **단 캐싱은 컨텍스트 윈도우를 비워주지 않는다**(캐시 토큰도 윈도우 차지 + rot 그대로). 진짜 해법 = "작게+구조화", "크게+캐싱" 아님.
- **솔직한 한계**: Gems/Custom GPT는 지시 무시 사례 다수(공식 포럼) → "완벽 제어" 약속 불가. 헤더 단독으로도 작동하게 graceful degrade 설계.

### §7 System Prompt Learning 루프 + 개발단계 멀티에이전트 (G4/G5)

- **SPL 루프**: 앱이 "나한테 통한 전략"을 명시적으로 누적 → 과제별 검색. 쓸수록 복리. (Karpathy SPL의 제품화.)
- **페르소나/토론 — 개발단계 YES, 런타임 권위로는 금지**:
  - 개발: ai-debate(아키텍처/스코프/네이밍 결정), persona-simulation(기능/카피 스크리닝), 크로스벤더 LLM-judge(CI에서 안전분류기·품질 채점, 순서스왑+다른벤더로 self-preference 완화).
  - 런타임 금지: "사용자에 대한 패널 합의"를 단정적 결론으로 제시. 연구상 멀티에이전트 합의는 공유 편향 증폭 + sycophancy + 가짜합의 → 자신감 있게 틀린 결론. 취약한 상황의 사용자에게 위험, 비임상 원칙 충돌.
  - 근거: "Should we be going MAD?"(ICML 2024, 토론이 self-consistency를 동일 예산서 못 이김), sycophancy 연구(Science 2026, 사용자가 취약함 표현 시 악화).

## 3. 제약 가드레일 (이 설계가 깨면 안 되는 것)

- 인제스트의 **모든 Gemini 호출**(관련성/요약/엣지분류)도 **C1(gemini.ts 경유) → C9(classifyInput) → C3(ai_audit_log)** 통과.
- 양식 enum에 **금지 어휘 차단**(C 어휘 정책, lexicon.ts 단일 출처).
- 엣지 **시각 = cyan**(Visual Tier). 정보밀도 규칙(한 화면 한 메시지) 유지.
- 신규 의존성은 **무료티어 영향 확인**(blueprint §5, $0/mo).
- 데드라인 **2026-08-17**, 솔로·저녁/주말 → 스코프 현실적으로.

## 4. 우선순위 로드맵

| 순 | 블록 | 임팩트 | 노력 | XPRIZE 전 |
|---|---|---|---|---|
| 1 | §1 인제스트 게이트 + 2-pass 스키마 | ★★★ | 중 | 필수 (데이터 품질 토대) |
| 2 | §4 인덱스/요약-우선 검색 | ★★★ | 중상 | 필수 (확장성 벽 해소) |
| 3 | §6 내보내기 2층 재설계 | ★★★ | 중 | 필수 (심사 차별점) |
| 4 | §5 타입드 엣지 bi-temporal | ★★ | 하 | 권장 (자기이해 가치) |
| 5 | §3 컨텍스트 헤더 | ★★ | 하 | 선택 (검색품질) |
| 6 | §2 pgmq 비동기 인프라 | ★★ | 중 | **§1과 동반**(풀 게이트+벌크는 동기 불가) |
| 7 | §7 SPL 루프 + CI judge | ★ | 중 | 이후 |

**시작점 = §1**(사용자 결정). 클리핑→정형화의 토대이며 2·3·4·5가 전부 §1 출력 품질에 의존.
eng review 권장은 §4-first였으나 사용자가 §1-first로 확정. 풀 게이트 결정으로 §2가 §1에 결합됨(roadmap 6 갱신).

## 5. §1 구현 계획 (eng review 완료 — 2026-06-16)

**목표**: 유입 데이터를 저장 전 필터링하고, AI가 고정 스키마로 카테고리·태그·요약·엣지를 채워 `sources`/`wiki_pages`에 정규화.

### 확정 결정 (eng review)
- **순서: §1 먼저** (사용자 결정 — 리뷰 권장 §4-first 및 outside voice 대비 override).
- **PII/dedup: 풀 게이트 지금** (사용자 결정).
- 단 아래 3개는 취향이 아니라 하드 제약이라 구현 방식만 보정(결정 불변):
  - Presidio(Python)는 RN/Deno Edge 불가 → 풀 PII = regex/checksum + **allowed model 경유 LLM NER 패스**(`gemini-proxy` MODELS_ALLOWED 내 모델, 호출 1회 추가).
  - `gemini-2.5-flash-lite`는 `MODELS_ALLOWED`(gemini-proxy:51)에 없어 400 → 관련성은 별도 호출 금지, phase1 패스 필드로 흡수.
  - 풀 게이트 + 벌크는 동기 불가(200/day cap gemini-proxy:93, MAX_USER_LEN=8000 gemini-proxy:55) → **§2 pgmq 큐가 §1과 동반**(optional 아님).

### Locked design (리뷰 findings 반영)
- **PII 스크럽 위치 = `gemini-proxy` 내부**(서버 egress). 클라 RN 스크럽은 우회 클라가 raw 전송 → 위협모델 미충족(A2).
- **정규화 = `phase1.ts` 스키마 확장**(별도 `normalize.ts` 신설 X — DRY, A1). `PHASE1_SCHEMA`에 `{category(enum), tags[], edges[], relevance(1-5), keep(bool)}` 추가. 관련성/keep을 pass1에 접어 넣어 호출 수 최소화(A4).
- **금지어휘 = 생성 후 `containsForbiddenLexicon()` 사후 필터**(classifier.ts). `tags[]`는 responseSchema enum 강제 불가(C3).
- **dedup**: exact-hash → MinHash-LSH 근접중복 → 임베딩은 생존분(C4 풀 게이트 결정 반영). 멱등키 = **post-scrub 정규화 텍스트 해시**(C2).
- **드롭 감사 = 별도 `ingest_log` 테이블**(드롭 사유·단계). `ai_audit_log`는 Gemini 호출만 기록, Gemini 전 드롭은 행이 안 생김(C1). kept 항목은 `sources` 확장.
- **인제스트 안전정책 분리**(A5 critical): `classifyInput`을 1인칭 크라이시스 라우팅으로 쓰지 않는다. 3자 클리핑 전용 정책 — red 마커는 태깅/격리만, `crisis_events` 기록·핫라인 노출 금지(자살예방 기사를 저장했다고 사용자에게 핫라인 띄우면 안 됨).
- **출력 cap**: edges 항목당 ≤8, 스키마 슬림 → MAX_OUTPUT_TOKENS=1024(프록시) truncate→Zod 실패→재시도 cap 소모 방지(P2).

### 신규/수정 파일
- `supabase/functions/gemini-proxy/index.ts` — PII regex 스크럽 + LLM NER 패스 라우팅(allowed model), post-scrub 멱등 해시.
- `src/lib/ingest/gate.ts` — dedup + 관련성 임계 + ingest_log 오케스트레이션(순수 우선).
- `src/lib/ingest/dedup.ts` — exact-hash + MinHash-LSH(순수 함수).
- `src/lib/wiki/phase1.ts` — PHASE1_SCHEMA 확장 + 사후 lexicon 필터.
- `src/lib/safety/ingest-policy.ts` — 3자 클리핑 안전 정책(크라이시스 라우팅 분리, A5).
- `src/lib/llm/gemini.ts` — purpose 추가(`ingest_pii_ner`, `ingest_normalize`), C1/C3/C9 유지.
- `db/migrations/0024_ingest.sql` — `ingest_log` 테이블 + `sources.{relevance_score, content_hash, dedup_of}` + 인덱스.
- 테스트: `__tests__/ingest/*` + **A5 회귀**(자살예방 기사 클리핑 → 크라이시스 미발동), 멱등, 출력 truncate→Zod 재시도 상한, 금지어휘 사후필터 거부.

> 파일 8개 = 복잡도 임계. 풀 게이트 결정의 내재적 비용이며, §2 큐 동반으로 한 세션엔 안 들어감 → 멀티 세션/worktree 분할 권장.

**불변식**:
- 관련성 미달은 `sources` 저장 안 함 + **`ingest_log`에 드롭 사유 기록**(ai_audit_log 아님).
- 동일 post-scrub content_hash 재유입은 신규 행 생성 안 함(멱등).
- 스키마 검증 실패는 N회 재시도 후 dead-letter, 부분 데이터 커밋 금지.
- 모든 Gemini 호출(PII NER·정규화)은 mock 모드에서도 `ai_audit_log` INSERT(C3), `callGemini` 경유(C1), `classifyInput` 선행(C9 — 단 인제스트는 크라이시스 라우팅 분리).

## 부록 — 핵심 출처

- Karpathy System Prompt Learning: x.com/karpathy/status/1921368644069765486
- Anthropic Context Engineering: anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic Contextual Retrieval(35/67%): platform.claude.com/cookbook (contextual-embeddings)
- 청킹 반증(NAACL 2025): aclanthology.org/2025.icnlsp-1.15.pdf · firecrawl.dev/blog/best-chunking-strategies-rag
- structured output 반증: rotascale.com/blog/structured-output-isnt-reliable-output
- Gemini structured output: ai.google.dev/gemini-api/docs/structured-output
- Supabase 대용량 잡(pgmq): supabase.com/blog/processing-large-jobs-with-edge-functions
- 타입드 엣지/PKG: volodymyrpavlyshyn.medium.com/personal-knowledge-graphs-in-obsidian-528a0f4584b9
- Zep/Graphiti bi-temporal: arxiv.org/abs/2501.13956
- RAPTOR: arxiv.org/pdf/2401.18059
- LazyGraphRAG: microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost
- Supabase 하이브리드 검색: supabase.com/docs/guides/ai/hybrid-search
- context rot: trychroma.com/research/context-rot · NoLiMa: arxiv.org/html/2502.05167v1
- query-at-end +30%: platform.claude.com (prompting best practices)
- SKILL.md 크로스벤더: paperclipped.de/en/blog/agent-skills-open-standard-interoperability
- 캐싱 비교: prompthub.us/blog/prompt-caching-with-openai-anthropic-and-google-models
- 멀티에이전트 토론 반증(MAD): proceedings.mlr.press/v235/smit24a.html
- sycophancy: science.org/doi/10.1126/science.aec8352

## Implementation Tasks
Synthesized from the eng review findings. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1d / CC: ~30min)** — gemini-proxy — PII 스크럽(regex/checksum email·phone·주민번호 + allowed-model LLM NER 패스) + post-scrub 멱등 해시
  - Surfaced by: Architecture A2/A3, Code Quality C2
  - Files: `supabase/functions/gemini-proxy/index.ts`
  - Verify: 단위테스트 — PII 마스킹, 동일 post-scrub 텍스트 → 동일 해시
- [ ] **T2 (P1, human: ~3h / CC: ~20min)** — phase1 — `PHASE1_SCHEMA`에 `{category,tags,edges,relevance,keep}` + 사후 `containsForbiddenLexicon()` 필터
  - Surfaced by: Architecture A1/A4, Code Quality C3
  - Files: `src/lib/wiki/phase1.ts`
  - Verify: `[→EVAL]` 정규화 품질 eval + 금지어휘 태그 거부 테스트
- [ ] **T3 (P1, human: ~3h / CC: ~20min)** — safety — 3자 클리핑 인제스트 안전정책(크라이시스 라우팅 분리) + A5 회귀
  - Surfaced by: Architecture A5 (critical gap)
  - Files: `src/lib/safety/ingest-policy.ts`, `src/lib/wiki/__tests__/`
  - Verify: `[→E2E]` 자살예방 기사 클리핑 → `crisis_events` 미생성·핫라인 미표시
- [ ] **T4 (P1, human: ~2h / CC: ~15min)** — db — `ingest_log` 테이블 + `sources.{relevance_score,content_hash,dedup_of}`
  - Surfaced by: Code Quality C1/C2
  - Files: `db/migrations/0024_ingest.sql`
  - Verify: `npm run check:constraints` + 드롭 항목이 ingest_log에 기록되는지
- [ ] **T5 (P1, human: ~1d / CC: ~40min)** — infra — §2 pgmq 큐(풀 게이트+벌크는 동기 불가로 §1과 동반)
  - Surfaced by: Performance P1
  - Files: `supabase/migrations` (pgmq), Edge Function 워커
  - Verify: 100건 벌크 → cap 미초과, 부분실패 격리
- [ ] **T6 (P2, human: ~2h / CC: ~15min)** — ingest — dedup(exact-hash + MinHash-LSH) + 관련성 임계 오케스트레이션
  - Surfaced by: Code Quality C4
  - Files: `src/lib/ingest/gate.ts`, `src/lib/ingest/dedup.ts`
  - Verify: 근접중복 단락, 멱등 재유입
- [ ] **T7 (P2, human: ~1h / CC: ~10min)** — schema — edges 항목당 ≤8 + 슬림 스키마(1024 토큰 truncate 방지) + Zod 재시도 상한
  - Surfaced by: Performance P2
  - Files: `src/lib/wiki/phase1.ts`
  - Verify: 큰 출력 → truncate 없이 유효 JSON, 재시도 cap 준수

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 11 issues (A1-A5, C1-C4, P1-P2), 2 critical gaps folded |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | §4-first 권고 + §1 phase1 중복/§2 결합 지적 |

- **CROSS-MODEL:** 양 리뷰 합의 — A1(phase1 중복), A2(PII는 proxy), A4(별도 관련성 호출 금지). 분기 — 순서(리뷰 §4-first vs 사용자 §1-first)와 게이트 범위(리뷰 연기 vs 사용자 풀 게이트). 둘 다 사용자가 명시 결정 → accepted risk, 재논쟁 안 함.
- **ACCEPTED RISK (사용자 결정):** §1-first + 풀 게이트는 데드라인 압박·무료 cap·§2 결합 비용을 안고 감. 보정: Presidio 대신 LLM NER, allowed model, §2 동반.
- **VERDICT:** ENG reviewed — 11 findings 전부 §5 계획에 반영(critical A5/C1 포함). SCOPE_REDUCED(정규화는 phase1 확장으로 흡수)이나 게이트는 풀 범위. 구현 착수 가능 — 단 8파일+§2라 멀티세션/worktree 분할.

NO UNRESOLVED DECISIONS
