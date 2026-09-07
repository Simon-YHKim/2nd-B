import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// 워크플로가 파일에 써 넣는 JS 가 실제로 파싱되는가.
//
// 2026-09-07 회귀: `eas-update.yml` 의 검증기 호스트 스크립트가 검사기 본문을
// `String.raw` 템플릿으로 써 넣는데, **그 본문 주석 두 곳에 backtick 이 들어
// 있었다.** 첫 inner backtick 이 템플릿을 닫아 버려서 뒤가 통째로 깨진 JS 가
// 되고 Node 가 `SyntaxError: missing ) after argument list` 로 죽었다. 결과:
// OTA 발행 잡이 아예 돌지 않았다. YAML 은 유효했고 셸도 유효했다 - JS 만
// 깨졌는데 그걸 보는 것이 아무것도 없었다.
//
// ⚠ 세는 대상을 틀리기 쉬운 자리다. 실측:
//   - "주석 안 backtick" 을 grep 하면 3건이 나오는데 그중 하나(L266 계열)는
//     `node - <<'NODE'` **인용 heredoc** 안이라 무해하다. 거짓양성 33%.
//   - 파일 전체 backtick 을 세면 템플릿 구분자 자체가 잡혀 영원히 빨간불이다.
// 그래서 backtick 을 흉내내 세지 않는다. **깨진 것은 템플릿 본문이 아니라
// 그걸 담은 호스트 스크립트**이므로, 호스트를 통째로 꺼내 파서에 넣는다.
// 그러면 backtick 뿐 아니라 그 블록들의 모든 문법 오류가 같이 잡힌다.
//
// ⚠ 워크플로 안의 JS 는 "그대로의 JS" 가 아니다. GitHub Actions 식
// `${{ ... }}` 는 스크립트가 돌기 **전에** 치환된다. 정규화하지 않으면
// `web-deploy.yml` 의 멀쩡한 블록이 `Unexpected token '.'` 로 잡힌다(실측).

const WORKFLOWS = path.join(process.cwd(), ".github", "workflows");
const OPENER = /<<'([A-Za-z_][A-Za-z0-9_]*)'/;
const GHA_EXPRESSION = /\$\{\{[\s\S]*?\}\}/g;
/** 이 저장소가 실제로 갖고 있는 블록 수의 하한. 파서가 형태 변화로 아무것도
 *  못 찾으면 "실패 0" 이 나와 조용히 통과하므로, 개수 자체를 못박는다. */
const MIN_BLOCKS = 25;

interface HeredocBlock {
  file: string;
  line: number;
  tag: string;
  closed: boolean;
  body: string;
}

/** `node ... <<'TAG'` 로 시작하는 힙독 본문을 전부 떼어 온다. `python3 <<'PY'`
 *  같은 남의 문법은 건드리지 않는다. */
function collectNodeHeredocs(source: string, file: string): HeredocBlock[] {
  const lines = source.split("\n");
  const blocks: HeredocBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const match = OPENER.exec(lines[index]);
    if (!match || !/(^|[\s("])node(\s|$)/.test(lines[index].slice(0, match.index))) {
      index += 1;
      continue;
    }
    const tag = match[1];
    const body: string[] = [];
    let cursor = index + 1;
    let closed = false;
    while (cursor < lines.length) {
      if (lines[cursor].trim() === tag) { closed = true; break; }
      body.push(lines[cursor]);
      cursor += 1;
    }
    blocks.push({ file, line: index + 1, tag, closed, body: body.join("\n") });
    index = closed ? cursor + 1 : index + 1;
  }
  return blocks;
}

/** Node 가 CommonJS 파일에 두르는 래퍼 그대로 감싸서 파싱만 한다(실행 없음).
 *  `node --check` 와 같은 판정을 내리며, 33개 블록에서 결과가 일치하는 것을
 *  확인했다. 하위 프로세스를 띄우지 않아 빠르다. */
function syntaxErrorOf(body: string, filename: string): string | null {
  const source = body.replace(GHA_EXPRESSION, "__GHA_EXPR__");
  try {
    new vm.Script(
      `(function (exports, require, module, __filename, __dirname) {${source}\n});`,
      { filename },
    );
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

const blocks = fs.readdirSync(WORKFLOWS)
  .filter(name => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort()
  .flatMap(name => collectNodeHeredocs(fs.readFileSync(path.join(WORKFLOWS, name), "utf8"), name));

test("파서가 실제로 블록을 찾았다 - 0건 통과를 막는다", () => {
  expect(blocks.length).toBeGreaterThanOrEqual(MIN_BLOCKS);
  expect(blocks.filter(block => !block.closed)).toEqual([]);
});

test("워크플로가 써 넣는 JS 가 전부 파싱된다", () => {
  const broken = blocks
    .map(block => ({ at: `${block.file}:${block.line}`, error: syntaxErrorOf(block.body, `${block.file}:${block.line}`) }))
    .filter(entry => entry.error !== null);
  expect(broken).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  // ⚠ 이 두 문자열은 **테스트 안에만** 있다. 워크플로 파일에 진짜로 깨진 블록을
  // 두면 그 파일이 언젠가 실행된다.
  const tick = String.fromCharCode(96);
  const host = (comment: string) => [
    'const fs = require("node:fs");',
    `fs.writeFileSync(process.env.CHECKER, String.raw${tick}`,
    '  "use strict";',
    `  // ${comment}`,
    '  console.log("ok");',
    `${tick});`,
  ].join("\n");

  test("양성 대조 - 주석 안 backtick 이 든 호스트를 FAIL 로 판정한다", () => {
    // 회귀를 그대로 재현한 모양: 주석 안의 backtick 이 템플릿을 조기 종료시킨다.
    expect(syntaxErrorOf(host(`Keep the CLI record. ${tick}eas update:view${tick}`), "positive-control")).not.toBeNull();
  });

  test("음성 대조 - 같은 호스트에서 backtick 만 빼면 PASS 한다", () => {
    // 검사기가 아무거나 FAIL 시키는 것이 아님을 보인다.
    expect(syntaxErrorOf(host("Keep the CLI record, not just its id."), "negative-control")).toBeNull();
  });

  test("GitHub Actions 식은 정규화된다 - 멀쩡한 블록을 잡지 않는다", () => {
    const withExpression = [
      "const lines = [",
      `  ${tick}- source: \\${tick}\${{ steps.gate.outputs.source_sha }}\\${tick}${tick},`,
      "];",
      "console.log(lines.length);",
    ].join("\n");
    expect(syntaxErrorOf(withExpression, "gha-control")).toBeNull();
  });
});
