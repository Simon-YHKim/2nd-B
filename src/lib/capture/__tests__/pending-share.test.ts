// A share that reached /capture while signed out or before the profile existed
// (gate FIN-01, 2026-10-06). The capture route and IntroGate redirect such a
// visit, and the shared text used to go with the redirect. ../pending-share.ts
// keeps it in memory for the account that signs in next and gives the home
// screen a /capture link that carries it again.
//
// The account owner is the real account-epoch module (import-free), driven the
// way AuthContext drives it. The resume link goes through expo-router's own
// query parse plus useLocalSearchParams' decode, the path the capture screen
// reads it by.

import { readFileSync } from "fs";
import path from "path";

import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
import type { ProfileGateSnapshot } from "../../auth/profile-probe";
import {
  PENDING_SHARE_MAX_CHARS,
  PENDING_SHARE_TTL_MS,
  __resetPendingShareForTests,
  createPendingShareWatcher,
  decideSharedRoute,
  holdPendingShare,
  pendingShareSnapshot,
  takePendingShareHref,
} from "../pending-share";
import { SHARE_TEXT_MAX_CHARS, SHARE_TITLE_MAX_CHARS, SHARE_TRUNCATION_MARKER } from "../share-intent";
import { normalizeSharedCaptureParams } from "../share-params";

const { parseQueryParams } = require("expo-router/build/fork/getStateFromPath-forks") as {
  parseQueryParams: (
    path: string,
    route: { params?: Record<string, unknown> },
  ) => Record<string, string | string[]> | undefined;
};

/** What the capture screen reads for an href pushed from JS: the router's parse, then the hook's decode. */
function screenParams(href: string): Record<string, string> {
  const parsed = parseQueryParams(href, {}) ?? {};
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => {
      const raw = Array.isArray(value) ? value[0] : value;
      try {
        return [key, decodeURIComponent(raw)];
      } catch {
        return [key, raw];
      }
    }),
  );
}

const SIGNED_OUT: ProfileGateSnapshot = { loading: false, userId: null, hasProfile: null, profileProbeFailed: false };
const noProfile = (userId: string): ProfileGateSnapshot => ({
  loading: false,
  userId,
  hasProfile: false,
  profileProbeFailed: false,
});
const ready = (userId: string): ProfileGateSnapshot => ({
  loading: false,
  userId,
  hasProfile: true,
  profileProbeFailed: false,
});

const T0 = 1_700_000_000_000;

beforeEach(() => {
  __resetPendingShareForTests();
  __resetAccountEpochForTests();
});

describe("decideSharedRoute: which redirect drops a share", () => {
  test("signed out: keep it, owned by nobody yet", () => {
    expect(decideSharedRoute("/capture", { text: "hello" }, SIGNED_OUT)).toEqual({
      kind: "hold",
      key: expect.any(String),
      content: "hello",
      owner: null,
    });
  });

  test("signed in without a profile (the C10 redirect): keep it for that account", () => {
    expect(decideSharedRoute("/capture", { text: "hello", title: "T" }, noProfile("X"))).toMatchObject({
      kind: "hold",
      content: "T\n\nhello",
      owner: "X",
    });
  });

  test("signed in with a profile: the capture screen takes it as before", () => {
    expect(decideSharedRoute("/capture", { text: "hello" }, ready("A"))).toEqual({
      kind: "ready",
      key: expect.any(String),
    });
  });

  test.each<[string, ProfileGateSnapshot]>([
    ["auth still loading", { loading: true, userId: null, hasProfile: null, profileProbeFailed: false }],
    ["profile not answered yet", { loading: false, userId: "A", hasProfile: null, profileProbeFailed: false }],
    ["profile probe failed (retry screen, not a redirect)", { loading: false, userId: "A", hasProfile: false, profileProbeFailed: true }],
  ])("%s: nothing to do", (_label, auth) => {
    expect(decideSharedRoute("/capture", { text: "hello" }, auth)).toEqual({ kind: "none" });
  });

  test("other routes and a capture link without a share are left alone", () => {
    expect(decideSharedRoute("/sign-in", { text: "hello" }, SIGNED_OUT)).toEqual({ kind: "none" });
    expect(decideSharedRoute("/capture-full", { text: "hello" }, SIGNED_OUT)).toEqual({ kind: "none" });
    expect(decideSharedRoute("/capture", {}, SIGNED_OUT)).toEqual({ kind: "none" });
    expect(decideSharedRoute("/capture", { text: "   " }, SIGNED_OUT)).toEqual({ kind: "none" });
  });

  test("the web share target's url param counts as a share", () => {
    expect(decideSharedRoute("/capture", { url: "https://example.com/a", title: "A" }, SIGNED_OUT)).toMatchObject({
      kind: "hold",
      content: "A\n\nhttps://example.com/a",
    });
  });
});

