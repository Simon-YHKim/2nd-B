// Microsoft Clarity on native (Android), gated exactly like native Firebase.
//
// The web loader next door carries a warning worth repeating, because the
// native SDK removes the constraint that forced it:
//
//   "Clarity ... has no pause/stop command - so the only reliable control is
//    to never INJECT it while the session sits on an identifier-carrying
//    screen. Residual risk stays real: once injected on an allowed route,
//    later same-page-lifetime navigation IS recorded."
//
// The React Native SDK has pause() and resume(), and it records a screen NAME
// we choose rather than a URL we cannot hide. So native gets the discipline the
// web could only approximate:
//
//   web     inject on an allowed route, then hope; the live URL goes with it
//   native  resume on an allowed screen, pause on leaving; the name is ours
//
// Everything else is deliberately identical to the Firebase path, because the
// rules are the same rules: server-confirmed adults only (Clarity's own vendor
// policy bars under-18 audiences, and minors on this product are an open
// decision, not an implied yes), the runtime kill-switch must be able to stop
// it, and a missing native module must fail closed rather than throw.
//
// That last one is not hypothetical here. The SDK builds a NativeEventEmitter
// at module scope:
//
//   const ClarityEmitter = new NativeEventEmitter(NativeModules.ClarityEmitter);
//
// On a binary built before this package landed, that constructs an emitter
// around undefined during the import itself - the same cold-start crash shape
// the Firebase gate was written for. So the module must be PROVEN present
// before the import is even attempted, and OTA updates reach exactly those
// older binaries.

import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

/** What the caller has already decided. This module adds no policy of its own. */
export type ClarityDecision = {
  /** consent + confirmed adult + runtime clarity_enabled, resolved by the caller. */
  enabled: boolean;
  /** Sanitized route. Never the raw path - it becomes the recorded screen name. */
  route: string;
  /** Whether that route is on the Clarity allow-list. */
  allowedRoute: boolean;
  /** EXPO_PUBLIC_CLARITY_PROJECT_ID, or undefined when the build has none. */
  projectId: string | undefined;
};

/** The subset of the SDK this module uses, so tests need no native binary. */
export type ClarityApi = {
  initialize: (projectId: string, config?: { logLevel?: string }) => void;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  consent: (adsStorage: boolean, analyticsStorage: boolean) => Promise<boolean>;
  setCurrentScreenName: (screenName: string | null) => Promise<boolean>;
};

type NativeModuleLookup = (name: string) => unknown;

const CLARITY_MODULE = "Clarity";

let apiOverride: ClarityApi | null = null;
let moduleLookupOverride: NativeModuleLookup | null = null;
// The import itself is a seam, because "did we even try to import" is the
// property that matters here - see loadClarity.
let importerOverride: (() => Promise<unknown>) | null = null;

// Capture state. `initialized` is one-way on purpose: the SDK offers no
// teardown, so once started the only controls are pause and consent.
let initialized = false;
let capturing = false;
let lastScreenName: string | null = null;
let chain: Promise<void> = Promise.resolve();

export function hasNativeClarityModule(
  lookup: NativeModuleLookup = moduleLookupOverride ??
    ((name) => {
      try {
        return TurboModuleRegistry.get(name) ?? NativeModules[name];
      } catch {
        return null;
      }
    }),
): boolean {
  try {
    return lookup(CLARITY_MODULE) != null;
  } catch {
    return false;
  }
}

async function loadClarity(): Promise<ClarityApi | null> {
  // Proven present BEFORE the import, never after. Reversing these two lines
  // is the cold-start crash: the SDK builds a NativeEventEmitter at module
  // scope, so on a pre-Clarity binary the import itself throws. The probe is
  // checked ahead of the api override too, so a test cannot accidentally
  // certify a path that skips it.
  if (!hasNativeClarityModule()) return null;
  if (apiOverride) return apiOverride;
  try {
    const mod = importerOverride
      ? await importerOverride()
      : await import("@microsoft/react-native-clarity");
    return mod as ClarityApi;
  } catch {
    return null;
  }
}

/**
 * Decide what the SDK should be doing, without doing it. Pure, so the rules
 * are testable without a device.
 *
 * `start` is the only branch that begins recording, and it requires the full
 * conjunction. Nothing here can start capture on a disallowed screen, and
 * "not allowed" always resolves to pause rather than to leaving it running.
 */
export function clarityAction(
  decision: ClarityDecision,
  state: { initialized: boolean; capturing: boolean },
): "start" | "resume" | "pause" | "none" {
  const wanted = decision.enabled && decision.allowedRoute && Boolean(decision.projectId);
  if (!wanted) {
    // Revoked consent, a disallowed screen, or a build with no project id.
    // Pausing an SDK that never started is meaningless, so only pause what runs.
    return state.capturing ? "pause" : "none";
  }
  if (!state.initialized) return "start";
  return state.capturing ? "none" : "resume";
}

async function apply(decision: ClarityDecision): Promise<void> {
  const api = await loadClarity();
  if (!api) return; // No native module: the build-level OFF stands.

  const action = clarityAction(decision, { initialized, capturing });

  try {
    if (action === "start") {
      // initialize() begins capture immediately and cannot be undone, so it is
      // reached only through clarityAction's full conjunction.
      api.initialize(decision.projectId as string);
      initialized = true;
      capturing = true;
      // Ads storage is denied in every state: this product's consent is
      // analytics-only, matching the native Firebase consent call.
      await api.consent(false, true);
    } else if (action === "resume") {
      await api.resume();
      capturing = true;
    } else if (action === "pause") {
      // Withdraw the grant as well as stopping capture, so a paused session
      // cannot be treated as consented by anything downstream.
      if (!decision.enabled) await api.consent(false, false);
      await api.pause();
      capturing = false;
    }

    // Name the screen only while recording, and only from the sanitized route.
    // Clarity sees this instead of a URL, which is why identifiers cannot leak
    // the way the web loader's comment describes.
    if (capturing && decision.route !== lastScreenName) {
      await api.setCurrentScreenName(decision.route);
      lastScreenName = decision.route;
    }
  } catch {
    // Fail closed and stay quiet: analytics must never break a screen.
    // `capturing` keeps its last known value; the next decision re-evaluates.
  }
}

/**
 * Mirror a resolved decision into the native SDK. Serialized so rapid
 * navigation applies in order, and a no-op on web, where the DOM loader owns
 * Clarity.
 */
export function syncNativeClarity(decision: ClarityDecision): void {
  if (Platform.OS === "web") return;
  chain = chain.then(() => apply(decision)).catch(() => {});
}

/** Test hook only: substitute the SDK (null restores the real import). */
export function __setClarityApiForTests(api: ClarityApi | null): void {
  apiOverride = api;
}

/** Test hook only: substitute the dynamic import, to assert it is not attempted. */
export function __setClarityImporterForTests(importer: (() => Promise<unknown>) | null): void {
  importerOverride = importer;
}

/** Test hook only: substitute the native-module probe (null restores the real one). */
export function __setClarityModuleLookupForTests(lookup: NativeModuleLookup | null): void {
  moduleLookupOverride = lookup;
}

/** Test hook only: await the apply queue. */
export function __flushClarityForTests(): Promise<void> {
  return chain;
}

/** Test hook only: forget capture state between cases. */
export function __resetClarityForTests(): void {
  initialized = false;
  capturing = false;
  lastScreenName = null;
  chain = Promise.resolve();
}

/** Test hook only: observe capture state. */
export function __clarityStateForTests(): { initialized: boolean; capturing: boolean } {
  return { initialized, capturing };
}
