// Behavioural tests for the notice centre.
//
// The rules being pinned here are the ones a user would notice immediately if
// they broke: a minor notice must never interrupt, only ONE popup may open, and
// confirming it must not bring it back on the next home entry.
//
// They are unit tests rather than render tests on purpose. jest here is
// preset ts-jest / testEnvironment node with testMatch "*.test.ts",
// __mocks__/react-native.js is a 10-line Platform stub, and StyleSheet is
// undefined under RN 0.85 + jest 29 - a rendered NoticeDialog is not reachable
// from this suite. Keeping the decisions in composeNoticeCenter() is what makes
// them testable at all.

import { composeNoticeCenter } from "../center";
import { noticeBodyToBlocks, parseNoticeMarkdown, renderableBlocks } from "../markdown";
import { pickPopupNotice, visibleNotices } from "../select";
import type { ProductNotice, RemoteNotice } from "../types";
import { compareVersions, meetsMinAppVersion } from "../version";

const NOW = new Date("2026-08-09T00:00:00.000Z");

function remote(overrides: Partial<RemoteNotice> & Pick<RemoteNotice, "id">): RemoteNotice {
  return {
    kind: "major",
    titleKo: "제목",
    titleEn: "Title",
    bodyKo: "본문",
    bodyEn: "Body",
    publishedAt: "2026-08-01T00:00:00.000Z",
    minAppVersion: null,
    ...overrides,
  };
}

const BUNDLED: readonly ProductNotice[] = [
  {
    id: "patch-1.4.0",
    sortAt: "2026-07-17T00:00:00.000Z",
    kind: "patch",
    eyebrow: { ko: "NEW", en: "NEW" },
    when: { ko: "when", en: "when" },
    listMeta: { ko: "meta", en: "meta" },
    title: { ko: "번들 최신", en: "Bundled latest" },
    body: [],
  },
  {
    id: "patch-1.3.0",
    sortAt: "2026-06-26T00:00:00.000Z",
    kind: "patch",
    eyebrow: { ko: "NEW", en: "NEW" },
    when: { ko: "when", en: "when" },
    listMeta: { ko: "meta", en: "meta" },
    title: { ko: "번들 이전", en: "Bundled older" },
    body: [],
  },
];

function compose(input: {
  remote?: RemoteNotice[];
  read?: string[];
  bundledSeenId?: string | null;
  appVersion?: string | null;
}) {
  return composeNoticeCenter({
    remote: input.remote ?? [],
    remoteReadIds: new Set(input.read ?? []),
    bundled: BUNDLED,
    // Default to "bundled release notes already seen" so the remote rules under
    // test are not masked by the bundled popup.
    bundledSeenId: input.bundledSeenId === undefined ? "patch-1.4.0" : input.bundledSeenId,
    appVersion: input.appVersion === undefined ? "1.5.0" : input.appVersion,
    now: NOW,
  });
}

describe("popup: major only", () => {
  test("an unread major notice opens the popup", () => {
    const state = compose({ remote: [remote({ id: "a", kind: "major" })] });
    expect(state.popupNotice?.id).toBe("a");
  });

  test("an unread MINOR notice never opens the popup", () => {
    const state = compose({ remote: [remote({ id: "a", kind: "minor" })] });
    expect(state.popupNotice).toBeNull();
  });

  test("a minor notice still counts as unread in the badge and the list", () => {
    // This is the exact regression the home gate used to have: it keyed off
    // unreadCount, so a minor notice raising the count would have popped a
    // dialog. Both facts have to hold at once.
    const state = compose({ remote: [remote({ id: "a", kind: "minor" })] });
    expect(state.unreadCount).toBe(1);
    expect(state.unreadIds.has("a")).toBe(true);
    expect(state.popupNotice).toBeNull();
  });

  test("a minor notice does not shadow an older unread major", () => {
    const state = compose({
      remote: [
        remote({ id: "new-minor", kind: "minor", publishedAt: "2026-08-05T00:00:00.000Z" }),
        remote({ id: "old-major", kind: "major", publishedAt: "2026-08-01T00:00:00.000Z" }),
      ],
    });
    expect(state.popupNotice?.id).toBe("old-major");
  });
});