describe("hold, then sign in, then take", () => {
  // What the share hook reads (useGlobalSearchParams) is already decoded the way
  // the capture screen would have read it, so these are the texts as shared.
  const HARD_TEXTS = [
    "plain words",
    "50% off https://shop.example/a?b=1&c=2",
    "100%41",
    "https://ko.wikipedia.org/wiki/%EB%B6%81%EA%B7%B9%EC%84%B1",
    "C++ & Rust #tips",
    "a=b&mode=ocr&tag=x&entry=firstRun&coach=1",
    "line one\nline two\n\nline four",
    "한글 공유 😀 그리고 'quotes' (parens) *star* ~tilde!",
  ];

  test.each(HARD_TEXTS)("the capture screen reads back exactly what was kept: %j", (text) => {
    const decision = decideSharedRoute("/capture", { text }, SIGNED_OUT);
    if (decision.kind !== "hold") throw new Error("expected a hold");
    expect(holdPendingShare(decision.content, decision.owner, T0)).toBe(true);
    noteResolvedOwner("A");
    const href = takePendingShareHref("A", T0 + 1000);
    expect(href).not.toBeNull();
    const params = screenParams(href as string);
    // One text param and nothing else: a crafted mode/tag cannot ride along.
    expect(Object.keys(params)).toEqual(["text"]);
    expect(normalizeSharedCaptureParams(params)?.content).toBe(decision.content);
  });

  test("it is handed over once", () => {
    holdPendingShare("hello", null, T0);
    noteResolvedOwner("A");
    expect(takePendingShareHref("A", T0)).not.toBeNull();
    expect(takePendingShareHref("A", T0)).toBeNull();
    expect(pendingShareSnapshot()).toBeNull();
  });

  test("a share kept while signed out belongs to the first account that signs in", () => {
    holdPendingShare("hello", null, T0);
    noteResolvedOwner("A");
    expect(pendingShareSnapshot()).toMatchObject({ owner: "A" });
    expect(takePendingShareHref("A", T0)).not.toBeNull();
  });

  test("a share kept for an account without a profile stays with that account", () => {
    noteResolvedOwner("X");
    expect(holdPendingShare("hello", "X", T0)).toBe(true);
    expect(takePendingShareHref("X", T0)).not.toBeNull();
  });

  test("the time limit drops it", () => {
    holdPendingShare("hello", null, T0);
    noteResolvedOwner("A");
    expect(takePendingShareHref("A", T0 + PENDING_SHARE_TTL_MS + 1)).toBeNull();
    expect(pendingShareSnapshot()).toBeNull();
  });

  test("right at the time limit it is still handed over", () => {
    holdPendingShare("hello", null, T0);
    noteResolvedOwner("A");
    expect(takePendingShareHref("A", T0 + PENDING_SHARE_TTL_MS)).not.toBeNull();
  });

  test("an expired share is replaced, not extended, by a new one", () => {
    holdPendingShare("old", null, T0);
    holdPendingShare("new", null, T0 + PENDING_SHARE_TTL_MS + 1);
    expect(pendingShareSnapshot()?.content).toBe("new");
  });
});

