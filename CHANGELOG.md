# Changelog

All notable changes to 2nd-Brain are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project follows
Conventional Commits.

## [Unreleased]

## [0.7.0] - 2026-08-28

인터뷰가 "모르겠어요"를 받아준다. 그리고 어두운 앱 뒤에 깔려 있던 밝은 판이 없어졌다.

### Added

- **인터뷰에 `모르겠어요`** — 기억이 안 나는 것을 억지로 짜내지 않아도 된다. 누르면
  그 칸을 비운 채 **같은 층에서 발판**을 하나 준다. 다음 층으로 넘어가지 않는다.
- **말문 후보 칩** — 무슨 말부터 할지 막힐 때 세컨비가 두 개까지 던진다.
  ⚠ 누르면 **보내지 않고 입력창을 채운다.** 고쳐 쓰고 보내는 것이 기본이다.
- 개인정보 화면에서 **내 데이터 보기(`/data`)로 가는 줄** — 있는 화면인데 가는 길이 없었다.

### Changed

- **카피를 해요체로 통일** — `별자리도` → `별도`, `이어서 하기` → `이어가기`,
  `정리하세요` → `정리해요`, 공유 카드와 계정 화면의 문장들.
- **반투명을 미리 합성한 색으로** (PIXEL-CLAY 규칙 4). 화면은 그대로고 픽셀만
  정직해진다 — 겹쳐 그리던 것을 미리 섞어서 한 번에 칠한다.
- 오프닝이 **4초 정수 프레임**으로 재생된다. 아틀라스 바이트도 결정적으로 만든다.

### Fixed

- **앱 전 화면 뒤에 밝은 회색 판이 깔려 있었다.** 라우터 기본 테마가 화면 밖 여백을
  `rgb(242,242,242)` 로 칠하고 있었다. 눈으로는 잘 안 보이는데 어두운 화면의 가장자리와
  전환 순간에 새어 나왔다.
- **`{{who}}` 가 글자 그대로 찍히고 있었다** — 계정 화면 등에서 호칭 자리가 채워지기
  전에 첫 렌더가 지나가고 있었다.
- `/me/<별>` 경로와 요약이 다시 열린다.

### Security

- `fast-xml-parser` 5.7.0 으로 올렸다.

### Internal

- **P1 레퍼런스 대조**: 98점 이상 **6 → 37 / 64**, A축(픽셀 규율) **64/64 만점**,
  픽셀 래칫 **333 → 165**. 이탈 20건은 사유와 함께 기록됐다.
- ⚠ **C축(구조 일치)은 꺼져 있다.** 밴드 서명은 앱 캡처에게 자기 짝을 고르게 했을 때
  **0/6** 이었다 — 무작위(1/6)보다 낮다. 이미지에서 재도 같은 함수라 결과가 같다.
  다시 켜려는 사람은 **자기 짝 찾기부터 통과시킬 것.**
- 규칙 4 가드가 위반이 아닌 것을 세고 있었다 — `opacity: 0`·`1` 과 `android_ripple`
  안의 알파. 둘 다 변이 검증하고 근거를 주석에 남겼다.
- CI: EAS 아카이브에서 서명 시크릿 제외, 릴리스 아티팩트 provenance,
  TestFlight 제출 게이트.

### Distribution

- GitHub draft release는 같은 `main` 커밋에서 완료된 **Preview APK, Production AAB,
  Production IPA**를 EAS provenance·앱 식별자·버전·런타임·서명 자료·SHA-256까지
  검증한 뒤 한 번에 묶는다.
- Android와 iOS OTA는 각 플랫폼의 현재 fingerprint와 호환되는 production 빌드가
  확인된 뒤에만 같은 named EAS environment로 발행하고, 발행 후 도달성을 다시 검증한다.
- 웹 배포 경로는 GitHub Pages다: <https://simon-yhkim.github.io/2nd-B/>

## [0.6.0] - 2026-08-27

오프닝이 다시 움직인다. 초원과 망원경이 밝아오고, 허슬케이가 걸어와 접안하고,
카메라가 하늘로 올라가 북극성이 뜬다.

### Changed

