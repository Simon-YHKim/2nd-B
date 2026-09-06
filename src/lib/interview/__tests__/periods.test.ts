// 자리는 **별 일곱으로 고정**이고, 이 파일이 하는 일은 하나다 —
// **아직 살지 않은 자리를 가려낸다.**
//
// ⚠ 2026-08-24 에 역할이 바뀌었다. 예전에는 나이에서 시기 목록 자체를 만들어
// 사람마다 칸 수가 달랐는데(스물다섯 4개·마흔여섯 6개), 별자리는 모양이 있어야
// 하므로 칸은 고정이 됐다. 대신 살지 않은 별은 잠근다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import {
  livedPeriods,
  lockedStars,
  parsePeriodParam,
  resolveInterviewRoutePeriod,
} from "../periods";
import { LIFE_PERIODS, PERIOD_LABEL, seedQuestion, emptyCoverage } from "../probe";
import { SEVEN_STARS, hasInterview, isUnlived } from "../../persona/seven-stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const INTERVIEW_SCREEN = read("src/app/interview.tsx");
const DOMAIN_STAR_SCREEN = read("src/app/star/[domain].tsx");
const DOMAIN_STAR_LENS = read("src/components/deep-space/DomainStarLens.tsx");
const DEEP_SPACE_VIEWS = read("src/components/deep-space/DeepSpaceViews.tsx");

type GrowthRecord = { audit_period: string | null; created_at: string };
type GrowthChapterKeyFn = (record: GrowthRecord) => string;

// Exercise the actual shipped grouping function without importing the RN screen
// and its native Expo dependencies into this pure Jest suite.
function loadGrowthChapterKey(): GrowthChapterKeyFn {
  const start = DOMAIN_STAR_LENS.indexOf("type GrowthChapterKey");
  const end = DOMAIN_STAR_LENS.indexOf("\nfunction localeFromLanguage", start);
  if (start < 0 || end < 0) throw new Error("growth chapter source not found");

  const snippet =
    DOMAIN_STAR_LENS.slice(start, end) + "\nexports.growthChapterKey = growthChapterKey;\n";
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: { growthChapterKey?: GrowthChapterKeyFn } = {};
  new Function("exports", js)(exportsObj);
  if (typeof exportsObj.growthChapterKey !== "function") {
    throw new Error("growthChapterKey did not evaluate to a function");
  }
  return exportsObj.growthChapterKey;
}

const growthChapterKey = loadGrowthChapterKey();

describe("별 일곱이 정본이다", () => {
  it("일곱이다", () => {
    expect(SEVEN_STARS).toHaveLength(7);
  });

  it("Simon 이 정한 순서·이름 그대로", () => {
    expect(SEVEN_STARS.map((s) => s.id)).toEqual([
      "profile", "infancy", "school", "twenties", "later", "work", "now",
    ]);
  });

  it("인터뷰가 없는 별은 프로필 하나뿐", () => {
    const without = SEVEN_STARS.filter((s) => !hasInterview(s.id)).map((s) => s.id);
    expect(without).toEqual(["profile"]);
  });

  it("인터뷰가 있는 여섯이 LIFE_PERIODS 와 정확히 같다", () => {
    // 하나라도 어긋나면 별을 눌렀는데 못 여는 자리가 생긴다.
    const fromStars = SEVEN_STARS.filter((s) => s.period).map((s) => s.period);
    expect(fromStars).toEqual([...LIFE_PERIODS]);
  });

  it("⚠ 나이 경계에 구멍이 없다", () => {
    // Simon 원안은 영유아기(0~6) → 학창시절(7~18) → 20대 라 **19세가 비었다.**
    // 학창시절을 7~19 로 닫았다 — 한국에서 19세는 고3·재수·대학 1학년이다.
    const bands = SEVEN_STARS.map((s) => s.ageBand).filter((b): b is { from: number; to: number | null } => b !== null);
    expect(bands.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < bands.length - 1; i += 1) {
      const cur = bands[i], next = bands[i + 1];
      expect(cur.to).not.toBeNull();
      expect((cur.to as number) + 1).toBe(next.from); // 붙어 있어야 한다
    }
    expect(bands[bands.length - 1].to).toBeNull(); // 마지막은 위로 열려 있다
  });
});

