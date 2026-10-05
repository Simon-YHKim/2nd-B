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
      // es/pt 악센트 복원에서 재고정(2026-10-05, R2B-06). 옛 값 03f9dea2 는 바로 앞 본문이고,
      // 이 편집만 되돌리면 그 값이 그대로 다시 나온다(재고정 전 HEAD 대조). 바뀐 것은 이
      // 슬라이스 안 `DISPLAY_COPY` 의 es · pt 문구 12줄의 철자뿐이다(mas→más · Nao→Não ·
      // voce→você · padroes→padrões 등). 설문 · 저장 · 위기 인계 코드는 한 글자도 안 바뀌었다.
      "bdbb9efc76b0d862c451e3da2105c8f902a7a791d69e565261cebf96721f4189");
    // 이전 값 03f9dea20a3e53570dfacf77677477716f1d05e4c6419937ea7964599abd7ec6:
      // 키보드 영역 이전에서 재고정(2026-10-05). 옛 값 7ad9ed7e 는 바로 앞 본문이고, 이
      // 편집만 되돌리면 그 값이 그대로 다시 나온다(재고정 전 HEAD 대조). 바뀐 것은 설문
      // 두 화면의 `<KeyboardAvoidingView … behavior={Platform.OS === "ios" ? …}>` 여는 ·
      // 닫는 태그를 공용 `<KeyboardAvoidingArea>`(src/lib/ui/keyboard.tsx)로 바꾼 네 줄뿐이다.
      // Android 에서 키보드가 입력을 가리던 것을 고친 것이고, 설문 · 저장 · 위기 인계 코드는
      // 한 줄도 안 바뀌었다.
      // 옛 캐릭터 정리에서 재고정(2026-10-05, Simon 결정 Q-261004-15 A). 옛 값 7ad9ed7e 는
      // 바로 앞 본문이다. 바뀐 것은 주석 두 줄뿐이다(:279 · :368) - 저장 순간에 옛
      // 캐릭터 '모모' 가 나온다고 적혀 있었는데 그 몸 그림이 CompanionSprite 에서 빠져
      // 신호만 남았다. 코드는 한 글자도 안 바뀌었다.
      // 두 재고정이 같은 날 다른 PR(#2055 키보드 · #2056 옛 캐릭터)에서 따로 났고, 03f9dea2 는 둘을 합친 본문의 실측이다.
    // 이전 값 7ad9ed7e8a1fc8feaaa1140cd1ca7aa0f7bb20bab59948da9ea9f34bd0d68bdd:
    //   롤백 레버 제거에서 재고정(2026-10-05, Simon 결정 Q-261004-11 C). 옛 값 13b50e3b 는
    //   바로 앞 본문이다. 이 슬라이스는 레거시 렌더러라는 이름과 달리 배송된다
    //   (`/audit?screener=1`). 바뀐 것은 둘뿐이다: AuditScreenerShell 의 스킨 분기를 접어
    //   DeepSpaceScreen 을 무조건 그리게 했고(레거시 셸 PremiumAppShell 팔 삭제 - 어느
    //   빌드도 그 팔을 타지 않았다), Round 61 주석이 옛 분기 줄을 인용하던 문장을 고쳤다.
    //   설문 · 저장 · 위기 인계 코드는 한 줄도 안 바뀌었다(e0b274d0 과 줄 단위 대조).
    // 이전 값 13b50e3b094749d614ebf295d6b2162357c8ce2697e229029ef6d06c4b063f76:
    //   대시보드 폰 이식에서 재고정(2026-10-02). 옛 값 e131c71f 는 이 이식 직전
    //   본문이고, 이번 편집만 되돌리면 그 값이 그대로 다시 나온다. 바뀐 것은
    //   레거시 설문이 `/audit?screener=1` 로 폰 안에서도 그려지게 한 것뿐이다:
    //   router 를 useAppRouter() 로(의존성 배열 한 줄 포함), Android Back 을
    //   useHardwareBack 으로(src/lib/nav/phone-embed.tsx). 폰 밖 동작과 저장
    //   경로는 그대로다.
    // 이전 값 e131c71f2aa6f53b57c98042b9509894514592433877772d738146313eff11e8:
    // 통합 머지에서 재고정. 옛 값은 5b6bbe71 분기점 본문이고, 그 뒤 main 이
    // #1552(명시적 life audit 입구 복원)00b7#1602(딥스페이스 게이트) 를 얹었다.
    // 병합 결과 슬라이스는 main 과 바이트 동일 2014 위임이 레거시를 안 건드렸다는
    // 이 검사의 뜻은 그대로고 기준선만 옮겼다.
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