- **오프닝이 프레임 애니메이션이 됐다** — 정지 초상 한 장의 투명도·크기 트윈이었던
  것을 48프레임 3.8초 재생으로 바꿨다. 그림은 새로 그리지 않았다: 승인된 아틀라스에서
  결정적으로 만든 스프라이트 시트다.
- 모달 뒤 어두운 층이 **디더**가 됐다. 반투명이 한 픽셀도 없다.

### Fixed

- 오프닝이 재생되는 동안 화면이 어두워지던 것 — 정지 로고 시절의 페이드아웃이
  남아 있어서 애니메이션이 보이기도 전에 사라지고 있었다.

## [0.5.0] - 2026-08-27

별의 밝기가 흐림이 아니라 **색과 격자**로 바뀌었다. 화면 전체에서 반투명이 빠지고,
버튼·카드·토글의 모서리가 남김없이 각졌다. 강조색은 UI 파랑과 별 시안으로 갈렸다.

### Changed

- **별 밝기 사다리** — 도메인 별 일곱과 북극성이 알파 대신 **다섯 단 색 밴딩 +
  4×4 베이어 디더**로 밝아진다. 값은 옛 알파 합성과 같은 픽셀이라 밝기의 뜻은 그대로다.
- **강조색이 둘로 갈렸다** — UI 전역은 파랑(`#5b8def`, 레퍼런스 `--accent`),
  딥스페이스 별 심은 시안(`#46B6FF`)을 유지한다. 전에는 시안 하나가 둘을 겸해
  평범한 버튼이 별과 구분되지 않았다.
- **비활성·눌림 상태가 불투명해졌다** — 버튼·칩이 흐려지는 대신 미리 합성한 색을 쓴다.
  전경도 함께 어두워지므로 비활성이 활성보다 또렷해지지 않는다.
- **모서리 0 완주** — 세 번째 반경 토큰 세트(`radii`)가 4/8/12/16 에서 0 이 됐다.
  `/support` 에 남아 있던 8px 라운드가 이것이었다.

### Fixed

- 캐논 아이콘 이름이 그림 없이 들어오면 **새 사용자의 첫 화면이 죽던** 경로를 막았다.
- OTA 도달 보고가 방금 띄운 빌드를 "좌초"로 찍던 것을 고쳤다(`eas-cli` 22.x 가 채널과
  런타임 필드를 함께 개명했다).

### Added

- **규칙 4(정적 불투명도) 가드** — 지금까지 없었다. 규칙 2·3·5 와 함께 `src/` 전체를
  래칫으로 지킨다(늘면 실패, 줄면 기준선을 내리라고 알린다).
- 다른 PC 코덱스 인계 문서 — `design/CODEX-START-HERE.md` 한 장에 부트스트랩·검증·
  프롬프트. 자료가 불완전하면 **멈춘다**.

## [0.4.0] - 2026-08-26

Every curve on screen becomes a square. The app's visual system finishes its
move to PIXEL-CLAY: icons, constellation links, charts, progress rings and
SecondB's own face are now drawn from integer rectangles instead of vector
paths, and translucency is pre-composited into countable colors instead of
being blended at render time.

### Changed
- Icons are drawn from one place. Twelve separate icon registries across the
  codebase were collapsed into a single set of 85 pixel glyphs; the same icon
  used to be drawn twelve different ways, and two of them were literally the
  same curve under two names.
- Constellation links, the museum timeline's connectors, the growth and trend
  charts, and every progress ring are now stepped cells rather than curves.
  Dashed lines become every-third-cell; a progress ring fills cells around a
  square border; a gradient area fill becomes a column per step.
- SecondB's face keeps all six mouth shapes and its glow, rebuilt from
  rectangles. The glow is a larger cell behind a smaller one rather than two
  stroke widths.
- Translucent colors are pre-composited against their known background instead
  of being alpha-blended at draw time. Where the background genuinely is not
  knowable — scrims over arbitrary content — a dither pattern replaces the
  alpha.
- Screen titles now say what the screens hold: 권한 → 권한 관리,
  개인정보 → 개인정보 · 약관. The manual's door is 사용 안내서 in every
  language, replacing a "Manual" that had been mistranslated as "manual entry".