describe("아직 살지 않은 자리를 잠근다", () => {
  it("스물다섯 살에게 30대 이후는 잠긴다", () => {
    expect(isUnlived("later", 25)).toBe(true);
    expect(lockedStars(25)).toEqual(["later"]);
  });

  it("마흔여섯 살은 아무것도 안 잠긴다", () => {
    expect(lockedStars(46)).toEqual([]);
  });

  it("주제 별(직장·지금)은 나이와 무관하게 언제나 열린다", () => {
    for (const age of [14, 25, 46, 80, null]) {
      expect(isUnlived("work", age)).toBe(false);
      expect(isUnlived("now", age)).toBe(false);
    }
  });

  it("나이를 모르면 막지 않는다 (막는 쪽이 더 나쁘다)", () => {
    expect(lockedStars(null)).toEqual([]);
    expect(livedPeriods(null)).toEqual([...LIFE_PERIODS]);
  });

  it("livedPeriods 가 잠긴 자리를 뺀다", () => {
    expect(livedPeriods(25)).toEqual(["infancy", "school", "twenties", "work", "now"]);
    expect(livedPeriods(46)).toEqual([...LIFE_PERIODS]);
  });

  it("열네 살에게도 20대는 잠긴다", () => {
    expect(lockedStars(14).sort()).toEqual(["later", "twenties"]);
  });
});

