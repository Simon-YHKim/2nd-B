# Gemini 잔재 인벤토리 (T1 폐기 PR 의 체크리스트)

> 측정: 2026-08-30, origin/main `afeb0718`. 5영역 적대적 스윕(클라이언트 lib · 엣지/DB · CI/eas ·
> 테스트 · 문서) + 완전성 비평가. **총 656곳** — 이 파일은 그중 *기능적* 279곳(기본값 · 리터럴 ·
> 프록시 이름 · 모델 ID · 시크릿 · 직접 SDK · 워크플로 폴백 · 테스트 핀)을 싣는다. 주석 205곳과
> 문서 172곳은 세었지만 싣지 않았다 — 폐기 PR 이 `rg -i gemini` 로 마지막에 훑으면 된다.
>
> **`bump_gemini_spend` / `gemini_spend_daily` / `GEMINI_*_CALL_CAP` / `GEMINI_SPEND_FAILOPEN` 은 폐기 대상이 아니다** —
> 4 프록시 공용 지출 상한이다. grep 으로 지우면 전 프록시가 죽는다.
>
> 요약·순서·결합 조건은 `docs/LLM-VENDOR-PLACEMENT.md` "9월 폐기 체크리스트" 에 있다. 래칫:
> `src/lib/llm/__tests__/gemini-residue.test.ts`.

## 종류별 수

| 종류 | 수 | 뜻 |
|---|---:|---|
| `default` | 30 | 환경변수 미설정 시 gemini 로 풀리는 자리 — **폐기 PR 의 1차 표적** |
| `literal` | 70 | 코드 안 `"gemini"` 문자열(타입 유니언·비교·감사 기록) |
| `proxy-name` | 26 | `gemini-proxy` 를 이름으로 부르는 자리 |
| `model-id` | 29 | `gemini-3.5-flash` 등 모델 ID(env 값·MODELS 상수) |
| `secret` | 15 | `GEMINI_API_KEY` 등 시크릿 참조(콘솔 몫) |
| `direct-sdk` | 30 | `@google/genai` 직접 클라이언트 경로(C1/C2/C9/Cost 게이트가 여기 앵커돼 있다) |
| `workflow-fallback` | 17 | 워크플로의 `vars.X OR 'gemini'` 폴백(변수 미설정 시 gemini) |
| `test-pin` | 62 | 오늘의 gemini 기본값을 단언하는 테스트(폐기 PR 에서 기대값 갱신) |
| `comment` | 205 | 주석 — 대부분 역사. 폐기 후 `rg` 로 정리 |
| `doc` | 172 | 문서 — 역사 표시된 것은 유지 |

## 폐기 PR 이 반드시 같이 고쳐야 통과하는 결합 (비평가 실측)

1. **`eas.json` 은 지문 입력** — 세 프로필의 `EXPO_PUBLIC_MODEL_*`·`REASONING_PROVIDER`·`SAFETY_VENDOR` 를 고치는 순간
   나가 있는 빌드의 OTA 가 끊긴다. **9/1 이후 빌드와 한 묶음**으로만.
2. **`@google/genai` 직접 경로를 지우면 `check:constraints` 네 게이트가 같은 커밋에서 깨진다** —
   C1(eslint 설정에 `@google/genai` 요구) · C2(`vertexai: true` + `USE_VERTEX` + `GOOGLE_CLOUD_PROJECT`) ·
   C9(`boundary.ts` 의 `generateContent` 리터럴 앵커) · Cost(`assertDirectEgressAllowed` 정의 + 호출 2회).
   `scripts/check-constraints.ts` 를 함께 고칠 것. `capture-abort-contract.test.ts:37` 과 모든 `jest.mock('@google/genai')` 도.
3. **`supabase/functions/gemini-proxy/index.ts` 를 디스크에서 읽는 검사 6개** — `eval-crisis-layer-parity.ts:79`
   (`check:crisis-parity`, `verify` 안) · `embed-vendor-exit:27` · `reasoning-connect-routing:23` · `crisis-terms-proxy-parity:21` ·
   `capture-file-audio:15` · `ops-brief-output-budget:30`. 디렉터리 삭제와 **같은 PR** 에서 바꿀 것(안 그러면 ENOENT).
4. **개인정보처리방침이 'Gemini' 를 박고 있다** — `legal-documents.ts:279/293`, `legal-documents.test.ts:80`,
   `check:legal-snapshot`(`docs/legal/privacy-policy.md:35/105`), `check:legal-html`(`public/legal/privacy.html:72/132`).
   벤더 문구 변경은 **법률 검토 경로**를 탄다.
5. **`gemini-residue.test.ts` 래칫** — `RESIDUE` 표와 `UNSET_DEFAULT_SITES=11` 을 폐기 후 값으로, 그리고
   `docs/LLM-VENDOR-PLACEMENT.md` 의 핀 문자열 3개.
6. **시크릿 정리는 마지막, 콘솔 몫** — `GEMINI_API_KEY` 는 GitHub 시크릿엔 없고 **Supabase Edge 시크릿에만** 있다.
   함수 디렉터리 삭제는 배포 해제가 아니다 — `supabase functions delete gemini-proxy` 가 별도 단계.
7. **구빌드(≤35)는 번들된 기본값으로 `gemini-proxy` 를 부른다** — 알파 트랙 새 빌드 게시가 1단계.

**부수 발견(폐기와 무관, 티켓감):** `db/migrations/0095`:63 의 `p_reasoning_vendor IN ('gemini','claude','openai')` 에
**`xai` 가 없다** — xai 가 서빙한 행은 벤더가 NULL 로 기록된다. `routing.ts:474` 의 `?? "gemini"` 는 도달 불가(L460 게이트).
`src/lib/wiki/pii-scrub.ts:5` 의 "gemini-proxy 의 NER/PII 패스" 주석은 낡았다(그런 패스 없음).

## 기능적 잔재 279곳

`safe_now` = 오늘 바꿔도 배포된 빌드의 동작이 안 바뀌고 설치된 구빌드도 안 깨지는가(비평가 검토 반영).


