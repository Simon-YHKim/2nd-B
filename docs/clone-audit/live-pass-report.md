# Live pixel pass — auth-gated screens via REAL login (2026-07-05)

The PR #745 blocker ("injected Supabase session never adopted by AuthContext") is **resolved by
not injecting at all**: `scripts/clone-live-pass.mjs` performs an actual UI sign-in
(`/sign-in` → `이메일로 계속하기` → QA email+password → `로그인` → authenticated redirect) with the
committed QA account (`.env.test`, `qa.ai.b18807@example.com`). The gotrue client owns the session
end-to-end, so **every previously gated route now renders its real screen live** — 32/32 captured,
0 redirects, 0 console errors on the final run.

## How this run was produced

1. Build outside the worktree (metro blockList rejects `.worktrees` paths):
   `git archive HEAD | tar -x` → `E:/_tmp-livepass` (same drive as the node_modules junction target),
   `mklink /J node_modules E:\2ndB\node_modules`, copy `.env`, then
   `EXPO_PUBLIC_UI=deep-space EXPO_USE_STATIC=true EXPO_PUBLIC_LLM_MODE=mock npx expo export --platform web --output-dir dist`.
2. `node scripts/clone-live-pass.mjs` — serves `dist` GitHub-Pages-style (`/2nd-B` prefix,
   extensionless → `route.html`, miss → `+not-found.html`), real login, then visits every mapped
   route at 390x844 (dsf 2), tapping through the LoadingScreen intro gate per page load.
3. Captures: `docs/clone-audit/current-live/NN.png`; machine report: `live-pass-report.json`.

Two harness details that were required:

