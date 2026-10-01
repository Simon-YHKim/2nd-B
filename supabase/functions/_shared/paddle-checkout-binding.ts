export interface PaddleCheckoutBindingData {
  user_id: string;
  issued_at: number;
  nonce: string;
  signature: string;
  version?: 2;
  environment?: 'production' | 'sandbox';
  audience?: string;
  price_id?: string;
}

export interface PaddleCheckoutScope {
  environment: 'production' | 'sandbox';
  audience: string;
  price_id: string;
}

function validScope(scope: PaddleCheckoutScope): boolean {
  return (scope.environment === 'production' || scope.environment === 'sandbox')
    && /^https?:\/\/[^\s]{1,240}$/.test(scope.audience)
    && /^pri_[a-z0-9]{26}$/.test(scope.price_id);
}

const MIN_SECRET_LENGTH = 32;
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 300;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[0-9a-f]{32}$/;
const SIGNATURE_RE = /^[0-9a-f]{64}$/;

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

async function signatureFor(
  secret: string,
  userId: string,
  issuedAt: number,
  nonce: string,
  scope?: PaddleCheckoutScope,
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
    encoder.encode(scope
      ? JSON.stringify(['v2', userId, issuedAt, nonce, scope.environment, scope.audience, scope.price_id])
      : `v1:${userId}:${issuedAt}:${nonce}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function createCheckoutBinding(
  secret: string,
  userId: string,
  options: { issuedAt?: number; nonceBytes?: Uint8Array; scope?: PaddleCheckoutScope } = {},
): Promise<PaddleCheckoutBindingData> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('checkout binding secret is too short');
  if (!USER_ID_RE.test(userId)) throw new Error('checkout binding user id is invalid');
  if (options.scope && !validScope(options.scope)) throw new Error('checkout binding scope is invalid');
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const nonceBytes = options.nonceBytes ?? crypto.getRandomValues(new Uint8Array(16));
  if (!Number.isSafeInteger(issuedAt) || nonceBytes.byteLength !== 16) {
    throw new Error('checkout binding input is invalid');
  }
  const nonce = bytesToHex(nonceBytes);
  const signature = await signatureFor(secret, userId, issuedAt, nonce, options.scope);
  return { user_id: userId, issued_at: issuedAt, nonce, signature,
    ...(options.scope ? { version: 2 as const, ...options.scope } : {}),
  };
}

export async function verifyCheckoutBinding(
  value: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  expectedScope?: PaddleCheckoutScope,
): Promise<string | null> {
  if (secret.length < MIN_SECRET_LENGTH || !value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const binding = value as Record<string, unknown>;
  let scope: PaddleCheckoutScope | undefined;
  if ('version' in binding || 'environment' in binding || 'audience' in binding || 'price_id' in binding) {
    if (binding.version !== 2 || !expectedScope || !validScope(expectedScope)
      || binding.environment !== expectedScope.environment || binding.audience !== expectedScope.audience
      || binding.price_id !== expectedScope.price_id) return null;
    scope = expectedScope;
  } else if (expectedScope?.environment === 'sandbox') {
    return null;
  }
  const userId = typeof binding.user_id === 'string' ? binding.user_id : '';
  const issuedAt = binding.issued_at;
  const nonce = typeof binding.nonce === 'string' ? binding.nonce : '';
  const signature = typeof binding.signature === 'string' ? binding.signature : '';
  if (
    !USER_ID_RE.test(userId)
    || !Number.isSafeInteger(issuedAt)
    || !NONCE_RE.test(nonce)
    || !SIGNATURE_RE.test(signature)
    || !Number.isSafeInteger(nowSeconds)
  ) return null;
  const ageSeconds = nowSeconds - (issuedAt as number);
  if (ageSeconds < -MAX_FUTURE_SKEW_SECONDS || ageSeconds > MAX_AGE_SECONDS) return null;
  const expected = await signatureFor(secret, userId, issuedAt as number, nonce, scope);
  return timingSafeEqualHex(expected, signature) ? userId : null;
}

export async function verifyCheckoutBindingWithSecrets(
  value: unknown,
  secrets: readonly string[],
  nowSeconds = Math.floor(Date.now() / 1000),
  expectedScope?: PaddleCheckoutScope,
): Promise<string | null> {
  let verifiedUserId: string | null = null;
  // Check every configured candidate so request timing does not disclose
  // whether the current or previous rotation secret signed the binding.
  for (const secret of secrets) {
    const candidate = await verifyCheckoutBinding(value, secret, nowSeconds, expectedScope);
    if (verifiedUserId === null && candidate !== null) verifiedUserId = candidate;
  }
  return verifiedUserId;
}
