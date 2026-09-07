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
  /** 슬래시 없이 적힌 이름. 경로가 아니라 이름으로 저장소에서 찾아야 한다. */
  bare: boolean;
}

function collect(text: string, doc: string): Citation[] {
  const out: Citation[] = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(CITATION)) {
      const [, file, spec] = match;
      const numbers = (spec ?? "").split(/[,\-\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
      const maxLine = numbers.length ? Math.max(...numbers) : null;
      const bare = !file.includes("/");
      // 슬래시 없는 이름(`consent.ts`)은 산문 속 언급이지 경로 인용이 아니다.
      // 언급을 깨진 인용으로 세면 없는 드리프트를 만들어 낸다.
      //
      // ⚠ 단 **줄 번호를 달고 있으면 예외다.** `prefs.ts:73` 은 언급이 아니라
      // 인용이다 - 아무도 줄 번호를 붙여 가며 지나가는 말을 하지 않는다.
      // 처음 판(Round40)은 이 예외 없이 걸러서, 이 문서의 **84건**이 검사 밖에
      // 있었고 그중 열한 건이 아직 개명 전 `gemini.ts` 를 가리키고 있었다.
      // 필터가 목적에는 맞았고 딱 이 한 경우만큼 넓었다.
      if (bare && maxLine === null) continue;
      out.push({ doc, docLine: index + 1, file, maxLine, bare });
    }
  });
  return out;
}

/** 저장소 파일 목록(node_modules 등 제외). 이름 하나가 몇 개 파일과 맞는지 센다. */
function repoFiles(root: string, skip: ReadonlySet<string>, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) repoFiles(full, skip, out);
    else out.push(path.relative(process.cwd(), full).split(path.sep).join("/"));
  }
  return out;
}

const SKIP = new Set(["node_modules", "Output", "dist", "web-build", "android", "ios", "coverage"]);
const REPO_FILES = repoFiles(process.cwd(), SKIP);

/** 이 이름으로 끝나는 저장소 파일들. 루트 파일(`package.json`)도 포함된다. */
function resolveBare(name: string): string[] {
  return REPO_FILES.filter(p => p === name || p.endsWith("/" + name));
}

const docs = fs.readdirSync(LEGAL_DIR).filter(name => name.endsWith(".md")).sort();
const citations = docs.flatMap(name =>
  collect(fs.readFileSync(path.join(LEGAL_DIR, name), "utf8"), name),
);

test("파서가 실제로 인용을 찾았다 - 0건 통과를 막는다", () => {
  expect(docs.length).toBeGreaterThan(0);
  expect(citations.length).toBeGreaterThanOrEqual(MIN_CITATIONS);
  // 두 종류가 **둘 다** 잡혀야 한다. 한쪽만 잡히면 아래 검사의 절반이
  // 조용히 공짜로 통과한다.
  expect(citations.filter(c => c.bare).length).toBeGreaterThan(0);
  expect(citations.filter(c => !c.bare).length).toBeGreaterThan(0);
  // 저장소 색인이 실제로 채워졌는지도 본다 - 비면 이름 해석이 전부 0건이 된다.
  expect(REPO_FILES.length).toBeGreaterThan(500);
});

test("법무 문서의 모든 경로 인용이 실재하는 파일을 가리킨다", () => {
  const missing = citations
    .filter(c => !c.bare && !fs.existsSync(path.join(process.cwd(), c.file)))
    .map(c => `${c.doc}:${c.docLine} -> ${c.file}`);
  expect(missing).toEqual([]);
});

/** `:179-187` - 파일 이름 없이 줄 범위만 적은 이어쓰기 인용. */
const CONTINUATION = /`:[0-9][0-9,\-\s]*`/g;

test("파일 이름 없는 이어쓰기 인용이 없다", () => {
  // 앞 인용의 파일을 이어받는 형태다. 사람은 문장으로 풀 수 있지만 **기계는
  // 못 풀고**, 그래서 이 파일의 어떤 검사도 그것을 보지 못했다 - Round40 은
  // 경로를, Round43 은 이름을 보는데 이건 둘 다 없다.
  //
  // 그 자리에 뭐가 숨어 있었는가: `callAdvisor` 의 `:635-669` 는 개명 전
  // gemini.ts 의 범위였고, 그 옆 문장은 아직 `callGemini` 라고 적고 있었다.
  // 열네 건이라 반쯤 지키는 대신 전부 펴고 형태 자체를 막는다.
  //
  // ⚠ 재읽기 주석이 **옛 인용을 인용해야 할 때**가 있다("이 자리는 :60 을
  // 가리키고 있었다"). 백틱을 씌우면 인용을 *하는* 것과 구분되지 않으므로
  // 그럴 때는 산문으로 쓴다("line 60 of that file"). 검사에 예외를 뚫는 대신
  // 문서 쪽을 명확하게 쓰는 쪽을 골랐다 - 사람이 읽기에도 그쪽이 낫다.
  const found = docs.flatMap(name => {
    const text = fs.readFileSync(path.join(LEGAL_DIR, name), "utf8").replace(/\r\n/g, "\n");
    return text.split("\n").flatMap((line, i) =>
      [...line.matchAll(CONTINUATION)].map(m => `${name}:${i + 1} ${m[0]}`),
    );
  });
  expect(found).toEqual([]);
});

