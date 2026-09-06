// Integrity contract for the proto_rev2 JSON canon consumed by the app.
// Mirrors design/proto_rev2/tools/validate-data.mjs at the app boundary:
// if a canon edit breaks these invariants, the app-side consumers
// (and the /proto/ live prototype) would misroute or drop screens.

import fs from "fs";
import path from "path";

import {
  canonCanvas,
  canonManifestFiles,
  canonNav,
  canonRoots,
  canonRoutedScreens,
  canonScreens,
  canonStars,
  canonStats,
  canonAppOnlyScreens,
  canonUnroutedScreens,
  getCanonScreen,
} from "../index";
import { devScreens } from "@/lib/dev/screen-index";

const REPO = path.resolve(__dirname, "../../../..");
const APP_DIR = path.join(REPO, "src/app");

/** expo-router route ids under src/app, matching how the canon's `route` field
 *  is written: path relative to src/app, no extension, forward slashes.
 *  `_layout` / `+html` / `+not-found` are router plumbing, not screens. */
function appRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.name.endsWith(".tsx") && !e.name.startsWith("_") && !e.name.startsWith("+")) {
        out.push(path.relative(APP_DIR, p).replace(/\\/g, "/").replace(/\.tsx$/, ""));
      }
    }
  };
  walk(APP_DIR);
  return out.sort();
}

describe("proto_rev2 canon integrity", () => {
  it("keeps the 390x820 pixel-contract canvas", () => {
    expect(canonCanvas).toEqual({ w: 390, h: 820 });
  });

  it("registers every screen id once and keeps the prototype inventory stable", () => {
    // App-only routes can grow without changing the prototype contract. The
    // exact app route set is checked below against src/app, while prototype-only
    // gaps are pinned by name. A duplicated total here added no extra signal.
    const prototypeScreens = canonScreens.filter((screen) => !screen.appOnly);
    expect(prototypeScreens).toHaveLength(57);
    expect(new Set(prototypeScreens.map((screen) => screen.component)).size).toBe(57);
    expect(new Set(canonScreens.map((screen) => screen.id)).size).toBe(canonScreens.length);
  });

  it("uses only known layout kinds, and only where a layout can be known", () => {
    for (const s of canonScreens) {
      if (s.appOnly) {
        // No prototype => no prototype layout. Guessing one from the app's
        // render chain reads as knowledge and is not.
        expect({ id: s.id, layout: s.layout }).toEqual({ id: s.id, layout: undefined });
        continue;
      }
      expect(["immersive", "museumLike", "windowed", "gate"]).toContain(s.layout);
    }
  });

  // NOTE: this only checks the NAME's shape. Whether the component is really
  // exported to `window` by some sb-*.jsx is checked by
  // design/proto_rev2/tools/validate-data.mjs (`npm run check:canon-data`),
  // which reads the prototype sources this test cannot see.
  it("names a window component for every screen the prototype has", () => {
    for (const s of canonScreens) {
      if (s.appOnly) {
        // The app has it, the prototype does not. Naming a component here
        // would be a claim about a symbol that does not exist - which is
        // exactly what `profile` did until 2026-08-19 and why
        // `check:canon-data` could not join `npm run verify`.
        expect(s.component).toBeNull();
        continue;
      }
      expect(s.component).toMatch(/^[A-Z][A-Za-z0-9]*$/);
    }
  });

  it("keeps both gap directions expressible and non-overlapping", () => {
    // route: null   = prototype has it, app does not
    // appOnly: true = app has it, prototype does not
    // A screen cannot be both - that would mean neither side has it.
    for (const s of canonScreens) {
      expect(s.appOnly === true && s.route === null).toBe(false);
    }
    // The prototype count is pinned above. App-only growth is instead guarded
    // by full route coverage, real route modules, unique routes, and title
    // parity with the developer screen registry below.
    expect(canonAppOnlyScreens()).toHaveLength(canonScreens.length - 57);
  });

  it("titles every non-root screen (top app bar contract)", () => {
    for (const s of canonScreens) {
      if (!s.root) expect(typeof s.title).toBe("string");
    }
  });

  it("keeps the 5 nav tabs pointing at root screens, in order", () => {
    const rootIds = canonRoots().map((s) => s.id);
    expect(canonNav.map((t) => t.id)).toEqual(rootIds);
    expect(rootIds).toEqual(["home", "capture", "chat", "records", "settings"]);
  });

  it("routes every constellation star to a registered screen", () => {
    expect(canonStars).toHaveLength(8);
    for (const star of canonStars) {
      expect(getCanonScreen(star.route)).toBeDefined();
    }
  });

  // ── canon ↔ app wiring (added 2026-08-18) ───────────────────────────
  // Before these, the registry described the PROTOTYPE only: `component`
  // resolves to an sb-*.jsx window export, and nothing in it referred to the
  // React Native app. So the suite could be green while the canon and the app
  // said different things about the same screen. `route` closes that.

  it("declares route or null explicitly for every screen", () => {
    for (const s of canonScreens) {
      // `undefined` means someone added a screen and skipped the decision.
      expect(typeof s.route === "string" || s.route === null).toBe(true);
      if (typeof s.route === "string") expect(s.route.length).toBeGreaterThan(0);
    }
  });

  it("points every routed screen at a real route module", () => {
    const missing = canonRoutedScreens()
      .filter((s) => !fs.existsSync(path.join(APP_DIR, `${s.route}.tsx`)))
      .map((s) => `${s.id} -> src/app/${s.route}.tsx`);
    expect(missing).toEqual([]);
  });

  it("maps each app route at most once", () => {
    const routes = canonRoutedScreens().map((s) => s.route);
    expect(routes.length).toBe(new Set(routes).size);
  });

  it("keeps the prototype-only gap visible", () => {
    // These screens exist in the prototype but have no app counterpart. Not a
    // bug — the honest gap. Shrink it by shipping the screen and setting its
    // route; grow it only by adding a prototype screen on purpose.
    expect(canonUnroutedScreens().map((s) => s.id).sort()).toEqual([
      "audit-full",
      "datareview",
      "digest",
      "dobgate",
      "domains",
      "exhibit",
      "healthdata",
      "healthinput",
      "lifeinput",
      "relcontacts",
      "reward",
      "triage",
      "widget",
    ]);
  });

  it("covers every app route", () => {
    const covered = new Set(canonRoutedScreens().map((s) => s.route));
    const uncovered = appRoutes().filter((r) => !covered.has(r)).sort();
    // Adding a screen to src/app without a canon entry lands here. That is
    // allowed — but it must be a decision, so the gap is pinned.
    //
    // 2026-08-19: this pinned a bare COUNT (`toBe(51)`) until now, which could
    // not tell "one route removed, another added" from "nothing changed" —
    // substitution passed silently. That is the same failure the canon route
    // contract (#1242) was built to end, so the count became a list. Register
    // the screen in the canon, or add its name here in the same commit.
    expect(uncovered).toEqual([]);
    // 2026-08-18 this pinned a bare COUNT (51). 2026-08-19 it became a 53-name
    // list, because a count cannot tell "one route removed, another added" from
    // "nothing changed". Now it is empty, which is a stronger contract than
    // either: **the canon knows every route the app has.** Adding a screen to
    // src/app without registering it here fails right here.
  });

  it("exposes the full pack manifest", () => {
    const stats = canonStats();
    expect(stats.packs).toBeGreaterThanOrEqual(31);
    for (const path of Object.values(canonManifestFiles)) {
      expect(path).toMatch(/^data\/.+\.json$/);
    }
    expect(stats.byLayout.immersive).toBe(2);
    expect(stats.byLayout.museumLike).toBe(3);
    // gate added 2026-08-19: the four login-flow screens moved off `windowed`,
    // which had been claiming phone chrome they do not render.
    expect(stats.byLayout.gate).toBe(4);
    // App-only screens deliberately declare no prototype layout, so adding an
    // app route must not change these prototype layout counts.
    expect(stats.byLayout.windowed).toBe(48);
  });
});

