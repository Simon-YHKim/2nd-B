import fs from "node:fs";
import path from "node:path";

// 개인정보 영향평가서의 하위처리자 표가 벤더 하나만 적고 있었다.
//
// DPIA §2.7 은 "Recipients / third parties (sub-processors)" 표다. 그 표에
// LLM 행이 **하나**였고 그 하나가 `Google - Gemini API ... Every AI turn` 이었다.
// 실측하면 저장소는 LLM 벤더를 **넷** 태울 수 있고(`LlmProxyFn`), 넷 다
// 배포돼 있으며(gemini-proxy v135 / claude-proxy v115 / openai-proxy v120 /
// xai-proxy v51, 2026-09-07 조회), **지금 실제로 받고 있는 벤더는 표에 적힌
// 그 벤더가 아니다** - 운영 원장 `ai_audit_log` 의 마지막 gemini 호출은
// 2026-08-23 이고 그 뒤로는 전부 openai 다.
//
// 인용 하나가 낡은 것과는 무게가 다르다. 낡은 줄 번호는 근거를 못 찾게 하지만,
// **불완전한 수신자 목록은 없는 사실을 있다고 말한다** - 문서를 읽는 사람이
// "이 서비스는 Google 에만 보낸다" 는 결론을 내리게 된다.
//
// 이 검사는 산문을 판정하지 않는다. **코드가 태울 수 있는 벤더를 문서가
// 알고 있는지**만 본다 - 기계로 결정된다. 다섯 번째 벤더를 코드에 추가하면
// 이 검사가 개인정보 문서를 같이 고치라고 말한다.
const ROOT = process.cwd();
const DPIA = path.join(ROOT, "docs", "legal", "DPIA-2ndB-minors-draft.md");
const ROUTING = path.join(ROOT, "src", "lib", "llm", "routing.ts");

const doc = fs.readFileSync(DPIA, "utf8");
const routing = fs.readFileSync(ROUTING, "utf8");

/** `export type LlmProxyFn = "gemini-proxy" | ... ;` 에서 프록시 슬러그를 뽑는다. */
export function proxySlugsFromSource(source: string): string[] {
  const decl = /export type LlmProxyFn\s*=\s*([^;]+);/.exec(source);
  if (!decl) return [];
  return [...decl[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]);
}

/** `export type LlmVendor = "gemini" | ... ;` 에서 벤더 이름을 뽑는다. */
export function vendorNamesFromSource(source: string): string[] {
  const decl = /export type LlmVendor\s*=\s*([^;]+);/.exec(source);
  if (!decl) return [];
  return [...decl[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]);
}

/** §2.7 표를 헤더와 본문 행으로 가른다.
 *
 *  ⚠ 이 파일은 CRLF 다. 정규화하지 않고 `\n\n` 로 절 끝을 찾으면 앵커가
 *  안 맞아 블록이 다음 표까지 흘러가고, **다른 표의 행이 이 표의 결함으로
 *  보고된다**(처음 쓸 때 실제로 그랬다 - `raw-clippings` 행이 근거 없음으로
 *  잡혔다). 검사기 결함과 대상 결함을 가르려면 여기서 먼저 정규화한다.
 *
 *  ⚠ 칸을 **위치로** 읽지 않는다. 처음 판은 `cells[4]` 를 근거 칸으로 박아
 *  뒀는데, 변이 검증에서 근거 칸을 통째로 지우자 행이 한 칸 짧아지면서
 *  `cells[4]` 가 옆 칸("n/a")을 가리켰고 검사가 **조용히 통과**했다. 표에서
 *  칸 하나가 사라지는 것은 뒤의 모든 칸이 밀리는 일이라 값 하나가 비는 것보다
 *  나쁘다. 그래서 근거 칸은 헤더에서 이름으로 찾고, 칸 수는 따로 센다. */
export function recipientTable(text: string): { header: string[]; rows: string[][] } {
  const normalized = text.replace(/\r\n/g, "\n");
  const start = normalized.indexOf("### 2.7 Recipients");
  if (start < 0) return { header: [], rows: [] };
  const after = normalized.slice(start);
  const end = after.indexOf("\n\n**Cross-border");
  const block = end < 0 ? after : after.slice(0, end);
  const cells = block
    .split("\n")
    .filter(line => line.trimStart().startsWith("|"))
    .map(line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()));
  const headerIndex = cells.findIndex(row => row[0] === "Recipient");
  if (headerIndex < 0) return { header: [], rows: [] };
  return {
    header: cells[headerIndex],
    rows: cells.slice(headerIndex + 1).filter(row => !row.every(c => /^:?-+:?$/.test(c))),
  };
}

const slugs = proxySlugsFromSource(routing);
const vendors = vendorNamesFromSource(routing);
const { header, rows } = recipientTable(doc);
const citeColumn = header.indexOf("Cite");

