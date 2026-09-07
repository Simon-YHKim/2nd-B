import fs from "node:fs";
import path from "node:path";

// 법무 문서가 코드를 인용하는데, 그 인용이 아직 그 코드를 가리키는지 아무도 안 봤다.
//
// DPIA 초안은 자기 계약을 이렇게 적는다 - "asserts SYSTEM BEHAVIOUR (cited to
// source code at `file:line`), NOT law". 즉 그 문서의 값어치는 **인용이 맞다는
// 것**에 서 있다. 그런데 기준일(2026-06-14) 이후 main 이 1,792 커밋 움직이는 동안
// 그걸 검사하는 것이 없었고, 실측하니 **16건이 존재하지 않는 파일**을 가리키고
// 있었다: `src/lib/llm/gemini.ts` 는 `boundary.ts` 로 개명됐고(#1229), 네 경로는
// 디렉터리 접두사가 잘려 있었다.
//
// 그 문서를 읽는 사람은 변호사다. 없는 파일을 가리키는 인용은 "확인 못 했다"가
// 아니라 **"확인했더니 없더라"** 로 읽힌다 - 있는 기능을 없다고 판단하게 만든다.
//
// 이 검사는 산문을 판정하지 않는다. **인용이 가리키는 파일이 실재하는지**와
// **줄 번호가 파일 길이를 넘지 않는지**만 본다. 둘 다 기계로 결정된다.
const LEGAL_DIR = path.join(process.cwd(), "docs", "legal");

/** `path/to/file.ts` · `path/to/file.ts:12` · `:12-34` · `:12,34` */
const CITATION = /`([A-Za-z0-9_@./-]+\.(?:tsx?|sql|json|jsx?|md|ya?ml))(?::([0-9][0-9,\-\s]*))?`/g;
/** 이 저장소가 실제로 갖고 있는 인용 수의 하한. 정규식이 형태 변화로 아무것도
 *  못 찾으면 "위반 0" 이 나와 조용히 통과하므로 개수 자체를 못박는다. */
const MIN_CITATIONS = 120;

interface Citation {
  doc: string;
  docLine: number;
  file: string;
  maxLine: number | null;
}

function collect(text: string, doc: string): Citation[] {
  const out: Citation[] = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(CITATION)) {
      const [, file, spec] = match;
      // 슬래시 없는 이름(`consent.ts`)은 산문 속 언급이지 경로 인용이 아니다.
      // 언급을 깨진 인용으로 세면 없는 드리프트를 만들어 낸다.
      if (!file.includes("/")) continue;
      const numbers = (spec ?? "").split(/[,\-\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
      out.push({ doc, docLine: index + 1, file, maxLine: numbers.length ? Math.max(...numbers) : null });
    }
  });
  return out;
}

const docs = fs.readdirSync(LEGAL_DIR).filter(name => name.endsWith(".md")).sort();
const citations = docs.flatMap(name =>
  collect(fs.readFileSync(path.join(LEGAL_DIR, name), "utf8"), name),
);

test("파서가 실제로 인용을 찾았다 - 0건 통과를 막는다", () => {
  expect(docs.length).toBeGreaterThan(0);
  expect(citations.length).toBeGreaterThanOrEqual(MIN_CITATIONS);
});

test("법무 문서의 모든 경로 인용이 실재하는 파일을 가리킨다", () => {
  const missing = citations
    .filter(c => !fs.existsSync(path.join(process.cwd(), c.file)))
    .map(c => `${c.doc}:${c.docLine} -> ${c.file}`);
  expect(missing).toEqual([]);
});

test("인용된 줄 번호가 파일 길이를 넘지 않는다", () => {
  // 줄이 여전히 **그 내용**인지는 기계가 못 본다. 파일이 그 줄까지 있지도 않은
  // 경우만 잡는다 - 확실히 깨진 것만.
  const overrun = citations
    .filter(c => c.maxLine !== null && fs.existsSync(path.join(process.cwd(), c.file)))
    .map(c => ({
      at: `${c.doc}:${c.docLine}`,
      file: c.file,
      cited: c.maxLine as number,
      has: fs.readFileSync(path.join(process.cwd(), c.file), "utf8").split("\n").length,
    }))
    .filter(row => row.cited > row.has);
  expect(overrun).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  // ⚠ 문서 안에 진짜로 깨진 인용을 두면 그게 그대로 변호사에게 간다.
  // 대조군은 테스트 안 문자열이다.
  test("양성 대조 - 없는 경로를 인용으로 잡는다", () => {
    const rows = collect("본문 (`src/lib/does-not-exist/nope.ts:1-2`) 끝.", "fixture.md");
    expect(rows).toHaveLength(1);
    expect(fs.existsSync(path.join(process.cwd(), rows[0].file))).toBe(false);
  });

  test("음성 대조 - 실재하는 경로는 통과한다", () => {
    const rows = collect("본문 (`src/lib/legal/legal-documents.ts`) 끝.", "fixture.md");
    expect(rows).toHaveLength(1);
    expect(fs.existsSync(path.join(process.cwd(), rows[0].file))).toBe(true);
  });

  test("슬래시 없는 언급은 인용으로 세지 않는다", () => {
    expect(collect("`consent.ts` 를 언급만 한다.", "fixture.md")).toEqual([]);
  });

  test("줄 범위에서 최대값을 뽑는다", () => {
    expect(collect("(`a/b.ts:12-34`)", "f.md")[0].maxLine).toBe(34);
    expect(collect("(`a/b.ts:9,77`)", "f.md")[0].maxLine).toBe(77);
    expect(collect("(`a/b.ts`)", "f.md")[0].maxLine).toBeNull();
  });
});