### `default` (30)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.env.example:23` | EXPO_PUBLIC_LLM_PHASE=1 | add EXPO_PUBLIC_LLM_VENDOR=perPurpose + BACKBONE/MULTIMODAL/EMBED/CHAT=openai, FAILOVER=none, SAFETY=openai so a fresh .env does not route e | 예 |
| `.env.example:34` | # EXPO_PUBLIC_LLM_VENDOR=gemini | replace with EXPO_PUBLIC_LLM_VENDOR=perPurpose (uncommented) | 예 |
| `.github/workflows/web-deploy.yml:86` | EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: ${{ vars.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION \|\| 'false' }} | flip the fallback to 'true' (or drop the key) once the direct branches go; today only the repo Variable (=true) keeps the web build off the  | 예 |
| `eas.json:32` | "EXPO_PUBLIC_REASONING_PROVIDER": "gemini"  (preview profile) | flip to "openai" or delete the key together with routing.ts legacyReasoningProvider() and vendor-switch-reachability.test.ts ENV_KEYS; bundl | **아니오** |
| `eas.json:33` | "EXPO_PUBLIC_LLM_PHASE": "1"  (preview profile) | keep until routing.ts:482 phase rung (Phase 1 = gemini for seats) is removed, then delete; bundle with a build | **아니오** |
| `eas.json:71` | "EXPO_PUBLIC_REASONING_PROVIDER": "gemini"  (preview-emulator profile) | same as preview line 32 | **아니오** |
| `eas.json:72` | "EXPO_PUBLIC_LLM_PHASE": "1"  (preview-emulator profile) | same as preview line 33 | **아니오** |
| `eas.json:120` | "EXPO_PUBLIC_REASONING_PROVIDER": "gemini"  (production profile) | same as preview line 32; bundle with the next store build | **아니오** |
| `eas.json:121` | "EXPO_PUBLIC_LLM_PHASE": "1"  (production profile) | same as preview line 33 | **아니오** |
| `src/lib/env.ts:178` | EXPO_PUBLIC_LLM_MODE: e.EXPO_PUBLIC_LLM_MODE ?? (e.EXPO_PUBLIC_USE_VERTEX \|\| (e.GOOGLE_API_KEY && e.GOOGLE_A | re-derive the default from EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION (or require LLM_MODE explicitly) — with the Google key gone, this expression wo | 예 |
| `src/lib/llm/routing.ts:54` | const raw = (process.env.EXPO_PUBLIC_LLM_PHASE ?? "1").trim(); return raw === "2" ? 2 : 1; | delete llmPhase() and the EXPO_PUBLIC_LLM_PHASE key (eas.json:33, both workflows) once L482 goes — the phase flag only exists to express 'Ph | 예 |
| `src/lib/llm/routing.ts:100` | return normalizeVendor(process.env.EXPO_PUBLIC_CHAT_VENDOR ?? ""); return null; | keep the knob; the gemini fallback lives at L457 (also delete the dead `return null` on L101) | 예 |
| `src/lib/llm/routing.ts:132` | return normalizeVendor(process.env.EXPO_PUBLIC_BACKBONE_VENDOR ?? "") ?? "gemini"; | flip default to "openai" (matches the deployed value); update backbone-vendor-exit.test.ts / gemini-last-hardcodes.test.ts expectations | 예 |
| `src/lib/llm/routing.ts:152` | if (raw === "openai" \|\| raw === "gemini") return raw; return "gemini"; | flip default to "openai" AND drop gemini acceptance; fix eas.json:40 (pins EXPO_PUBLIC_SAFETY_VENDOR=gemini); update safety-classify-proxy.t | 예 |
| `src/lib/llm/routing.ts:176` | return normalizeVendor(raw) ?? "gemini"; | flip default to "none" (the deployed value; a retry onto a dead key is a guaranteed second failure that replaces the real error) | 예 |
| `src/lib/llm/routing.ts:203` | if (raw === "openai" \|\| raw === "gemini") return raw; return "gemini"; | flip default to "openai" and drop gemini acceptance; update embed-vendor-exit.test.ts. Any environment that actually embedded via gemini mus | 예 |
| `src/lib/llm/routing.ts:243` | if (raw === "openai" \|\| raw === "gemini") return raw; return "gemini"; | flip default to "openai" and drop gemini acceptance (Simon 2026-08-23: OCR = openai, no gemini exception); update multimodal-vendor-exit.tes | 예 |
| `src/lib/llm/routing.ts:404` | const raw = (process.env.EXPO_PUBLIC_REASONING_PROVIDER ?? "gemini").trim().toLowerCase(); ... return normaliz | delete legacyReasoningProvider() entirely with L445; remove EXPO_PUBLIC_REASONING_PROVIDER from eas.json:32, android-release.yml:95, web-dep | 예 |
| `src/lib/llm/routing.ts:457` | return chatVendorOverride() ?? "gemini"; | flip default to "openai" (Simon 2026-08-18 decision; deployed value); update vendor-routing tests | 예 |
| `src/lib/llm/routing.ts:474` | if (override === "perPurpose") return PHASE2_VENDOR[purpose] ?? "gemini"; | replace the fallback — every seat is in PHASE2_VENDOR (isSeat gate at L465) so make it exhaustive (non-null assert or throw) rather than def | 예 |
| `src/lib/llm/routing.ts:482` | if (llmPhase() !== 2) return "gemini"; return PHASE2_VENDOR[purpose] ?? "gemini"; | delete the phase branch: unset EXPO_PUBLIC_LLM_VENDOR should mean the per-seat map (or openai), never gemini; update phase2-vendor-stopgap.t | 예 |
| `supabase/functions/_shared/llm-proxy-common.ts:142` | Number(Deno.env.get('GEMINI_DAILY_CALL_CAP')) / GEMINI_SUB_DAILY_CALL_CAP / GEMINI_FREE_DAILY_CALL_CAP | keep — shared cap env names used by claude/openai/xai (same class as bump_gemini_spend); renaming needs new secrets set first and is a separ | **아니오** |
| `supabase/functions/claude-proxy/index.ts:314` | if (rpcMissing && Deno.env.get('GEMINI_SPEND_FAILOPEN') === '1') {  (also openai-proxy:608, xai-proxy:312) | keep — shared cap bootstrap escape, same class as bump_gemini_spend; do not rename | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:76` | (Deno.env.get('GEMINI_MODELS_ALLOWED') ?? '') | delete with the function; remove the GEMINI_MODELS_ALLOWED secret if set | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:429` | if ((Deno.env.get('LLM_REQUIRE_CONSENT') ?? 'false') === 'true') { | delete with the function; keep the LLM_REQUIRE_CONSENT gate in claude/openai/xai proxies (they carry the same NOTE) | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:503` | await supabaseAdmin.rpc('bump_gemini_spend', { p_user_id, p_day, p_cap: dailyCap })  (embed path; main path at | delete with the function; the RPC itself is the shared cap — keep, do not rename | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:584` | const model: string = typeof body?.model === 'string' ? body.model : 'gemini-2.5-flash'; | delete with the function | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:659` | purpose === 'safety_classify' && Deno.env.get('LLM_SERVER_SAFETY_SEAT') === '1'; | delete with the function; openai-proxy:566 keeps the identical exemption and becomes the only safety_classify server seat (feature still off | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:760` | Number(Deno.env.get('GEMINI_DAILY_CALL_CAP')) / GEMINI_SUB_DAILY_CALL_CAP / GEMINI_FREE_DAILY_CALL_CAP (also 4 | delete with the function; the env NAMES stay (shared cap env read by _shared/llm-proxy-common.ts for claude/openai/xai) — do not rename | **아니오** |
| `supabase/functions/openai-proxy/index.ts:566` | purpose === 'safety_classify' && Deno.env.get('LLM_SERVER_SAFETY_SEAT') === '1'; | keep — becomes the only copy of the safety_classify crisis-gate exemption (feature off by default) | 예 |

### `literal` (70)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.github/workflows/android-release.yml:95` | EXPO_PUBLIC_REASONING_PROVIDER: "gemini" | interim: set to "openai"; final: delete the key with routing.ts legacyReasoningProvider() + vendor-switch-reachability.test.ts (which requir | 예 |
| `db/migrations/0004_ai_audit_log.sql:13` | vertex_backend  boolean NOT NULL,  -- C2 | keep; dropping it needs a new migration plus check-constraints C3 (L80), supabase-dry-run.yml:76, the log_ai_audit signature and types.gen | 예 |
| `db/migrations/0035_gemini_spend_daily.sql:16` | CREATE TABLE IF NOT EXISTS gemini_spend_daily ( ... bump_gemini_spend(...) ... RAISE EXCEPTION 'gemini_spend_e | keep — shared cap, do not rename (also 0036, 0092:53-100 redefinition with llm_enabled runtime flag, 0110:51-73 refund_gemini_spend) | 예 |
| `db/migrations/0095_ai_audit_purpose_rpc.sql:63` | WHEN p_reasoning_vendor IN ('gemini', 'claude', 'openai') THEN p_reasoning_vendor | keep 'gemini' in the log_ai_audit RPC allowlist (old builds' native/direct path and fallback audits still send it); a follow-up migration sh | 예 |
| `db/migrations/0110_peer_response_once_and_llm_quota_refund.sql:51` | create or replace function public.refund_gemini_spend(p_user_id uuid, p_day date) | keep — shared cap (refund twin of bump_gemini_spend, called by all four proxies), do not rename | 예 |
| `db/migrations/0142_embedding_provenance.sql:78` | SET embedding_model = 'gemini-embedding-2'  (backfill on wiki_pages and records; also lines 12, 72, 82) | keep the migration; retirement needs a NEW re-index migration that NULLs embedding WHERE embedding_model='gemini-embedding-2' OR (embedding_ | **아니오** |
| `eas.json:40` | "EXPO_PUBLIC_SAFETY_VENDOR": "gemini"  (preview profile) | flip to "openai" (openai-proxy has the safety_classify seat); update native-web-vendor-parity INTENDED_DIFFERENCES + gemini-last-hardcodes.t | **아니오** |
| `eas.json:79` | "EXPO_PUBLIC_SAFETY_VENDOR": "gemini"  (preview-emulator profile) | same as preview line 40; native-web-vendor-parity.test asserts the three profiles agree | **아니오** |
| `eas.json:128` | "EXPO_PUBLIC_SAFETY_VENDOR": "gemini"  (production profile) | same as preview line 40 | **아니오** |
| `locales/en/consent.json:12` | "intro": "... uses Google Gemini, Anthropic Claude, or OpenAI only to generate ..."  (24 ackLlm, 41 body; ko/e | drop Google from the processor list in all five locales once no seat is served (C7 parity; ConsentTrust in check-constraints forbids old cop | 예 |
| `locales/en/iden.json:18` | "hint": "Copy this into ChatGPT, Gemini, or Claude to give it your context."  (5 locales) | keep — external consumers of the exported context pack | 예 |
| `public/proto/sb-screens-core.jsx:134` | Gemini로 글 추출  (139 'Gemini가 이미지 속 글자를 읽는 중…'; design/proto_rev2/reference-app twin; museum.json exhibit) | keep — canon reference prototype copy, not app copy (app locales carry no Gemini in capture strings) | 예 |
| `src/lib/chat/__tests__/conversation.test.ts:82` | audit: { modelUsed: "mock:gemini-2.5-flash" }, | keep (optionally rename fixture) | 예 |
| `src/lib/env.ts:48` | EXPO_PUBLIC_USE_VERTEX: z.union([z.literal("true"), z.literal("false")]).default("false")  (C2 Vertex switch) | delete from the schema (with the refine at L184-190 'GOOGLE_CLOUD_PROJECT is required when EXPO_PUBLIC_USE_VERTEX=true (C2)' and the readRaw | 예 |
| `src/lib/lenses/__tests__/registry.test.ts:92` | const FORBIDDEN = ["LLM", "모델", "추론", "AI", "gemini", "gpt", "claude"]; | keep | 예 |
| `src/lib/llm/__tests__/audit-purpose-continuity.test.ts:47` | expect(sql).toMatch(/p_reasoning_vendor IN \('gemini', 'claude', 'openai'\)/); | keep — pins immutable migration 0095 text | 예 |
| `src/lib/llm/__tests__/audit-purpose-continuity.test.ts:78` | modelUsed: "gemini-2.5-pro" … reasoningProvider: "gemini" → p_reasoning_vendor: "gemini" (L78,84,90) | keep (or swap fixture to openai) | 예 |
| `src/lib/llm/__tests__/audit-write-outbox.test.ts:23` | modelUsed: "gemini-2.5-flash", | keep | 예 |
| `src/lib/llm/__tests__/embedding-provenance.test.ts:47` | expect(EXEC).toMatch(/UPDATE public\.wiki_pages … SET embedding_model = 'gemini-embedding-2'/) (L47-48) | keep — pins immutable migration 0142 backfill | 예 |
| `src/lib/llm/__tests__/vendor-switch-reachability.test.ts:239` | const ALL_VENDORS: LlmVendor[] = ["gemini", "claude", "openai", "xai"]; | drop "gemini" when the LlmVendor union drops it (compile error otherwise) | 예 |
| `src/lib/llm/boundary.ts:37` | type GeminiModel, | follows types.ts:3 rename | 예 |
| `src/lib/llm/boundary.ts:61` | function resolveTier(input: { model?: GeminiModel; purpose: PromptPurpose }): GeminiModel { | follows types.ts:3 rename | 예 |
| `src/lib/llm/boundary.ts:591` | const vendorSeat = resolveVendorForPurpose(input.purpose, input.image != null, { reasoningTier: tier === "pro" | drop the opts argument when routing.ts:445 goes | 예 |
| `src/lib/llm/boundary.ts:598` | const effort = tier === "pro" ? input.effort ?? DEFAULT_EFFORT : vendorSeat !== "gemini" ? input.effort ?? pha | collapse the `vendorSeat !== "gemini"` branch: effort = input.effort ?? phase2EffortFor(purpose) ?? DEFAULT_EFFORT on every seat (pro keeps  | 예 |
| `src/lib/llm/boundary.ts:608` | const reasoningProvider = vendorSeat !== "gemini" ? vendorSeat : tier === "pro" ? ("gemini" as const) : undefi | simplify to `const reasoningProvider = vendorSeat;` (always defined, always recorded); the 'pro rows always carry a reasoning_vendor' audit  | 예 |
| `src/lib/llm/boundary.ts:634` | vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,  (callLlm audit row; same pattern at 1032, 1058, 1189, 1347, 1416) | replace with a constant false when EXPO_PUBLIC_USE_VERTEX is removed from env.ts (env.ts:48 entry); keep the audit field | 예 |
| `src/lib/llm/boundary.ts:662` | if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION \|\| (reasoningProvider != null && reasoningProvider !== "gemini"))  | make the edge path unconditional and delete the else branch (L757-797); EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION then has no reader in callLlm | 예 |
| `src/lib/llm/boundary.ts:915` | vertexBackend: boolean,  (writeAudit param; locals at 654, 1069, 1207, 1447; `= false` at 499, 755, 1242, 1529 | collapse to a constant once the three direct branches are deleted | 예 |
| `src/lib/llm/boundary.ts:1459` | if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION \|\| reasoningProvider !== "gemini") { | make unconditional; delete the else branch L1530-1544 | 예 |
| `src/lib/llm/boundary.ts:1492` | env.EXPO_PUBLIC_USE_VERTEX,  (positional arg to advisorProxyCrisisResult; same at 1515) | pass false / drop the parameter together with the env key | 예 |
| `src/lib/llm/crosscheck.ts:179` | challenger: "gemini", defender: "gemini",  (placeholder on a skipped cross-check) | replace with a non-vendor sentinel (make challenger/defender optional when `skipped` is set, or use the resolved vendors); needed before "ge | 예 |
| `src/lib/llm/routing.ts:27` | export type LlmVendor = "gemini" \| "claude" \| "openai" \| "xai"; | drop "gemini" from the union LAST, after every site below and types.ts:157 (which mirrors it by hand) | 예 |
| `src/lib/llm/routing.ts:42` | if (v === "gemini" \|\| v === "claude" \|\| v === "openai" \|\| v === "xai") return v; | stop accepting "gemini" so an operator value naming the retired proxy resolves null -> new default instead of routing to a dead function | 예 |
| `src/lib/llm/routing.ts:225` | export const GEMINI_PINNED_PURPOSES = MULTIMODAL_PURPOSES; | delete the deprecated alias (0 consumers in src outside routing.ts; grep tests for it) | 예 |
| `src/lib/llm/routing.ts:445` | if (resolved === "gemini" && opts?.reasoningTier) return legacyReasoningProvider(); | delete (and the opts.reasoningTier parameter; callers boundary.ts:591-593, 1335) | 예 |
| `src/lib/llm/safety.ts:22` | import { MODELS } from "./types"; | remove once L247 goes | 예 |
| `src/lib/llm/safety.ts:123` | if (env.EXPO_PUBLIC_LLM_MODE !== "live" \|\| env.EXPO_PUBLIC_USE_VERTEX) return;  (noteSemanticUnavailable gat | re-express the 'Layer-2 dark' condition as `EXPO_PUBLIC_SERVER_SAFETY !== "true"` once Vertex is gone; keep the once-per-session 'lexicon-on | 예 |
| `src/lib/llm/types.ts:3` | export type GeminiModel = "lite" \| "flash" \| "pro"; | rename to a vendor-neutral tier name (e.g. ModelTier); the lite/flash/pro vocabulary itself stays (PURPOSE_TIER drives the effort mapping) | 예 |
| `src/lib/llm/types.ts:107` | model?: GeminiModel; | follows the type rename at types.ts:3 | 예 |
| `src/lib/llm/types.ts:133` | vertexBackend: boolean;  (AiAuditInsert field that feeds ai_audit_log.vertex_backend via log_ai_audit) | keep the field; hard-code false at every writer once EXPO_PUBLIC_USE_VERTEX leaves env.ts — do not drop it (column + 9-arg RPC signature) | 예 |
| `src/lib/llm/types.ts:157` | reasoningProvider?: "gemini" \| "claude" \| "openai" \| "xai"; | drop "gemini" together with routing.ts:27 (hand-mirrored union); ai_audit_log.reasoning_vendor is free text so historical gemini rows stay r | 예 |
| `src/lib/llm/types.ts:195` | export const PURPOSE_TIER: Partial<Record<PromptPurpose, GeminiModel>> = { | follows the type rename; keep the table | 예 |
| `src/lib/persona/__tests__/build.test.ts:59` | audit: { modelUsed: "mock:gemini-2.5-flash" } (L59, 609) | keep | 예 |
| `src/lib/persona/build.ts:533` | // The edge proxy caps the `user` channel at 8000 chars (gemini-proxy MAX_USER_LEN) ... const MAX_SUMMARY_INPU | re-point the comment to the cap in _shared/llm-proxy-common.ts / openai-proxy and confirm it is still 8000 | 예 |
| `src/lib/release/__tests__/changelog.test.ts:104` | expect(flattenMarkdown("see `gemini.ts` now")).toBe("see gemini.ts now"); | keep | 예 |
| `src/lib/supabase/audit.ts:27` | p_vertex_backend: meta.vertexBackend,  (log_ai_audit RPC argument) | keep passing (false); removing the argument breaks the PostgREST 9-arg match for log_ai_audit and stalls every client audit write — dropping | 예 |
| `src/lib/supabase/types.gen.ts:51` | vertex_backend: boolean  (generated Row/Insert/Update at 51, 67, 83; p_vertex_backend at 3180) | keep — regenerate only if a later migration drops the column | 예 |
| `src/lib/wiki/__tests__/context-pack.test.ts:68` | PACK_TARGET_LIMITS.geminiGems / fitsHeaderOnly.geminiGems (L68-71, 110) | keep | 예 |
| `src/lib/wiki/__tests__/phase1.test.ts:101` | model: "gemini-2.5-flash" in __phase1__ fixtures (L101) and modelUsed "mock:gemini-2.5-flash" (L34,159,203,225 | keep (optionally rename geminiReply) | 예 |
| `src/lib/wiki/__tests__/phase2.test.ts:215` | model: "gemini-2.5-flash" (L215, 249); suggest-tags.test.ts L12 same | keep | 예 |
| `src/lib/wiki/capture-file.ts:46` | // This list mirrors ALLOWED_AUDIO_MIME in supabase/functions/gemini-proxy. ... const AUDIO_MIMES = new Set([" | re-point the mirror to openai-proxy's audio allowlist and diff the set (a picker that accepts what the proxy rejects fails at the last step) | 예 |
| `src/lib/wiki/capture-file.ts:66` | // Derived from MAX_AUDIO_BASE64_LEN (4,100,000) in gemini-proxy ... export const MAX_AUDIO_FILE_BYTES = 3_000 | re-derive from openai-proxy's audio base64 cap; the test that pins the arithmetic must be updated with it | 예 |
| `src/lib/wiki/context-pack.ts:34` | geminiGems: 4000,  (PACK_TARGET_LIMITS; also L5,11,51,72,160,227 — header budget for pasting the pack into Gem | keep — Gemini Gems is an external consumer format for the user's exported context pack, not our vendor | 예 |
| `src/screens/deepspace/DeepSpaceDesignScreens.tsx:962` | "켜기 전에 알아두세요. 추천을 켜면 당신의 기록 묶음이 분석을 위해 Gemini로 전송돼요(해외에서 처리)…" / "Your records are sent to Gemini for analysis | reword the /ops recommendation consent lead to name the actual processor (OpenAI) or a vendor-neutral 'AI 서버(해외)'; this is a PIPA overseas-t | 예 |
| `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1010` | "…변환을 위해 기록 텍스트가 Gemini(해외)로 전송됩니다…" / "…record text is sent to Gemini (processed overseas)…" (L1011) | reword the embeddings consent lead the same way (EMBED_VENDOR=openai) | 예 |
| `src/screens/deepspace/museum/AiMuseumScreen.tsx:63` | { date: "2023", ko: ["Gemini", "구글의 멀티모달 응전."], en: ["Gemini", "Google's natively multimodal answer."] }, | keep — AI-history exhibit content, not a dependency | 예 |
| `supabase/functions/claude-proxy/index.ts:521` | vertex_backend: false,  (openai-proxy:479/849, xai-proxy:497, llm-proxy-common.ts:270) | keep — the column stays | 예 |
| `supabase/functions/export-account/index.ts:137` | gemini_spend_daily: 'internal cost accounting, not personal content',  (EXCLUDED manifest; also line 23) | keep — shared cap table, do not rename; the exclusion reason text is vendor-neutral | 예 |
| `supabase/functions/gemini-proxy/index.ts:73` | const MODEL_PATTERN = /^gemini-\d+(?:\.\d+)?-(?:flash\|flash-lite\|pro)$/; | delete with the function | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:107` | `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` | delete with the function (this is the raw REST egress; no @google/genai SDK is imported in any edge function) | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:117` | `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents` | delete with the function | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:120` | const MAX_USER_LEN = 8000;  (259 MAX_IMAGE_BASE64_LEN 2.7M, 264 MAX_AUDIO_BASE64_LEN 4.1M, 265 ALLOWED_AUDIO_M | re-point the client mirrors (capture-file.ts:46/66, build.ts:533, capture-image.ts:5) and capture-file-audio.test.ts:15 at openai-proxy's co | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:160` | [ops-brief-output-floor] 8192  (tag read by ops-brief-output-budget.test.ts:30) | drop the gemini row from that test's PROXIES table | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:217` | const PRO_FOR_ALL_TIERS = new Set(['reasoning_connect']);  (used at 749) | delete with the file; reasoning-connect-routing.test.ts:86-96 pins this in the gemini-proxy source — openai-proxy has no PRO_FOR_ALL_TIERS ( | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:280` | // Gemini call happens. KEEP THESE TWO LISTS IN SYNC with the lexicon  (inlined CRISIS_TERMS_EN/KO + hasCrisis | delete with the function AND drop gemini-proxy from the parity harnesses (crisis-terms-proxy-parity.test.ts, scripts/eval-crisis-layer-parit | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:283` | const CRISIS_TERMS_EN / CRISIS_TERMS_KO (283, 289) — the inline crisis-lexicon mirror | goes with the file; drop the gemini layer from eval-crisis-layer-parity.ts:84 and crisis-terms-proxy-parity.test.ts:21, and reword lexicon.t | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:570` | reasoning_vendor: 'gemini', key_combo: 'GEMINI_API_KEY',  (embed audit row, purpose 'embed_index') | delete with the function; existing ai_audit_log rows with reasoning_vendor='gemini' stay as history (they are how to measure old-build traff | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:752` | ? serverModelFor('gemini-2.5-flash')  (sub-brain pro->flash downgrade target) | delete with the function | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:843` | upstream = await fetch(GEMINI_ENDPOINT(effectiveModel), { headers: { 'x-goog-api-key': resolvedKey.apiKey } .. | delete with the function | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:914` | reasoning_vendor: 'gemini', reasoning_effort: effortSlug, key_combo: keyCombo,  (main audit row) | delete with the function; keep historical rows | **아니오** |

### `proxy-name` (26)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `package.json:17` | "check:crisis-parity": "tsx scripts/eval-crisis-layer-parity.ts --check"  (part of npm run verify) | no change to this line; the script it runs must drop its gemini-proxy read in the same PR that deletes the function directory | 예 |
| `scripts/eval-crisis-layer-parity.ts:79` | const geminiProxy = readFileSync(join(ROOT, "supabase/functions/gemini-proxy/index.ts"), "utf8"); | drop the L1b layer (lines 5, 79, 84, 94) in the same PR that deletes supabase/functions/gemini-proxy; mirror in src/lib/safety/__tests__/cri | 예 |
| `src/lib/llm/__tests__/embed-vendor-exit.test.ts:27` | const GEMINI = read("supabase/functions/gemini-proxy/index.ts"); compared at L109-115 (MAX_EMBED_TEXTS/LEN) | drop the GEMINI read + loop when the gemini-proxy source is deleted; keep the OPENAI constants assertion | 예 |
| `src/lib/llm/__tests__/embed-vendor-exit.test.ts:78` | expect(BOUNDARY).not.toMatch(/invoke\("gemini-proxy", … op: "embed"/) | keep | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:72` | no `invoke("gemini-proxy"` / `primaryFn !== "gemini-proxy"` in boundary (L72-77); no `servedByProvider = "gemi | keep | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:157` | boundary/safety/rag hold no "gemini-proxy" literal outside routing (L157-165); switches reach every build (L13 | keep; extend the sweep to routing.ts once LlmProxyFn drops "gemini-proxy" | 예 |
| `src/lib/llm/__tests__/multimodal-vendor-exit.test.ts:61` | OCR/voice/image default → proxyFnForVendor(...) toBe("gemini-proxy") (L61-67) | flip to "openai-proxy" | 예 |
| `src/lib/llm/__tests__/ops-brief-output-budget.test.ts:30` | { file: "gemini-proxy/index.ts", min: 8192 }, | delete the row when gemini-proxy source is deleted | 예 |
| `src/lib/llm/__tests__/reasoning-connect-routing.test.ts:86` | describe("gemini-proxy: reasoning_connect is exempt from the sub-brain pro pin") reads gemini-proxy (L23-26, 8 | delete the block with the gemini-proxy source; re-pin the SAME-QUALITY rule on openai-proxy if it carries a tier pin | 예 |
| `src/lib/llm/__tests__/reasoning-provider-routing.test.ts:98` | EXPO_PUBLIC_REASONING_PROVIDER="gemini" + edge ON → invokedFunctionName() toBe("gemini-proxy") (L98-103) | delete with the legacy seam, or flip to the seam's new fallback proxy | 예 |
| `src/lib/llm/__tests__/safety-classify-proxy.test.ts:42` | expect(fn).toBe("gemini-proxy"); (SAFETY_VENDOR unset) | flip to "openai-proxy" when safetyVendor() default flips | 예 |
| `src/lib/llm/__tests__/transcribe-audio-live.test.ts:129` | expect(fn).toBe("gemini-proxy"); (MULTIMODAL_VENDOR unset) | flip to "openai-proxy" when multimodalVendor() default flips | 예 |
| `src/lib/llm/__tests__/vendor-routing-live.test.ts:127` | failover ONCE → calls[1][0] toBe("gemini-proxy"), reasoningProvider "gemini", modelUsed "gemini-2.5-flash" (L1 | flip: with FAILOVER default "none" assert no retry, or set EXPO_PUBLIC_FAILOVER_VENDOR explicitly in-test to a live vendor | 예 |
| `src/lib/llm/__tests__/vendor-routing-live.test.ts:175` | test("Phase 1 stays byte-identical: gemini-proxy, no effort on a flash purpose") (L175-192) | delete or flip: the phase-1 route must not be a dead proxy; note effort/provider become defined on a non-gemini vendor | 예 |
| `src/lib/llm/__tests__/vendor-routing-live.test.ts:195` | embedTexts → fn toBe("gemini-proxy"), modelUsed "gemini-embedding-2" fixture (L195-209) | flip to "openai-proxy" when embedVendor() default flips | 예 |
| `src/lib/llm/__tests__/vendor-routing-live.test.ts:211` | test("owner pin: capture_ocr goes to gemini-proxy even in Phase 2") → "gemini-proxy", effort undefined (L211-2 | flip to "openai-proxy"; expect effort to be defined (capture_ocr has no PHASE2_EFFORT entry → DEFAULT_EFFORT on a non-gemini vendor) | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:320` | expect(proxyFnForVendor("gemini")).toBe("gemini-proxy"); expect(proxyFnForVendor(undefined)).toBe("gemini-prox | delete the "gemini" case; re-pin `undefined` to the new default proxy when LlmProxyFn drops "gemini-proxy" | 예 |
| `src/lib/llm/__tests__/vendor-switch-reachability.test.ts:126` | expect(proxyFnForVendor("gemini")).toBe("gemini-proxy"); expect(proxyFnForVendor(undefined)).toBe("gemini-prox | delete the "gemini" case; re-pin `undefined` to the new default proxy | 예 |
| `src/lib/llm/boundary.ts:686` | const primaryFn = proxyFnForVendor(reasoningProvider); | no change here once L608 makes reasoningProvider always defined and routing.ts:495 stops defaulting to gemini-proxy | 예 |
| `src/lib/llm/routing.ts:28` | export type LlmProxyFn = "gemini-proxy" \| "claude-proxy" \| "openai-proxy" \| "xai-proxy"; | delete "gemini-proxy" from the union together with proxyFnForVendor L495 | 예 |
| `src/lib/llm/routing.ts:495` | return "gemini-proxy"; | make proxyFnForVendor exhaustive over claude/openai/xai and throw on undefined/unknown instead of silently naming the retired function; boun | 예 |
| `src/lib/safety/__tests__/crisis-terms-proxy-parity.test.ts:21` | "gemini-proxy": "../../../../supabase/functions/gemini-proxy/index.ts", (+ comment L4) | delete the entry when the gemini-proxy source is deleted; _shared/llm-proxy-common keeps covering claude/openai/xai | 예 |
| `src/lib/safety/__tests__/edge-jwt-hardening.test.ts:95` | expect.arrayContaining(["claude-proxy", "delete-account", "export-account", "gemini-proxy", …]) (+ comment L8) | drop "gemini-proxy" from the expected list when its source directory is deleted | 예 |
| `src/lib/wiki/__tests__/capture-file-audio.test.ts:15` | PROXY_SRC = readFileSync(…"gemini-proxy", "index.ts") → ALLOWED_AUDIO_MIME / MAX_AUDIO_BASE64_LEN subset check | re-point at supabase/functions/openai-proxy/index.ts (same constant names at openai-proxy:102-103) — ideally now, since openai is the deploy | 예 |
| `supabase/config.toml:74` | [functions.gemini-proxy] verify_jwt = true | delete the block in the same PR that deletes the function; note deploy-edge-function.yml has no delete path, so run `supabase functions dele | 예 |
| `supabase/functions/gemini-proxy/index.ts:1` | // Gemini proxy Edge Function.  (whole function: auth, consent gate, crisis gate, tier gate, spend cap, audit  | delete the function directory + `supabase functions delete gemini-proxy` on the project; same PR must update the four external readers of th | **아니오** |

### `model-id` (29)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.github/workflows/android-release.yml:100` | EXPO_PUBLIC_MODEL_LITE: ${{ vars.EXPO_PUBLIC_MODEL_LITE \|\| 'gemini-3.5-flash' }} | delete (or neutral tier id) once types.ts MODELS drops Gemini ids | 예 |
| `.github/workflows/android-release.yml:101` | EXPO_PUBLIC_MODEL_FLASH: ${{ vars.EXPO_PUBLIC_MODEL_FLASH \|\| 'gemini-3.5-flash' }} | same as line 100 | 예 |
| `.github/workflows/android-release.yml:102` | EXPO_PUBLIC_MODEL_PRO: ${{ vars.EXPO_PUBLIC_MODEL_PRO \|\| 'gemini-3.5-flash' }} | same as line 100 | 예 |
| `.github/workflows/web-deploy.yml:93` | EXPO_PUBLIC_MODEL_LITE: ${{ vars.EXPO_PUBLIC_MODEL_LITE \|\| 'gemini-3.5-flash' }} | delete (or neutral tier id) once types.ts MODELS drops Gemini ids | 예 |
| `.github/workflows/web-deploy.yml:94` | EXPO_PUBLIC_MODEL_FLASH: ${{ vars.EXPO_PUBLIC_MODEL_FLASH \|\| 'gemini-3.5-flash' }} | same as line 93 | 예 |
| `.github/workflows/web-deploy.yml:95` | EXPO_PUBLIC_MODEL_PRO: ${{ vars.EXPO_PUBLIC_MODEL_PRO \|\| 'gemini-3.5-flash' }} | same as line 93 | 예 |
| `eas.json:27` | "EXPO_PUBLIC_MODEL_LITE": "gemini-3.5-flash"  (preview profile) | delete (or set a neutral tier id) together with types.ts MODELS Gemini defaults; ship bundled with a build and mirror in the EAS preview env | **아니오** |
| `eas.json:28` | "EXPO_PUBLIC_MODEL_FLASH": "gemini-3.5-flash"  (preview profile) | delete with types.ts MODELS Gemini defaults; bundle with a build; mirror in EAS preview env | **아니오** |
| `eas.json:29` | "EXPO_PUBLIC_MODEL_PRO": "gemini-3.5-flash"  (preview profile) | delete with types.ts MODELS Gemini defaults; bundle with a build; mirror in EAS preview env | **아니오** |
| `eas.json:66` | "EXPO_PUBLIC_MODEL_LITE": "gemini-3.5-flash"  (preview-emulator profile) | same as preview: delete with types.ts MODELS Gemini defaults; bundle with a build | **아니오** |
| `eas.json:67` | "EXPO_PUBLIC_MODEL_FLASH": "gemini-3.5-flash"  (preview-emulator profile) | same as preview | **아니오** |
| `eas.json:68` | "EXPO_PUBLIC_MODEL_PRO": "gemini-3.5-flash"  (preview-emulator profile) | same as preview | **아니오** |
| `eas.json:113` | "EXPO_PUBLIC_MODEL_LITE": "gemini-3.5-flash"  (production profile) | delete with types.ts MODELS Gemini defaults; bundle with the next store build; mirror in EAS production env | **아니오** |
| `eas.json:114` | "EXPO_PUBLIC_MODEL_FLASH": "gemini-3.5-flash"  (production profile) | same as line 113 | **아니오** |
| `eas.json:115` | "EXPO_PUBLIC_MODEL_PRO": "gemini-3.5-flash"  (production profile) | same as line 113 | **아니오** |
| `src/lib/llm/__tests__/boundary.mock.test.ts:85` | expect(arg.modelUsed).toBe("mock:gemini-2.5-flash"); | update to `mock:${MODELS.flash}` or to the new MODELS default when types.ts:174-184 defaults change | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:121` | expect(SAFETY).toMatch(/\.\.\.\(vendor === "gemini" \? \{ model: MODELS\.flash \} : \{\}\)/) (L121-126) | delete with the Gemini-only model hint in safety.ts:247 | 예 |
| `src/lib/llm/__tests__/safety-classify-proxy.test.ts:44` | expect(body.model).toBe(MODELS.flash); | delete when the Gemini-only model hint (safety.ts:247) is removed — openai-proxy ignores `model` | 예 |
| `src/lib/llm/__tests__/safety.test.ts:158` | expect(mockInsertAudit…).toMatchObject({ userId: "u1", modelUsed: "gemini-2.5-flash" }) | delete with the direct Flash classifier (safety.ts:313, 372 hardcode the id) | 예 |
| `src/lib/llm/boundary.ts:967` | export const EMBED_MODEL = "gemini-embedding-2"; export const EMBED_DIM = 768; | after the embed cutover (flip -> NULL vectors -> rebuild, docs/LLM-ROUTING.md) replace with the openai embedding id the proxy reports, or re | 예 |
| `src/lib/llm/boundary.ts:1172` | const model = MODELS.flash;  (sent as `model` in the audio proxy body at L1231 and used as the audit fallback) | stop sending `model` to the proxy (openai-proxy owns it); use a tier label for the mock/fallback audit row | 예 |
| `src/lib/llm/boundary.ts:1404` | const model = MODELS.pro; // Advisor uses Pro for nuance; Flash was the classifier. | same as L1172: drop the `model` body field (L1473), keep a tier label for mock/fallback audit | 예 |
| `src/lib/llm/safety.ts:247` | ...(vendor === "gemini" ? { model: MODELS.flash } : {}), | delete the gemini-only model hint (and comment L233-246 'defaulted to old-gen gemini-2.5-flash ... Gemini-only hint'); update safety-classif | 예 |
| `src/lib/llm/safety.ts:313` | const res = await client.models.generateContent({ model: "gemini-2.5-flash", contents: [...C-SSRS prompt...],  | delete L310-389 (the direct Layer-2 branch) — the proxy path at L217-284 already carries the same prompt + schema | 예 |
| `src/lib/llm/safety.ts:372` | modelUsed: "gemini-2.5-flash",  (client-side C3 audit row for the direct classifier call) | delete with L313; the proxy audits its own safety_classify rows | 예 |
| `src/lib/llm/types.ts:174` | export const MODELS = { lite: EXPO_PUBLIC_MODEL_LITE \|\| "gemini-2.5-flash-lite", flash: ... "gemini-2.5-flas | once the direct SDK path is gone the id is only (a) a `model` body field every non-gemini proxy ignores and (b) the `mock:<id>` / audit-fall | 예 |
| `supabase/functions/_shared/axis-key-name.ts:23` | 'gemini-2.5-flash': 'G25FLASH', 'gemini-2.5-flash-lite': 'G25FLASHLITE', 'gemini-2.5-pro': 'G25PRO', 'gemini-3 | delete the five gemini entries after gemini-proxy is gone; update __tests__/axis-key-name.test.ts:17-18 in the same change | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:97` | ? 'GEMINI_MODEL_FLASH_LITE' : ... 'GEMINI_MODEL_FLASH' : ... 'GEMINI_MODEL_PRO' | delete with the function; remove GEMINI_MODEL_FLASH_LITE / GEMINI_MODEL_FLASH / GEMINI_MODEL_PRO secrets (written by scripts/refresh-models. | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:113` | const EMBED_MODEL = (Deno.env.get('GEMINI_EMBED_MODEL') ?? '').trim() \|\| 'gemini-embedding-2'; | delete with the function; remove GEMINI_EMBED_MODEL secret; pair with an embedding re-index migration (see 0142 entry) | **아니오** |

### `secret` (15)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.env.example:14` | GOOGLE_API_KEY= | delete with env.ts GOOGLE_API_KEY / EXPO_PUBLIC_GOOGLE_API_KEY and the AI-Studio direct branch | 예 |
| `.github/workflows/credential-expiry-check.yml:155` | GEMINI: ${{ secrets.GEMINI_API_KEY }} | delete (with the probe block at 179-182) | 예 |
| `.github/workflows/credential-expiry-check.yml:180` | curl https://generativelanguage.googleapis.com/v1beta/models -H "x-goog-api-key: $GEMINI" / probe "GEMINI_API_ | delete lines 179-182 | 예 |
| `.github/workflows/web-deploy.yml:83` | EXPO_PUBLIC_GOOGLE_API_KEY: ${{ vars.EXPO_PUBLIC_GOOGLE_API_KEY }} | delete lines 79-83 together with env.ts:222/264 EXPO_PUBLIC_GOOGLE_API_KEY acceptance (direct @google/genai key path on web) | 예 |
| `docs/LLM-ROUTING.md:378` | 조합 키는 GEMINI_API_KEY__G35FLASH__{LOW,MEDIUM,HIGH,XHIGH} 4개만 발급·등록(완료) | console: delete these 4 Supabase combo secrets together with GEMINI_API_KEY (HANDOFF:2096 says combos are untouched until the 9월 PR); then m | **아니오** |
| `src/lib/__tests__/env.test.ts:39` | test("LLM_MODE defaults to live when EXPO_PUBLIC_GOOGLE_API_KEY is set" … expect(env.GOOGLE_API_KEY) | delete with the GOOGLE_API_KEY / EXPO_PUBLIC_GOOGLE_API_KEY env fields, AFTER LLM_MODE=live is set explicitly for the web | **아니오** |
| `src/lib/__tests__/env.test.ts:50` | EXPO_PUBLIC_GOOGLE_API_KEY wins over GOOGLE_API_KEY (L50-57) / GOOGLE_API_KEY fallback (L60-67) | delete with the client-side Google key plumbing | **아니오** |
| `src/lib/env.ts:145` | // GOOGLE_API_KEY without EXPO_PUBLIC_ is server-side only ... Production should route Gemini through a Supaba | remove GOOGLE_API_KEY (L151), GOOGLE_CLOUD_PROJECT (L143), GOOGLE_CLOUD_LOCATION (L144) from the schema and readRaw (L222, L260-264) once bo | 예 |
| `src/lib/env.ts:222` | const publicGoogleKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;  ... GOOGLE_API_KEY: publicGoogleKey \|\| proc | delete with the schema entry; the inlined-web-key path (comment L146-150 warns it is extractable) has no remaining purpose | 예 |
| `src/lib/llm/__tests__/transcribe-audio-live.test.ts:61` | EXPO_PUBLIC_GEMINI_API_KEY: "", | delete — the key name exists nowhere else in the repo (not in env.ts) | 예 |
| `src/lib/llm/boundary.ts:130` | cachedClient = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY ?? "" }); | delete; then remove any GOOGLE_API_KEY / EXPO_PUBLIC_GOOGLE_API_KEY values from EAS/repo secrets (rotate/revoke the Google key with GEMINI_A | 예 |
| `src/lib/llm/safety.ts:101` | cachedClient = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY ?? "" }); | delete; second reader of GOOGLE_API_KEY (with boundary.ts:130) | 예 |
| `supabase/functions/gemini-proxy/index.ts:21` | //   GEMINI_API_KEY          — the Google AI Studio key | rotate/remove the GEMINI_API_KEY Edge Function secret after the function is deleted (Google rejects Standard keys from September anyway) | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:386` | const apiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim(); | delete with the function; rotate/remove secret | **아니오** |
| `supabase/functions/gemini-proxy/index.ts:806` | const resolvedKey = resolveApiKey('GEMINI', effectiveModel, effortSlug, apiKey); | delete with the function; remove combo secrets GEMINI_API_KEY__G35FLASH__{LOW,MEDIUM,HIGH,XHIGH} (measured in ai_audit_log.key_combo) and an | **아니오** |

### `direct-sdk` (30)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.env.example:11` | EXPO_PUBLIC_USE_VERTEX=true | delete with the boundary.ts Vertex branch and check-constraints.ts C2 (which pins EXPO_PUBLIC_USE_VERTEX + GOOGLE_CLOUD_PROJECT in env.ts) | 예 |
| `.env.example:12` | GOOGLE_CLOUD_PROJECT= | delete with C2 branch | 예 |
| `.env.example:13` | GOOGLE_CLOUD_LOCATION=us-central1 | delete with C2 branch | 예 |
| `eslint.config.mjs:83` | // Allow @google/genai ONLY inside the wrapper module + the safety classifier  (patterns at 73, 115) | drop @google/genai from the restricted patterns and the override; MUST rewrite check-constraints C1 (L44) in the same PR or `npm run check:c | 예 |
| `package.json:49` | "@google/genai": "^1.0.0" | remove only in the same PR as boundary.ts direct-client branches, safety.ts import, eslint no-restricted-imports entry, check-constraints C1 | **아니오** |
| `scripts/check-llm-import-boundary.ts:11` | const GEMINI_WRAPPER = ["src", "lib", "llm", "boundary.ts"].join("/"); | rename (LLM_WRAPPER); keep the allowlist while the SDK is imported | 예 |
| `src/lib/__tests__/capture-abort-contract.test.ts:37` | expect(gemini).toContain("abortSignal: input.signal"); | delete this expectation when the direct @google/genai path is removed | 예 |
| `src/lib/llm/__tests__/advisor-output-swap.test.ts:10` | jest.mock("@google/genai", … generateContent) with EXPO_PUBLIC_USE_VERTEX: true (L56) | re-point the suite at the proxy path (mock functions.invoke) and drop the SDK mock when the direct client is removed | 예 |
| `src/lib/llm/__tests__/boundary-output-swap.test.ts:14` | jest.mock("@google/genai") + EXPO_PUBLIC_USE_VERTEX: true, VIA_EDGE false (L40-45) | re-point at the proxy path and drop the SDK mock when the direct client is removed | 예 |
| `src/lib/llm/__tests__/boundary.mock.test.ts:8` | jest.mock("@google/genai", () => ({ GoogleGenAI: … generateContent })) | delete the mock when boundary.ts stops importing @google/genai | 예 |
| `src/lib/llm/__tests__/boundary.test.ts:10` | jest.mock("@google/genai", () => { … mockGenerateContent }) (header L4) | re-point live tests at the proxy invoke mock; delete SDK mock when the direct client is removed | 예 |
| `src/lib/llm/__tests__/boundary.test.ts:78` | test("C9: red-zone input short-circuits and does NOT call Gemini SDK") → mockGenerateContent not called | re-express as 'does not call functions.invoke' when SDK removed | 예 |
| `src/lib/llm/__tests__/boundary.test.ts:269` | test("abort signal is passed to the direct Gemini request config") → callArg.config.abortSignal (L269-283) | delete with the direct path (edge path already asserts signal forwarding elsewhere) | 예 |
| `src/lib/llm/__tests__/boundary.test.ts:285` | test("pre-aborted calls do not reach Gemini or audit") → mockGenerateContent not called (L285-298) | re-point probe to invoke mock; rename | 예 |
| `src/lib/llm/__tests__/purpose-tier.test.ts:17` | jest.mock("@google/genai", () => ({ GoogleGenAI: … })) | delete when boundary.ts stops importing @google/genai | 예 |
| `src/lib/llm/__tests__/safety.test.ts:12` | jest.mock("@google/genai") — live tests drive the direct Flash classifier (USE_VERTEX true, L67+) | re-point the live cases at classifyViaProxy (invoke mock) and delete the SDK mock when safety.ts drops @google/genai | 예 |
| `src/lib/llm/__tests__/safety.test.ts:59` | test("mock mode: Gemini Flash never called, lexicon-only result") → mockGenerateContent not called | re-point probe; rename | 예 |
| `src/lib/llm/__tests__/transcribe-audio-live.test.ts:65` | jest.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent } } })) | delete when boundary.ts drops the SDK (only asserted not-called at L160, L194) | 예 |
| `src/lib/llm/boundary.ts:11` | import { GoogleGenAI } from "@google/genai"; | delete with getClient()/effortToConfig/THINKING_OFF_PURPOSES/assertDirectEgressAllowed and the three direct branches; same PR must update es | 예 |
| `src/lib/llm/boundary.ts:66` | // Map a reasoning effort level to a @google/genai generation config. function effortToConfig(effort) { thinki | delete L66-99 (only consumers are the direct branches at L767 and L1539) | 예 |
| `src/lib/llm/boundary.ts:102` | // Verbatim transcription gains nothing from thinking tokens: gemini-2.5-flash runs dynamic thinking by defaul | delete L101-106 with its only use at L770-772 | 예 |
| `src/lib/llm/boundary.ts:117` | function getClient() { ... new GoogleGenAI({ vertexai: true, project: env.GOOGLE_CLOUD_PROJECT!, ... }) / new  | delete L114-134; afterwards GOOGLE_API_KEY / EXPO_PUBLIC_GOOGLE_API_KEY / GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION / EXPO_PUBLIC_USE_VER | 예 |
| `src/lib/llm/boundary.ts:147` | function assertDirectEgressAllowed(env) { if (LLM_MODE === "live" && !USE_VERTEX) throw ... "uncapped direct A | delete L136-155 with the direct branches (or keep as an always-throw tripwire if the else-branches are kept as dead code — prefer delete). C | 예 |
| `src/lib/llm/boundary.ts:758` | } else { // C2 client constructed with Vertex when configured. assertDirectEgressAllowed(env); const { client, | delete L757-797 (incl. the 'Gemini's OCR/vision best practice' inlineData ordering at L781-786) | 예 |
| `src/lib/llm/boundary.ts:765` | ...(input.signal ? { abortSignal: input.signal } : {}),  (@google/genai request config; also 1261) | goes with the direct branch — BUT src/lib/__tests__/capture-abort-contract.test.ts:37 pins the literal `abortSignal: input.signal`; update t | 예 |
| `src/lib/llm/boundary.ts:1088` | } else { // Direct path: Vertex-only live egress passes the cost guard. ... client.models.embedContent({ model | delete L1088-1102; make the edge path unconditional | 예 |
| `src/lib/llm/boundary.ts:1244` | } else { // Direct/Vertex client path (C2). assertDirectEgressAllowed(env); const { client, vertex } = getClie | delete L1244-1266; make the proxy path unconditional | 예 |
| `src/lib/llm/boundary.ts:1531` | assertDirectEgressAllowed(env); const c = getClient(); ... c.client.models.generateContent({ model, contents:  | delete L1530-1544 | 예 |
| `src/lib/llm/safety.ts:16` | import { GoogleGenAI } from "@google/genai"; | delete with getFlashClient() and the Layer-2 direct branch L310-389; classifySafety then always takes the `!client` path (proxy-or-lexicon); | 예 |
| `src/lib/llm/safety.ts:78` | function getFlashClient(): GoogleGenAI \| null { ... new GoogleGenAI({ vertexai: true, ... }) / new GoogleGenA | delete L77-107 (incl. the H4-residual comment L82-91 referencing 'uncapped Gemini egress' and 'assertDirectEgressAllowed (gemini.ts)') | 예 |

### `workflow-fallback` (17)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.github/workflows/android-release.yml:105` | EXPO_PUBLIC_LLM_PHASE: ${{ vars.EXPO_PUBLIC_LLM_PHASE \|\| '1' }} | keep until routing.ts:482 phase rung is removed, then delete | 예 |
| `.github/workflows/android-release.yml:108` | EXPO_PUBLIC_CHAT_VENDOR: ${{ vars.EXPO_PUBLIC_CHAT_VENDOR \|\| 'gemini' }} | flip fallback to 'openai' | 예 |
| `.github/workflows/android-release.yml:111` | EXPO_PUBLIC_LLM_VENDOR: ${{ vars.EXPO_PUBLIC_LLM_VENDOR \|\| '' }} | flip fallback to 'perPurpose' | 예 |
| `.github/workflows/android-release.yml:116` | EXPO_PUBLIC_MULTIMODAL_VENDOR: ${{ vars.EXPO_PUBLIC_MULTIMODAL_VENDOR \|\| '' }} | flip fallback to 'openai' | 예 |
| `.github/workflows/android-release.yml:117` | EXPO_PUBLIC_BACKBONE_VENDOR: ${{ vars.EXPO_PUBLIC_BACKBONE_VENDOR \|\| '' }} | flip fallback to 'openai' | 예 |
| `.github/workflows/android-release.yml:120` | EXPO_PUBLIC_EMBED_VENDOR: ${{ vars.EXPO_PUBLIC_EMBED_VENDOR \|\| '' }} | flip fallback to 'openai' | 예 |
| `.github/workflows/android-release.yml:124` | EXPO_PUBLIC_FAILOVER_VENDOR: ${{ vars.EXPO_PUBLIC_FAILOVER_VENDOR \|\| '' }} | flip fallback to 'none' | 예 |
| `.github/workflows/android-release.yml:127` | EXPO_PUBLIC_SAFETY_VENDOR: ${{ vars.EXPO_PUBLIC_SAFETY_VENDOR \|\| '' }} | flip fallback to 'openai' and set the (missing) repo Variable; update the two tests named for web-deploy.yml:143 | 예 |
| `.github/workflows/web-deploy.yml:103` | EXPO_PUBLIC_REASONING_PROVIDER: ${{ vars.EXPO_PUBLIC_REASONING_PROVIDER \|\| 'gemini' }} | interim: flip fallback to 'openai' and set/delete the repo Variable; final: delete the line with routing.ts legacyReasoningProvider() + vend | 예 |
| `.github/workflows/web-deploy.yml:106` | EXPO_PUBLIC_LLM_PHASE: ${{ vars.EXPO_PUBLIC_LLM_PHASE \|\| '1' }} | keep until routing.ts:482 phase rung is removed, then delete | 예 |
| `.github/workflows/web-deploy.yml:111` | EXPO_PUBLIC_CHAT_VENDOR: ${{ vars.EXPO_PUBLIC_CHAT_VENDOR \|\| 'gemini' }} | flip fallback to 'openai' so a deleted Variable cannot resurrect gemini-proxy | 예 |
| `.github/workflows/web-deploy.yml:118` | EXPO_PUBLIC_LLM_VENDOR: ${{ vars.EXPO_PUBLIC_LLM_VENDOR \|\| '' }} | flip fallback to 'perPurpose' (unset = phase rule = gemini for all 12 seats) | 예 |
| `.github/workflows/web-deploy.yml:128` | EXPO_PUBLIC_MULTIMODAL_VENDOR: ${{ vars.EXPO_PUBLIC_MULTIMODAL_VENDOR \|\| '' }} | flip fallback to 'openai' (unset resolves gemini in routing.ts multimodalVendor) | 예 |
| `.github/workflows/web-deploy.yml:133` | EXPO_PUBLIC_BACKBONE_VENDOR: ${{ vars.EXPO_PUBLIC_BACKBONE_VENDOR \|\| '' }} | flip fallback to 'openai' (routing.ts:132 defaults gemini) | 예 |
| `.github/workflows/web-deploy.yml:136` | EXPO_PUBLIC_EMBED_VENDOR: ${{ vars.EXPO_PUBLIC_EMBED_VENDOR \|\| '' }} | flip fallback to 'openai'; do NOT change the Variable (re-index already done for openai) | 예 |
| `.github/workflows/web-deploy.yml:140` | EXPO_PUBLIC_FAILOVER_VENDOR: ${{ vars.EXPO_PUBLIC_FAILOVER_VENDOR \|\| '' }} | flip fallback to 'none' (unset = retry on gemini-proxy) | 예 |
| `.github/workflows/web-deploy.yml:143` | EXPO_PUBLIC_SAFETY_VENDOR: ${{ vars.EXPO_PUBLIC_SAFETY_VENDOR \|\| '' }} | flip fallback to 'openai' AND set the repo Variable (none exists); update gemini-last-hardcodes.test.ts + native-web-vendor-parity INTENDED_ | 예 |

### `test-pin` (62)

| 파일:줄 | 무엇 | 폐기 PR 에서 | safe_now |
|---|---|---|:---:|
| `.github/workflows/supabase-dry-run.yml:76` | psql ... "\d+ ai_audit_log" \| grep vertex_backend | keep — historical; the C2-era column stays in the schema and in audit rows | 예 |
| `scripts/check-constraints.ts:44` | const ok = eslintConfig.includes("@google/genai") && eslintConfig.includes("no-restricted-imports"); | keep while the SDK stays; when @google/genai is removed, retarget C1 to the remaining vendor SDK names in eslint.config.mjs | 예 |
| `scripts/check-constraints.ts:58` | wrapper.includes("vertexai: true") && envFile.includes("EXPO_PUBLIC_USE_VERTEX") && envFile.includes("GOOGLE_C | C2 is a retired competition remnant (CLAUDE.md); delete or rewrite this check in the same PR that removes the Vertex branch from boundary.ts | 예 |
| `scripts/check-constraints.ts:582` | const generateIdx = wrapper.indexOf("generateContent");  (C9: classifier must precede the LLM call) | re-anchor C9 to the proxy invoke (e.g. `functions.invoke(` / `proxyFnForVendor(`) — once the SDK branches go, `generateContent` vanishes fro | 예 |
| `scripts/check-constraints.ts:708` | wrapper.includes("function assertDirectEgressAllowed") && guardCount >= 2  (Cost check; comment 703-706) | retire/rewrite the Cost check with the guard it fences (boundary.ts:147 deletion) | 예 |
| `scripts/check-constraints.ts:710` | wrapper.includes("function assertDirectEgressAllowed") ... /assertDirectEgressAllowed\(env\)/g ... guardCount  | delete or rewrite the Cost check in the same PR that removes the two direct @google/genai branches from boundary.ts | 예 |
| `scripts/check-constraints.ts:1269` | "I understand my entries are processed by Google Gemini to generate responses."  (forbiddenTrustCopy) | keep — regression guard that consent copy never claims Gemini processing | 예 |
| `scripts/check-constraints.ts:1271` | "내 기록이 응답 생성을 위해 Google Gemini로 처리됨을 이해합니다."  (forbiddenTrustCopy) | keep — regression guard | 예 |
| `scripts/check-llm-import-boundary.ts:37` | pattern: /from\s+["']@google\/genai["']/, allowed: [GEMINI_WRAPPER, SAFETY_LLM, ...GEMINI_TESTS] | after @google/genai is removed, keep the pattern but empty the allowlist so any re-import fails C1; otherwise unchanged | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:79` | test("unset keeps every backbone purpose on Gemini") → backboneVendor() toBe("gemini") (L79-83) | flip expectation to the new unset default (openai) when routing.ts backboneVendor() default flips | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:85` | junk values → backboneVendor() toBe("gemini") (L85-92) | flip fallback expectation to the new default | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:107` | LLM_VENDOR unset + PHASE=1 → every PHASE2_VENDOR seat toBe("gemini") (L107-114) | flip: the phase-1 rule `if (llmPhase() !== 2) return "gemini"` must resolve a live vendor | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:116` | chat/multimodal unset → secondb_chat, capture_ocr, capture_voice toBe("gemini") (L116-123) | flip to the new chat / multimodal unset defaults | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:125` | seats=openai, backbone unset → BACKBONE purposes toBe("gemini") (L125-132) | flip to new backbone default (intent 'seat switch does not reach backbone' survives) | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:134` | imagine + image, multimodal unset → toBe("gemini") (L134-140) | flip to new multimodal default | 예 |
| `src/lib/llm/__tests__/backbone-vendor-exit.test.ts:173` | sweep: with all four switches=openai no purpose resolves "gemini" (L173-189) | keep; after retirement add the unset case (no switch set → still no gemini) | 예 |
| `src/lib/llm/__tests__/embed-vendor-exit.test.ts:41` | test("unset stays on Gemini") → embedVendor() toBe("gemini") (L41-44) | flip to openai when embedVendor() default flips | 예 |
| `src/lib/llm/__tests__/embed-vendor-exit.test.ts:46` | junk → embedVendor() toBe("gemini") (L46-51) | flip fallback expectation | 예 |
| `src/lib/llm/__tests__/embed-vendor-exit.test.ts:61` | claude / xai refused → embedVendor() toBe("gemini") (L61-70) | flip: refusal must land on openai (the only remaining embedder) | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:45` | test("unset still retries on Gemini") → failoverVendor() toBe("gemini") (L45-48) | flip: unset default should become "none" (the deployed posture) or a live vendor | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:65` | junk → failoverVendor() toBe("gemini") (L65-70) | flip fallback expectation | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:98` | test("unset stays on Gemini") → safetyVendor() toBe("gemini") (L98-101) | flip to openai when safetyVendor() default flips | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:103` | openai accepted; claude/xai/grok/junk → safetyVendor() toBe("gemini") (L103-113) | flip fallback to openai and stop accepting "gemini" | 예 |
| `src/lib/llm/__tests__/gemini-last-hardcodes.test.ts:141` | for (const k of KEYS) expect(src).toContain(k)  (web-deploy.yml, android-release.yml, eas.json must all name t | any key deleted from eas.json/workflows must leave KEYS too; update the default pins | 예 |
| `src/lib/llm/__tests__/gemini-residue.test.ts:38` | const RESIDUE = { routing.ts 17/2, boundary.ts 5/0, safety.ts 1/0, types.ts 1/0, crosscheck.ts 2/0 }; UNSET_DE | update the table to the post-retirement counts (bidirectional ratchet; should end at 0/0 and 0 unset sites); L106-109 also pin three strings | 예 |
| `src/lib/llm/__tests__/gemini-residue.test.ts:41` | RESIDUE table: routing.ts gemini=27/proxy=5, boundary.ts 7/1, safety.ts 1/0, types.ts 2/0, crosscheck.ts 2/0 ( | retirement PR must re-measure and update every count (two-way ratchet) | 예 |
| `src/lib/llm/__tests__/gemini-residue.test.ts:67` | const UNSET_DEFAULT_SITES = 11; (routing.ts `?? "gemini"` / `return "gemini";` lines) | drop to 0 in the retirement PR | 예 |
| `src/lib/llm/__tests__/multimodal-vendor-exit.test.ts:46` | test("unset still means Gemini") → multimodalVendor() toBe("gemini") (L46-49) | flip to openai when multimodalVendor() default flips | 예 |
| `src/lib/llm/__tests__/multimodal-vendor-exit.test.ts:53` | test.each(["","   ","anthropic","OPENAI_PROXY","true","xai","grok"]) → toBe("gemini") (L53-59) | flip fallback expectation to openai | 예 |
| `src/lib/llm/__tests__/multimodal-vendor-exit.test.ts:100` | expect(GEMINI_PINNED_PURPOSES).toBe(MULTIMODAL_PURPOSES); (import L26) | delete the deprecated alias in routing.ts and this assertion/import | 예 |
| `src/lib/llm/__tests__/multimodal-vendor-exit.test.ts:149` | expect(seam).toMatch(/return normalizeVendor\(raw\) \?\? "gemini";/); | flip the legacyReasoningProvider() fallback literal (or delete the seam and this block) | 예 |
| `src/lib/llm/__tests__/native-web-vendor-parity.test.ts:87` | INTENDED_DIFFERENCES: EXPO_PUBLIC_SAFETY_VENDOR: "still gemini everywhere; the feature is off by default" | when eas.json + repo Variable move SAFETY_VENDOR to openai, move the key into WEB_POSTURE="openai" | 예 |
| `src/lib/llm/__tests__/phase2-vendor-stopgap.test.ts:82` | LLM_VENDOR=claude → resolveVendorForPurpose("secondb_chat") toBe("gemini") (L82-85) | flip to the new chat unset default | 예 |
| `src/lib/llm/__tests__/phase2-vendor-stopgap.test.ts:87` | LLM_VENDOR=openai → resolveVendorForPurpose("advisor", true) toBe("gemini") (L87-90) | flip to the new multimodal unset default | 예 |
| `src/lib/llm/__tests__/purpose-tier.test.ts:149` | expect(audit.reasoningProvider).toBe("gemini"); (pro tier, reasoning_connect, all switches unset) | flip to the new backbone default (boundary.ts:609 records vendorSeat on the pro tier) | 예 |
| `src/lib/llm/__tests__/reasoning-connect-routing.test.ts:23` | readFileSync(join(root, "supabase", "functions", "gemini-proxy", "index.ts"))  (describe 86-96 pins PRO_FOR_AL | delete the read and the gemini-proxy describe block | 예 |
| `src/lib/llm/__tests__/reasoning-connect-routing.test.ts:45` | expect(GEMINI_PINNED_PURPOSES.has("reasoning_connect")).toBe(false); (import L18) | rename to MULTIMODAL_PURPOSES when the alias is deleted | 예 |
| `src/lib/llm/__tests__/reasoning-connect-routing.test.ts:48` | PHASE=2, LLM_VENDOR unset → reasoning_connect toBe("gemini") (L48-54) | flip: assert equals backboneVendor() (intent 'not a seat' survives) | 예 |
| `src/lib/llm/__tests__/reasoning-connect-routing.test.ts:56` | LLM_VENDOR ∈ {openai,claude,perPurpose} → reasoning_connect toBe("gemini") (L56-64) | flip to backboneVendor() | 예 |
| `src/lib/llm/__tests__/reasoning-connect-routing.test.ts:66` | cluster_infer seat … expect(seat).not.toBe("gemini") (L66-74) | keep (optionally assert not.toBe(backboneVendor())) | 예 |
| `src/lib/llm/__tests__/vendor-routing-live.test.ts:142` | expect(mockInvoke.mock.calls[1]![0]).toBe("gemini-proxy")  (failover 127-147; 175-188 'Phase 1 byte-identical' | rewrite/delete these four cases | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:97` | test("Phase 1: every purpose (seats included) resolves to gemini") (L97-103) | flip: phase-1 seat rule + backbone default must resolve a live vendor | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:112` | test("Phase 2: non-seat purposes stay on the Gemini backbone") (L112-118) | flip to new backbone default | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:120` | GEMINI_PINNED_PURPOSES.has(capture_ocr/voice) + Phase 2 OCR/voice toBe("gemini") (L14, 120-128) | rewrite to MULTIMODAL_PURPOSES + new multimodal default | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:130` | test("image-bearing calls force gemini even on an openai seat") (L130-135) | flip to new multimodal default | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:140` | withVendor("gemini", () => expect(llmVendorOverride()).toBe("gemini")); | update when "gemini" leaves LlmVendor / normalizeVendor (expect null or a refusal) | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:150` | test("=gemini → 100% Gemini for every purpose, even with Phase 2 set") (L150-158) | delete (or convert to 'a retired vendor value is refused') | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:160` | =openai / =claude → non-seats (GEMINI_STAYERS) toBe("gemini") (L160-167, 169-174) | flip stayer expectation to backbone default | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:182` | perPurpose → expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini"); | flip to chat default | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:187` | for v of [openai,claude,gemini,perPurpose] → capture_ocr/voice/image toBe("gemini") (L187-195) | flip to multimodal default; drop "gemini" from the loop | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:197` | unset → withPhase("1") advisor toBe("gemini") (L197-202) | flip phase-1 rule expectation | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:220` | test("unset → chat stays on the Gemini backbone, in either phase") (L220-225) | flip to chat default | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:237` | withChatVendor("gemini", () => … toBe("gemini")) (L237-239) | delete | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:243` | garbage → expect(["gemini", "openai"]).toContain(got) (L243-252) | flip to the new default set | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:254` | chat=openai, phase 1 → seats and stayers toBe("gemini") (L254-265) | flip seat (phase rule) and stayer (backbone) expectations | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:267` | test("an image-bearing chat turn still goes to Gemini") + comment 'Only gemini-proxy forwards inline image dat | flip to multimodal default; fix the comment (openai-proxy forwards inline data since #1300) | 예 |
| `src/lib/llm/__tests__/vendor-routing.test.ts:275` | knob does not leak: secondb_chat / advisor toBe("gemini") (L275-288) | flip to chat default / phase-1 rule replacement | 예 |
| `src/lib/llm/__tests__/vendor-switch-reachability.test.ts:38` | ENV_KEYS includes "EXPO_PUBLIC_REASONING_PROVIDER" (required in web-deploy.yml, android-release.yml, eas.json) | remove the key here when the legacy seam is deleted (routing.ts says this test keeps it wired) | 예 |
| `src/lib/llm/__tests__/vendor-switch-reachability.test.ts:158` | near-miss (x-ai, grok-4, …) → backboneVendor() toBe("gemini") | flip fallback expectation | 예 |
| `src/lib/llm/__tests__/vendor-switch-reachability.test.ts:167` | MULTIMODAL_VENDOR=xai → multimodalVendor() toBe("gemini") | flip fallback expectation to openai | 예 |
| `src/lib/llm/__tests__/vendor-switch-reachability.test.ts:221` | every switch unset → backboneVendor() toBe("gemini"); multimodalVendor() toBe("gemini") (L221-222) | flip to new defaults (intent 'stays off xai' survives as not.toBe("xai")) | 예 |
| `supabase/functions/_shared/__tests__/axis-key-name.test.ts:17` | ['gemini-2.5-flash', 'G25FLASH'], ['gemini-2.5-pro', 'G25PRO'], | update test expectation (drop the two rows, or move them to the unknown-model fallback case) when MODEL_SLUGS gemini entries are removed | 예 |

