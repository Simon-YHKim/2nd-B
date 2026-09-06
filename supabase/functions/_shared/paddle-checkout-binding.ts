export interface PaddleCheckoutBindingData {
  user_id: string;
  issued_at: number;
  nonce: string;
  signature: string;
}

const MIN_SECRET_LENGTH = 32;
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 300;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[0-9a-f]{32}$/;
const SIGNATURE_RE = /^[0-9a-f]{64}$/;
const PADDLE_SIGNATURE_HEADER_MAX_LENGTH = 4096;
const PADDLE_SIGNATURE_MAX_CANDIDATES = 8;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export interface ParsedPaddleWebhookSignature {
  timestamp: string | null;
  signatures: string[];
}

/**
 * Paddle may emit more than one h1 while rotating a notification secret. Keep
 * every well-formed candidate, but reject ambiguous timestamps and boundedly
 * parse the untrusted header.
 */
export function parsePaddleWebhookSignature(header: string): ParsedPaddleWebhookSignature {
  if (header.length > PADDLE_SIGNATURE_HEADER_MAX_LENGTH) {
    return { timestamp: null, signatures: [] };
  }

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const rawPart of header.split(';')) {
    const part = rawPart.trim();
    const equalsAt = part.indexOf('=');
    if (equalsAt < 0) continue;
    const key = part.slice(0, equalsAt).trim();
    const value = part.slice(equalsAt + 1).trim();
    if (key === 'ts') {
      if (timestamp !== null || !/^\d{1,12}$/.test(value)) {
        return { timestamp: null, signatures: [] };
      }
      timestamp = value;
    } else if (key === 'h1' && SIGNATURE_RE.test(value.toLowerCase())) {
      if (signatures.length >= PADDLE_SIGNATURE_MAX_CANDIDATES) {
        return { timestamp: null, signatures: [] };
      }
      signatures.push(value.toLowerCase());
    }
  }
  return { timestamp, signatures };
}

export function hasMatchingPaddleWebhookSignature(
  expected: string,
  candidates: readonly string[],
): boolean {
  let matched = 0;
  for (const candidate of candidates) {
    matched |= timingSafeEqualHex(expected, candidate) ? 1 : 0;
  }
  return matched === 1;
}

async function signatureFor(
  secret: string,
  userId: string,
  issuedAt: number,
  nonce: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`v1:${userId}:${issuedAt}:${nonce}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function createCheckoutBinding(
  secret: string,
  userId: string,
  options: { issuedAt?: number; nonceBytes?: Uint8Array } = {},
): Promise<PaddleCheckoutBindingData> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('checkout binding secret is too short');
  if (!USER_ID_RE.test(userId)) throw new Error('checkout binding user id is invalid');
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const nonceBytes = options.nonceBytes ?? crypto.getRandomValues(new Uint8Array(16));
  if (!Number.isSafeInteger(issuedAt) || nonceBytes.byteLength !== 16) {
    throw new Error('checkout binding input is invalid');
  }
  const nonce = bytesToHex(nonceBytes);
  const signature = await signatureFor(secret, userId, issuedAt, nonce);
  return { user_id: userId, issued_at: issuedAt, nonce, signature };
}

export async function verifyCheckoutBinding(
  value: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  if (secret.length < MIN_SECRET_LENGTH || !value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const binding = value as Record<string, unknown>;
  const userId = typeof binding.user_id === 'string' ? binding.user_id : '';
  const issuedAt = binding.issued_at;
  const nonce = typeof binding.nonce === 'string' ? binding.nonce : '';
  const signature = typeof binding.signature === 'string' ? binding.signature : '';
  if (
    !USER_ID_RE.test(userId) ||
    !Number.isSafeInteger(issuedAt) ||
    !NONCE_RE.test(nonce) ||
    !SIGNATURE_RE.test(signature) ||
    !Number.isSafeInteger(nowSeconds)
  ) return null;
  const ageSeconds = nowSeconds - (issuedAt as number);
  if (ageSeconds < -MAX_FUTURE_SKEW_SECONDS || ageSeconds > MAX_AGE_SECONDS) return null;
  const expected = await signatureFor(secret, userId, issuedAt as number, nonce);
  return timingSafeEqualHex(expected, signature) ? userId : null;
}

export async function verifyCheckoutBindingWithSecrets(
  value: unknown,
  secrets: readonly string[],
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  let verifiedUserId: string | null = null;
  // Check every configured candidate so request timing does not disclose
  // whether the current or previous rotation secret signed the binding.
  for (const secret of secrets) {
    const candidate = await verifyCheckoutBinding(value, secret, nowSeconds);
    if (verifiedUserId === null && candidate !== null) verifiedUserId = candidate;
  }
  return verifiedUserId;
}
