// 비서 허브가 자기 도구들을 링크하는가 (Simon 2026-08-18, D7).
//
// ## 이 파일은 한 번 틀린 적이 있다
//
// 처음 쓴 버전은 `screens/deepspace/ops/screens.tsx` 를 읽어서 "허브가 도구를
// 링크한다" 를 확인했다. 통과했다. **그런데 그 파일의 허브(OpsHomeScreen)는
// 어떤 라우트도 렌더하지 않는 고아였다.** `/ops` 는
// `dds-ops-screen.tsx` 의 `DeepSpaceOpsScreen` 을 직접 렌더한다.
//
// 즉 소스에는 있고 화면에는 없는 것을 초록불로 보고했다. 실제 브라우저로 열어
// 보고서야 드러났다.
//
// 그래서 이 파일은 **파일 이름을 고정하지 않는다.** `src/app/ops.tsx` 가 실제로
// 무엇을 렌더하는지 먼저 읽고, 그 컴포넌트가 사는 파일을 검사한다. 라우트가
// 다른 화면을 가리키도록 바뀌면 이 검사도 따라간다.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { GLYPH_ALIAS } from "@/components/pixel/pixel-glyphs";

const mockProbeCalls: unknown[][] = [];
let mockProbeResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };
const mockUsageGetItem = jest.fn<Promise<string | null>, [string]>();

jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const record = (method: string) => (...args: unknown[]) => {
        mockProbeCalls.push([table, method, ...args]);
        return builder;
      };
      for (const method of ["select", "eq", "order", "limit"]) builder[method] = record(method);
      builder.then = (
        resolve: (value: typeof mockProbeResult) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(mockProbeResult).then(resolve, reject);
      return builder;
    },
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockUsageGetItem(key),
    setItem: jest.fn(),
  },
}));