### Added
- The manual can replay the home coachmarks, matching the reference design.
  The same control stays in Settings.
- A guard that fails the build if a curved shape returns anywhere in `src`,
  and one that counts how many icon names the design canon asks for without a
  glyph behind them.

### Fixed
- Star brightness on the home constellation keeps its meaning: the opacity
  ladder that encodes L1~L5 was deliberately left as-is rather than flattened,
  because there it is data and not decoration.

## [0.3.0] - 2026-08-26

The Big Dipper becomes one set of seven, the interview learns what "I don't
know" means, and every screen that had quietly lost its bottom tab bar gets it
back.

### Added
- The seven stars are now one thing: places where you get to know yourself
  (profile, infancy, school years, twenties, thirties onward, work, now). The
  six life domains moved off the home constellation and into the SecondB
  dashboard, reached by tapping SecondB's head. Tapping a star opens its
  summary first instead of dropping you straight into an interview.
- Brightness can now reach L5. When you have opened at least two layers of a
  period, SecondB proposes a "who I was then" summary built from that period's
  own interview transcript, and ratifying it in /review records the lift.
- The interview shows a 5xN progress matrix after a conversation ends, so the
  layers you actually opened are visible rather than inferred.
- Peers now answer five questions instead of three, and the "how others see me"
  screen draws what actually arrived instead of only the three traits the
  original model claimed were externally visible.
- Microsoft Clarity runs on native builds, off by default and behind the same
  analytics consent as the web.
- A developer screen line reports the live Clarity state (consent, flags,
  project, route, module, session) so a broken link in that chain is visible in
  the app instead of only in a dashboard.

### Changed
- The visual surface moved to the PIXEL-CLAY midnight palette. Panels are solid
  navy from the canonical ramp instead of a translucent cyan wash over near
  black, so cards read as distinct surfaces. Measured against the reference
  frames, canonical-ramp coverage went from 34% to 74% (reference 76%).
- The privacy policy now names Google Analytics 4 and Microsoft Clarity as
  processors and states the cross-border transfer under PIPA article 28-8(1)1,
  with a revision history section.
- Positioning copy across onboarding and the store surfaces matches the wording
  Simon settled on.

### Fixed
- Sixteen screens had lost the bottom tab bar and were navigation dead ends
  reachable only by the back control. They render the shared shell again.
  /onboarding deliberately keeps no tab bar.
- The reason the capture save button is disabled was only in the screen-reader
  hint. Sighted users saw a grey button with no explanation; the sentence is
  now on screen.
- PDF text extraction on the web actually works. The worker handler was never
  registered, so every PDF import silently produced nothing.
- The home speech bubble printed raw translation keys for the six domains.
- "I don't know" no longer counts as an answer that fills a cell. It keeps the
  same layer open and offers a foothold instead.
- Two ledger screens leaked the internal seven-star prefix into their labels.

## [0.2.0] - 2026-08-23

First versioned release built for distribution: the APK is attached to the
GitHub release rather than living behind an Expo login.

### Added
- Multi-vendor LLM routing. Four switches now cover every prompt purpose -
  reasoning seats, chat, the two binary-carrying purposes (OCR + voice), and
  the nine backbone purposes that previously had no switch at all. Grok (xAI)
  joins Gemini, Claude and OpenAI as a routable vendor; nothing routes there
  by default.
- Roles (`admin` / `developer` / `support`) with a JWT claim and an immediate
  revocation path, kept separate from the billing tier so a payment event can
  never overwrite an operator role.
- Cancelling a subscription now offers the refund in the same step for anyone
  inside the window, and checkout states the renewal cycle, the amount and how
  to stop it before taking payment.

### Fixed
- A signed-in user could read anyone's credit balance. The two readers are
  replaced by an argument-less `credit_summary_self()`, so the parameter that
  made it possible no longer exists.
- The leaked-password check ran only on sign-up. It now sits on the shared
  password-update path, so changing or resetting a password is covered too.
- The sign-up screen was missing one of its required legal consent rows.
- `judge_mode` (the retired contest comp flag) could be set by a crafted
  client on both the insert and the update path.
