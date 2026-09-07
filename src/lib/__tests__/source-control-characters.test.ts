import fs from "node:fs";
import path from "node:path";

// 정규식 안의 `\b` 가 **백스페이스 바이트(0x08)** 로 바뀌어 있으면, 그 정규식은
// 아무것도 매치하지 않으면서 문법적으로는 멀쩡하다.
//
// 어떻게 생기는가: 셸 heredoc 이나 `node -e` 로 파일을 쓰면 `\b` 가 이스케이프
// 시퀀스로 해석돼 **실제 제어문자 한 바이트**가 파일에 박힌다. `grep` 은 그
// 바이트를 출력하지 않으므로 화면상으로는 `/\bAnda\b/` 가 아니라 `/Anda/` 처럼
// 보이고, 코드 리뷰에서도 눈에 띄지 않는다. `cat -A` 만이 `^H` 로 드러낸다.
//
// 왜 위험한가: 이 저장소에서 발견된 세 곳이 **전부 부정 단언**이었다.
//
//   expect(id).not.toMatch(/\bAnda\b/)            → 매치 못 하니 항상 통과
//   expect(/..._LEVEL\b/.test(SRC)).toBe(false)   → 항상 false 니 항상 통과
//   expect(args).not.toMatch(/\b(progress|...)\b/) → 항상 통과
//
// 즉 **모든 입력에 같은 답을 주는 검사**가 셋 있었다. 셋 다 "이건 없어야 한다"를
// 지키려던 것이고, 셋 다 아무것도 지키지 않고 있었다. 특히 셋째는 바로 윗줄
// 주석이 "낱말 경계를 잡지 않으면 자기 자신에게 걸린다"고 적고 있다 - 저자는
// 경계가 필수임을 알고 썼는데 그 경계가 파일에 도착하지 못했다.
//
// 이 검사는 텍스트 소스에 탭·개행·캐리지리턴을 뺀 C0 제어문자가 없어야 한다고
// 못박는다. 바이너리는 당연히 제외한다.
const ROOT = process.cwd();

/** 텍스트로 다룰 확장자만. 나머지(이미지·폰트·아카이브)는 제어문자가 정상이다. */
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".sql", ".yml", ".yaml", ".css", ".html", ".sh",
]);

const SKIP_DIRS = new Set([
  "node_modules", "Output", "dist", "web-build", "android", "ios",
  "coverage", "legacy",
]);

/** 탭(09)·개행(0A)·캐리지리턴(0D)만 허용. 나머지 C0 는 소스에 있을 이유가 없다.
 *
 *  ⚠ 이 클래스 자체를 **이스케이프로** 적는다. 처음에는 제어문자를 그대로
 *  써 넣었는데, 그러면 제어문자를 금지하는 검사가 스스로 제어문자를 나르게
 *  되고, 그것이 바로 이 검사가 막으려는 형태다. */
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

test("스캐너가 실제로 파일을 찾았다 - 0건 통과를 막는다", () => {
  // 목록이 비면 아래 검사가 공짜로 통과한다. 확장자별로도 세어, 걷기가
  // 한 갈래만 훑고 끝나지 않았는지 본다.
  expect(files.length).toBeGreaterThan(1000);
  const byExtension = new Set(files.map(f => path.extname(f)));
  expect(byExtension.has(".ts")).toBe(true);
  expect(byExtension.has(".md")).toBe(true);
  expect(byExtension.has(".sql")).toBe(true);
});

test("텍스트 소스에 제어문자가 없다", () => {
  const offenders: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const hits = text.match(FORBIDDEN);
    if (!hits) continue;
    const line = text.slice(0, text.search(FORBIDDEN)).split("\n").length;
    offenders.push(
      `${path.relative(ROOT, file).split(path.sep).join("/")}:${line} ` +
        `제어문자 ${hits.length}개 (첫 코드포인트 U+${hits[0].charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()})`,
    );
  }
  expect(offenders).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  const BACKSPACE = String.fromCharCode(8);

  test("백스페이스를 잡는다 - grep 이 못 보는 바로 그 바이트", () => {
    expect(`/${BACKSPACE}Anda${BACKSPACE}/`.match(FORBIDDEN)).toHaveLength(2);
  });

  test("탭·개행·캐리지리턴은 통과한다", () => {
    expect("a\tb\nc\r\nd".match(FORBIDDEN)).toBeNull();
  });

  test("정상적으로 쓴 낱말 경계는 제어문자가 아니다", () => {
    // 소스에 `\b` 를 제대로 쓰면 백슬래시와 b, 두 글자다.
    const written = "/" + String.raw`\bAnda\b` + "/";
    expect(written.match(FORBIDDEN)).toBeNull();
    expect(written).toContain("\\b");
  });

  test("깨진 경계와 멀쩡한 경계가 다르게 동작한다는 것도 보인다", () => {
    // 이 검사가 왜 존재하는지를 실행으로 남긴다.
    const broken = new RegExp(`${BACKSPACE}Anda${BACKSPACE}`);
    const intact = /\bAnda\b/;
    expect(broken.test("Anda saja")).toBe(false); // 아무것도 못 잡는다
    expect(intact.test("Anda saja")).toBe(true); // 잡아야 할 것을 잡는다
  });
});
