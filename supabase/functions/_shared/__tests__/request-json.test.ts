import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  JsonBodyError,
  LLM_PROXY_JSON_BODY_LIMIT_BYTES,
  OAUTH_JSON_BODY_LIMIT_BYTES,
  PADDLE_WEBHOOK_BODY_LIMIT_BYTES,
  PEER_RESPONSE_JSON_BODY_LIMIT_BYTES,
  RSS_PROXY_JSON_BODY_LIMIT_BYTES,
  SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES,
  readBodyBytes,
  readJsonObject,
} from '../request-json';

function streamedRequest(
  chunks: Uint8Array[],
  options: { contentLength?: string; onCancel?: () => void; onPull?: () => void } = {},
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

  // The three big multimodal proxies were missing from this list when the
  // helper was written, so the guard covered every seat except the largest
  // ones. Widened 2026-09-07 - a contract check narrower than its own claim
  // is worse than none.
  it.each([
    ['claude-proxy/index.ts', 'LLM_PROXY_JSON_BODY_LIMIT_BYTES'],
    ['gemini-proxy/index.ts', 'LLM_PROXY_JSON_BODY_LIMIT_BYTES'],
    ['openai-proxy/index.ts', 'LLM_PROXY_JSON_BODY_LIMIT_BYTES'],
    ['xai-proxy/index.ts', 'LLM_PROXY_JSON_BODY_LIMIT_BYTES'],
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
    ['subscription-manage/index.ts', 'SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES'],
  ])('%s uses the streamed JSON parser with %s', (relativePath, limitName) => {
    const source = readFileSync(resolve(__dirname, '..', '..', relativePath), 'utf8');

    expect(source).toContain(`readJsonObject(req, ${limitName})`);
    expect(source).toContain("error.code === 'request_body_too_large'");
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
