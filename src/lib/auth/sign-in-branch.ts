import type { SignInToast } from "./sign-in-toast";

export type SignInBranch<T> =
  | { kind: "deletion"; notice: T; includesNotice: true }
  | { kind: "loading"; includesNotice: true }
  | { kind: "home"; includesNotice: false }
  | { kind: "form"; includesNotice: true };

/** Every login presentation, including the receipt that outranks guest guards. */
export function selectSignInBranch<T>({ deletionNotice, loading, userId }: {
  deletionNotice: T | null;
  loading: boolean;
  userId: string | null;
}): SignInBranch<T> {
  if (deletionNotice) return { kind: "deletion", notice: deletionNotice, includesNotice: true };
  if (loading) return { kind: "loading", includesNotice: true };
  if (userId) return { kind: "home", includesNotice: false };
  return { kind: "form", includesNotice: true };
}

export type SignInNoticePlacement = "overlay" | "inline" | "none";

// Keep the existing non-exit slots, including the receipt and loading screen.
// The branch union makes adding a presentation require an explicit placement.
const NOTICE_PLACEMENTS: Record<SignInBranch<unknown>["kind"], {
  exit: SignInNoticePlacement;
  other: SignInNoticePlacement;
}> = {
  deletion: { exit: "overlay", other: "inline" },
  loading: { exit: "overlay", other: "inline" },
  home: { exit: "none", other: "none" },
  form: { exit: "overlay", other: "inline" },
};

/** Exit guidance belongs to the viewport, regardless of content/scroll height. */
export function selectSignInNoticePlacement(
  branch: SignInBranch<unknown>,
  toast: SignInToast | null,
): SignInNoticePlacement {
  if (!toast) return "none";
  return NOTICE_PLACEMENTS[branch.kind][toast.exitOnBackUntil !== undefined ? "exit" : "other"];
}