describe("it never reaches a second account", () => {
  test("an account switch drops a share kept for the first account", () => {
    noteResolvedOwner("X");
    holdPendingShare("for X", "X", T0);
    noteResolvedOwner("Y");
    expect(pendingShareSnapshot()).toBeNull();
    expect(takePendingShareHref("Y", T0)).toBeNull();
  });

  test("claimed, signed out, then another account: dropped at the sign-out", () => {
    holdPendingShare("hello", null, T0);
    noteResolvedOwner("A");
    noteResolvedOwner(null);
    expect(pendingShareSnapshot()).toBeNull();
    noteResolvedOwner("B");
    expect(takePendingShareHref("B", T0)).toBeNull();
  });

  test("take by an account other than the owner returns nothing and forgets it", () => {
    holdPendingShare("hello", null, T0);
    noteResolvedOwner("A");
    expect(takePendingShareHref("B", T0)).toBeNull();
    expect(pendingShareSnapshot()).toBeNull();
  });

  test("a hold that disagrees with the published account is refused (React lags a sign-in by a render)", () => {
    noteResolvedOwner("A");
    expect(holdPendingShare("hello", null, T0)).toBe(false);
    expect(pendingShareSnapshot()).toBeNull();
  });

  test("a delivery already shown to an account is not kept when that account signs out on it", () => {
    const watch = createPendingShareWatcher();
    noteResolvedOwner("A");
    watch("/capture", { text: "A's share" }, ready("A"));
    noteResolvedOwner(null);
    watch("/capture", { text: "A's share" }, SIGNED_OUT);
    expect(pendingShareSnapshot()).toBeNull();
    // A different share on the same route is still kept.
    watch("/capture", { text: "new share" }, SIGNED_OUT);
    expect(pendingShareSnapshot()?.content).toBe("new share");
  });

  test("the watcher keeps a share that arrives signed out", () => {
    const watch = createPendingShareWatcher();
    watch("/capture", { text: "hello" }, SIGNED_OUT);
    expect(pendingShareSnapshot()).toMatchObject({ content: "hello", owner: null });
  });
});

describe("several shares and the length cap", () => {
  test("the same share twice is kept once", () => {
    holdPendingShare("hello", null, T0);
    holdPendingShare("hello", null, T0 + 1);
    expect(pendingShareSnapshot()?.content).toBe("hello");
  });

  test("two different shares are kept in order, as two shares into the capture draft would be", () => {
    holdPendingShare("first", null, T0);
    holdPendingShare("second", null, T0 + 1);
    expect(pendingShareSnapshot()?.content).toBe("first\n\nsecond");
  });

  test("the longest Android share (capped title + capped text) is kept whole", () => {
    const content = `${"t".repeat(SHARE_TITLE_MAX_CHARS)}\n\n${"x".repeat(SHARE_TEXT_MAX_CHARS)}`;
    expect(content.length).toBe(PENDING_SHARE_MAX_CHARS);
    expect(holdPendingShare(content, null, T0)).toBe(true);
    expect(pendingShareSnapshot()?.content).toBe(content);
  });

  test("a crafted link longer than the cap is cut and marked", () => {
    holdPendingShare("가".repeat(PENDING_SHARE_MAX_CHARS + 500), null, T0);
    const kept = pendingShareSnapshot()?.content ?? "";
    expect(kept.length).toBeLessThanOrEqual(PENDING_SHARE_MAX_CHARS);
    expect(kept.endsWith(SHARE_TRUNCATION_MARKER)).toBe(true);
  });

  test("a share that would pass the cap is refused and the kept ones stay", () => {
    const full = "x".repeat(PENDING_SHARE_MAX_CHARS - 10);
    holdPendingShare(full, null, T0);
    expect(holdPendingShare("this one does not fit", null, T0 + 1)).toBe(false);
    expect(pendingShareSnapshot()?.content).toBe(full);
  });

  test("text that cannot be percent-encoded is not turned into an empty capture screen", () => {
    holdPendingShare("broken \ud800 surrogate", null, T0);
    noteResolvedOwner("A");
    expect(takePendingShareHref("A", T0)).toBeNull();
  });
});

describe("wiring (render tests are not run in this repo, so the two call sites are pinned)", () => {
  const appDir = path.join(__dirname, "../../../app");

  test("the root layout keeps shares outside IntroGate, whose redirect replaces the Stack", () => {
    const layout = readFileSync(path.join(appDir, "_layout.tsx"), "utf8");
    const holdAt = layout.indexOf("<PendingShareHoldSync />");
    expect(holdAt).toBeGreaterThan(-1);
    expect(holdAt).toBeLessThan(layout.indexOf("<IntroGate"));
    expect(layout).toMatch(/function PendingShareHoldSync\(\): null \{\s*usePendingShareHold\(\);/);
  });

  test("the home screen hands the share back", () => {
    const home = readFileSync(path.join(appDir, "index.tsx"), "utf8");
    const body = home.slice(home.indexOf("export default function Index()"));
    const callAt = body.indexOf("  usePendingShareResume();");
    expect(callAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(body.indexOf("  return ("));
  });
});
