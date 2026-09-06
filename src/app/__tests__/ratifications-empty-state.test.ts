import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { addressTerm } from "@/lib/persona/address";
import { buildRatificationLog, ratificationEmptyState } from "@/lib/persona/brightness-timeline";
import {
  loadTierObservations,
  loadTierObservationsResult,
} from "@/lib/persona/load-tier-observations";
import {
  beginRatificationRead,
  canPublishRatificationRead,
  filterRatificationEntries,
  finishRatificationRead,
  initialRatificationReadState,
  loadRatificationsForGate,
  ratificationAuthGate,
  ratificationOriginKey,
  ratificationSummary,
  ratificationTimeLabel,
} from "@/lib/persona/ratification-screen";
import { starNameKey } from "@/lib/persona/star-name";
import type { TierObservation } from "@/lib/persona/tier-history";

type QueryResponse = { data: TierObservation[] | null; error: unknown };

let mockQueryResult: PromiseLike<QueryResponse>;
const mockOrder = jest.fn(() => mockQueryResult);
const mockEq = jest.fn(() => ({ order: mockOrder }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

const OBSERVATIONS: TierObservation[] = [
  {
    star_id: "seven:school",
    level: 2,
    recorded_at: "2026-08-01T00:00:00.000Z",
    evidence_origin: "ratify",
    evidence_citations: ["record:one"],
  },
  {
    star_id: "seven:school",
    level: 2,
    recorded_at: "2026-08-02T00:00:00.000Z",
    evidence_origin: "rebuild",
    evidence_citations: [],
  },
  {
    star_id: "now",
    level: 3,
    recorded_at: "2026-08-03T00:00:00.000Z",
    evidence_origin: null,
    evidence_citations: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryResult = Promise.resolve({ data: [], error: null });
});

describe("strict tier-observation reader", () => {
  test("keeps ready-empty separate from failures and scopes the select to the owner", async () => {
    await expect(loadTierObservationsResult("owner-a", { timeoutMs: 100 })).resolves.toEqual({
      status: "ready",
      observations: [],
    });

    expect(mockFrom).toHaveBeenCalledWith("star_tier_history");
    expect(mockSelect).toHaveBeenCalledWith(
      "star_id, level, recorded_at, evidence_origin, evidence_citations",
    );
    expect(mockEq).toHaveBeenCalledWith("user_id", "owner-a");
    expect(mockOrder).toHaveBeenCalledWith("recorded_at", { ascending: true });
  });

  test("returned Supabase errors are explicit while the legacy API remains fail-soft", async () => {
    mockQueryResult = Promise.resolve({
      data: OBSERVATIONS,
      error: { message: "private database detail" },
    });

    await expect(loadTierObservationsResult("owner-a", { timeoutMs: 100 })).resolves.toEqual({
      status: "error",
    });
    await expect(loadTierObservations("owner-a")).resolves.toEqual([]);
  });

  test("thrown errors are explicit while the legacy API remains fail-soft", async () => {
    mockQueryResult = Promise.reject(new Error("private thrown detail"));

    await expect(loadTierObservationsResult("owner-a", { timeoutMs: 100 })).resolves.toEqual({
      status: "error",
    });
    await expect(loadTierObservations("owner-a")).resolves.toEqual([]);
  });

  test("synchronous query-builder errors also settle and keep the legacy API fail-soft", async () => {
    mockFrom
      .mockImplementationOnce(() => {
        throw new Error("private synchronous detail");
      })
      .mockImplementationOnce(() => {
        throw new Error("private synchronous detail");
      });

    await expect(loadTierObservationsResult("owner-a", { timeoutMs: 100 })).resolves.toEqual({
      status: "error",
    });
    await expect(loadTierObservations("owner-a")).resolves.toEqual([]);
  });

  test("timeout is distinct and a later rejection is consumed", async () => {
    jest.useFakeTimers();
    let rejectLate: (reason?: unknown) => void = () => {};
    try {
      mockQueryResult = new Promise<QueryResponse>((_resolve, reject) => {
        rejectLate = reject;
      });
      const result = loadTierObservationsResult("owner-a", { timeoutMs: 25 });
      jest.advanceTimersByTime(25);
      await expect(result).resolves.toEqual({ status: "timeout" });

      rejectLate(new Error("late private detail"));
      await Promise.resolve();
    } finally {
      jest.useRealTimers();
    }
  });

  test("strict results never carry a raw error object", async () => {
    mockQueryResult = Promise.resolve({ data: null, error: new Error("secret") });
    const result = await loadTierObservationsResult("owner-a", { timeoutMs: 100 });
    expect(result).toEqual({ status: "error" });
    expect("error" in result).toBe(false);
  });
});

describe("auth/profile gate and owner tickets", () => {
  test.each([
    [{ loading: true, userId: null, hasProfile: null, profileProbeFailed: false }, "auth-loading"],
    [{ loading: false, userId: null, hasProfile: null, profileProbeFailed: false }, "signed-out"],
    [
      { loading: false, userId: "a", hasProfile: null, profileProbeFailed: false },
      "profile-loading",
    ],
    [{ loading: false, userId: "a", hasProfile: false, profileProbeFailed: true }, "profile-error"],
    [
      { loading: false, userId: "a", hasProfile: false, profileProbeFailed: false },
      "profile-incomplete",
    ],
    [{ loading: false, userId: "a", hasProfile: true, profileProbeFailed: false }, "ready"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(ratificationAuthGate(input)).toBe(expected);
  });

  test("all non-ready gates issue zero ledger queries; ready issues exactly one", async () => {
    const read = jest.fn(async () => ({
      status: "ready" as const,
      observations: [] as TierObservation[],
    }));
    const blocked = [
      "auth-loading",
      "signed-out",
      "profile-loading",
      "profile-error",
      "profile-incomplete",
    ] as const;

    for (const gate of blocked) {
      await expect(
        loadRatificationsForGate(gate, gate === "signed-out" ? null : "owner-a", read),
      ).resolves.toBeNull();
    }
    expect(read).not.toHaveBeenCalled();

    await expect(loadRatificationsForGate("ready", "owner-a", read)).resolves.toEqual({
      status: "ready",
      observations: [],
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("owner-a");
  });

  test("same-owner retry preserves the last successful history until it settles", () => {
    const firstTicket = { ownerId: "owner-a", requestId: 1 };
    const loading = beginRatificationRead(initialRatificationReadState, firstTicket);
    const ready = finishRatificationRead(loading, firstTicket, {
      status: "ready",
      observations: OBSERVATIONS,
    });
    const retryTicket = { ownerId: "owner-a", requestId: 2 };
    const retrying = beginRatificationRead(ready, retryTicket);

    expect(retrying.status).toBe("loading");
    expect(retrying.entries).toEqual(buildRatificationLog(OBSERVATIONS));
    expect(finishRatificationRead(retrying, retryTicket, { status: "error" }).entries).toEqual(
      buildRatificationLog(OBSERVATIONS),
    );
  });

  test("new owners never inherit the prior owner's first paint", () => {
    const aTicket = { ownerId: "owner-a", requestId: 1 };
    const aReady = finishRatificationRead(
      beginRatificationRead(initialRatificationReadState, aTicket),
      aTicket,
      { status: "ready", observations: OBSERVATIONS },
    );
    const bTicket = { ownerId: "owner-b", requestId: 2 };
    const bLoading = beginRatificationRead(aReady, bTicket);

    expect(bLoading.ownerId).toBe("owner-b");
    expect(bLoading.entries).toBeNull();
  });

  test("A to B, signed-out, superseded ticket, and unmount all reject stale publication", () => {
    const ticket = { ownerId: "owner-a", requestId: 4 };
    expect(canPublishRatificationRead(ticket, "owner-a", 4, true)).toBe(true);
    expect(canPublishRatificationRead(ticket, "owner-b", 4, true)).toBe(false);
    expect(canPublishRatificationRead(ticket, null, 4, true)).toBe(false);
    expect(canPublishRatificationRead(ticket, "owner-a", 5, true)).toBe(false);
    expect(canPublishRatificationRead(ticket, "owner-a", 4, false)).toBe(false);
  });
});

describe("accepted-ledger projection", () => {
  test("keeps the stable chronological fold, newest-first output, first null, and unchanged echo", () => {
    const log = buildRatificationLog([OBSERVATIONS[2]!, OBSERVATIONS[1]!, OBSERVATIONS[0]!]);
    expect(log.map((entry) => entry.recordedAt)).toEqual([
      "2026-08-03T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    ]);
    expect(log[2]!.prevLevel).toBeNull();
    expect(log[1]!.prevLevel).toBe(2);
    expect(log[1]!.level).toBe(2);
  });

  test("ratified count and rows are exactly the persisted observations; unsupported decisions are zero", () => {
    const log = buildRatificationLog(OBSERVATIONS);
    expect(ratificationSummary(log)).toEqual({
      proposed: 3,
      ratified: 3,
      held: 0,
      declined: 0,
    });
    expect(filterRatificationEntries(log, "all", true)).toHaveLength(3);
    expect(filterRatificationEntries(log, "ratified", true)).toHaveLength(3);
    expect(filterRatificationEntries(log, "held", true)).toEqual([]);
    expect(filterRatificationEntries(log, "declined", true)).toEqual([]);
    expect(filterRatificationEntries(log, "all", false)).toHaveLength(2);
  });

  test("truly empty and filtered-empty remain honest", () => {
    expect(ratificationEmptyState(0, 0)).toBe("none");
    expect(ratificationEmptyState(5, 0)).toBe("filtered");
    expect(ratificationEmptyState(5, 3)).toBeNull();
    for (let all = 1; all <= 20; all += 1) {
      for (let visible = 0; visible <= all; visible += 1) {
        expect(ratificationEmptyState(all, visible)).not.toBe("none");
      }
    }
  });
});

describe("safe labels and locale time", () => {
  test("known old/seven stars use 5-locale keys and unknown ids have no raw-name key", () => {
    expect(starNameKey("now")).toBe("ds.home.starName.now");
    expect(starNameKey("seven:school")).toBe("ds.star.school");
    expect(starNameKey("private-star-id")).toBeNull();

    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const homeJson = JSON.parse(
        readFileSync(resolve(__dirname, `../../../locales/${locale}/home.json`), "utf8"),
      ) as { ds: { star: { school: string }; home: { starName: { now: string } } } };
      const communityJson = JSON.parse(
        readFileSync(resolve(__dirname, `../../../locales/${locale}/community.json`), "utf8"),
      ) as { unknownSender: string };
      expect(homeJson.ds.star.school).toBeTruthy();
      expect(homeJson.ds.home.starName.now).toBeTruthy();
      expect(communityJson.unknownSender).toBeTruthy();
    }
  });

  test("origin uses an allowlist and never returns an internal origin", () => {
    expect(ratificationOriginKey("ratify")).toBe("originRatify");
    expect(ratificationOriginKey("rebuild")).toBe("originRebuild");
    expect(ratificationOriginKey(null)).toBe("originRecorded");
    expect(ratificationOriginKey("private-internal-origin")).toBe("originRecorded");
  });

  test("relative labels use locale keys, old dates use Intl, and malformed timestamps are hidden", () => {
    const tx = (key: string, options?: { count?: number }) => `${key}:${options?.count ?? ""}`;
    const now = Date.parse("2026-08-31T12:00:00.000Z");
    expect(ratificationTimeLabel("2026-08-31T11:55:00.000Z", now, "ko", tx)).toBe(
      "deepspace:time.minsAgo:5",
    );
    expect(ratificationTimeLabel("2026-08-31T08:00:00.000Z", now, "en", tx)).toBe(
      "deepspace:time.hoursAgo:4",
    );
    expect(ratificationTimeLabel("2026-08-29T12:00:00.000Z", now, "es", tx)).toBe(
      "deepspace:time.daysAgo:2",
    );
    expect(ratificationTimeLabel("2026-01-02T00:00:00.000Z", now, "ko", tx)).toBe(
      new Intl.DateTimeFormat("ko", { year: "numeric", month: "short", day: "numeric" }).format(
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    );
    expect(ratificationTimeLabel("private malformed timestamp", now, "ko", tx)).toBeNull();
  });

  test("KO subtitle has a synchronous address fallback and cannot expose {{who}}", () => {
    const ko = JSON.parse(
      readFileSync(resolve(__dirname, "../../../locales/ko/ratifications.json"), "utf8"),
    ) as { subtitle: string };
    const rendered = ko.subtitle.replace("{{who}}", addressTerm(null, "ko"));
    expect(rendered).toContain("당신이");
    expect(rendered).not.toContain("{{who}}");
  });
});

describe("/ratifications screen source contract", () => {
  const source = readFileSync(resolve(__dirname, "../ratifications.tsx"), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  test("gates auth/profile before the one strict read and routes only genuine states", () => {
    expect(code).toContain("ratificationAuthGate");
    expect(code).toContain("loadRatificationsForGate");
    expect(code).toContain('<Redirect href="/sign-in" />');
    expect(code).toContain('<Redirect href="/complete-profile" />');
    expect(code).toContain("profileProbeFailed");
    expect(code).toContain("canPublishRatificationRead");
  });

  test("the display-name and ledger reads live only in the ready owner-keyed child", () => {
    const readyStart = code.indexOf("function RatificationsReady");
    const outerStart = code.indexOf("export default function RatificationLogScreen");
    expect(readyStart).toBeGreaterThanOrEqual(0);
    expect(outerStart).toBeGreaterThan(readyStart);

    const readyChild = code.slice(readyStart, outerStart);
    const gateOwner = code.slice(outerStart);
    expect(readyChild).toContain("useAddressTerm(ownerId, i18n.language)");
    expect(readyChild).toContain('loadRatificationsForGate("ready", ownerId)');
    expect(gateOwner).not.toContain("useAddressTerm(");
    expect(gateOwner).not.toContain("loadRatificationsForGate(");
    expect(gateOwner).toContain("<RatificationsReady key={userId!} ownerId={userId!} />");
  });

  test("filter/toggle are local and only explicit retry changes the read epoch", () => {
    expect(code).toContain("setFilter");
    expect(code).toContain("setShowUnchanged");
    expect(code).toContain("setRetryEpoch");
    expect(code).not.toMatch(/\[(?:[^\]]*filter|[^\]]*showUnchanged)[^\]]*\]\s*\)/);
  });

  test("unknown ids/origins and KO address placeholders cannot leak", () => {
    expect(code).toContain('t("community:unknownSender")');
    expect(code).toContain("ratificationOriginKey");
    expect(code).toContain("useAddressTerm");
    expect(code).toContain("addressTerm(null, i18n.language)");
    expect(code).not.toContain("currentDisplayName");
    expect(code).not.toMatch(/return\s+starId\b/);
    expect(code).not.toMatch(/return\s+origin\b/);
  });

  test("is read-only: no writes, LLM, analytics, expression, or raw evidence body", () => {
    expect(code).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
    expect(code).not.toMatch(
      /callLlm|captureEvent|analytics|setExpression|evidence_citations\s*\[/,
    );
    expect(code).toContain("entry.citedCount");
  });

  test("only genuine empty owns the one Polaris CTA", () => {
    expect(code).toContain('ratificationEmptyState(all.length, visible.length) === "none"');
    expect(code.match(/["']\/core-brain["']/g)).toHaveLength(1);
  });

  test("uses PIXEL-CLAY primitives, a virtualized list, 44dp press targets, and 320dp reflow", () => {
    expect(code).toContain("PixelSurface");
    expect(code).toContain("PixelPressable");
    expect(code).toContain("PixelGlyph");
    expect(code).toContain("FlatList");
    expect(code).toContain("flexWrap");
    expect(code).toContain("flexBasis");
    expect(code).toContain("accessibilityState={{ selected:");
    expect(code).not.toMatch(/MdCard|MdChip|MdButton|PremiumLoadingState|<Svg|<Path/);
    expect(code).not.toMatch(/opacity\s*:|shadowRadius\s*:\s*[1-9]|borderRadius\s*:\s*[1-9]/);
  });
});
