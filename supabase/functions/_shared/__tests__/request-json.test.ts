import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  JsonBodyError,
  LLM_PROXY_JSON_BODY_LIMIT_BYTES,
  OAUTH_JSON_BODY_LIMIT_BYTES,
  PADDLE_WEBHOOK_BODY_LIMIT_BYTES,
  PADDLE_WEBHOOK_JSON_MAX_DEPTH,
  PEER_RESPONSE_JSON_BODY_LIMIT_BYTES,
  PUBLIC_DATA_PROXY_JSON_MAX_DEPTH,
  RSS_PROXY_JSON_BODY_LIMIT_BYTES,
  SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES,
  SUBSCRIPTION_MANAGE_JSON_MAX_DEPTH,
  hasJsonContentType,
  parseStrictJson,
  readBodyBytes,
  readJsonObject,
  readStrictJsonObject,
} from '../request-json';

function streamedRequest(
  chunks: Uint8Array[],
  options: {
    contentLength?: string;
    contentType?: string;
    onCancel?: () => void;
    onPull?: () => void;
  } = {},
): Request {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      options.onPull?.();
      const next = chunks.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
    cancel() {
      options.onCancel?.();
    },
  });
  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set('content-length', options.contentLength);
  }
  if (options.contentType !== undefined) {
    headers.set('content-type', options.contentType);
  }
  return { body: stream, headers } as Request;
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe('readJsonObject', () => {
  it('parses a JSON object split across streamed UTF-8 chunks', async () => {
    const encoded = bytes('{"message":"안녕"}');
    const request = streamedRequest([
      encoded.slice(0, 13),
      encoded.slice(13, 15),
      encoded.slice(15),
    ]);

    await expect(readJsonObject(request, encoded.byteLength)).resolves.toEqual({
      message: '안녕',
    });
  });

  it.each(['null', '[]', '"text"', '1', 'true', '{broken']) (
    'rejects invalid or non-object JSON: %s',
    async (payload) => {
      await expect(readJsonObject(streamedRequest([bytes(payload)]), 64)).rejects.toMatchObject({
        code: 'invalid_json',
      });
    },
  );

  it('enforces bytes read even when Content-Length lies below the limit', async () => {
    let cancelled = false;
    const request = streamedRequest(
      [bytes('{"value":"'), bytes('xxxxxxxxxxxxxxxx'), bytes('"}')],
      { contentLength: '2', onCancel: () => { cancelled = true; } },
    );

    await expect(readJsonObject(request, 16)).rejects.toMatchObject({
      code: 'request_body_too_large',
      maxBytes: 16,
    });
    expect(cancelled).toBe(true);
  });

  it('accepts a body exactly at the byte limit', async () => {
    const payload = bytes('{"ok":true}');
    await expect(readJsonObject(streamedRequest([payload]), payload.byteLength)).resolves.toEqual({
      ok: true,
    });
  });

  it('cancels the unread stream after malformed UTF-8', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = { body: stream, headers: new Headers() } as Request;

    await expect(readJsonObject(request, 32)).rejects.toMatchObject({ code: 'invalid_json' });
    expect(cancelled).toBe(true);
  });

  it('rejects an oversized declared length before pulling the body', async () => {
    let pulls = 0;
    const request = streamedRequest([bytes('{"ok":true}')], {
      contentLength: '999',
      onPull: () => { pulls += 1; },
    });

    await expect(readJsonObject(request, 32)).rejects.toBeInstanceOf(JsonBodyError);
    await expect(readJsonObject(
      streamedRequest([bytes('{"ok":true}')], { contentLength: '999' }),
      32,
    )).rejects.toMatchObject({ code: 'request_body_too_large', maxBytes: 32 });
    expect(pulls).toBe(0);
  });

  it('preserves raw bytes exactly across stream chunks', async () => {
    const first = new Uint8Array([0x00, 0x7f, 0x80]);
    const second = new Uint8Array([0xff, 0x0a]);

    await expect(readBodyBytes(streamedRequest([first, second]), 5)).resolves.toEqual(
      new Uint8Array([0x00, 0x7f, 0x80, 0xff, 0x0a]),
    );
  });

  it('cancels an oversized raw-byte stream despite a low Content-Length', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = {
      body: stream,
      headers: new Headers({ 'content-length': '1' }),
    } as Request;

    await expect(readBodyBytes(request, 4)).rejects.toMatchObject({
      code: 'request_body_too_large',
      maxBytes: 4,
    });
    expect(cancelled).toBe(true);
  });

  it('does not let a pending cancel promise stall size-limit failures', async () => {
    const outcomeBeforeNextTask = async (pending: Promise<unknown>) =>
      Promise.race([
        pending.then(
          () => 'resolved',
          () => 'rejected',
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 0)),
      ]);
    const neverCancel = () => new Promise<void>(() => undefined);
    const declared = new ReadableStream<Uint8Array>({ cancel: neverCancel });
    const streamed = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65));
      },
      cancel: neverCancel,
    });

    await expect(
      outcomeBeforeNextTask(
        readBodyBytes(
          { body: declared, headers: new Headers({ 'content-length': '65' }) } as Request,
          64,
        ),
      ),
    ).resolves.toBe('rejected');
    await expect(
      outcomeBeforeNextTask(
        readBodyBytes(
          { body: streamed, headers: new Headers({ 'content-length': '1' }) } as Request,
          64,
        ),
      ),
    ).resolves.toBe('rejected');
  });

  it('rejects and cancels a stream that repeatedly makes zero-byte progress', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 100) controller.enqueue(new Uint8Array());
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = { body: stream, headers: new Headers() } as Request;

    await expect(readJsonObject(request, 64)).rejects.toMatchObject({ code: 'invalid_json' });
    expect(pulls).toBeLessThan(100);
    expect(cancelled).toBe(true);
  });

  it('rejects fragmentation independently of the byte budget', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 5_000) controller.enqueue(Uint8Array.of(0x20));
        else if (pulls === 5_001) controller.enqueue(bytes('{}'));
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = { body: stream, headers: new Headers() } as Request;

    await expect(readJsonObject(request, 8_192)).rejects.toMatchObject({ code: 'invalid_json' });
    expect(pulls).toBeLessThan(5_000);
    expect(cancelled).toBe(true);
  });

  it('cancels a stalled request body at the read deadline', async () => {
    jest.useFakeTimers();
    try {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = { body: stream, headers: new Headers() } as Request;
      const rejection = expect(readJsonObject(request, 64)).rejects.toMatchObject({
        code: 'invalid_json',
      });
      await jest.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(cancelled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never turns an aborted raw-body read into a successful empty body', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = {
      body: stream,
      headers: new Headers(),
      signal: controller.signal,
    } as Request;

    const pending = readBodyBytes(request, 64);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'invalid_json' });
    expect(cancelled).toBe(true);
  });
});

