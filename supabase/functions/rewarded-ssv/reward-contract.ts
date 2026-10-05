export const MAX_SSV_QUERY_BYTES = 8_192;
export const MAX_VERIFIER_KEYS = 16;
export const REWARD_PER_WATCH = 2;

export type RewardKind = 'reasoning' | 'chat';

export type RewardContractConfig = {
  adUnitIds: string[];
  rewardAmount: number;
  rewardItem: string;
};

export type SignedSsvQuery = {
  signedContent: string;
  params: URLSearchParams;
  signature: string;
  keyId: string;
};

export type RewardCallback = {
  ticket: string;
  transactionId: string;
  adUnitId: string;
  rewardAmount: number;
  rewardItem: string;
  /** The signed timestamp exactly as received: digits only, at most 19. Its unit
   * and freshness are judged after the signature check (index.ts), so a length
   * the contract does not allow still reaches the GO-5b digit log instead of
   * being refused unseen (security gate r2 DB2-04). 0213 reads the unit from the
   * same digits. */
  callbackTimestampText: string;
};

/** ADMOB-TS (2), Simon 2026-10-04 21:06 KST. AdMob documents the callback
 * timestamp as epoch milliseconds, but its own example is 16 digits, so the unit
 * comes from the digit count: 10 = seconds, 13 = milliseconds, 16 = microseconds.
 * Anything else is refused. 0213 (reward_ssv_callback_is_fresh) applies the same
 * rule; GO-5b narrows this to the one length production actually sends. */
export const ALLOWED_TS_DIGITS: readonly number[] = [10, 13, 16];
/** 0213 c_max_age (D3: one day), kept well below the 88-day purge (0211). */
export const CALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** 0213 c_skew. */
export const CALLBACK_MAX_SKEW_MS = 5 * 60 * 1000;

/** The shape parseRewardCallback accepts before the signature: digits only,
 * bounded so the length log stays a small number. Unit and range are
 * parseCallbackTimestamp's job, after the signature. */
export const CALLBACK_TS_SHAPE = /^[0-9]{1,19}$/;

/** A leading zero is refused: Postgres counts the digits of the bigint, so
 * "0001790251200" would be seconds there and milliseconds here. */
export function parseCallbackTimestamp(
  raw: string,
): { raw: number; digits: number; ms: number } | null {
  if (!/^[1-9][0-9]*$/.test(raw) || !ALLOWED_TS_DIGITS.includes(raw.length)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  const ms = raw.length === 10 ? value * 1000 : raw.length === 13 ? value : Math.floor(value / 1000);
  return Number.isSafeInteger(ms) ? { raw: value, digits: raw.length, ms } : null;
}

/** The Edge half of 0213's window. The ticket's issue time is checked in the
 * database only. */
export function isCallbackFresh(callbackMs: number, nowMs: number): boolean {
  return callbackMs <= nowMs + CALLBACK_MAX_SKEW_MS && callbackMs >= nowMs - CALLBACK_MAX_AGE_MS;
}

export type VerifierKey = { keyId: number; base64: string };

type EnvReader = (key: string) => string | undefined;

const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TRANSACTION_PATTERN = /^[0-9a-f]{16,256}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{80,128}$/;
const KEY_ID_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/;
const PARAMETER_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function safeServerText(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function decodeCanonicalQueryValue(raw: string): string | null {
  if (raw.length > 2_048) return null;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return null;
    if (raw[i] !== '%') continue;
    const pair = raw.slice(i + 1, i + 3);
    if (!/^[0-9A-F]{2}$/.test(pair)) return null;
    const decodedByte = Number.parseInt(pair, 16);
    if (
      (decodedByte >= 0x30 && decodedByte <= 0x39) ||
      (decodedByte >= 0x41 && decodedByte <= 0x5a) ||
      (decodedByte >= 0x61 && decodedByte <= 0x7a) ||
      decodedByte === 0x2d || decodedByte === 0x2e ||
      decodedByte === 0x5f || decodedByte === 0x7e
    ) return null;
    i += 2;
  }
  try {
    const decoded = decodeURIComponent(raw);
    return safeServerText(decoded, 1_024) ? decoded : null;
  } catch {
    return null;
  }
}

export function parseSignedSsvQuery(rawQuery: string): SignedSsvQuery | null {
  if (
    rawQuery.length === 0 ||
    new TextEncoder().encode(rawQuery).byteLength > MAX_SSV_QUERY_BYTES ||
    !/^[\x21-\x7e]+$/.test(rawQuery) ||
    rawQuery.includes('#')
  ) return null;

  const match = rawQuery.match(
    /^(.*)&signature=([A-Za-z0-9_-]{80,128})&key_id=((?:0|[1-9][0-9]{0,19}))$/,
  );
  if (!match) return null;
  const [, signedContent, signature, keyId] = match;
  if (
    !signedContent ||
    !SIGNATURE_PATTERN.test(signature) ||
    !KEY_ID_PATTERN.test(keyId) ||
    !Number.isSafeInteger(Number(keyId))
  ) return null;

  const params = new URLSearchParams();
  let previousName = '';
  for (const pair of signedContent.split('&')) {
    const equalsAt = pair.indexOf('=');
    if (equalsAt <= 0) return null;
    const name = pair.slice(0, equalsAt);
    const rawValue = pair.slice(equalsAt + 1);
    if (
      !PARAMETER_NAME_PATTERN.test(name) ||
      name === 'signature' || name === 'key_id' ||
      name <= previousName
    ) return null;
    const value = decodeCanonicalQueryValue(rawValue);
    if (value === null) return null;
    params.append(name, value);
    previousName = name;
  }

  // Google signs java.net.URI#getQuery(): percent escapes are decoded across
  // the complete query, while '+' remains a literal plus (not form-space).
  // Raw pairs above stay authoritative for canonical encoding and ordering.
  return { signedContent: decodeURIComponent(signedContent), params, signature, keyId };
}

// Google sends the numeric unit suffix in SSV; native SDKs require the full ID.
// Normalize both ticket issuance and callback settlement to the same DB value.
export function normalizeAdUnitId(value: string): string | null {
  if (value.startsWith('ca-app-pub-3940256099942544/')) return null;
  const match = /^(?:ca-app-pub-[0-9]{16}\/)?([0-9]{10})$/.exec(value);
  const id = match?.[1];
  if (!id || id === '5224354917' || id === '1712485313') return null;
  return id;
}

export function readRewardContractConfig(getEnv: EnvReader): RewardContractConfig | null {
  const configured = getEnv('REWARD_SSV_AD_UNIT_IDS') ?? getEnv('REWARD_SSV_AD_UNIT_ID') ?? '';
  if (configured.length > 512) return null;
  const adUnitIds = configured.split(',').map((value) => normalizeAdUnitId(value.trim()));
  const rewardAmountRaw = (getEnv('REWARD_SSV_REWARD_AMOUNT') ?? '').trim();
  const rewardItem = (getEnv('REWARD_SSV_REWARD_ITEM') ?? '').trim();
  if (
    adUnitIds.length > 2 || adUnitIds.some((id) => id === null) ||
    new Set(adUnitIds).size !== adUnitIds.length ||
    !safeServerText(rewardItem, 64) ||
    !/^[1-9][0-9]{0,8}$/.test(rewardAmountRaw)
  ) return null;
  const rewardAmount = Number(rewardAmountRaw);
  if (!Number.isSafeInteger(rewardAmount) || rewardAmount !== REWARD_PER_WATCH) return null;
  return { adUnitIds: adUnitIds as string[], rewardAmount, rewardItem };
}

export function parseRewardCallback(
  params: Pick<URLSearchParams, 'get' | 'has'>,
  config: RewardContractConfig,
): RewardCallback | null {
  const adNetwork = params.get('ad_network');
  const adUnitId = normalizeAdUnitId(params.get('ad_unit') ?? '');
  const ticket = params.get('custom_data');
  const rewardAmountRaw = params.get('reward_amount');
  const rewardItem = params.get('reward_item');
  const timestamp = params.get('timestamp');
  const transactionId = params.get('transaction_id');

  if (
    !adNetwork || !/^(?:0|[1-9][0-9]{0,19})$/.test(adNetwork) ||
    !adUnitId || !config.adUnitIds.includes(adUnitId) ||
    !ticket || !TICKET_PATTERN.test(ticket) ||
    rewardAmountRaw !== String(config.rewardAmount) ||
    rewardItem !== config.rewardItem ||
    !timestamp || !CALLBACK_TS_SHAPE.test(timestamp) ||
    !transactionId || !TRANSACTION_PATTERN.test(transactionId) ||
    transactionId.length % 2 !== 0 ||
    params.has('user_id')
  ) return null;

  return {
    ticket,
    transactionId,
    adUnitId,
    rewardAmount: config.rewardAmount,
    rewardItem,
    callbackTimestampText: timestamp,
  };
}

export function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const canonical = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return canonical === value ? bytes : null;
  } catch {
    return null;
  }
}