// ── canon <-> 개발자 화면 목록 이름 대조 ─────────────────────────
//
// 2026-08-19 에 앱 라우트 53개를 캐논에 등록하면서 **앱 화면 목록이 두 곳에** 생겼다:
// 여기(`screens.json`)와 `src/lib/dev/screen-index.ts`. 같은 목록을 두 곳이 들면
// 갈라진다 — 이번 세션이 고친 것이 전부 그 종류의 문제였다(AGENTS.md 사본,
// 테스트가 들고 있던 SEATS 사본, 캐논과 따로 노는 별자리 선).
//
// 그래서 등록할 때 제목을 **개발자 목록의 라벨에서 그대로 가져왔고**, 이 가드가
// 둘이 계속 같은 이름을 부르는지 본다. 한쪽만 고치면 여기서 깨진다.
//
// 프로토타입 화면(appOnly 아님)은 대상이 아니다 — 그쪽 제목은 프로토타입의 것이고
// 개발자 목록의 라벨과 의도적으로 다르다(루트는 제목이 아예 없다).
describe("canon <-> 개발자 화면 목록", () => {
  it("앱 전용 화면의 이름이 두 곳에서 같다", () => {
    const byRoute = new Map(devScreens().map((d) => [d.file, d.label]));
    const mismatched: string[] = [];
    for (const s of canonAppOnlyScreens()) {
      if (typeof s.route !== "string") continue;
      const label = byRoute.get(s.route);
      if (label === undefined) {
        mismatched.push(`${s.route}: 개발자 목록에 없음`);
        continue;
      }
      if (label !== s.title) mismatched.push(`${s.route}: 캐논 "${s.title}" vs 목록 "${label}"`);
    }
    expect(mismatched).toEqual([]);
  });
});
