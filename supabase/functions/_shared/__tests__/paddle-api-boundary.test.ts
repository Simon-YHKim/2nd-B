import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';

import * as requestJson from '../request-json';

type PaddleApiResponseSummary = {
  ref: string | null;
  errorCode: string | null;
  bodyAccepted: boolean;
};

type PaddleApiBoundary = {
  PADDLE_API_RESPONSE_MAX_BYTES: number;
  PADDLE_API_RESPONSE_MAX_DEPTH: number;
  buildPaddleApiUrl: (configuredBase: string | undefined, path: string) => string;
  readPaddleApiResponse: (response: Response) => Promise<PaddleApiResponseSummary>;
};

// The module is Deno source and imports its sibling with a `.ts` extension, so
// it is transpiled here and handed the real request-json module.
function loadBoundary(): PaddleApiBoundary {
  const source = readFileSync(resolve(__dirname, '..', 'paddle-api-boundary.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', outputText)(
    (id: string) => {
      if (id === './request-json.ts') return requestJson;
      throw new Error(`unexpected import: ${id}`);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports as unknown as PaddleApiBoundary;
}

const {
  PADDLE_API_RESPONSE_MAX_BYTES,
  PADDLE_API_RESPONSE_MAX_DEPTH,
  buildPaddleApiUrl,
  readPaddleApiResponse,
} = loadBoundary();

function jsonResponse(
  body: BodyInit,
  init: { status?: number; contentType?: string; contentLength?: string } = {},
): Response {
  const headers = new Headers({ 'content-type': init.contentType ?? 'application/json' });
  if (init.contentLength !== undefined) headers.set('content-length', init.contentLength);
  return new Response(body, { status: init.status ?? 200, headers });
}

// `{"data":{"id":"adj_01"},"n":[[...1...]]}` whose deepest container sits at
// `depth`, counting the root object as 1.
function nestedTo(depth: number): string {
  return `{"data":{"id":"adj_01"},"n":${'['.repeat(depth - 1)}1${']'.repeat(depth - 1)}}`;
}

const refused: PaddleApiResponseSummary = { ref: null, errorCode: null, bodyAccepted: false };

describe('buildPaddleApiUrl', () => {
  it('builds endpoints on the two official Paddle API roots only', () => {
    expect(buildPaddleApiUrl(undefined, '/adjustments')).toBe('https://api.paddle.com/adjustments');
    expect(buildPaddleApiUrl('https://api.paddle.com/', '/adjustments')).toBe(
      'https://api.paddle.com/adjustments',
    );
    expect(buildPaddleApiUrl('https://sandbox-api.paddle.com', '/subscriptions/sub_01/cancel')).toBe(
      'https://sandbox-api.paddle.com/subscriptions/sub_01/cancel',
    );
  });

  it.each([
    '',
    ' https://api.paddle.com',
    'http://api.paddle.com',
    'https://API.paddle.com',
    'https://api.paddle.com.attacker.example',
    'https://attacker.example',
    'https://user@api.paddle.com',
    'https://api.paddle.com:443',
    'https://api.paddle.com/v1',
    'https://api.paddle.com?next=https://attacker.example',
    'https://api.paddle.com#fragment',
    'https://api.paddle.com//',
  ])('refuses the configured base %j before any request exists', (base) => {
    expect(() => buildPaddleApiUrl(base, '/adjustments')).toThrow('invalid_paddle_api_base');
  });

  it.each([
    'adjustments',
    'https://attacker.example/steal',
    '//attacker.example/steal',
    '/../steal',
    '/%2e%2e/steal',
    '/subscriptions/../cancel',
    '/adjustments?next=https://attacker.example',
    '/adjustments#fragment',
    '/adjustments\\steal',
    `/adjustments${String.fromCharCode(13, 10)}x-injected: 1`,
    `/adjustments${String.fromCharCode(0)}`,
    '/adjust ments',
  ])('refuses the endpoint path %j', (path) => {
    expect(() => buildPaddleApiUrl('https://api.paddle.com', path)).toThrow('invalid_paddle_api_path');
  });
});

describe('readPaddleApiResponse', () => {
  it('returns an id-shaped ref and a code-shaped error, never provider detail', async () => {
    const detail = 'do-not-store: Bearer provider-secret-material';
    const summary = await readPaddleApiResponse(
      jsonResponse(
        JSON.stringify({ data: { id: 'adj_01' }, error: { code: 'Transaction_Not_Found', detail } }),
        { status: 400, contentType: 'application/json; charset=utf-8' },
      ),
    );

    expect(summary).toEqual({ ref: 'adj_01', errorCode: 'transaction_not_found', bodyAccepted: true });
    expect(JSON.stringify(summary)).not.toContain('do-not-store');
  });

  it('drops a ref or code that is not identifier-shaped', async () => {
    const newline = String.fromCharCode(10);
    const summary = await readPaddleApiResponse(
      jsonResponse(
        JSON.stringify({
          data: { id: `adj_01${newline}x` },
          error: { code: `bad${newline}authorization: Bearer ${'x'.repeat(80)}` },
        }),
        { status: 422 },
      ),
    );

    expect(summary).toEqual({ ref: null, errorCode: null, bodyAccepted: true });
  });

  it('refuses a body over the 64 KiB ceiling, declared or streamed', async () => {
    expect(PADDLE_API_RESPONSE_MAX_BYTES).toBe(64 * 1024);

    await expect(
      readPaddleApiResponse(
        jsonResponse('{"data":{"id":"adj_01"}}', {
          contentLength: String(PADDLE_API_RESPONSE_MAX_BYTES + 1),
        }),
      ),
    ).resolves.toEqual(refused);

    const prefix = '{"data":{"id":"adj_01"},"pad":"';
    const suffix = '"}';
    const exact = `${prefix}${'x'.repeat(PADDLE_API_RESPONSE_MAX_BYTES - prefix.length - suffix.length)}${suffix}`;
    await expect(readPaddleApiResponse(jsonResponse(exact))).resolves.toEqual({
      ref: 'adj_01',
      errorCode: null,
      bodyAccepted: true,
    });

    const over = `${prefix}${'x'.repeat(PADDLE_API_RESPONSE_MAX_BYTES)}${suffix}`;
    await expect(readPaddleApiResponse(jsonResponse(over))).resolves.toEqual(refused);
  });

  it('refuses JSON nested deeper than 8 containers', async () => {
    expect(PADDLE_API_RESPONSE_MAX_DEPTH).toBe(8);

    await expect(readPaddleApiResponse(jsonResponse(nestedTo(9)))).resolves.toEqual(refused);
    await expect(readPaddleApiResponse(jsonResponse(nestedTo(8)))).resolves.toEqual({
      ref: 'adj_01',
      errorCode: null,
      bodyAccepted: true,
    });
    await expect(
      readPaddleApiResponse(jsonResponse('{"data":{"id":"adj_01"},"s":"[[[[[[[[[[[[\\"{{{{"}')),
    ).resolves.toEqual({ ref: 'adj_01', errorCode: null, bodyAccepted: true });
  });

  it.each([
    ['an HTML error page', '<html>bad gateway</html>', 'text/html'],
    ['a JSONP look-alike type', '{"data":{"id":"adj_01"}}', 'application/jsonp'],
    ['malformed JSON', '{"data":', 'application/json'],
    ['a non-object root', '[{"data":{"id":"adj_01"}}]', 'application/json'],
  ])('refuses %s without throwing', async (_label, body, contentType) => {
    await expect(readPaddleApiResponse(jsonResponse(body, { contentType }))).resolves.toEqual(refused);
  });

  it('refuses invalid UTF-8 without throwing', async () => {
    const bytes = new Uint8Array([0x7b, 0x22, 0x64, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    await expect(readPaddleApiResponse(jsonResponse(bytes))).resolves.toEqual(refused);
  });
});
