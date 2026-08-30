import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { canSubmitDobCorrection } from "@/lib/account/dob";
import {
  buildExportFilename,
  requestAccountExport,
  type AccountExport,
} from "@/lib/account/export";
import { fetchBirthDate, updateBirthDate } from "@/lib/supabase/account";

/** The six account-hub destinations retained from the real app contract. */
export const ACCOUNT_DESTINATIONS: readonly {
  route: "/profile" | "/change-password" | "/settings" | "/data" | "/iden" | "/beyond";
  labelKey: string;
  icon: AnyGlyphName;
}[] = [
  { route: "/profile", labelKey: "deepspace:account.navProfile", icon: "account" },
  { route: "/change-password", labelKey: "deepspace:account.navPassword", icon: "lock" },
  { route: "/settings", labelKey: "deepspace:account.navSettings", icon: "settings" },
  { route: "/data", labelKey: "deepspace:account.navData", icon: "box" },
  { route: "/iden", labelKey: "IDEN", icon: "iden" },
  { route: "/beyond", labelKey: "deepspace:account.navBeyond", icon: "devices" },
];

export type AccountTool = "dob" | "export";

/** Only these two query values may reveal a tool; arrays and unknown values are ignored. */
export function accountToolFromParam(value: string | string[] | undefined): AccountTool | null {
  return value === "dob" || value === "export" ? value : null;
}

export type DobLoadResult =
  | { status: "loaded"; dob: string | null }
  | { status: "failed"; error: unknown }
  | { status: "cancelled" };

export interface DobLoadDeps {
  fetchBirthDate: (userId: string) => Promise<string | null>;
}

/** Load one user's DOB without ever publishing a result into another session. */
export async function loadAccountDob(
  userId: string,
  isActive: () => boolean,
  deps: DobLoadDeps = { fetchBirthDate },
): Promise<DobLoadResult> {
  try {
    const dob = await deps.fetchBirthDate(userId);
    if (!isActive()) return { status: "cancelled" };
    // users.birth_date is NOT NULL. The existing helper returns null on a read
    // failure, so null is an unavailable state here, not an editable blank DOB.
    if (dob === null) return { status: "failed", error: new Error("birth date unavailable") };
    return { status: "loaded", dob };
  } catch (error) {
    if (!isActive()) return { status: "cancelled" };
    return { status: "failed", error };
  }
}

export type DobSaveResult =
  | { status: "invalid" }
  | { status: "saved" }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown };

export interface DobSaveInput {
  userId: string | null;
  current: string | null;
  next: string;
  refresh: () => Promise<void>;
  /** Still mounted and still showing the user whose DOB is being written. */
  isActive: () => boolean;
}

export interface DobSaveDeps {
  updateBirthDate: (userId: string, birthDate: string) => Promise<void>;
}

/**
 * Correct DOB and immediately republish AuthContext's age-derived state.
 * The server trigger remains authoritative; this only coordinates the existing
 * write and refresh contracts so the UI can report one honest outcome.
 */
export async function saveAccountDob(
  input: DobSaveInput,
  deps: DobSaveDeps = { updateBirthDate },
): Promise<DobSaveResult> {
  if (!input.userId || !canSubmitDobCorrection(input.current, input.next)) {
    return { status: "invalid" };
  }

  try {
    await deps.updateBirthDate(input.userId, input.next);
    // Never refresh AuthContext for user B after user A's write finishes.
    if (!input.isActive()) return { status: "cancelled" };
    await input.refresh();
    if (!input.isActive()) return { status: "cancelled" };
    return { status: "saved" };
  } catch (error) {
    if (!input.isActive()) return { status: "cancelled" };
    return { status: "failed", error };
  }
}

export type AccountExportResult =
  | { status: "done" }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown };

export interface AccountExportDeps {
  requestAccountExport: () => Promise<AccountExport>;
  buildExportFilename: (exportedAtIso: string) => string;
  deliver: (json: string, filename: string) => Promise<void>;
  /** Still mounted and still showing the user who requested this bundle. */
  isActive: () => boolean;
}

/** Request, serialize, and hand off the full account export as one transaction. */
export async function exportAccountData(
  deps: AccountExportDeps,
): Promise<AccountExportResult> {
  try {
    const bundle = await deps.requestAccountExport();
    // The edge function derives ownership from the request JWT. If the active
    // session changed while it ran, do not hand user A's bundle to user B.
    if (!deps.isActive()) return { status: "cancelled" };
    const filename = deps.buildExportFilename(bundle.exported_at);
    await deps.deliver(JSON.stringify(bundle, null, 2), filename);
    return { status: "done" };
  } catch (error) {
    if (!deps.isActive()) return { status: "cancelled" };
    return { status: "failed", error };
  }
}

export const accountExportDeps = {
  requestAccountExport,
  buildExportFilename,
} as const;