describe("여섯 자리를 엔진이 전부 감당한다", () => {
  it("ko·en 라벨이 다 있다", () => {
    for (const p of LIFE_PERIODS) {
      for (const loc of ["ko", "en"] as const) {
        expect(typeof PERIOD_LABEL[loc][p]).toBe("string");
        expect(PERIOD_LABEL[loc][p].length).toBeGreaterThan(0);
      }
    }
  });

  it("ko·en 씨앗 질문이 다 있고 전부 질문이다", () => {
    for (const p of LIFE_PERIODS) {
      for (const loc of ["ko", "en"] as const) {
        const q = seedQuestion(p, loc);
        expect(q).toContain("?");
        expect(q.length).toBeGreaterThan(15);
      }
    }
  });

  it("씨앗 질문이 자리마다 서로 다르다", () => {
    for (const loc of ["ko", "en"] as const) {
      const seen = LIFE_PERIODS.map((p) => seedQuestion(p, loc));
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it("Coverage 행렬이 여섯 칸을 갖는다", () => {
    const c = emptyCoverage();
    for (const p of LIFE_PERIODS) expect(c[p]).toBeDefined();
  });
});

describe("옛 링크가 죽지 않는다", () => {
  it.each([
    ["childhood", "infancy"],
    ["teens", "school"],
    ["20s", "twenties"],
    ["thirties", "later"],
    ["forties", "later"],
    ["seventies", "later"],
    ["current", "now"],
  ])("%s → %s", (from, to) => {
    expect(parsePeriodParam(from)).toBe(to);
  });

  it("새 이름은 그대로 통과한다", () => {
    for (const p of LIFE_PERIODS) expect(parsePeriodParam(p)).toBe(p);
  });

  it("모르는 값·빈 값은 '지금' 으로 (누구에게나 열린 자리)", () => {
    expect(parsePeriodParam(undefined)).toBe("now");
    expect(parsePeriodParam("")).toBe("now");
    expect(parsePeriodParam("babyhood")).toBe("now");
    expect(parsePeriodParam(["teens", "20s"])).toBe("school");
  });
});

describe("인터뷰 라우트는 시기를 조용히 지어내지 않는다", () => {
  it.each([undefined, "", [] as string[]])("누락된 값 %p은 재선택으로 보낸다", (raw) => {
    expect(resolveInterviewRoutePeriod(raw, 25)).toEqual({ kind: "missing" });
  });

  it.each(["babyhood", " ", ["babyhood", "now"]])("모르는 값 %p은 오류로 남긴다", (raw) => {
    expect(resolveInterviewRoutePeriod(raw, 25)).toEqual({ kind: "invalid" });
  });

  it("새 이름과 옛 링크를 같은 정본 시기로 해석한다", () => {
    expect(resolveInterviewRoutePeriod("school", 25)).toEqual({ kind: "ok", period: "school" });
    expect(resolveInterviewRoutePeriod("teens", 25)).toEqual({ kind: "ok", period: "school" });
    expect(resolveInterviewRoutePeriod(["20s", "now"], 25)).toEqual({
      kind: "ok",
      period: "twenties",
    });
  });

  it("직접 URL로 아직 살지 않은 시기를 열 수 없다", () => {
    expect(resolveInterviewRoutePeriod("later", 25)).toEqual({ kind: "locked", period: "later" });
    expect(resolveInterviewRoutePeriod("20s", 14)).toEqual({
      kind: "locked",
      period: "twenties",
    });
  });

  it("직장·지금은 나이와 무관하고, 나이를 모르면 기존 정책대로 막지 않는다", () => {
    for (const age of [14, 25, 80, null]) {
      expect(resolveInterviewRoutePeriod("work", age)).toEqual({ kind: "ok", period: "work" });
      expect(resolveInterviewRoutePeriod("now", age)).toEqual({ kind: "ok", period: "now" });
    }
    expect(resolveInterviewRoutePeriod("later", null)).toEqual({ kind: "ok", period: "later" });
  });
});

describe("인터뷰 화면이 엄격한 라우트 계약을 지킨다", () => {
  it("인증·프로필 판정을 끝낸 뒤에만 시기를 해석한다", () => {
    const loadingGate = INTERVIEW_SCREEN.indexOf("if (loading)");
    const signedOutGate = INTERVIEW_SCREEN.indexOf("if (!userId)");
    const probeFailureGate = INTERVIEW_SCREEN.indexOf("if (profileProbeFailed");
    const missingProfileGate = INTERVIEW_SCREEN.indexOf('if (hasProfile === false)');
    const resolver = INTERVIEW_SCREEN.indexOf("resolveInterviewRoutePeriod(periodParam, age)");

    expect(loadingGate).toBeGreaterThanOrEqual(0);
    expect(signedOutGate).toBeGreaterThan(loadingGate);
    expect(probeFailureGate).toBeGreaterThan(signedOutGate);
    expect(missingProfileGate).toBeGreaterThan(probeFailureGate);
    expect(resolver).toBeGreaterThan(missingProfileGate);
  });

  it("실패한 프로필 프로브는 로더에 고정하지 않고 다시 확인한다", () => {
    expect(INTERVIEW_SCREEN).toContain("hasProfile !== false || !profileProbeFailed");
    expect(INTERVIEW_SCREEN).toContain("void refresh()");
    expect(INTERVIEW_SCREEN).toContain("PROFILE_RETRY_INITIAL_MS = 2_000");
    expect(INTERVIEW_SCREEN).toContain("PROFILE_RETRY_MAX_MS = 30_000");
    expect(INTERVIEW_SCREEN).toContain("retryDelayMs = Math.min(retryDelayMs * 2");
    expect(INTERVIEW_SCREEN).toContain("active = false");
    expect(INTERVIEW_SCREEN).toContain("clearTimeout(timer)");
  });

  it("누락·오류·잠금·정상 시기를 서로 다른 화면 상태로 유지한다", () => {
    expect(INTERVIEW_SCREEN).toContain("PastMeErasView");
    expect(INTERVIEW_SCREEN).toContain('resolution.kind === "locked"');
    expect(INTERVIEW_SCREEN).toContain('homeT("ds.star.lockedBody")');
    expect(INTERVIEW_SCREEN).toContain(
      'key={`${resolution.period}:${growthOrigin ? "domain-growth" : "default"}`}',
    );
    expect(INTERVIEW_SCREEN).toContain("period={resolution.period}");
    expect(INTERVIEW_SCREEN).toContain("growthOrigin={growthOrigin}");
  });

  it("담은 인터뷰는 해당 별 요약으로 돌아간다", () => {
    expect(INTERVIEW_SCREEN).toContain('router.replace(`/me/${period}`)');
    expect(INTERVIEW_SCREEN).not.toContain('router.replace("/big-five")');
  });

  it("성장별 회상 출처를 선택·저장·복귀까지 보존한다", () => {
    expect(DOMAIN_STAR_SCREEN).toContain('route: "/audit?origin=domain-growth"');
    expect(DOMAIN_STAR_SCREEN).toContain('.select("id, topic, body, created_at, audit_period")');
    expect(DOMAIN_STAR_LENS).toContain('router.push("/audit?origin=domain-growth")');
    expect(DEEP_SPACE_VIEWS).toContain("useLocalSearchParams<{ origin?: string | string[] }>()");
    expect(DEEP_SPACE_VIEWS).toContain('{ period: star.period ?? "now", origin: "domain-growth" }');
    expect(INTERVIEW_SCREEN).toContain('domainIntent: growthOrigin ? "growth" : undefined');
    expect(INTERVIEW_SCREEN).toContain('router.replace("/star/growth")');
    expect(INTERVIEW_SCREEN).not.toContain('"domain:growth"');
  });

  it("성장 렌즈는 audit_period를 먼저 쓰고 작성 연도는 fallback으로만 쓴다", () => {
    expect(DOMAIN_STAR_LENS).toContain("audit_period: string | null;");

    const record = (audit_period: string | null, created_at: string): GrowthRecord => ({
      audit_period,
      created_at,
    });

    expect(growthChapterKey(record("school", "2026-09-01T00:00:00Z"))).toBe("period:school");
    expect(growthChapterKey(record("20s", "2026-09-01T00:00:00Z"))).toBe("period:twenties");
    expect(growthChapterKey(record("current", "1998-01-01T00:00:00Z"))).toBe("period:now");
    expect(growthChapterKey(record(null, "1998-01-01T00:00:00Z"))).toBe("decade:1990");
    expect(growthChapterKey(record("unknown", "1981-01-01T00:00:00Z"))).toBe("decade:1980");
    expect(growthChapterKey(record(null, "not-a-date"))).toBe("undated");
  });
});
