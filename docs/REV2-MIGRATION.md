# rev2 UI Migration — Roadmap & Gap Analysis

> **Status: canonical program plan (living).** Target = **PRD v2.0** (the rev2
> prototype + `PRD_standalone` provided 2026-07-01). This doc is the SoT for
> migrating the shipped app to optimally match rev2. Work lands in phased PRs;
> update the status column as slices land.
>
> **Axis**: cross-cutting (touches all three). **Owner**: Simon.

## 0. Canon decision (pending explicit ratification)

rev2 PRD **v2.0** reframes the *visual system* from the current **deep-space
cosmic-pixel** canon to **Material 3 + deep-space**. The concept is UNCHANGED
(별자리 · 북극성 · 북두칠성 7별 · 정직한 밝기 L1~L5 · propose→ratify · 세컨비). Per the PRD's
own **"레이아웃 자유, 의미 고정"** principle, migration preserves *meaning* (each feature's
purpose, interaction result, data flow, safety invariants) and the **별자리 홈 골격 +
세컨비 머리 에셋**, while the *visual style, layout, and component system* move to M3.

**Assumed default (this roadmap proceeds on it):** rev2 v2.0 **supersedes** the
cosmic-pixel canon. This flips `CLAUDE.md`, `DESIGN.md`, `docs/PRD.md`, and the
`design/*.dc.html` visual SoT. Because `CLAUDE.md` requires explicit approval to
deviate from `DESIGN.md`, **P0 records this supersession in the canon docs** so it
is reviewable before the reskin proceeds. If Simon wants "structure-only /
hybrid" instead, only P1 (design system) changes; the rest of the plan holds.

## 1. Where we are (audit, 2026-07-01)

The shipped app is **already very complete** — ~60 expo-router routes; **29/32**
rev2 target surfaces exist. So this is a **reskin + alignment + gap-fill**, not a
from-scratch build.

- **Nav (current)**: deep-space 5-tab dock = 담기 · 알아가기(home) · 세컨비(center) · 비서(ops) · 나(account). (`DeepSpaceDock.tsx` / `DeepSpaceScreen.tsx`)
- **Design (current)**: cosmic-pixel — cyan `#46B6FF` + soul violet + mint, tinted neutrals; chrome uses **pixel fonts** Galmuri11 / Press Start 2P + Pretendard body. Tokens: `src/lib/theme/tokens.ts`, `src/theme/typography.ts`; discipline: `DESIGN.md`; visual SoT: 32 `design/*.dc.html`.
- **7 domains (current)**: 커리어 · 재정 · 성장 · 관계 · 건강 · **오락** · 담아내기. The 오락 star's **code id is `recreation`** (English); "오락" is only the KO label.
- **Character (current)**: single 세컨비 + Divergent mode; legacy 6-pixel-resident roster is deprecated.

## 2. Target (rev2 PRD v2.0)

- **Design system**: **Material 3** — azure/cyan primary + violet tertiary (= 세컨비 head), dark default, deep-space background global (radial nebula + stars, everywhere except nav). Type: **Pretendard (KR body) + Roboto / Roboto Mono (M3 chrome/labels)** — pixel fonts removed. Full M3 token architecture (color/type/shape/elevation/motion/state-layer). Primitives: `MdButton/MdCard/MdChip/MdNavBar/Field/SegBtn/ProgressLinear`.
- **Nav**: bottom 5-tab. rev2 SoT tab set = 별자리홈 · 담기 · 세컨비(챗봇) · 위키(records) · 비서(ops). (Reconcile the current 나/account tab → moved out of the dock; confirm final 5 against PRD §04 table during P2.)
- **7 domains**: 커리어 · 재정 · 관계 · 성장 · 건강 · **휴식** · 담아내기 — **오락 → 휴식** (rest). Label/i18n rename; keep code id `recreation`.
- **세컨비**: one character, **3 personas** sharing context — **2nd-B**(violet `#A78BFA`, empathetic) · **메타비/Meta-B**(cyan `#46B6FF`, objective) · **트위비/Twi-B**(pale lavender `#CFC4E8`, creative/공상). Head assets: `secondb-head-front` (canonical) + meta/twi variants, each blank+face for expression overlay. Gaze tracking + 3 moods (positive/neutral/negative).

