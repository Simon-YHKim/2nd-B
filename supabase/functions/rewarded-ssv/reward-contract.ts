export const MAX_SSV_QUERY_BYTES = 8_192;
export const MAX_VERIFIER_KEYS = 16;

export type RewardKind = 'reasoning' | 'chat';

export type RewardContractConfig = {
  adUnitId: string;
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
  callbackUserId: string;
  transactionId: string;
  adUnitId: string;
  rewardAmount: number;
  rewardItem: string;
};

export type VerifierKey = { keyId: number; base64: string };

type EnvReader = (key: string) => string | undefined;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  if (raw.length > 2_048 || raw.includes('+')) return null;
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

  return { signedContent, params, signature, keyId };
}

export function readRewardContractConfig(getEnv: EnvReader): RewardContractConfig | null {
  const adUnitId = (getEnv('REWARD_SSV_AD_UNIT_ID') ?? '').trim();
  const rewardAmountRaw = (getEnv('REWARD_SSV_REWARD_AMOUNT') ?? '').trim();
  const rewardItem = (getEnv('REWARD_SSV_REWARD_ITEM') ?? '').trim();
  if (
    !safeServerText(adUnitId, 256) ||
    !safeServerText(rewardItem, 64) ||
    !/^[1-9][0-9]{0,8}$/.test(rewardAmountRaw)
  ) return null;
  const rewardAmount = Number(rewardAmountRaw);
  if (!Number.isSafeInteger(rewardAmount)) return null;
  return { adUnitId, rewardAmount, rewardItem };
}

export function parseRewardCallback(
  params: Pick<URLSearchParams, 'get'>,
  config: RewardContractConfig,
): RewardCallback | null {
  const adNetwork = params.get('ad_network');
  const adUnitId = params.get('ad_unit');
  const ticket = params.get('custom_data');
  const rewardAmountRaw = params.get('reward_amount');
  const rewardItem = params.get('reward_item');
  const timestamp = params.get('timestamp');
  const transactionId = params.get('transaction_id');
  const callbackUserId = params.get('user_id');

  if (
    !adNetwork || !/^(?:0|[1-9][0-9]{0,19})$/.test(adNetwork) ||
    adUnitId !== config.adUnitId ||
    !ticket || !TICKET_PATTERN.test(ticket) ||
    rewardAmountRaw !== String(config.rewardAmount) ||
    rewardItem !== config.rewardItem ||
    !timestamp || !/^[1-9][0-9]{9,16}$/.test(timestamp) ||
    !transactionId || !TRANSACTION_PATTERN.test(transactionId) ||
    transactionId.length % 2 !== 0 ||
    !callbackUserId || !UUID_PATTERN.test(callbackUserId)
  ) return null;

  return {
    ticket,
    callbackUserId,
    transactionId,
    adUnitId,
    rewardAmount: config.rewardAmount,
    rewardItem,
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
