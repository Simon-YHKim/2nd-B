/** A superseded invite may finish its profile or join request, but must not act on the screen. */
export async function runCommunityJoinAttempt(
  token: string,
  ensureProfile: () => Promise<unknown>,
  join: (token: string) => Promise<string>,
  isCurrent: () => boolean,
  onJoined: (roomId: string) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    await ensureProfile();
    if (!isCurrent()) return;
    const roomId = await join(token);
    if (isCurrent()) onJoined(roomId);
  } catch (error) {
    if (isCurrent()) onError(error);
  }
}