- Refunds treated credit-pack purchases as subscriptions.
- An empty env string in `eas.json` made every EAS build and OTA publish fail
  before starting.

### Removed
- The XPRIZE judge auto-flag, the flow-debugger tooling and its generated maps.


### Added
- Ops recommendations consolidated into a once-per-day brief (D-26 A17).
  The first ops visit of the day builds ONE brief covering all life domains
  in a single LLM call (cached per KST day in ops_daily_brief); every later
  passive visit/tab-flip serves its domain from the cache at zero LLM cost.
  The explicit "run again" button keeps its rich, per-domain, adherence-
  tailored call. Opted-out/minor users build nothing (engine-level privacy
  gate); domains the brief covers with no suggestion serve empty without a
  re-call, and only genuinely missing domains fall back to an on-demand call.
- SecondB chat: query-relevant retrieval (RAG) + conversation history
  (D-26 A1). Each turn now embeds the message and pulls the top-8
  semantically relevant wiki pages via pgvector kNN instead of shipping the
  whole 50-page snapshot — better grounded and ~10x smaller per-turn prompt.
  On any miss (no index, embed failure, red-zone query) it falls back to the
  legacy whole-wiki snapshot, so chat never breaks on RAG. The last 6 turns
  ride the prompt as fenced, sanitized history; C9 re-classifies each and
  DROPS any red-zone turn so a prior crisis message can't re-egress through
  the system channel.
- D-26 P0 lane: embeddings revived — `text-embedding-004` (shut down
  2026-01-14) replaced by `gemini-embedding-2` @768 MRL; gemini-proxy gains a
  spend-capped `op:'embed'` route so the keyless web build can embed at all;
  backfill batches 50 serial calls into one (with per-page fallback isolation);
  the Research screen's find-proposals button now builds the index first
  (migration 0068 nulls the dead 004-space vectors, trigger-safe).
- gemini-proxy model allowlist now includes flash-lite + the 3.x generation
  (fixes the silent 400 on every edge-routed lite classify) with a
  `GEMINI_MODELS_ALLOWED` env extension; the sub-brain cost pin now matches
  pro-class models by family pattern, not a literal id.
