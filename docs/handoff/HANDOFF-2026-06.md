# 2nd-Brain Handoff — 2026-06

> 덮는 기간: **2026-06-19 ~ 2026-06-27** · 블록 20개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).

## 2026-06-27 / DB user-profiling: 실제 evidence-id citations + 리서치 백로그 라이브 적재 + 넛지 evidence 노출

### 어디까지 왔나
- main HEAD: `#615` 머지 직후. 이번 세션 머지 PR: **#611** (실제 record-id citations) · **#615** (D9 re-check 넛지 evidence 수 노출). 앞서 #604/#606/#607/#608도 머지됨.
- 테스트: `npm run verify` green — jest **259 suites / 2001 tests**. working tree clean.

### 이번 세션 핵심 변경
- **#611 — evidence-id citations**: `star_tier_history.evidence_citations`가 항상 null이던 문제 해결. ratify 시 LLM 날조 `proposal.citations` 대신 **시스템이 실제로 카드를 만든 records의 `record:<id>`** 영속화. 흐름: `buildPersona.evidenceRefs`(최근 8, newest-first) → `ProposalContext.evidenceRefs` → `review.tsx`/`DeepSpaceDesignScreens.tsx` ratify → `recordStarTiers` write boundary(0060 sanitizer가 resolvable-refs-only 재검증).
- **#615 — 넛지 evidence**: 순수 `tierShiftNudge(shifts, locale, nameOf)` (tier-history.ts) 추출 + 테스트. shift가 cited면 "근거 N개"/"N cited" 집계 1개 노출. **legacy review 화면(review.tsx)에서만** 렌더.
- **리서치 백로그 라이브 적재**: live `knowledge_sources` **337행, C8 위반 0, 57 frameworks**. seed↔live 정합성 확인(drift 없음). `on conflict (doi) where doi is not null` 멱등.
- **점검**: Supabase advisors — 내 변경발 신규 결함 0(나머지는 기존 인프라 항목, 일부는 deny-all 의도적).

### 다음 작업 큐 (이 스레드에서 도출)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| EV-1 | **deep-space review 화면에 tier-shift 넛지(+evidence) 노출** — `DeepSpaceReviewScreen`(DeepSpaceDesignScreens.tsx)은 현재 shift를 안 그림. `loadTierShifts`+`tierShiftNudge` 포팅. ⚠️ 캐노니컬 디자인 surface라 **info-density/DESIGN.md 배치 결정 = 사용자 승인 필요**(에이전트 단독 금지). | small-med | ⭐ 디자인 승인 후 |
| EV-2 | (선택) `record:<id>` citation → 해당 record 열기 resolver + 탭 인터랙션. evidence.ts의 `evidenceRoute` 패턴 확장. EV-1과 함께. | medium | EV-1 다음 |

### 적용 중인 정책 (영구, 추가)
- citations는 **이드/슬러그만** (record:/source:/doi:/uuid), body·chat 텍스트 절대 금지(0060 PII 계약). write boundary sanitizer가 강제 — caller가 뭘 넘겨도 안전.


## 2026-06-27 / OTA 셋업 검증 + 미머지 PR 정리(#600/#586/#605) + Cowork API 등록 핸드오프

### 어디까지 왔나
- main HEAD: `58c904a`
- 이번 세션 머지된 PR: #580 expo-updates(OTA 클라이언트) · #582 eas-update 워크플로우 · #603 API 대시보드+Sentry 가이드+빌드마커 · **#600 OTA 자동발행 게이팅 + 루트 ErrorBoundary** · #586 별자리 3-레이어 개념 정본화(PRD v3) · **#605 네이티브 health(HealthKit/Health Connect)** (#473을 현재 main에 재이식 → #473 close).
- 병행 머지(타 작업): #602/#595 persona, #604/#606/#607.
- 테스트: `npm run verify` green — jest **257 suites / 1946 tests** (#605 기준). working tree clean.

### 활성 인프라 / 상태
- Supabase project `zoacryukmdeivmolvyhj` (URL+anon in eas.json). LLM 키는 Edge Function secret(`gemini-proxy`/`claude-proxy`).
- **EXPO_TOKEN repo secret 설정됨 → OTA 작동.** 채널 `preview`, runtime = `app.json version`(현재 0.0.6).
- ⚠️ **OTA는 이제 GATED(#600)** — 자동발행 안 함. 폰 전달은 머지/커밋 메시지에 `[ota]`(또는 `[release]`) 또는 Actions → "EAS Update (OTA)" → Run workflow.
- 환경변수 주입: `web-deploy.yml`이 `${{ vars.* }}`(GitHub **Variables**)로 `EXPO_PUBLIC_*` 주입 → 키만 넣으면 웹 라이브. 네이티브는 eas.json 필요.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Cowork API 등록(분석/OAuth/정부) 후 **Google/Kakao client id** 받으면 → `eas.json` 네이티브 OAuth 반영 + **APK 리빌드 PR** | medium | ⭐ Cowork 결과 대기. 프롬프트 = `docs/api-registration-cowork.md` |
| B | **#605 device QA** — 실기기 Health Connect/Apple Health → 샘플 적재+루틴 자동완료, 미성년 잠금 확인 | small | 사용자 수동(에이전트 불가) |
| C | (선택) Sentry **네이티브** 크래시 = `@sentry/react-native` 교체 + 리빌드 | large | `docs/sentry-setup.md` Path B |

### 적용 중인 정책 (영구)
1. **OTA 의도적 발행만** — `[ota]`/`[release]` 마커 또는 수동 dispatch(#600). 자동발행 금지.
2. Always PR · squash-merge · main 직접 push 금지 · 브랜치는 origin/main에서.
3. `EXPO_PUBLIC_*` 키 → GitHub **Variables**(Secrets 아님). OAuth **client secret → Supabase 대시보드에만**(GitHub/채팅 금지).
4. native dep 추가 시 $0/mo 무료티어 확인(blueprint §5) + 리빌드 필요(OTA 불가).
5. stale PR 통째 머지 금지 — net-new만 현재 main에 재이식(#473→#605 사례).

### 핵심 파일 위치
```
docs/api-registration-cowork.md   Cowork 등록 프롬프트(검증본 v2) — 분석/OAuth/정부API
docs/api-status.html              API 연결 현황 대시보드
docs/sentry-setup.md              Sentry 웹(즉시)/네이티브(리빌드) 경로
.github/workflows/eas-update.yml  OTA(게이팅) · web-deploy.yml = vars.* 주입
src/lib/health/                   Slice2 native 어댑터(health-connect/healthkit/mappers)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A: Cowork client id 받으면 eas.json 네이티브 OAuth + 리빌드. 프롬프트 = docs/api-registration-cowork.md
```

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
src/lib/llm/boundary.ts                     callAdvisor 가 loadDomainLevels best-effort 로드
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

> **아카이브**: 2026-06-16 이전(2026-05-25 Sprint 0 ~ 2026-06-16) 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 이동됨. 최신 rev2·별자리 era 만 여기 유지.
