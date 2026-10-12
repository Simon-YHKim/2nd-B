import { isAccountTransitionPending } from "./account-epoch";

/** Product destinations reached from auth must first supply the home proof.
 * AvatarSetupGate resumes required setup after release. Optional destinations
 * without a gate (manual) stay at home; no return-route queue is introduced.
 * Read the hold at dispatch time, including delayed welcome callbacks.
 */
export function authExitDestination<T extends string>(destination: T): T | "/" {
  return resolveAuthExitDestination(destination, isAccountTransitionPending());
}

export function resolveAuthExitDestination<T extends string>(destination: T, pending: boolean): T | "/" {
  return pending ? "/" : destination;
}

/** Existing profiles enter home; newly created profiles need avatar setup. */
export function profileEntryDestination(consentRecorded: boolean | null): "/" | "/avatar-studio?setup=1" {
  return consentRecorded === null ? "/" : "/avatar-studio?setup=1";
}
