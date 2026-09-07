import fs from "node:fs";
import path from "node:path";

// 캐논 팩이 두 벌 있고, 아무도 둘을 대조하지 않았다.
//
// 앱은 `public/proto/data/screens/*.json` 을 읽고(`src/lib/canon/`),
// 디자인 캐논은 `design/proto_rev2/reference-app/data/screens/*.json` 이다.
// 스물한 파일이 양쪽에 다 있고 **지금은 바이트까지 같다**. 그런데 그것을
// 확인하는 것이 없었다 - `check:canon-data`(validate-data.mjs)는
// reference-app 쪽만 검사한다.
//
// 한쪽만 고치면 **앱이 디자인 캐논과 다른 내용을 배포하면서 아무 신호도 내지
// 않는다.** 화면은 멀쩡히 그려지고 검사는 초록이다. 이 회차가 뮤지엄 한국어
// 오타 일곱 개를 고치면서 **두 파일을 손으로 똑같이 고쳐야 했고**, 한쪽을
// 빠뜨렸다면 아무도 몰랐을 것이다.
//
// 이 검사는 내용을 판정하지 않는다. **두 벌이 같은가**만 본다.
const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "public", "proto", "data", "screens");
const CANON_DIR = path.join(ROOT, "design", "proto_rev2", "reference-app", "data", "screens");

const jsonFiles = (dir: string): string[] =>
  fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort();

const appPacks = jsonFiles(APP_DIR);
const canonPacks = jsonFiles(CANON_DIR);
const shared = appPacks.filter(name => canonPacks.includes(name));

test("스캐너가 실제로 팩을 찾았다 - 0건 통과를 막는다", () => {
  // 목록이 비면 아래 검사가 공짜로 통과한다.
  expect(appPacks.length).toBeGreaterThanOrEqual(15);
  expect(canonPacks.length).toBeGreaterThanOrEqual(15);
  expect(shared.length).toBeGreaterThanOrEqual(15);
  expect(shared).toContain("museum.json");
});

test("두 트리에 같은 파일 집합이 있다", () => {
  // 한쪽에만 있는 파일은 "다르다"의 또 다른 모양이다 - 앱이 캐논에 없는
  // 화면을 싣거나, 캐논이 앱에 없는 화면을 서술한다.
  const onlyInApp = appPacks.filter(name => !canonPacks.includes(name));
  const onlyInCanon = canonPacks.filter(name => !appPacks.includes(name));
  expect({ onlyInApp, onlyInCanon }).toEqual({ onlyInApp: [], onlyInCanon: [] });
});

test("공유 팩이 바이트까지 같다", () => {
  // 바이트로 본다. JSON 파싱 후 비교하면 키 순서·공백·줄끝 차이를 놓치는데,
  // 이건 픽셀 계약이라 그 차이도 차이다.
  const differing = shared
    .map(name => ({
      name,
      app: fs.readFileSync(path.join(APP_DIR, name)),
      canon: fs.readFileSync(path.join(CANON_DIR, name)),
    }))
    .filter(row => !row.app.equals(row.canon))
    .map(row => `${row.name}: app ${row.app.length}B vs canon ${row.canon.length}B`);
  expect(differing).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  test("한 바이트만 달라도 잡는다", () => {
    const original = fs.readFileSync(path.join(APP_DIR, "museum.json"));
    const mutated = Buffer.concat([original, Buffer.from(" ")]);
    expect(original.equals(mutated)).toBe(false);
  });

  test("같은 내용은 통과한다", () => {
    const a = fs.readFileSync(path.join(APP_DIR, "museum.json"));
    const b = fs.readFileSync(path.join(CANON_DIR, "museum.json"));
    expect(a.equals(b)).toBe(true);
  });

  test("이 회차가 고친 오타가 양쪽에서 사라졌다", () => {
    // 일곱 중 화면에 가장 크게 드러나던 것 - 타임라인 노드 제목.
    for (const dir of [APP_DIR, CANON_DIR]) {
      const text = fs.readFileSync(path.join(dir, "museum.json"), "utf8");
      expect(text).not.toContain("AI 반도체 봐");
      expect(text).toContain("AI 반도체 붐");
    }
  });
});
