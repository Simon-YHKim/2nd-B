/** The router owns history resolution; this handler only requests sign-in. */
export function createSignUpBackHandler({ isBusy, router }: {
  isBusy: () => boolean;
  router: { dismissTo: (href: "/sign-in") => void };
}): () => boolean {
  return () => {
    if (isBusy()) return true;
    router.dismissTo("/sign-in");
    return true;
  };
}
