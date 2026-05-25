# 2nd-Brain Handoff — 2026-05-25 → Cowork

> Snapshot of where Sprint 0 lands and what the next session needs to know.
> Last commit on `main`: `d45ad4e`. Web preview: <https://simon-yhkim.github.io/2nd-B/>.

---

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
