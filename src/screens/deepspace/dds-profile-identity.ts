import { withTimeout } from "@/lib/async/with-timeout";
import { getSupabaseClient } from "@/lib/supabase/client";

export interface LocalProfileSession {
  userId: string;
  email: string | null;
}

export interface ProfileIdentityDeps {
  readDisplayName: (userId: string) => Promise<string | null>;
  readLocalSession: () => Promise<LocalProfileSession | null>;
}

const PROFILE_IDENTITY_TIMEOUT_MS = 6000;

const profileIdentityDeps: ProfileIdentityDeps = {
  async readDisplayName(userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await withTimeout(
      supabase.from("users").select("display_name").eq("id", userId).maybeSingle(),
      PROFILE_IDENTITY_TIMEOUT_MS,
      "Profile display name",
    );
    if (error) throw error;
    return (data as { display_name?: string | null } | null)?.display_name ?? null;
  },

  async readLocalSession() {
    const supabase = getSupabaseClient();
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      PROFILE_IDENTITY_TIMEOUT_MS,
      "Profile local session",
    );
    if (error) throw error;
    const sessionUser = data.session?.user;
    if (!sessionUser) return null;
    return { userId: sessionUser.id, email: sessionUser.email ?? null };
  },
};

function emailLocalPart(email: string | null): string | null {
  const normalized = email?.trim() ?? "";
  const separator = normalized.indexOf("@");
  if (separator <= 0) return null;
  return normalized.slice(0, separator).trim() || null;
}

/**
 * Display priority is real profile data, then this exact user's persisted
 * session email. A translated fallback belongs to the screen, not this data
 * function, so a missing identity can never turn into invented account data.
 */
export function resolveProfileIdentity(
  displayName: string | null,
  session: LocalProfileSession | null,
  requestedUserId: string,
): string | null {
  const normalizedDisplayName = displayName?.trim() ?? "";
  if (normalizedDisplayName) return normalizedDisplayName;
  if (!session || session.userId !== requestedUserId) return null;
  return emailLocalPart(session.email);
}

/** Async identity results belong only to the request's still-active account. */
export function canPublishProfileIdentity(
  cancelled: boolean,
  requestedUserId: string,
  activeUserId: string | null,
): boolean {
  return !cancelled && requestedUserId === activeUserId;
}

/** Both sources fail soft. The screen can stay useful offline without logging PII. */
export async function loadProfileIdentity(
  userId: string,
  deps: ProfileIdentityDeps = profileIdentityDeps,
): Promise<string | null> {
  const [displayName, session] = await Promise.all([
    deps.readDisplayName(userId).catch(() => null),
    deps.readLocalSession().catch(() => null),
  ]);
  return resolveProfileIdentity(displayName, session, userId);
}
