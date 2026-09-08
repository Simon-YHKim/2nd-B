// 은퇴시킨 화면들은 아무도 안 보는 곳에 있다 — 그래서 지켜야 한다.
//
// `legacy/` 는 tsconfig · jest · eslint · metro 에서 전부 제외돼 있다. 그게 은퇴의
// 요점이다(빌드 비용을 없앤다). 부작용은 **그 파일들이 어떤 검사도 안 지나간다**는
// 것이고, 2026-09-08 에 세어보니 아카이브 16개를 지키는 검사가 **하나도 없었다**:
//
//   · INDEX.md 에 적혀 있는지    아무도 안 봄
//   · 본문이 은퇴 당시 그대로인지  아무도 안 봄
//   · src/ 가 다시 가져다 쓰는지   아무도 안 봄
//
// 은퇴가 "지운 게 아니라 옮긴 것"이려면 **옮긴 것이 그대로 있어야** 한다. 조용히
// 편집된 아카이브는 지워진 것보다 나쁘다 — 있는 줄 알고 읽었는데 다른 것이 적혀 있다.
//
// ⚠ digest 가 증명하는 것과 아닌 것을 갈라 둔다. 이 표는 **이 검사가 생긴 뒤로
// 아무도 안 고쳤다**를 증명한다. 은퇴 당시 원본과 같다는 것은 증명하지 않는다 —
// 그건 각 은퇴 PR 이 그때 확인한 것이고(여러 건은 바이트 핀이 따라왔다), 여기서
// 소급해 다시 세지는 않는다. 두 주장을 섞으면 없는 보장을 있다고 말하게 된다.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = "legacy/screens";

/**
 * 아카이브별 sha256(LF 정규화). 새 은퇴는 여기 줄을 더해야 통과한다 —
 * 은퇴 PR 이 어차피 INDEX.md 를 건드리므로 같은 자리에서 끝난다.
 */
const DIGESTS: Readonly<Record<string, string>> = {
  "account.tsx": "ba81637a20f73a3555d9c1288a972ae5287626cad05f276a6574612db3eb7963",
  "change-password.tsx": "c41fb5ae92d28cb6cc0ce5659d4250e19bce7310b3629b6939c38dddcd1c45a1",
  "iden.tsx": "55ec2749b1ff18a25b7af58eaa3e2e45279d5016266b3e8f1f1007a09dbb920a",
  "import.tsx": "15cb1bf5bffebbc580d962414b1d8d9d444ba829182b8d74a52442ba306b99ae",
  "index.tsx": "29235e11108a55c45e93542e8ab7341d53b1596cab2f7f9b99d5ac80114e031e",
  "insights.tsx": "5169b58a5186a65ca61c5f272bc7c57b2d7b65a903b35be0bc62d7cb74142600",
  "ops.tsx": "4055307b30362deea0e0725a53378f02de47dcfd5011255df22cfb852822e423",
  "permissions.tsx": "05af2676e4dcdaebcff9192dc49714a660d6006c7c1b41fcf9059c4f074aeae5",
  "plans.tsx": "4a70a2f9c237fe5b1f6249995c199cf7418c4b71141f454e2a52a9108c720975",
  "profile.tsx": "0601f8b8bbabee11450e9984e6c297259e575b603491f29f6ecaec7bc209b7d9",
  "records.tsx": "7ea4e3532fb30c472509f5d1757568755fbdaf201e33a15f01eaecc340a94de0",
  "research.tsx": "6d7aee35e6e1996deab634c3b5934318f70e9ba05aacb72cc14d7de0b0490378",
  "review.tsx": "c866423f9f92cbebe486e0b068bd7a20fbf7e098e77b4c5236ff42730164baf0",
  "sign-up.tsx": "0cd9c772a3ee69e3640da99edace4d41fef78101f69d1d1ce29abaa2c3ed1f85",
  "support.tsx": "838b0f207f9c63610e99f4a3e1ffcd07eed115f14b6dfd85d7c2ad6092deb93a",
  "theme.tsx": "939d41774549f22cf2977ace15cb9bf3c001f0c3ca73a0b2e5257836b8e9e139",
};

const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const archives = fs
  .readdirSync(path.join(ROOT, DIR))
  .filter(name => name.endsWith(".tsx"))
  .sort();

describe("은퇴한 화면들이 옮긴 그대로 있는가", () => {
  test("아카이브를 실제로 찾았다 - 0건 통과를 막는다", () => {
    expect(archives.length).toBeGreaterThanOrEqual(15);
    expect(fs.existsSync(path.join(ROOT, DIR, "INDEX.md"))).toBe(true);
  });

  test("아카이브마다 어디서 왔는지가 적혀 있다", () => {
    // 출처 없는 아카이브는 되살릴 수 없다. 헤더 네 칸이 그 최소치다.
    const missing = archives.flatMap(name => {
      const head = read(`${DIR}/${name}`).slice(0, 2400);
      return ["was:", "why:", "read:", "run:"]
        .filter(field => !head.includes(field))
        .map(field => `${name} -> ${field} 없음`);
    });
    expect(missing).toEqual([]);
  });

  test("INDEX.md 와 실제 파일이 서로를 덮는다", () => {
    const index = read(`${DIR}/INDEX.md`);
    // ⚠ **표 줄**만 센다. 처음엔 파일 이름이 문서 어디에든 있으면 통과시켰는데,
    // 변이 검증에서 잡혔다 — theme.tsx 는 본문 산문에도 한 번 나와서, 표에서
    // 줄을 지워도 초록이었다. 산문이 구조 요건을 대신 채운 것이다.
    // (이 저장소에서 오늘만 세 번째 얼굴이다: 검사가 산문을 증거로 읽는다.)
    const rows = new Set(
      [...index.matchAll(/^\|\s*`([\w.-]+\.tsx)`\s*\|/gm)].map(m => m[1]),
    );
    const unlisted = archives.filter(name => !rows.has(name));
    // 표에만 있고 파일이 없는 줄 = 없는 것을 지키는 척하는 줄
    const ghost = [...rows].filter(name => !archives.includes(name));
    expect({ 표에_없는_파일: unlisted, 파일이_없는_표_줄: ghost }).toEqual({
      표에_없는_파일: [],
      파일이_없는_표_줄: [],
    });
  });

  test("은퇴 뒤로 아무도 아카이브를 고치지 않았다", () => {
    const drifted = archives
      .filter(name => DIGESTS[name] !== undefined)
      .filter(name => sha256(read(`${DIR}/${name}`)) !== DIGESTS[name])
      .map(name => `${name} -> ${sha256(read(`${DIR}/${name}`))}`);
    const unpinned = archives.filter(name => DIGESTS[name] === undefined);

    // 둘은 다른 상태다. 바뀐 것은 "왜 고쳤나"를 묻고, 안 적힌 것은 "줄을 더하라"다.
    expect({ 내용이_바뀐_아카이브: drifted }).toEqual({ 내용이_바뀐_아카이브: [] });
    expect({ 표에_없는_새_아카이브: unpinned }).toEqual({ 표에_없는_새_아카이브: [] });
  });

  test("배송 코드가 아카이브를 다시 가져다 쓰지 않는다", () => {
    // legacy/ 는 빌드 그래프 밖이다. src/ 가 여기서 import 하면 번들이 깨지거나
    // (경로 별칭이 없다) 더 나쁘게는 은퇴가 되돌려진 채로 통과한다.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(rel);
        } else if (/\.tsx?$/.test(entry.name)) {
          const src = read(rel);
          if (/from\s+["'][^"']*legacy\/screens\//.test(src)) offenders.push(rel);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
