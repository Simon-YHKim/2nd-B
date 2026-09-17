// Paddle API egress boundary for subscription-manage.
//
// callPaddle() sends PADDLE_API_KEY as a bearer token to whatever base URL the
// configuration names. PADDLE_API_BASE is only there to switch to sandbox, so it
// is pinned to Paddle's two official API roots, and the endpoint path must stay
// a plain absolute path on that root. A value outside the pin fails before any
// request exists, so the key cannot follow a mistyped or tampered setting.
//
// Paddle's reply is provider input. It is read under a byte ceiling and a
// nesting ceiling, and only an id-shaped reference and a code-shaped error cross
// back. Provider detail text is dropped here, so it never reaches the billing
// ledger or the function logs.

import { readBodyBytes } from './request-json.ts';

const DEFAULT_PADDLE_API_BASE = 'https://api.paddle.com';
const ALLOWED_PADDLE_API_BASES = new Set([
  DEFAULT_PADDLE_API_BASE,
  'https://sandbox-api.paddle.com',
]);

export const PADDLE_API_RESPONSE_MAX_BYTES = 64 * 1024;
export const PADDLE_API_RESPONSE_MAX_DEPTH = 8;

const JSON_CONTENT_TYPE = /^application\/json\s*(?:;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;
const SAFE_PROVIDER_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SAFE_PROVIDER_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export interface PaddleApiResponseSummary {
  /** `data.id` when it is id-shaped, otherwise null. */
  ref: string | null;
  /** `error.code` (lowercased) when it is code-shaped, otherwise null. */
  errorCode: string | null;
  /** False when the body was refused: content type, size, nesting, or syntax. */
  bodyAccepted: boolean;
}

export function buildPaddleApiUrl(configuredBase: string | undefined, path: string): string {
  const supplied = configuredBase ?? DEFAULT_PADDLE_API_BASE;
  const base = supplied.endsWith('/') ? supplied.slice(0, -1) : supplied;
  if (!ALLOWED_PADDLE_API_BASES.has(base)) throw new Error('invalid_paddle_api_base');

  if (!path.startsWith('/') || path.startsWith('//') || /[\\?#\x00-\x1f\x7f]/.test(path)) {
    throw new Error('invalid_paddle_api_path');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(path, base);
  } catch {
    throw new Error('invalid_paddle_api_path');
  }
  // Dot segments, percent-encoded dot segments, and characters the URL parser
  // would rewrite all show up as a pathname that differs from the input.
  if (
    endpoint.origin !== base
    || endpoint.pathname !== path
    || endpoint.search !== ''
    || endpoint.hash !== ''
  ) {
    throw new Error('invalid_paddle_api_path');
  }
  return endpoint.toString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

// Count container nesting outside strings before JSON.parse builds anything.
// JSON.parse still decides whether the text is valid JSON.
function withinJsonDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > maxDepth) return false;
    } else if (character === '}' || character === ']') {
      depth -= 1;
    }
  }
  return true;
}

// Never throws. A refused body yields nulls, and the caller keeps deciding the
// outcome from the HTTP status, so an unreadable reply to a request Paddle
// accepted is not turned into a retry of a money-moving action.
export async function readPaddleApiResponse(response: Response): Promise<PaddleApiResponseSummary> {
  const refused: PaddleApiResponseSummary = { ref: null, errorCode: null, bodyAccepted: false };
  try {
    if (!JSON_CONTENT_TYPE.test((response.headers.get('content-type') ?? '').trim())) {
      void response.body?.cancel().catch(() => undefined);
      return refused;
    }
    const bytes = await readBodyBytes(response, PADDLE_API_RESPONSE_MAX_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!withinJsonDepth(text, PADDLE_API_RESPONSE_MAX_DEPTH)) return refused;

    const parsed = record(JSON.parse(text));
    if (!parsed) return refused;
    const data = record(parsed.data);
    const error = record(parsed.error);
    const rawRef = typeof data?.id === 'string' ? data.id : '';
    const rawCode = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
    return {
      ref: SAFE_PROVIDER_REF.test(rawRef) ? rawRef : null,
      errorCode: SAFE_PROVIDER_CODE.test(rawCode) ? rawCode : null,
      bodyAccepted: true,
    };
  } catch {
    return refused;
  }
}
