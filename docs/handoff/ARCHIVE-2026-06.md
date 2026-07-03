# 2nd-Brain Handoff — Archive 2026-06

> `docs/HANDOFF.md` 에서 분리한 2026-06-01 ~ 2026-06-26 세션 핸드오프 (2026-07-03 감사 §B2). 최신 상태는 `../HANDOFF.md` 참조. 원문 순서(최신 위)·내용 그대로 보존.

---

## 2026-06-26 / DB user-profiling 진단 + 7별 근거 기반 대확장 (knowledge_sources 95→140 live)

> 별개 세션. 위 크래시 핫픽스와 무관하게 PR **#595**(draft, OPEN — 아직 미머지)에서
> "근거 깊이 확장"만 진행. main 은 건드리지 않음.

### 어디까지 왔나
- main HEAD: `26179b6` (이번 세션 동안 main 변동 없음 — 모든 작업이 PR #595).
- 이번 세션 머지된 PR: **없음**. 작업은 전부 PR **#595** (branch `claude/database-user-profiling-check-7l4d8i`, **draft, OPEN**), 11 commits.
- 테스트: `npm run verify` green (**257 suites / 1962 tests**) — 매 push 전 통과.
- working tree: clean.

### 무엇을 했나 (PR #595)
1. **진단**: 앱 DB 가 '나'를 7개 **생활영역 별**(커리어·재정·성장·관계·건강·오락·담아내기, `domain-stars.ts`)로 파악. 실측 결과 데이터가 비어있고(records 전부 `domain:(none)`), recency 가 죽어있고, 관계/오락 별은 read 만 배선돼 있었음.
2. **파이프라인 수리**: recency 신호를 prod 에 연결(`load-domain-levels.ts` Date.now()), 밝기→조언 배선(`retrieve.ts` + `gemini.ts`: dim 별이 자기 근거를 advisor 로 끌어옴), 관계/오락 테이블을 밝기에 fold.
3. **쓰기 경로**: `src/lib/relation/people.ts` + `src/lib/recreation/items.ts` (dead-schema 였던 0058/0059 의 writer, ledger 패턴).
4. **근거 대확장** (유튜브 4,074영상 토픽 갭맵 → 학술 디벨롭): P1 loneliness·attraction, P2 sensitivity·communication, P3 manipulation·family_of_origin, + 5 life-domain seeds, + cross-cultural-global-south **21/22행**, + 한국어 KCI 행 5개. 전부 batch.md + seed.sql + 라우팅 + 도달성 테스트.
5. **라이브 적재**: Supabase `knowledge_sources` **95 → 140행** (전부 실DOI/KCI + verified_at, advisor 라우팅에 도달).

### 활성 인프라
- Supabase project **`zoacryukmdeivmolvyhj`** (name `2nd-brain`, ap-northeast-2, ACTIVE_HEALTHY).
- **live `knowledge_sources` = 140 rows** (이번 세션 +45). KO rows = 21. 확인: `select count(*) from public.knowledge_sources` (expect 140).
- (DressRoom project `nthmmpvygoiybvtxwpep` 는 INACTIVE — 무관.)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **PR #595 리뷰 → draft 해제 → 머지** (45행 적재 완료, verify green) | medium | ⭐ 세션 결실 마무리 |
| B | relation/recreation **캡처 UI** (writers 완료, 화면만 필요) — 전역규칙상 **design-first 인테이크 먼저** | large | ⭐ 두 별이 실데이터 받게 |
| C | `star_tier_history` **evidence-link** (migration 0060: source_record_id) — 조언 "왜" 설명 | medium | 무결성 |
| D | attraction **한국어 KCI 행** — 한국 매력/관계형성 척도 타당화 나오면 (현재 없어 보류) | small | 후속 |
| E | cross-cultural 22번째(Allwood&Berry *preface*) — 비실질이라 의도적 제외. n/a | — | skip |

### 적용 중인 정책 (영구)
1. 모든 push 전 `npm run verify` green (257 suites). 라이브 DB 적재는 `BEGIN/COMMIT` 원자적 + framework 중복 사전 확인.
2. **YouTube = 주제 발굴 입력만, citation 아님**. 근거는 학술 DOI 만 (`docs/research/README.md` 거부 체크리스트).
3. **안 읽은 논문 요약 금지** — 핵심 확인 후 작성하거나 deferred 명시 (cross-cultural 21/22, attraction-KO deferred).
4. cross-cultural **비본질주의**: 문화 내 변산 > 문화 간 변산, 국적→개인 추정 금지.
5. **비임상 lexicon 엄수**. manipulation/family-of-origin 등 민감 batch 는 `crisis-detection` always-load + 안전 테스트(manipulation 메시지에도 crisis 유지).
6. seed 추가 = **5종 세트**: `batches/<slug>.md` + `seed/<slug>.sql` + `retrieve.ts` 라우팅(ROUTING+SLUG_TO_FRAMEWORK) + 도달성 jest + `seed/README.md` 적재 체크리스트 → 그다음 라이브 적재.
7. 새 record 는 capture 시 `domain:` 태깅됨(`records/create.ts:223`). 기존 `domain:(none)` 는 레거시.

### 핵심 파일 위치
```
src/lib/persona/domain-stars.ts           7 생활영역 별 정의 (Layer A)
src/lib/persona/domain-confidence.ts      밝기 = coverage + recency(opt-in now)
src/lib/persona/load-domain-levels.ts     records+relation_people+recreation_items → 밝기, Date.now() recency 주입
src/lib/knowledge/retrieve.ts             advisor 라우팅 + brightness→advice (DOMAIN_TO_BATCH)
src/lib/llm/gemini.ts                     callAdvisor 가 loadDomainLevels best-effort 로드
src/lib/relation/people.ts                관계 writer (createPerson 등)
src/lib/recreation/items.ts               오락 writer (createRecreationItem 등)
db/migrations/0058_relation_people.sql    관계 구조화 테이블 (owner RLS)
db/migrations/0059_recreation_items.sql   오락 구조화 테이블 (owner RLS)
docs/research/youtube-topic-gap-map.md    유튜브 4,074영상 토픽→근거 갭맵
docs/research/batches/*.md + supabase/seed/*.sql   근거 코퍼스 (40 batches / 140 rows)
```

### 검증
```bash
cd /home/user/2nd-B && npm run verify        # 257 suites / 1962 tests
# 라이브 행 수 (Supabase MCP): select count(*) from public.knowledge_sources;  -- expect 140
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
git checkout claude/database-user-profiling-check-7l4d8i   # PR #595 이어가기 (A 작업부터)
```

---
## 2026-06-26 (앞선 세션) — 🚨 긴급 크래시 핫픽스 (SecondbHead head-touch) + QA loop PR 일괄 머지 + 클라우드 인계

### 어디까지 왔나
- main HEAD: `717c0543`
- 이번 세션 머지된 PR: **#592**(PF-1 home star labels) · **#593**(PF-9 hint "lenses"→"life areas", 5 locale) · **#594**(polaris label widen) · **#596**([HOTFIX] eas-update: Supabase env + `--environment`) · **#597**(account build/OTA identifier) · **#598**(PF-7 DOB placeholder 예시). (#590/#591 직전 머지.)
- 테스트: `npm run verify` green (255 suites / 1927 tests) — 머지 전 각 PR 통과.
- working tree: clean.

### 🚨 크래시 핫픽스 (CLOSED)
- **증상:** 다운로드 preview 앱에서 SecondbHead 머리를 ~4초 드래그하면 일관 크래시 (런치 크래시 아님 — 메인 정상 진입).
- **ROOT CAUSE:** SecondbHead 눈 노드가 `blink`(애니)와 `eyeOffset`(터치 시선추적) transform을 공유. #590 이전엔 `blink`=native driver, `eyeOffset`=JS driver → `blink`(1.6~4.8s 랜덤 주기)이 터치 중 발동하면 같은 노드에 native+JS 동시 → "JS driven animation on a node moved to native" 크래시. **#590(`66c1124e`)이 `blink`→JS로 이미 fix.** 현 main은 driver-consistent (전수 `useNativeDriver` 점검: `bob`만 native, 독립 inner 노드).
- **사고 경위:** preview APK 임베디드 번들 = #590 이전(버그). `eas-update.yml`이 매 main 머지마다 OTA 자동게시하나 `EXPO_PUBLIC_SUPABASE_*` env 없이 게시 → 모든 OTA가 `env.ts` demo Supabase placeholder fallback(부팅되나 auth/data 죽음). 12:54 `eas update:roll-back-to-embedded`(잘못된 미티게이션)가 사용자를 #590 이전 버그 임베디드로 되돌린 역효과.
- **해결:** preview 채널에 고친 OTA 재배포 — commit `2cd5bf80` + 실제 supabase env, **update group `28b98f03`**, runtimeVersion 0.0.6 → rollback 무효화. **사용자 복구법 = 앱 완전종료 후 2회 재실행** (`fallbackToCacheTimeout:0`이라 1회차 OTA 다운로드·2회차 적용).
- **재발방지(#596):** `eas-update.yml`에 Supabase env + `--environment` + stale 0.0.5 주석 수정.
- 전 과정 기록: **`reports/HOTFIX_CRASH_270626.md`**.

### 다음 작업 큐 (원래 /loop QA, 중단됨 — SoT: `reports/qa/270626_loop_findings.md` + `reports/qa/CLONE-PROGRESS.md`)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 핫픽스 후속: `eas-update.yml` auto-publish 게이팅 (매 머지 자동게시 → 수동 dispatch / post-verify) | small | ⭐ 이번 사고의 구조적 원인 |
| B | `app/_layout` 루트 ErrorBoundary (렌더에러 → blank crash 방지) | small | ⭐ 방어 |
| C | persona fix(코드): PF-2(guardian-consent 카피 정직화) · PF-3(consent ackLlm/ackOverseas 강조) · PF-4(privacy mock toggle) · PF-5(first-save 축하) · PF-6(onboarding 별자리 설명) | medium | 각 verify→PR |
| D | 화면별 클론 fidelity vs `captures/NN-*.png` (16라우트 redbox/crash 0 확인됨) | large | 매회 관점 로테이션 |
| E | `deepspace/index.ts` require cycle 정리 (현재 무해, 잠재 리스크) | small | hygiene |

### 적용 중인 정책 (영구)
1. main 직접푸시 금지 · draft-PR flow · `npm run verify`(또는 CI Constraints job)가 게이트.
2. **PR 제목 = Conventional Commits 필수** (CI "Validate title" 체크; `[HOTFIX]` 등 프리픽스 금지 → `fix(scope): …`).
3. EAS Update: `preview` 채널 = 테스트폰. runtimeVersion = appVersion policy(=0.0.6). 로컬 `eas update`는 bare workflow라 policy 거부 → app.json에 concrete `"0.0.6"` 임시지정 후 publish·revert. 공개 anon key는 eas.json에 이미 커밋됨(인라인 OK).
4. **로컬 전용 함정 (클라우드엔 무관):** adb `/data`·`/sdcard` 경로엔 `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`; Windows python엔 `C:/…` 경로(`/c/…` 주면 깨짐); 앱 텍스트입력 전 필드클리어; 스샷은 PIL 축소/contact-sheet montage 후 read(이미지 한계).
5. test 계정 `test@test.com` / `qwer1234!` (Supabase user 41bc7b92, profile 존재). 온보딩 우회 = AsyncStorage `RKStorage`의 `catalystLocalStorage`에 `onboarding.cosmicPixel.v2.completedAt` insert.

### 핵심 파일 위치
```
src/components/deepspace/SecondbHead.tsx          head 애니 — driver 일관성 주의(bob=native 독립, blink/engage/touch/eyeOffset=JS)
src/components/deepspace/SecondbHeadTrack.tsx     터치추적 provider (engage spring + touch setValue, 둘 다 JS)
src/components/deep-space/ConstellationHome.tsx   홈 별자리 (7 도메인 라벨 + 북극성)
src/screens/deepspace/DeepSpaceDesignScreens.tsx  모든 deep-space 화면 (4120줄)
src/lib/build-info.ts                             build/OTA identifier (account 화면 footer)
src/lib/env.ts                                    env 스키마 + demo Supabase fallback
.github/workflows/eas-update.yml                  OTA 자동게시 (이제 supabase env 포함)
reports/HOTFIX_CRASH_270626.md                    크래시 핫픽스 보고서
reports/qa/270626_loop_findings.md                persona punch list (PF-1~9)
reports/qa/CLONE-PROGRESS.md                      클론/로그인/온보딩우회 SoT
```

### 검증
```bash
npm run verify   # lint + tsc + i18n + lexicon + LLM boundary + constraints + jest (255 suites / 1927 tests)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(eas-update 게이팅)부터, 또는 C(persona fix). reports/qa/*.md 가 QA loop SoT.
```

---
## 2026-06-26 / 별자리 키스톤 lib 체인 완성 + proto rev2 감사 (PR #586 docs · #587 keystone, 둘 다 draft)

### 어디까지 왔나
- main HEAD: `37d63ac7` (이번 세션 산출은 두 draft PR에, 아직 main 미머지)
- 이번 세션 머지된 기능 PR: 없음. 산출 = **PR #586**(docs 정본화) + **PR #587**(키스톤 lib).
- 테스트: 키스톤 ~30 신규 테스트 green · tsc 클린 · lexicon green · 기존 65 LLM 테스트 green.
- working tree: clean (이전 세션 untracked WIP 잔존, 손대지 않음).

### 핵심 결과
1. **docs 정본화 (PR #586, branch `claude/constellation-prd-v3-canonize`)**: PRD→Draft v3(별자리 3-레이어), `CONSTELLATION-DESIGN.md`(설계 + 10-에이전트 차용 감사), CONCEPT/VISION/CLAUDE(Visual Tier) 정렬, CANONIZATION-REPORT.html, COWORK-PROMPTS.md(올인원 + Kakao/Naver Places + 수출입은행 FX + 식약처). §7/§13 결정 a~j CONFIRMED.
2. **키스톤 lib 체인 완성 (PR #587, branch `claude/constellation-keystone`)** — 순수·additive·~30 테스트:
   `domain-stars.ts`(DOMAIN_STARS 7 + DomainEntry) · `domain-confidence.ts`(domainConfidence/domainLevel — brightness.ts 체인 무수정 재사용) · `north-star.ts`(domainStarLevels + northStarBrightness, soulCoreBrightness 동일공식 교차검증) · `persona-synthesis.ts`(layer-C 하네스: persona_synthesis purpose + 스키마 + 근거강제 파서 + cap 3).
3. **Proto rev2 감사** (디자인 = Claude Design): zip `C:\Users\Soha.Bae\Downloads\2ndB-proto-rev2\`(37 PNG + 스펙). 디자이너가 PRD v3 잘 내재화(3-레이어·밝기정직성·propose→ratify·데이터주권·IDEN). **ship-blocker 3**: 비준 안 된 layer-B가 37-widget/27-inbox로 샘 · 31-callrec 음성 purge+C9 미확인 · 33-plans 가격 ₩6,900/12,900 vs PRD §13 ₩4,900/9,900/19,900. ⚠️ claude_design MCP(DesignSync) 있으나 `/design-login`이 이 env에 없어 인증 불가 → zip으로 작업.

### 활성 인프라
- Supabase project ref `zoacryukmdeivmolvyhj` (14-17 자가동의 prod LIVE, 0028-0033). Gemini 라이브(gemini-proxy edge fn). i18n 5로케일 패리티(C7 PASS). 키스톤·정본화 코드는 main 미머지(두 draft PR).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **홈(05) 이관 — "담기→도메인 태깅부터"** | medium | ⭐ records가 도메인 slug 획득(`detect.ts`+캡처). 이게 먼저여야 홈이 의미. 그 다음 `load-domain-levels.ts`(load-star-levels 미러) → `ConstellationHome` STARS relabel(키스톤 위) |
| B | 감사 Code P0 | medium | 비준-전-표시 강제(push/widget = layer-A/C만) · `domainConfidence` "비준 커버리지만" 정련 · callrec STT purge+C9 |
| C | PR #586 / #587 머지 | small | CI green 확인 후 (docs + lib) |
| D | 가격 확정(Simon) → PRD §13·디자인·`pricing.ts` 정렬 | small | Simon 결정 대기 |

### 적용 중인 정책 (영구)
1. main 직접 push 금지(항상 PR) · push 전 `npm run verify`(docs-only면 `check:lexicon`) · CI green 시 머지 · `npm ci --legacy-peer-deps`.
2. 별자리 3-레이어 정본(PRD v3). 비유는 별자리 하나만. 밝기 정직성(별빛=커버리지 ≠ 확신). 자기모델 변경은 propose→ratify.
3. 키스톤은 순수·additive·TDD — 기존 모듈 무수정(회귀 0).
4. ⚠️ `check:constraints` WorldviewConceptCoherence가 아직 구 워crldview(Lumina/Soul/Pattern) 검증 — VISION 색/마스코트맵을 legacy로 남겨둠. Phase 4서 그 제약도 갱신.

### 핵심 파일 위치
```
src/lib/persona/domain-stars.ts                 레이어 A: DOMAIN_STARS 7 + DomainEntry
src/lib/persona/domain-confidence.ts            키스톤 어댑터: domainConfidence/domainLevel
src/lib/persona/north-star.ts                   레이어 C: domainStarLevels + northStarBrightness
src/lib/persona/persona-synthesis.ts            레이어 C 하네스: persona_synthesis
src/components/deep-space/ConstellationHome.tsx 홈 렌더 (STARS L19-27 구별 = relabel 대상)
src/components/deep-space/DeepSpaceShell.tsx     홈 로더 (load-star-levels → load-domain-levels 스왑)
src/lib/persona/load-star-levels.ts             미러 대상 (→ load-domain-levels.ts 신규)
docs/PRD.md (v3) · docs/CONSTELLATION-DESIGN.md  개념 SoT
C:\Users\Soha.Bae\Downloads\2ndB-proto-rev2\    디자인 rev2 (37 PNG + 스펙)
```

### 검증
```bash
npm run verify   # lint+type+i18n+lexicon+constraints+jest
npx jest src/lib/persona/__tests__/domain-stars.test.ts src/lib/persona/__tests__/domain-confidence.test.ts src/lib/persona/__tests__/north-star.test.ts src/lib/persona/__tests__/persona-synthesis.test.ts
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업: 홈 이관 — "담기→도메인 태깅부터" (PR #587 키스톤 브랜치 위에서)
```

---
## 2026-06-25 / 개념 재설계: core 폐기 → 별자리(7 삶-도메인 별 → 북극성 페르소나) + 5-Phase 계획 (실행 전)

> ⚠️ 이번 세션은 **전부 개념·계획** (코드 변경·기능 PR 0). 다음 세션은 사용자 지시대로
> **"계획을 더 디벨롭"하는 것부터** 시작할 것 — 정본화/실행 전에 7별 스펙 + 산출로직을 더 단단히.

### 어디까지 왔나
- main HEAD: `4ba666b1` (이 핸드오프 PR 외 코드 변경 없음)
- 머지된 기능 PR: 없음. 산출물 = `docs/PRD.md`(초안) + `docs/system-checkup.html`(인터랙티브 모델) — 이 핸드오프 PR로 함께 커밋.
- 테스트: 코드 무변경. `npm run check:lexicon` PASS (두 문서 다 docs 스캔 통과).
- working tree: 이 PR는 docs 3개만 커밋. 그 외 untracked(assets·reports·constellation-home.ts)는 손대지 않음(이전 세션 WIP).

### 결정된 모델 (정본 후보 — PRD 본문엔 아직 미반영, `system-checkup.html` v4가 최신 시각화)
- 단일 비유 = **별자리** 하나. 폐기: core / Soul Core / 5 Pattern Core / Pattern Tesseract / 마을 그래프 / `/core-brain` / Brain Trinity / v3 tesseract 아트 / 하늘·땅·흙·동반자 비유.
- **7별 = 입력(삶의 도메인)**: 커리어·재정·성장·관계·건강·오락·담아내기. 각 별 = 입력 → 출력(조언·요약) + 리스트업(편집·카테고리·태그).
- **북극성 = 출력**: 7별 종합 → 실시간 페르소나(들=역할/모자) + 성향·장단점·강점 요약. 직접 입력 안 받음. 변경은 propose→ratify로만.
- **밝기 = DIKW 한 사다리**(결정): L1 꺼짐·L2 Data·L3 Information·L4 Knowledge·L5 Wisdom. 모든 별 켜지면 북극성 더 밝게.
- **검증 깊이**: 기존 심리구인(Big Five·애착·SDT/VIA, `src/lib/persona/stars.ts`)을 버리지 않고 **북극성 출력의 추론·검증 레이어**로 이동(사용자 1번 지시).

### 이번 세션 3개 결정 (AskUserQuestion)
1. 정본화 = **문서 먼저** (PRD를 SoT로 개정, 코드 이관은 별도 트랙).
2. 연동 = **현실 경로** (내보내기 import + 무료 공개 API + 연락처/Slack + 병원=지도 Places + 수동. live 커넥터·사업자 인증은 XPRIZE 이후).
3. 병원추천 = **Kakao/Naver (KR-first)**.

### 결정적 발견 — 입력 인프라 상당수 이미 존재 (greenfield 아님)
- `docs/INTEGRATIONS-14-AREAS-2026-06-20.md` — 14 생활영역 매트릭스. 출하분: 독서(Google Books), 사이드프로젝트(GitHub), 재정 수동가계부(`finance/ledger.ts`+`fx.ts`), 식단(식약처), 언어(SRS), 집중(포모도로).
- `docs/PERSONAL-DATA-IMPORT-SPEC.md` — 카톡·문자·위치·캘린더·헬스·이메일 파서 구현(`src/lib/import/*`, 온디바이스·$0, propose→ratify·PIPA 계약).
- `docs/COWORK-PROMPTS.md` — Cowork = chrome-use/computer-use 에이전트 셋업 프롬프트 패턴(사용자 6번이 이것).
- ⚠️ 메신저 친구목록 live API 불가(카톡=내보내기만). 오픈뱅킹·NHIS = 사업자 인증(솔로·마감엔 비현실). → "연동 강화" = import 파이프라인 강화.

### Reconciliation (7별 ↔ 기존 자산) — Phase 0 코어
| 별 | 입력(현실경로) | 기존 자산 | 신규 |
|---|---|---|---|
| 커리어 | 프로젝트·이력·스타일(수동+GitHub) | career_check, `projects/github.ts` | 이력·스타일 폼 |
| 재정 | 자산·현금흐름(수동)+FX | `finance/ledger.ts`✅, `fx.ts` | (수동 유지) |
| 성장 | 연령대 drill(AI) | `interview/probe.ts` | 연령 타임라인 |
| 관계 | 대상 수동+카톡/문자/연락처 import+Slack | `import/kakao.ts`·`sms.ts` | peer2peer 폼 |
| 건강 | 헬스 import+생활습관 수동+병원추천 | `import/health-export.ts` | Kakao/Naver Places 병원추천 |
| 오락 | 취미·독서(Books)+경험 수동 | `reading/books.ts` | 취미 폼 |
| 담아내기 | catch-all: detect→parse+자유메모/클립 | `import/detect.ts`, capture/wiki | catch-all 라우팅 |
| ★북극성 | (출력) | `persona/stars.ts` = 검증 깊이 | 페르소나 종합 |

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **계획 더 디벨롭** (사용자 지시: 여기서 시작) — Phase1 7별 스펙 + Phase2 북극성 산출로직을 설계로 깊게. 아래 오픈Q부터. | medium | ⭐ 정본화 전에 계획을 단단히 |
| B | Phase 0 정본화 — PRD를 7도메인으로 개정 + reconciliation(PRD 내) + CONCEPT/VISION 노트 + 메모리 | medium | 계획 익으면 |
| C | Phase 3 연동맵 + Cowork 프롬프트 (Kakao/Naver Places 키 등록 등) | medium | |
| D | Phase 4 코드 이관 (`stars.ts`·라우트·UI → 7도메인) | large | 별도 트랙·여러 세션 |

### A 작업(계획 디벨롭)에서 풀 오픈 질문
- 담아내기(7별) 동작 정의 — catch-all 라우팅 + 다른 6별이 못 담은 부분 보완 로직.
- 북극성 페르소나 종합 알고리즘 — 7별 → 페르소나(들) + 요약; 검증틀(심리구인) 매핑.
- 밝기/DIKW 산정식 — 별별 L1~L5 측정: ①커버리지 ②내적일관성(반복질문 일치) ③교차검증(자기↔타인) ④최신성. v1은 ①②만.
- 관계 별 peer2peer 프라이버시 — 제3자 PIPA; 실명은 사용자 수동입력 + import만.
- 건강 별 병원추천 — Kakao/Naver Places + 비임상 '전문가에게 안내' 프레이밍.
- 별별 입력/출력/태깅 상세 — 기존 lib에 매핑.

### 적용 중인 정책 (영구)
1. main 직접 push 금지(항상 PR) · push 전 `npm run verify` · CI green 시 머지 · `npm ci --legacy-peer-deps`.
2. `docs/`도 `check:lexicon` 스캔 대상 — 임상·병리 금지어 일체 금지(정본 `src/lib/safety/lexicon.ts`). 이 핸드오프 포함 새 문서도 준수.
3. 어휘 정책: 임상·의료·웰니스 범주 아님 → 자기이해·성장 어휘.
4. 비유는 **별자리 하나만**. 다른 비유 도입 금지.
5. 자기모델/페르소나 변경은 propose→ratify (AI 제안 → 사용자 승인).

### 핵심 파일 위치
```
docs/system-checkup.html                 ⭐ 인터랙티브 시스템 맵(드래그앤드랍·v4) = 7도메인 모델 최신 시각화. 브라우저로 열어 확인.
docs/PRD.md                              개념 초안 — ⚠️ '별자리 v2(심리구인 별)' 버전, 7도메인 미반영. Phase 0이 개정.
docs/INTEGRATIONS-14-AREAS-2026-06-20.md 14영역 연동 매트릭스(기존 출하분)
docs/PERSONAL-DATA-IMPORT-SPEC.md        import 파서 + 프라이버시 계약
docs/COWORK-PROMPTS.md                   Cowork 셋업 프롬프트 패턴
src/lib/persona/stars.ts                 심리구인 7-star (→ 북극성 검증 깊이)
src/lib/persona/brightness.ts            L1~L5 밝기
src/lib/import/*                          카톡/문자/위치/헬스/이메일 파서
src/lib/finance/ledger.ts, fx.ts         재정 수동가계부 + FX
```

### 검증
```bash
npm run check:lexicon   # docs 포함 — 이번 산출물 PASS 확인됨
npm run verify          # 코드 변경 시 전체 게이트
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업(계획 더 디벨롭)부터:
#  1) docs/system-checkup.html 브라우저로 열어 7도메인 모델 확인
#  2) 위 '오픈 질문'(담아내기 동작·페르소나 종합식·밝기 산정식 등)을 설계로 디벨롭
#  3) 계획이 익으면 Phase 0 정본화(B)로
```

---
## 2026-06-24 (deep-space 살아있는 세컨비 머리 + 도크칩 + EAS Update) / PR #579 머지, #580 오픈

도크 백버튼 칩 겹침 제거 + 세컨비 머리를 **정본대로 살아있는 얼굴**(깜빡임·터치추적 시안 눈,
감정별 표정, 머리 위 녹색 오브 제거)로 재구현 + 액션 반응(저장→미소/실패→걱정) + 디자인 정본
영속화까지 **PR #579를 squash로 main 머지**(사용자 명시 지시). 이어서 **EAS Update(OTA) 설정**을
PR #580(오픈)으로 올림. 다음 세션 목표 = **EXPO_TOKEN으로 안드로이드 빌드 트리거 → 폰에서 라이브 확인**.

### 어디까지 왔나
- main HEAD: `8194e01` (PR #579 squash merge — 이번 세션)
- 이번 세션 머지된 PR: **#579** fix(deepspace): dock back-chip + live SecondB head + design canon
- 오픈(미머지) PR: **#580** chore(eas): enable EAS Update (OTA) — 브랜치 `claude/2ndb-continuation-coyk8b`
- 테스트 상태: `npm run verify` green — **249 suites / 1881 tests**
- working tree: clean

### 이번 세션 핵심 (커밋된 것)
- **도크 백버튼 칩 폴리시**: `src/lib/nav/tabs.ts`(`DEEP_SPACE_DOCK_PATHS` 11개 + `isDeepSpaceDockPath`) +
  `src/components/ui/BackArrow.tsx`(deep-space 도크 화면서 칩 숨김, `isDeepSpaceUI()` 게이트). 머리 겹침 해소.
- **살아있는 세컨비 머리** (`src/components/deepspace/SecondbHead.tsx` 정본 1종):
  - 녹색 오브 **제거**(정본에 없음). 얼굴 스크린 + **빛나는 시안 눈 2개**(깜빡임 130ms·랜덤 1.6~4.8s + 터치추적) + 입.
  - 큰 머리(≥80, 홈 158px `ConstellationHome`) 2.5D look-at 트래킹(기존 `SecondbHeadTrack` provider, `_layout` 마운트). 작은 헤더 머리(48px)는 깜빡임만.
  - 감정별 표정: positive(눈 squint+미소 SVG)/neutral(평)/negative(처짐+찡그림). 시안 only, hex 리터럴 X.
  - `src/components/deep-space/SecondbHead.tsx` = 정본 re-export(머리 3종→1종 통합).
- **상호작용 반응** (`src/lib/companion/expression.ts` 이벤트버스): `reactExpression(mood)` → 모든 머리 순간 표정 후 복귀.
  중앙 연결: `src/components/art/CompanionSprite.tsx`의 `EXPRESSION_BY_EVENT`(모든 companion moment→positive,
  **safety 이벤트는 의도적 제외**) + capture 저장 성공/실패 + ratify(review) + 완료 토스트.
- **디자인 정본 영속화**: `docs/ui-audit/{DESIGN_INDEX,CLONE_PROTOCOL}.md`(SCREEN_TREE_SPEC와 트리오) +
  `CLAUDE.md` Design system 섹션 포인터. 정본 시각 출처 = `design/*.dc.html`.
- **EAS Update(OTA) 설정**(PR #580, 미머지): `expo-updates ~56.0.19` + `app.json`(`updates.url`=EAS 프로젝트,
  `runtimeVersion: appVersion`, `fallbackToCacheTimeout: 0`). eas.json 채널은 기존대로.

### 활성 인프라
- Supabase project: `zoacryukmdeivmolvyhj` (eas.json env)
- EAS project: `439c4c86-39a7-4a47-8bfa-0426f9fe18c9` (owner `simon_k`, slug `2nd-brain`)
- **EXPO_TOKEN**: 사용자가 원격 환경에 추가 중 — **변수명은 반드시 `EXPO_TOKEN`**, 추가 후 **새 세션**이어야 셸에 주입됨.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **안드로이드 빌드 트리거** → 폰 라이브 확인 | medium | ⭐ 사용자 핵심 목표. `printenv EXPO_TOKEN` 확인 → `npx eas-cli whoami` → `npx eas-cli build -p android --profile preview --non-interactive`. **실기기=arm64(preview OK), 에뮬=x86_64(프로필 별도)** 먼저 확인 |
| B | **PR #580(EAS Update) 머지** | small | verify CI green 시 squash. 빌드 전 머지 권장(빌드에 OTA 설정 포함되게) |
| C | **온디바이스 QA** (머리/도크) | small | 녹색오브 사라짐·158px 머리 깜빡임+트래킹·헤더 머리 깜빡임·감정표정·반응(저장→미소)·도크 11화면 칩 겹침 해소 |
| D | 반응 지점/동적 mood 확장 | medium | 데이터상태 연동 mood는 사용자가 보류(상호작용 반응만 선택). 필요시 추가 |

### 적용 중인 정책 (영구)
1. **사용자 명시 시 머지**: #579는 사용자 지시로 CI green 후 squash 머지함. "머지해줘" = verify green 후 squash.
2. **정본 = deep-space `.dc.html` + `docs/ui-audit` 트리오** (DESIGN_INDEX/SCREEN_TREE_SPEC/CLONE_PROTOCOL). "항상 기억". 시각 1:1 출처.
3. **세컨비 머리**: 머리 위 **오브 금지**(정본에 없음). 얼굴 = 깜빡이는 시안 눈 + 감정 입. **safety/위기 이벤트는 절대 귀여운 표정 트리거 X**.
4. **이 Linux 원격 한계**: 안드로이드 빌드/에뮬/`eas update` publish **불가**(Expo 인증 없음, Windows 아님). 빌드·OTA는 EXPO_TOKEN(새 세션) 또는 Windows에서.
5. **EAS Update**: expo-updates는 네이티브 → OTA 도달하려면 **새 빌드 1회 필수**, 그 후 `eas update --channel production`.
6. 토큰/시크릿 **채팅에 붙여넣기 금지** — 원격 환경 env로만.

### 핵심 파일 위치
```
src/components/deepspace/SecondbHead.tsx        정본 머리(눈·깜빡임·트래킹·감정·반응)
src/components/deep-space/SecondbHead.tsx       정본 re-export(통합)
src/components/deepspace/SecondbHeadTrack.tsx   터치추적 provider(_layout 마운트)
src/lib/companion/expression.ts                 reactExpression 이벤트버스
src/components/art/CompanionSprite.tsx          companion moment→머리 표정(EXPRESSION_BY_EVENT)
src/lib/nav/tabs.ts                             DEEP_SPACE_DOCK_PATHS + isDeepSpaceDockPath
src/components/ui/BackArrow.tsx                  도크칩 숨김 게이트
docs/ui-audit/{DESIGN_INDEX,SCREEN_TREE_SPEC,CLONE_PROTOCOL}.md   정본 트리오
app.json / eas.json                             EAS Update(OTA) 설정 (PR #580)
```

### 검증
```bash
npm run verify   # lint+tsc+i18n+lexicon+legal+llm경계+constraints+emdash+anti-anthro+mascot+jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업: EXPO_TOKEN 확인 후 안드로이드 빌드 트리거
git checkout claude/2ndb-continuation-coyk8b   # EAS Update(#580) 작업 이어서
```

---
## 2026-06-22 (결제·리워드·공유 /goal + 엔티틀먼트 캡 루프) / PR #561 main 머지 완료

세컨비 "깊이 묻기"에 **월 reasoning 캡 루프**를 끝까지 연결하고, 결제·리워드·공유 + LLM 3-tier
라우터 + 4-티어 QA 진입 링크를 붙인 뒤 **PR #561을 squash로 main에 머지**(사용자 명시 지시).

### 어디까지 왔나
- main HEAD: `935ac16` (PR #561 squash merge — 이번 세션)
- 테스트 상태: `npm run verify` green — **245 suites / 1861 tests**
- working tree: clean
- 라이브: 머지 배포(web-deploy.yml) 후 GitHub Pages 갱신. 4-티어 QA 링크:
  `?tier=all` (god) / `?tier=free` (별바라기) / `?tier=plus` (항해자) / `?tier=pro` (북극성)

### 이번 세션 핵심 (커밋된 것)
- **엔티틀먼트 캡 루프**: `usage_counters` 마이그레이션 `0057` + `src/lib/entitlements/`
  {`usage.ts`(KST month_bucket 카운터, fail-open) · `reasoning-cap.ts`(free 8 / cortex 60 /
  brain 무제한 + pricingLabel 별바라기·항해자·북극성·평생)} · 세컨비 gate(전송 전 remaining 체크,
  free 성인 0→RewardedSheet, 그 외→/plans?from=ai_limit, **성공 시에만** increment) ·
  페이월 현재-티어 인지(CTA 티어별 + 잔여 표시).
- **결제·리워드·공유**(직전 라운드): 여정 3티어 페이월(별바라기/항해자/북극성) ·
  `RewardedSheet.tsx`(+2 크레딧, 월 cap 20) · `ShareCard.tsx`(A/B + view-shot 캡처).
- **LLM 3-tier 라우터**: `src/lib/llm/types.ts`(MODELS lite/flash/pro env-override + PURPOSE_TIER) ·
  `gemini.ts`(effort low/high/xhigh/max → thinkingBudget + Claude seam `EXPO_PUBLIC_REASONING_PROVIDER`,
  Anthropic SDK는 미설치 — 집에서 설정).
- **HTML 보고서**: `docs/llm-routing-strategy.html` · `docs/pricing-simulation.html`(마진 슬라이더
  인터랙티브) · `docs/CLAUDE-REASONING-SETUP.md` · `docs/ANDROID-BUILD.md`.

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` — 마이그레이션 `0057_usage_counters` **적용 완료**:
  table `usage_counters`(PK user_id+month_bucket, reasoning_used/reward_credits),
  owner-RLS 3 정책(select/insert/update = auth.uid()) + updated_at 트리거 1개 (검증됨).
- web-deploy.yml에 `EXPO_PUBLIC_ALLOW_DEV_TIER: "true"` (QA 전용 — **런칭 전 반드시 제거**).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 런칭 전 `EXPO_PUBLIC_ALLOW_DEV_TIER` 제거 (web-deploy.yml) | small | ⭐ 보안 — 안 지우면 `?tier=pro`로 유료 자가부여 가능 |
| B | AdMob 실 보상광고 (`react-native-google-mobile-ads`) → `src/lib/ads/rewarded.ts` seam | medium | 현재 mock 보상 |
| C | IAP 웹훅 → `revenue_events`(C4) 적재 (RevenueCat) | medium | 결제 영속화 |
| D | Android 빌드 — 본인 머신에서 `v0.0.1` 태깅 (샌드박스 git 태그 push 거부) | small | EAS 빌드 트리거 |
| E | Claude reasoning provider 집에서 설정 (`docs/CLAUDE-REASONING-SETUP.md`) | small | seam 준비됨 |
| F | secondb 근거칩 → `/record/[id]` (wiki slug→record-id 리졸버 부재) | medium | /records 폴백 유지 중 |

### 적용 중인 정책 (영구)
1. **티어는 횟수·기능·히스토리만 차등, 답변 품질은 전 티어 동일** (지갑이 답의 질을 사지 않음).
2. `propose→ratify` — AI는 자기모델 수정 제안만, 사용자 승인 후 쓰기. 캡 게이트는 C9/C3 경로 무변 counts-only.
3. 마이그레이션은 `db/migrations/*.sql` (CI glob 대상). `supabase/migrations/` 아님.
4. main 직접 push 금지 — 항상 PR. (이번 머지는 사용자 명시 지시로 진행.)
5. 가드레일: deepSpace 토큰만 · hex 0 · em dash/glassmorphism/pill/bounce 금지 · i18n 5-locale 패리티 · 비주얼 티어 무회귀.

### 핵심 파일 위치
```
src/lib/entitlements/{tiers,usage,reasoning-cap}.ts   엔티틀먼트 + 캡 + 사용량
src/lib/llm/{types,gemini}.ts                         3-tier 라우터 + effort + Claude seam
src/components/deepspace/{RewardedSheet,ShareCard}.tsx 리워드 시트 + 공유 카드
src/lib/ads/rewarded.ts · src/lib/share/insight-card.ts  광고 seam · 공유 카드 derive
src/lib/progression/{dev-tier-url,useProgression}.ts  ?tier= QA override 단일 chokepoint
db/migrations/0057_usage_counters.sql                 사용량 카운터 스키마
src/screens/deepspace/DeepSpaceDesignScreens.tsx      페이월 현재-티어 인지
src/app/secondb.tsx                                   세컨비 캡 게이트
docs/{llm-routing-strategy,pricing-simulation}.html   LLM/가격 보고서
```

### 검증
```bash
npm run verify   # lint + type-check + i18n + lexicon + LLM boundary + constraints + jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(EXPO_PUBLIC_ALLOW_DEV_TIER 제거)부터 — 런칭 게이트
```

---
## 2026-06-22 (/goal cont.) / BLOCKED 큐 코드-클로저블 일소 (batch 6-8)

PR #561 (`claude/repo-sync-verify-nkz86x`), CI green, `verify` 241 suites / 1813 tests.
이전 라운드 BLOCKED 큐에서 **코드로 닫을 수 있는 것은 전부 처리**:

- **batch6**: trinity 영역 드릴다운(`/records?tags=` 신설, legacy+딥스페이스), review applyRatify
  실 tier, graph 실 카운트(useWikiGraphData), /ops·/account 독 크롬(DeepSpaceScreen wrap + ds.head.*).
- **batch7**: /insights 실 주간 데이터(`src/lib/insights/weekly.ts` 순수+테스트, 4상태),
  /reminders OS 권한(expo-notifications) + on/off AsyncStorage 영속화(웹/거부 가드).
- **batch8**: /capture **실 음성 녹음+전사** — expo-audio(~56) 추가, `gemini.ts.transcribeAudio`
  (C1/C2/C3/C9 준수, mock=CI), fetch→FileReader base64(no expo-file-system), 녹음→전사→검토 후 저장.

### 남은 진짜 BLOCKED (외부 계정/백엔드 — 코드로 불가, 사용자 결정 'skip')
- **실결제 /plans**: PG 제공자+가맹점 계정+백엔드 필요 → 임시 /support (사용자 'skip' 선택).
- **AI 어시스턴트 실 OAuth /integrations**: ChatGPT/Claude/Gemini 소비자 계정연동 API 부재 → /iden export.
- **device 검증 PENDING (코드는 완료)**: 음성 녹음 마이크 라운드트립 + 리마인더 OS 권한 grant
  = 실기기 EAS 빌드에서 1회 확인 필요(코드·가드 완비, CI는 mock/web fallback).
- **secondb 근거칩 → /record/[id]**: wiki slug→record-id 리졸버 부재 → /records 폴백 유지.
- **insights 더 풍부한 신호**: 현재 WoW 레코드 카운트. 별 밝기/스트릭 통합은 growth/weekly 확장 시.
## 2026-06-21 (/goal) / SCREEN_TREE_SPEC 정본 6-에이전트 감사 + 죽은 버튼 일소 + 독 정본 정렬 + interview/trinity 딥스페이스 이식

`handoff-spec/SCREEN_TREE_SPEC.md`(정본) 대비 딥스페이스 전 화면을 6개 병렬 에이전트로 감사 후
빠진 연결을 채움. branch `claude/repo-sync-verify-nkz86x`, `npm run verify` green (240 suites /
1809 tests), 전 구간 deepSpace 토큰만·hex 0·비주얼 티어 무회귀·i18n 5-locale 패리티.

### 핵심 발견
딥스페이스(기본 빌드)는 `DeepSpace*` 화면을 렌더하고 **실로직은 village 스킨 `*Legacy` 브랜치**에
있었음 → 다수 2차 화면의 CTA가 死버튼. 비주얼은 딥스페이스 유지하고 핸들러만 이식하는 방식으로 해소.

### 이번 세션 커밋 (5 배치)
1. **batch1**: TimelineRow onPress(/records·연결기록→/record/[id]), 설정에 /manual·/integrations
   (고아 라우트였음), trinity 사용자 노출 "Brain Trinity"→"My areas".
2. **batch2**: 하단 독 정본 정렬 — 담기/알아가기/[중앙 세컨비]/비서/나 → /capture·/·/secondb·/ops·
   /account (lens/iden 타입은 유지해 active="lens" 콜사이트 무파손). 렌즈 死버튼(빅5 empty→/interview·
   에러/재시도, 보여지는나 survey/share, 오딧 데이터추가, 공상 카드 선택→/ops). ops 쓰기액션(마일스톤·
   레저 createX, 상태칩, 리마인더 토글, 로딩상태, 사이드프로젝트 히트맵, growth 근거칩→렌즈).
3. **batch3**: research/wiki/graph/discover/data/integrations/insights 死버튼(노드 press hit-area만,
   티어 시각 무변). ds.dock.ops/account 5-locale.
4. **batch4**: /capture 음성·할 일 모드 추가(5모드 정본), 최근조각 리스트, 저장후 /record/[id].
5. **batch5**: /interview 딥스페이스가 실제 AI 반복인터뷰 렌더(Frame 래퍼, 로직 포크 없음),
   /trinity 4생활영역 대시보드(computeStats 재사용), secondb 근거칩·digest 상세/에러.

### 다음 세션 (BLOCKED — 백엔드/플러밍/네이티브 필요, 추측 금지)
- **/plans 실결제**(→/support 임시), **/permissions 네이티브 OS 권한**, **/integrations 실 OAuth**(→/iden).
- **growth [루틴으로] propose→ratify**: 루틴 제안 메커니즘 없음(현재 star-tier 제안만). saveStep 직접생성 유지.
- **리마인더 on/off 영속화 + OS 권한 요청**: lib/ops/routines 재활성 헬퍼·standalone 권한 export 없음.
- **secondb 근거칩 → /record/[id]**: slug→record-id 리졸버 부재(현재 /records 폴백).
- **/trinity 영역별 드릴다운**: /records 가 DOMAIN_TAGS 키 미지원(현재 /records 전체).
- **/capture 실 오디오 녹음/전사**: 의존성 미추가(현재 음성 메모=라벨 텍스트). 
- **graph/insights 실데이터**: 정적 목업 수치 유지(인터랙션만 추가, fetch 날조 금지).
- **/ops·/account 독 크롬**: 자체 Shell 렌더라 탭 독 미표시(딥스페이스 독은 다른 1차에선 정상).
- **review applyRatify 하드코딩 레벨 4**: 별 실제 tier 읽도록 보정 필요(死버튼 아님, 정합성).

### 재개
```
git fetch origin && git checkout claude/repo-sync-verify-nkz86x && npm ci --legacy-peer-deps && npm run verify
```
정본: `handoff-spec/SCREEN_TREE_SPEC.md`(동작) + `handoff-spec/design/*.dc.html`(시각).

---
## 2026-06-21 (심야) / 전체 화면 트리 감사 + 죽은 버튼 0 + AI 뮤지엄 이미지 (#560)

SCREEN_TREE_SPEC 정본 대비 딥스페이스 전 화면 감사. **#560 main 머지**, `npm run verify`
green (240 suites / 1809 tests). 전 구간 deepSpace 토큰만·hex 0·비주얼 티어 무회귀.

### 이번 세션에 한 일 (#560)
1. **rn-patch 통합** — 로딩/전환 시스템(`lib/tasks/store` + `DeepSpaceLoader`/`BackgroundTaskDock`/
   `CompletionToast`) + AI 뮤지엄(`/museum`) + 큰 세컨비 머리 터치 추적(`SecondbHeadTrack`,
   size≥80 자동). _주의_: 같은 rn-patch가 main에도 병렬로 들어와(#556) 머지 시 add/add 충돌 →
   loading/museum 파일은 내 개선본(toast a11y 44px+조건부 결과보기, store 실행중 가드, museum 이미지)
   유지, file-read/ImportHub는 main의 네이티브 picker(#558) 채택.
2. **/trends 신규** — 관심 상승(이번주 vs 지난주 태그 빈도, `lib/trends/rising.ts` 순수+테스트 /
   `gather.ts`). Ops 키트, 4상태, 카드 "담기"→/capture(`text` 파라미터 prefill). 진입점=profile
   "알아가기" 그룹(`/insights` 옆) + flowmap.
3. **죽은 버튼 0** — 라우팅된 2차 화면 7개가 정적 목업이었음 → 실기능화: **/review 실제
   propose→ratify 엔진 이식**(buildPersona→proposeSelfModelChange→RatifySheet→applyRatify),
   /data deleteAll→/privacy, /manual FAQ→/support, /plans→/support, /permissions 계속→back,
   /integrations AI행→/iden, /theme 죽은 옵션→비-Pressable 상태행. /imagine "이 공상을 첫걸음"→/ops.
   /account 정적 PII 목업→실작동 나-허브(프로필/설정/데이터/IDEN).
4. **딥스페이스 계정 삭제(right-to-erasure)** — `/privacy`에 "DELETE" 확인 게이트 +
   deleteAllUserData→requestAccountDeletion→signOut (legacy 전용이던 것 이식).
5. **AI 뮤지엄 이미지 15개** — Wikimedia PD/CC-BY/CC-BY-SA, 전부 200 검증, 오브 폴백,
   per-image attribution은 `docs/ASSETS.md`(C12). SVG/동영상·트레이드마크 로고 제외.
6. **웹 마우스 머리 추적**(SecondbHeadTrack onMouseMove, Platform 가드) + 성장 화면 "별 다시
   살펴보기"가 startTask(background) 실연결.
7. 5-페르소나(perspectives 재현) 검증 통과 — 임상어휘 0, RLS own-data, 뮤지엄 사실성.

### 다음 세션이 이어갈 것 (BLOCKED — 게이트/백엔드 필요, 추측 금지)
- **/plans 실결제** (현재 → /support 문의로 임시 라우팅): 결제 백엔드 필요.
- **/integrations 실 OAuth** (현재 → /iden export): 커넥터 OAuth 미구현.
- **/permissions 네이티브 OS 권한** (현재 토글=상태표시, 계속→back): expo permissions + 실기기.
- **AI 뮤지엄 나머지 moment 이미지**: PD/CC 라이선스 안전한 것만 추가(현재 15개). 트레이드마크 로고 금지.
- 게이트 런북: `docs/GATE-RUNBOOK.md` (G0~G5). 코드로 닫을 수 있는 죽은 버튼/누락은 0.

### 재개 명령어
```
git fetch origin main && git checkout main && git pull
npm ci --legacy-peer-deps && npm run verify   # 240 suites green 기대
```
정본: `handoff-spec/SCREEN_TREE_SPEC.md`(동작) + `design/*.dc.html`(시각). 진입맵 §0.2.

---
## 2026-06-21 (밤) / 엣지함수 인증 하드닝 스윕 — #524 배포 + delete/export-account anon-JWT 차단

#524(gemini-proxy role-체크)를 **라이브 배포**하고, 같은 취약점 클래스(verify_jwt=true는 토큰
유효성만 증명 → 공개 anon/publishable 키도 유효 토큰)를 전 엣지함수로 **스윕**. inbound JWT의
`sub`만 신뢰하던 service-role 함수 2종(delete-account·export-account)을 발견해 `role==='authenticated'`
요구로 하드닝. 5개 inbound-JWT 함수의 인증 자세를 일치시켰다.

### 어디까지 왔나
- **gemini-proxy**: #524 엣지함수 **배포 완료** (v13→v14, verify_jwt=true). 정본 소스 바이트-검증
  (sha `9f655af7`) 후 MCP 배포 → re-fetch로 role 체크 라이브 확인. 직전 핸드오프의 🔴 "#524
  엣지함수 DEPLOY 필요" 플래그 **해소**.
- **delete-account** (service-role, 계정 영구삭제): `userIdFromJwt`에 role 체크 추가 후 **배포**
  (v3→v4). 변경은 제한적(비인증 토큰 거부)이라 정상 로그인 사용자 무영향. 배포본 바이트-검증 + re-fetch.
- **export-account** (service-role, Art.20 데이터 export): 동일 하드닝 + **배포 v1** (Simon 승인으로
  #373 DPIA 게이트 통과, "검토 완료 간주" 지시). read-only·IDOR-safe(user_id=JWT). 바이트-검증
  (sha `5b4a237c`) + re-fetch + anon 스모크 401 확인. 단 클라이언트 UI 배선은 별도(이 PR 범위 밖).
- **rss-proxy**: 이미 `authenticatedUserIdFromJwt` 보유(이번 패턴의 레퍼런스). **oauth-naver/
  kakao·seed-knowledge-base**: verify_jwt=false 프리오스/시드, inbound-sub 미신뢰 → 해당 없음.

### 취약점 분석 (방어심층)
공개 anon 키 JWT는 보통 `sub`이 없어 구 코드도 null→401이라 **현재 활성 익스플로잇은 아님**. 이번
하드닝은 일관성·방어심층(미래 토큰 포맷이나 sub을 가진 비인증 토큰 차단)이고, gemini/rss는 이미
닫혀 있었던 반면 service-role 2종이 누락분이었다.

### 검증 / 배포 / 재발방지
```bash
npm run verify   # green (237 suites / 1792 tests)
```
- **소스 검증**: get_edge_function re-fetch로 라이브 소스에 role 체크 존재 확인 (gemini v14, delete v4).
- **실동작 스모크**: anon-키 JWT(role=anon)로 gemini-proxy·delete-account POST → 둘 다 `401 invalid_jwt`
  (함수 코드가 거부, Gemini 호출도 삭제도 없음). no-auth → 게이트웨이 401. 배포 실동작 증명.
- **재발방지 (PR #552)**: `src/lib/safety/__tests__/edge-jwt-hardening.test.ts` — JWT `sub`를 읽는
  엣지함수는 `role==='authenticated'` 게이트 필수, 없으면 CI 실패. 주석 스트립 처리(주석이 코드
  누락을 못 가림), 구버전 취약 패턴을 잡는지 증명 완료. 인라인 중복을 무위험으로 안전화
  (3-prod-재배포 리팩토링 회피).

### 다음 작업 큐 / 게이트
| # | 작업 | 게이트 |
|---|---|---|
| ~~A~~ | ~~export-account 엣지함수 배포~~ | ✅ **배포 v1 완료** (Simon 승인, DPIA 검토 완료 간주). 라이브 anon 스모크 401 확인. 후속: 클라이언트 UI에 export CTA 배선(앱). |
| ~~B~~ | ~~토큰 파서 단위테스트 공유화~~ | ✅ PR #552로 완결 (가드가 4함수 일관성 강제) |

---
## 2026-06-21 (저녁·인프라) / AI 허브 모니터 복구 + 런치팩 워커 자율루프 + AG 네이티브-QA 라이브 픽스

(인터랙티브 세션 — 같은 날 디렉터 /loop 세션들과 병행. 아래 "(저녁) D-25" / "(오후) deep-space" 블록은 디렉터 작업.) AI Hub 모니터 `stale-run?` + `BACKLOG ALARM` 해소(근본=git 신원 불일치) → 런치팩 워커 자율루프 1급화(양 문서) → AG stranded QA를 framework-aware로 선별해 라이브 픽스(#506). **대부분의 AG 보고가 legacy 死코드**였음을 Claude 최종패스가 걸러냄. device-QA는 3중 블로커로 AG 레인 보류.

### 어디까지 왔나
- main HEAD: `566e9a16`(이 핸드오프 머지 직전) — 디렉터 세션이 계속 머지 중
- 이번 세션 머지 PR: **#506** `fix(android): keyboard focus flow on deep-space auth + back-arrow elevation`(squash, CI verify+Pages green, `b8f7ad94`가 live main 조상=라이브)
- 허브(로컬 git, **리모트 없음**) 커밋: 모니터 머지게이트 ack(claude 신원) · `HUB-STARTUP.html` 동기화 · `BACKLOG.md` 재triage
- working tree(E:/2ndB): 디렉터가 `feat/d25-positioning` 작업 중(dirty) — **건드리지 말 것**(공유 트리)

### 활성 인프라
- 2nd-B 인프라(Supabase `zoacryukmdeivmolvyhj` / GitHub Pages 정본 / Google OAuth) = 아래 디렉터 블록 참조.
- **AI Hub** `E:\Coding Infra\AI Infra\Communication`(로컬 git, push 안 함): `CONTROL.md state: running`, monitor `RUNNING / claude fresh / backlog clear`. 데몬 codex+antigravity, **grok=요청전용**. **repo 기본 git 신원=`claude@2nd-b.ai`**(plain-commit이 ai-hub@local로 새던 모니터 알람 근본원인 차단).
- **런치팩 2종**(루트, git 아님): `AI Hub 시작 키트 — 복붙 런치팩.html` + 허브 `HUB-STARTUP.html` — 워커 지속루프=`hub-daemon.ps1 -Only <ai>` 포그라운드(워커 CLI엔 REPL-내장 루프 없음, Claude만 `/loop`).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | AG device-QA: deep-space `Shell` 탭바패딩(40px) 가림 + 하드웨어 Back — **로그인(Supabase 테스트계정) 필요** | medium | ⭐ AG 에뮬 복구 후 / 테스트계정 주면 Claude가 dev클라 reload로 진행 |
| B | 허브 `BACKLOG.md` P0/P1(merge-gate backpressure, 데몬 timeout, AG seat 정직화) | medium | `tools/hub-daemon.ps1` |
| C | legacy-skin elevation(QuantIntroModal/DrillProgress) | small | rollback skin만, 저우선 |

### 적용 중인 정책 (영구)
1. **멀티에이전트 발견은 적용 전 Claude framework-aware 최종패스 필수** — "N confirmed" 곧이곧대로 믿지 말 것(legacy 死코드/공유전제 위양성 多). ref: tool_workflow_verify_shared_premise
2. **2nd-B 작업=격리 worktree**(`E:/2ndB/.worktrees/<name>` off origin/main). 공유 `E:/2ndB`(디렉터 점유) 비침범. ref: tool_push_grep_masks_rejection
3. 허브 오케스트레이터 커밋=`claude@2nd-b.ai`. 워커=`commit.ps1 -As`. scoped staging만(`-A` 금지). 머지 전 CI green 별도 확인. 게이트(파괴/비용/secrets/임상/법무)만 Simon.
4. CONTROL=running 시 `HubWatchdog`(10분)가 죽은 데몬 자동재시작. 정지는 CONTROL=paused 먼저.
5. `adb exec-out screencap -p > f.png`(Git-Bash `/sdcard` 경로변환 우회). metro 8081 phantom 시 `--port 8120`+`adb reverse tcp:8081 tcp:8120`. **docs/HANDOFF.md는 디렉터와 동시쓰기 충돌잦음 → 최신 main prepend 후 즉시 머지.**

### 핵심 파일 위치
```
E:\Coding Infra\AI Infra\Communication\   AI Hub(로컬 git, 리모트 X) — monitor.ps1 / hub-daemon.ps1 -Only <ai> / CONTROL·BOARD·BACKLOG
E:\Coding Infra\AI Hub 시작 키트 — 복붙 런치팩.html   런치팩(루트, git X)
E:\2ndB\ (origin/main, 디렉터 점유) — src\screens\deepspace\DeepSpaceDesignScreens.tsx(라이브 화면) / src\components\ui\BackArrow.tsx / ANDROID_QA_GUIDELINES.md
```

### 검증 & 재개
```bash
cd E:/2ndB && npm run verify
# 다음 세션(보통 cwd=E:\Coding Infra): cd E:/2ndB && git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 작업 A(AG device-QA) 또는 B(허브 BACKLOG)부터
```

---
## 2026-06-21 (저녁) / D-25 포지셔닝·UX 정제 — 4AI 토론→페르소나 검증→구현

그록의 5개 포지셔닝/UX 제안을 **4-AI 토론 + 페르소나 시뮬**로 검증(D-25, `AI Infra/Communication/DECISIONS.md`)하고 구현까지 닫은 트랙. `/goal 모든 phase 완료` 하네스로 Phase 0~3을 끝까지 밀었다. **Phase 0·1·2 = 100%, Phase 3 = D-21 + pull digest + #540 + #542 + #544.** (이 트랙의 #537~#544는 아래 "오후" 블록과 같은 세션 — 거기서 O-31 렌즈 배선까지 함께 머지됨.) 전 PR `npm run verify` green (236 suites / 1786 tests).

### 어디까지 왔나
- main HEAD: `8157cab6`
- D-25 트랙 머지(롤업):
  - **Phase 0**(신원): raw %→`brightnessBand()` + de-companion(`anthro.ts` 감시구문 4패턴)·watcher de-voice
  - **Phase 1**(a11y + raw-Text 전수): ≥44px·SR live-region·그리팅·TTFV + **16+파일 ~450 Text를 capped `@/components/ui/Text`로**(readable-font 토글). #534 `Text` `pixelEn` prop + #535 pixelEn eyebrow 44개
  - **Phase 2**(D-17): preauth-pending 큐 + `(auth)/jot.tsx`(device-local·LLM 0)
  - **Phase 3**: #536 `/digest` pull 검토 · #540 성인추천 default-OFF+토글 · #542 opt-in 로컬 일일 리마인더(`daily-review.ts`) · #544 추천 이해게이트(캐논 privacy mockup 기능화·성인전용·consent ledger·미성년 잠금)
- working tree: **E:/2ndB는 `feat/d25-phase1` + dirty 27**(동료 미커밋 — 건드리지 말 것). 내 작업은 전부 격리 worktree→PR

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **AG 에뮬 시각 QA** — raw-Text 16+파일(특히 252-Text `DeepSpaceDesignScreens`) 픽셀 회귀 | medium | ⭐ CI green이나 픽셀 검증 불가 |
| B | server-push 스케줄러 | large | ❌ **짓지 말 것** — #542(OS-스케줄 일일 알림)가 사용자가치 전달=중복 + 마이그레이션 레포 밖이라 깨끗이 빌드 불가 |
| C | 추천 이해게이트 **법무** | - | ⏸ §11-5 = 실 K12 DPIA + counsel(외부). 코드(#544)는 안전형태로 닫음, 공개런치 전 검토 |
| D | morning-brief **D-19 재논의** | - | ⏸ 앱주도 push = anti-companion 충돌. 필요시 §35 토론 |

### 적용 중인 정책 (영구)
1. PR→main squash 머지(verify green). **main 직접 푸시 금지**, `git add -A` 금지(명시 경로만).
2. **격리 worktree 필수**(E:/2ndB 공유 → 내 브랜치는 `_worktrees/`, node_modules는 mklink /J 정션).
3. **게이트(항상-확인·우회 불가)**: ①파괴적 ②비용 ③secrets ④**아동 안전**(미성년 데이터·푸시·프로파일링) ⑤**법무 §11-5**(K12 DPIA·counsel). D-25에서 이 게이트로 server-push·이해게이트 법무를 보류/안전형태 처리.
4. 디자인: deepSpace.* 토큰만·hex 0, 비주얼 티어 불가침, 1메시지+1그래픽, propose→ratify. **anti-companion(D-19)** CI 강제(`check-anti-anthro`/`check-mascot-voice`).

### 핵심 파일 위치
```
AI Infra/Communication/DECISIONS.md   D-25 합의 원장(Claude-owned)
src/app/digest.tsx                     "오늘의 정리" pull 검토 + 일일 리마인더 토글
src/lib/ops/daily-review.ts            opt-in 로컬 일일 알림
src/lib/ops/recommend.ts               recommendationsAllowed(성인도 pref enforce·default OFF)
src/lib/privacy/prefs.ts               VISIBLE_PRIVACY_KEYS(+recommendations)·미성년 잠금
src/screens/deepspace/DeepSpaceDesignScreens.tsx  캐논 privacy = 기능 이해게이트(#544)
src/lib/supabase/consent.ts            recordRecommendationsConsent(LLM+해외 ack)
```

### 검증 / 다음 세션 시작
```
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
npm run verify   # 236 suites / 1786 tests green
# A(AG 에뮬 QA)부터. server-push(B)는 짓지 말 것.
```

---
## 2026-06-21 (오후) / deep-space 렌즈 상호작용 기능화 + 세션 작업 전부 main 머지

Simon "상호작용이 잘 이뤄지는지 확인" 오더에서 출발 — framework-aware 감사로 deep-space 캐논의 **핵심 가치 루프(7 자기이해 렌즈 + 설정 CTA)가 더미데이터+죽은 CTA**(실로직이 legacy 분기에 갇힘 = O-31 P0 진짜 갭, a11y/fidelity sweep이 안 건드린 기능 배선)임을 확인하고, 더미였던 렌즈를 **shell-swap으로 실기능화**. 타 AI(Codex/플릿) 커밋도 검토·머지. **#537~#544 + #524 (9 PR) main 머지**, 전 PR `npm run verify` ×2 green.

### 어디까지 왔나
- main HEAD: `05e9ceb8`
- 이번 세션 머지된 PR(전부 라이브·green):
  - #537 insights 막대차트 (Codex 패치 검증·머지)
  - #538 core-brain 캐논 기능화 (더미 LensView→실 Soul Core, shell-swap)
  - #539 core-brain "제안 받고 점검하기" CTA → 기능 /digest (오펀 #536 도달가능화)
  - #540 privacy: recommendations off-by-default (플릿)
  - #541 attachment 캐논 기능화 (실 ECR 관계검사)
  - #542 opt-in daily-review 리마인더 (플릿, D-19-안전)
  - #543 esm 캐논 기능화 (실 체크인)
  - #524 gemini-proxy 인증 role-check 하드닝 (보안)
  - #544 privacy understanding-gate (플릿)
- 테스트: 전 PR `npm run verify` ×2 green, main CI green (05e9ceb8)
- working tree: orch 워크트리 clean. ⚠️ `E:\2ndB` 주트리엔 타 세션(플릿) 미커밋 변경 있음(내 것 아님, 건드리지 말 것)

### 활성 인프라
- 라이브 웹 = GitHub Pages https://simon-yhkim.github.io/2nd-B/ (main→Pages 자동)
- 🔴 **#524 gemini-proxy: 코드는 main, 엣지함수 DEPLOY 필요** — `supabase functions deploy gemini-proxy` 해야 인증 role-체크 하드닝이 서버측 활성화(머지만으론 라이브 프록시 미적용)
- 4-AI 허브: `E:\Coding Infra\AI Infra\Communication`. **Codex/AG/Grok 헤드리스 데몬 정지 상태**(Simon이 정지+재부팅). Claude=오케스트레이터(claude@2nd-b.ai)
- orch 워크트리: `E:\Coding Infra\_worktrees\2ndB-orch` (origin/main 고정, 북킹·패치 vehicle, 공유 HEAD 비침범)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | #524 gemini-proxy 엣지함수 DEPLOY (보안 활성화) | small | ⭐ 코드 머지됨, 배포만 (Simon/인프라) |
| B | audit/persona/interview 캐논 데이터-배선 | large | 설계결정: 캐논 목업 유지+실데이터 vs shell-swap 기능화 |
| C | 게이트 #18(위기-lexicon false-negative 공개웹)·#522(import 프라이버시-copy + C10 fail-open) | medium | 임상/법무 게이트 = Simon 방향 |
| D | imagine 렌즈 placeholder(22줄) → 신규 빌드 | medium | 와이어링 아닌 새 기능 |
| E | Codex 데몬 재시작 시 남은 렌즈 깊은 배선 병렬화 | — | 데몬 복귀 후 |

### 렌즈 상호작용 현황
- ✅ 완전 기능화(실데이터+실플로우): **core-brain · attachment · esm** (shell-swap)
- 🟡 캐논-네이티브 목업(스타일+CTA 탭 작동 O, 더미데이터+순환플로우 → 깊은 데이터-배선 필요): **audit · persona · interview** (FIDELITY_AUDIT의 "더미 LensView 죽은CTA"는 이 3개엔 stale)
- ⬜ **imagine** = placeholder (별도 빌드)

### 적용 중인 정책 (영구)
1. **/loop 디렉터 모델**: orders-poll → 분배(codex=UI·AG=에뮬QA·grok=소셜) → framework-aware 검토 → `npm run verify` green 시만 main 머지 → ## DONE 회신. 게이트(파괴/비용/secrets/임상/법무)만 Simon.
2. **shell-swap 패턴**(캐논 렌즈 기능화): canon=`DeepSpaceScreen`(도크)/legacy=`PremiumAppShell`이 하나의 기능 컴포넌트 공유, 더미 LensView 제거 (core-brain #538 레퍼런스).
3. **framework-aware 검증**: CI green ≠ 런타임 안전(CI가 Supabase/AsyncStorage 모킹). stale audit 맹신 금지 — 소스 재확인.
4. **git 위생**: scoped paths만 stage(`git add -A` 금지), 공유 `E:\2ndB` HEAD 비침범, 허브 커밋은 scoped 로컬.
5. 캐릭터 = 머리만 (DECISIONS **D-26**; SecondbHead decorative, 3D 본체화 불요).

### 핵심 파일 위치
```
src/app/{core-brain,attachment,esm,persona,interview,audit,imagine,big-five}.tsx  렌즈 route(canon/legacy 분기)
src/components/deep-space/DeepSpaceViews.tsx     렌즈 뷰 + 더미 데이터
src/components/deep-space/DeepSpaceScreen.tsx    캐논 셸 + 5탭 도크
src/app/digest.tsx                               오늘의 정리(#536/#542)
supabase/functions/gemini-proxy/index.ts         #524 (DEPLOY 대기)
docs/FIDELITY_AUDIT.md                           ※ audit/persona/interview엔 stale 주의
(허브) E:\Coding Infra\AI Infra\Communication\{BOARD,DECISIONS,ORDERS}.md
```

### 검증
```bash
npm run verify   # lint + type-check + i18n + lexicon + constraints + jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 권장: A(#524 deploy) 또는 Simon 지시 우선
```

---
## 2026-06-21 (이전 세션, cowork) / 게이트 해소 마무리 + 구글 임포트 커넥터 + TTFV 화면 (6 PR)

지난 세션이 코드로 닫아둔 비전 3축을 **라이브로 켜는** 세션. cowork(computer-use)이 G0 마이그레이션·무료키 발급·Vercel·Google OAuth 뼈대를 처리했고, Claude가 후속으로 정본 웹 확정(Pages)·FX 도메인 수정·키 배선·구글 커넥터(Calendar+Tasks)·TTFV 첫날 화면을 코드로 닫았다. **#496~#501 (6 PR) main 머지**, `npm run verify` green (225 suites / 1715 tests).

### 어디까지 왔나
- main HEAD: `858d699e`
- 이번 세션 머지된 PR (전부 squash, verify green):
  - #496 마이그레이션 `0048-0051` prod 적용 + **`0050` 미성년-잠금 보안 회귀 수정** (0038 `COALESCE(OLD,NEW)` 하드닝 보존)
  - #497 FX 클라이언트 도메인 `oapi.koreaexim.go.kr`로 교체 (구 host 2026-04-30 폐지)
  - #498 EXIM/MFDS 무료키를 GitHub Pages 빌드에 배선 (repo Variables)
  - #499 Google Calendar 임포트 커넥터 (웹, GIS 토큰 모델 → `.ics`로 직렬화 → 기존 임포트 파이프라인 재사용)
  - #500 Google Tasks 임포트 커넥터 (같은 GIS 경로, `tasks.readonly`)
  - #501 TTFV "첫날 자기이해 한 컷" 화면 (`/ttfv`)
- 테스트: `npm run verify` green (225 suites / 1715 tests)
- working tree: dirty 1개 — `AGENTS.md`에 빈 `## Imported Claude Cowork project instructions` 헤딩이 부트스트랩 훅으로 추가됨 (무관·미커밋, 신경 안 써도 됨)

### 활성 인프라
- **Supabase**: `2nd-brain` (`zoacryukmdeivmolvyhj`, ap-northeast-2). `0048~0055` 전부 적용, owner-only RLS, 보안 advisor 신규경고 0.
- **정본 웹 = GitHub Pages** (`simon-yhkim.github.io/2nd-B/`), `web-deploy.yml`이 main 푸시마다 배포. `EXPO_PUBLIC_*`는 repo **Variables** (Settings→Secrets and variables→Actions→Variables): SUPABASE_*, `EXIM_FX_KEY`, `MFDS_FOOD_KEY`, `GOOGLE_CLIENT_ID` 등록됨. **Vercel 프로젝트 `2ndb`는 미사용/파킹** — `app.json baseUrl:/2nd-B`라 루트 서빙 깨짐.
- **Google OAuth**: Web 클라이언트 `2nd-Brain Web` (GCP `My Project 81087` = ornate-hour-217619). Calendar/Tasks API 활성, **Testing 모드**(test user = Simon). client ID = repo Variable `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **Simon 콘솔**: `2nd-Brain Web` → 승인된 JavaScript 원본에 `https://simon-yhkim.github.io` + `http://localhost:8081` 추가 (redirect URI 아님) | small | ⭐ 이거 없으면 구글 커넥터가 토큰 못 받음(현재 곱게 에러 처리) |
| B | **Simon**: `design/`에 5종 `.dc.html` 업로드 (ttfv-firstday·ops-assistant·ops-ia·import-hub·weekly-growth) | small | ⭐ 정본 파일 repo 누락분 채우기 |
| C | TTFV 첫날 **자동 트리거**(가입 후) + "더 알아가기" `/core-brain` 플레이스홀더를 관계-렌즈 상세로 교체 | small | 온보딩 흐름 완성 |
| D | **G3** — EAS 네이티브 빌드 + 실기기 QA (알림·기기캘린더·위치 + G4 파일피커) | large | 네이티브 게이트 |
| E | **G5** — PIPA 법무 (위치·통신·헬스 영속·암호화·만료) | medium | 법무 |
| - | 레거시 11화면(big-five·persona·imagine 등) | - | **건드릴 필요 없음** — `EXPO_PUBLIC_UI=legacy` 롤백 스킨(의도된 보존) |

### 적용 중인 정책 (영구)
1. PR은 main으로 **squash + 자동머지**(`gh pr merge --auto --squash`, verify green이면). main 직접 푸시 금지, 항상 브랜치→PR.
2. 디자인 = 클로드 디자인 정본(`design/*.dc.html`) 기준, **deepSpace.* 토큰만·hex 0**, 비주얼 티어 시스템 불가침, 정보밀도 1메시지+1그래픽, propose→ratify(자동 반영 없음). 레거시는 보존하되 신규작업 기준 아님.
3. **마이그레이션 안전**: `CREATE OR REPLACE`가 이전 버전을 "mirror"한다 적혀 있어도, 적용 전 **현재 prod / 전체 체인 상태와 diff**(0050 회귀 교훈).
4. 키는 repo Variables(EXPO_PUBLIC_*, 저민감 공개키만 번들). 민감하면 엣지 프록시.
5. 순수 로직+단위테스트 → 화면 조립. 새 LLM 진입점 금지(C1). 긴 작업은 전담 에이전트로 분리하고 **파일 단위 검토 후** 머지.

### 핵심 파일 위치
```
src/lib/google/{gisToken,calendar,tasks}.ts        구글 커넥터(GIS 토큰 · Calendar/Tasks REST+파서)
src/screens/deepspace/import/ImportHubScreen.tsx   임포트 허브(구글 커넥터 googleKind 분기 배선)
src/screens/deepspace/onboarding/TTFVScreen.tsx    TTFV 첫날 화면(2-state propose→ratify, SVG 별자리)
src/app/ttfv.tsx                                   /ttfv 라우트(자동 트리거 TODO)
src/lib/finance/fx.ts                              FX(oapi.koreaexim 도메인)
src/lib/env.ts                                     EXPO_PUBLIC_GOOGLE_CLIENT_ID 슬롯
db/migrations/0048~0055                            ops_routines·health_samples·srs·ledger·reading·milestones·meal_plan
.github/workflows/web-deploy.yml                   Pages 배포 + EXPO_PUBLIC_* Variables 주입
docs/GATE-RUNBOOK.md                               게이트 G0~G5 상태(G0✅ G1✅ G2=콘솔 1스텝)
```

### 검증
```bash
npm run verify   # 225 suites / 1715 tests green
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(콘솔 JS origin)+B(.dc.html 업로드)는 Simon 외부 작업, 그 후 C(TTFV 트리거)부터 코드
```

---
## 2026-06-20 / 비서(Ops) 완성 + 개인 데이터 임포트 + 성장 피드백 루프 (15 PR)

이번 세션은 비전 3축을 코드로 닫았다: (1)알아가기↔(2)비서 연결 + (2)비서 전면 구축 +
개인 데이터 임포트. 클로드 디자인 정본 4종(ops-assistant / ops-ia / import-hub /
weekly-growth)을 키트로 배선. **#480~#494 (15 PR) main 머지**, `npm run verify` green
(222 suites / 1704 tests). 전 구간 deepSpace 토큰만·hex 0·코어 신설 0·자동 실행 없음·$0·
C1/C3/C9/C7 유지.

### 완료 (세 갈래)
1. **비서(Ops)** — 적응형 추천(`signals.ts` adherence + `growth/lens-signal.ts` 자기이해
   별밝기 근거 = axis1→axis2 엔진 다리) + IN-bound 백엔드 8종(books·shelf·milestones·
   ledger·fx·github·foods·meal-plan, 전부 순수 파서+테스트, 키-graceful) + 공유 키트
   (`components/deepspace/ops/{kit,copy}`) + 6 도메인 화면 + 내비/IA(홈 "비서" → /ops 허브 →
   도메인 피커=라우터, 깊이2·Back 한 방향).
2. **개인 데이터 임포트** — 파서 7종(`lib/import/`: kakao·sms·location·ics·apple-health·
   email + detect/hints, 전부 PURE·온디바이스·원문 비보존) + 임포트 허브(민감도 차등·동의
   A/B[무엇을/어디에/이기기에서만]·propose→ratify·이력·**진짜 철회**[source 삭제]). 미성년
   통신·위치 잠금(C10).
3. **성장 피드백 루프** — "나의 변화"(`/growth`, `lib/growth/weekly.ts` 순수 합성): 7별
   before→after(기존 별자리 언어, 밝기만 — 비주얼 티어 불가침) + 지표 칩 + 다음걸음
   propose→ratify. star_tier_history·ops_logs·milestones·records 합성만(엔진 신설 0).

### 게이트 경계 — 코드로 더 진행 불가, Simon 외부 액션 필요 (`docs/GATE-RUNBOOK.md`)
- **G0** ✅ 완료 (2026-06-20, Supabase MCP): `0048~0055` 전부 prod 적용. 직전 세션이
  0052~0055만 적용해 둔 **0048~0051 간극**을 발견·적용(0048 ops_routines가 주간성장리뷰
  백킹) + **0050 보안 회귀 버그 수정**(원본이 0038의 `COALESCE(OLD,NEW)` 미성년 하드닝을
  되돌릴 뻔 → COALESCE 보존 + health_import 추가). 저장·루틴·SRS·주간성장리뷰 백킹 켜짐.
- **G1** 무료 키 `EXPO_PUBLIC_EXIM_FX_KEY`(수출입은행)·`EXPO_PUBLIC_MFDS_FOOD_KEY`(식약처)
  → Vercel+EAS 환경변수.
- **G2** GCP OAuth(Calendar/Tasks) · **G3** EAS 네이티브+실기기 QA · **G4**
  expo-document-picker(임포트 paste→파일피커) · **G5** PIPA 법무(위치·통신 영속/암호화).
- **자동화**: 클로드 코워크용 computer/chrome-use 프롬프트가 세션 채팅에 있음(G0+G1 우선).

### 다음 작업 큐 (게이트 열리면 그 지점부터)
| 트리거 | 작업 |
|---|---|
| G0 적용 | 저장 화면 실데이터 검증(이미 graceful) |
| G1 키 | fx/foods 실데이터 확인 |
| G3 EAS | 리마인더·기기캘린더·실시간위치·파일피커 활성 + 임포트 허브 paste→파일피커 교체 |
| 디자인 정본 | 첫날 자기이해 한 컷(TTFV) 등 신규 화면 |
- 선택 제품 결정: 14 ops 영역 3~4 핵심 압축 · 공상(axis3) 투자 vs 비서 흡수.
- 이전 핸드오프 잔여: `handoff/20260620-news`의 #477(포모도로)·#478(뉴스 RSS) 머지 +
  `rss-proxy` 배포 상태 확인.

### 적용 중인 정책 (영구)
1. 디자인 = 클로드 디자인 정본 → 기존 키트 재사용 배선. deepSpace.* 토큰만, hex 0, 레거시/
   glassmorphism/pill/em dash 0, 코어 신설은 별도 게이트(G1).
2. 순수 로직 분리 + 단위테스트 → 화면 조립. **합성 우선, 새 LLM 진입점 금지(C1)**.
3. 민감 데이터: 동의 전 0 byte · 온디바이스 · 원문 비보존 · 미성년 잠금(C10) · propose→ratify.
4. PR은 main으로 squash 머지. 푸시 전 `npm run verify` green 필수.

### 핵심 파일 (이번 세션)
```
src/lib/ops/{recommend,signals,nav,routines,push,...}.ts          비서 엔진 + 근거 신호
src/lib/{reading,finance,projects,nutrition}/*                    IN-bound 백엔드
src/lib/import/*                                                  임포트 파서 7종 + proposals/history
src/lib/growth/{weekly,gather,lens-signal}.ts                     성장 합성 + axis1→axis2
src/components/deepspace/ops/{kit,copy}.tsx                       공유 컴포넌트 키트
src/screens/deepspace/{ops,import,growth}/*                       화면들
src/app/{ops,reading,milestones,ledger,side-project,meals,reminders,import-hub,growth}.tsx
db/migrations/0052_ops_ledger · 0053_ops_reading · 0054_ops_milestones · 0055_ops_meal_plan
docs/{GATE-RUNBOOK,PERSONAL-DATA-IMPORT-SPEC,INTEGRATIONS-14-AREAS,ASSISTANT-EFFECTIVENESS-REVIEW}.md
```

### 검증 & 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md          # 이 섹션
cat docs/GATE-RUNBOOK.md      # Simon 할 일
npm run verify               # 222 suites / 1704 tests green
# 게이트 열렸으면 위 큐의 해당 배선부터, 아니면 디자인 정본/신규 방향
```

---
## 2026-06-19 / Phase A — ops 관리 레이어 (루틴 저장 + 로컬 알람 + 오늘의 루틴/완료 추적)

브랜치 `claude/ops-routines-82evat`. SUGGEST 엔진(`recommend.ts`) 위에 MANAGE 레이어를 추가: 이미 게이트된 추천을 영속 루틴으로 저장하고, 기존 로컬 알람 스케줄러로 리마인더를 걸고, 오늘 due한 루틴을 체크박스로 완료 추적.

### 완료
- **Phase A (ops 관리 레이어: 루틴 저장 + 로컬 알람 + 오늘의 루틴/완료 추적)** ✅
  - migration `0048_ops_routines.sql` — `ops_routines` + `ops_routine_logs` 두 테이블, 둘 다 owner-only RLS(`auth.uid() = user_id`). 추가형·idempotent. 새 LLM 호출 없음(C9/C1 표면 불변 — 루틴은 이미 게이트된 추천의 SAVE).
  - `src/lib/ops/routines.ts` — RLS-scoped 쿼리 + pure helper(`routineDueToday`/`mapRecurrence`/`deriveReminder`/`weekStreak`) 분리(node-testable).
  - `DeepSpaceOpsScreen` 배선: 추천마다 "루틴으로 저장" 액션(저장 후 기존 `scheduleRoutineReminder`로 알람 + ReminderResult 토스트), "오늘의 루틴" 섹션(낙관적 체크 완료). 하드코딩 한국어 버튼("공유"/"캘린더에 추가") t() 키로 교체.
  - i18n: `ops` namespace 5 locale(en/ko/es/id/pt) `card.*`/`today.*`/`push.reminderUnavailableNote` 키 추가, C7 parity 유지.

### 나중에 할 일 (2026-06-19)
- #468 (deep-space 로그인 + Facebook/GitHub) 머지 — CI green, draft 대기. 사용자가 "나중에" 지시.
- OAuth provider 활성화: 각 provider를 Supabase 대시보드에 client id/secret + redirect URL 등록 후 `EXPO_PUBLIC_ENABLE_<PROVIDER>=true`. google 검증됨; facebook/github/apple/kakao OFF; naver는 `oauth-naver` 엣지펑션 + `ENABLE_NAVER_OAUTH` 필요.

---
## 2026-06-19 (cont.) / Wiki-graph upgrade A–E + deep-space data wiring + i18n (PR #464)

### 어디까지 왔나
- 브랜치 `claude/ultracode-handoff-docs-82evat`, PR **#464** (draft). 모든 커밋 `npm run verify` green (현재 1465 tests, i18n 26 namespaces / 1339 keys).
- 직전 핸드오프의 "다음 작업 큐" A–E를 한 세션에서 처리:
  - **A (STEP 1a)** ✅ `src/lib/wiki/materialize.ts` — Phase1 entities/concepts를 entity/concept 노드로 materialize + source→node edges (idempotent, 기존 body 보존). `phase2.generateSourcePage`에서 호출.
  - **B (STEP 1b)** ✅ deep-space `/wiki`·`/research`를 실데이터로 배선. `src/screens/deepspace/wiki-graph-view.ts` pure 빌더.
  - **C** ✅ deep-space 화면 실데이터 와이어링: `/records`(KST 타임라인), `/domains`(태그-도메인 집계), `/inbox`(미정리 source 큐 promote/discard), `/record` 상세(`getRecordById`+related-by-tag), `/ops`(on-demand 추천, D-20 minor gate+일일 한도). **`/formats`만 정적**(백킹 데이터 없음).
  - **E** ✅ STEP 2 (migration `0046` `wiki_links.relation_type`+`confidence`, propose→ratify 쿼리) + STEP 3 (`src/lib/wiki/clusters.ts` connected-component 군집 + cross-topic surprise). **STEP 4 (pgvector)는 계획대로 deferred**.
  - **D ✅ 완료** — 새 `deepspace` i18n namespace(5 locale en/ko/es/id/pt) 등록 + **모든 deep-space Shell 화면 25종** i18n 전환 완료 (C7 parity, 1539 keys, em dash 0). KO 원문 보존, EN canonical. pure 날짜 helper는 i18n-free 유지하고 화면에서 localized label 주입(`dsTimeLabels`/`dsRecencyLabels`).

### 결론: 큐 A–E + 후속 4종 전부 완료
A(materialize)·B(wiki/research 배선)·C(전 화면 실데이터)·D(5-locale i18n)·E(STEP 2+3) + 후속 **STEP 4(pgvector)·익스포트 파이프라인·인박스 추천 태그·propose→ratify** 모두 PR #464에 랜딩.
- **STEP 4 ✅**: migration `0047`(pgvector + `embedding vector(768)` + HNSW + `match_wiki_pages` kNN RPC), `gemini.ts embedTexts`(C1/C3/C9 + cost guard, mock=deterministic), `embeddings.ts`(cosine/rank/backfill/relatedByEmbedding). `/data` "의미 색인 만들기" 액션이 backfill 트리거. CI는 `pgvector/pgvector:pg16` 이미지로 dry-run. **활성화 = prod pgvector apply + Vertex 임베딩**.
- **익스포트 ✅**: `/formats`가 실제 export(.iden/Markdown/JSON/PDF) + 범위 토글 + 복사/공유/다운로드.
- **인박스 추천 태그 ✅**: Phase 1 캐시 태그를 추천 칩으로, 없으면 on-demand Phase 1.
- **propose→ratify ✅**: STEP 4 의미 이웃을 `inferred` 엣지로 제안(`proposeAllRelatedLinks`) → `/research` "제안된 연결"에서 사용자 승인(`ratifyLink`)/거절(`rejectInferredLink`). 캐논 완성. confidence 0.5 floor가 mock 노이즈 차단.

### 완료 (이번 세션 후속)
- **prod migration ✅**: `0044`~`0047` 4개 Supabase(2nd-brain)에 apply 완료. `vector` 확장 enable + `match_wiki_pages` kNN RPC 라이브. 보안 advisor green(새 테이블 RLS OK).
- **`/import` 수동 가져오기 ✅** (PR #465): 마크다운 붙여넣기 → 검토 → `captureFromMarkdown`로 source 생성(LLM 없이 $0) → inbox. `import-notes.ts`(split/preview) + 테스트.
- **Native(EAS) 딥스페이스 전환 ✅**: `eas.json` production `EXPO_PUBLIC_UI=deep-space`로 플립(웹과 일치). native는 `EXPO_PUBLIC_CHARACTER=fallback` 핀(3d r3f/expo-gl OOM 리스크 회피, ANDROID_QA_GUIDELINES §3). **게이트: EAS production submit 전 실기기 QA 필요** — 3d 캐릭터 전환은 그 후.

### 다음 후보 (선택)
- `/import` 외부 커넥터(Notion/Obsidian) 실제 연동 (정적 mockup 유지 중).
- native 실기기 QA 후 `EXPO_PUBLIC_CHARACTER=3d` 전환 검토.

### 핵심 파일
```
src/lib/wiki/materialize.ts                      STEP 1a
src/lib/wiki/clusters.ts                         STEP 3 군집 엔진
db/migrations/0046_wiki_link_relation_type.sql   STEP 2
src/screens/deepspace/wiki-graph-view.ts         view 빌더 + recencyLabel/buildDomainsView
src/screens/deepspace/records-timeline.ts        타임라인 빌더 (localized labels)
src/screens/deepspace/DeepSpaceDesignScreens.tsx 모든 deep-space Shell 화면
locales/*/deepspace.json                         deepspace i18n bundle (5 locale)
src/lib/i18n/index.ts                            namespace 등록
```

### 검증
```bash
npm run verify   # green (1465 tests)
```

---
## 2026-06-19 / Deep-space UI conversion complete; wiki-graph upgrade next (STEP 1a)

### 어디까지 왔나
- main HEAD (이 핸드오프 머지 전): `8ad4f01`
- 이번 세션 머지된 PR:
  - #460 — 20 deep-space screens (별 7개 lens + insights/data + theme/manual/plans/permissions + discover/review + records/inbox/research/formats/import)
  - #461 — complete-profile gate reskin + record/[id] detail (+ CI fix)
  - #462 — ops (루틴) + wiki (지식) + trinity ("내 영역")
- 이번 세션 작성: #463 — `docs/wiki-system-upgrade.md` (graphify-informed plan). **이 핸드오프와 함께 main에 랜딩.**
- 테스트: `npm run verify` green (177 suites / 1418 tests). working tree clean.

### 결론: 레거시 → 딥스페이스 UI 전환 = 완료
정본 디자인(.dc.html)이 있는 모든 화면이 deep-space로 전환됨. 남은 레거시는 의도된
fallback(`*Legacy` 본문, `EXPO_PUBLIC_UI=legacy` 롤백 스킨)과 비-화면(oauth-callback
로더, redirect 스텁 jarvis/mbti/journal)뿐.

### 활성 인프라
- Web 라이브: https://simon-yhkim.github.io/2nd-B/ — `web-deploy.yml`이 `main` 푸시 시 배포, `EXPO_PUBLIC_UI=deep-space` 핀(딥스페이스가 라이브에 보임).
- Native(EAS): `eas.json` production `EXPO_PUBLIC_UI=deep-space` + `EXPO_PUBLIC_CHARACTER=fallback`(2026-06-19 cutover). 웹과 일치. **EAS production submit 전 실기기 QA 게이트** — 3d 캐릭터 전환은 그 후. legacy는 플래그 롤백 경로로 보존.
- Supabase wiki 스키마: `0022_wiki_rag.sql` + `0046`(relation_type/confidence) + `0047`(pgvector embedding + kNN RPC). prod apply 완료 — pgvector 설치됨.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **위키 STEP 1a — entity/concept 노드 materialize** (아래 상세) | medium | ⭐ "make it work" 본체. graph-stats가 자동으로 진짜 그래프 집계 |
| B | 위키 STEP 1b — deep-space `/wiki`·`/research`를 실데이터(graph-stats)로 배선 | medium | A 직후, 더미 제거 |
| C | 전 화면 실데이터 와이어링 — deep-space 화면 `// TODO` 더미를 실제 쿼리로 | large | 화면 단위 |
| D | Shell 패턴 화면 EN 다국어 (account/records/ops/wiki/trinity/insights/data 등 현재 KO 하드코딩) | medium | XPRIZE 국제 심사 대비 |
| E | 위키 STEP 2/3/4 (edge type+confidence → 경량 군집 → pgvector 임베딩) | large | `docs/wiki-system-upgrade.md`. STEP 4(임베딩) 마지막 |

### STEP 1a 상세 (다음 세션 시작점)
`src/lib/wiki/`에 `materializeGraphFromPhase1(userId, sourcePage, phase1)` 추가:
- `phase1.entities` → `kind:'entity'`, `phase1.concepts` → `kind:'concept'`:
  - `slug = slugForTitle(name)`; 빈/중복 skip
  - **get-or-create** (`getWikiPage` 후 없으면 `upsertWikiPage({..., source_id:null, body_md:''})`) — **기존 body 절대 덮어쓰지 않기**
  - `wiki_links` insert: source page → entity/concept page (중복 무시 `onConflict:'from_page,to_page', ignoreDuplicates:true`; self-link 금지)
- `src/lib/wiki/phase2.ts` `generateSourcePage()` 끝에서 호출
- 유닛 테스트: `src/lib/wiki/__tests__/queries.test.ts`의 supabase mock 하네스(`makeChain`/`tableRows`) 재사용
- 현 상태 근거: phase2는 source→source페이지 + concepts→tags만. entities/concepts를 노드로 안 만듦. `graph-stats.ts`는 god-node/통계 이미 계산(배선만 필요).

### 적용 중인 정책 (영구)
1. 화면 전환 패턴: `if (isDeepSpaceUI()) return <DeepSpace…/>; return <…Legacy/>;` — 레거시 본문 보존(특히 `check:constraints`가 string-scan하는 wiki.tsx/trinity.tsx/complete-profile.tsx).
2. 금지 마커: `gameboy-tokens`/`IslandArt`/`NavGraph`/`SecondBSprite`/`VillageScene`/`PremiumAppShell`/`signalMint`/`borderStart*`. (`PremiumToast`/`PremiumModal`은 금지 아님 — 오히려 제약이 요구.)
3. 토큰: sub-screen은 `@/theme/tokens`(Shell, 하드코딩 KO), dock-level은 `@/lib/theme/tokens` `deepSpace.*` + `home` i18n `ds.*`.
4. 검증은 **tail 금지, full `npm run verify`** (constraints가 화면 string-scan → 부분검증은 놓침; 1회 CI 실패 경험).
5. $0/mo, C1/C3/C9, C7(i18n parity), RLS 유지. PR은 main으로, 머지는 사용자 확인(또는 handoff).

### 핵심 파일 위치
```
docs/wiki-system-upgrade.md                        위키 4-STEP 계획 (graphify 분석)
src/lib/wiki/phase1.ts                             Phase1 추출 + mock
src/lib/wiki/phase2.ts                             Phase2 source→page (← STEP 1a 확장 지점)
src/lib/wiki/queries.ts                            upsertWikiPage/getWikiPage/syncWikiLinks/getBacklinks
src/lib/wiki/graph-stats.ts                        god-node/통계 (배선만)
src/screens/deepspace/DeepSpaceDesignScreens.tsx   Shell-패턴 deep-space 화면 (더미)
src/components/deep-space/DeepSpaceViews.tsx        dock-level Views (더미)
src/lib/ui-mode.ts                                 isDeepSpaceUI()
design/*.dc.html                                   디자인 정본
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
cat docs/wiki-system-upgrade.md
# A 작업(STEP 1a): src/lib/wiki/phase2.ts + materialize 함수 + 테스트
```

---
## 2026-06-16 (cont.4) / 전체 앱 총망라 핸드오프 레퍼런스 7종 (docs/handoff/) + IDEN main 머지 완료 (생각정리 출발점)

### 어디까지 왔나
- main HEAD: `9cf57cf` (IDEN UI #398 squash-merge 결과; 이 핸드오프 머지 후 갱신됨)
- 이번 세션 머지된 PR: **#396** (AI-OS Personal Context Layer - §1 ingest gate + §6 export pack + IDEN export format), **#398** (IDEN identity export screen - copy/share .iden + web CV sheet). **#395 closed** (superseded by #396).
- 두 main 배포(web-deploy / GitHub Pages) green. `npm run verify` 로컬 green (159 suites / 1325 tests; IDEN 46).
- working tree clean. 직전 작업 브랜치 `claude/iden-ui` (머지됨).

### 이번 세션 산출물 - 생각정리의 기반 (docs/handoff/ 에 영속화)
전체 앱을 코드 기준 전수 조사한 'Claude Design 핸드오프' 레퍼런스 7종. **`docs/handoff/master-handoff.html` 부터 열 것.**

> ⚠️ **이 7종은 2026-06-16 스냅샷 — rev2→Material 3 마이그레이션(2026-07-01)과 개념 통합 이전 상태다.** 현행 정본 개념/디자인은 이 파일 맨 위 최신 블록 + `docs/CONCEPT.md` · `docs/PRD.md` · `docs/REV2-MIGRATION.md` · `docs/CONSTELLATION-DESIGN.md` · `docs/ui-audit/`. 특히 `design-context.md` · `design-system.html` 는 legacy(Cosmic Pixel / Soul Core / Pattern Core ×5) 스킨 기준이니 **현행 디자인 지침으로 사용 금지**(각 파일 상단 SUPERSEDED 배너 참조).

| 파일 (docs/handoff/) | 내용 |
|---|---|
| **master-handoff.html** | 총람 - Q&A·앱개요·디자인시스템·화면39·모달·플로우·기능시스템·데이터/제약·에셋·방법론·i18n·레거시·핸드오프플래그 |
| app-feature-map.html | 39 화면 + 네비게이션 인접 리스트 + 고아/막다른 화면 |
| design-system.html | 시각 - 토큰·타입·컴포넌트·모션·anti-slop (다크 코스믹) |
| design-context.md | Claude Project knowledge 용 자족 디자인 스펙 (붙여넣기용) |
| design-legacy-timeline.html | 디자인 진화 (sky-blue→Cosmic→deep-space; Paper/Pine 미문서화 팔레트 발견) |
| methodology-map.html | 자기분석 런타임 방법론 (BFI/ECR/MBTI/audit/interview/ESM + 엔진 v1; TIPI 레거시) |
| methodology-architecture.html | 방법론 설계/연구 레이어 (Brain Trinity 출처 + v0.2 4-Layer/7-Engine + 569 참조 + 구축vs설계 갭) |

### 다음 작업 큐 (생각정리 → 우선순위화 대상)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | master-handoff.html 열어 '생각정리' - §12 핸드오프 플래그 우선순위화 | small | ⭐ 사용자 본 목표. 결정 후 아래로 분기 |
| B | 자기이해 별자리(북두칠성 7-star, `src/lib/constellation`) 화면 디자인·구현 - 미설계 통째 기능 | medium | ★ 가장 큰 미설계 |
| C | 앱 셸 2종 정본 확정 ✅ 2026-06-17 결정: deep-space=정본(코드 기본값), gameboy=명시적 legacy 롤백. 라이브는 셸 완성(A1/A3/A4/A5)까지 legacy 핀(D12) | small | 결정됨 |
| D | 화면 상태 불균등 보강 (평가화면·/data·/plans·/profile 빈/에러 프레임) | medium | 디자인 일관성 |
| E | 챗 한도 업그레이드 모달 + 인앱 체크아웃(수익화) | large | prod 게이트 |
| F | 부채 정리: Paper/Pine 미문서화 팔레트, build.ts TIPI 주석 잔재, account-export·랜딩 placeholder | small | - |

### 적용 중인 정책 (영구)
1. 모든 LLM = `src/lib/llm/gemini.ts` 경유 (C1). 신규 hex 금지 - `semantic.*`/`cosmic.*` 토큰 경유.
2. 어휘 정책 (`src/lib/safety/lexicon.ts`) - 임상어 금지, 비임상 voice. DESIGN.md anti-slop (em dash·이탤릭·Inter 금지).
3. 푸시 전 `npm run verify` 필수. 화면/네이티브 변경은 `ANDROID_QA_GUIDELINES.md` 준수 + 기기 QA 게이트.
4. main push = web-deploy(GitHub Pages) 트리거. 마이그레이션 prod apply·gemini-proxy 배포는 별도 수동 (blast-radius).
5. 12 하드 제약 C1~C12 (docs/CONSTRAINTS.md). 3축(docs/VISION.md) - 새 기능은 어느 축인지 PR에 명시.

### 핵심 파일 위치
```
docs/handoff/master-handoff.html       총람 (생각정리 시작점)
docs/handoff/*.html · design-context.md  레퍼런스 7종
DESIGN.md · docs/VISION.md             디자인·세계관 정본
src/lib/theme/tokens.ts                디자인 토큰 (src/theme/tokens.ts = 미문서화 Paper/Pine 팔레트)
src/lib/iden/                          IDEN 기능 (이번 세션 완성)
src/lib/persona/build.ts               추론 엔진 v1 (TIPI 주석 잔재)
src/lib/constellation/                 북두칠성 별자리 (미설계 화면)
```

### 검증
```bash
npm ci --legacy-peer-deps && npm run verify   # 159 suites / 1325 tests
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# docs/handoff/master-handoff.html 를 브라우저로 열어 '생각정리'(A 작업) 시작
```

---
## 2026-06-16 (cont.3) / IDEN 정체성 내보내기 포맷 + CV 렌더러 (스키마 구동, verify green, PR #396)

### 무엇을 / 왜
- **IDEN** = 사용자의 정체성을 하나의 포터블 파일(`.iden`)로. *AI가 읽는 데이터 + 사람이 보는 이력서* (한 데이터, 두 독자). VISION 축 (2) 개인 비서 기반.
- PR #396의 **§6 Personal Context Pack과 같은 축** — IDEN 뷰어는 그 포터블 컨텍스트를 사람이 읽는 형태로 렌더한 것. 나중에 합류 가능.
- 디자인 반복: 시안 A/B/C(코스믹·이력서·카드) → "너무 AI스럽다" → CV화(v2) → "그래프 아쉽다" → 그래프 복원(D/E) → **E(2단 CV) 확정**. 영어 정본, A4 인쇄 우선, 단색 액센트, Soul Core는 작은 마크만, AI 슬롭 제거.

### 구현 (이번 세션)
- `docs/IDEN-SPEC.md` — 포맷+뷰어 스펙: 스키마 구동 필드 + `viz` 매핑(radar/bar/donut/node-graph/badge/tags/list/stat) + provenance 신뢰 레이어 + `.iden` 머신블록(YAML) + 제약 훅(C1/C9/C3, lexicon) + i18n(C7). §8 결정 반영, §9 구현 현황.
- `src/lib/iden/` — `types.ts`(IdenDoc/IdenField/IdenSource/Viz, discriminated union) / `render-html.ts`(`renderIdenHtml(doc,{locale})` 순수, viz 디스패치, rail/main/both 배치, 인라인 SVG, 필드별 provenance, AI요약 "AI-generated interpretation"로 분리) / `sample.ts`(SAMPLE_IDEN, EN+KO) / 테스트 9.
- 색은 **theme 토큰만** (`lightCosmic` paper/ink + `cosmic` accent/core), 반투명은 SVG `fill-opacity` → **새 hex literal 0개**.
- `docs/iden-mocks/` — `iden-E-twocol.html`(확정) · `iden-D-editorial.html`(대안) · `iden-rendered.html`(실제 renderIdenHtml 출력).

### 상태
- **`npm run verify` green** — 156 suites / 1288 tests (IDEN 9 추가). working tree clean.
- PR #396에 누적 (base = `claude/ai-os-architecture-ul1uy0`, 미머지 draft). 작업 브랜치 = `claude/korean-greeting-rja3uh`.
- 결정(v0.1): Big Five **5축 전부**, 코어 **5개**, AI 요약 **포함**. 필드셋·코어수는 *변경 가능* — 스키마 구동이 흡수.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | `serialize.ts` — IdenDoc → `.iden` 텍스트(머신블록 YAML + body + 요청 placeholder). AI가 읽는 절반 | small | ⭐ 렌더러의 짝, 포맷은 SPEC §2에 확정 |
| B | `buildIdenDoc()` — Supabase 데이터 → IdenDoc. §6 context-pack/persona와 연결 | medium | 실데이터 연결 |
| C | IDEN 뷰어 앱 연결 — wiki/data 화면 export(WebView/다운로드/PDF) | medium | 기기 QA 필요(ANDROID_QA) |
| D | radar 라벨 풀네임/접근성 (현재 5자 약어) | small | 폴리시 |

### 적용 중인 정책 (영구)
1. 작업은 `claude/korean-greeting-rja3uh`. main 직접 push 금지, 항상 PR.
2. **PR 자동 머지 금지**(전역). 핸드오프 PR도 자동 머지 안 함 — 사용자 승인 시 머지.
3. em dash 금지(DESIGN.md+anti-slop), 임상어 금지(`src/lib/safety/lexicon.ts`), 컴포넌트 hex 금지(theme 토큰 경유).
4. 푸시 전 `npm run verify` 필수.

### 핵심 파일 위치
```
src/lib/iden/render-html.ts          렌더러 (renderIdenHtml) — 다음 작업 시작점
src/lib/iden/types.ts                IdenDoc 스키마
src/lib/iden/sample.ts               SAMPLE_IDEN 더미
src/lib/iden/__tests__/              렌더 계약 테스트 9
docs/IDEN-SPEC.md                    포맷+뷰어 스펙 (§2 .iden 포맷, §9 현황)
docs/iden-mocks/iden-E-twocol.html   확정 디자인
src/lib/wiki/context-pack.ts         §6 연결점 (같은 축)
```

### 검증
```bash
npm run verify            # 전체 게이트 (156 suites / 1288 tests)
npx jest src/lib/iden     # IDEN 렌더러만
```

### 다음 세션 시작하는 법
```bash
git fetch origin claude/korean-greeting-rja3uh && git checkout claude/korean-greeting-rja3uh && git pull
cat docs/HANDOFF.md       # 이 블록
# A 작업(serialize.ts)부터 시작
```

---
## 2026-06-16 (cont.2) / §6 Personal Context Pack (내보내기 2층 재설계) — moat 구현 (verify green, PR #396)

### 무엇을 / 왜
- **축**: (1) 알아가기의 출력 + (2) 개인 비서 — AI-OS §6 "내보내기 = 제품의 해자(moat)". 로드맵 #3(★★★, "심사 차별점", 사용자 핵심 우려). §1 다음으로 가장 가치 높고 **외부 게이트 없이 자율 완결 가능**한 단위라 선택.
- 기존 `export.ts`는 §6가 *틀린 접근*이라 지적한 "큰 단일 덤프". 이를 **2층 Personal Context Pack**으로 업그레이드.

### 구현 (`src/lib/wiki/context-pack.ts`, 순수 + 페처)
- **Layer 1 헤더(라우터/색인)**: SKILL.md/AGENTS.md 프레이밍(YAML frontmatter + 헤딩). identity(이름·한줄·반복 패턴) + **"사용 규칙"(맨 위)** + 색인(무엇이 들어있는지 + 카운트 + 반복 주제 태그). **Gemini Gems 4K 안에 graceful degrade** — 헤더 단독으로 동작.
- **Layer 2 상세**: 위키 페이지/소스/기록 전문 (export.ts `formatPage/formatSource/formatRecord` 재사용 — export로 노출만, 동작 변화 0).
- **`full` = 헤더 + 상세 + 맨 끝 "## Your task" placeholder** → Anthropic query-at-end(+30%) 충족. 규칙은 위, 세션 요청은 맨 아래.
- 어휘 lexicon-clean(임상어 0, "자기 이해와 성장" voice). EN/KO. `fitsHeaderOnly`로 Gems/CustomGPT 한도 적합 보고.
- `composeContextPack`(순수) + `exportContextPack(userId)`(페치+합성). identity는 선택 — 없으면 안전 폴백(테스트됨).
- 테스트 10개: 규칙-위치/query-at-end/헤더 자족성/Gems 4K 적합/identity weaving/색인/records opt-in/빈 데이터 폴백/KO/lexicon-clean.

### UI 연결 (안전 — 텍스트 내용만 변경)
- `src/app/wiki.tsx` `handleExport`: 사용자-facing export를 `exportUserWiki().prompt` → **`exportContextPack().full`** 로 스왑. records 포함 유지(pre-delete 백업 의도). 구조/레이아웃/라이프사이클 변화 없음(ANDROID_QA 안전). **chat RAG 스냅샷(conversation.ts/recommend.ts)은 exportUserWiki 그대로** — 영향 없음.

### 상태 / 남은 것
- **`npm run verify` green** — 1279 tests / 155 suites. working tree clean. PR #396에 누적.
- **후속(작은 자율)**: identity 브릿지 — PersonaCard/self-portrait(who/forWhom/goal)에서 `PackIdentity` 구성해 헤더를 실제 정체성으로 채우기. 현재는 graceful 폴백.
- **후속(UI·i18n·QA)**: `/data`나 `/wiki`에 "Context Pack" 별도 버튼 + 다운로드(.md)/공유 + i18n 키. 기기 QA 필요라 전용 패스 권장.

---
## 2026-06-16 (cont.) / §1 인제스트 게이트 A·B·C·E + D-core 완료 (verify green, PR #396)

### 어디까지 왔나
- 작업 브랜치 **`claude/korean-greeting-rja3uh`** (이전 세션 `claude/ai-os-architecture-ul1uy0`를 fast-forward로 흡수 → 동일 컨텍스트) → **PR #396 (draft)**, base = `claude/ai-os-architecture-ul1uy0`(#395)로 스택 → diff = §1 증분만. 머지는 Simon.
- **A** `src/lib/ingest/dedup.ts` — 순수 dedup 프리미티브. `contentHash()`(post-scrub 64-bit djb2+sdbm 멱등키, C2) + `minhashSignature`/`estimateSimilarity`/`lshBandKeys`(16밴드)/`isNearDuplicate(0.8)`. `mulmod` 16-bit split로 2^53 safe. 결정론적. 테스트 20.
- **B** `db/migrations/0044_ingest.sql` — `sources.{content_hash,relevance_score,dedup_of}` + partial UNIQUE(user_id,content_hash)로 exact-dedup을 **DB 불변식**화 + `ingest_log` append-only 드롭 원장(exact/near/low_relevance/schema_invalid/policy_block; owner RLS). **로컬 ephemeral PG16에서 44개 전체 시퀀스 적용 + 재적용 idempotent 검증** (supabase-dry-run.yml 재현). check:constraints green.
- **C (+wiring)** `src/lib/ingest/gate.ts` pure `decideIngest`(exact→near→relevance) + 주입식 `runIngestGate`(테스트 9). **capture 배선 완료**: `captureFromMarkdown`이 업로드 전 dedup 실행 — exact dup = **멱등 저장**(기존 행 반환, 업로드·insert 안 함, `deduped:"exact_duplicate"`), near dup = 저장하되 `dedup_of`로 survivor 링크(maybe-distinct 클립 silent 폐기 안 함). `gate-supabase.ts`(findCandidates = exact-hash + LSH band overlap, recordDrop), 0044에 `dedup_signature int[]`/`dedup_bands text[]` + GIN 추가. capture 테스트 2 + gate-supabase 테스트 3.
- **E (A5 critical)** `src/lib/safety/ingest-policy.ts` — 3자 클리핑 안전정책을 1인칭 크라이시스 라우팅과 **분리**. crisis 마커는 탐지→`quarantine` 태깅만, **핫라인·crisisRouting·crisis_events 구조적 노출 불가**(결과 타입에 hotline 필드 없음). 자살예방 기사 클리핑 회귀 테스트 포함. 테스트 4.
- **D-core** `src/lib/ingest/pii-scrub.ts` — 순수 PII 정규식 스크럽 + 가역 토큰화(email/KR-RRN/card[Luhn]/phone/ipv4). `scrubPii`/`restorePii`/`hasPii`, 결정론적. 테스트 10.
- 상태: **`npm run verify` green** — 1269 tests / 154 suites. working tree clean.

### 남은 작업 (전부 외부 게이트 — 배포/prod/멀티세션. 코드로 자율 완료 가능한 §1 표면은 끝)
- **D-wiring (배포 게이트 = Simon)**: pii-scrub 로직을 **`gemini-proxy/index.ts`(Deno, 서버 egress = A2 trust boundary)에 포팅** + LLM NER 패스(allowed model 1회) + `gemini-proxy` 재배포. ⚠️ live LLM 경로(스펜드캡/C3 감사/crisis-scan)라 blind 반쪽 수정 금지. pii-scrub.ts가 검증된 순수 코어.
- **B-apply (prod 게이트 = Simon)**: 0044 prod `apply_migration` (0044는 dedup_signature/dedup_bands/GIN 포함). prod 적용 전엔 capture가 dedup 컬럼을 써도 prod 스키마에 없으면 insert 실패 → **0044 apply가 capture dedup 라이브의 선행조건**.
- **relevance gate @ phase1 (소)**: phase1이 `keep=false`/저관련을 산출해도 아직 드롭 안 함. `decideIngest`의 low_relevance 경로를 phase1/promote 결과에 연결 + `ingest_log` 기록. (gate 코어는 이미 지원, 배선만.)
- **F** §2 pgmq 큐 — 설계가 "한 세션엔 안 들어감 → 멀티세션/worktree" 명시. 벌크 전제, 동기 단건 MVP엔 불필요.

### 다음 세션 시작하는 법
```bash
git fetch origin claude/korean-greeting-rja3uh && git pull origin claude/korean-greeting-rja3uh
cat docs/HANDOFF.md
npm ci --legacy-peer-deps && npm run verify
# 자율 가능한 §1 코드 표면 완료. 남은 건 배포(D)·prod apply(B)·멀티세션(F) — Simon 게이트.
# 작은 자율 후속: relevance gate를 phase1 결과에 배선.
```

---
## 2026-06-16 / AI-OS Personal Context Layer 설계 + §1 인제스트 첫 증분 (phase1 스키마 확장)

### 어디까지 왔나
- 작업 브랜치 **`claude/ai-os-architecture-ul1uy0`** → **PR #395 (draft)**. main 대비 3 커밋 ahead. 머지는 Simon (자동머지 안 함).
- **설계 정본 추가**: `docs/AI-OS-ARCHITECTURE.md` — Karpathy "second brain→AI OS" 영상 + deep-research 5트랙 근거로 7개 빌드 블록(§1 클리핑 정규화 ~ §7 SPL 루프) + 갭 분석 + 우선순위 로드맵. `/plan-eng-review` §1 완료(11 findings + outside voice, 리포트 문서 하단).
- **§1 첫 증분 (구현, verify green)**: `src/lib/wiki/phase1.ts` 스키마 확장 — `Phase1Result`+`PHASE1_SCHEMA`에 `category`(VillageId)·`tags`·`relevance`·`keep` 추가. 관련성을 별도 Gemini 호출 없이 같은 패스에 흡수. `tags`는 생성 후 `containsForbiddenLexicon` 필터(C3). 신규 필드 전부 optional = 하위호환. 테스트 5개(`__tests__/phase1.test.ts`).
- **SimonKWiki file-back**: PR #6 (draft) — T-020(AI-OS 설계 원칙), M-021(요청 레이어 오매핑), M-020 재발(한국어 임상어 "prescribe"류 lexicon — literal 토큰은 문서에도 안 적음).
- 테스트 상태: **verify + lint green** (CI, PR #395 HEAD `9731229`). working tree clean.

### 활성 인프라 (이번 세션 변경 없음)
- Supabase `zoacryukmdeivmolvyhj`, gemini-proxy prod **v12** (직전 핸드오프와 동일 — 이번 세션은 코드/문서만, 배포 없음).
- repo 마이그레이션 현재 **0043**까지. 다음 인제스트 마이그레이션 = **0044** (설계 문서엔 0044로 정정 반영됨).

### 다음 작업 큐 (§1 남은 증분, 순서대로)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | ✅ **완료** — `src/lib/ingest/dedup.ts` exact-hash + MinHash-LSH (순수, 테스트 20개) | small | 위 최신 섹션 참조 |
| B | ✅ **완료** — `db/migrations/0044_ingest.sql` (PG16 dry-run + idempotent 검증). prod apply는 Simon 게이트 | medium | 위 최신 섹션 |
| C | ✅ **완료 + capture 배선** — `gate.ts` + `gate-supabase.ts` + capture dedup (테스트 9+3+2) | medium | 위 최신 섹션 |
| D | ⏳ **코어 완료** — `src/lib/ingest/pii-scrub.ts` (테스트 10). 남은 것 = gemini-proxy 포팅 + LLM NER + 배포(Simon 게이트) | medium | Presidio 불가(Python), allowed model만 |
| E | ✅ **완료** — `src/lib/safety/ingest-policy.ts` A5 분리 (테스트 4) | medium | 위 최신 섹션 |
| F | ⏸️ **보류** — §2 pgmq 큐. 설계상 멀티세션/worktree, 벌크 전제 | large | 동기 단건 MVP엔 불필요 |

### 적용 중인 정책 (영구)
1. **§1-first + 풀 게이트 지금** — Simon이 eng review 권장(§4-first/연기)을 명시 override. accepted risk.
2. **정규화는 phase1.ts 확장** — 별도 `normalize.ts` 신설 금지 (DRY, A1).
3. **PR 자동 머지 금지 · 지정 브랜치(`claude/ai-os-architecture-ul1uy0`)에서만 작업** (이 핸드오프도 main 자동머지 안 하고 작업 브랜치에 영속).
4. **forbidden lexicon은 한국어 임상어도 포함** (예: "prescribe"류 단어 — literal 한국어 토큰은 문서에도 쓰지 말 것). 새 .md 작성 시 `npm run check:lexicon` 사전 점검 (M-020).
5. 모든 Gemini 호출 = `callGemini`(C1) → `classifyInput`(C9) → `ai_audit_log`(C3). 단 인제스트는 크라이시스 라우팅 분리 예정(E).

### 핵심 파일 위치
```
docs/AI-OS-ARCHITECTURE.md          §1~§7 설계 정본 + eng review 리포트 + T1-T7 tasks
src/lib/wiki/phase1.ts              §1 정규화 (이번 세션 확장)
src/lib/safety/classifier.ts        classifyInput(로컬) + containsForbiddenLexicon
src/lib/safety/lexicon.ts           FORBIDDEN_TERMS + LEXICON_SCAN_ALLOWLIST
src/lib/graph/relatedness.ts        VillageId + VILLAGE_LABEL (category enum 정본)
supabase/functions/gemini-proxy/    LLM egress (200/day cap, MODELS_ALLOWED, MAX_USER_LEN=8000)
```

### 검증
```bash
npm run verify    # lint + type-check + i18n + lexicon + LLM boundary + constraints + jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin claude/ai-os-architecture-ul1uy0 && git pull origin claude/ai-os-architecture-ul1uy0
cat docs/HANDOFF.md
# 다음 작업 큐 A (dedup.ts) 부터 시작
```

---
## 2026-06-04 (cont.) / gstack 갱신 + L/I 위생 PR #206 + L8 미성년 라우팅 + gemini-proxy v11(M6) 배포

### 어디까지 왔나
- 작업 브랜치 **`claude/sharp-brahmagupta-r29oW`** -> **PR #206 (draft, CI green)**. 머지는 Simon (draft 유지, 자동머지 안 함).
- **gstack** v1.52.2.0 -> **v1.55.1.0** 업데이트 (telemetry 동의문 정확화 + gstack-slug 캐시 새니타이즈, /sync-gbrain 파괴적-op 가드, headed 브라우저 크래시루프 수정 등).
- **PR #206 커밋 2개**:
  - `673b0d5` **L/I 위생 7건** (감사 체크박스가 낡아 HEAD 대조로 실제 열린 것만): markSourceIngested user_id 스코프, delete-account 주석 정정(ai_audit_log 는 0011 로 ON DELETE SET NULL = 감사증거 보존, cascade 아님), check-constraints C5 공백-허용 정규식, check-i18n 배열 deep-compare, index.tsx 데드 스타일 6개 제거, common.json `_meta` 제거(양 로케일), ageInYears 주석.
  - `eade59a` **L8(안전)**: `minor` 플래그를 phase1(runPhase1)/clipper(classifyClipper)/propose(proposeClipperTemplate) 의 callGemini 경로에 전달 -> 미성년 위기 hotline(KR 1388) 라우팅 복구. 화면(inbox/wiki/capture)에서 `AuthContext.isMinor` 전달. (interview/OCR 패턴과 동일.)
- **prod gemini-proxy 배포: v10 -> v11(M6) -> v12(F)**. v11 = M6 fail-closed (스펜드 RPC 비-cap 에러 시 유료호출 차단 503, RPC-missing(PGRST202/42883)만 예외 통과 + 알림). v12 = F CORS (비허용 origin 에 `ACAO: null` 대신 헤더 생략; `corsHeaders` 헬퍼, allowed origin 만 echo). 둘 다 정본 소스 검증 후 MCP 배포 -> re-fetch + 로그 재검증, v10/v11 롤백본 보관.

### ⚠️ 활성 인프라 변경 (다음 세션 주의)
- **gemini-proxy 는 이제 prod v12** (M6 + F CORS 반영). 직전 핸드오프의 "M6 미배포" 큐 = **닫힘**, F(CORS) 도 배포 완료. prod == repo 소스(`b1ee5db6`).
- 나머지 인프라(Supabase `zoacryukmdeivmolvyhj`, migration 0034-0040, delete-account v3)는 직전과 동일. verify **821/821 (91 suites)** green.

### 감사 체크박스 정리 (중요)
- `docs/AUDIT_2026-06-03.md` 의 LOW/INFO **체크박스는 낡음** (rounds 4-6 + GPT 코워크가 대부분 닫았으나 미갱신). HEAD 대조 검증: **A,C,D,E,H,K,N,Q,R,T,U,L11,L12 = 이미 닫힘**. #206 이 나머지 순수-코드 건 처리. L8 도 이번에 닫음.

### 다음 작업 큐 (전부 NON-BLOCKING)
| # | 작업 | 게이트 | 비고 |
|---|---|---|---|
| M5 | buildPersona 마운트마다 uncached Gemini -> 캐시+무효화 | 기기 QA | 코어 화면 회귀 위험, 전용 PR |
| M7 | 스펜드캡 call수 -> token cost 가중(p_units) | DB 마이그+prod apply | non-critical (call 캡으로 $0/mo 충분) |
| S | memorized_patterns.summary near-raw 저장 -> 범주형 신호 | 스키마/제품 결정 | 프라이버시 |
| I1 | 프라이버시 토글 7/8 inert -> 실제 와이어링 | 제품 결정 | external_analytics 만 동작 |
| 운영 | `supabase/migrations/` <-> `db/migrations/` 동기화 | ops | CI 는 db/migrations 적용 -> 안 깨짐. 신중히 |
| 디자인 | G(NavGraph rgba), I/J(TierIcon imagine 잔재), V(radius.full=9999 pill), capture rgba/hashtag chip | **GPT 담당** | tokens/그래프/capture 스타일 |
| 운영자 | `SUPABASE_ACCESS_TOKEN`(엣지 byte-perfect CLI), GA4/Clarity ID, Apple/Kakao Providers, Naver creds, 출시전 `EXPO_PUBLIC_FORCE_TIER=off` | Simon | go-live |

### 🤝 GPT 코워크 충돌 주의
- 이번에 **`src/app/capture.tsx`** 를 Claude 가 수정(L8 로직 라인: classifyClipper/proposeClipperTemplate 호출에 `isMinor === true` 추가) -- GPT 의 capture 디자인 항목(rgba/hashtag chip)과 **같은 파일**. 머지 전 충돌 주의.
- `src/app/inbox.tsx`, `src/app/wiki.tsx` 도 각 2줄(useAuth 디스트럭처 + runPhase1 호출) 수정.

### 정책 (직전과 동일, 영구)
- branch-first, **draft PR (자동머지 금지 -- Simon 이 머지)**, prod 배포는 명시 승인 + 적용 후 재검증, 기존 에셋/타인작업 삭제 금지.

---
## Earlier -- 2026-06-04 / 재감사 4~6라운드 PERFECT 수렴 (HIGH/MED 전부 닫음)

### 어디까지 왔나
- main HEAD: `0d4914f` (이 핸드오프 머지 후 갱신). verify **821/821 (91 suites)** green, working tree clean.
- 이번 세션 머지 PR (전부 CI green -> squash 자동 머지):
  - **#199** 재감사 round 3: 2 HIGH + 3 MED (C10 미성년 lock 우회, C3 audit 위조, 무프로필 LLM 게이트, 삭제 Storage 페이지네이션, callGemini 출력 red-swap) + migration 0038
  - **#200** `0039` log_ai_audit anon/service_role EXECUTE 회수 (최소권한)
  - **#201** 재감사 round 4: 4 HIGH (H1 A5 시맨틱 출력분류, H2 users INSERT 에스컬레이션 가드, H3 crisis_events RPC, H4 direct-egress 캡) + migration 0040
  - **#202** round 4 MED: M1 미성년 애널리틱스 서버게이트, M2 HIBP 유출 비번 검사, M3/M4 미성년 hotline 전달, M6 프록시 스펜드캡 fail-closed
  - **#203** round 5: H4-residual (safety.ts getFlashClient 의 3번째 uncapped live API-key egress 차단)
- **감사 루프 수렴**: round 4(43 agents) -> 5(12 agents) -> 6(5 agents, 확정). **round-6 verdict = PERFECT ✅**: perfect bar(H1-H4 + M1-M2) 달성, 소스 대조로 H1-H4/M1-M4/M6/H4-residual 전부 hold 확인, uncapped live Gemini egress 0개, 신규 CRITICAL/HIGH/MED 0개. 감사 원장: `docs/AUDIT_2026-06-03.md` (round 4 verdict 추가됨).

### 활성 인프라
- Supabase project **`zoacryukmdeivmolvyhj`** (2nd-brain, ap-northeast-2).
- Prod 마이그레이션 적용+검증됨: `0034`~`0037`(이전), **`0038`**(minor_tier 서버전용 + clamp OLD-tier + log_ai_audit RPC + audit INSERT 정책 제거), **`0039`**(log_ai_audit anon/service_role 회수 -> authenticated만), **`0040`**(block_self_tier_insert BEFORE INSERT 가드 + log_crisis_event SECURITY DEFINER RPC). 전부 execute_sql 로 함수 본문/정책/grant 재검증 완료. (H3 는 prod 에서 SET ROLE authenticated 로 실삽입까지 검증, 합성행 정리됨.)
- Edge functions: **delete-account v3** (raw-clippings Storage 페이지네이션). **gemini-proxy v10** (⚠️ **M6 fail-closed 소스는 머지됐으나 prod 미배포** -- 아래 큐).
- 웹 빌드(repo Variables): `EXPO_PUBLIC_LLM_MODE=live` + `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION=true` (프록시 경유, 캡 적용). 키 없는 공개 빌드는 mock -> 분류기 lexicon-only.

### 다음 작업 큐 -- 전부 NON-BLOCKING (round-6 가 perfect bar 밖으로 명시). perfect 는 이미 달성.
| # | 작업 | 크기 | 비고 |
|---|---|---|---|
| 배포 | **gemini-proxy 재배포** (M6 fail-closed 소스 반영) | small | `SUPABASE_ACCESS_TOKEN` 받으면 CLI byte-perfect, 아니면 get_edge_function fetch->swap->deploy. exposure 좁음(스펜드 RPC 에러시에만 fail-open) |
| M5 | buildPersona 마운트마다 uncached Gemini 호출 -> 캐시+무효화 | medium | 성능/비용 (캡으로 bounded; correctness 아님) |
| M7 | 스펜드캡이 call 수만 셈(토큰 cost 아님) -> p_units 가중치 | medium | call 캡으로 충분한 $0/mo 백스톱 |
| L/I | `docs/AUDIT_2026-06-03.md` 의 L1-L12 + I1-I2 (search_path 핀, anon EXECUTE 회수 잔여, consent_records 위조, mock-mode swap 대칭, classifySafety confidence clamp, crisis_events 보존정책, em-dash/hex-literal 등) | small each | LOW/INFO 위생+문서 |
| 운영 | migration vendoring: prod 의 0028-0040 이 `db/migrations/` 엔 있으나 `supabase/migrations/` 엔 knowledge_sources 만 -- CLI 디렉토리 동기화 | small | ops 갭, 코드결함 아님 |
| 운영자 | `SUPABASE_ACCESS_TOKEN`, GA4 `G-XXXX` + Clarity ID, Apple/Kakao Supabase Providers, Naver creds + `ENABLE_NAVER_OAUTH=true`, 출시전 `EXPO_PUBLIC_FORCE_TIER=off` | small | go-live |

### 적용 중인 정책 (영구)
1. **PR/CI/머지 자동화**: PR -> `gh pr checks --watch` -> green이면 `gh pr merge --squash --delete-branch`.
2. **전부 자율 진행** (보안/법적/과금 포함). 단 prod DB migration/edge 배포는 적용 후 재검증(소스 re-fetch + execute_sql/verify).
3. **co-work-with-GPT**: merged main 재검증.
4. 기존 에셋·타인 작업 삭제/되돌리기 금지. 시크릿 입력/계정 로그인/OAuth 승인은 사용자가 직접.
5. **branch-first**: main 직접 커밋 금지 (이번 세션 1회 실수 -> branch 이동 + main rewind 로 복구; push 안 됨).
6. **새 SECURITY DEFINER 함수는 `REVOKE FROM anon` 명시** (Supabase 기본 grant 가 anon 에도 EXECUTE 부여; 0038->0039 교훈, memory 에 기록).

### 핵심 파일 위치
```
src/lib/llm/gemini.ts            callGemini/callAdvisor; assertDirectEgressAllowed (H4); 출력 red-swap (H1/A5)
src/lib/llm/safety.ts            classifySafety + getFlashClient (H4-residual: live&&!Vertex -> null)
src/lib/supabase/audit.ts        insertAiAuditLog -> log_ai_audit RPC (A2)
src/lib/supabase/crisis-events.ts insertCrisisEvent -> log_crisis_event RPC (H3)
src/app/_layout.tsx              IntroGate 루트 무프로필 게이트(A3) + AnalyticsConsentSync(M1)
src/lib/supabase/auth.ts         signUpWithEmail + isPasswordBreached HIBP (M2)
db/migrations/0038-0040          minor_tier/audit-RPC / anon-revoke / INSERT-guard+crisis-RPC
docs/AUDIT_2026-06-03.md         감사 원장 (round 1-6 추적 + 잔여 L/I 큐)
```

### 검증
```bash
npm ci --legacy-peer-deps   # node_modules 스테일 시
npm run verify              # lint+type+i18n+lexicon+llm-boundary+constraints(+Cost)+emdash+jest (821/821)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# perfect bar 달성됨. 위 "다음 작업 큐"(전부 non-blocking)부터: 권장 = gemini-proxy 재배포 -> M5/M7 -> L/I 위생.
```

---
## Earlier -- 2026-06-03 (eve) / 애널리틱스 + Android QA + 재감사 2라운드 + prod 배포

### 어디까지 왔나
- main HEAD: `c12774b` (이 핸드오프 머지 후 갱신). verify **808/808 (88 suites)** green, working tree clean.
- 이번 세션 머지 PR (전부 CI green → squash 자동 머지):
  - **#189** 최종 후보 v3 PNG 아트 wiring (cores + Pattern Data/Log; flag `EXPO_PUBLIC_USE_V3_ART`, 기본 off)
  - **#190** `0036` bump_gemini_spend 를 service_role 전용으로 잠금 (anon/authenticated EXECUTE 회수 — DoS 차단)
  - **#191** 애널리틱스: **GA4 + MS Clarity** 추가 (기존 `external_analytics` 프라이버시 동의에 게이팅, web-only, IP 익명화; PostHog 무동의 로딩 갭도 같이 닫음)
  - **#192** [HIGH] Advisor/interview edge 422 수정 + C3 callAdvisor 이중기록 dedup
  - **#193** `0037` XP 가드 NULL-safe (인증 유저의 total_xp 셀프쓰기 차단)
  - **#194** 계정삭제 false-success + OAuth 무프로필 라우트 게이트 (batch 1: capture/jarvis/audit)
  - **#195** classifySafety Flash 호출 감사 (native/Vertex C3 갭)
  - **#196** 재감사 round 2 (4 MED): delete-account FK(added_by)+Storage, OAuth 게이트 batch 2 (interview/import/persona/core-brain), proxy crisis-scan 채널 수정

### 활성 인프라
- Supabase project **`zoacryukmdeivmolvyhj`** (2nd-brain, ap-northeast-2).
- Prod 마이그레이션 적용됨: `0034`(award_xp 복구)·`0035`(gemini_spend_daily)·`0036`(spend RPC 권한잠금)·`0037`(XP 가드 NULL-safe). (prod는 이제 0037까지; 0034~0037 모두 이번 세션 적용)
- Edge functions 배포됨: **delete-account v2** (verified_by+added_by null + raw-clippings Storage 삭제), **gemini-proxy v10** (스펜드캡 + C3 서버감사 + responseSchema + crisis-scan은 `userText`만; 큐레이트 RAG는 `system`으로), oauth-naver v3 (탈취방지, `ENABLE_NAVER_OAUTH`로 꺼짐), oauth-kakao v3 (폐기/orphan — 정리 가능).
- 웹 빌드(repo Variables): `EXPO_PUBLIC_LLM_MODE=live` + `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION=true` (라이브, 프록시 경유).
- ⚠️ **edge fn 배포는 Supabase access token이 없어 MCP 인라인 전사로 진행**(v8/v9/v10, 매번 re-fetch 재검증). **`SUPABASE_ACCESS_TOKEN` 받으면 CLI 디스크 배포로 byte-perfect** 가능 → 전사 리스크 제거.

### 다음 작업 큐 — 재감사 round 3 verdict: **NOT perfect, 2 HIGH + 4 MED** (전부 adversarial 검증됨, task `wp0z9cbnn`)
> round 3는 round-2 수정 4건을 전부 confirm. 하지만 6건 추가 발견 (2건은 round-2 수정의 엣지 — 그래서 라우트 게이트는 per-screen whack-a-mole 대신 **root 공유 게이트** 권장). 아래 수정 → CI green 자동머지 → edge/DB 재배포 → round 4 재감사. perfect 될 때까지 반복.

| # | 작업 | 심각도 | 파일 / 수정 방향 |
|---|---|---|---|
| A1 | **C10 미성년 lock 우회**: minor_self 유저가 같은 UPDATE에 `minor_tier='adult'`를 셀프쓰면 `0033 clamp_minor_privacy_prefs`(NEW.minor_tier='minor_self' 분기)가 무력화 → 미성년이 high-privacy 탈출. minor_tier는 REVOKE/block_self_tier_change 어디에도 없고 age-gate 트리거는 birth_date 변경 시에만 발동(0030). | **HIGH** | `block_self_tier_change`(0034/0037)의 보호 컬럼 집합에 `minor_tier` 추가(서버만 변경 허용), 또는 clamp를 `OLD.minor_tier` 기준으로. 새 migration 0038 + prod 적용. |
| A2 | **C3 위조**: `0011 audit_owner_insert`(authenticated INSERT, WITH CHECK user_id=auth.uid()만) → 클라가 ai_audit_log 행 위조/생략 가능. 프록시 server-write는 web edge 경로만 부분 완화. AUDIT_2026-06-03.md:153에 원래 MED로 기록됨(미해결). | **HIGH** | web은 이미 프록시가 service_role로 audit → 클라 INSERT 정책 제거 또는 SECURITY DEFINER RPC로 제약(zone 재계산). native/direct 경로 감사 경로 별도 설계. |
| A3 | **무프로필 OAuth → LLM** 누락 2화면: `inbox.tsx:77` + `wiki.tsx:164` (둘 다 runPhase1→callGemini, `!userId`만 게이트). fix #5/round-2가 또 놓침. | MED | **권장: `src/app/_layout.tsx`에 root 공유 게이트** (userId && hasProfile===false && route ∉ (auth) group → Redirect /complete-profile). per-screen 게이트 whack-a-mole 종료. (임시: inbox/wiki에 기존 패턴 게이트 추가) |
| A4 | **삭제 Storage 미완**: delete-account의 raw-clippings 정리가 `list({limit:1000})` 1페이지만 → 1000+ 클립 유저는 PII 잔존. round-2 수정의 엣지. | MED | offset 페이지네이션 루프로 prefix 전부 삭제. delete-account 재배포. |
| A5 | **출력 red 스왑 없음**: callGemini 출력 red-zone 미억제 → interview가 red 모델 출력을 그대로 렌더(`interview.tsx:128-131`, probe.zone 미확인). callAdvisor는 output-swap 있음. | MED | callGemini/nextProbe 출력 재분류 후 red면 스왑/억제 + 테스트(현재 미커버). |
| B | 운영자 값(사용자): `SUPABASE_ACCESS_TOKEN`, GA4 `G-XXXX` + Clarity Project ID, Apple/Kakao Supabase Providers, Naver creds + `ENABLE_NAVER_OAUTH=true` | small | go-live 차단 해제 |
| C | 출시 전 `EXPO_PUBLIC_FORCE_TIER=off` (현재 'brain'=전부 unlock) | small | 런치 체크리스트 |
| D | Android 라이브 Advisor end-to-end QA (이번엔 Expo Go 리로드로 못 함; 전 화면 렌더+v3 아트는 검증됨) | small | 선택 |

### 적용 중인 정책 (영구)
1. **PR/CI/머지 자동화**: PR 생성 → `gh pr checks --watch` → green이면 `gh pr merge --squash --delete-branch`. (사용자 지시 2026-06-03; global 의 no-auto-merge 를 이 repo에서 override)
2. **전부 자율 진행**: 안전 수정 + 보안/법적/과금 항목도. 단 prod DB 마이그레이션/edge 배포는 적용 후 재검증(소스 re-fetch + verify).
3. **co-work-with-GPT**: merged main은 신뢰하지 말고 재검증(verify + 필요시 prod 대조).
4. 기존 앱 에셋·다른 사람 작업 삭제/되돌리기 금지.
5. **시크릿 입력/계정 로그인/OAuth 승인은 사용자가 직접**; 공개값(anon key, GA4 ID, Naver client ID 등)은 Claude가 세팅 가능.
6. edge fn 배포 후 반드시 `get_edge_function`으로 배포 소스 재확인(인라인 전사 검증).

### 핵심 파일 위치
```
src/lib/llm/gemini.ts            callGemini/callAdvisor (C1/C3/C9 경계; edge=RAG→system, 엔트리→user)
src/lib/llm/safety.ts            classifySafety (Flash 분류기, 자체 감사)
supabase/functions/gemini-proxy/ 스펜드캡+C3감사+crisis(userText만 스캔) [prod v10]
supabase/functions/delete-account/ 진짜 삭제(cascade+Storage) [prod v2]
src/lib/analytics/index.ts       GA4+Clarity+PostHog+Sentry (external_analytics 동의 게이팅)
src/app/privacy.tsx              external_analytics 토글 → setAnalyticsConsent
src/app/{capture,jarvis,audit,interview,import,persona,core-brain}.tsx  hasProfile===false → /complete-profile 게이트
db/migrations/0034-0037          award_xp/spend/grant-lock/xp-guard (prod 적용됨)
docs/AUDIT_2026-06-03.md         감사 원장(원본 58 findings + 라운드 추적)
docs/V3_ASSET_BRIEF.md           GPT 에셋 브리프(아트 매핑 출처)
```

### 검증
```bash
npm ci --legacy-peer-deps   # node_modules 스테일 시
npm run verify              # lint+type+i18n+lexicon+llm-boundary+constraints+jest (808/808)
EXPO_USE_STATIC=true EXPO_PUBLIC_USE_V3_ART=true npx expo export --platform web   # 번들 빌드 확인
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(재감사 1라운드 더)부터: main 기준 멀티에이전트 confirming 재감사 → verdict
```

---
## Earlier -- 2026-06-03 / 3 PR 통합 머지 + Naver 취약점 수정 + 감사 루프 (HIGH 전부 닫음)

### 어디까지 왔나
- main HEAD: `9cb8ac2` (이 핸드오프 머지 후 갱신). 통합 main verify green **803/803 (87 suites)**.
- 이번 세션 머지 PR (전부 CI green + squash):
  - **#180** v3 PNG 에셋 wiring (flag-gated, 기존 clean PR)
  - **#181** 소셜 로그인 -- Email/Google/Apple/Kakao(네이티브) + Naver(엣지 fn). **머지 전 Naver 이메일-매칭 계정 탈취 취약점 수정**: find-or-create 를 stable `naver_id` 바인딩으로 바꾸고, 다른 로그인 수단이 이미 소유한 이메일이면 자동 링크 거부(409). state CSRF 는 클라(sessionStorage echo)에서 이미 처리됨 확인. 레거시 oauth-kakao 엣지 fn 폐기.
  - **#182** 감사 1차 배치 (0034 award_xp, 디자인 토큰, lexicon/emdash CI 가드). 제목 Conventional Commits 로 정정.
  - **#184** LLM 경계 배치 -- HIGH 스펜드캡 + 4 MED (아래)
  - **#185** 전체 계정 삭제 (HIGH, GDPR/PIPA)
  - **#186** 정합/안전 MED 배치
  - **#187** LOW 배치 (데드코드/주석/lint 룰)
- ⚠️ `git add -A` 가 로컬 아티팩트(`.claude/launch.json`, `.tmp_hq_pack/`)를 #181 머지 커밋에 잘못 포함시킴 -> untrack + `.gitignore` 추가로 정리(머지 전).

### 감사 진행 (docs/AUDIT_2026-06-03.md = 정본 트래커)
- **HIGH 3/3 닫음.** award_xp/0034(#182) · gemini-proxy 스펜드캡(#184) · deleteAllUserData 전체삭제(#185).
- **MED 대부분 닫음.** gemini image-drop·responseSchema 패리티 · proxy C3 감사로그 · crisis-terms 중복(jest 패리티) · oauth-naver 탈취 · signUpWithEmail orphan · consent-ledger await · 0002 주석 · check-constraints C6 양방향.
- **LOW 일부 닫음.** reset-project.js·dead auth fns 제거 · eslint C3 상대경로 import 차단 · 0012 hash 주석 · oauth-naver redirect_uri 주석.

### ⚠️ 배포 게이트 (operator -- Simon 확인/실행 필요)
코드는 main 에 있으나 **prod 반영은 별개**. 마이그레이션 apply + 엣지 배포가 필요:
1. **마이그레이션 0035** (`gemini_spend_daily` + `bump_gemini_spend` RPC) apply.
2. **gemini-proxy 재배포** -- 0035 적용 후라야 스펜드캡 + 서버 C3 감사로그 동작. (옵션 `GEMINI_DAILY_CALL_CAP`, 기본 500). 미배포여도 클라는 backward-compatible(앱 안 깨짐).
3. **delete-account 엣지 fn 배포** (`supabase functions deploy delete-account`) -- 미배포면 계정삭제는 클라 컨텐츠 wipe + signOut 만 수행하고 잔여 삭제는 로깅됨.
- `EXPO_PUBLIC_ENABLE_NAVER` + `EXPO_PUBLIC_NAVER_CLIENT_ID` + 서버 `ENABLE_NAVER_OAUTH` 는 전부 OFF -- Naver 자격증명 들어오면 켜기(구조는 완성).

### 🔸 Simon 결정 필요 (autonomous 안 함)
- **EXPO_PUBLIC_FORCE_TIER 기본값 brain->off 전환.** 지금 바꾸면 테스터가 보는 화면(전체 unlock)이 바뀜 -> 런칭 직전 결정 사안. 현재는 비-dev 빌드에서 경고만 출력하도록 함. **런칭/심사 전 체크리스트: =off 설정.**

### 다음 작업 큐 (남은 감사)
| # | 작업 | 크기 | 비고 |
|---|---|---|---|
| A | **buildPersona 캐싱** (MED) -- 매 mount/locale 토글마다 유료 Gemini 호출. signature 컬럼(마이그레이션) + locale 처리 필요. 코어 화면 회귀 위험 -> 전용 PR + 기기 QA 권장 | medium | 미착수(의도적 보류) |
| B | **0011 client-writable audit policy 제거** (MED) -- proxy 서버 감사로그 배포 확인 후라야 안전 | small | deploy-gated |
| C | LOW 잔여: NavGraph hex/tokens.ts pill 토큰화(디자인 -- GPT/Codex 충돌 위험, 조율 필요) · +html lang · capture i18n ternaries · mascot namespace · check-i18n 배열비교 · check-constraints C5 공백 · wiki markSourceIngested user-scope · common.json _meta · 0010 search_path · 0011 중복 트리거 | small~med | 디자인 토큰은 조율 후 |

### 적용 중인 정책 (영구)
1. 머지: feature 브랜치 -> verify green + CI green -> squash. PR 제목 Conventional Commits 필수.
2. **prod 인프라(마이그레이션 apply / 엣지 배포)는 항상 Simon 확인 후.** 머지 != 배포.
3. GPT/Codex 동시작업 -- 머지 전 항상 최신 main 재검증. 디자인 파일(NavGraph/capture/tokens) 동시편집 충돌 주의.
4. `git add -A` 금지(로컬 아티팩트 혼입). 변경 파일만 명시 stage.
5. C1~C12 + forbidden lexicon(`src/lib/safety/lexicon.ts`) + semantic 토큰만(hex/gradient/pill/em dash 금지).

### 검증
```bash
npm ci --legacy-peer-deps && npm run verify   # 803/803 (87 suites)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 큐 A(buildPersona 캐싱) 또는 배포 게이트(Simon 확인) 부터.
```

---
## 2026-06-02 / Worldview v-final 완결 + Soul Core v3 아트 wiring (플래그 게이트)

### 어디까지 왔나
- main HEAD: `f16a464` (이 핸드오프 머지 후 갱신)
- 이번 세션 머지 PR (전부 verify green + CI green + squash):
  - **#171** v-final 로직: 5계층(Soul Core -> 5 Pattern Core -> Pattern Data -> Log + Pattern Link), 마스코트 rename(Lulu->Lumen, Archi->Archon, Gadi->Relia, Momo->Foreman Momo, Lumi->Iris), SecondB Analytic/Divergent 모드, Pattern Link/crew 스켈레톤
  - **#172** Soul Core v3 에셋 팩 (Codex; #171과 reconcile -> 에셋만 net)
  - **#173** 공상-place + Vela 완전 제거(`/imagine`->Divergent redirect, 탭/wiki카드/노드 제거), 캐치프레이즈, Divergent soulViolet2 펄스, live Pattern Link 엣지 두께, CONTEXT.md, 네이밍 가드
  - **#174** v3 코어 아트, **#175** v3 마스코트 idle, **#176** v3 모모크루 (전부 플래그 뒤)
- 테스트: `npm run verify` green (85 suites / 797 tests). 빌드 게이트: `npx expo export --platform web` 성공.
- working tree: clean. gstack 1.52.2.0 -> 1.55.0.0.

### 활성 인프라
- Supabase prod `zoacryukmdeivmolvyhj` (마이그레이션 0028-0033, 14-17 self-consent 라이브)
- Web: GitHub Pages <https://simon-yhkim.github.io/2nd-B/> (web-deploy.yml, main push 자동)

### v3 아트 wiring 상태 (전부 `EXPO_PUBLIC_USE_V3_ART` 플래그 뒤 / 기본 OFF = 라이브 PNG 그대로)
- DONE: 코어(IslandArt) / 마스코트 idle(WorkerSprite) / 모모크루(CrewLayer + crew-layout)
- 인프라: react-native-svg-transformer + metro.config.js (*.svg -> 컴포넌트, web/native), src/types/svg.d.ts, src/lib/assets/soulcore-v3.ts (V3_CORE_ART / V3_WORKER_ART / V3_CREW_ART)
- TODO: 엣지 아트(PatternLink -> NavGraph 라이브 엣지) -- core graph 렌더 변경 = 회귀 위험, 기기 QA 후 권장
- 주의: 아직 아무도 기기에서 v3 아트 안 봄(플래그 OFF). 크기/위치 QA 필요.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | dev 빌드 `EXPO_PUBLIC_USE_V3_ART=true` -> 코어/마스코트/크루 기기 QA(크기·위치) | small | ⭐ 엣지/플래그ON 전 선행 |
| B | OK면 플래그 기본 ON (env.ts default 또는 eas/repo var) | small | A 후 |
| C | 엣지 아트 wiring (PatternLink -> NavGraph live edges) | medium | core-graph 회귀 위험, 플래그 게이트 유지 |
| D | 마스코트 프레임 애니 (현재 v3 정적 idle; sprite_sheet 프레임화) | medium | 선택 |
| E | 계정 완전삭제 RPC(auth.users) · 법무 카피 | medium | 법무는 사용자 입력 필요 |

### 적용 중인 정책 (영구)
1. 머지: feature 브랜치 -> verify green + CI green(verify + lint=PR제목 Conventional Commits) -> squash. PR 제목 `feat(...)/fix(...)/docs:` 필수.
2. 빌드 게이트: 에셋/metro/번들 영향 변경은 `npx expo export --platform web` 로컬 검증(verify는 Metro 미실행).
3. `EXPO_PUBLIC_FORCE_TIER=brain`(테스트 전체 unlock). 런칭/심사 전 `=off` 복원.
4. `EXPO_PUBLIC_USE_V3_ART` 기본 false. 기기 QA 후 ON.
5. 픽셀아트(public/assets/**)는 GPT 워크스트림 소유 -- 참조만, 생성/수정 금지.
6. 어휘: src/lib/safety/lexicon.ts 의 금지 임상어휘(목록은 그 파일 참조) 절대 금지 -- 임상/치료 register 회피, 자기이해/성장 register 사용.
7. main 직접 push 금지, force-push/rebase -i 금지.

### 핵심 파일 위치
```
src/lib/assets/soulcore-v3.ts        v3 SVG -> 컴포넌트 (코어/마스코트/크루)
metro.config.js                      svg-transformer + NativeWind
src/lib/env.ts                       EXPO_PUBLIC_FORCE_TIER / EXPO_PUBLIC_USE_V3_ART
src/components/art/IslandArt.tsx     코어 (flag -> v3)
src/components/art/WorkerSprite.tsx  마스코트 (flag -> v3 idle)
src/components/graph/CrewLayer.tsx   모모크루 (+ src/lib/graph/crew-layout.ts)
src/components/graph/PatternLink.tsx 엣지 골격 (+ src/lib/graph/pattern-link.ts) -- 라이브 미배선
docs/VISION.md(세계관 v-final) · DESIGN.md · CONTEXT.md   정본
public/assets/cosmic-pixel-v3-soulcore/docs/asset_mapping.md   v3 매핑표
```

### 검증
```bash
npm run verify
EXPO_USE_STATIC=true npx expo export --platform web --output-dir /tmp/exp   # 에셋/번들 변경 시
```

### 엣지 wiring 이어가는 법 (C)
```bash
git fetch origin main && git pull origin main
git checkout -b claude/v3-edge-wiring origin/main
# PatternLink.renderEdge 슬롯 + v3 엣지 SVG
#   (public/assets/cosmic-pixel-v3-soulcore/mobile-graph/edges/pattern_link_{far,mid,current,near}_320.svg)
# 를 NavGraph 엣지 렌더(AnimatedLine)에 EXPO_PUBLIC_USE_V3_ART 게이트로 통합.
# npm run verify && expo export -> squash merge.
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(기기 QA)부터
```

---
## 2026-06-02 (earlier) / 미성년 보호장치 B+C UI 머지 + A prod 적용 (14-17 라이브 오픈)

### 어디까지 왔나
- main HEAD: 이 핸드오프 머지 후 (직전 `fc45f86`)
- 이번 세션 머지 2 PR (둘 다 `npm run verify` green, CI green, squash):
  - **#159 (B)** 미성년 보호장치 UI — `/privacy` high-privacy 토글(8키, 14-17 잠금 / `long_term_memory`만 승격) + 가입 동의안내(`ConsentNotice`, sign-up + complete-profile, `recordConsentBestEffort`). 계약(prefs.ts / consent.ts) 배선.
  - **#167 (C)** 계정 관리 `/account` — DOB 정정(0030 서버 재검증) · 개인정보/동의 → /privacy 링크 · 계정삭제(데이터 erase + 로그아웃) · age-out = 라이브 `isMinor` 자동 해제.
- **A: prod 마이그레이션 0028 → 0032 적용 완료** (사용자 명시 확인 후) → **prod가 이제 14-17 self-consent 가입 오픈.** 적용 후 `get_advisors(security)` 점검 완료.

### ⚠️ prod 상태 변경 (중요 — GPT 동시작업자 주목)
- prod `zoacryukmdeivmolvyhj` 마이그레이션: **0027 → 0032**. `users`에 `account_status` / `minor_tier` / `privacy_prefs` 추가, 테이블 `guardian_consents`(deny-all) · `consent_records`(append-only) 신설. 서버 트리거 `enforce_user_age_tier`가 <14 거부 + minor_tier 도출 + 미성년 high-privacy 시드.
- 기존 2 성인 유저 → `minor_tier='adult'` backfill 완료 (users_active_has_tier 제약 통과로 확인).
- **이제 18+ 강제 아님. 14-17 가입 라이브.** B의 동의 UI / 프라이버시 토글이 main 배포돼 보호장치 동작.

### get_advisors(security) 결과 (적용 후)
- 신규 실질 위험 없음. `guardian_consents` RLS-no-policy(INFO) = 의도된 deny-all(0029). `consent_records`는 RLS+정책 정상.
- WARN `enforce_user_age_tier` search_path mutable — 기존 트리거 함수들(auto_judge_mode 등)과 동일 baseline 패턴. **후속 권장**: 연령 게이트 함수라 search_path 하드닝(0033 후보).

### 후속 작업 큐
| # | 작업 | 크기 |
|---|---|---|
| 1 | **법무 카피 확정** — 동의 문구 · `CONSENT/POLICY/TERMS_VERSION`(현 placeholder `2026-06-02`) · 국외이전 처리국가. `LEXICON_LAST_LEGAL_REVIEW` null | medium |
| 2 | **계정 완전삭제 RPC**(service_role/엣지) — 현재 C는 데이터 erase+로그아웃, `auth.users` 제거 미구현 | medium |
| 3 | **동의 철회 기록**(consent_records append) + **minor update 서버 강제**(변조 클라가 locked 키를 못 켜게 트리거/RLS) | medium |
| 4 | trigger 함수 search_path 하드닝 (0033) | small |
| 5 | **D 시각 QA**(기기/웹): /privacy 토글·잠금 · 가입 ConsentNotice(14-17 배너) · /account DOB·삭제 — 원격 컨테이너라 미수행 | small |
| 6 | guardian flow(under-14) — 별도 트랙(현재 <14 거부) | large |

### 핵심 파일 (이번 세션)
```
src/app/privacy.tsx                      high-privacy 토글 (B1)
src/app/account.tsx                      계정 관리 (C)
src/components/consent/ConsentNotice.tsx 가입 동의안내 (B2)
src/lib/auth/consent-selections.ts       동의 selection 게이트/매핑 (B2)
src/lib/supabase/consent.ts              recordConsent + recordConsentBestEffort
src/lib/supabase/privacy.ts              privacy_prefs fail-soft 읽기/쓰기 (B1)
src/lib/supabase/account.ts              fetch/updateBirthDate (C)
src/lib/account/dob.ts                   dobCorrectionStatus (C)
src/lib/privacy/prefs.ts                 키셋 + isPrivacyPrefEditable (minor 잠금)
db/migrations/0028~0032                  ★ prod 적용 완료
```

### 정책 (이번 세션 확정)
- **자동 머지 ON** (Simon, 2026-06-02): PR CI green 시 묻지 않고 squash merge → main 재검증.
- **prod 마이그레이션 적용은 여전히 명시 확인 필요** (안전 레이어가 강제; 이번엔 확인받고 적용함).

### 검증
```bash
npm run verify   # 769/769 (80 suites)
```

### 다음 세션 시작
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 후속 1(법무) / D(시각 QA) / 후속 2~4(삭제 RPC·철회기록·search_path) 중 선택.
```

---
## 2026-06-02 / Codex UI QA + premium consistency pass

### Handoff snapshot
- main HEAD: `9a13d87`
- Working tree at handoff: clean except intentionally untracked `asset_cleanup_preview/`.
- Latest merged Codex PRs:
  - **#148 / #152 / #155** village metadata and hero alignment pass: active village assets, owners, scale hints, hero copy, and route metadata were aligned around the premium Cosmic Pixel Graph Village direction.
  - **#156** `village-ui` guard test: scans app screens for hardcoded `SceneHero` island/worker/size metadata so future village screens use shared metadata.
  - **#157** format schema display polish: AI-generated format properties now render as premium structured rows instead of text bullets; add-format actions wrap safely on mobile.
  - **#158** format manager controls: format list/editor controls now use shared village accent, semantic surfaces, sharper radii, and stable mobile touch targets.
  - **#160** village label normalization: core/records/wiki/imagine/graph labels were normalized; imagine prompt panel moved onto semantic surfaces; fixed unauthenticated `/core-brain` loading by redirecting to `/sign-in`.
  - **#161** sign-in surface polish: auth entry UI now uses semantic tokens and the current Cosmic Pixel palette instead of old sky-blue placeholder styling.
  - **#162** birth-date error copy: sign-up/complete-profile now show dedicated birth-date validation copy in KO/EN instead of email error text.

### Verification
- `npm run verify` green: **748/748 tests**, 77 suites.
- Browser route smoke green while signed out: `/`, `/sign-in`, `/sign-up`, `/complete-profile`, `/onboarding`, `/manual`, `/support`, `/permissions`, `/settings`, `/theme`, `/profile`, `/persona`, `/core-brain`, `/records`, `/wiki`, `/imagine`, `/capture`, `/formats`, `/inbox`, `/data`, `/import`, `/interview`, `/audit`, `/big-five`, `/mbti`, `/attachment`, `/jarvis`, `/insights`, `/research`, `/trinity`, `/no-such-route-for-preview`.
- `/sign-up` invalid birth-date smoke verified: Korean birth-date error appears and email error does not leak into the birth-date field.

### Recommended next checks
- Run authenticated Android-device QA through the village routes, especially graph readability, worker ground contact, and village detail layout.
- Continue visual-token cleanup on public/static routes (`manual`, `permissions`, not-found) and high-traffic protected routes (`capture`, `jarvis`, `onboarding`) in small PRs.
- For asset work, compare active assets first; current active village/worker paths are already premium-leaning, while older placeholder/production-sharp folders should be treated as cleanup candidates only after preview.
- Coordinate with Claude before editing `capture.tsx`, `/profile`, or minor-safety consent/high-privacy flows.

---
## 2026-06-02 / 클리퍼 형식(양식·AI추가) + 그래프 조각 + 저장 점검

### 어디까지 왔나
- main HEAD: `017e18d`
- 이번 세션 머지 PR (`npm run verify` 747/747, 77 suites):
  - **#149** audit 화면 내부 프레임워크 id(`big_five:openness`) 숨김 (1-a)
  - **#150** 그래프: 분류된 `sources`를 마을 하위노드로 + 조각 탭 팝업(요약·해시태그·자세히→마을 화면) (1-b/c/d)
  - **#151** capture 저장 회복력 — Storage 업로드 실패해도 행은 저장(`_body_fallback`) (item 2)
  - **#153** 형식 화면: 형식 탭→분류 양식 보기(FormatSchemaView) + `+ 형식 추가` AI 화면(AddFormatFlow) (item 1)
  - (+ GPT: `village-ui.ts` / 마을 metadata·hero 정렬)
- working tree: clean (untracked `.claude/launch.json`, `.tmp_hq_pack/`만)

### 저장 점검 결과 (item 2) — 정상
- capture→`sources` 저장 OK: `raw-clippings` 버킷(비공개) + 소유자 정책 4종 + `sources_owner_all` RLS(WITH CHECK) 존재, source 2행 저장됨.
- '조각 안 보임'은 그래프가 `wiki_pages`(0행) 읽던 것 → #150이 `sources`로 전환해 해결.
- 기존 2조각은 2026-05-31 **mock 시절** 캡처라 tags/summary 비어있음 → 라이브 Gemini 캡처는 분류가 채워짐.
- ⚠️ `raw-clippings` 버킷은 **수동 operator 세팅**(마이그레이션 아님 — `storage.ts` 주석). prod엔 존재. 재현성용 guarded 마이그레이션은 후속(바닐라 PG dry-run엔 `storage` 스키마 없음 주의).

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` · edge fn `gemini-proxy` · **Gemini LIVE**
- Storage 버킷 `raw-clippings`(private, 소유자 정책) · Web: GitHub Pages auto-deploy on main

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **미성년 prod 마이그레이션 적용** `0028→0032`(게이트/동의/프라이버시) — B/D UI 준비 후 일괄 + `get_advisors`. **적용 전 사용자 확인** | large | ⭐ 미성년 출시 게이트 |
| B | 미성년 **B/D UI**: 청소년 개인정보 안내 화면 + high-privacy 설정 토글 → GPT 위임(계약: `recordConsent` 필드, `prefs.ts` 키셋) | medium | |
| C | 미성년 **G**: 동의 철회/계정삭제/DOB 정정/age-out UI | medium | |
| D | **시각 QA**(기기/웹): 그래프 조각 탭·팝업·마을↔조각 선 · 형식 양식 모달 · AI 형식추가 플로우(라이브) | small | |
| E | 형식 '자세히' 목적지 = 현재 마을 화면. 조각별 상세 화면 원하면 신설 | small | |

### 적용 중인 정책 (영구)
1. **모든 작업 GitHub 머지까지** (Simon, 2026-06-02): 새 브랜치 → `npm run verify` green → PR → CI green → squash merge → main 재검증.
2. **prod 인프라 적용(마이그레이션 apply / 엣지 배포)은 GitHub 머지와 별개 — 그 시점 사용자 확인.**
3. **GPT 동시작업** — origin/main이 같은 파일을 앞서갈 수 있음. 머지 후 항상 main 재검증.
4. `npm ci --legacy-peer-deps`. C1~C12 + forbidden lexicon. semantic 토큰만(hex/gradient/pill/em dash 금지).

### 핵심 파일
```
src/app/index.tsx                         그래프 데이터: sources → DataNode(summary 포함)
src/components/graph/NavGraph.tsx          티어/엣지/DataNodeSheet(조각 팝업)
src/app/formats.tsx                        형식 관리(탭→양식, +형식추가, 편집/삭제/공유)
src/components/wiki/FormatSchemaView.tsx   분류 양식 표시(공유 컴포넌트)
src/components/wiki/AddFormatFlow.tsx      AI 형식 제안→미리보기→저장
src/lib/wiki/propose-template.ts           proposeClipperTemplate (AI 형식 JSON, C-vocab 가드)
src/lib/wiki/capture.ts                    captureFromMarkdown (best-effort 업로드 + 행 보존)
db/migrations/0028~0032                    prod 미적용 (큐 A로 일괄 적용)
```

### 검증
```bash
npm ci --legacy-peer-deps && npm run verify   # 747/747 (77 suites)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 큐 A(미성년 prod 마이그레이션 — 단 B/D UI 준비 여부 먼저 확인) 또는 B/C UI부터.
```

---
## 2026-06-02 / 미성년 안전 remediation — 7 PR 머지 (C/H/E/A·core/B/D/F) + prod 보류

### 어디까지 왔나
- main HEAD: 이 핸드오프 머지 후 (직전 `0e338fa`)
- 이번 세션 머지 7 PR (전부 CI green · `npm run verify` 744/744, 76 suites):
  - **#134 (C)** 미성년 위기 라우팅 실배선 + KR 핫라인 **1393→109**(2024 통합). KO 14-17 → 1388+109, EN → 988. `crisisHotlines()` 단일 소스.
  - **#136 (H)** PIPA **§22-2 오인용 정정**(=<14 법정대리인; 14-17은 §15/§17/§22) + `ageNotice` 18→14.
  - **#137 (E)** `guardian_consents` service_role 잠금 (0029, deny-all).
  - **#138 (A·core)** 서버측 연령 게이트 트리거 (0030) — <14 거부 + minor_tier/account_status 서버 도출.
  - **#140 (B)** `consent_records` 동의 원장 (0031) — append-only. **미배선**(notice UI 대기).
  - **#141 (D)** 14-17 **high-privacy 기본값** (0032) — 트리거가 minor에 보수적 기본 시드 + `prefs.ts` 계약.
  - **#142 (F)** 관할 동의연령 매트릭스(`consent-age.ts`) + 게이트 floor 소스화(KR=14 가정).
  - (+ GPT **#139** age-gate 에셋 18+→14+ — 위임 프롬프트로 처리됨)
- **GPT 적대 리뷰 High 1·2·3 전부 코드로 닫힘.** working tree clean.

### ⚠️ prod 상태 — 핸드오프 정정 (중요)
- **0028이 prod에 미적용.** prod는 `0027`(clipper_templates)까지. `users`에 18+ CHECK(`users_birth_date_min_age`) 그대로, `minor_tier`/`account_status`/`guardian_consents` 없음, user 2명.
- 즉 **prod는 여전히 18+ DB 강제** → finding #2(클라전용 우회)는 prod에 **존재 안 함**(코드-상태 리뷰였음). 단 **14-17 가입은 prod에서 깨진 상태**(클라 허용, DB가 <18 거부).
- **결정(2026-06-02): B/D UI 준비될 때까지 prod 적용 보류.** 보호장치(동의기록/청소년안내/high-privacy 토글) 없이 미성년 가입을 여는 건 역순. 데모/심사는 18+로 충분·안전.
- PR-1의 109 위기 라우팅은 **코드**(엣지/웹 빌드)라 라이브 — 성인도 이미 109.

### prod 적용 시퀀스 (B/D UI 완성 후 한꺼번에)
Supabase MCP `apply_migration` 으로 **0028 → 0029 → 0030 → 0031 → 0032** 순서대로(프로젝트 `zoacryukmdeivmolvyhj`). 0030/0032 트리거 backfill이 prod 데이터에 실행됨. 적용 후 `get_advisors(security)`. 그 다음에 14-17 가입 활성화.

### 남은 작업 / 위임
- **B·D UI → GPT** (프롬프트 전달됨): 청소년 개인정보 안내 화면(`recordConsent` 필드 계약) + high-privacy 설정 토글(`prefs.ts` 키셋).
- **G (철회/삭제/age-out)** — 대부분 UI(→GPT). 코드측: **DOB 정정**은 0030 트리거가 재검증(완료), **age-out 안전**은 `AuthContext.isMinor` 라이브 계산(완료; DB `minor_tier` 스테일은 무해 — 성인 되면 보수적 기본값 토글 가능). 미래 인프라: 계정삭제 RPC(service_role), 동의철회 기록, `crisis_events` retention 정책.
- **A edge-function**(선택): under-14 `auth.users` 생성 자체 차단(고아 row). 현재 트리거로 usable account/false-tier 주입은 차단됨.
- **법무 확정 필요** (`LEXICON_LAST_LEGAL_REVIEW` null): 동의·고지 문구, consent/policy/terms 버전(현재 placeholder `2026-06-02`), EU 관할별 연령, 국외이전 고지(Gemini/Supabase 처리 국가).

### 핵심 파일 (이번 세션)
```
src/lib/safety/classifier.ts        crisisHotlines(locale,minor) 단일 소스 + pickCrisisHotline
src/lib/llm/safety.ts               fixedCrisisResponse(locale,minor) — 109/1388
src/lib/llm/gemini.ts               routeCrisis/callAdvisor minor-aware
src/lib/auth/consent-age.ts         관할 동의연령 매트릭스 (KR14/US13/EU16/DEFAULT16)
src/lib/privacy/prefs.ts            privacy_prefs 키셋 + privacy-by-design 기본
src/lib/supabase/consent.ts         recordConsent + 버전 상수
db/migrations/0028~0032             prod 미적용 (위 시퀀스로 일괄 적용)
```

### 적용 중인 정책 (이번 세션)
- **표준: 모든 작업 GitHub 머지까지** (Simon 2026-06-02). prod 인프라 적용(마이그레이션/엣지)은 그 시점 별도 확인.
- 새 브랜치 → `npm run verify` green → PR → CI green → squash merge → main 재검증.

### 검증
```bash
npm run verify   # 744/744 (76 suites) · lint/type/i18n/lexicon/boundary/C1~C12
```

### 다음 세션 시작
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
```

---
## 2026-06-01 / 연령 티어 확장 + GPT BLOCK: 미성년 게이트 remediation (로컬 인수인계)

### 어디까지 왔나
- main HEAD: `b9ed7d0`
- 이번 세션 머지된 PR:
  - **#132** feat(auth): C10 14-17 self-consent 게이트 오픈 (18→14) — **라이브, 그러나 GPT 적대 리뷰가 Blocker 판정 (아래)**
  - **#133** docs: 영유아 LLM 리터러시 트랙 개념 (Phase-2 비전)
  - #128(스키마 0028)/#129(age-aware crisis) → #132에 folded 후 closed
- 열린 PR: **#134** (draft) 미성년 위기 라우팅 *토대*(AuthContext.isMinor + PromptInput.minor, **무동작**) · **#127** (draft) 50-페르소나 연령 시뮬 docs
- 테스트: `claude/minor-safety-foundation`(#134) 기준 730/730 green · main 729 green
- working tree: #134 코드는 `claude/minor-safety-foundation` 브랜치에 commit됨

### ⚠️ 최우선 — GPT 적대 리뷰 = BLOCK (이미 머지된 #132 대상)
**결론: #132를 그대로 두면 안 됨. 출시 전 막아야 할 Blocker.** High 항목:
1. **법적 근거 오인용** — PIPA **§22-2 = "만 14세 미만 법정대리인 동의" 조항**. 14-17 본인동의 근거가 아님. 14-17은 일반 동의 체계(**§15/§17/§22**)로 재정립 + 고지(목적·항목·보유기간·거부권/불이익) 필요. → #128/#132 본문 · `CONSTRAINTS.md` C10 · `KIDS-MODE-CONCEPT.md` · 기존 설명 전부 §22-2 오인용 → **전수 정정.**
2. **서버측 게이트 부재** — 0028이 legacy adult-only DB CHECK를 sanity(1900~today)로 완화 → 게이트가 사실상 **클라 전용 → 우회 가능**(anon client/직접 API/OAuth/profile upsert로 <14·잘못된 minor_tier 주입). COPPA "actual knowledge"(DOB로 <13 인지) 리스크.
3. **minor→1388 미배선 = known safety defect** — 14-17 여는 순간 미성년 인지 상태인데 위기 청소년이 성인 라우팅 받음. gate 오픈 전 실배선 필수. (#134는 토대만, advisor 경로 `fixedCrisisResponse`는 minor 무관.)
4. **미성년 프로파일링/민감정보** — 저널+LLM에 건강/자해/가족/성 등 PIPA §23 민감정보 유입. 14-17 기본 high-privacy 필요.

### 다음 작업 큐 (= GPT 최소 머지 조건) — 로컬에서
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| 0 | ✅ **결정됨 (2026-06-01): #132 라이브 유지 + forward-fix** — revert 안 함. 단 A~D는 *실사용자 출시 전 필수*. 데모/심사 노출은 mock·소수라 수용 | — | — |
| A | **서버측 14+ 강제** — Edge Function/RPC 가입, DOB→age/minor_tier/account_status 서버 계산, minor_tier 클라입력 금지(DB generated/trigger), `active`=age≥14 DB 제약, under-14 auth 생성 차단(잔여 로그·이메일 X) | large | ⭐ |
| B | **`consent_records`** + 가입 시 기록(user_id·age_band·minor_tier·consent/policy/terms version·purposes·required·optional·llm_processing_ack·overseas_transfer_ack·sensitive_data_ack·locale·ts·ip_hash·ua_hash) + **청소년용 개인정보 안내** 별도 링크/요약 | large | ⭐ |
| C | **minor 위기 실배선 + 테스트** — `useAuth().isMinor` → callGemini/callAdvisor → classifier. KO 14-17 자해/자살 → **1388 + 109(자살예방)**, EN minor → 988. advisor `fixedCrisisResponse` minor-aware. (#134 토대 위) | medium | ⭐ |
| D | **14-17 high-privacy 기본값** — 광고/공유/추천/외부분석 OFF, LLM 학습 미사용, Gemini/국외이전 고지, persona export/share off, 장기기억은 명시 승격 | medium | |
| E | `guardian_consents` — PR-4 전까지 **deny-all RLS + no grants + "NOT IN USE" DB comment + migration test** (또는 제거). 보호자 PII 보존/삭제 정책 없이 컬럼 두지 말 것 | small | |
| F | **consent-age 매트릭스** — country/region × 디지털동의연령. EU 16(국가별 13까지), US COPPA <13 차단. 14 단일로 글로벌 불가 | medium | |
| G | 철회/삭제/DOB 정정/age-out(17→18) UI + 국외이전 고지 + 위기로그 retention 정책 | medium | |
| H | age floor 잔여 카피 전수 검사 + §22-2 오인용 docs 정정 | small | |

### 머지 전 문서로 확정 필요 (GPT가 정보 부족으로 추측 표시한 것)
- Supabase Auth가 현재 **공개 sign-up** 상태인지 (그렇다면 서버측 게이트 우회 표면)
- Gemini/Supabase 데이터 처리·보관 **국가** (국외이전 고지 트리거)
- XPRIZE 제출/심사/데모/로그에 **실제 사용자 데이터** 포함 여부

### 적용 중인 정책 (영구)
1. 독립 작업은 **main에서 새 브랜치** (스택 PR 지양). `force-push`/`rebase -i`는 사용자 confirm 필수.
2. 안전-크리티컬/컴플라이언스 변경은 **draft PR + 리뷰 후 머지**. auto-merge 금지(사용자 명시 지시 때만).
3. 모든 push 전 `npm run verify`. 머지 전 CI(lint·verify·sql) green 확인.
4. 어휘 정책(C-vocab): 임상 용어 금지(`src/lib/safety/lexicon.ts` 단일 소스).

### 핵심 파일 위치
```
src/lib/supabase/auth.ts             연령 게이트(MIN_SELF_CONSENT_AGE=14, 클라 only — 서버측 필요)
src/lib/auth/AuthContext.tsx         isMinor 노출 (#134)
src/lib/llm/types.ts                 PromptInput.minor (#134)
src/lib/llm/gemini.ts                callGemini classifyInput(177 in,202/266 out); callAdvisor→fixedCrisisResponse(minor 무관)
src/lib/safety/classifier.ts         pickCrisisHotline(locale,minor) → 1388/1393/988
db/migrations/0028_minor_consent.sql account_status/minor_tier/guardian_consents (DB 게이트 완화 지점)
docs/CONSTRAINTS.md                  C10 (§22-2 오인용 정정 대상)
docs/KIDS-MODE-CONCEPT.md            영유아 트랙(Phase-2) + 전 연령 지도
```

### 검증
```bash
npm run verify   # lint + type-check + i18n(C7) + lexicon + llm-boundary(C1) + constraints + jest
# 서버측(작업 A/B)엔 로컬 Supabase 필요: supabase start  /  supabase functions serve
```

### 다음 세션(로컬) 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md            # 이 블록
# 작업 0(#132 revert vs forward-fix 결정)부터.
# #134 이어가려면:
git fetch origin claude/minor-safety-foundation
git checkout claude/minor-safety-foundation
```

### GPT 리뷰 출처(핵심)
PIPA §15/§17/§22/§22-2/§23 · FTC COPPA Rule/FAQ · GDPR Art.8 & Recital 38 · 청소년상담 1388 · 자살예방 상담 109(2024~ 통합).

---
## 2026-06-01 / 형식 관리 UI (#104) + 다중 스킬 감사

### 어디까지 왔나
- 이번 세션 PR: **#104** (형식 관리 UI, G3 사용성 완성) — 최신 main(#106 `cb907c0`)까지 통합 후 squash merge.
- 핸드오프 큐 **A안 완료**: 클리퍼 형식 목록(내/마을) · 공유 토글 · 전체 편집 폼 · 삭제.
- 테스트 **710/710 (72 suites) green**, CI(lint+verify) green.
- GPT 동시작업 #102/#105/#106(capture/imagine UI)와 `capture.tsx` 3회 재머지 — 충돌 0.

### 추가/바뀐 파일
- 신규 `src/app/formats.tsx`(매니저) · `src/components/wiki/TemplateEditor.tsx`(전체 편집 폼) · `src/lib/wiki/template-validate.ts`(+test) · `src/lib/wiki/tags.ts`(공유 태그 정규화).
- 수정 `profile.tsx`(나 허브 칩) · `capture.tsx`(형식 관리 링크) · `_layout.tsx`(라우트) · `propose-template.ts`(금지어 게이트 일원화).
- 진입점: `/profile` "계정·설정" 칩 + `/capture` 링크.

### 다중 스킬 감사로 잡아 고친 것
- 금지어 **오탐 버그**: naive `includes` → 경계 인식 `containsForbiddenLexicon` 일원화(template-validate + propose-template). "Secure" 같은 단어 속 임베드된 금지어로 오차단되던 것 수정 +회귀 테스트.
- 저장 행 증발(upsert INSERT 엣지) → in-place/prepend.
- 동시성: `mountedRef`(+mount 시 true 재설정, strict-mode 대비) + load-generation 가드 + 토글 in-flight 가드.
- authz(owner_id 필터 + RLS write-own) · 인젝션 sanitize(#101, inject 시점) 재확인 클린. DESIGN.md(토큰·em dash·arrow) 클린.

### 다음 작업 큐
| # | 작업 | 크기 |
|---|---|---|
| B | 분류기가 형식별 `aiProperties`까지 채우기 (편집 폼과 직결) | medium |
| C | 커뮤니티 형식 트리거 매칭 시 default_tags/target 자동 머지 | small |
| D | `clipper-templates.ts` `what` em dash 제거 | small |
| 후속 | `classify-clipper` sanitizeTag → `tags.ts` 완전 일원화 · TagField/HashtagAdder 공유화(capture 겹침, Codex 조율) | small |

### 미해결
- gstack upstream 5커밋 뒤처짐 → `/gstack-upgrade` (세션훅 알림, 글로벌 스킬).
- 실기기/웹 시각 QA: `/formats` 렌더·터치 미확인 (Codex ADB offline). 다음 순회에 `/formats` 포함 권장.

---
## 2026-06-01 / 세션 종료 핸드오프 (G3 머지 + 보안수정 + gstack v1.55)

### 어디까지 왔나
- main HEAD: `1ae98c7`
- 이번 세션 머지 PR: **#100** (G3 공유 클리퍼 형식 + relevance 수정), **#101** (공유 형식 이름 프롬프트-인젝션 sanitize)
- `0027` 마이그레이션 **prod 적용 완료** (clipper_templates, RLS 4정책, 보안 어드바이저 클린)
- 테스트: **700/700 (71 suites) green**, CI(lint+verify) green
- working tree: clean (`.claude/launch.json`, `.tmp_hq_pack/`만 미추적)
- Gemini 라이브 확인 (G1 chat + G2 clipper-classify, edge fn 경유 200 OK)
- gstack 업그레이드: v0.15.9.0 → **v1.55.0.0**

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` · edge fn `gemini-proxy`(v5 ACTIVE) · secret `GEMINI_API_KEY` 설정됨(라이브)
- repo Variables: `EXPO_PUBLIC_LLM_MODE=live` + `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION=true`
- Web(GitHub Pages): <https://simon-yhkim.github.io/2nd-B/>
- 마이그레이션 경로: `db/migrations/` 파일 + CI `supabase-dry-run`(sql) → prod 적용은 Supabase MCP `apply_migration`(사용자 승인 후)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 형식 관리 UI — 내/커뮤니티 형식 목록·편집·삭제·공유토글 (`template-queries.ts` 준비됨) | medium | ⭐ G3 사용성 완성 |
| B | 분류기가 형식별 `aiProperties`까지 채우기 — 지금은 name+baseKind 힌트만 | medium | 형식 실제 값 활용 |
| C | 커뮤니티 형식 트리거 매칭 시 default_tags/target 자동 머지 | small | |
| D | `clipper-templates.ts` `what` 문자열 em dash 제거(UI 노출 대비, DESIGN.md) | small | |

### 적용 중인 정책 (영구)
1. `npm ci --legacy-peer-deps`; 최신 main→브랜치→`npm run verify` green→PR→CI green→**squash merge**→main 동기화.
2. GPT 공동작업 — 머지 전 항상 최신 main 재검증. 핸드오프는 `docs/HANDOFF.md` 누적.
3. **API 키/시크릿 직접 입력 금지** — 사용자 위임(평문 노출 키는 Google이 leaked 차단 → 교체 필수).
4. 마이그레이션 prod 적용은 사용자 승인 후 Supabase MCP. force push/rebase -i/reset --hard·`.env`·`.claude/settings.local.json` 스테이징 금지.
5. 모든 LLM은 `callGemini` 경유(C1/C3/C9). semantic.* 토큰만, hex/gradient/glassmorphism/pill chip/em dash 금지. 금지 어휘(임상 표현).

### 핵심 파일 위치
```
src/lib/wiki/clipper-templates.ts        번들 8개 정본 형식(오프라인 기준)
src/lib/wiki/template-queries.ts         clipper_templates CRUD + 공유토글 (0027)
src/lib/wiki/propose-template.ts         AI 새 형식 제안(빌더/파서 + C-vocab 가드)
src/lib/wiki/classify-clipper.ts         분류 + 공유형식 메뉴 주입(이름 sanitize)
src/lib/wiki/capture.ts                  captureFromMarkdown + relevance 1..5 스케일
src/app/capture.tsx                      inbox 캡처 후 제안 UI(opt-in 저장/공유)
db/migrations/0027_clipper_templates.sql 공유 형식 테이블 + RLS
src/lib/llm/gemini.ts                    callGemini/callAdvisor (edge fn 라우팅)
```

### 검증
```bash
npm run verify   # lint + type + i18n + lexicon + llm-boundary + constraints + jest(700)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(형식 관리 UI)부터 권장
```

---
## 2026-06-01 / G3 공유 클리퍼 형식 + relevance 수정 (#100)

### 무엇을 / 왜 (Vision 축 2 — 개인 비서 기반)
**G3**: 기존 8개 형식에 안 맞는 자료를 만나면 AI가 **새 클리퍼 형식 제안** → 사용자 확인 → 개인저장(공유는 옵트인). 공유분은 모든 사용자가 읽음(커뮤니티 형식). 분류기는 본인+공유 형식을 메뉴 힌트로 읽음(없으면 번들 8개로 fail-open).
**버그 수정**: classify의 `simonRelevance`(0~1)가 `sources.simon_relevance`(int CHECK 1~5)에 그대로 들어가 저장이 깨지던 것 → 1~5로 스케일(`scaleAiRelevance`). #97 잠복 버그.

### 바뀐 파일
- `db/migrations/0027_clipper_templates.sql`(신규, RLS: 읽기=본인 OR 공유 / 쓰기=본인만) + 구조 테스트
- `src/lib/wiki/template-queries.ts`(신규) · `propose-template.ts`(신규, AI 제안 + C-vocabulary 가드) + 각 test
- `classify-clipper.ts`(공유 형식 메뉴 주입 +test) · `capture.tsx`(inbox 캡처 후 제안 UI) · `capture.ts`(relevance 스케일 +test) · `llm/types.ts`(purpose)

### 검증
- npm run verify: jest **699/699 (71 suites)**, lint 0, lexicon + C1~C12 그린

### 다음 / 되돌리기
- ⚠️ **0027 마이그레이션 prod 미적용** → 적용 전까지 저장/공유는 fail-open(앱 안 깨지고 기능만 inert). 적용: Supabase에 `0027_clipper_templates.sql` 실행.
- 다음(옵션): 형식 관리 UI(목록/편집/삭제) · 분류기가 형식별 props까지 채우기.
- revert: 이 PR 단독. 마이그레이션 되돌리기는 `DROP TABLE clipper_templates`.

---
## 2026-06-01 / AI clipper 분류 (#97)

### 무엇을 / 왜
캡처 시 Gemini 1회로 내용 읽고 **clipper 형식 분류** + 의미 프론트매터 채움(kind·target-category·simon-relevance·actionable-takeaway·kind별 props). 8개 템플릿을 `clipper-templates.ts` 정식 데이터화(분류기·레지스트리 단일 소스). 저장은 기존 `sources.frontmatter`(jsonb) 재사용. mock graceful(JSON 없음→baseline kind).

### 바뀐 파일
- `src/lib/wiki/clipper-templates.ts`(신규) · `classify-clipper.ts`(+test, 신규)
- `src/lib/llm/types.ts`(purpose) · `capture.ts`(extraFrontmatter/simonRelevance) · `capture.tsx`(wiring)

### 검증
- npm run verify: jest **674/674 (68 suites)**, lint 0, lexicon + C1~C12

### 다음 / 되돌리기
- 다음: **G3** `clipper_templates` 공유 레지스트리 + AI 신규 제안→사용자 확인→개인저장(공유 옵트인)
- ⚠️ `GEMINI_API_KEY` 시크릿 아직 미설정 → 라이브 분류는 키 설정 후 동작(G1 #95). mock에선 baseline kind만.
- revert: PR #97 단독.

---
## 2026-06-01 / Gemini 라이브 재연결 (#95)

### 무엇을 / 왜
배포 사이트가 mock 모드였던 것 → **라이브**. 키는 서버측 유지(공개 번들 인라인 안 됨):
- `web-deploy.yml`에 `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION` 빌드 전달 추가 → `callGemini`가 `gemini-proxy` 엣지함수 경유.
- `gemini.ts` `callAdvisor`(저널 어드바이저)도 라이브에서 엣지함수 경유로 라우팅(직접경로는 그대로 → 테스트 그린).
- repo Variables `EXPO_PUBLIC_LLM_MODE=live` + `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION=true` 설정. `gemini-proxy` ACTIVE(v5), `GEMINI_API_KEY` 시크릿 설정됨.

### 바뀐 파일
- `.github/workflows/web-deploy.yml` · `src/lib/llm/gemini.ts`

### 검증
- npm run verify: jest **668/668**, lint 0, C1~C12. 머지·배포 후 세컨비 채팅 실응답 확인.

### 다음 / 되돌리기
- 다음: **G2** AI clipper 분류(`classifyCapture` 확장) → **G3** `clipper_templates` 레지스트리(8개 시드, AI 제안→사용자 확인→개인저장, 공유 옵트인)
- revert: PR #95 + Variables `LLM_MODE=mock` 되돌리기.

---
## 2026-06-01 / 메뉴 재설계 Phase 5 — 나 허브 (#92)

### 무엇을 / 왜
`/profile`을 3축 '나' 허브로 확장. 묻힌 화면 18개를 축별 칩으로 노출:
- 나의 중심 → /core-brain
- 평가 → /persona /big-five /mbti /attachment /audit /interview
- 분석 → /insights **/trinity** /research
- 계정·설정 → /settings /theme /data /manual /import /inbox /support /permissions
Phase 4에서 그래프 진입점 잃은 `/trinity` 여기 재배치(인터림 해소). 라우팅 변경 없음(본문만 확장), 칩 route는 typed `Href`.

### 바뀐 파일
- `src/app/profile.tsx` — 나 허브 4섹션

### 검증
- npm run verify: jest **668/668 (67 suites)**, lint 0, lexicon + C1~C12

### 다음 / 되돌리기
- 다음: **Phase 6** (죽은 라우트/중복 정리, i18n·테스트) — 재설계 마지막
- revert: PR #92 단독.

---
## 2026-06-01 / 캐릭터 혼잣말 말풍선 (#91)

### 무엇을 / 왜
메인 그래프에서 일꾼(캐릭터) 탭 → 성격별 혼잣말 픽셀 말풍선(~3.6s, 걷는 캐릭터를 따라다님). (UX 배치 3/4)

### 바뀐 파일
- `src/lib/graph/monologues.ts`(+test, 신규) — 캐릭터별 혼잣말 4줄(ko+en) + 테스트된 `pickMonologue`
- `src/components/graph/CharacterPathLayer.tsx` — 레이어 box-none + 스프라이트 Pressable + 말풍선
- `src/components/graph/NavGraph.tsx` — CharacterPathLayer 에 locale 전달

### 검증
- npm run verify: jest **668/668 (67 suites)**, lint 0, lexicon + C1~C12

### 다음 / 되돌리기
- 다음(배치 마지막): **D** Phase 5 (나 허브 — /profile 확장)
- revert: PR #91 단독. 혼잣말 문구는 monologues.ts에서 손봄.

---
## 2026-06-01 / 로딩 문구 컨셉화 (#89)

### 무엇을 / 왜
로딩 타이프라이터 25개 문구가 옛 생물학적 뇌 조립(Soma/Neuron/Cortex/Cerebrum) 메타포였음 → 밤빛 조각마을 컨셉(밤하늘→마을 섬→길→나의 중심→환영)으로 전면 교체. 일꾼 세포 장난기 유지, forbidden lexicon·em dash 없음. (UX 배치 2/4)

### 바뀐 파일
- `src/components/ui/LoadingScreen.tsx` (MESSAGES + 상단 주석)

### 검증
- npm run verify: jest **663/663**, lint 0, lexicon + C1~C12

### 다음 / 되돌리기
- 다음(이 배치): **B** 캐릭터 말풍선 → **D** Phase 5
- revert: PR #89 단독.

---
## 2026-06-01 / 메인화면 UX — 마을 간격·크기 + 첫진입 모달 잠금 (#88)

### 무엇을 / 왜
사용자 라이브 테스트 피드백 (UX 배치 1/4):
1. 마을 6개가 빽빽 → `world-layout.ts` `RING2` 360→400 + `NavGraph` 섬 아트 1.7→1.5(`ISLAND_ART_SCALE`). 주관적 — 라이브 보고 조정 가능.
2. 첫진입 '아직 마을이 조용해요' 카드가 뒤 그래프 눌리던 것 → 전체화면 dim 백드롭(`pointerEvents="auto"`, `zIndex 100`)으로 잠금. 닫기는 카드 컨트롤(✕/먼저 둘러볼게요)로만.

### 바뀐 파일
- `src/components/graph/world-layout.ts` — RING2 400
- `src/components/graph/NavGraph.tsx` — ISLAND_ART_SCALE 1.5
- `src/app/index.tsx` — emptyGraphBackdrop (모달 잠금)

### 검증
- npm run verify: jest **663/663 (66 suites)**, lint 0, C1~C12

### 다음 / 되돌리기
- 다음(이 배치): **C** 로딩 문구 컨셉화 → **B** 캐릭터 말풍선 → **D** Phase 5
- revert: PR #88 단독.

---
## 2026-06-01 / 메뉴 재설계 Phase 4 — 마을→도메인 필터 records (#86)

### 무엇을 / 왜
마을 이름↔도착지 불일치 해소 (§4). 불일치 3개 마을이 records 도메인 필터 뷰로 진입:
- 일과 성장(work) → `/records?domain=work` (was /trinity)
- 관계와 사람(relation) → `/records?domain=relation` (was /interview)
- 취향과 영감(taste) → `/records?domain=taste` (was /insights)
- 기록 보관소 → `/records`(전체 아카이브) · 배움과 지식→/wiki · 공상→/imagine 유지 · relation tier-3→/interview 유지(시기별 인터뷰)

### 바뀐 파일
- `src/lib/persona/evidence.ts`(+test) — `OriginShard.domain` (mergeEvidence 가 `domainForTags(tags,title)`로 계산)
- `src/app/records.tsx` — `?domain=` 읽어 마을 칩 행 필터(전체+6) + SceneHero eyebrow 반영
- `src/lib/graph/relatedness.ts` — `VILLAGE_LABEL` 단일 소스
- `src/components/graph/NavGraph.tsx` — work/relation/taste href → `/records?domain=`

### 검증
- npm run verify: jest **663/663 (66 suites)**, lint 0, C1~C12

### 다음 / 되돌리기
- 다음 1순위: **Phase 5** (나 허브 — `/profile` 확장, 묻힌 화면 + /trinity·/insights 분석도구 수용)
- ⚠️ 인터림: `/trinity` 그래프 진입점 없어짐(work 마을이 옮겨감) → Phase 5에서 나 허브로 재배치. `/insights` 는 `/manual` 에서 도달 가능. 둘 다 라우트 존재(404 없음).
- revert: PR #86 단독 revert.

---