test("파서가 실제로 재료를 찾았다 - 0건 통과를 막는다", () => {
  // 넷 다 비면 아래 검사가 전부 공짜로 통과한다. 무엇이 비었는지 각각 말한다.
  expect(slugs.length).toBeGreaterThanOrEqual(3);
  expect(vendors.length).toBeGreaterThanOrEqual(3);
  expect(rows.length).toBeGreaterThanOrEqual(5);
  expect(citeColumn).toBeGreaterThanOrEqual(0);
});

test("코드가 태울 수 있는 LLM 벤더 프록시를 문서가 전부 알고 있다", () => {
  // 슬러그(`openai-proxy`)를 찾는다 - 벤더 이름(`openai`)이 아니라. 산문에
  // "OpenAI" 라고 한 번 스치듯 적는 것과 수신자로 이름을 올리는 것은 다르고,
  // 슬러그는 이 저장소의 배선을 가리키는 이름이라 우연히 등장하지 않는다.
  const missing = slugs.filter(slug => !doc.includes(slug));
  expect(missing).toEqual([]);
});

test("하위처리자 표의 모든 행이 헤더와 같은 칸 수를 갖는다", () => {
  // 칸 하나가 빠지면 그 뒤 칸이 전부 한 칸씩 밀린다. 마크다운은 그래도
  // 렌더되므로 사람 눈에는 "근거 칸에 n/a 가 적혀 있다" 로 보인다.
  const ragged = rows
    .filter(cells => cells.length !== header.length)
    .map(cells => `${cells[0]} (${cells.length} != ${header.length})`);
  expect(ragged).toEqual([]);
});

test("하위처리자 표의 모든 행이 근거를 댄다", () => {
  // 근거 칸이 비면 그 행은 검증할 수 없다. 그리고 근거가 경로면 Round40 이
  // 넣은 `legal-doc-citations.test.ts` 가 그 경로의 실재까지 이어서 본다 -
  // 즉 코드에서 사라진 수신자는 그쪽에서 걸린다.
  const uncited = rows
    .filter(cells => {
      const cite = cells[citeColumn] ?? "";
      return cite === "" || cite === "-";
    })
    .map(cells => cells[0]);
  expect(uncited).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  // ⚠ 문서 안에 진짜로 빠진 벤더를 두면 그게 그대로 변호사에게 간다.
  // 대조군은 테스트 안 문자열이다.
  test("양성 대조 - 유니온에 있는데 문서에 없는 프록시를 잡는다", () => {
    const src = 'export type LlmProxyFn = "gemini-proxy" | "ghost-proxy";';
    const found = proxySlugsFromSource(src);
    expect(found).toEqual(["gemini-proxy", "ghost-proxy"]);
    expect(found.filter(s => !doc.includes(s))).toEqual(["ghost-proxy"]);
  });

  test("음성 대조 - 유니온이 비면 빈 배열이지 예외가 아니다", () => {
    expect(proxySlugsFromSource("no union here")).toEqual([]);
    expect(vendorNamesFromSource("no union here")).toEqual([]);
  });

  const fixture = (body: string, eol = "\n") =>
    [
      "### 2.7 Recipients / third parties (sub-processors)",
      "| Recipient | Role | Data exposed | Trigger / gate | Cite |",
      "|---|---|---|---|---|",
      body,
      "",
      "**Cross-border transfer:** ...",
    ].join(eol);

  test("표 파서는 헤더와 구분선을 행으로 세지 않는다", () => {
    const parsed = recipientTable(fixture("| **A** | r | d | t | `x/y.ts` |"));
    expect(parsed.header).toEqual(["Recipient", "Role", "Data exposed", "Trigger / gate", "Cite"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0][parsed.header.indexOf("Cite")]).toBe("`x/y.ts`");
  });

  test("근거 칸이 비면 잡는다", () => {
    const { header, rows } = recipientTable(fixture("| **A** | r | d | t |  |"));
    expect(rows.filter(c => c[header.indexOf("Cite")] === "")).toHaveLength(1);
  });

  test("칸이 하나 사라진 행을 잡는다 - 빈 값이 아니라 밀림이다", () => {
    // 변이 검증이 찾아낸 구멍. 이 행은 근거 칸이 비어 있지 않다 - 아예 없고,
    // 그래서 위치로 읽으면 옆 칸("t")이 근거처럼 보인다.
    const { header, rows } = recipientTable(fixture("| **A** | r | d | t |"));
    expect(rows[0]).toHaveLength(4);
    expect(rows.filter(c => c.length !== header.length)).toHaveLength(1);
  });

  test("CRLF 문서에서도 절 경계를 찾는다", () => {
    const { rows } = recipientTable(fixture("| **A** | r | d | t | `x/y.ts` |", "\r\n"));
    expect(rows).toHaveLength(1);
  });
});