- Persona narrative summary is cached in `personas.patterns` keyed by a
  staleness signature (skips the 3-screen mount re-summarize storm) and its
  input is windowed (interview transcripts excluded, newest rows under a row +
  char budget sized to the proxy's 8000-char cap).
- Ops recommendations get an in-session TTL cache (stops OpsHomeScreen's
  unmetered per-tab-flip LLM refires); explicit run buttons bypass it via
  `forceFresh` so quota is never billed for a cached answer.
- D-26 Phase 2 vendor routing (Simon GO 2026-07-04): `openai-proxy` edge
  function (gpt-5.4 seat, shared spend counter + crisis gate), upgraded
  `claude-proxy` (claude-sonnet-5 default, per-purpose opus-4-8 seats,
  adaptive thinking + effort, structured-output passthrough, refusal guard),
  shared `_shared/llm-proxy-common.ts`, and client `src/lib/llm/routing.ts`
  gated by `EXPO_PUBLIC_LLM_PHASE=2` (default Phase 1 = all-Gemini, zero
  behavior change). `capture_ocr`/`capture_voice` are Gemini-pinned by owner
  directive; image-bearing calls always route Gemini.
- persona_chat 3-way taxonomy split: `persona_narrative` / `gap_synthesize` /
  `self_model_propose` (per-situation routing + honest audit attribution).
- `docs/LLM-ROUTING.md` — purpose-키 LLM 라우팅 정본 (D-26): Phase 1
  Gemini-only / Phase 2 3-vendor 매트릭스, 26-purpose 택소노미, 구조 최적화
  백로그, P0 결함 목록 (embedding 모델 셧다운, proxy lite allowlist 400,
  prod 시맨틱 안전분류 무음 강등).
- `audit_qa` follow-up now ships a bilingual system prompt (one warm
  follow-up question, anti-clinical, injection-fenced) — previously the raw
  audit answer went to the model with no instruction at all.
- Material 3 primitive kit (`src/components/m3/`): MdButton / SegBtn / MdCard /
  MdChip / Field / MdNavBar / ProgressLinear on the `m3.*` token foundation, plus
  Roboto / Roboto Mono chrome fonts (rev2 P1b).
- 세컨비 persona-capable head (`SecondbHead` `persona` prop — secondb / meta / twi
  accent tint; unset keeps the deep-space cyan) (rev2 P2).
- Phytoncide design tokens (pine/birch/mist palette + spring leaf accents)
- Serif typography pairing (Nanum Myeongjo + Source Serif 4 + Pretendard)
- NativeWind/Tailwind integration wired to the design tokens
- i18n font fallback keys (ko/en)
- Branded loading screen (logo + spinner) shown while fonts and auth
  resolve, replacing blank/`null` frames on web
- Major-update notice pipeline (`docs/RELEASE-PROCESS.md`): semver decides
  whether a release owes users a popup (major only; minor and patch stay
  silent), `npm run notice:release` drafts the publish SQL from app.json +
  CHANGELOG and stops so a human publishes it, and the notice dialog now
  branches its copy on `min_app_version` - readers who already have the
  release see the feature introduction, readers who do not get an update
  prompt (store on native, reload on web).

### Changed
- LLM routing (D-26): `interview_probe` demoted pro→flash (depth-layer choice
  is deterministic; the model only drafts one question), `northstar_propose` /
  `axis_estimate` pinned explicitly in `PURPOSE_TIER`, and `capture_ocr`
  direct-path calls disable dynamic thinking (verbatim transcription gains
  nothing from thinking tokens).
- Deep-space dock migrated to the Material 3 `MdNavBar`; 5-tab reconcile to
  별자리홈 · 담기 · 세컨비 · 위키 · 비서 (account moves out of the dock, still reachable
  via profile / settings) (rev2 P2).
- Landing page redesigned on the phytoncide theme — serif display hero,
  app logo, and accent-coloured pillar cards; migrated off the legacy
  token shim (`@/lib/theme`) to `@/theme`.

### Fixed
- OTA / native bundle: a `node:fs` source-discipline test under `src/app` was
  pulled into the app bundle by expo-router's `require.context` and broke the
  Hermes / EAS Update export — so OTA silently never published (gate-skip) since
  the test landed. Moved it out of the router root and excluded `__tests__` /
  `*.test.*` from the Metro bundle.
- Live web root URL (`/2nd-B/`) resolved to the app's not-found screen.
  Set `expo.experiments.baseUrl` to `/2nd-B` so expo-router is base-path
  aware, and removed the manual `sed` asset path-patching (plus the
  redundant `EXPO_BASE_URL` env var) from the GitHub Pages deploy workflow.
- i18n key-parity check (`check:i18n`) now runs on Windows — it split file
  paths on `/` only, so every namespace mismatched on `\` separators and
  `npm run verify` always failed locally.

## [0.0.3] - 2026-06-23

### Fixed
- The in-app loading screen and the home hero still showed the legacy Soul Core
  orb (`core_center_premium_hq.png`). Both now render the SecondB character head
  (`LoadingScreen.tsx`, `app/index.tsx`), matching the new app icon — so the
  load -> home dolly-zoom handoff stays the character, not the orb. The Soul Core
  orb is unchanged where it belongs: the graph's core node (`IslandArt`).

## [0.0.2] - 2026-06-23

### Added
- iOS build profiles in `eas.json` (preview ad-hoc + existing simulator) so an
  iOS build can run once an Apple Developer account is connected.

### Changed
- App icon, splash, adaptive icon (foreground + monochrome), favicon, and the
  iOS icon now render the SecondB character head, replacing the legacy orb art.
- The big SecondB head turns to face the touch point (perspective look-at)
  instead of only tilting sideways.
- Android release artifacts build `arm64-v8a` only, plus ProGuard and resource
  shrinking, to cut the universal APK size.

### Fixed
- Native builds connect to the real Supabase project instead of the
  `demo.invalid` placeholder (`eas.json` env and the android-release workflow).

### Removed
- Unused demo assets (react-logo, expo-logo/badge, tutorial-web), a
  byte-identical duplicate head image, and the legacy iOS icon set.
