/**
 * The router owns history resolution; this handler only requests sign-in.
 * On the confirmation-code step, Back first returns to the form (`leaveStep` answers true when
 * it did), the same place the on-screen arrow goes: one step back, not out of sign-up.
 */
export function createSignUpBackHandler({ isBusy, router, leaveStep }: {
  isBusy: () => boolean;
  router: { dismissTo: (href: "/sign-in") => void };
  leaveStep?: () => boolean;
}): () => boolean {
  return () => {
    if (isBusy()) return true;
    if (leaveStep?.()) return true;
    router.dismissTo("/sign-in");
    return true;
  };
}
