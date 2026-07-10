// D-27 axis key attribution — unit tests for the PURE naming + resolver helpers.
//
// This imports the Deno-FREE module (../axis-key-name), so it compiles under
// ts-jest without the Deno global (llm-proxy-common.ts, which uses Deno.env, is
// intentionally NOT imported here). Covers: (1) model-id -> slug for known
// models + the deterministic fallback for an unknown model; (2) comboSecretName
// format; (3) pickApiKey selecting the combo secret vs. base-key fallback.

import { modelSlug, comboSecretName, pickApiKey } from '../axis-key-name';

describe('modelSlug', () => {
  test.each([
    ['claude-sonnet-5', 'SONNET5'],
    ['claude-opus-4-8', 'OPUS48'],
    ['gpt-5.4', 'GPT54'],
    ['gpt-5.4-nano', 'GPT54NANO'],
    ['gemini-2.5-flash', 'G25FLASH'],
    ['gemini-2.5-pro', 'G25PRO'],
  ])('known model %s -> %s', (model, slug) => {
    expect(modelSlug(model)).toBe(slug);
  });

  test('unknown model falls back to an uppercased alphanumeric squash', () => {
    expect(modelSlug('gpt-6.0-turbo')).toBe('GPT60TURBO');
    expect(modelSlug('claude-haiku-9')).toBe('CLAUDEHAIKU9');
  });
});

describe('comboSecretName', () => {
  test('formats {PREFIX}_API_KEY__{SLUG}__{EFFORT} and uppercases the effort', () => {
    expect(comboSecretName('ANTHROPIC', 'claude-sonnet-5', 'high')).toBe(
      'ANTHROPIC_API_KEY__SONNET5__HIGH',
    );
    expect(comboSecretName('OPENAI', 'gpt-5.4', 'medium')).toBe('OPENAI_API_KEY__GPT54__MEDIUM');
    expect(comboSecretName('OPENAI', 'gpt-5.4-nano', 'none')).toBe(
      'OPENAI_API_KEY__GPT54NANO__NONE',
    );
  });
});

describe('pickApiKey', () => {
  const BASE = 'sk-base-xxxxxxxx';

  test('uses the dedicated combo key when the secret is present', () => {
    const env: Record<string, string> = {
      ANTHROPIC_API_KEY__OPUS48__XHIGH: 'sk-combo-opus-xhigh',
    };
    const r = pickApiKey((k) => env[k], 'ANTHROPIC', 'claude-opus-4-8', 'xhigh', BASE);
    expect(r).toEqual({
      apiKey: 'sk-combo-opus-xhigh',
      secretName: 'ANTHROPIC_API_KEY__OPUS48__XHIGH',
      usedCombo: true,
    });
  });

  test('falls back to the base key when the combo secret is absent', () => {
    const r = pickApiKey(() => undefined, 'OPENAI', 'gpt-5.4', 'high', BASE);
    expect(r).toEqual({
      apiKey: BASE,
      secretName: 'OPENAI_API_KEY__GPT54__HIGH',
      usedCombo: false,
    });
  });

  test('treats an empty / whitespace-only secret as absent (fallback to base)', () => {
    const env: Record<string, string> = { OPENAI_API_KEY__GPT54__LOW: '   ' };
    const r = pickApiKey((k) => env[k], 'OPENAI', 'gpt-5.4', 'low', BASE);
    expect(r.usedCombo).toBe(false);
    expect(r.apiKey).toBe(BASE);
  });

  test('selects a DIFFERENT secret per (model, effort) combo', () => {
    const env: Record<string, string> = {
      OPENAI_API_KEY__GPT54__LOW: 'sk-low',
      OPENAI_API_KEY__GPT54__HIGH: 'sk-high',
    };
    const get = (k: string) => env[k];
    expect(pickApiKey(get, 'OPENAI', 'gpt-5.4', 'low', BASE).apiKey).toBe('sk-low');
    expect(pickApiKey(get, 'OPENAI', 'gpt-5.4', 'high', BASE).apiKey).toBe('sk-high');
  });
});
