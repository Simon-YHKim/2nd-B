import fs from "node:fs";
import path from "node:path";

// 경로가 풀리고 줄도 있는데, 그 줄이 문서가 말하는 그것이 아닌 경우.
//
// Round40 은 "존재하지 않는 파일"을, Round43 은 "이름으로 못 찾거나 여럿에
// 걸리는 파일"을 닫았다. 둘 다 경로 검사다. 남은 것은 **경로 검사가 원리적으로
// 못 보는 것**이다 - 파일도 있고 줄도 있는데 그 줄이 다른 내용인 경우.
//
// 이 문서에서 가장 크게 벌어져 있던 것이 하필 가장 안전에 가까운 주장이었다:
// `fixedCrisisResponse` 가 아홉 자리에서 `:266-298` 로 인용돼 있었는데 실제
// 위치는 `:408-438` 이다. **"위기 응답은 사람이 쓴 고정 템플릿이고 모델이
// 만들지 않는다"를 확인하러 간 사람은 그 자리에서 의미 분류기의 시스템
// 프롬프트를 읽게 된다** - 정확히 반대 결론이 나오는 자리다.
//
// 아래 표는 그 재읽기의 결과를 못박는다. 표가 손으로 쓰인 이유는 "인용 옆의
// 심볼"을 기계로 뽑으면 이 문서에서 일곱 쌍밖에 안 나오기 때문이다(측정값).
// 일곱 개짜리 검사로 백예순다섯 건을 지킨다고 말하는 것이 더 나쁘다.
const ROOT = process.cwd();
const DPIA = path.join(ROOT, "docs", "legal", "DPIA-2ndB-minors-draft.md");
const doc = fs.readFileSync(DPIA, "utf8").replace(/\r\n/g, "\n");

const read = (rel: string): string[] => fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);

interface Anchor {
  /** 문서가 적고 있는 인용, 그대로. */
  cite: string;
  /** 그 범위 안에 반드시 있어야 하는 문자열. */
  symbol: string;
  /** 왜 이 자리가 중요한가 - 틀렸을 때 읽는 사람이 무엇을 잘못 믿게 되는가. */
  why: string;
}

const S = "src/lib/llm/safety.ts";
const C = "src/lib/safety/classifier.ts";

const ANCHORS: Anchor[] = [
  { cite: `${S}:408-438`, symbol: "fixedCrisisResponse",
    why: "위기 응답이 사람이 쓴 고정 템플릿이라는 주장의 근거. 어긋나면 의미 분류기 프롬프트를 읽게 된다." },
  { cite: `${S}:287-390`, symbol: "classifySafety",
    why: "3층 방어 중 둘째 층(의미 분류기)." },
  { cite: `${S}:177-199`, symbol: "mergeResults",
    why: "RED-wins 병합. 이게 아니면 '보수적으로 합친다'는 주장에 근거가 없다." },
  { cite: `${S}:179-187`, symbol: "indexOf",
    why: "모르는 zone 을 RED 로 취급하는 fail-closed 순위. 위기에서 열리지 않는다는 주장." },
  { cite: `${S}:56-68`, symbol: "Suicide CARE",
    why: "KO/EN 마커 목록. 어느 임상 근거를 쓰는지가 여기서 확인된다." },
  { cite: `${S}:92`, symbol: "EXPO_PUBLIC_USE_VERTEX",
    why: "키 없는 웹 빌드에서 의미 층이 꺼진다는 잔여위험 서술의 근거." },
  { cite: `${S}:412,424`, symbol: "crisisHotlines",
    why: "미성년 라우팅이 실제로 핫라인 목록을 부르는 자리." },
  { cite: `${C}:70-79`, symbol: "crisisHotlines",
    why: "(locale, minor) → 핫라인 표시 순서." },
  { cite: `${C}:73-75`, symbol: "KR_1388",
    why: "미성년에게 1388 이 먼저 온다는 주장. 순서가 주장의 내용이다." },
  { cite: `${C}:91-116`, symbol: "classifyInput",
    why: "3층 방어 중 첫째 층(동기 렉시콘 백스톱)." },
  { cite: `${C}:142-159`, symbol: "containsAnalysisForbidden",
    why: "비임상 어휘 가드 C-LEX 의 구현." },
];

function slice(cite: string): { file: string; text: string; lines: number } {
  const [file, spec] = cite.split(":");
  const lines = read(file);
  const numbers = spec.split(/[,\-\s]+/).filter(Boolean).map(Number);
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return { file, text: lines.slice(Math.max(0, lo - 1), hi).join("\n"), lines: lines.length };
}

test("표가 실제로 채워져 있다 - 0건 통과를 막는다", () => {
  expect(ANCHORS.length).toBeGreaterThanOrEqual(10);
  expect(new Set(ANCHORS.map(a => a.cite)).size).toBe(ANCHORS.length);
});

test("문서가 이 인용들을 실제로 담고 있다", () => {
  // 표만 맞고 문서가 다른 숫자를 적고 있으면 이 검사는 아무것도 안 지킨다.
  const missing = ANCHORS.filter(a => !doc.includes("`" + a.cite + "`")).map(a => a.cite);
  expect(missing).toEqual([]);
});

