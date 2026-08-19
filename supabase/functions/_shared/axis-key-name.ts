// axis-key-name.ts
// D-27: (vendor × model × effort) axis API-key attribution — PURE helpers.
//
// Deliberately Deno-free (no `Deno.*`, no imports) so it compiles + unit-tests
// under ts-jest (node). The Deno env-reading wrapper `resolveApiKey` lives in
// ./llm-proxy-common.ts and delegates to pickApiKey() here.
//
// Secret naming (env-var safe: uppercase + underscore):
//   {PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}
//   e.g. ANTHROPIC_API_KEY__SONNET5__HIGH, OPENAI_API_KEY__GPT54__MEDIUM
// See docs/LLM-ROUTING.md "Axis key attribution".

// Model id -> slug (stable, legible, env-var safe). An UNKNOWN model falls back
// to an uppercased alphanumeric squash, so a newly-seated model still gets a
// deterministic combo name WITHOUT a code change (models move over time).
export const MODEL_SLUGS: Record<string, string> = {
  'claude-sonnet-5': 'SONNET5',
  'claude-opus-4-8': 'OPUS48',
  'gpt-5.4': 'GPT54',
  'gpt-5.4-nano': 'GPT54NANO',
  'gemini-2.5-flash': 'G25FLASH',
  'gemini-2.5-flash-lite': 'G25FLASHLITE',
  'gemini-2.5-pro': 'G25PRO',
  'gemini-3.5-flash': 'G35FLASH',
  'gemini-3.1-flash-lite': 'G31FLASHLITE',
};

export function modelSlug(model: string): string {
  const known = MODEL_SLUGS[model];
  if (known) return known;
  return model.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Combo secret name for a (vendor prefix, model, effort). Effort is uppercased. */
export function comboSecretName(prefix: string, model: string, effort: string): string {
  return `${prefix}_API_KEY__${modelSlug(model)}__${effort.toUpperCase()}`;
}

export interface ResolvedKey {
  apiKey: string;
  /** the combo secret name that was probed (for audit key_combo + fallback logs) */
  secretName: string;
  /** true = dedicated combo key used; false = base-key fallback */
  usedCombo: boolean;
}

/**
 * Pure key resolver: given an env reader, return the (model × effort) combo key
 * when its secret is present + non-empty, else fall back to the vendor base key.
 * `getEnv` is injected so this stays Deno-free + unit-testable; the Deno wrapper
 * passes (k) => Deno.env.get(k).
 *
 * BOTH branches trim. The combo branch always did; the base branch did not, and
 * that asymmetry took the chat surface down in production on 2026-08-19.
 *
 * What happened: a dashboard-pasted secret keeps its trailing newline. While a
 * combo key existed for the seat the trimmed branch hid it. The nightly model
 * refresh then promoted the frontier seat gpt-5.4 -> gpt-5.5, the combo name
 * changed with it (OPENAI_API_KEY__GPT54__LOW -> ...__GPT55__LOW), that secret
 * did not exist, and the fallback handed back the UNTRIMMED base key. A newline
 * in a header value is not a runtime warning -- `fetch` throws
 * `TypeError: Failed to construct 'Request'`, which the proxy reports as
 * `upstream_unreachable`, i.e. it looks exactly like a vendor outage.
 *
 * The failure is one model promotion away for EVERY vendor (all three proxies
 * read their base key with a bare `Deno.env.get`), and the combo-key fallback
 * exists precisely so promotions never break calls -- so it has to be the
 * branch that is hardest to break.
 */
export function pickApiKey(
  getEnv: (key: string) => string | undefined,
  prefix: string,
  model: string,
  effort: string,
  baseKey: string,
): ResolvedKey {
  const secretName = comboSecretName(prefix, model, effort);
  const combo = (getEnv(secretName) ?? '').trim();
  if (combo.length > 0) return { apiKey: combo, secretName, usedCombo: true };
  return { apiKey: (baseKey ?? '').trim(), secretName, usedCombo: false };
}
