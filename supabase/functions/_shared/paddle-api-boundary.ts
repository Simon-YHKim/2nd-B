import {
  parseJsonWithLimits,
  readBoundedUtf8Body,
} from './request-boundary.ts';

const DEFAULT_PADDLE_API_BASE = 'https://api.paddle.com';
const ALLOWED_PADDLE_API_BASES = new Set([
  DEFAULT_PADDLE_API_BASE,
  'https://sandbox-api.paddle.com',
]);
const PADDLE_API_RESPONSE_MAX_BYTES = 64 * 1024;
const PADDLE_API_RESPONSE_MAX_DEPTH = 8;
const SAFE_PROVIDER_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SAFE_PROVIDER_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export interface PaddleApiResponseSummary {
  ref: string | null;
  errorCode: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Produce an endpoint without ever letting configuration or a future caller
 * redirect the secret-bearing request away from Paddle's two official hosts.
 */
export function buildPaddleApiUrl(
  configuredBase: string | null | undefined,
  path: string,
): string {
  const supplied = configuredBase ?? DEFAULT_PADDLE_API_BASE;
  const normalized = supplied.endsWith('/') ? supplied.slice(0, -1) : supplied;
  if (
    !ALLOWED_PADDLE_API_BASES.has(normalized)
    || (supplied !== normalized && supplied !== `${normalized}/`)
  ) {
    throw new Error('invalid_paddle_api_base');
  }
  if (
    !path.startsWith('/')
    || path.startsWith('//')
    || /[\\?#\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error('invalid_paddle_api_path');
  }

  const endpoint = new URL(path, normalized);
  if (
    endpoint.origin !== normalized
    || endpoint.username !== ''
    || endpoint.password !== ''
    || endpoint.port !== ''
    || endpoint.search !== ''
    || endpoint.hash !== ''
    || endpoint.pathname !== path
  ) {
    throw new Error('invalid_paddle_api_path');
  }
  return endpoint.toString();
}

/**
 * Read only a small, strict JSON response and return log-safe identifiers.
 * Provider detail/body text is deliberately discarded at this boundary.
 */
export async function readPaddleApiResponse(
  response: Response,
  timeoutMs: number,
): Promise<PaddleApiResponseSummary> {
  const { text } = await readBoundedUtf8Body(response, {
    maxBytes: PADDLE_API_RESPONSE_MAX_BYTES,
    timeoutMs,
    allowedContentTypes: ['application/json'],
  });
  const parsed = record(parseJsonWithLimits(text, PADDLE_API_RESPONSE_MAX_DEPTH));
  if (!parsed) throw new Error('invalid_paddle_api_response');

  const data = record(parsed.data);
  const error = record(parsed.error);
  const rawRef = typeof data?.id === 'string' ? data.id : '';
  const rawCode = typeof error?.code === 'string' ? error.code.toLowerCase() : '';

  return {
    ref: SAFE_PROVIDER_REF.test(rawRef) ? rawRef : null,
    errorCode: SAFE_PROVIDER_CODE.test(rawCode)
      ? rawCode
      : response.ok ? null : `http_${response.status}`,
  };
}