import { loadPickCandidates } from "@/lib/ops/load-picks";
import { readOpsUsage } from "@/lib/ops/usage";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const APP_OPS = readFileSync(join(ROOT, "src", "app", "ops.tsx"), "utf8");
const GIANT = readFileSync(join(ROOT, "src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"), "utf8");
const PIXEL_RULES = readFileSync(join(ROOT, "scripts", "check-pixel-rules.ts"), "utf8");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceSlice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source slice markers missing: ${start} -> ${end}`);
  return source.slice(from, to);
}

/**
 * `/ops` 가 딥스페이스에서 렌더하는 컴포넌트가 사는 파일을 찾는다.
 *
 * 문자열로 파일 경로를 박아 두면 이 검사가 다시 거짓 초록불이 된다.
 */
function hubSourceFile(): string {
  const m = APP_OPS.match(/if\s*\(isDeepSpaceUI\(\)\)\s*return\s*<(\w+)\s*\/>/);
  if (!m) throw new Error("ops.tsx 의 딥스페이스 분기를 못 찾았다 - 구조가 바뀌었으면 이 검사를 고쳐야 한다");
  const component = m[1];
  const imp = APP_OPS.match(new RegExp(`import\\s*\\{[^}]*\\b${component}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`));
  if (!imp) throw new Error(`${component} 의 import 를 못 찾았다`);
  const rel = imp[1].replace(/^@\//, "src/");
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const p = join(ROOT, rel + ext);
    if (existsSync(p)) return p;
  }
  throw new Error(`${rel} 의 실제 파일을 못 찾았다`);
}

const HUB = readFileSync(hubSourceFile(), "utf8");

/** 허브 격자가 열어야 하는 비서 도구. */
const TOOLS = [
  "focus",
  "reminders",
  "imagine",
  "share-card",
  "srs",
  "call-reflection",
  "reading",
  "milestones",
  "ledger",
  "side-project",
  "meals",
] as const;

/** 오늘의 두 가지가 고를 수 있는 후보. 전부 갈 곳이 있어야 한다. */
const PICKS = ["routine", "milestone", "reading", "meals", "records", "esm"] as const;
const PICK_ROUTES = {
  routine: "/reminders",
  milestone: "/milestones",
  reading: "/reading",
  meals: "/meals",
  records: "/records",
  esm: "/esm",
} as const;

describe("비서 허브 ↔ 도구 배선", () => {
  it("검사 대상이 실제로 /ops 가 렌더하는 파일이다", () => {
    // 이 한 줄이 이 파일의 존재 이유다.
    expect(hubSourceFile()).toContain("dds-ops-screen.tsx");
    expect(APP_OPS).not.toContain('from "@/screens/deepspace/DeepSpaceDesignScreens"');
  });

  it.each(TOOLS)("/%s 라우트 파일이 실재한다", (tool) => {
    expect(existsSync(join(ROOT, "src", "app", `${tool}.tsx`))).toBe(true);
  });

  it.each(TOOLS)("허브가 /%s 로 가는 길을 연다", (tool) => {
    expect(HUB).toContain(`route: "/${tool}"`);
  });

  it("오늘의 두 가지가 여섯 후보 전부에 갈 곳을 준다", () => {
    const block = HUB.slice(HUB.indexOf("const OPS_TODAY_ROUTES"));
    const table = block.slice(0, block.indexOf("};"));
    for (const id of PICKS) {
      expect(table).toContain(`${id}:`);
      expect(table).toContain(`${id}: "${PICK_ROUTES[id]}"`);
    }
  });

  it("domain은 정본 route helper를 통하고 전용 route가 없는 것만 추천 대상으로 남긴다", () => {
    const select = sourceSlice(HUB, "function selectDomain", "async function runRecommendation");
    expect(select).toContain("opsRouteForDomain(nextDomain)");
    expect(select).toContain("router.push(route)");
    expect(select.indexOf("setDomain(nextDomain)")).toBeGreaterThan(select.indexOf("if (route)"));
  });

  it("오늘의 두 가지가 실제로 렌더된다", () => {
    // 상태만 두고 그리지 않으면 아무 일도 일어나지 않는다 - 그게 직전 실수였다.
    expect(HUB).toContain("picksData.picks.map");
    expect(HUB).toContain("picksData.suggestions.map");
  });

  it("빈 자리를 예시 데이터로 채우지 않는다", () => {
    // 카드가 아니라 "다음 걸음" 문구를 쓴다. 원본 대시보드 원리보다 한 걸음 더
    // 정직한 쪽 - lib/ops/today-picks.ts 헤더 참조.
    expect(HUB).toContain("today.nothingHint");
    expect(HUB).toContain("today.next.");
  });

  it("아이콘 이름이 실재하는 글리프다", () => {
    // 실제로 flag/wallet/leaf 를 썼다가 빈 아이콘이 될 뻔했다.
    //
    // 원래 이 검사는 소스에서 `CLONE_ICON` **객체의 키를 긁어서** 대조했다.
    // 아이콘이 픽셀 글리프 정본으로 옮겨가면서 그 객체가 이름 배열이 되자
    // 검사가 깨졌다 — 검사가 붙들고 있던 것이 뜻이 아니라 **모양**이었다는 뜻이다.
    // 이제는 소스 모양 대신 `GLYPH_ALIAS` 를 **실제로 import 해서** 본다.
    // 정본이 옮겨 다녀도 따라가고, 대조 대상도 더 정확하다.
    const used = (HUB.match(/icon: "(\w+)"/g) ?? []).map((x) => x.replace(/icon: "|"/g, ""));
    expect(used.length).toBeGreaterThan(0);
    for (const glyph of used) expect(Object.keys(GLYPH_ALIAS)).toContain(glyph);
  });
});

describe("비서 허브 read 계약", () => {
  const now = new Date("2026-08-31T03:00:00.000Z");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  beforeAll(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "ReactNative" },
    });
  });

  afterAll(() => {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
  });

  beforeEach(() => {
    mockProbeCalls.length = 0;
    mockProbeResult = { data: [], error: null };
    mockUsageGetItem.mockReset();
  });

  it("후보 genuine empty와 read error를 strict 모드에서 구분한다", async () => {
    await expect(loadPickCandidates("owner-A", now, { failOnReadError: true })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "routine", hasData: false }),
        expect.objectContaining({ id: "records", hasData: false }),
      ]),
    );

    const readFailure = new Error("candidate_read_failed");
    mockProbeResult = { data: null, error: readFailure };
    await expect(loadPickCandidates("owner-A", now)).resolves.toHaveLength(6);
    await expect(
      loadPickCandidates("owner-A", now, { failOnReadError: true }),
    ).rejects.toBe(readFailure);
  });

  it("후보 query 여섯 개가 모두 explicit owner filter를 쓴다", async () => {
    await loadPickCandidates("owner-A", now, { failOnReadError: true });
    const ownerFilters = mockProbeCalls.filter(
      (call) => call[1] === "eq" && call[2] === "user_id" && call[3] === "owner-A",
    );
    expect(ownerFilters).toHaveLength(6);
  });

  it("native usage 기본 호출은 fail-soft, 허브 strict 호출은 fail-closed다", async () => {
    const readFailure = new Error("usage_read_failed");
    mockUsageGetItem.mockRejectedValue(readFailure);
    await expect(readOpsUsage("owner-A", now)).resolves.toBe(0);
    await expect(readOpsUsage("owner-A", now, { failOnReadError: true })).rejects.toBe(readFailure);

    mockUsageGetItem.mockResolvedValue(JSON.stringify({ day: "2026-08-31", count: 2 }));
    await expect(readOpsUsage("owner-A", now, { failOnReadError: true })).resolves.toBe(2);
    expect(mockUsageGetItem).toHaveBeenLastCalledWith("ops.recs.v1.owner-A");
  });

  it("web localStorage SecurityError도 default=0, strict=error로 구분한다", async () => {
    const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const webGetItem = jest.fn<string | null, [string]>();
    const readFailure = new Error("web_usage_read_failed");
    webGetItem.mockImplementation(() => {
      throw readFailure;
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "Gecko" },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: webGetItem },
    });

    try {
      await expect(readOpsUsage("owner-web", now)).resolves.toBe(0);
      await expect(readOpsUsage("owner-web", now, { failOnReadError: true })).rejects.toBe(readFailure);
      webGetItem.mockReturnValue(JSON.stringify({ day: "2026-08-31", count: 3 }));
      await expect(readOpsUsage("owner-web", now, { failOnReadError: true })).resolves.toBe(3);
      expect(webGetItem).toHaveBeenLastCalledWith("ops.recs.v1.owner-web");
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { product: "ReactNative" },
      });
    }
  });
});

describe("비서 허브 auth·상태·비용 계약", () => {
  it("auth/profile 경계와 explicit-owner read state를 모두 유지한다", () => {
    expect(HUB).toContain("if (authLoading)");
    expect(HUB).toContain('if (!userId) return <Redirect href="/sign-in" />');
    expect(HUB).toContain("if (hasProfile === null)");
    expect(HUB).toContain("if (profileProbeFailed)");
    expect(HUB).toContain('if (hasProfile === false) return <Redirect href="/complete-profile" />');

    expect(HUB).toContain('type ReadState<T> =');
    for (const kind of ["loading", "timeout", "error", "empty", "ready"]) {
      expect(HUB).toContain(`"${kind}"`);
    }
    expect(HUB).toContain('.eq("id", userId)');
    expect(HUB).toContain('readOpsUsage(ownerId, now, { failOnReadError: true })');
    expect(HUB).toContain('loadPickCandidates(ownerId, now, { failOnReadError: true })');
    expect(HUB).toContain("listTodayRoutines(userId, now)");
    expect(HUB).toContain("listCompletionsSince(userId");
  });

  it("timeout과 owner/unmount stale result를 폐기하고 원격 오류 원문을 노출하지 않는다", () => {
    expect(HUB).toContain("withOpsTimeout");
    expect(HUB).toContain("mountedRef.current && ownerRef.current === ownerId");
    expect(HUB).toContain("requestId === readRequestRef.current && isCurrentOwner(ownerId)");
    expect(HUB).toContain("requestId !== runRequestRef.current");
    expect(HUB).not.toMatch(/console\.(?:log|warn|error)/);
    expect(HUB).not.toMatch(/error\.message|String\(error\)/);
  });

  it("LLM은 명시적 CTA 안에서 minor/pref, quota 순으로 gate한 뒤에만 호출된다", () => {
    const run = sourceSlice(HUB, "async function runRecommendation()", "function updateCompletion");
    const gate = run.indexOf("recommendationsAllowed");
    const quota = run.indexOf("ownerUsage.data >= dailyLimit");
    const llm = run.indexOf("recommendForDomain({");
    const bump = run.indexOf("bumpOpsUsage(ownerId)");
    expect(gate).toBeGreaterThan(0);
    expect(quota).toBeGreaterThan(gate);
    expect(llm).toBeGreaterThan(quota);
    expect(bump).toBeGreaterThan(llm);
    expect(run).toContain('setRunState(result.length === 0 ? "empty" : "idle")');
    expect(run).toContain('setRunState("error")');

    const mountEffects = sourceSlice(HUB, "export function DeepSpaceOpsScreen()", "async function runRecommendation()");
    expect(mountEffects).not.toContain("recommendForDomain({");
    expect(mountEffects).not.toContain("bumpOpsUsage(");
  });

  it("prefs/usage read 실패는 추천을 fail closed한다", () => {
    expect(HUB).toContain('ownerPrefs.kind !== "ready" || ownerUsage.kind !== "ready"');
    expect(HUB).toContain("recommendationReadsFailed");
    expect(HUB).toContain("recommendationReadsPending");
  });
});

describe("비서 허브 실제 상태·mutation 계약", () => {
  it("실제 routine/completion/streak/pick만 쓰며 fixture 숫자나 루틴을 만들지 않는다", () => {
    expect(HUB).toContain("listTodayRoutines");
    expect(HUB).toContain("listCompletionsSince");
    expect(HUB).toContain("weekStreak(logs, now)");
    expect(HUB).toContain("todayData.routines.filter");
    expect(HUB).toContain("loadPickCandidates");
    expect(HUB).toContain("pickToday(candidates");
    expect(HUB).not.toMatch(/2\s*\/\s*4|12일|산책|물 마시기|수면 수치/);
  });

  it("completion 실패는 optimistic state를 rollback하고 visible alert를 남긴다", () => {
    const completion = sourceSlice(HUB, "async function completeRoutine", "function reminderNotice");
    expect(completion.indexOf("updateCompletion(ownerId, routine.id, true)")).toBeGreaterThan(0);
    expect(completion.indexOf("updateCompletion(ownerId, routine.id, false)")).toBeGreaterThan(
      completion.indexOf("logRoutineCompletion"),
    );
    expect(completion).toContain('setNotice({ tone: "danger", keys: ["common:errors.unknown"] })');
    expect(HUB).toContain('accessibilityRole={notice.tone === "danger" ? "alert" : undefined}');
    expect(HUB).toContain('accessibilityLiveRegion="polite"');
  });

  it("routine DB 성공을 reminder 결과와 분리해 중복 저장을 유도하지 않는다", () => {
    const save = sourceSlice(HUB, "async function saveRoutine", "async function remindRecommendation");
    const create = save.indexOf("createRoutineFromRecommendation");
    const saved = save.indexOf("setSavedKeys");
    const reminder = save.indexOf("scheduleRoutineReminder");
    expect(create).toBeGreaterThan(0);
    expect(saved).toBeGreaterThan(create);
    expect(reminder).toBeGreaterThan(saved);
    expect(save).toContain("reminderNotice(reminderResult)");
    for (const result of ["scheduled", "denied", "unavailable", "error"]) {
      expect(HUB).toContain(`result === "${result}"`);
    }
  });

  it("calendar/ICS/share는 ops_push disclosure 뒤 explicit action으로만 실행된다", () => {
    const request = sourceSlice(HUB, "function requestPush", "function declinePush");
    const consent = sourceSlice(HUB, "async function agreeAndPush", "const shell");
    expect(request).toContain("ownerPrefs.data.ops_push");
    expect(request).toContain("pendingPushRef.current");
    expect(consent.indexOf("savePrivacyPrefs")).toBeGreaterThan(0);
    expect(consent.indexOf("await pending.run()")).toBeGreaterThan(consent.indexOf("savePrivacyPrefs"));
    expect(consent.indexOf("!persisted")).toBeGreaterThan(consent.indexOf("await pending.run()"));
    expect(consent).toContain("consent:privacy.saveError");

    const effects = sourceSlice(HUB, "export function DeepSpaceOpsScreen()", "async function runRecommendation()");
    for (const mutation of [
      "scheduleRoutineReminder(",
      "addEventToDeviceCalendar(",
      "Linking.openURL(",
      "Share.share(",
      "savePrivacyPrefs(",
    ]) {
      expect(effects).not.toContain(mutation);
    }
  });
});

describe("비서 허브 PIXEL·legacy 회귀", () => {
  it("legacy OpsLegacy/styles와 인접 giant export slice는 byte-stable이다", () => {
    expect(sha256(sourceSlice(APP_OPS, "function OpsLegacy()", "export default function Ops()"))).toBe(
      "deb1e99afaabd226409567a6cc8f0187ecc87867afe69c092d71ac6128bc44c3",
    );
    expect(sha256(sourceSlice(GIANT, "export function DeepSpaceFormatsScreen()", "// Calendar hand-off needs"))).toBe(
      "91845264f43e32deebebde51b9d66688f27377f235293dcfe94bb051cb0b27e5",
    );
    expect(sha256(sourceSlice(GIANT, "// Calendar hand-off needs", "export { DeepSpaceRecordsScreen"))).toBe(
      "b5a344fd247dcb3c1090d84a69fcd1ae9d4b989d68e85b6e10b4d45d23d6081b",
    );
    expect(sha256(sourceSlice(GIANT, "export function DeepSpaceDomainsScreen()", "export function DeepSpaceFocusScreen()"))).toBe(
      "8189880a8a74fa41bc58c7746fde2f65e4a9ba57f3183b5f0fa6b852db6cf0ec",
    );
  });

  it("새 화면은 old giant나 orphan hub를 runtime import하지 않는다", () => {
    expect(APP_OPS).toContain('from "@/screens/deepspace/dds-ops-screen"');
    expect(APP_OPS).not.toContain('from "@/screens/deepspace/DeepSpaceDesignScreens"');
    expect(APP_OPS).not.toContain("OpsHomeScreen");
  });

  it("PixelSurface/PixelPressable, rect ring, FlatList, 44dp, a11y와 reflow를 고정한다", () => {
    expect(HUB).toContain("PixelSurface");
    expect(HUB).toContain("PixelPressable");
    expect(HUB).toContain("ringCells");
    expect(HUB).toContain("<Rect");
    expect(HUB).toContain("<FlatList");
    expect(HUB).toContain("minHeight: m3.minTouch");
    expect(HUB).toContain('accessibilityRole="checkbox"');
    expect(HUB).toContain("accessibilityState={{ checked: done, busy: completing }}");
    expect(HUB).toContain('flexWrap: "wrap"');
    expect(HUB).toContain('width: "48%"');

    const reactNativeImport = HUB.match(/import\s*\{\s*FlatList,[\s\S]*?\}\s*from "react-native";/)?.[0] ?? "";
    expect(reactNativeImport).not.toMatch(/\bPressable\b/);
    expect(HUB).not.toMatch(/borderRadius\s*:|opacity\s*:|#[0-9a-f]{3,8}|LinearGradient/i);
    expect(HUB).not.toContain("style={({");
    expect(PIXEL_RULES).toContain("const RATCHET_BASELINE = 165");
  });
});

describe("고아 허브", () => {
  const ORPHAN = readFileSync(join(__dirname, "..", "screens.tsx"), "utf8");

  it("OpsHomeScreen 이 고아라는 사실이 파일에 적혀 있다", () => {
    // 적어 두지 않으면 다음 사람이 여기를 고치고 화면이 안 바뀌는 이유를 다시
    // 찾게 된다. 실제로 그렇게 한 번 잃었다.
    expect(ORPHAN).toContain("어떤 라우트도 렌더하지 않는다");
    expect(ORPHAN).toContain("DeepSpaceOpsScreen");
  });

  it("어떤 라우트도 OpsHomeScreen 을 렌더하지 않는다", () => {
    // 이 전제가 바뀌면 위 경고가 거짓말이 된다.
    const appDir = join(ROOT, "src", "app");
    const files = require("node:fs")
      .readdirSync(appDir)
      .filter((f: string) => f.endsWith(".tsx"));
    const renders = files.filter((f: string) =>
      /<OpsHomeScreen\s*\/>/.test(readFileSync(join(appDir, f), "utf8")),
    );
    expect(renders).toEqual([]);
  });
});