- **Intro gate**: every full page load replays `LoadingScreen` (typing ≥2.5s → "탭해서 두번째 뇌를
  열기" tap gate → 4s auto-continue → 0.8s zoom). Without tapping through it, every capture is the
  mascot loader. The harness polls for the ready hint and taps.
- **Real record id**: the mapped `/record/r1` 400s for the QA account ("기록을 찾을 수 없어요").
  The harness resolves the account's first real record id via PostgREST (RLS-scoped) and rewrites
  the route before capture.

## Per-route results

Status legend: **OK** = captured live, no redirect, no console errors. Visual notes are
first-pass structural comparisons vs `reference-captures/NN.png` (ref includes a phone-bezel
mockup and is 460x820 vs live 780x1688, so pixel-diff tooling doesn't apply; comparison is
structural).

| NN | Route | Status | First-pass visual note vs reference |
|----|-------|--------|--------------------------------------|
| 02-onboard | /onboarding | OK | Matches. Live: 4 progress dots vs ref 3; starfield backdrop vs plain gradient; `건너뛰기` sits at the extreme top edge (web top safe-area inset ~0). |
| 03-ttfv | /ttfv | OK | Matches. Live adds a back button and the `이렇게 본 근거 2가지` disclosure (collapsed in ref); content vertically centered vs ref bottom-anchored. |
| 05-home | /deepspace-home | OK | Constellation, mascot, tab bar match (`휴식` rename is canon). Gap: ref's `오늘 +3` pill (top-left) missing; bell renders top-left instead of top-right; mascot bubble copy differs (data). |
| 06-capture | /capture | OK | Near pixel-match. `담기` CTA renders disabled-dim (empty form) vs ref enabled; active-tab pencil icon variant differs from ref dot. |
| 07-chat | /secondb | OK | First-run coach-mark modal overlays the screen (QA account hasn't dismissed it). Behind it, 2nd-B ribbon, persona pills (세컨비/메타비/안티비), input row match; thread empty vs ref sample convo (data). |
| 08-records | /records | OK | Real QA data (18 조각). All structure present. Gaps: `목록/그래프` toggle overlaps the mascot-banner row; `정리함` card is dark+chevron vs ref filled purple; filter chips smaller. |
| 09-settings | /settings | OK | Near pixel-match. Live adds a caption line under `설정` that ref doesn't show. |
| 10-me | /persona | OK | Matches: purple 북극성 header card, 7 domain cards, L-badges, dot meters. |
| 12-record | /record/&lt;real-id&gt; | OK | Recaptured with a real QA record id (placeholder `r1` 400'd). Real detail renders: type chip, body card, purple advisor note, tags, 연결된 기록 list. Action row below fold. |
| 13-interview | /interview | OK | Near pixel-match; live avoids ref's clipped option labels. |
| 14-bigfive | /big-five | OK | Route renders, but **empty state** (`아직 이 별은 어두워요` + 검사 시작): QA account has no Big Five results. The filled-state clone remains reference-capture-verified only. |
| 15-attachment | /attachment | OK | Same as 14 — empty state; filled ECR quadrant not live-verifiable without assessment data. |
| 16-values | /values | OK | Near pixel-match (CORE VALUES chips, spectrum bars, EN captions). |
| 17-audit | /audit | OK | Matches; timeline rail styling near-identical. |
| 18-trend | /trends | OK | Near pixel-match (chart, +34%·8주, per-star deltas, 밝기 이력). |
| 19-motivation | /motivation | OK | Near pixel-match; live adds `확신 61%` header badge. |
| 20-strengths | /strengths | OK | Near pixel-match; live adds `확신 66%` badge + advisor note. |
| 21-northstar | /northstar | OK | Header/card/actions match. Gaps: 세컨비 제안 3-item list absent (data-state) and the NORTH STAR card renders washed-out lavender vs ref deep navy. |
| 22-ratify | /ratifications | OK | Stats bar, filter chips, cards + 되돌리기 match; real QA data (161 승인, 재계산 rows) so contents differ from ref sample. |
| 23-iden | /iden | OK | Shell matches. Gaps: toggle set is 코어/콘텐츠 (2) vs ref's 4 (북극성 문장 / Big Five 검증 / 7 도메인 요약 / 원문 기록); chip `v0.1` vs ref `v2.1`; **toggles green vs ref blue**. Source check recommended. |
| 24-ops | /ops | OK | `0/0 완료` empty routine state (QA data). Live inserts an `오늘의 종합 의견` block + 리마인더 CTA not in ref; 비서 도구 grid matches. |
| 25-focus | /focus | OK | Near pixel-match (timer, duration chips, CTAs, domain chips); bottom session-stats card absent (no data). |
| 26-reminders | /reminders | OK | Matches with real reminder rows. Gap: **toggles green vs ref blue** (same accent drift as 23). |
| 27-inbox | /inbox | OK | Near pixel-match. |
| 28-connect | /integrations | OK | Near pixel-match (연결/연결됨 states incl. Apple 건강). |
| 29-import | /import | OK | Near pixel-match (파일로/계정 연동 tabs, dropzone, 약속 list). |
| 30-datareview | /data | OK | Near pixel-match; canned 124/38/2.4MB stats match ref. |
| 31-callrec | /call-reflection | OK | Matches; live adds `다음에 할게요` secondary link. |
| 32-share | /share-card | OK | Matches; card copy differs (data). Selected chip state (통찰 카드) less visible than ref's checked chip. |
| 33-plans | /plans | OK | Matches; `이용 중` badge on 별바라기 (free QA account) vs ref on 항해자 — account-state-driven, correct behavior. |
| 34-museum | /museum | OK | **Structural mismatch**: live renders the horizontal timeline canvas (1936–2026 scrubber, 챗GPT/생성AI 붐 node cards) while ref `34-museum` is the intro/room list (`지능의 역사를 걸어서 지나기` + 01 이론/02 컴퓨팅/03 머신러닝). Likely the route lands on MuseumTimelineScreen's timeline view instead of the cloned intro. Needs a source check. |
| 36-imagine | /imagine | OK | Near pixel-match (갈래 cards 확장/반전/연결 with icons + captions). |

## Gap summary (prioritized)

1. **34-museum** — only real structural mismatch: route shows the timeline view, ref shows the intro room list.
2. **23-iden** — toggle set (2 vs 4), version chip, green toggle accent.
3. **26-reminders** (+23-iden) — green toggle accent vs ref blue: likely a shared Switch color token.
4. **05-home** — missing `오늘 +N` pill; bell position.
5. **08-records** — header toggle overlap; 정리함 card fill.
6. **21-northstar** — NORTH STAR card tint; suggestions list (data-state, verify with seeded data).
7. **02/03 onboarding** — dot count, safe-area top inset, vertical anchoring.
8. Data-blocked live verification: **14-bigfive / 15-attachment** filled states need assessment
   results seeded on the QA account (or a second QA account with completed assessments).

None of these were fixed in this pass (Track C is capture + report only).

## Re-triage vs current canon (07-05)

The original pass compared live captures against `reference-captures/` (the STALE
460×820 bezel handoff). Re-triaged here against the CURRENT canon set
(`design/proto_rev2/docs/Screen-Spec/captures/NN-name.png`, 780×1640) + current
`main` code. Verdicts: **REAL-GAP** (live diverges from current canon) ·
**STALE-REF** (live matches current canon; the old ref was a different design) ·
**ALREADY-FIXED** (#750/#753/#754) · **HONEST-STATE** (empty/thin-data behavior,
not a bug) · **DEFERRED** (real but out of this token-polish pass).

| # | Finding | Verdict | Action |
|---|---------|---------|--------|
| 1 | 34-museum room-list vs timeline | STALE-REF | Canon `34-museum.png` **is** the timeline scrubber; live matches it. The room-list was the old ref. No fix. |
| 2a | 23-iden toggle set 2 vs 4 | **REAL-GAP** | Canon shows 4 fixed export categories (북극성 문장 / Big Five 검증 / 7 도메인 요약 / 원문 기록). The live 2 rows (코어/콘텐츠) were the honest schema-field render for the empty QA account. **FIXED**: added `canonIden.rows`; rebuilt the include-toggle section to the canon 4 rows, each gating real doc fields (ROW_FIELDS). |
| 2b | 23-iden v0.1 vs v2.1 | NOT-A-GAP | `v0.1` is the real `IdenDoc` version; canon `v2.1` is a mock chip. Kept v0.1 (honesty). |
| 2c | 23-iden toggle accent green | **REAL-GAP** | The RN built-in `Switch` renders an off-palette green on react-native-web (track color ignored). **FIXED**: replaced with the M3 blue (`m3.color.primary`) Pressable toggle, 1:1 with the settings switch. Big Five sub now renders the account's REAL values (`data.bigFive`) or a neutral "검증 결과 포함" — never the canon's fabricated "O72 C58 …". |
| 3 | 26-reminders toggle accent green | **REAL-GAP** | Hardcoded `deepSpace.mint`. **FIXED**: `remStyles.toggleOn/knobOn` → `deepSpace.accent`/`onAccent` (canon blue). Localized to the reminders toggle; no other mint usage touched. |
| 4 | 05-home 오늘+N pill + bell position | STALE-REF / ALREADY-FIXED | Canon `05-home` has the bell **top-left** (matches live) and **no** 오늘+N pill; the fake status bar was already dropped (#750). No fix. |
| 5 | 08-records toggle overlap + 정리함 card | DEFERRED / no-canon-ref | Canon `08-records` is the **graph** view — no list toggle or 정리함 card to compare. The 목록/그래프 seg overlapping the floating mascot header (list view) is a real layout issue, but it lives in the shared `SecondbStatusHeader` float owned by the `statusheader-consolidate` worktree and has no canon list reference. Left for that pass to avoid a cross-worktree conflict; not a token fix. |
| 6 | 21-northstar card color + suggestions | HONEST-STATE | The muted card text is the empty-draft **placeholder** (QA account has no saved north-star) — not a color bug; canon shows a *saved* value. The suggestion list is honestly absent on a thin record base (`proposeNorthstarSentences`, `MIN_RECORDS_FOR_PROPOSAL`). The card's SVG right-edge band is a react-native-svg-web render quirk (web-capture only). No token fix; do not fabricate suggestions. |
| 7 | 02/03 onboarding dots + safe-area | ALREADY-FIXED / web-artifact | Canon `02-onboard` shows **4** dots (matches live, post-#753 `SLIDES=4`). The top safe-area inset difference is a web-export artifact (native provides the inset). No fix. |
| 8 | big-five / attachment empty states | RECLASSIFIED | The empty state was honest; the QA account is now seeded (track H), so the filled state is live-verifiable. No code gap. |

**Fixes applied (token-only, minimal):** `src/lib/canon/index.ts` (+`canonIden.rows`),
`src/app/iden.tsx` (canon 4-row include section + honest Big Five sub + M3 blue
toggle + `raw` off by default), `src/screens/deepspace/ops/screens.tsx`
(reminders toggle → blue). No STALE-REF / ALREADY-FIXED / HONEST-STATE item was
"fixed".
