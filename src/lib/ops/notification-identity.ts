// Notification identifiers and local preference keys cross an OS/native boundary.
// Every identifier emitted by the privacy-safe implementation carries an explicit
// generation marker plus a pseudonymous account namespace. Legacy identifiers
// have no such marker and are therefore conservatively removed by the v2 upgrade.

const GENERATION_PREFIX = "ops-v2-";
const OWNER_TOKEN_PATTERN = "[0-9a-f]{16}";
const SAFE_COMPONENT_PATTERN = "[A-Za-z0-9][A-Za-z0-9._-]{0,127}";
const CURRENT_NOTIFICATION_PATTERN = new RegExp(
  `^${GENERATION_PREFIX}${OWNER_TOKEN_PATTERN}-(?:routine-${SAFE_COMPONENT_PATTERN}|daily-review|once-${SAFE_COMPONENT_PATTERN})$`,
);
const CURRENT_NOTIFICATION_OWNER_PATTERN = new RegExp(
  `^${GENERATION_PREFIX}(${OWNER_TOKEN_PATTERN})-`,
);
const PRIVACY_GENERATION = "notification-v2";
const PRIVACY_GENERATION_DATA_KEY = "_2bPrivacyGeneration";
const OWNER_TOKEN_DATA_KEY = "_2bOwnerNamespace";

export type AccountNotificationStorageKind =
  | "reminders-disabled"
  | "daily-review-enabled"
  | "daily-review-hour";

/**
 * Stable 64-bit, non-cryptographic account namespace. This is not an auth
 * primitive; it prevents raw Supabase user ids from appearing in OS identifiers
 * and makes every native/storage mutation target one immutable owner namespace.
 */
export function notificationOwnerToken(ownerId: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < ownerId.length; index += 1) {
    const code = ownerId.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function ownerPrefix(ownerId: string): string {
  return `${GENERATION_PREFIX}${notificationOwnerToken(ownerId)}-`;
}

export function routineNotificationId(ownerId: string, routineId: string): string | null {
  if (!new RegExp(`^${SAFE_COMPONENT_PATTERN}$`).test(routineId)) return null;
  return `${ownerPrefix(ownerId)}routine-${routineId}`;
}

export function dailyReviewNotificationId(ownerId: string): string {
  return `${ownerPrefix(ownerId)}daily-review`;
}

let oneShotSequence = 0;

export function oneShotNotificationId(ownerId: string): string {
  oneShotSequence = (oneShotSequence + 1) >>> 0;
  const nonce = `${Date.now().toString(36)}-${oneShotSequence.toString(36)}`;
  return `${ownerPrefix(ownerId)}once-${nonce}`;
}

export function isCurrentGenerationNotificationId(identifier: string): boolean {
  return CURRENT_NOTIFICATION_PATTERN.test(identifier);
}

export function notificationPrivacyData(ownerId: string): Record<string, string> {
  return {
    [PRIVACY_GENERATION_DATA_KEY]: PRIVACY_GENERATION,
    [OWNER_TOKEN_DATA_KEY]: notificationOwnerToken(ownerId),
  };
}

export interface NotificationRequestIdentity {
  identifier?: string | null;
  content?: { data?: Record<string, unknown> | null } | null;
}

/**
 * Migration preservation requires an explicit content marker, not an id-prefix
 * guess. The marker owner must also match the namespace encoded in the id.
 */
export function isPrivacySafeNotificationRequest(request: NotificationRequestIdentity): boolean {
  const identifier = request.identifier ?? "";
  if (!isCurrentGenerationNotificationId(identifier)) return false;
  const encodedOwner = CURRENT_NOTIFICATION_OWNER_PATTERN.exec(identifier)?.[1];
  const data = request.content?.data;
  return data?.[PRIVACY_GENERATION_DATA_KEY] === PRIVACY_GENERATION
    && data?.[OWNER_TOKEN_DATA_KEY] === encodedOwner;
}

export function isNotificationOwnedBy(identifier: string, ownerId: string): boolean {
  return isCurrentGenerationNotificationId(identifier) && identifier.startsWith(ownerPrefix(ownerId));
}

export function routineIdFromNotification(identifier: string, ownerId: string): string | null {
  const prefix = `${ownerPrefix(ownerId)}routine-`;
  if (!isCurrentGenerationNotificationId(identifier) || !identifier.startsWith(prefix)) return null;
  return identifier.slice(prefix.length);
}

export function accountNotificationStorageKey(
  ownerId: string,
  kind: AccountNotificationStorageKind,
): string {
  return `ops.account.v2.${notificationOwnerToken(ownerId)}.${kind}`;
}