function strictJsonErrorCode(text: string, maxDepth: number): string | null {
  try {
    parseStrictJson(text, maxDepth);
    return null;
  } catch (error) {
    return error instanceof JsonBodyError ? error.code : 'not_a_json_body_error';
  }
}

describe('parseStrictJson', () => {
  it('returns exactly what JSON.parse returns for unambiguous JSON', () => {
    const text = ' {"a":[1,-0.5,2e3,true,false,null,"q\\"}]\\\\"],"b":{"c":"\\u00e9\\n"},"d":[]} ';
    expect(parseStrictJson(text, 2)).toEqual(JSON.parse(text));
  });

  it.each(['0', '-0', '1e5', '1E+5', '0.25', '"x"', 'true', 'false', 'null', '[]', '{}'])(
    'accepts the JSON value %p',
    (text) => {
      expect(parseStrictJson(text, 1)).toEqual(JSON.parse(text));
    },
  );

  it.each([
    ['a repeated key', '{"a":1,"a":2}'],
    ['an escaped spelling of the same key', '{"a":1,"\\u0061":2}'],
    ['a repeated key in a nested object', '{"outer":{"k":1,"k":1}}'],
    ['a repeated __proto__ key', '{"__proto__":1,"__proto__":2}'],
  ])('rejects %s', (_label, text) => {
    expect(strictJsonErrorCode(text, 8)).toBe('duplicate_json_key');
  });

  it('allows the same key in sibling objects and key-like text inside strings', () => {
    expect(strictJsonErrorCode('[{"a":1},{"a":2}]', 8)).toBeNull();
    expect(strictJsonErrorCode('{"a":"\\"a\\":1,{[","b":"a"}', 8)).toBeNull();
  });

  it('counts object and array nesting against the limit, top level included', () => {
    expect(strictJsonErrorCode('{"a":{"b":[]}}', 3)).toBeNull();
    expect(strictJsonErrorCode('{"a":{"b":[{}]}}', 3)).toBe('json_too_deep');
    expect(strictJsonErrorCode('[[[1]]]', 3)).toBeNull();
    expect(strictJsonErrorCode('[[[[1]]]]', 3)).toBe('json_too_deep');
    expect(strictJsonErrorCode('{"a":"{{{{{{"}', 1)).toBeNull();
  });

  it.each([
    '', ' ', '{"a":1,}', '[1,]', '{a:1}', "{'a':1}", '01', '1.', '-', '+1', 'NaN',
    '"\\x"', '"\\u12"', '"unterminated', '"tab\there"', '{"a":1} {}', '{"a" 1}', 'tru', 'nul',
  ])('rejects what JSON.parse rejects: %p', (text) => {
    expect(() => JSON.parse(text)).toThrow();
    expect(strictJsonErrorCode(text, 8)).toBe('invalid_json');
  });

  it('rejects a depth limit that is not a positive integer', () => {
    expect(() => parseStrictJson('{}', 0)).toThrow(RangeError);
    expect(() => parseStrictJson('{}', 1.5)).toThrow(RangeError);
  });
});