## 3. Gap analysis (current → rev2)

| Surface / system | Current | rev2 target | Action | Phase |
|---|---|---|---|---|
| Visual system | cosmic-pixel, pixel fonts | Material 3 + Roboto, deep-space bg global | **Reskin (large)** | P1 |
| 7th domain | 오락 (`recreation`) | 휴식 (rest), id kept | Label/i18n/docs rename | P0/P1 |
| 세컨비 personas | 1 + Divergent | 3 (2nd-B/메타비/트위비) + head variants | Add Meta-B, Twi-B, assets, gaze/mood | P2 |
| 5-tab dock | 담기·홈·세컨비·비서·나 | 별자리홈·담기·세컨비·위키·비서 | Reconcile tab set | P2 |
| 별자리 홈 | exists, interactive | keep skeleton, M3 skin, gaze/mood | Reskin + head upgrade | P2 |
| 담기 (capture) | multi-mode | + 4W1H text form, photo **OCR (Gemini)**, format boxes | Interaction upgrade | P3 |
| 위키 | list + backlinks | **node graph** (physics, filter/display/tension, zoom) | Upgrade to graph | P4 |
| 관계 별 | partial | **people map** graph (address-book, per-person drilldown, tier layout) | New graph | P4 |
| 커리어 별 | records list | **CV timeline** + 성과 입력 + 3C4P drilldown + 고용24 | New structured input | P4 |
| 건강/성장/재정/휴식 별 | dashboards | structured per-domain inputs + lenses | Upgrade | P4 |
| 북극성 종합 | `/core-brain` 7-section | persona deck (swipe) + Big Five radar + validation entry | Reskin + deck | P3 |
| 검증틀 | `/big-five`,`/ipip-neo`,`/audit`,`/mbti` | dedicated Big Five / 애착 / 가치관 / **동기(SDT)** / 강점 screens | Split out SDT/values/strengths | P3 |
| 밝기 변화 | trends/insights | dedicated 8-week brightness timeline + honesty meter (별빛≠확신) | New screen | P3 |
| 승인 이력 | implied | dedicated ratification log (propose→ratify history) | New screen | P3 |
| IDEN | `/iden` | portable `.iden` card (toggles, MD/JSON/PDF, targets) | Reskin + export | P5 |
| 데이터 연동 / 임포트 / 내 데이터 | exist | 3-block consent, propose→ratify import, rights (export/reset/delete) | Reskin | P5 |
| **통화 녹음** | **MISSING** | recorder → STT (on-device notice) → propose | **New** | P5 |
| 공유 카드 | partial | 1080×1080 insight / constellation variants | New screen | P5 |
| AI 뮤지엄 | stub/design-only | **2-axis timeline** (AI history × world events, year dial, swipe, detail sheets) | New surface | P5 |
| 요금제 | `/plans` | 3-tier (별바라기/항해자/북극성), limits-only differentiation | Reskin | P5 |
| 공상하기 | Divergent mode | 트위비 3-branch → next-step candidates → 담기 | Wire Twi-B | P5 |
| 앱 밖에서 | **MISSING** | home/lock-screen widgets, complications, push | **New (native)** | P6 |
| **T5 peer-review** (보여지는 나) | **F1 schema done** (0064) | informant flow (F2) + aggregate Seen view (F3) + LLM synthesis (F4) | **Build F2→F4** | P4 |
| Retention | 0063 off | `purge_expired_peer_invitations()` + peer aging (F-ret) | New migration | P6 |
| Retention activation | 0063 defined | E-act (periods + schedule) | Legal/product gate | P6 |

**Note**: rev2's `보여지는 나 (sb-gaps PeerScreen)` **is** the T5 peer-review feature. The F1 schema (migration 0064) already aligns; F2/F3/F4 are both the "remaining backend" AND a rev2 surface.

## 4. Workstreams

