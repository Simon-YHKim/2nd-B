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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { BackHandler, type ScrollView } from "react-native";
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

/**
 * The screen's scroll view restores its remembered position first (scroll-memory: one frame, then
 * once more 180 ms after the content last changed size). A scroll to the end before that is undone,
 * so this waits until that restore has let go.
 */
const START_AT_END_AFTER_MS = 320;
/** How long a screen opened at its end keeps following content that is still loading. */
const START_AT_END_FOLLOW_MS = 4000;

/**
 * A screen opened with `?<name>=<value>` goes to the end of its scroll, not the top.
 * For a route whose last section is where a link from elsewhere means to land: the account
 * screen's "delete account" row opens /privacy, whose delete card is the last one. It follows
 * late-loading content for a moment and then leaves the scroll to the person.
 */
export function useStartAtEndWhen(name: string, value: string): { scrollRef: RefObject<ScrollView | null>; onContentSizeChange: (() => void) | undefined } {
  const wanted = useScreenParams<Record<string, string>>()[name] === value;
  const scrollRef = useRef<ScrollView | null>(null);
  const since = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const onContentSizeChange = useCallback(() => {
    const now = Date.now();
    if (since.current === null) since.current = now;
    if (now - since.current > START_AT_END_FOLLOW_MS) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; scrollRef.current?.scrollToEnd({ animated: false }); }, START_AT_END_AFTER_MS);
  }, []);
  return { scrollRef, onContentSizeChange: wanted ? onContentSizeChange : undefined };
}

/** How long a requested scroll keeps following content that is still settling. Short on purpose:
 *  after this the scroll belongs to the person again. */
const SCROLL_TO_FOLLOW_MS = 1500;

/**
 * Moves a screen's scroll view to an offset once the scroll memory's own restore has let go
 * (see START_AT_END_AFTER_MS). For something that arrives while the screen is opening and sits
 * below the first screenful: a share landing in the scrap screen's link box. The offset is read
 * when the scroll happens, so a late layout is followed; a null offset means "not laid out yet".
 */
export function useScrollToWhenSettled(): {
  scrollRef: RefObject<ScrollView | null>;
  onContentSizeChange: () => void;
  scrollToWhenSettled: (offset: () => number | null) => void;
} {
  const scrollRef = useRef<ScrollView | null>(null);
  const wanted = useRef<{ offset: () => number | null; since: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const arm = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const y = wanted.current === null ? null : wanted.current.offset();
      if (y !== null) scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false });
    }, START_AT_END_AFTER_MS);
  }, []);
  const onContentSizeChange = useCallback(() => {
    const request = wanted.current;
    if (request === null) return;
    if (Date.now() - request.since > SCROLL_TO_FOLLOW_MS) { wanted.current = null; return; }
    arm();
  }, [arm]);
  const scrollToWhenSettled = useCallback((offset: () => number | null) => {
    wanted.current = { offset, since: Date.now() };
    arm();
  }, [arm]);
  return { scrollRef, onContentSizeChange, scrollToWhenSettled };
}
