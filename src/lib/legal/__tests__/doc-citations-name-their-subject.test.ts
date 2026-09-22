// 인용이 **가리키는 줄에 그 주제가 실제로 있는가.**
//
// `legal-doc-citations.test.ts` 는 이미 "그 파일이 실재하는가 · 줄 번호가 파일
// 길이를 넘지 않는가" 를 본다. 둘 다 기계로 결정되고 둘 다 통과하는데도, 옆에
// 다른 커밋이 스물네 줄을 밀어 넣으면 인용은 **여전히 초록인 채로 엉뚱한 코드를
// 가리킨다.** 숫자는 유효하고 내용만 틀린 상태다.
//
// ## 실측 (2026-09-21, r52)
//
// 2026-09-20 에 한 회차가 `DeepSpaceDesignScreens.tsx` 의 `+24` 이동을 문서 인용
// 다섯 곳에 적용했다. 넷이 틀렸고, 틀린 방식이 두 가지였다:
//
//   - `FIDELITY_AUDIT.md` 의 `/records`·`/ops` 는 **원래부터** 그 파일을 가리키고
//     있지 않았다. `+24` 는 틀린 좌표를 정확히 스물네 줄 옮겼을 뿐이다. 실제
//     구현은 각각 `dds-wiki-records-screens.tsx` 와 `dds-ops-screen.tsx` 에 있다.
//   - `GEMINI-RETIREMENT-INVENTORY.md` 의 둘은 **원래 맞던** 인용이었다. 그 표는
//     헤더가 `afeb0718` 로 못박은 08-30 스냅샷이라 HEAD 를 따라가면 안 되는데,
//     따라갔다.
//
// 즉 한쪽은 "현재를 가리켜야 하는데 안 가리킨다" 이고 다른 쪽은 "과거를 가리켜야
// 하는데 현재를 따라갔다" 다. **같은 +24 가 두 방향으로 틀렸다.** 그래서 이
// 검사도 두 갈래다.
//
// ## 범위 (넓혀 말하지 않는다)
//
// 이 파일은 저장소의 모든 인용을 보지 않는다. r52 가 실제로 고친 자리와, 같은
// 사고가 다시 나는 경로만 못박는다. 넓은 존재·범위 검사는 위의
// `legal-doc-citations.test.ts` 가 계속 맡는다.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const lines = (rel: string): string[] => read(rel).split("\n");

/** `path/to/file.tsx:12-34` 안에서 첫 인용 하나. 좌표를 **문서에서 읽는다** -
 *  테스트가 제 숫자를 들고 있으면 문서가 밀렸을 때 둘이 같이 틀린다. */
function citation(line: string, mustMatch?: RegExp): { file: string; from: number; to: number } {
  const pattern = /`([A-Za-z0-9_@][A-Za-z0-9_@./()-]*\.tsx?):(\d+)(?:-(\d+))?`/g;
  for (const hit of line.matchAll(pattern)) {
    const [, file, from, to] = hit;
    if (mustMatch && !mustMatch.test(file)) continue;
    return { file, from: Number(from), to: Number(to ?? from) };
  }
  throw new Error(`no citation on: ${line}`);
}

/** `needle` 을 담은 줄의 인덱스. 없으면 던진다 - 앵커가 사라진 채 "위반 0" 으로
 *  통과하는 것이 이 계열 검사의 유일한 실패 방식이다. */
function lineWith(rel: string, needle: string): number {
  const all = lines(rel);
  const at = all.findIndex((line) => line.includes(needle));
  if (at < 0) throw new Error(`${rel} no longer contains: ${needle}`);
  return at;
}

/** 인용이 지목한 줄 범위의 실제 텍스트. */
function slice(cited: { file: string; from: number; to: number }): string {
  const all = lines(cited.file);
  expect(cited.to).toBeLessThanOrEqual(all.length);
  return all.slice(cited.from - 1, cited.to).join("\n");
}