describe('hasJsonContentType', () => {
  const withContentType = (...values: string[]) => {
    const headers = new Headers();
    for (const value of values) headers.append('content-type', value);
    return headers;
  };

  it.each([
    'application/json',
    'Application/JSON',
    'application/json; charset=utf-8',
    'application/json;charset=UTF-8',
    'application/json; charset="utf-8"',
  ])('accepts %p', (value) => {
    expect(hasJsonContentType(withContentType(value))).toBe(true);
  });

  it.each([
    'text/plain',
    'text/plain;charset=UTF-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'application/jsonp',
    'application/json-patch+json',
    'application/json; charset=iso-8859-1',
    'application/json; charset=utf-8; boundary=x',
    `application/json;${' '.repeat(120)}charset=utf-8`,
  ])('rejects %p', (value) => {
    expect(hasJsonContentType(withContentType(value))).toBe(false);
  });

  it('rejects a missing header and a header sent twice', () => {
    expect(hasJsonContentType(new Headers())).toBe(false);
    expect(hasJsonContentType(withContentType('application/json', 'application/json'))).toBe(false);
  });
});

describe('readStrictJsonObject', () => {
  it('parses a JSON object sent with the JSON media type', async () => {
    const request = streamedRequest([bytes('{"action":"cancel"}')], {
      contentType: 'application/json',
    });

    await expect(readStrictJsonObject(request, 64, 1)).resolves.toEqual({ action: 'cancel' });
  });

  it.each(['text/plain', undefined])(
    'answers media type %p before pulling the body',
    async (contentType) => {
      let pulls = 0;
      let cancelled = false;
      const request = streamedRequest([bytes('{"action":"cancel"}')], {
        contentType,
        onPull: () => { pulls += 1; },
        onCancel: () => { cancelled = true; },
      });

      await expect(readStrictJsonObject(request, 64, 1)).rejects.toMatchObject({
        code: 'unsupported_media_type',
      });
      expect(pulls).toBe(0);
      expect(cancelled).toBe(true);
    },
  );

  it.each([
    ['a duplicate key', '{"action":"cancel","action":"refund_request"}', 'duplicate_json_key'],
    ['nesting past the limit', '{"action":{"nested":true}}', 'json_too_deep'],
    ['a top-level array', '[]', 'invalid_json'],
    ['malformed JSON', '{"action":', 'invalid_json'],
  ])('rejects %s', async (_label, text, code) => {
    const request = streamedRequest([bytes(text)], { contentType: 'application/json' });

    await expect(readStrictJsonObject(request, 64, 1)).rejects.toMatchObject({ code });
  });

  it('keeps the byte cap and rejects malformed UTF-8', async () => {
    await expect(readStrictJsonObject(
      streamedRequest([bytes('{"action":"cancel"}')], { contentType: 'application/json' }),
      8,
      1,
    )).rejects.toMatchObject({ code: 'request_body_too_large', maxBytes: 8 });
    await expect(readStrictJsonObject(
      streamedRequest([new Uint8Array([0x7b, 0xff, 0x7d])], { contentType: 'application/json' }),
      8,
      1,
    )).rejects.toMatchObject({ code: 'invalid_json' });
  });
});

