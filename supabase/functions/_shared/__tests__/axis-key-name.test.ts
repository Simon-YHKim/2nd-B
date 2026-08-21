// D-27 axis key attribution — unit tests for the PURE naming + resolver helpers.
//
// This imports the Deno-FREE module (../axis-key-name), so it compiles under
// ts-jest without the Deno global (llm-proxy-common.ts, which uses Deno.env, is
// intentionally NOT imported here). Covers: (1) model-id -> slug for known
// models + the deterministic fallback for an unknown model; (2) comboSecretName
// format; (3) pickApiKey selecting the combo secret vs. base-key fallback.

import { modelSlug, comboSecretName, isUsableHeaderValue, pickApiKey } from '../axis-key-name';

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

// ── 2026-08-19 회귀 ──────────────────────────────────────────────────
//
// 콤보 분기만 trim 하고 기본키 분기는 안 하고 있었다. 대시보드에 붙여넣은 시크릿은
// 끝에 개행이 남고, 헤더 값의 개행은 경고가 아니라 `fetch` 가 **던진다** —
// `TypeError: Failed to construct 'Request'`. 프록시는 그걸 `upstream_unreachable`
// 로 보고하므로 **벤더 장애처럼 보인다.**
//
// 그 비대칭은 콤보 키가 있는 동안만 숨어 있었다. 나이틀리 모델 최신화가 좌석을
// gpt-5.4 -> gpt-5.5 로 올리자 콤보 이름이 같이 바뀌었고(__GPT54__ -> __GPT55__),
// 그 시크릿이 없으니 기본키로 떨어졌고, 대화 표면이 502 로 죽었다.
describe("기본키 폴백도 trim 한다", () => {
  const noEnv = () => undefined;

  it("개행이 붙은 기본키를 그대로 돌려주지 않는다", () => {
    const r = pickApiKey(noEnv, "OPENAI", "gpt-5.5", "low", "sk-test-value\n");
    expect(r.apiKey).toBe("sk-test-value");
    expect(r.usedCombo).toBe(false);
  });

  it("헤더 값으로 쓸 수 있는 문자열이 나온다", () => {
    // 이 시험의 요점: 문자열 비교가 아니라 **헤더로 실제로 구성되는가**.
    for (const dirty of ["sk-a\n", " sk-b ", "sk-c\r\n", "\tsk-d"]) {
      const { apiKey } = pickApiKey(noEnv, "OPENAI", "gpt-5.5", "low", dirty);
      expect(() => new Headers({ authorization: `Bearer ${apiKey}` })).not.toThrow();
    }
  });

  it("콤보 키가 있을 때도 여전히 trim 한다", () => {
    const r = pickApiKey((k) => (k.includes("GPT54") ? "sk-combo\n" : undefined), "OPENAI", "gpt-5.4", "low", "sk-base");
    expect(r.apiKey).toBe("sk-combo");
    expect(r.usedCombo).toBe(true);
  });

  it("빈 기본키는 빈 문자열로 남는다 (프록시의 미설정 가드가 잡도록)", () => {
    expect(pickApiKey(noEnv, "OPENAI", "gpt-5.5", "low", "   ").apiKey).toBe("");
  });
});

// 키가 헤더로 쓸 수 있는 값인가. 이 검사가 없으면 같은 상황이
// `502 upstream_unreachable` 로 나와서 **벤더 장애와 구분이 안 된다** —
// 2026-08-19 에 그거 알아내는 데 30분 걸렸다.
describe("isUsableHeaderValue", () => {
  it("정상 키를 통과시킨다", () => {
    expect(isUsableHeaderValue("sk-proj-AbC123_-xyz")).toBe(true);
  });

  it("제어문자가 든 값을 거른다", () => {
    // 대시보드에 붙여넣은 시크릿이 줄바꿈을 물고 오는 것이 실제 사고 원인이었다.
    for (const bad of ["sk-a" + String.fromCharCode(10) + "b", "sk-a" + String.fromCharCode(13) + "b", "sk-a" + String.fromCharCode(0) + "b"]) {
      expect({ input: JSON.stringify(bad), usable: isUsableHeaderValue(bad) })
        .toEqual({ input: JSON.stringify(bad), usable: false });
    }
  });

  it("실제로 Headers 가 받는지와 답이 같다", () => {
    // 문자열 규칙을 따로 정의하면 언젠가 런타임과 어긋난다. 진짜 기준에 맞춰본다.
    const cases = ["sk-ok", "sk-a" + String.fromCharCode(10) + "b", "sk-a" + String.fromCharCode(13) + "b", "sk-tab" + String.fromCharCode(9) + "x", ""];
    for (const v of cases) {
      let headersAccepts = true;
      try {
        new Headers({ authorization: "Bearer " + v });
      } catch {
        headersAccepts = false;
      }
      // 빈 문자열은 Headers 는 받지만 우리는 거른다(키가 없다는 뜻이므로).
      const expected = v.length === 0 ? false : headersAccepts;
      expect({ v: JSON.stringify(v), ours: isUsableHeaderValue(v) })
        .toEqual({ v: JSON.stringify(v), ours: expected });
    }
  });

  it("빈 값과 공백만 있는 값을 구분한다", () => {
    expect(isUsableHeaderValue("")).toBe(false);
    // 공백만 있는 값은 헤더로는 되지만 키로는 무의미하다 -- 프록시의 미설정 가드가 먼저 잡는다.
    expect(isUsableHeaderValue(" ")).toBe(true);
  });
});

