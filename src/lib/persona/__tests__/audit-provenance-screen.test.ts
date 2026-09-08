import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

let queryWork: Promise<QueryResult> = Promise.resolve({ data: [], error: null });
const queryCalls = {
  from: jest.fn(),
  select: jest.fn(),
  eq: jest.fn(),
  like: jest.fn(),
  order: jest.fn(),
};

function queryChain() {
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    queryCalls.select(...args);
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    queryCalls.eq(...args);
    return chain;
  };
  chain.like = (...args: unknown[]) => {
    queryCalls.like(...args);
    return chain;
  };
  chain.order = (...args: unknown[]) => {
    queryCalls.order(...args);
    return chain;
  };
  chain.then = (...args: unknown[]) => queryWork.then(...(args as Parameters<typeof queryWork.then>));
  chain.catch = (...args: unknown[]) => queryWork.catch(...(args as Parameters<typeof queryWork.catch>));
  chain.finally = (...args: unknown[]) => queryWork.finally(...(args as Parameters<typeof queryWork.finally>));
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      queryCalls.from(table);
      return queryChain();
    },
  }),
}));

import {
  buildAuditProvenance,
  loadAuditProvenance,
  normalizeAuditOrigin,
  type AuditProvenanceRow,
} from "../audit-provenance";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (relativePath: string): string =>
  readFileSync(join(ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");

beforeEach(() => {
  queryWork = Promise.resolve({ data: [], error: null });
  for (const spy of Object.values(queryCalls)) spy.mockClear();
});

describe("audit provenance ledger", () => {
  test("keeps only parseTierKey-recognized seven:* rows and aggregates actual latest facts", () => {
    const rows: AuditProvenanceRow[] = [
      {
        star_id: "seven:school",
        level: 2,
        recorded_at: "2026-08-20T00:00:00.000Z",
        evidence_origin: "interview",
        evidence_citations: null,
      },
      {
        // Same visible id in the retired axis system must never join the new star.
        star_id: "school",
        level: 5,
        recorded_at: "2026-08-30T00:00:00.000Z",
        evidence_origin: "ratify",
        evidence_citations: ["record:legacy"],
      },
      {
        star_id: "seven:not-a-star",
        level: 5,
        recorded_at: "2026-08-31T00:00:00.000Z",
        evidence_origin: "ratify",
        evidence_citations: ["record:invalid"],
      },
      {
        star_id: "seven:school",
        level: 4,
        recorded_at: "2026-08-29T12:00:00.000Z",
        evidence_origin: "ratify",
        evidence_citations: ["record:secret-new", "source:secret-new"],
      },
      {
        star_id: "seven:now",
        level: 3,
        recorded_at: "2026-08-28T12:00:00.000Z",
        evidence_origin: "private-arbitrary-origin",
        evidence_citations: null,
      },
    ];

    const result = buildAuditProvenance(rows);
    expect(result).toEqual([
      {
        starId: "school",
        level: 4,
        observations: 2,
        citedObservations: 1,
        citations: 2,
        recordedAt: "2026-08-29T12:00:00.000Z",
        origin: "ratify",
      },
      {
        starId: "now",
        level: 3,
        observations: 1,
        citedObservations: 0,
        citations: 0,
        recordedAt: "2026-08-28T12:00:00.000Z",
        origin: "recorded",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|record:|source:|private-arbitrary-origin/);
  });

  test.each([
    ["ratify", "ratify"],
    ["rebuild", "rebuild"],
    ["interview", "recorded"],
    [null, "recorded"],
    ["private-arbitrary-origin", "recorded"],
  ] as const)("maps origin %p into the closed UI-safe set", (origin, expected) => {
    expect(normalizeAuditOrigin(origin)).toBe(expected);
  });

  test("queries star_tier_history through explicit owner and seven-prefix filters", async () => {
    await expect(loadAuditProvenance("owner-A", 1_000)).resolves.toEqual({ kind: "empty" });

    expect(queryCalls.from).toHaveBeenCalledWith("star_tier_history");
    expect(queryCalls.select).toHaveBeenCalledWith(
      "star_id, level, recorded_at, evidence_origin, evidence_citations",
    );
    expect(queryCalls.eq).toHaveBeenCalledWith("user_id", "owner-A");
    expect(queryCalls.like).toHaveBeenCalledWith("star_id", "seven:%");
    expect(queryCalls.order).toHaveBeenCalledWith("recorded_at", { ascending: true });
  });

  test("separates a Supabase error from a genuinely empty ledger", async () => {
    queryWork = Promise.resolve({ data: null, error: { message: "RLS unavailable" } });
    await expect(loadAuditProvenance("owner-A", 1_000)).resolves.toEqual({ kind: "error" });

    queryWork = Promise.resolve({ data: [], error: null });
    await expect(loadAuditProvenance("owner-A", 1_000)).resolves.toEqual({ kind: "empty" });
  });

  test("separates a stalled read from both error and empty", async () => {
    jest.useFakeTimers();
    try {
      queryWork = new Promise(() => undefined);
      const readResult = loadAuditProvenance("owner-A", 8_000);
      jest.advanceTimersByTime(8_000);
      await expect(readResult).resolves.toEqual({ kind: "timeout" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("deep-space /audit screen contract", () => {
  const app = read("src/app/audit.tsx");
  const screen = read("src/screens/deepspace/dds-audit-screen.tsx");

  test("delegates only the deep branch and leaves the legacy renderer and styles byte-stable", () => {
    expect(app).toContain("<DdsAuditScreen />");
    const legacyStart = app.indexOf("const PERIOD_OPTIONS");
    const legacyEnd = app.indexOf("// Deep-space");
    expect(legacyStart).toBeGreaterThan(-1);
    expect(legacyEnd).toBeGreaterThan(legacyStart);
    const legacyHash = createHash("sha256")
      .update(app.slice(legacyStart, legacyEnd))
      .digest("hex");
    expect(legacyHash).toBe(
      // 통합 머지에서 재고정. 옛 값은 5b6bbe71 분기점 본문이고, 그 뒤 main 이
      // #1552(명시적 life audit 입구 복원)00b7#1602(딥스페이스 게이트) 를 얹었다.
      // 병합 결과 슬라이스는 main 과 바이트 동일 2014 위임이 레거시를 안 건드렸다는
      // 이 검사의 뜻은 그대로고 기준선만 옮겼다.
      "e131c71f2aa6f53b57c98042b9509894514592433877772d738146313eff11e8");
    // 회차 64 재고정. 옛 값 ab0a87ab 는 위임만 얹혔던 상태이고, 그 뒤 레거시
    // 렌더러가 **일부러** 바뀌었다: `/audit?screener=1` 이 스킨과 무관하게 이
    // 설문에 닿는데(:550, 스킨 검사보다 앞선다) 저장의 red 위기 인계를 버리고
    // 있었다. 이 핀의 뜻("위임이 레거시를 건드리지 않는다")은 그대로고,
    // 안전 배선은 위임이 아니라 별개의 변경이다.
  });

  test("keeps auth gates and discards stale user or unmounted reads", () => {
    expect(screen).toMatch(/const \{[^}]*userId[^}]*loading[^}]*hasProfile[^}]*profileProbeFailed[^}]*age[^}]*\} = useAuth\(\)/s);
    expect(screen).toContain('<Redirect href="/sign-in" />');
    expect(screen).toContain('<Redirect href="/complete-profile" />');
    expect(screen).toMatch(/if \(loading\) \{/);
    expect(screen).toMatch(/if \(hasProfile === null\) \{/);
    expect(screen.indexOf("if (loading)"))
      .toBeLessThan(screen.indexOf('if (!userId) return <Redirect href="/sign-in" />'));
    expect(screen.indexOf('if (!userId) return <Redirect href="/sign-in" />'))
      .toBeLessThan(screen.indexOf("if (hasProfile === null)"));
    expect(screen).toMatch(/let active = true;/);
    expect(screen).toMatch(/if \(!active \|\| requestId !== requestIdRef\.current\) return;/);
    expect(screen).toMatch(/return \(\) => \{\s*active = false;/);
  });

  test("uses one expanded star, valid real routes, and no retired ERAS renderer", () => {
    expect(screen).toContain("expandedStarId");
    expect(screen).toContain("current === star.id ? null : star.id");
    expect(screen).toContain('accessibilityState={{ expanded }}');
    expect(screen).toContain('pathname: "/interview"');
    expect(screen).toContain('router.push("/ratifications")');
    expect(screen).toContain('router.push("/brightness")');
    expect(screen).not.toMatch(/13[–-]18|19[–-]28|AUDIT_ERAS|PastMeErasView|vividness|eraTeen|eraYoung/);
  });

  test("uses PIXEL-CLAY primitives with Fabric-safe full-width 44dp controls", () => {
    for (const primitive of ["PixelSurface", "PixelPressable", "PixelGlyph"]) {
      expect(screen).toContain(primitive);
    }
    expect(screen).toContain("fullWidth");
    expect(screen).toContain('accessibilityRole="link"');
    expect(screen).not.toMatch(/<Pressable|MdButton|MdCard|borderRadius|opacity|#[0-9a-f]{3,8}|LinearGradient/i);
  });

  test("shows only citation counts and never renders or logs citation ids or bodies", () => {
    expect(screen).toContain("entry.citedObservations");
    expect(screen).toContain('t("ratifications:cited", { n: entry.citations })');
    expect(screen).not.toMatch(/evidence_citations|console\.(?:log|warn|error)|record:/);
  });

  test("maps every origin through a closed label set instead of rendering database text", () => {
    expect(screen).toContain("normalizeAuditOrigin");
    expect(screen).toContain('case "recorded"');
    expect(screen).not.toMatch(/return origin\s*;/);
  });
});
