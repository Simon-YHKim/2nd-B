// 개발자 화면 목록이 실제 라우트와 어긋나지 않는지 본다.
//
// 이 목록은 손으로 관리한다(RN 은 파일 시스템을 못 읽으니 선택지가 없다).
// 손으로 관리하는 목록은 반드시 낡는다 — 그래서 낡는 순간 CI 가 막게 한다.
// 화면을 추가하고 목록에 안 적으면 실패하고, 목록에 적힌 화면 파일이
// 사라져도 실패한다. 양방향이라야 "빠뜨림"과 "유령 항목" 둘 다 잡는다.
//
// 개수가 아니라 **이름**으로 비교한다. `canon.test.ts` 의 51 핀처럼 개수만
// 세면 하나 지우고 하나 더할 때 조용히 통과한다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { DEV_SCREEN_GROUPS, devScreens, orphanScreens } from "../screen-index";

const APP = join(process.cwd(), "src", "app");

/**
 * `src/lib/canon/__tests__/canon.test.ts` 의 appRoutes() 와 **같은 규칙**이어야
 * 한다. 규칙이 갈리면 두 가드가 서로 다른 앱을 검사하게 된다.
 */
function routeFiles(dir = APP, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("+")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...routeFiles(full, base ? `${base}/${entry.name}` : entry.name));
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    const name = entry.name.replace(/\.tsx$/, "");
    out.push(base ? `${base}/${name}` : name);
  }
  return out;
}

describe("개발자 화면 목록", () => {
  it("앱의 모든 라우트를 정확히 한 번씩 담는다", () => {
    const listed = devScreens().map((s) => s.file).sort();
    const actual = routeFiles().sort();

    const missing = actual.filter((r) => !listed.includes(r));
    const ghost = listed.filter((r) => !actual.includes(r));

    // 실패했을 때 무엇을 고쳐야 하는지 바로 보이게 한다.
    expect({ 목록에서_빠진_화면: missing, 파일이_없는_항목: ghost }).toEqual({
      목록에서_빠진_화면: [],
      파일이_없는_항목: [],
    });
    expect(listed).toEqual(actual);
  });

  it("같은 화면을 두 번 적지 않는다", () => {
    const files = devScreens().map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("모든 항목이 실제 파일을 가리킨다", () => {
    for (const s of devScreens()) {
      expect(existsSync(join(APP, `${s.file}.tsx`))).toBe(true);
    }
  });

  it("href 가 파일 경로가 아니라 실제 URL 이다", () => {
    for (const s of devScreens()) {
      // 그룹 세그먼트는 URL 에 나오지 않는다. `(auth)/sign-in` 을 그대로 밀면 404 다.
      expect(s.href).not.toContain("(");
      // 동적 구간은 견본값으로 채워져 있어야 한다. 패턴을 그대로 밀면
      // 라우터가 리터럴 "[id]" 를 파라미터 값으로 넘긴다.
      expect(s.href).not.toContain("[");
      expect(s.href.startsWith("/")).toBe(true);
    }
  });

  it("동적 라우트는 견본 표시를 달고 있다", () => {
    for (const s of devScreens()) {
      if (s.file.includes("[")) expect(s.sample).toBe(true);
    }
  });

  it("/star 견본이 실재하는 도메인 id 다", () => {
    // 다른 견본은 '없는 데이터' 상태를 보여주는 것이 목적이라 아무 값이나 되지만,
    // 도메인 별은 진짜로 그려지는 것을 봐야 하므로 유효한 id 여야 한다.
    const star = devScreens().find((s) => s.file === "star/[domain]");
    const domains = readFileSync(join(process.cwd(), "src", "lib", "persona", "domain-stars.ts"), "utf8");
    const id = star?.href.split("/").pop() ?? "";
    expect(id.length).toBeGreaterThan(0);
    expect(domains).toContain(`"${id}"`);
  });

  it("dev 표시가 실제 DevOnlyRoute 게이트와 일치한다", () => {
    // 표시가 틀리면 "왜 안 열리지" 를 화면 앞에서 다시 조사하게 된다.
    for (const s of devScreens()) {
      const src = readFileSync(join(APP, `${s.file}.tsx`), "utf8");
      expect({ file: s.file, dev: s.dev === true }).toEqual({
        file: s.file,
        dev: /<DevOnlyRoute>/.test(src),
      });
    }
  });

  it("auth 표시가 실제 로그인 리다이렉트와 일치한다", () => {
    for (const s of devScreens()) {
      const src = readFileSync(join(APP, `${s.file}.tsx`), "utf8");
      expect({ file: s.file, auth: s.auth === true }).toEqual({
        file: s.file,
        auth: /<Redirect href="\/sign-in" \/>/.test(src),
      });
    }
  });

  it("그룹 제목이 비어 있지 않고 중복되지 않는다", () => {
    const titles = DEV_SCREEN_GROUPS.map((g) => g.title);
    expect(titles.every((t) => t.trim().length > 0)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("모든 화면에 한국어 이름이 있다", () => {
    for (const s of devScreens()) expect(s.label.trim().length).toBeGreaterThan(0);
  });

  it("입구 없는 화면을 실제로 짚어낸다", () => {
    // 이 목록이 존재하는 이유 자체다. 0 이 되면 목록의 값어치가 사라진 것이거나
    // 표시를 지운 것이므로, 어느 쪽이든 사람이 봐야 한다.
    expect(orphanScreens().length).toBeGreaterThan(0);
  });
});
