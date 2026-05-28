# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 오래된 sprint 핸드오프는 아래로 밀어둠.
> Live: <https://simon-yhkim.github.io/2nd-B/>

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
5. **forbidden lexicon** (진단/치료/치유/정신건강/심리상담/멘탈) — character voice 라인 단위 테스트 + CI scan 으로 defense in depth.
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
| C10 | Sign-up requires birth_date ≥ 18 (UI + auth + DB CHECK) | migration 0002 + `src/lib/supabase/auth.ts` + `BirthDateField` |
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
