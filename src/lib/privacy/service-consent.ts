import { abortError } from "../async/abort";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { allRequiredAcksChecked, REQUIRED_ACK_KEYS, type ConsentSelections } from "../auth/consent-selections";
import type { AvailableUiLocale } from "../i18n/locales";
import { invokeFunctionWithCapturedSession } from "../supabase/captured-session-client";
import { CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../supabase/consent";

export interface ServiceConsentStatus {
  readonly ownerId: string;
  readonly ownerEpoch: number;
  readonly mode: "collect" | "enforce";
  readonly contract_revision: string;
  readonly consent_version: string;
  readonly policy_version: string;
  readonly terms_version: string;
  readonly state: "uncovered" | "granted" | "revoked" | "blocked";
  readonly change_token: string;
  readonly can_grant: boolean;
}

type ConsentErrorCode = "unavailable" | "conflict" | "ineligible" | "invalid_selection" | "contract_changed" | "not_saved";
export class ServiceConsentError extends Error {
  constructor(readonly code: ConsentErrorCode) {
    super(`service_consent_${code}`);
    this.name = "ServiceConsentError";
  }
}

const STATUS_KEYS = ["mode", "contract_revision", "consent_version", "policy_version", "terms_version", "state", "change_token", "can_grant"];

function decodeStatus(value: unknown, ownerId: string, ownerEpoch: number, mutation: boolean): ServiceConsentStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ServiceConsentError("unavailable");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !STATUS_KEYS.includes(key) && !(mutation && key === "created")) ||
      (mutation && row.created !== true) ||
      !["collect", "enforce"].includes(row.mode as string) ||
      typeof row.contract_revision !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(row.contract_revision) ||
      ![row.consent_version, row.policy_version, row.terms_version].every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ||
      !["uncovered", "granted", "revoked", "blocked"].includes(row.state as string) ||
      typeof row.change_token !== "string" || !/^[a-f0-9]{64}$/.test(row.change_token) ||
      typeof row.can_grant !== "boolean") throw new ServiceConsentError("unavailable");
  return { ...Object.fromEntries(STATUS_KEYS.map((key) => [key, row[key]])), ownerId, ownerEpoch } as unknown as ServiceConsentStatus;
}

/** A grant only records the exact document tuple that this app can display. */
export function matchesServiceConsentContract(status: ServiceConsentStatus): boolean {
  return status.contract_revision === "service-v1" && status.consent_version === CONSENT_VERSION &&
    status.policy_version === PRIVACY_POLICY_VERSION && status.terms_version === TERMS_VERSION;
}

async function requestConsent(userId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ServiceConsentStatus> {
  const owner = captureAccountOwnerLease(userId);
  if (!owner) throw abortError();
  const pending = beginAccountSessionLease(userId, signal);
  const unsubscribe = subscribeAccountTransition(() => { if (!owner.isCurrent()) pending.abort(); });
  try {
    const session = await pending.authenticate();
    if (!owner.isCurrent()) throw abortError();
    session.assertCurrent();
    const result = await invokeFunctionWithCapturedSession("service-consent", session.accessToken, { body, signal: session.signal });
    session.assertCurrent();
    if (!owner.isCurrent()) throw abortError();
    if (result.error) {
      const code = result.error.context.status;
      throw new ServiceConsentError(code === 409 ? "conflict" : code === 403 ? "ineligible" : "unavailable");
    }
    return decodeStatus(result.data, userId, owner.epoch, body.action !== "status");
  } catch (error) {
    pending.assertCurrent();
    if (!owner.isCurrent()) throw abortError();
    if (error instanceof ServiceConsentError) throw error;
    throw new ServiceConsentError("unavailable");
  } finally {
    unsubscribe();
    pending.release();
  }
}

export function loadServiceConsent(userId: string, signal?: AbortSignal): Promise<ServiceConsentStatus> {
  return requestConsent(userId, { action: "status" }, signal);
}

export async function saveServiceConsent(input: {
  userId: string;
  status: ServiceConsentStatus;
  action: "grant" | "revoke";
  selections?: ConsentSelections;
  locale: AvailableUiLocale;
  signal?: AbortSignal;
}): Promise<ServiceConsentStatus> {
  const { userId, status, action, selections, locale, signal } = input;
  if (status.ownerId !== userId || captureAccountOwnerLease(userId)?.epoch !== status.ownerEpoch) throw abortError();
  if (action === "grant") {
    if (!status.can_grant) throw new ServiceConsentError("ineligible");
    if (!matchesServiceConsentContract(status)) throw new ServiceConsentError("contract_changed");
    if (!selections || !allRequiredAcksChecked(selections)) throw new ServiceConsentError("invalid_selection");
  }
  const result = await requestConsent(userId, {
    action,
    contractRevision: status.contract_revision,
    expectedChangeToken: status.change_token,
    requiredAcks: action === "grant" ? Object.fromEntries(REQUIRED_ACK_KEYS.map((key) => [key, selections![key]])) : {},
    // The consent namespace uses reviewed KO or canonical EN. ES/PT/ID ship
    // the EN text under check:safety-consent-locale; record the displayed copy.
    locale: locale === "ko" ? "ko" : "en",
  }, signal);
  const expectedState = action === "grant" ? result.state === "granted" || result.state === "blocked" : result.state === "revoked";
  if (!expectedState || result.change_token === status.change_token ||
      (action === "grant" && !matchesServiceConsentContract(result))) throw new ServiceConsentError("not_saved");
  return result;
}