describe("an impl: pointer lands inside the screen it names", () => {
  const AUDIT = "docs/FIDELITY_AUDIT.md";

  /** 제목 아래 첫 `- impl:` 줄. 문서 구조를 따라가므로 절 순서가 바뀌어도 산다. */
  function implLine(heading: string): string {
    const all = lines(AUDIT);
    const start = lineWith(AUDIT, heading);
    for (let i = start + 1; i < Math.min(start + 8, all.length); i += 1) {
      if (all[i].startsWith("- impl: ")) return all[i];
      if (all[i].startsWith("### ")) break;
    }
    throw new Error(`${AUDIT}: no impl: line under ${heading}`);
  }

  test("/records points at DeepSpaceRecordsScreen, not at the privacy screen", () => {
    const body = slice(citation(implLine("### `/records` - PARTIAL")));
    expect(body).toContain("export function DeepSpaceRecordsScreen()");
    // 09-20 이 옮긴 자리에 실제로 있던 것. 다시 그리로 가면 여기서 걸린다.
    expect(body).not.toContain("async function disableEmbedding()");
  });

  test("/ops points at the DeepSpaceOpsScreen a route renders, not at the shadow", () => {
    const cited = citation(implLine("### `/ops` - PARTIAL"));
    // 같은 이름의 사본이 `DeepSpaceDesignScreens.tsx:2731` 에도 있다. 이름만
    // 검색하면 그쪽이 먼저 잡히므로, 라우트가 import 하는 파일을 못박는다.
    expect(cited.file).toBe("src/screens/deepspace/dds-ops-screen.tsx");
    expect(read("src/app/ops.tsx")).toContain(`@/screens/deepspace/dds-ops-screen`);
    const body = slice(cited);
    expect(body).toContain("export function DeepSpaceOpsScreen()");
    expect(body).toContain("recommendationsAllowed(");
    // 09-20 이 옮긴 자리는 self-model 제안부였다.
    expect(body).not.toContain("proposeSelfModelChange(");
  });
});

describe("the DPIA erasure cell still cites the erasure code", () => {
  test("C-DEL's screen citation contains the owner-checked deletion handler", () => {
    const DPIA = "docs/legal/DPIA-2ndB-minors-draft.md";
    const row = lines(DPIA)[lineWith(DPIA, "| **C-DEL** |")];
    const body = slice(citation(row, /DeepSpaceDesignScreens\.tsx$/));
    expect(body).toContain("captureSignOutExpectation()");
    expect(body).toContain("AuthSessionOwnerChangedError");
  });
});

describe("the Gemini inventory is a snapshot, so its coordinates do not follow HEAD", () => {
  const INVENTORY = "docs/GEMINI-RETIREMENT-INVENTORY.md";
  const SCREEN = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
  const PINNED = "afeb0718";

  test("the header names the SHA the table was measured at", () => {
    expect(lines(INVENTORY).slice(0, 40).join("\n")).toContain(PINNED);
  });

  test("every screen citation in the table carries that SHA next to it", () => {
    const marked: string[] = [];
    const bare: string[] = [];
    const OPEN = "`" + SCREEN + ":";
    const MARK = " (" + PINNED + ")";
    lines(INVENTORY).forEach((line, index) => {
      // 정규식 없이 훑는다. 이 표의 셀은 따옴표·말줄임표·파이프가 섞인 산문이라
      // 패턴 한 줄이 셀 경계를 잘못 물기 쉽고, 여기서 알고 싶은 것은 단 하나다 -
      // 닫는 백틱 **바로 뒤**에 그 SHA 가 붙어 있는가.
      for (let at = line.indexOf(OPEN); at >= 0; at = line.indexOf(OPEN, at + 1)) {
        const close = line.indexOf("`", at + 1);
        if (close < 0) break;
        const where = `${INVENTORY}:${index + 1}`;
        (line.slice(close + 1).startsWith(MARK) ? marked : bare).push(where);
        at = close;
      }
    });
    expect(bare).toEqual([]);
    // 정규식이 형태 변화로 아무것도 못 찾으면 위 단언이 공허하게 초록이 된다.
    expect(marked.length).toBeGreaterThanOrEqual(2);
  });

  test("the quoted consent leads really are history, so re-pointing them at HEAD is wrong", () => {
    // 표가 인용한 한국어 리터럴은 지금 파일에 없다. T1 폐기가 벤더 이름을
    // `recommendationVendorLabel()`·`embedVendorLabel()` 로 바꿨기 때문이다.
    // 그러니 이 좌표는 HEAD 의 어떤 줄로도 옮길 수 없다 - 옮길 대상이 없다.
    const screen = read(SCREEN);
    expect(screen).not.toContain("Gemini로 전송돼요");
    expect(screen).not.toContain("Gemini(해외)로 전송됩니다");
    expect(screen).toContain("recommendationVendorLabel()");
    expect(screen).toContain("embedVendorLabel()");
  });
});