test("줄 번호를 단 이름 인용이 저장소 파일 하나로 풀린다", () => {
  // 이름만으로는 어느 파일인지 모를 수 있다. `index.ts` 는 이 저장소에
  // 스물세 개, `export.ts` 는 둘이다. **못 찾는 것과 여럿에 걸리는 것은
  // 둘 다 읽는 사람이 근거에 도달하지 못한다는 같은 결과**이고, 변호사에게는
  // 확인 못 한 주장으로 남는다. 그래서 정확히 하나일 것을 요구한다.
  const unresolved = citations
    .filter(c => c.bare)
    .map(c => ({ at: `${c.doc}:${c.docLine}`, file: c.file, candidates: resolveBare(c.file).length }))
    .filter(row => row.candidates !== 1);
  expect(unresolved).toEqual([]);
});

// 마이그레이션을 번호로만 인용하면 **어떤 가드도 그 파일을 못 찾는다.**
//
// `0038:12-19` 는 줄 범위를 달고 있으니 회차 43 의 규칙대로 인용이다 - 아무도
// 줄 번호를 붙여 가며 지나가는 말을 하지 않는다. 그런데 위의 인용 정규식은
// **확장자**가 있어야 경로로 알아보므로, 이 형태는 검사 전체 밖에 있었다:
//
//   경로 실재        검사 안 함
//   줄 <= 파일 길이   검사 안 함
//   앵커 인접        검사 안 함
//
// 회차 58 에서 42건이 그 상태였다. 회차 57 의 결함이 한 번 더 나온 것이다 -
// **가드가 볼 수 없는 표기.**
//
// ⚠ 줄 번호 **없는** `0031` 은 그대로 둔다. 같은 규칙대로 그건 산문이다.
const ABBREVIATED_MIGRATION = /`(\d{4})(?::[0-9][0-9,\-\s]*)`/g;

test("줄 번호를 단 축약 마이그레이션 인용이 없다", () => {
  const found: string[] = [];
  for (const doc of docs) {
    const text = fs.readFileSync(path.join(LEGAL_DIR, doc), "utf8");
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(ABBREVIATED_MIGRATION)) {
        found.push(`${doc}:${index + 1} \`${match[1]}…\` - db/migrations/ 경로로 적을 것`);
      }
    });
  }
  expect(found).toEqual([]);
});

// 경로 없이 이름만 적은 인용은 **저장소 루트 파일일 때만** 성립한다.
//
// `package.json:16` 은 이름이 곧 저장소 기준 경로라 문제가 없다. 반면
// `prefs.ts:55-62` 는 경로가 빠진 것이고, 앵커 가드가 **파일 문자열로 대조**
// 하므로 그런 인용은 `src/lib/privacy/prefs.ts` 앵커에 영원히 안 걸린다.
// 회차 57 이 그 틈에서 이미 닫힌 결함 부류 넷을 찾았다.
test("경로 없는 인용은 저장소 루트 파일일 때만", () => {
  const bad: string[] = [];
  for (const c of citations) {
    if (!c.bare) continue;
    const resolved = resolveBare(c.file);
    if (resolved.length === 1 && resolved[0] !== c.file) {
      bad.push(`${c.doc}:${c.docLine} \`${c.file}\` -> \`${resolved[0]}\` 로 적을 것`);
    }
  }
  expect(bad).toEqual([]);
});

