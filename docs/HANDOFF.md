# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 오래된 sprint 핸드오프는 아래로 밀어둠.
> Live: <https://simon-yhkim.github.io/2nd-B/>

## Latest -- 2026-06-04 (cont.) / gstack 갱신 + L/I 위생 PR #206 + L8 미성년 라우팅 + gemini-proxy v11(M6) 배포

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

## Latest -- 2026-06-02 / Worldview v-final 완결 + Soul Core v3 아트 wiring (플래그 게이트)

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

## Latest — 2026-06-02 / 클리퍼 형식(양식·AI추가) + 그래프 조각 + 저장 점검

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

## 2026-05-31 (밤) / Phase 3 하드닝 — 탭 라우트 정합 + 크래시 수정 (#83)

### 무엇을 / 왜
사용자 "시스템적으로 더 만질것 없어?" → Phase 3(#79) 탭 재정의가 드러낸 시스템 이슈 4개 수정:
1. **BackArrow 라우트 desync** — BackArrow 가 자체 목록(옛 탭)을 들고 있어 `/core-brain`·`/records`·`/wiki` 가 막다른 길(back·탭바 둘 다 없음), 새 탭은 이중 내비. → `src/lib/nav/tabs.ts`(`PRIMARY_TAB_PATHS`) 단일 소스로 통합(탭바·BackArrow·shell 공유).
2. **탭바 하단 클리어런스 없음** — capture/jarvis/imagine 콘텐츠(특히 세컨비 입력창)가 58px 탭바 밑에 깔림. → `PremiumAppShell` 에 `isTabPath` 기반 `tabBarClearance` 중앙화 + profile 중복 패딩 제거.
3. **capture.tsx hooks 크래시** — `useMemo` 2개가 early-return 뒤 → userId/loading 플립 시 React #300(흰 화면). /capture 가 주요 탭 되며 노출(라이브 재현). → 가드 위로 이동.
4. **근본 원인** — `react-hooks/rules-of-hooks` 미적용 → `eslint-plugin-react-hooks` 추가 + 룰 on(error). blast radius=capture 1개.

### 바뀐 파일
- `src/lib/nav/tabs.ts`(신규) — PRIMARY_TAB_PATHS 단일 소스
- `tab-bar.tsx`·`BackArrow.tsx` — 공유 상수 사용 / `background.tsx` — tabBarClearance / `profile.tsx` — 중복 패딩 제거
- `capture.tsx` — useMemo 가드 위로 / `eslint.config.mjs`·`package.json`/`lock` — react-hooks

### 검증
- npm run verify: jest **662/662 (66 suites)**, lint **0 errors**(rules-of-hooks 포함), C1~C12

### 다음 / 되돌리기
- 다음 1순위: **Phase 4** (마을 탭 → records 도메인 필터)
- revert: PR #83 단독 revert. `tabs.ts` 만 신규.
- 협업 메모: GPT 와 같은 파일 동시 작업 시 **머지 후 재검증 필수**(#79 에서 capture.tsx 겹침 경험).

---

## 2026-05-31 (저녁) / 메뉴 재설계 Phase 3 — 탭 재정의 + journal redirect (#79)

### 무엇을 / 왜
- 하단 탭을 VISION 3축 IA 로 5개 재정의: **그래프·담기·세컨비·공상·나**. explore(`/core-brain`)·records(`/records`)·store(`/wiki`) 탭 제거 — core-brain 은 '나' 허브(Phase 5), wiki/records 는 그래프 마을(Phase 4)로 흡수.
- `/journal` → `/capture` redirect. 라우트 파일·`_layout` Stack.Screen 유지 → 진입점 19곳(onboarding firstRun, index 빈그래프 CTA, insights/inbox/wiki/trinity/manual/persona/audit/settings/core-brain/+not-found)과 `characterForRoute("/journal")→momo` 안 깨짐.
- capture 일기 모드에 Lv3 게이트(`checkGate`)+무료 한도(`checkUsage`) 이식 → redirect 가 진행도 게이트를 우회하지 않음.

### 바뀐 파일
- `src/components/premium/tab-bar.tsx` — 5탭 재정의 + 새 픽셀 글리프(담기=트레이↓/세컨비=말풍선/공상=초승달), unused `Rect` import 제거
- `src/app/journal.tsx` — 본문 전체 → `<Redirect href="/capture" />` (822→18줄)
- `src/app/capture.tsx` — 일기 모드 Lv3 게이트+무료 한도 이식, journalCount 로드, 저장 후 XP/카운트 refresh

### 검증
- npm run verify: jest **662/662 (66 suites)** green, lint 0, C1~C12

### 다음 / 되돌리기
- 다음 1순위: **Phase 4** (마을 탭 → records 도메인 필터 뷰로 통일)
- revert: PR #79 단독 revert 로 롤백. `journal.tsx` 복원 시 구 일기 화면 그대로 복귀.
- ⚠️ 결정(사용자 확정): 게이트가 capture 일기 모드 전체에 적용 → 담기 일기에도 무료 2회 한도 생김. 마찰 원치 않으면 revert.

---

## 2026-05-31 (낮) / 메뉴 재설계 Phase 1·2 (스펙 + 담기 일기 모드) — #75 #76

### 어디까지 왔나
- **main HEAD**: `d77cb00`
- **테스트**: `npm run verify` green — jest **662/662 (66 suites)**, lint 0 err, C1~C12. working tree clean.
- **의존성 설치 주의**: `npm ci --legacy-peer-deps` (그냥 `npm ci`는 typescript@6 vs expo peer 충돌로 실패. CI도 `--legacy-peer-deps`).

### 이번 세션 머지된 PR (시간순)
- #71 capture/records 저장소 통합 읽기(mergeEvidence) + 캐릭터별 페르소나 chat + capture 개편(링크/스크랩 통합, 자동분류 버튼 제거, 해시태그 +칩)
- #73 로그아웃→/sign-in 직행 + 메인 그래프 마을 픽셀 이름표
- #74 그래프 연관성: 태그 기반 도메인 자동 배치(domainForTags) + 공유태그 연결선(relatedEdges) — `src/lib/graph/relatedness.ts`
- #75 **메뉴 재설계 스펙 문서** — `docs/MENU_RESTRUCTURE.md` (VISION 3축 IA, 5탭, 결정 Q1~Q3 확정)
- #76 **재설계 Phase 2** — `/capture`(담기)에 '일기' 모드 추가(streak·성찰질문·topic/conclusion·opt-in Advisor, records 저장, C9 crisis). 나머지 모드는 sources 저장.

### ⏳ 진행 중인 큰 작업: 메뉴 구조 전면 재설계
**단일 소스: `docs/MENU_RESTRUCTURE.md`** (스펙 + Phase별 진행현황 + 확정 결정).
사용자 지시: "메뉴 하나하나 기능부터 다시 정의해서 구조를 짜자." → VISION 3축 기반 IA로 재설계 합의.

**확정된 결정 (MENU_RESTRUCTURE.md §6):**
- Q1 통합 입력 저장 = **모드별 유지 + 읽기 통합** (메모/일기→records, 링크·파일→sources; 읽기는 mergeEvidence)
- Q2 마을 도착지 = **records 도메인 필터 재사용** (신규 화면 최소화)
- Q3 탭 5개 = **그래프 · 담기 · 세컨비 · 공상 · 나** (explore/store 탭 제거)

**Phase 진행 상태:**
- ✅ Phase 1 (스펙 문서) — #75
- ✅ Phase 2 (통합 담기, 일기 모드) — #76
- ⬜ **Phase 3 (다음 1순위) — 5탭 재정의**: `src/components/premium/tab-bar.tsx`의 explore(`/core-brain`)·store(`/wiki`) 탭 제거 → 담기(`/capture`)·세컨비(`/jarvis`)·공상(`/imagine`) 추가. `/journal`은 진입점 19곳이라 삭제 말고 `/capture`로 **redirect**. ⚠️ journal은 Lv3 게이트(checkGate)·firstRun 파라미터(onboarding.tsx:85, index.tsx:239)가 있으니 redirect 시 깨지지 않게 처리.
- ⬜ Phase 4 — 마을 탭 도착지를 records 도메인 필터 뷰로 통일 (relatedness.ts의 VillageId와 정합). 현재 마을→trinity/insights/interview로 불일치.
- ⬜ Phase 5 — `/profile`을 '나' 허브로 확장, 묻힌 화면(big-five/mbti/attachment/audit/interview/research/support/permissions/import/inbox/data/theme/manual) 명시 노출.
- ⬜ Phase 6 — 죽은 라우트/중복 정리, i18n·테스트.

> **사용자 메모: "하다보면 별로일 수도 있어."** → 재설계는 가역적으로. 각 Phase는 독립 PR + 독립 동작(중간에 멈춰도 안 깨짐). 별로면 해당 Phase PR만 revert하면 됨. Phase 2까지는 `/journal` 원본을 남겨둬서 롤백 안전.

### 복구 방법 (다음 세션 시작 시)
1. `git checkout main && git fetch origin main && git pull origin main` (HEAD `d77cb00` 이상)
2. `npm ci --legacy-peer-deps && npm run verify` (662/662 green 확인)
3. `cat docs/MENU_RESTRUCTURE.md` 읽기 — 재설계 전체 맥락 + Phase별 할 일 + 확정 결정
4. Phase 3부터 이어서: tab-bar.tsx 교체 + /journal redirect (위 ⚠️ 주의사항대로)

### 핵심 파일 (재설계 관련)
```
docs/MENU_RESTRUCTURE.md              재설계 단일 소스 (스펙+Phase+결정)
src/components/premium/tab-bar.tsx    5탭 정의 (Phase 3 대상)
src/app/capture.tsx                   통합 담기 (journal+capture, Phase 2 완료)
src/app/journal.tsx                   원본 일기 (Phase 3에서 redirect 예정, 아직 살아있음)
src/lib/graph/relatedness.ts          domainForTags + relatedEdges (#74)
src/lib/persona/evidence.ts           mergeEvidence (records+sources 읽기 통합, #71)
src/lib/chat/personas.ts              캐릭터별 페르소나 (#71)
src/components/graph/NavGraph.tsx     메인 그래프 (마을 이름표·연관선·캐릭터 탭)
```

### 알려진 미해결 (재설계와 별개 트랙)
- capture(`sources`) 조각은 아직 **메인 그래프 미반영** — 메인은 `wiki_pages`만 읽음. (기록 화면은 #71로 통합됐지만 그래프는 별개.)
- 연관성은 "공유 태그" 기준 — 임베딩 의미 유사도는 범위 밖.
- 실제 Gemini 라이브 연결 안 됨 (mock 유지).

---

## Earlier — 2026-05-30 / premium closeout v3 머지 + reference-assetization audit 진행 중 (미완료)

### 어디까지 왔나
- **main HEAD**: `f6cc931`
- 이번 세션 머지된 PR (시각/그래프 UX 폴리시 연속):
  - #56 loading reliability(무한로딩 수정) + external import(/import) + first-run dismiss + auth/loading premium
  - #57 main-graph restructure — 기본 tier 1+2, 6 도메인 섬, ribbon glow
  - #58 graph-UX overhaul — layering, 1-finger pan, sectors, tap-zoom, light text, branded loader, back arrow
  - #59 cross-LLM handoff note (docs)
  - #60 refine-v2 — graph gestures/layers/sectors, auth hero + eye icon, HUD cleanup
  - #61 **closeout-v3** — premium islands(no-square core), workers+Lumi(글로벌 클럭 모션), tier icons(종이/책/링크/큐브/크리스탈), free camera + 원래대로 reset, readable Pretendard bottom sheet, transparent auth hero
- **테스트**: `npm run verify` green — jest **627/627 (64 suites)**, lint 0 err, C1~C12.
- **working tree**: clean.

### ⏳ 이번 세션 미완료 작업 (다음 세션 1순위)
**premium reference assetization audit** — 사용자가 4개 zip(2ndB_AtoZ_premium part1~4)을 업로드. `premium_references/` 프리뷰 이미지 품질을 최종 기준으로 삼아, 현재 적용된 단순 placeholder 자산을 식별·교체 목록 작성하는 **감사 보고서**가 목표. 코드 대규모 수정 금지(보고서 우선), 단 명백한 버그(검은 사각형 wrapper)는 즉시 수정 허용.
- 레퍼런스 추출 위치(재추출 필요, /tmp는 ephemeral): 업로드 zip은 `/root/.claude/uploads/bb7deded-fdd7-42d2-b73f-0a60ec4d3d1c/`.
- 핵심 레퍼런스: 01_character_sheet · 02_main_graph · 03_chat · 04_core_brain · 05_imagine · 06_journal_capture · 07_wiki_records · 08_onboarding · 09_settings_profile · 10_system_board (+ alt 11~16).
- 감사 항목: (1) island 자산 (2) character 자산 (3) tier3/4 node 아이콘 (4) UI panel/card/sheet 비교 (5) 교체 우선순위 P0/P1/P2 (6) 필요한 새 production asset 목록(assetKey/description/targetReference/format/size/usedIn/replaces/priority 형식) (7) 최종 제안 A/B/C. 마지막에 plain-text handoff 출력(마크다운 테이블 금지).
- 보고서만 작성, PR/머지 불필요(단 검은박스 등 버그 수정 시 평소 PR 흐름).

### 활성 인프라
- **Supabase**: `zoacryukmdeivmolvyhj`, gemini-proxy edge function 활성. 배포 기본 `EXPO_PUBLIC_LLM_MODE=mock`.
- **Deploy**: main push → GitHub Pages 자동(~2–3분). Live: <https://simon-yhkim.github.io/2nd-B/>.
- **현재 그래프 아트 자산**: 전부 `public/assets/2ndb-closeout-v3/` 사용 중 (islands/workers/tier-icons/shards/auth). 구 팩(2ndb-refine, premium-closing, cosmic-pixel-v2 등)은 일부 잔존하나 IslandArt/WorkerSprite/TierIcon는 closeout-v3를 참조.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **reference assetization audit 보고서 완료** (위 미완료 항목) | medium | ⭐ 사용자 직전 요청, 이어서 진행 |
| B | audit 결과의 P0 항목 즉시 수정 (검은박스 wrapper 등 버그성) | small | A의 부산물 |
| C | Wiki 딥 리스타일 / 평가 화면 questionnaire 프리미엄 컴포넌트 | medium | 이전부터 누적된 잔여 |
| D | 실제 Gemini 라이브 연결 (mock→live, Vertex 권장) | small(설정) | XPRIZE 대비 |

### 적용 중인 정책 (영구 — 이번 세션 재확인)
1. **PR 흐름**: fresh main에서 새 브랜치 → draft PR → **CI(verify+lint) 그린 확인 후** squash 머지 → 사후 보고. (이번 세션 한 번 CI 확인 전 머지 실수 있었음 — 반드시 그린 먼저.)
2. **브랜치 패턴**: `git fetch origin main && git checkout main && git reset --hard origin/main` 후 새 브랜치.
3. **순수 로직은 별도 모듈 + jest 테스트** (world-layout, zoom-math, import-external 등). UI는 컴포넌트 얇게.
4. **C1~C12 + forbidden lexicon** 강제. 임상어/기술어(RAG/vector/embedding/classifier) UI 노출 금지.
5. **메인 그래프는 라이트 모드에서도 항상 다크** (PremiumAppShell이 ForceDark로 children 감쌈).
6. **둥근모꼴(NeoDunggeunmo) 픽셀폰트 전역**, 단 긴 한글 본문/바텀시트 설명은 `fontFamilies.readable`(Pretendard/system).
7. 강제 푸시/main 직접 푸시/`.env` 커밋 금지.

### 핵심 파일 위치
```
src/components/graph/NavGraph.tsx          그래프 본체 (제스처/섹터/포커스/노드시트/워커 마운트)
src/components/graph/world-layout.ts       순수 6섹터 레이아웃 + sectorFocus (테스트됨)
src/components/graph/zoom-math.ts          clampPanFree/cameraOffHome 등 (테스트됨)
src/components/graph/CharacterPathLayer.tsx 워커 커뮤트 (글로벌 클럭, 마운트 리셋 없음)
src/components/art/IslandArt.tsx           도메인 섬 PNG (closeout-v3)
src/components/art/WorkerSprite.tsx        7 워커 6프레임 워크 스트립 (글로벌 클럭)
src/components/art/TierIcon.tsx            tier3/4 조각 아이콘 (paper/book/link/...)
src/app/(auth)/sign-in.tsx                 transparent auth hero + eye icon
src/components/ui/InlineLoader.tsx         브랜드 로더
src/lib/theme/ThemeContext.tsx             ForceDark
src/theme/typography.ts                    NeoDunggeunmo + fontFamilies.readable
public/assets/2ndb-closeout-v3/            현재 그래프 아트 자산 (islands/workers/tier-icons/shards/auth)
```

### 검증
```bash
npm run verify   # lint + type + i18n + lexicon + LLM boundary + C1~C12 + jest (627)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# 큐 A — reference assetization audit 보고서 완료부터.
# 업로드 zip 4개: /root/.claude/uploads/bb7deded-fdd7-42d2-b73f-0a60ec4d3d1c/
```

---


---

## Latest — 2026-05-29 / v2 design-pack integration — 10 packs + onboarding (PR #41–#51)

### 어디까지 왔나
- **main HEAD**: `3570a8b`
- 이번 세션 머지된 PR (11개, 전부 squash + CI green):
  - #41 Phase-3 F/C/E/D + 세컨비 rename + lightCosmic + walker/signature/source-chips
  - #42 Cosmic Pixel Graph Village mobile (Phase 1/2: bottom-sheet, zoom-tier-gating 0.65/1.1, mint highlight+dim, bigger nodes)
  - #43 SecondB sprite pack v2 + **cosmic entry surface** (sign-in/loader → cosmic; fixed "라이브에 변화 없음" = 변경이 로그인 뒤라서)
  - #44 companion sprite pack v2 (모모/루루/아치/벨라/가디 event characters)
  - #45 mobile-graph pack v2 (v2 node art + HUD 버튼)
  - #46 SecondB chat v2 (node context pill, 참고한 조각 grounding, reference drawer, quick actions)
  - #47 Core Brain / 나의 중심 화면 (`/core-brain`)
  - #48 Imagine / 공상 작업실 **생성 파이프라인** (큐 B 완료 — Gemini `purpose:"imagine"`)
  - #49 journal/capture v2 (오늘의 조각 / 조각 담기 + graph-link success)
  - #50 wiki/records v2 (지식 창고 + 검색 + handoff)
  - #51 first-run onboarding + empty graph state
- 테스트: **562 / 562 green** (57 suites). `npm run verify` 전부 통과 (lint 0 error · type · i18n parity · forbidden lexicon · LLM boundary · C1~C12).
- working tree: clean.

### 활성 인프라
- **Supabase**: `zoacryukmdeivmolvyhj` (변경 없음). **gemini-proxy v5 ACTIVE**.
- **LLM 모드**: 배포 기본 `EXPO_PUBLIC_LLM_MODE=mock`. imagine/chat/persona 모두 mock에서도 동작(구조화 mock stub 포함). 실제 생성은 `GOOGLE_API_KEY`(또는 Vertex) repo Variable 설정 시.
- **Deploy**: main push → GitHub Pages 자동 (~2–3분). Live: <https://simon-yhkim.github.io/2nd-B/>.
- **SVG 렌더 방식**: 모든 v2 픽셀 에셋은 `react-native-svg`의 `SvgXml` + 생성된 `*Xml.ts` 모듈로 렌더. **svg-transformer 안 씀**(metro/배포 안전). raw 에셋은 `public/assets/cosmic-pixel-v2/<pack>/`에 커밋(무거운 PNG preview는 제외). `eslint.config.mjs`가 `public/**` ignore.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **world-coordinate(1200×1600) 그래프 마이그레이션** (mobile-graph pack §3). 현재 NavGraph는 반응형 ring 레이아웃; 고정 월드 + translate/scale로 전환. `layout/mobile_graph_layout_example.json` 참고. **유일한 고위험 항목** — 작동 중인 제스처/clamp(`zoom-math.ts`) 코어를 건드림 | large | ⭐ 라이브 미리보기 보며 신중히. 항목별 highlight-on-return(B)이 여기 딸려옴 |
| B | **records 브라우저 + record/wiki-page 상세 화면** + 항목별 "그래프에서 보기" highlight-on-return (wiki-records §5/§6/§7, journal-capture §7-7). 그래프가 wiki_pages 기준이라 record-id 하이라이트 배선 필요 | medium-large | A와 묶으면 자연스러움 |
| C | **남은 companion event 트리거 연결**: auditCompleted/wikiSaved(모모), linkImported(루루), connectionFound/personaUpdated(아치), safetySoftStop/clear(가디). `companionEventMap`에 다 정의됨, trigger site만 연결 | small-medium | |
| D | **persona 5필드 상세**(who/forWhom/goal/do/fuel) 데이터 계약 — core-brain "나의 모습"이 현재 collecting state. 백킹 데이터 없어 보류 중 | medium | data_contract 먼저 |
| E | **CharacterPathLayer walker 모션 고도화** + sprite walk frames(이미 placeholder drift만), SecondB FAB notification/chat_ready 트리거, sleep-on-idle | medium | |
| F | **실제 Gemini 생성 연결** (현재 mock) — imagine/chat/persona를 라이브로. `GOOGLE_API_KEY` repo Variable + `EXPO_PUBLIC_LLM_MODE=live` | small(설정) | XPRIZE는 Vertex 권장 |

### 적용 중인 정책 (영구 — 이번 세션 재확인)
1. **CI 자동 머지**: PR 만들고 CI(lint+verify) green이면 draft 해제 → squash merge → 사후 보고. 사용자 명시.
2. **Branch 패턴**: 각 작업마다 `git fetch origin main && git checkout -b claude/<name> origin/main` (fresh main 위에서). 이전 PR 머지 후 새 작업은 새 브랜치.
3. **에셋 팩 통합 패턴**: zip → `public/assets/cosmic-pixel-v2/<pack>/` (무거운 PNG 제외) → 필요한 SVG만 `node`로 `src/components/art/<pack>Xml.ts` 생성 → `SvgXml`로 렌더. CSS 토큰은 기존 `cosmic.*` alias(중복 금지).
4. **날조 금지**: data_contract 원칙 — evidence 없는 요약/필드는 collecting/empty state로. (core-brain, imagine 등)
5. **C1~C12 강제** + **forbidden lexicon**(임상어 금지). `npm run check:constraints`.
6. **유저-facing vs 코드 식별자 분리**: 화면 = "나의 중심/오늘의 조각/조각 담기/지식 창고/공상 작업실/세컨비", 코드 route = `/core-brain`,`/journal`,`/capture`,`/wiki`,`/imagine`,`/jarvis`(+`jarvis_chat` purpose) 유지.
7. **DESIGN.md**: cosmic 팔레트 + accent budget(primary mint + 5 signal, 화면당 ≤3) + 뽁 overshoot + signature motion. 캐릭터는 보조자, 그래프가 주인공.

### 핵심 파일 위치 (이번 세션)
```
src/components/art/                  SvgXml art layer (CosmicPixel/SecondBSprite/CompanionSprite + *Xml.ts 생성물)
src/components/graph/NavGraph.tsx    bottom-sheet · zoom-tier-gating · mint highlight/dim · v2 node art · 공상/세컨비 handoff
src/components/graph/tier-visibility.ts  zoom→tier 순수 헬퍼 (테스트됨)
src/components/motion/useSignatureMotion.ts  save-pop / connection-glow / imagine-pulse 훅
src/app/core-brain.tsx (NEW)         나의 중심 화면 (+ evidence drawer)
src/app/imagine.tsx                  공상 생성 파이프라인 (states + 카드 + 저장)
src/app/onboarding.tsx (NEW)         5단계 첫 진입
src/app/jarvis.tsx                   세컨비 chat — node context pill · grounding · reference drawer · quick actions
src/app/{journal,capture,wiki}.tsx   오늘의 조각 / 조각 담기 / 지식 창고 (+ momo/lulu cue, graph-link success, 검색)
src/lib/llm/imagine.ts (NEW)         IMAGINE_SYSTEM + parseImagineResult(순수, 테스트됨)
src/lib/llm/{types,gemini}.ts        purpose "imagine" 추가 + 구조화 mock
src/lib/persona/{center,evidence}.ts 나의 중심 카드 + evidence 매핑 (테스트됨)
src/lib/onboarding/state.ts          온보딩 완료 플래그
src/lib/theme/tokens.ts              cosmic + lightCosmic + cosmicSky + FX 토큰
public/assets/cosmic-pixel-v2/*      10개 팩 raw 에셋
```

### 검증
```bash
npm run verify   # lint + type + i18n + lexicon + LLM boundary + C1~C12 + jest (562)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# 큐 A (world-coordinate 그래프 마이그레이션) 부터 — 단, 라이브 미리보기 보며 신중히
```

---

## Latest — 2026-05-29 / Cosmic Pixel Graph Village Phase 1 (PR #39 merged)

### 어디까지 왔나
- **main HEAD**: `6df18d1` ([PR #39](https://github.com/Simon-YHKim/2nd-B/pull/39))
- 이번 세션 머지된 PR: **#39** — 9 commits 통합 squash (nav 정리 + persona 통합 + 정량 도구 + capture + 인사이트 + Cosmic Phase 1)
- 테스트 상태: **509 / 509 green** (47 suites)
- working tree: clean
- diff: **41 files, +3,345 / -823**

### 마지막 작업 성실성 audit (2026-05-29 KST)
세션 종료 직전 self-audit 완료:

| 항목 | 결과 |
|---|---|
| 12개 신규 파일 main 에 존재 | ✅ (bfi.ts / characters.ts / QuantIntroModal+Pager / CharacterPathLayer / imagine.tsx / 보고서 HTML 등 전부 사이즈 확인) |
| tipi.ts + tipi.test.ts 삭제 | ✅ ENOENT 확인 |
| `npm run verify` on `6df18d1` | ✅ 509/509 tests, lint + typecheck + i18n parity + forbidden lexicon + LLM boundary + C1~C12 모두 PASS |
| PR #39 CI | ✅ lint + verify ×2 모두 success |
| squash merge stat 일관성 | ⚠ PR description "44 files, +2,683" → 실제 "41 files, +3,345" (squash 통합 + lockfile 차이, 기능 누락 없음) |
| 의도된 변경 누락 | 없음 |

### 활성 인프라
- **Supabase project**: `zoacryukmdeivmolvyhj` (변경 없음)
- **gemini-proxy edge function**: **v5 ACTIVE** — multimodal OCR (image base64 ≤2.7MB)
- **CI**: GitHub Actions verify + lint 모두 green
- **Deploy**: GitHub Pages auto-deploy on main push (~2-3분)
- **신규 deps** (이번 세션): `pdfjs-dist@^5.7`, `mammoth@^1.12` (`--legacy-peer-deps` 로 install)

### 사용자 confirm 필요 (전 세션 종료 시점)
| # | 항목 | 비고 |
|---|---|---|
| ① | brand color sky-blue → mint (#72F2C7) 유지? | 모든 primary button/accent 색 변경. 어색하면 되돌리기 |
| ② | 라이트 모드 정책 — cosmic-light palette 필요? | 핸드오프 "main 다크 유지" 명시, 부수 화면 토글은? |
| ③ | 6 캐릭터 sprite asset 발주 path | 외주 / Gemini 생성 / 직접 도트 선택 |
| ④ | /imagine LLM pipeline 시점 | Gemini purpose enum 에 "imagine" 추가 결정 |
| ⑤ | BFI-44 ↔ 기존 TIPI 호환 | 척도 다름 (1-7→1-5). 자동 마이그레이션 불가, Simon 본인 재평가 필요 |
| ⑥ | PR 사이즈 정책 | #39 가 41 files. 다음 PR 부터 묶음당 분리 원하면 정책 변경 |

상세: `docs/2026-05-29-session-cosmic-phase1-report.html`

### 다음 작업 큐 (Phase 3 후보)

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **6 캐릭터 sprite asset 제작** + CharacterPathLayer 의 placeholder → `<Image>` swap | medium-large | ⭐ confirm ③ 의 답에 따라 외주/생성/직접. 동시에 imagine.tsx 의 velaSpriteSlot 도 swap |
| B | **/imagine LLM pipeline wiring** — Gemini `purpose: "imagine"` 추가 + classify-track + 출력 카드 7섹션 동적 채움 | medium | confirm ④ 시작 시 |
| C | **persona / core-brain 카드 구조 §7-2 재편** — "지금 가장 밝은 방향" / "요즘 불 켜진 동네" / "이걸 만든 조각" 카드 | medium | Cosmic Phase 1 의 5번 항목 완성 |
| D | **signature motion** — 저장 (루루 뽁) / 연결 발견 (아치 라인 켜짐) / 공상 (벨라 핑크 신호) animation system | medium-large | 핸드오프 우선순위 8 |
| E | **voice sweep 잔여** — BFI / MBTI / ECR-S / Interview / Wiki 의 clinical 잔여 → Core Brain 일인칭 복수 | medium | HANDOFF B 잔여 |
| F | **DESIGN.md 3-color rule 갱신** — cosmic accent 5-6색 정책 명확화 | small | 다른 PR 시작 전 권장 |
| G | **lightCosmic palette 설계** (confirm ② = "필요" 답 시) | small-medium | semantic 의 light 매핑 추가 |

### 적용 중인 정책 (영구 — 이번 세션 reaffirmed)
1. **CI 자동 머지**: PR 만들고 CI 그린되면 squash auto-merge. PR #39 이 그렇게 머지됨.
2. **Branch reset 패턴**: 이전 PR 머지 후 `git fetch origin main && git reset --hard origin/main`. 안 하면 충돌.
3. **개발 branch**: 각 세션마다 자기 branch 만들기 (예: `claude/previous-session-handoff-uszkl`). 같은 branch 누적 push 도 가능하지만 PR 사이즈가 커짐 — confirm ⑥ 정책 결정 대기.
4. **C1~C12 강제** — `npm run check:constraints` CI 에서 강제. 약화 금지.
5. **forbidden lexicon** — 자세한 단어 목록은 `src/lib/safety/lexicon.ts`. character voice 라인 단위 테스트 + CI scan 으로 defense in depth.
6. **DESIGN.md** bounce/elastic 금지. PR #34 의 뽁 overshoot 만 명시 예외.
7. **개발명 vs 유저-facing 분리**: 코드 식별자 = "Core Brain", 화면 문구 = "나의 중심" (handoff §7-2 정책).

### 핵심 파일 위치 (이번 세션 변경)
```
src/lib/theme/tokens.ts                     cosmic palette + characters + semantic 매핑 pivot
src/lib/characters.ts (NEW)                 6 캐릭터 roster + voice + 라우트 매핑
src/lib/persona/bfi.ts (NEW)                BFI-44 44문항 + friendly subtitle
src/lib/persona/build.ts                    loadLatestMbti/Attachment/Bfi + traitsSource
src/lib/persona/mbti.ts                     16 → 32 items + subtitle
src/lib/persona/attachment.ts               + subtitle 12개
src/lib/audit/frameworkLabels.ts (NEW)      Framework KO/EN 라벨
src/lib/wiki/capture.ts                     userTags + track frontmatter 영속화
src/lib/wiki/capture-file.ts                PDF/DOCX dynamic import (web)
src/components/quant/QuantIntroModal.tsx (NEW)  시작 사전고지 modal
src/components/quant/QuantPager.tsx (NEW)       5문항/페이지 + progress
src/components/graph/CharacterPathLayer.tsx (NEW)  6 캐릭터 placeholder (asset slot)
src/components/graph/NavGraph.tsx           cosmic 색상 + imagine 노드 + 나의 중심 label
src/app/imagine.tsx (NEW)                   공상 작업실 scaffold (Vela accent)
src/app/big-five.tsx / mbti.tsx / attachment.tsx  Pager + IntroModal 적용
src/app/persona.tsx                         MBTI/Attachment 카드 + 출처 라벨
src/app/index.tsx                           FAB sprite block + ribbon "나의 중심"
src/app/insights.tsx                        Core Brain 일인칭 복수 voice
src/app/capture.tsx                         userTags + track 전달
docs/2026-05-29-session-cosmic-phase1-report.html (NEW)  세션 보고서
```

### Asset slot 명세 (Phase 3 swap 1-line)
| 위치 | 영역 | 필요 asset |
|---|---|---|
| `src/components/graph/CharacterPathLayer.tsx` styles.body ×6 | 16×14 each | `{id}-idle.png` (secondb/momo/lulu/archi/vela/gadi) |
| `src/app/imagine.tsx` styles.velaSpriteSlot | 64×64 | `vela-idle@2x.png` |
| `src/app/imagine.tsx` styles.sceneSlot ×3 | 88×88 each | 장면 thumbnail/illustration |
| `src/app/index.tsx` styles.jarvisFabSprite | 26×22 | `secondb-idle.png` (FAB 안) |
| `src/app/index.tsx` styles.mascotSlot | 52×52 | `secondb-idle@2x.png` (ribbon left) |

### 검증
```bash
npm run verify            # lint + type + i18n + lexicon + LLM boundary + constraints + jest (509 tests)
npm run check:constraints # C1~C12 단독
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# Phase 3 시작 — confirm 6 항목 답 받고 큐 A~G 진행
```

근거 파일:
- `docs/2026-05-29-session-cosmic-phase1-report.html` — 세션 보고서 (palette swatch + confirm 카드)
- 핸드오프 원본: `uploads/d8550591-65ae-4ac1-b720-2d6ef26ea366/277276a6-2ndB_pixel_graph_village_revised_handoff.html` (1914 lines)
- PR #39: <https://github.com/Simon-YHKim/2nd-B/pull/39>

---

## Latest — 2026-05-27 / Constellation v2 + 세컨비 + Capture v2

### 어디까지 왔나
`main` 의 `61e784f` 까지 4개 PR 머지 (#31 → #34). **471/471 tests green**, working tree clean, gemini-proxy **v5 ACTIVE** (multimodal OCR enabled).

| # | SHA | What |
|---|---|---|
| #31 | `e8e9456` | base components (Text/Button/Input) `useThemePalette()` 추적 + 라이프 오딧 → 과거의 나 rename |
| #32 | `f257b88` | /capture v2 — 5 모드 (메모/링크/스크랩/OCR/문서) + 일상/Pro 토글 + Gemini multimodal OCR + LLM 자동 분류 |
| #33 | `d87d6fa` | 로고 페이드 후 티어 1→4 순차 노드 등장 (랜덤) + Web Audio "뽁!" 합성음 + 엣지 reveal |
| #34 | `61e784f` | drift seamless loop + tier hue 분리 + 펄스 30% 단축 + 말풍선 뽁 + Core Brain voice + Jarvis→세컨비 + intro 모달 + viewport zoom lock |

### 활성 인프라
- **Supabase project**: `zoacryukmdeivmolvyhj`
- **gemini-proxy edge function**: **v5 ACTIVE** — multimodal OCR (image base64 ≤2.7MB, mime allowlist jpeg/png/webp/heic/heif), 안전 preamble + crisis 분류 유지
- **CI**: GitHub Actions verify + lint 둘 다 그린
- **Deploy**: GitHub Pages auto-deploy on main push (~2–3 min)

### 다음 작업 큐 — PR #34 의 follow-up

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **그래프 자체 pinch/wheel zoom** — `react-native-gesture-handler` + `react-native-reanimated` 로 `NavGraph` root 에 `GestureDetector` wrap. 페이지 viewport 는 이미 lock 됨 (`src/app/+html.tsx`) | medium | ⭐ PR #34 에서 "follow-up 별도 PR" 로 명시한 유일한 항목 — 가장 먼저 권장 |
| B | **전체 문구 sweep** — Insights / Trinity / Interview / Wiki 화면들이 아직 clinical voice. Core Brain 일인칭 복수 ("우리") 로 전환 | medium-large | i18n keys 만지면 EN↔KO parity 깨지지 않게 주의 (C7) |
| C | **`sources.wiki_track` DB 마이그레이션** | medium | PR #32 의 하이브리드 옵션 C 의 phase 2 (당시 phase 1 만 처리). Supabase migration + ingest layer 가 컬럼 읽도록 업데이트 |
| D | **태그/track 영속화** | small-medium | PR #32 capture flow 가 LLM 분류 결과를 Alert 만 보여주고 frontmatter 업데이트는 안 함. **C 와 묶어 처리 권장** |
| E | **PDF/DOCX 바이너리 텍스트 추출** | medium | 현재 capture-file.ts 는 text MIME 만 추출. `pdfjs-dist` (PDF) + `mammoth` (DOCX) 추가 |

### 적용 중인 정책 (영구)

1. **CI 자동 머지**: PR 만들고 CI 그린되면 자동 squash merge → 사용자에게 사후 보고. 사용자가 명시한 정책.
2. **Branch reset 패턴** (충돌 회피): 이전 PR squash 머지 후 새 PR 시작 전 항상:
   ```bash
   git fetch origin main && git reset --hard origin/main
   # 새 commit 만들기 전에 fresh main 위에서 시작
   ```
   안 하면 PR #34 머지 시 충돌 났던 그 패턴 반복.
3. **개발 branch**: 사용자 환경마다 다름. 현재 세션은 컨테이너에 따라 `claude/exciting-galileo-Qapf4`, `claude/previous-session-handoff-uszkl` 등. **각 새 세션에서 자기 branch 로 작업 → PR → 머지**.
4. **C1~C12**: `npm run check:constraints` 가 CI 에서 강제. 약화 금지.
5. **DESIGN.md**: bounce/elastic 금지가 원칙. PR #34 의 뽁 overshoot (1.25× cap, ~400ms) 은 사용자 명시 예외 — 새로 추가하는 overshoot 도 같은 톤 유지.

### 핵심 파일 위치 (이번 세션에 변경된 것)

```
src/components/graph/NavGraph.tsx              drift/spawn/pulse/bubble/색상/엣지
src/app/index.tsx                              Core Brain ribbon + mascot 자리
src/app/+html.tsx (NEW)                        viewport zoom lock
src/app/capture.tsx                            5-mode capture
src/app/jarvis.tsx                             세컨비 + intro modal
src/lib/audio/pop.ts (NEW)                     Web Audio "뽁!" synth
src/lib/wiki/capture-image.ts (NEW)            Gemini multimodal OCR
src/lib/wiki/capture-file.ts (NEW)             DocumentPicker
src/lib/wiki/classify-track.ts (NEW)           LLM tag/track suggestion
src/lib/llm/types.ts                           image? field + capture purposes
src/lib/llm/gemini.ts                          image forward to proxy
supabase/functions/gemini-proxy/index.ts       v5 — multimodal support
locales/{ko,en}/jarvis.json                    세컨비 strings + intro
```

### 검증

```bash
npm run verify                # 풀 게이트: lint + type + i18n + lexicon + LLM boundary + constraints + jest (471 tests)
npm run check:constraints     # C1~C12 단독
```

### 다음 세션 시작하는 법 (간단)

```bash
git fetch origin main
git checkout main && git pull
# 또는 자기 branch 에서
git fetch origin main && git reset --hard origin/main
# 이 파일 읽기
cat docs/HANDOFF.md
# A 작업부터 시작 (또는 사용자 선택)
```

---

## Sprint 0 (historic) — 2026-05-25

## 1. What is live right now

| Artifact | Status | Link |
|---|---|---|
| Web preview (Expo Web → GitHub Pages) | 🟢 Live, HTTP 200 | <https://simon-yhkim.github.io/2nd-B/> |
| GitHub repo | 🟢 main + claude/awesome-clarke-ZJgc3 | <https://github.com/Simon-YHKim/2nd-B> |
| Merged PR | 🟢 #3 closed | <https://github.com/Simon-YHKim/2nd-B/pull/3> |
| Expo project (placeholder, no builds pushed) | 🟡 Empty dashboard | <https://expo.dev/accounts/simon_k/projects/2nd-brain> |
| Supabase project | 🟡 Migrations applied via Edge Function; client env vars not set on Pages build | — |
| Gemini API | 🟡 Mock mode only (`EXPO_PUBLIC_LLM_MODE=mock`); no key configured | — |

The deployed Pages build runs with **demo Supabase placeholders** (`demo.invalid.supabase.co`) — landing page shows a yellow demo-mode banner. Real auth/save will only work once real Supabase repo Variables are set.

---

## 2. The 12 hard constraints — never weaken these

CI-enforced via `npm run check:constraints`. C1–C10 + C12 PASS; C11 PARTIAL.

| ID | Rule | Location |
|---|---|---|
| C1 | All LLM calls through `src/lib/llm/gemini.ts`; foreign LLM SDKs blocked | ESLint flat config + `scripts/check-llm-import-boundary.ts` |
| C2 | `@google/genai` with `vertexai: true` when `EXPO_PUBLIC_USE_VERTEX=true` | `src/lib/llm/gemini.ts` `getClient()` |
| C3 | `ai_audit_log` INSERT on every Gemini call (including mock + crisis) | wrapper `insertAiAuditLog()` |
| C4 | `revenue_events` has `month_bucket` + `is_related_party` + `customer_relation_type` | migration 0005 + 0010 trigger |
| C5 | `testimonials.consent_given_at NOT NULL` | migration 0006 |
| C6 | Judge mode auto-flag for `@xprize.org`, `@devpost.com`, `@hacker.fund` | DB trigger 0010 + `src/lib/judge/domains.ts` |
| C7 | i18n EN ↔ KO key parity, EN canonical | `scripts/check-i18n-keys.ts` |
| C8 | `knowledge_sources` requires DOI/URL + verification pair | migration 0007 + 0014 |
| C9 | `classifyInput()` runs before any LLM call; red zone short-circuits | `src/lib/llm/gemini.ts` + `src/lib/safety/classifier.ts` |
| C10 | Age-tiered sign-up: 14-17 self-consent minors + adults direct; <14 guardian consent (PIPA §22-2) | migration 0028 + `src/lib/supabase/auth.ts` + `BirthDateField` |
| C11 | Support SLA = 2 business days (KST) | README §Support · auto-responder Sprint 1 |
| C12 | README "Pre-existing assets used" section | README §Pre-existing assets |

**Vocabulary policy**: Forbidden lexicon scan (`scripts/check-forbidden-lexicon.ts`) blocks 7 EN + 4 KO clinical terms. Source of truth: `src/lib/safety/lexicon.ts`. Allowlist: `LEXICON_SCAN_ALLOWLIST` in the same file.

---

## 3. RAG engines — all 6 wired

`src/lib/knowledge/` + `src/lib/llm/`. 121/121 tests pass.

| Engine | File | Pure / IO |
|---|---|---|
| **retrieve** | `src/lib/knowledge/retrieve.ts` `retrieveEvidence` | IO (Supabase queryRows) |
| **classify** | `src/lib/llm/safety.ts` `classifySafety` (lexicon + Gemini Flash conservative union) | IO (Flash) |
| **rank** | `src/lib/knowledge/retrieve.ts` `rankRows` | Pure |
| **fuse** | `src/lib/knowledge/engines.ts` `fuseFrameworks` (round-robin multi-framework) | Pure |
| **distill** | `src/lib/knowledge/engines.ts` `distillContext` (first+last+packed-middle) | Pure |
| **memorize** | `src/lib/knowledge/engines.ts` `buildMemorizedPattern` → `memorized_patterns` table | Builder pure; INSERT in `records/create.ts` |

Cross-engine feedback loop: journal entry → callAdvisor → memorize → `memorized_patterns` → `buildPersona` reads histogram → persona screen surfaces top-3 pattern kinds.

---

## 4. Three CSO audit findings closed this sprint

| # | Severity | File | Fix |
|---|---|---|---|
| 1 | 9/10 | `src/lib/llm/gemini.ts:329-410` | `callAdvisor` now re-classifies Gemini Pro output; RED swap to `fixedCrisisResponse` + insert crisis_event with `output_swap` trigger |
| 2 | 8/10 | `src/lib/knowledge/retrieve.ts:215-260` | `<UNTRUSTED type="...">` fences around user-influenced data (knowledge_sources rows, conversationContext, user_message) + sanitizer + INJECTION GUARD rubric |
| 3 | 9/10 | `db/migrations/0016_drop_admin_exec_sql.sql` | Dropped SECURITY DEFINER `admin_exec_sql` after seeding completed (94 rows in `knowledge_sources`) |

Finding #4 (anonymous-callable Edge Function `seed-knowledge-base`) is functionally neutralized by #3 — RPC is gone so any call returns PostgREST 404. Remote function deletion is a Supabase admin action.

---

## 5. What needs to happen next — ordered by impact

### 5.1 To make the live URL functional (not just a UI preview)

1. **Set Supabase repo Variables** in GitHub Settings → Secrets and variables → Actions → Variables:
   - `EXPO_PUBLIC_SUPABASE_URL` = your project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = your anon key
2. **Re-push to main** (or `workflow_dispatch` the `Web preview (GitHub Pages)` workflow). Build re-runs, demo banner disappears, auth/save work end-to-end.
3. **Verify** by signing up with a test email, completing the 5-question audit, viewing the persona screen.

### 5.2 To enable native iOS/Android builds in the Expo dashboard

1. `eas login` and `eas init --id <your-project-id>` (the `2nd-brain` slug already matches).
2. `eas build --platform ios --profile preview` (or `--platform android`).
3. Apple Developer account ($99/yr) required for iOS TestFlight; Android needs Google Play Console ($25 one-time).
4. Both platforms can be built via Expo's hosted infra; no local Xcode/Android Studio needed.
5. EAS profile config lives in `eas.json` (checked in, untouched).

### 5.3 To enable live Gemini calls

Pick one path:
- **Direct API**: set `GOOGLE_API_KEY` repo Variable. Set `EXPO_PUBLIC_LLM_MODE=live` in the workflow env.
- **Vertex AI** (recommended for XPRIZE judge claim — uses Google Cloud product): set `EXPO_PUBLIC_USE_VERTEX=true` + `GOOGLE_CLOUD_PROJECT=<your-project>` + ADC credentials via OIDC or service account.

The wrapper picks the path automatically based on env (`src/lib/llm/gemini.ts:40-57`).

### 5.4 C11 auto-responder (PARTIAL → PASS)

Currently README has SLA text + GitHub workflow skeleton at `.github/workflows/issue-sla.yml`. Missing:
- Gmail filter for `support@2nd-brain.app` → autoresponder template with 2-business-day SLA wording (EN + KO)
- Devpost mobile push notification on inbound message
- Auto-tag GitHub issues received outside business hours with `outside-hours` label

---

## 6. Pending Sprint 1 work surfaced this session

| Item | Notes |
|---|---|
| Forgot-password flow | `src/app/(auth)/sign-in.tsx` shows Alert placeholder. Real flow needs Supabase `resetPasswordForEmail` + new screen for the recovery token redirect. |
| Engine eval harness | RAG retrieval works but no eval set exists. Build 50–100 prompt/expected-evidence pairs to score retrieve+rank quality. |
| Android widget | `react-native-android-widget` is in package.json, no widget code yet. Sprint 2 per blueprint. |
| OTA channel | EAS Update for over-the-air JS updates. Wire after first `eas build` succeeds. |
| Sentry + PostHog | env vars wired in `src/lib/env.ts` (optional); no init code yet. |
| Persona LLM extraction | Currently heuristic over 5-keyword regex. Full LLM extraction needs ≥50 entries per user (Sprint 3 per blueprint). |

---

## 7. How to resume work in cowork

```bash
git clone https://github.com/Simon-YHKim/2nd-B.git
cd 2nd-B
cp .env.example .env  # fill in Supabase + Gemini values
npm install --legacy-peer-deps
npm run verify        # full gauntlet: lint + tsc + i18n + lexicon + boundary + constraints + jest
npm start             # Expo dev server
```

**Per-PR checklist** before push:
- `npm run verify` clean
- `npm run check:constraints` 12/12 PASS (or 11 PASS + C11 PARTIAL until auto-responder lands)
- Update `CHANGELOG.md` if exists (currently no CHANGELOG — add when version bumps land)
- If touching `src/lib/safety/lexicon.ts`, double-check `check-forbidden-lexicon.ts` still passes (LEXICON_SCAN_ALLOWLIST is the escape hatch for legitimate uses in safety code itself)

**Key files to know:**
```
src/lib/llm/gemini.ts          # C1/C2/C3/C9 entry point — touch with caution
src/lib/safety/classifier.ts   # red/yellow/green lexicon classifier
src/lib/safety/lexicon.ts      # SINGLE SOURCE OF TRUTH for forbidden + crisis terms
src/lib/knowledge/retrieve.ts  # RAG retrieve + rank + fuse + prompt assembly
src/lib/knowledge/engines.ts   # fuse, distill, memorize (pure functions, easy to test)
src/lib/env.ts                 # zod-validated runtime env with demo fallback
db/migrations/                 # 17 migrations, supabase-dry-run CI applies all
docs/research/CLAUDE.md        # safety rubric loaded into every Advisor LLM call
docs/research/batches/*.md     # 23 framework batches (Big Five, SDT, Attachment, etc.)
supabase/seed/*.sql            # 21 seed files, 94 rows already applied
DESIGN.md                      # design source of truth — read before any UI change
```

**Commit message convention**:
- `feat:` new feature · `fix:` bug fix · `polish:` UX/visual polish · `chore:` infra/scaffolding · `docs:` docs only · `security:` security-relevant
- Subject ≤ 70 chars, body explains the **why** in 2–4 paragraphs

---

## 8. Skills invoked this session (with artifacts)

10 skills, each produced something durable:

| Skill | Artifact |
|---|---|
| `/design-consultation` | `DESIGN.md` (pre-compact) |
| `/review` | CSO audit findings (pre-compact) |
| `/health` | Composite quality score 10/10 (pre-compact) |
| `/update-config` | `.claude/settings.json` (pre-compact) |
| `/canary` | Health check on live URL + bundle inspection |
| `/context-save` | `~/.gstack/projects/Simon-YHKim-2nd-B/checkpoints/20260525-100238-sprint-0-shipped-rag-engines-web-live.md` |
| `/document-release` | Aborted (on base branch — correct per skill rules) |
| `/retro` | `.context/retros/2026-05-25-1.json` + narrative |
| `/learn` | 5 entries in `~/.gstack/projects/Simon-YHKim-2nd-B/learnings.jsonl` |
| `/code-review` | 4 findings, 1 real bug fixed + shipped (`f3d2a02`) |

Skills NOT invoked because they don't apply in this environment:
- Browse-dependent (qa, design-review, devex-review, scrape, browse, canary screenshots): sandbox Chromium rejects public GitHub Pages cert with `ERR_CERT_AUTHORITY_INVALID`. **In cowork, with a real browser, these will work** — recommend running `/qa` and `/design-review` against the live URL once Supabase vars are set.
- iOS-only (ios-qa, ios-fix, ios-design-review, ios-sync, ios-clean): no native iOS build yet. Run after `eas build --platform ios` succeeds.
- Setup/maintenance one-shot (gstack-upgrade, setup-gbrain, setup-browser-cookies, freeze, unfreeze): no work to do on a clean repo.

**Pre-merge skill order to try in cowork** (highest expected ROI first):
1. `/qa` — systematic test the live URL, fix bugs iteratively
2. `/design-review` — visual polish on live UI (catches what static review can't)
3. `/cso` — fresh security audit with browser-level checks
4. `/codex review` — independent diff review by GPT for pair second-opinion
5. `/plan-eng-review` — architecture review of what's shipped (catches structural debt)

---

## 9. Open questions / decisions waiting on you

| # | Question | Default if no decision |
|---|---|---|
| Q1 | Supabase project: existing project or fresh one? Project ref + region? | Free-tier in `us-east-1` |
| Q2 | Gemini access: direct API or Vertex AI? | Vertex (XPRIZE judge mandate) |
| Q3 | Apple Developer account ready for iOS TestFlight? | Defer iOS to Sprint 1 mid-point |
| Q4 | Sentry workspace + PostHog project IDs? | Skip telemetry until usage stabilizes |
| Q5 | Forgot-password flow: email-link or one-time code? | Supabase default (email-link via OTP) |
| Q6 | Demo banner: keep visible when env vars set but the demo subdomain is intentional? | Banner hides automatically when real URL configured |

---

## 10. Two things never to commit

- `.env` (gitignored, but verify before `git add`)
- `.claude/settings.local.json` (per-user, gitignored)

---

_End of handoff. Web preview: <https://simon-yhkim.github.io/2nd-B/>. Latest main: `d45ad4e`. CSS PR #3 merged at 09:47 KST 2026-05-25._
