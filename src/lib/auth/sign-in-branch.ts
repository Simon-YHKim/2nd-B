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