describe("popup: one at a time, newest first", () => {
  test("three unread majors produce exactly one popup, the newest", () => {
    const state = compose({
      remote: [
        remote({ id: "oldest", publishedAt: "2026-08-01T00:00:00.000Z" }),
        remote({ id: "newest", publishedAt: "2026-08-07T00:00:00.000Z" }),
        remote({ id: "middle", publishedAt: "2026-08-04T00:00:00.000Z" }),
      ],
    });
    expect(state.popupNotice?.id).toBe("newest");
    expect(state.unreadCount).toBe(3);
  });

  test("reading the newest promotes the next unread major, not a queue", () => {
    const rows = [
      remote({ id: "newest", publishedAt: "2026-08-07T00:00:00.000Z" }),
      remote({ id: "older", publishedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    expect(compose({ remote: rows, read: ["newest"] }).popupNotice?.id).toBe("older");
  });

  test("once every major is read the popup stays shut", () => {
    const state = compose({
      remote: [remote({ id: "a" }), remote({ id: "b", publishedAt: "2026-08-02T00:00:00.000Z" })],
      read: ["a", "b"],
    });
    expect(state.popupNotice).toBeNull();
    expect(state.unreadCount).toBe(0);
  });

  test("confirming the popup is one-shot: the same state minus the read id yields null", () => {
    // Mirrors what markSeen() does - it adds the id to the read set optimistically.
    const rows = [remote({ id: "only" })];
    expect(compose({ remote: rows }).popupNotice?.id).toBe("only");
    expect(compose({ remote: rows, read: ["only"] }).popupNotice).toBeNull();
  });

  test("ordering is stable when two notices share a timestamp", () => {
    const same = "2026-08-07T00:00:00.000Z";
    const first = compose({
      remote: [remote({ id: "aaa", publishedAt: same }), remote({ id: "bbb", publishedAt: same })],
    });
    const reversed = compose({
      remote: [remote({ id: "bbb", publishedAt: same }), remote({ id: "aaa", publishedAt: same })],
    });
    expect(first.popupNotice?.id).toBe(reversed.popupNotice?.id);
  });
});

describe("popup: publish time", () => {
  test("a future-dated notice is invisible until its timestamp passes", () => {
    const queued = [remote({ id: "queued", publishedAt: "2026-09-01T00:00:00.000Z" })];
    const state = compose({ remote: queued });
    expect(state.popupNotice).toBeNull();
    expect(state.unreadCount).toBe(0);
    expect(state.notices).toHaveLength(BUNDLED.length);
  });

  test("the same notice appears once the clock passes published_at", () => {
    const rows = [remote({ id: "queued", publishedAt: "2026-09-01T00:00:00.000Z" })];
    const later = composeNoticeCenter({
      remote: rows,
      remoteReadIds: new Set(),
      bundled: BUNDLED,
      bundledSeenId: "patch-1.4.0",
      appVersion: "1.5.0",
      now: new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(later.popupNotice?.id).toBe("queued");
  });

  test("an unparseable published_at drops the row rather than guessing", () => {
    expect(visibleNotices([remote({ id: "bad", publishedAt: "not-a-date" })], {
      appVersion: "1.5.0",
      now: NOW,
    })).toEqual([]);
  });
});

describe("min_app_version gate", () => {
  test("null shows to every build", () => {
    expect(meetsMinAppVersion("0.1.0", null)).toBe(true);
  });

  test("a build below the floor does not see a MINOR notice", () => {
    // The original use of the column (docs/OPERATIONS-NOTICES.md N4): a tip
    // about a button this build does not have is only confusing, and a minor
    // notice is by definition not worth confusing anyone over.
    const state = compose({
      remote: [remote({ id: "needs-2", kind: "minor", minAppVersion: "2.0.0" })],
      appVersion: "1.5.0",
    });
    expect(state.popupNotice).toBeNull();
    expect(state.unreadCount).toBe(0);
  });

  test("a build below the floor DOES see a MAJOR notice", () => {
    // A major notice with a floor is a release announcement, and the people who
    // have not updated are the ones who still have to act on it. The dialog
    // shows them the update prompt instead of the feature introduction
    // (src/lib/release/update-notice.ts). Filtering it out here would make that
    // branch unreachable code.
    const state = compose({
      remote: [remote({ id: "announces-2", kind: "major", minAppVersion: "2.0.0" })],
      appVersion: "1.5.0",
    });
    expect(state.popupNotice?.id).toBe("announces-2");
    expect(state.unreadCount).toBe(1);
  });

  test("the floor rides along to the dialog so it can pick the copy", () => {
    const state = compose({
      remote: [remote({ id: "announces-2", kind: "major", minAppVersion: "2.0.0" })],
      appVersion: "1.5.0",
    });
    expect(state.popupNotice?.minAppVersion).toBe("2.0.0");
  });

  test("a build at or above the floor sees it", () => {
    expect(meetsMinAppVersion("2.0.0", "2.0.0")).toBe(true);
    expect(meetsMinAppVersion("2.0.1", "2.0.0")).toBe(true);
    expect(compose({
      remote: [remote({ id: "needs-1", minAppVersion: "1.0.0" })],
      appVersion: "1.5.0",
    }).popupNotice?.id).toBe("needs-1");
  });

  test("segments compare numerically, not lexically", () => {
    // "0.10.0" < "0.9.0" as strings. This is the classic version-gate bug.
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(meetsMinAppVersion("0.10.0", "0.9.0")).toBe(true);
    expect(meetsMinAppVersion("0.9.0", "0.10.0")).toBe(false);
  });

  test("missing segments count as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  test("the gate fails OPEN on an unknown or malformed version", () => {
    // A maintenance notice that fails to reach people is worse than one that
    // reaches a build it does not quite apply to.
    expect(meetsMinAppVersion(null, "2.0.0")).toBe(true);
    expect(meetsMinAppVersion("not-a-version", "2.0.0")).toBe(true);
    expect(meetsMinAppVersion("1.0.0", "garbage")).toBe(true);
    expect(compareVersions("1.0.0", "garbage")).toBeNull();
  });
});

describe("bundled release notes keep working", () => {
  test("an unseen bundled notice still pops when there is no remote major", () => {
    const state = compose({ remote: [], bundledSeenId: null });
    expect(state.popupNotice?.id).toBe("patch-1.4.0");
  });

  test("a remote major outranks the bundled release note", () => {
    const state = compose({ remote: [remote({ id: "incident" })], bundledSeenId: null });
    expect(state.popupNotice?.id).toBe("incident");
    // The bundled one is still unread, it just did not win the single slot.
    expect(state.unreadIds.has("patch-1.4.0")).toBe(true);
    expect(state.unreadCount).toBe(2);
  });

  test("an unread remote MINOR does not stop the bundled popup", () => {
    const state = compose({ remote: [remote({ id: "m", kind: "minor" })], bundledSeenId: null });
    expect(state.popupNotice?.id).toBe("patch-1.4.0");
  });

  test("only the newest bundled notice can be unread", () => {
    const state = compose({ bundledSeenId: "patch-1.4.0" });
    expect(state.unreadIds.has("patch-1.3.0")).toBe(false);
    expect(state.unreadCount).toBe(0);
  });
});

describe("list composition", () => {
  test("remote notices lead the list, bundled release notes follow", () => {
    const state = compose({
      remote: [
        remote({ id: "old", publishedAt: "2026-08-01T00:00:00.000Z" }),
        remote({ id: "new", publishedAt: "2026-08-07T00:00:00.000Z" }),
      ],
    });
    expect(state.notices.map((n) => n.id)).toEqual(["new", "old", "patch-1.4.0", "patch-1.3.0"]);
  });

  test("remoteIds only contains remote rows, so markSeen routes correctly", () => {
    const state = compose({ remote: [remote({ id: "r" })] });
    expect(state.remoteIds.has("r")).toBe(true);
    expect(state.remoteIds.has("patch-1.4.0")).toBe(false);
  });

  test("a kind outside the enum degrades to minor instead of crashing or interrupting", () => {
    // remote.ts drops such rows at the fetch boundary, so this is the second
    // line of defence. The client is untyped and this code runs inside the home
    // shell: an unexpected kind must neither throw (blank screen) nor default
    // to the one kind that is allowed to interrupt.
    const state = compose({
      remote: [{ ...remote({ id: "weird" }), kind: "urgent" as RemoteNotice["kind"] }],
    });
    expect(state.notices[0]?.id).toBe("weird");
    expect(state.notices[0]?.kind).toBe("minor");
    expect(state.popupNotice).toBeNull();
    expect(pickPopupNotice([{ ...remote({ id: "x" }), kind: "minor" }], new Set())).toBeNull();
  });

  test("an empty remote list leaves the bundled list untouched", () => {
    expect(compose({}).notices.map((n) => n.id)).toEqual(["patch-1.4.0", "patch-1.3.0"]);
  });
});

describe("markdown body", () => {
  test("blank-line separated paragraphs become paragraph blocks", () => {
    expect(parseNoticeMarkdown("first line\n\nsecond block")).toEqual([
      { kind: "paragraph", text: "first line" },
      { kind: "paragraph", text: "second block" },
    ]);
  });

  test("consecutive lines join into one paragraph", () => {
    expect(parseNoticeMarkdown("one\ntwo")).toEqual([{ kind: "paragraph", text: "one two" }]);
  });

  test("dash and star lines become bullets with the marker stripped", () => {
    expect(parseNoticeMarkdown("- alpha\n* beta")).toEqual([
      { kind: "bullet", text: "alpha" },
      { kind: "bullet", text: "beta" },
    ]);
  });

  test("a bullet closes an open paragraph instead of merging into it", () => {
    expect(parseNoticeMarkdown("intro\n- item")).toEqual([
      { kind: "paragraph", text: "intro" },
      { kind: "bullet", text: "item" },
    ]);
  });

  test("a leading heading marker is stripped", () => {
    expect(parseNoticeMarkdown("## Title")).toEqual([{ kind: "paragraph", text: "Title" }]);
  });

  test("CRLF bodies parse the same as LF", () => {
    expect(parseNoticeMarkdown("a\r\n\r\n- b")).toEqual(parseNoticeMarkdown("a\n\n- b"));
  });

  test("an empty body yields no blocks rather than one blank block", () => {
    expect(parseNoticeMarkdown("   \n\n  ")).toEqual([]);
  });

  test("ko and en are paired index by index", () => {
    expect(noticeBodyToBlocks("- 하나\n- 둘", "- one\n- two")).toEqual([
      { kind: "bullet", text: { ko: "하나", en: "one" } },
      { kind: "bullet", text: { ko: "둘", en: "two" } },
    ]);
  });

  test("uneven block counts pad rather than truncate the longer language", () => {
    const blocks = noticeBodyToBlocks("- 하나\n- 둘\n- 셋", "- one");
    expect(blocks).toHaveLength(3);
    expect(blocks[2]).toEqual({ kind: "bullet", text: { ko: "셋", en: "" } });
  });

  test("a bullet in either language keeps the block a bullet", () => {
    expect(noticeBodyToBlocks("- 하나", "one").at(0)?.kind).toBe("bullet");
  });
});

// ---------------------------------------------------------------------------
// Review fixes. Each block below pins a defect found reviewing the merged
// feature; the comment names what broke, so a future edit that reintroduces it
// fails with the reason attached.
// ---------------------------------------------------------------------------

describe("the merged list is newest first, not remote-then-bundled", () => {
  // The old order was [...remote, ...bundled], justified by "bundled notices
  // predate any row an operator can insert". That holds only until the NEXT
  // release ships a bundled note newer than an existing remote row - after
  // which /notices showed an older item on top and the home bell, which opens
  // notices[0], offered a stale notice.
  test("a bundled release note newer than a remote row sorts above it", () => {
    const state = compose({ remote: [remote({ id: "r-old", publishedAt: "2026-07-01T00:00:00.000Z" })] });
    expect(state.notices.map((n) => n.id)).toEqual(["patch-1.4.0", "r-old", "patch-1.3.0"]);
  });

  test("a remote row newer than every bundled note still leads", () => {
    const state = compose({ remote: [remote({ id: "r-new", publishedAt: "2026-08-01T00:00:00.000Z" })] });
    expect(state.notices[0]?.id).toBe("r-new");
  });

  test("bundled notes keep their own relative order", () => {
    const state = compose({ remote: [] });
    expect(state.notices.map((n) => n.id)).toEqual(["patch-1.4.0", "patch-1.3.0"]);
  });

  test("ordering is deterministic when two notices share a date", () => {
    const a = compose({ remote: [remote({ id: "aaa" }), remote({ id: "bbb" })] });
    const b = compose({ remote: [remote({ id: "bbb" }), remote({ id: "aaa" })] });
    expect(a.notices.map((n) => n.id)).toEqual(b.notices.map((n) => n.id));
  });
});

describe("a wrong device clock cannot suppress a published notice", () => {
  // RLS decides publication using the SERVER clock, so every row that arrives
  // is already published. Re-checking it against the device clock could only
  // ever HIDE a live notice - the opposite of the original comment's claim.
  test("a phone running two days behind still sees the notice", () => {
    const behind = new Date("2026-08-07T00:00:00.000Z");
    const rows = [remote({ id: "r1", publishedAt: "2026-08-09T00:00:00.000Z" })];
    expect(visibleNotices(rows, { appVersion: "1.5.0", now: behind }).map((n) => n.id)).toEqual(["r1"]);
  });

  test("an absurd future timestamp is still dropped", () => {
    const rows = [remote({ id: "r1", publishedAt: "2030-01-01T00:00:00.000Z" })];
    expect(visibleNotices(rows, { appVersion: "1.5.0", now: NOW })).toEqual([]);
  });

  test("an unparseable timestamp is still dropped", () => {
    const rows = [remote({ id: "r1", publishedAt: "nope" })];
    expect(visibleNotices(rows, { appVersion: "1.5.0", now: NOW })).toEqual([]);
  });
});

describe("no orphan bullet for the language that ran short", () => {
  // noticeBodyToBlocks pads the shorter language with "" so the longer one
  // keeps every block. Rendered as-is that is a bare marker with no text.
  test("the padded block is dropped for the short language only", () => {
    const blocks = noticeBodyToBlocks("- 하나\n- 둘\n- 셋", "- one\n- two");
    expect(renderableBlocks(blocks, true)).toHaveLength(3);
    expect(renderableBlocks(blocks, false)).toHaveLength(2);
  });

  test("whitespace-only text counts as empty", () => {
    const blocks = [{ kind: "paragraph" as const, text: { ko: "본문", en: "   " } }];
    expect(renderableBlocks(blocks, false)).toEqual([]);
  });

  test("a complete pair keeps every block in both languages", () => {
    const blocks = noticeBodyToBlocks("- 하나\n- 둘", "- one\n- two");
    expect(renderableBlocks(blocks, true)).toHaveLength(2);
    expect(renderableBlocks(blocks, false)).toHaveLength(2);
  });
});