// ── Tier 2: the effort-only key (REQ-260820-03) ────────────────────────────
//
// Why this tier exists, in one sentence: the tier-1 name is derived from the
// MODEL, so promoting a seat renames the secret out of existence and every
// effort level collapses onto the single base key.
//
// That is measured history, not a worry. From ai_audit_log.key_combo:
// gemini-3.5-flash ran on four distinct GEMINI_API_KEY__G35FLASH__{LOW,MEDIUM,
// HIGH,XHIGH} secrets on 07-28; when the seat moved to gemini-2.5-flash on
// 08-17 every call fell to plain GEMINI_API_KEY. It was silent because that
// base key was healthy. The same collapse on OpenAI on 08-19 landed on a base
// key with a control character in it and returned 502 - the identical defect,
// only louder.
describe('pickApiKey - effort-only tier', () => {
  const BASE = 'sk-base-xxxxxxxx';

  test('the (model x effort) combo still wins when both exist', () => {
    const env: Record<string, string> = {
      OPENAI_API_KEY__GPT54__LOW: 'sk-combo',
      OPENAI_API_KEY__LOW: 'sk-effort',
    };
    const r = pickApiKey((k) => env[k], 'OPENAI', 'gpt-5.4', 'low', BASE);
    expect(r).toEqual({
      apiKey: 'sk-combo',
      secretName: 'OPENAI_API_KEY__GPT54__LOW',
      usedCombo: true,
    });
  });

  test('falls to the effort key when no combo exists, and reports that name', () => {
    const env: Record<string, string> = { OPENAI_API_KEY__LOW: 'sk-effort' };
    const r = pickApiKey((k) => env[k], 'OPENAI', 'gpt-5.4', 'low', BASE);
    expect(r).toEqual({
      apiKey: 'sk-effort',
      // usedCombo true is what makes the proxies log this name into
      // ai_audit_log.key_combo instead of '<PREFIX>_API_KEY'.
      secretName: 'OPENAI_API_KEY__LOW',
      usedCombo: true,
    });
  });

  test('THE POINT: a model promotion does not disturb the effort key', () => {
    const env: Record<string, string> = { OPENAI_API_KEY__LOW: 'sk-effort' };
    const before = pickApiKey((k) => env[k], 'OPENAI', 'gpt-5.4', 'low', BASE);
    const after = pickApiKey((k) => env[k], 'OPENAI', 'gpt-5.5', 'low', BASE);
    expect(after.apiKey).toBe(before.apiKey);
    expect(after.secretName).toBe('OPENAI_API_KEY__LOW');
    expect(after.usedCombo).toBe(true);
  });

  test('different effort levels still resolve to different secrets', () => {
    const env: Record<string, string> = {
      ANTHROPIC_API_KEY__LOW: 'sk-low',
      ANTHROPIC_API_KEY__XHIGH: 'sk-xhigh',
    };
    const low = pickApiKey((k) => env[k], 'ANTHROPIC', 'claude-sonnet-5', 'low', BASE);
    const xhigh = pickApiKey((k) => env[k], 'ANTHROPIC', 'claude-sonnet-5', 'xhigh', BASE);
    expect(low.apiKey).toBe('sk-low');
    expect(xhigh.apiKey).toBe('sk-xhigh');
  });

  test('the effort key is trimmed, and a whitespace-only value counts as absent', () => {
    const padded: Record<string, string> = { XAI_API_KEY__HIGH: '  sk-effort\n' };
    expect(pickApiKey((k) => padded[k], 'XAI', 'grok-4', 'high', BASE).apiKey).toBe('sk-effort');

    const blank: Record<string, string> = { XAI_API_KEY__HIGH: '   ' };
    const r = pickApiKey((k) => blank[k], 'XAI', 'grok-4', 'high', BASE);
    expect(r.usedCombo).toBe(false);
    expect(r.apiKey).toBe(BASE);
  });

  test('effort is normalised to upper case in the secret name', () => {
    const env: Record<string, string> = { OPENAI_API_KEY__MEDIUM: 'sk-effort' };
    const r = pickApiKey((k) => env[k], 'OPENAI', 'gpt-5.4', 'MeDiUm', BASE);
    expect(r.secretName).toBe('OPENAI_API_KEY__MEDIUM');
    expect(r.apiKey).toBe('sk-effort');
  });

  test('with neither tier present it is still the base key, still trimmed, still usedCombo false', () => {
    // usedCombo must stay false here or the proxies' base-key fallback warning
    // goes quiet, which is how the 08-19 outage stayed invisible for so long.
    const r = pickApiKey(() => undefined, 'OPENAI', 'gpt-5.4', 'low', '  sk-base\n');
    expect(r).toEqual({
      apiKey: 'sk-base',
      secretName: 'OPENAI_API_KEY__GPT54__LOW',
      usedCombo: false,
    });
  });

  test('every effort in the shared vocabulary yields a distinct name', () => {
    // none/low/medium/high/xhigh is EFFORT_RANK, and 'max' folds to 'xhigh'
    // before clamping in all three proxies. Do not widen this vocabulary here.
    const names = ['none', 'low', 'medium', 'high', 'xhigh'].map(
      (e) => pickApiKey(() => undefined, 'OPENAI', 'gpt-5.4', e, 'b').secretName,
    );
    expect(new Set(names).size).toBe(5);
  });
});