- **WS1 Design system (M3)** — token layer (color/type/shape/elevation/motion/state) mapped onto deep-space cyan/violet; remove pixel fonts (Roboto/Roboto Mono + Pretendard); M3 primitives; deep-space bg component. Touches `tokens.ts`, `typography.ts`, `DESIGN.md`, every pixel-chrome component.
- **WS2 Nav + home** — 5-tab reconcile; 별자리 홈 M3 skin preserving skeleton; 세컨비 3-persona head (gaze/mood/variants).
- **WS3 오락→휴식** — labels/i18n (EN↔KO parity, C7), docs, keep `recreation` id.
- **WS4 Self-understanding axis** — persona deck, dedicated validation screens (Big Five/애착/가치관/동기/강점), brightness timeline + honesty meter, ratification log.
- **WS5 Domain lenses** — capture 4W1H + OCR; wiki node graph; relationship people map; career CV timeline + 3C4P; health/growth/finance/rest structured inputs.
- **WS6 Data sovereignty + new surfaces** — IDEN export, import propose→ratify, data review rights, 통화 녹음, 공유 카드, AI 뮤지엄 timeline, 요금제, 공상하기(Twi-B), widgets.
- **WS7 Peer review (T5)** — F2 informant token flow + consent surface (service_role edge), F3 aggregate Seen gap view (`t5_seen_aggregate()`), F4 LLM synthesis (C1/C3/C9-gated).
- **WS8 Retention + docs** — F-ret migration; E-act activation (gated); canon docs update (CLAUDE.md/PRD/DESIGN/CONCEPT/nav-contract/SCREEN_TREE_SPEC).

## 5. Phasing (each phase = one or more PRs, verify-green + supabase-dry-run)

- **P0 — Canon & rename foundation**: record the M3 supersession in `CLAUDE.md`/`DESIGN.md`/`docs/PRD.md`; land 오락→휴식 (WS3). Low risk, unblocks coherence.
- **P1 — M3 design system** (WS1): additive M3 token layer + primitives + font swap behind the deep-space identity. The toka for every screen.
- **P2 — Nav + constellation home + 세컨비 3-persona** (WS2). Preserve home skeleton.
- **P3 — Self-understanding axis** (WS4): persona deck, validation screens, brightness timeline, ratification log.
- **P4 — Domain lenses + peer review** (WS5 + WS7): graphs, structured inputs; F2→F4.
- **P5 — Data sovereignty + new surfaces** (WS6): IDEN, import, 통화녹음, 공유카드, AI 뮤지엄, 요금제, 공상하기.
- **P6 — Off-app + retention** (WS6 widgets + WS8): widgets; F-ret; E-act (gated).
- **P7 — QA + fidelity pass**: per-screen 4-state (empty/loading/error/filled), a11y ≥44dp, i18n parity, visual QA vs rev2 screenshots.

## 6. Invariants (PRD §15 — never violate during migration)

1. 별자리 홈 골격 + 세컨비 머리 에셋 유지 (product face).
2. 자동 실행/자동 반영 없음 — 전부 propose → ratify.
3. 상위 티어 = 더 나은 답 아님 (한도만 차등).
4. 민감정보(위치·통신) 명시 동의 · 미성년 잠금 · 원문 비보존.
5. 임상/판단 어휘 금지 — 자기이해·성장·점검·계획 프레이밍 (lexicon CI).
6. 긴 작업 비차단 (도크 + 완료 토스트, 자동 이동 없음).
7. 반응형 · ≥44dp · i18n(KO/EN, EN canonical) · iOS 대비.
8. All 12 hard constraints (C1~C12) hold; LLM only via `gemini.ts`; classifier before every call.

## 7. Risks

- **Scale**: 20–40 PRs, multi-session. Sequencing (P0→P7) keeps each PR verifiable and reversible.
- **Reskin blast radius**: pixel-font removal touches nearly every chrome component → do it additively in P1 (introduce M3, migrate screen-by-screen in later phases) rather than one big-bang.
- **Legacy UI mode**: `EXPO_PUBLIC_UI=legacy` cosmic-pixel skin must keep working (rollback). M3 lands on the deep-space track.
- **Third-party PII (T5)**: F2 is a public informant surface + minor guardian consent + cross-border (F4) — consent copy needs legal review before deploy.
- **E-act / call recording / widgets**: legal + native-build gates; keep off-default until reviewed.

## 8. Next actions

1. **P0** — this roadmap + canon-doc supersession note + 오락→휴식 rename.
2. **P1** — M3 token foundation PR.
3. Then P2… Each phase is a PR (or a small stack), verify-green, visual-QA vs the rev2 screenshots in the provided prototype.