// 한 파일을 **두 표기로** 인용하면, 그 파일을 감사한 회차가 절반만 고친다.
//
// 회차 45·49·50·53·56 이 prefs.ts · recommend.ts · consent-age.ts ·
// conversation.ts · lexicon.ts 를 재독하고 긴 표기(`src/lib/privacy/prefs.ts:NN`)를
// 고쳤다. 문서는 같은 파일을 짧은 표기(`prefs.ts:NN`)로도 인용하고 있었고, 위의
// "이름 인용" 검사가 **경로는 풀어 주므로** 표기 자체는 합법이었다.
//
// 그래서 **두 겹으로 덮인 것처럼 보였다** - 파일은 감사됐고 가드는 그 표기를
// 보고 있었다. 줄 번호에 대해서는 둘 다 사실이 아니었고, 짧은 표기 24건이 한
// 번도 안 읽혔다. 그 안에서 **이미 닫힌 결함 부류 셋이 살아남았다**:
//
//   회차 45  문서가 credit 하는데 존재하지 않는 설정 (llm_training)
//   회차 49  울타리 대신 캐시 주석을 가리키는 인용
//   회차 50  "관할 신호 없음" - 그 신호가 붙었다고 적힌 줄을 인용해서
//
// 마지막이 가장 나빴다. `consent-age.ts:8-14` 는 "2026-08-16: the country
// signal landed" 로 시작하는데, 세 자리가 **정확히 그 범위를 인용해서** 신호가
// 없다고 주장하고 있었다. 그중 하나가 P1 시정 표의 행이다.
//
// 이 검사는 줄 번호를 검증하지 않는다 - 그건 사람이 읽어야 한다. 검증하는 것은
// **한 파일이 한 표기만 갖는다**는 것뿐이고, 그래야 한 파일을 감사한 회차가 그
// 파일의 인용 전부를 감사한 것이 된다.
test("한 파일을 두 표기로 인용하지 않는다", () => {
  const split: string[] = [];
  for (const doc of docs) {
    const inDoc = citations.filter(c => c.doc === doc);
    const longForms = new Set(inDoc.filter(c => !c.bare).map(c => c.file));
    const seen = new Set<string>();
    for (const c of inDoc) {
      if (!c.bare || seen.has(c.file)) continue;
      const resolved = resolveBare(c.file);
      if (resolved.length === 1 && longForms.has(resolved[0])) {
        seen.add(c.file);
        const lines = inDoc.filter(o => o.bare && o.file === c.file).map(o => o.docLine);
        split.push(`${doc}: \`${c.file}\` 와 \`${resolved[0]}\` 가 같은 파일 - 짧은 표기 ${lines.join(",")}행`);
      }
    }
  }
  expect(split).toEqual([]);
});

test("이름 인용의 줄 번호도 파일 길이를 넘지 않는다", () => {
  const overrun = citations
    .filter(c => c.bare && c.maxLine !== null && resolveBare(c.file).length === 1)
    .map(c => ({
      at: `${c.doc}:${c.docLine}`,
      file: resolveBare(c.file)[0],
      cited: c.maxLine as number,
      has: fs.readFileSync(path.join(process.cwd(), resolveBare(c.file)[0]), "utf8").split("\n").length,
    }))
    .filter(row => row.cited > row.has);
  expect(overrun).toEqual([]);
});

test("인용된 줄 번호가 파일 길이를 넘지 않는다", () => {
  // 줄이 여전히 **그 내용**인지는 기계가 못 본다. 파일이 그 줄까지 있지도 않은
  // 경우만 잡는다 - 확실히 깨진 것만.
  const overrun = citations
    .filter(c => !c.bare && c.maxLine !== null && fs.existsSync(path.join(process.cwd(), c.file)))
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

  test("슬래시 없는 **언급**은 인용으로 세지 않는다", () => {
    expect(collect("`consent.ts` 를 언급만 한다.", "fixture.md")).toEqual([]);
  });

  test("슬래시 없어도 줄 번호가 붙으면 인용으로 센다", () => {
    // 이 한 줄이 Round40 에서 빠져 있었고, 그래서 84건이 검사 밖에 있었다.
    const rows = collect("(`prefs.ts:73`)", "fixture.md");
    expect(rows).toHaveLength(1);
    expect(rows[0].bare).toBe(true);
    expect(rows[0].maxLine).toBe(73);
  });

  test("이어쓰기 인용 형태를 실제로 알아본다", () => {
    // 이 대조군이 없으면 위 검사는 "정규식이 아무것도 못 찾아서" 통과하는
    // 것과 구분되지 않는다.
    expect("(`src/a.ts:1-2`, `:3-4`)".match(CONTINUATION)).toEqual(["`:3-4`"]);
    // 파일 이름이 붙은 것은 이어쓰기가 아니다.
    expect("(`src/a.ts:3-4`)".match(CONTINUATION)).toBeNull();
  });

  test("이름 해석은 하나 / 여럿 / 없음을 가른다", () => {
    expect(resolveBare("package.json").length).toBe(1);
    expect(resolveBare("index.ts").length).toBeGreaterThan(1);
    expect(resolveBare("this-file-does-not-exist.ts")).toEqual([]);
    // 접미사로 매칭하되 **경계에서** 자른다: `refs.ts` 가 `prefs.ts` 를
    // 잡으면 엉뚱한 파일의 길이로 줄 번호를 재게 된다.
    expect(resolveBare("refs.ts")).toEqual([]);
  });

  test("줄 범위에서 최대값을 뽑는다", () => {
    expect(collect("(`a/b.ts:12-34`)", "f.md")[0].maxLine).toBe(34);
    expect(collect("(`a/b.ts:9,77`)", "f.md")[0].maxLine).toBe(77);
    expect(collect("(`a/b.ts`)", "f.md")[0].maxLine).toBeNull();
  });
});
