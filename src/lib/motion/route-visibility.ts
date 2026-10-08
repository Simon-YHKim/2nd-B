interface RouteVisibilityState {
  index?: number;
  routes: readonly {
    key?: string;
    name: string;
    state?: RouteVisibilityState;
  }[];
}

/** The closest app Stack, not Expo's synthetic __root state. A transparent
 * overlay leaves the scene below visible until an opaque route is reached. */
export function worldRouteVisible(state: RouteVisibilityState | undefined, routeKey: string): boolean {
  if (!state?.routes.length) return false;
  const last = Math.min(state.index ?? state.routes.length - 1, state.routes.length - 1);
  for (let index = last; index >= 0; index -= 1) {
    const route = state.routes[index];
    if (route.key === routeKey) return true;
    if (route.name !== "dashboard" && route.name !== "core-brain") break;
  }
  return false;
}