export function decodeBase64(value: string): Uint8Array | null {
  if (
    value.length < 80 || value.length > 2_048 ||
    value.length % 4 !== 0 || !BASE64_PATTERN.test(value)
  ) return null;
  try {
    const binary = atob(value);
    if (btoa(binary) !== value) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function derToRawEcdsa(der: Uint8Array): Uint8Array | null {
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] !== der.length - 2) {
    return null;
  }
  let offset = 2;
  const readInteger = (): Uint8Array | null => {
    if (der[offset++] !== 0x02) return null;
    const length = der[offset++];
    if (length < 1 || length > 33 || offset + length > der.length) return null;
    let value = der.slice(offset, offset + length);
    offset += length;
    if ((value[0] & 0x80) !== 0) return null;
    if (value.length > 1 && value[0] === 0 && (value[1] & 0x80) === 0) return null;
    if (value.length === 33) {
      if (value[0] !== 0) return null;
      value = value.slice(1);
    }
    if (value.every((byte) => byte === 0)) return null;
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };
  const r = readInteger();
  const s = readInteger();
  if (!r || !s || offset !== der.length) return null;
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

export function parseVerifierKeyDocument(document: string): VerifierKey[] | null {
  try {
    const parsed: unknown = JSON.parse(document);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const parsedObject = parsed as Record<string, unknown>;
    if (Object.keys(parsedObject).length !== 1 || !Object.hasOwn(parsedObject, 'keys')) return null;
    const keys = parsedObject.keys;
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_VERIFIER_KEYS) return null;
    const seen = new Set<number>();
    const validated: VerifierKey[] = [];
    for (const raw of keys) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const rawObject = raw as Record<string, unknown>;
      const fields = Object.keys(rawObject);
      if (
        !Object.hasOwn(rawObject, 'keyId') ||
        !Object.hasOwn(rawObject, 'base64') ||
        fields.some((field) => field !== 'keyId' && field !== 'base64' && field !== 'pem')
      ) return null;
      const { keyId, base64, pem } = rawObject;
      if (
        !Number.isSafeInteger(keyId) || (keyId as number) < 0 || seen.has(keyId as number) ||
        typeof base64 !== 'string' || !decodeBase64(base64) ||
        (pem !== undefined && (typeof pem !== 'string' || pem.length > 2_048))
      ) return null;
      seen.add(keyId as number);
      validated.push({ keyId: keyId as number, base64 });
    }
    return validated;
  } catch {
    return null;
  }
}
