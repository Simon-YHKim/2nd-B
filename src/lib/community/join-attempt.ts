/**
 * The token lengths community_join accepts (0126: `char_length(p_token) NOT BETWEEN 16 AND 128`
 * raises community_token_invalid). Counted in characters, as Postgres counts them.
 */
export const COMMUNITY_TOKEN_MIN_CHARS = 16;
export const COMMUNITY_TOKEN_MAX_CHARS = 128;

export function communityTokenShapeOk(token: string): boolean {
  const chars = Array.from(token).length;
  return chars >= COMMUNITY_TOKEN_MIN_CHARS && chars <= COMMUNITY_TOKEN_MAX_CHARS;
}

/**
 * The message key the join screen shows for a failed attempt. Only "joinFailed" offers a
 * retry; every other key is a final answer about the link or the account.
 *
 * community_token_invalid is a link that can never work (W-07, QA 261004): it used to fall to
 * the default and offer a retry that got the same refusal every time.
 */
export function joinErrorKey(code: string | null): string {
  switch (code) {
    case "community_adult_only": return "adultOnly";
    case "community_token_invalid": return "inviteUnknown";
    case "community_invite_unknown": return "inviteUnknown";
    case "community_invite_expired": return "inviteExpired";
    case "community_invite_spent": return "inviteSpent";
    case "community_room_full": return "roomFull";
    default: return "joinFailed";
  }
}

/**
 * A superseded invite may finish its profile or join request, but must not act on the screen.
 *
 * A token the server would refuse for its length is refused here first, before the profile
 * step: a malformed link should not create a community profile on its way to an error.
 */
export async function runCommunityJoinAttempt(
  token: string,
  ensureProfile: () => Promise<unknown>,
  join: (token: string) => Promise<string>,
  isCurrent: () => boolean,
  onJoined: (roomId: string) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  if (!communityTokenShapeOk(token)) {
    if (isCurrent()) onError(new Error("community_token_invalid"));
    return;
  }
  try {
    await ensureProfile();
    if (!isCurrent()) return;
    const roomId = await join(token);
    if (isCurrent()) onJoined(roomId);
  } catch (error) {
    if (isCurrent()) onError(error);
  }
}