describe('Edge Function request-body caps', () => {
  it('keeps multimodal LLM and small public payload limits explicit', () => {
    expect(LLM_PROXY_JSON_BODY_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(OAUTH_JSON_BODY_LIMIT_BYTES).toBe(4 * 1024);
    expect(PEER_RESPONSE_JSON_BODY_LIMIT_BYTES).toBe(4 * 1024);
    expect(RSS_PROXY_JSON_BODY_LIMIT_BYTES).toBe(4 * 1024);
    expect(SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES).toBe(4 * 1024);
    expect(PADDLE_WEBHOOK_BODY_LIMIT_BYTES).toBe(1024 * 1024);
  });

  it('keeps JSON nesting limits explicit', () => {
    expect(PADDLE_WEBHOOK_JSON_MAX_DEPTH).toBe(32);
    expect(SUBSCRIPTION_MANAGE_JSON_MAX_DEPTH).toBe(4);
    expect(PUBLIC_DATA_PROXY_JSON_MAX_DEPTH).toBe(3);
  });

  // LLM proxies use their stricter shared reader, which also bounds upstream
  // responses and cancels stalled streams. Keep this separate from the generic
  // Edge request-json helper so a future refactor cannot silently fall back.
  it.each([
    'claude-proxy/index.ts',
    'gemini-proxy/index.ts',
    'openai-proxy/index.ts',
    'xai-proxy/index.ts',
  ])('%s uses the bounded LLM reader', (relativePath) => {
    const source = readFileSync(
      resolve(__dirname, '..', '..', relativePath),
      'utf8',
    );

    expect(source).toContain('readLlmProxyJsonObject(req)');
    expect(source).toContain("error instanceof LlmBodyError");
    expect(source).toContain("error.code === 'request_body_too_large'");
    expect(source).not.toMatch(/\breadJsonObject\s*\(/);
    expect(source).not.toMatch(/await\s+req\.json\s*\(/);
  });

  it.each([
    ['oauth-naver/index.ts', 'OAUTH_JSON_BODY_LIMIT_BYTES'],
    ['peer-respond/index.ts', 'PEER_RESPONSE_JSON_BODY_LIMIT_BYTES'],
  ])('%s uses the streamed parser with %s', (relativePath, limitName) => {
    const source = readFileSync(
      resolve(__dirname, '..', '..', relativePath),
      'utf8',
    );

    expect(source).toContain(`readJsonObject(req, ${limitName})`);
    expect(source).toContain("error.code === 'request_body_too_large'");
    expect(source).not.toMatch(/await\s+req\.json\s*\(/);
  });

  it.each([
    ['rss-proxy/index.ts', 'RSS_PROXY_JSON_BODY_LIMIT_BYTES'],
  ])('%s uses the streamed JSON parser with %s', (relativePath, limitName) => {
    const source = readFileSync(resolve(__dirname, '..', '..', relativePath), 'utf8');

    expect(source).toContain(`readJsonObject(req, ${limitName})`);
    expect(source).toContain("error.code === 'request_body_too_large'");
    expect(source).not.toMatch(/await\s+req\.json\s*\(/);
  });

  it.each([
    [
      'subscription-manage/index.ts',
      'SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES',
      'SUBSCRIPTION_MANAGE_JSON_MAX_DEPTH',
    ],
    [
      'public-data-proxy/index.ts',
      'PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES',
      'PUBLIC_DATA_PROXY_JSON_MAX_DEPTH',
    ],
  ])('%s uses the strict JSON reader with %s and %s', (relativePath, limitName, depthName) => {
    const source = readFileSync(resolve(__dirname, '..', '..', relativePath), 'utf8');

    expect(source).toContain(`readStrictJsonObject(req, ${limitName}, ${depthName})`);
    expect(source).toMatch(/error\.code === ['"]request_body_too_large['"]/);
    expect(source).toMatch(/error\.code === ['"]unsupported_media_type['"][\s\S]{0,160}?415/);
    expect(source).not.toMatch(/\breadJsonObject\s*\(/);
    expect(source).not.toMatch(/await\s+req\.json\s*\(/);
  });

  it('paddle-webhook authenticates the exact bounded raw bytes before decoding', () => {
    const source = readFileSync(
      resolve(__dirname, '..', '..', 'paddle-webhook/index.ts'),
      'utf8',
    );
    const signatureCall = source.search(/hmacSha256Hex\(secret,\s*\w+,\s*rawBytes\)/);
    const decodeCall = source.indexOf("new TextDecoder('utf-8', { fatal: true }).decode(rawBytes)");

    expect(source).toContain('readBodyBytes(req, PADDLE_WEBHOOK_BODY_LIMIT_BYTES)');
    expect(source).not.toMatch(/await\s+req\.text\s*\(/);
    expect(signatureCall).toBeGreaterThan(-1);
    expect(decodeCall).toBeGreaterThan(signatureCall);
  });
});
