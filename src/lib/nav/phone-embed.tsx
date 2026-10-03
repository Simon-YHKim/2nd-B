// A screen rendered inside the dashboard phone display.
//
// Simon (2026-09-30 phone-only report): every feature opened from the phone
// stays inside the phone frame. Screens built on DeepSpaceScreen can render
// there unchanged once two things come from this context instead of the app's
// own navigator:
//
// - Navigation. `useAppRouter()` is a drop-in for expo-router's `router`. In
//   the phone it pushes onto the phone's own screen stack (or leaves the phone
//   for a route the phone cannot host), and `back()` steps the phone back. Out
//   of the phone it IS expo-router's `router`, so the standalone route is
//   unchanged.
// - Params. `useScreenParams()` returns the embedded route's query, because
//   `useLocalSearchParams()` inside the phone would read /dashboard's params.
//
// A screen that still calls `router.back()` directly would pop the real stack
// and leave the dashboard, so only screens converted to these hooks may be
// registered as phone screens.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { BackHandler } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";

export interface PhoneEmbedNav {
  /** Open `route` inside the phone when it can host it; otherwise leave the phone. */
  push(route: string): void;
  /** Replace the current phone screen with `route`. */
  replace(route: string): void;
  /** One step back in the phone's history. */
  back(): void;
  /** Query params of the embedded route ("/import?mode=account" -> { mode: "account" }). */
  params: Readonly<Record<string, string>>;
  /** Width of the phone's display. A screen that sizes itself from the window
   *  width must use this instead inside the phone. */
  displayWidth?: number;
  /** Puts an Android Back handler on top of the phone's own. Returns the release. */
  claimBack(handler: () => boolean): () => void;
}

const PhoneEmbedContext = createContext<PhoneEmbedNav | null>(null);

export function PhoneEmbedProvider({ value, children }: { value: PhoneEmbedNav; children: ReactNode }) {
  return <PhoneEmbedContext.Provider value={value}>{children}</PhoneEmbedContext.Provider>;
}

export function usePhoneEmbed(): PhoneEmbedNav | null {
  return useContext(PhoneEmbedContext);
}

/** The subset of expo-router's `router` that converted screens use. */
export interface AppRouter {
  push(href: Href): void;
  replace(href: Href): void;
  back(): void;
  canGoBack(): boolean;
  /** Pops the app stack to its root. Inside the phone the phone's stack is kept. */
  dismissAll(): void;
}

/** Turns an expo-router Href into the path string the phone stack stores. */
export function hrefToPath(href: Href): string {
  if (typeof href === "string") return href;
  const { pathname, params } = href as { pathname: string; params?: Record<string, unknown> };
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    rest[key] = Array.isArray(value) ? value.map(String).join(",") : String(value);
  }
  const path = pathname.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, (_match, key: string) => {
    const value = rest[key] ?? "";
    delete rest[key];
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams(rest).toString();
  return query ? `${path}?${query}` : path;
}

/** Splits a phone stack entry into its path and query params. */
export function splitPhoneRoute(route: string): { path: string; params: Record<string, string> } {
  const at = route.indexOf("?");
  if (at < 0) return { path: route, params: {} };
  const params: Record<string, string> = {};
  new URLSearchParams(route.slice(at + 1)).forEach((value, key) => { params[key] = value; });
  return { path: route.slice(0, at), params };
}

/** Drop-in for expo-router's `router`; phone-local inside the phone. */
export function useAppRouter(): AppRouter {
  const embed = usePhoneEmbed();
  return useMemo<AppRouter>(() => embed ? {
    push: (href) => embed.push(hrefToPath(href)),
    replace: (href) => embed.replace(hrefToPath(href)),
    back: () => embed.back(),
    canGoBack: () => true,
    dismissAll: () => undefined,
  } : router, [embed]);
}

/** `useLocalSearchParams()` that reads the embedded route's query inside the phone. */
export function useScreenParams<T extends Record<string, string | string[] | undefined>>(): Partial<T> {
  const local = useLocalSearchParams();
  const embed = usePhoneEmbed();
  return (embed ? embed.params : local) as Partial<T>;
}

/**
 * Android Back for a screen that has its own back logic (unsaved changes, open
 * sheets). Standalone it is a focused BackHandler listener. Inside the phone it
 * goes through the phone's claim stack instead: React runs child effects
 * before parent effects, so a screen's own BackHandler listener would end up
 * older than the phone's and the phone would pop the screen first.
 */
export function useHardwareBack(handler: () => boolean): void {
  const embed = usePhoneEmbed();
  useFocusEffect(useCallback(() => {
    if (embed) return embed.claimBack(handler);
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, [embed, handler]));
}