test("그 심볼을 말하는 모든 줄에서, 그 파일 인용이 심볼을 담는다", () => {
  // ⚠ 처음 판은 표의 인용이 문서에 **하나라도** 있으면 통과했다. 변이 검증이
  // 그 구멍을 찾았다: 같은 인용이 문서에 여러 번 나오므로 **한 자리만** 옛
  // 범위로 되돌려도 아무 검사도 울지 않는다. 실제로 이 문서에서 벌어졌던 일이
  // 정확히 그것이다 - `fixedCrisisResponse` 가 아홉 자리에 있었고 그중 셋만
  // 맞았다.
  //
  // 그래서 자리마다 본다: 심볼 이름이 적힌 줄에서 그 파일을 인용하는 **모든**
  // 범위가 심볼을 담아야 한다.
  // ⚠ 줄 전체를 보면 안 된다. 531행 하나가 3층 방어를 설명하며 같은 파일의
  // **네 범위를 서로 다른 주장에** 인용한다. "이 줄이 심볼을 말하니 이 줄의
  // 모든 인용이 그 심볼을 담아야 한다"로 읽으면 멀쩡한 문장이 위반이 된다
  // (처음 판이 그랬고, 여섯 건의 거짓양성이 나왔다). 인접만 본다.
  const WINDOW = 50;
  const broken: string[] = [];
  for (const anchor of ANCHORS) {
    const file = anchor.cite.split(":")[0];
    const pattern = new RegExp("`" + file.replace(/[.]/g, "\\.") + ":([0-9][0-9,\\-\\s]*)`", "g");
    doc.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        const start = Math.max(0, (match.index ?? 0) - WINDOW);
        const near = line.slice(start, (match.index ?? 0) + match[0].length + WINDOW);
        if (!near.includes(anchor.symbol)) continue;
        const cite = `${file}:${match[1].trim()}`;
        if (!slice(cite).text.includes(anchor.symbol)) {
          broken.push(`문서 ${index + 1}행: ${cite} 안에 ${anchor.symbol} 없음 - ${anchor.why}`);
        }
      }
    });
  }
  expect(broken).toEqual([]);
});

/** `//` 주석을 걷어낸 소스. 주석은 값의 증거가 아니다. */
function codeWithoutComments(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

test("위기 템플릿 판번호가 코드와 같다", () => {
  // 표가 필요 없는 완전 일반 규칙이다. 문서가 인용하는 모든 위기 템플릿
  // 판번호는 코드에 실재해야 한다. `red-ko-minor-v1` 이 코드가 v2 로 올라간
  // 뒤에도 문서에 넷 남아 있었다 - 개인정보 문서가 잘못된 안전 템플릿 판을
  // 지목하는 것은 줄 번호가 낡은 것과 다른 종류의 오류다.
  //
  // ⚠ 주석을 먼저 걷는다. 변이 검증에서 **코드 쪽** 판번호만 바꿔 봤더니,
  // 같은 파일의 주석이 옛 판번호를 적고 있어서 검사가 통과했다. 주석은 값의
  // 증거가 아니다 - 이 저장소가 주석發 거짓양성에 여러 번 당했고, 이번은 그
  // 반대 방향(거짓음성)이다.
  const inDoc = [...new Set([...doc.matchAll(/`(red-[a-z-]+-v\d+)`/g)].map(m => m[1]))];
  expect(inDoc.length).toBeGreaterThan(0);
  const source = codeWithoutComments(S);
  const absent = inDoc.filter(version => !source.includes(`"${version}"`));
  expect(absent).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  test("양성 대조 - 범위 밖 심볼을 잡는다", () => {
    // 1행에는 fixedCrisisResponse 가 없다(파일 헤더 주석이다).
    expect(slice(`${S}:1-3`).text.includes("fixedCrisisResponse")).toBe(false);
  });

  test("음성 대조 - 범위 안 심볼은 통과한다", () => {
    expect(slice(`${S}:408-438`).text.includes("fixedCrisisResponse")).toBe(true);
  });

  test("쉼표와 하이픈을 둘 다 읽는다", () => {
    // `:412,424` 는 두 줄이지 412~424 범위가 아니지만, 검사는 최소~최대로
    // 넓게 잡는다. 넓게 잡는 쪽이 거짓양성이 아니라 **거짓음성**으로 기울므로
    // 여기서 그 성질을 드러내 둔다 - 다음 사람이 정확도를 오해하지 않게.
    const wide = slice(`${S}:412,424`);
    expect(wide.text.split("\n")).toHaveLength(13);
  });

  test("주석은 값의 증거가 아니다", () => {
    const stripped = codeWithoutComments(S);
    // 판번호는 주석에도 소스에도 나온다. 주석을 걷어도 실제 값은 남는다.
    expect(stripped).toContain('"red-ko-minor-v2"');
    // 그리고 걷어낸 쪽에는 그 주석 문장이 없다.
    expect(stripped).not.toContain("Versions are referenced in the audit log");
  });

  test("파일 길이를 넘는 인용은 잘려서 빈 조각이 된다", () => {
    // Round40 의 가드가 이 경우를 따로 잡는다. 여기서는 조용히 통과하지
    // 않는다는 것만 확인한다.
    const beyond = slice(`${S}:99998-99999`);
    expect(beyond.text).toBe("");
  });
});
