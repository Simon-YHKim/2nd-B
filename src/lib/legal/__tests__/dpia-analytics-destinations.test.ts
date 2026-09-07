import fs from "node:fs";
import path from "node:path";

// 문서가 분석 이벤트의 **수신자 목록**을 적는데, 그 목록에 아무것도 안 받는
// 회사가 들어 있었다.
//
// §2.7 하위처리자 표는 회차 41 에서 고쳤다. 그런데 같은 사실을 적는 자리가
// 둘 더 있었고 아무도 안 봤다 - 2.6 의 데이터 범주 표(항목 10)와 3.1 의
// 데이터 흐름도. 둘 다 `GA4 / Clarity / PostHog / Sentry` 라고 적고 있었다.
//
// 실측(`src/lib/analytics/*.ts`): clarity 94회 · gtag 16 · firebase 16 ·
// **posthog 0 · sentry 0**. PostHog 는 소스 어디에도 없고, Sentry 는 #1586 이
// 일부러 닫아 둔 상태다.
//
// 왜 중요한가: 개인정보 문서에서 **수신자를 더 적는 것**은 덜 적는 것과 다른
// 종류의 오류지만 둘 다 오류다. 읽는 사람이 존재하지 않는 데이터 흐름을
// 평가하게 되고, 실재하는 흐름과 구분할 방법이 없다.
//
// 이 검사는 산문을 판정하지 않는다. **목록에 이름이 오른 벤더가 분석 모듈에서
// 실제로 참조되는지**만 본다.
const ROOT = process.cwd();
const DPIA = path.join(ROOT, "docs", "legal", "DPIA-2ndB-minors-draft.md");
const ANALYTICS_DIR = path.join(ROOT, "src", "lib", "analytics");

const doc = fs.readFileSync(DPIA, "utf8").replace(/\r\n/g, "\n");

/** 분석 모듈의 런타임 소스 전체(테스트 제외). */
function analyticsSource(): string {
  return fs
    .readdirSync(ANALYTICS_DIR)
    .filter(name => name.endsWith(".ts") && !name.endsWith(".d.ts"))
    .map(name => fs.readFileSync(path.join(ANALYTICS_DIR, name), "utf8"))
    .join("\n")
    .toLowerCase();
}

/** 문서가 "이 **분석** 이벤트는 여기로 간다"고 적는 줄에서 벤더 이름을 뽑는다.
 *
 *  화살표(`→` / `──►`) 뒤의 슬래시로 이어진 목록만 본다. 산문 속 언급이나
 *  재읽기 주석은 목적지 선언이 아니다.
 *
 *  ⚠ **분석을 말하는 줄로 한정한다.** 3.1 흐름도에는 화살표가 여럿이고, 그중
 *  대부분은 LLM 경로나 내부 호출이다. 처음 판은 그것들까지 목적지로 읽어
 *  `recommend`·`Vertex` 를 "유령 벤더"로 신고했다 - 검사기가 자기 주장보다
 *  넓으면 멀쩡한 문장이 위반이 된다. 이 검사의 주장은 **분석 목적지**다.
 *
 *  ⚠ **칸 사이 여백에서 자른다.** ASCII 흐름도는 여러 칸을 한 물리 줄에 늘어
 *  놓는다 - 230행은 왼쪽 칸이 `analytics events ──► GA4/Clarity` 이고 오른쪽
 *  칸이 LLM 이그레스(`.googleapis.com` / `Vertex`)다. 줄 전체를 읽으면 옆 칸의
 *  `/ Vertex` 가 분석 목적지 목록에 딸려 들어온다. 칸 경계는 공백 두 칸 이상
 *  이므로 거기서 끊는다. 벤더 이름 안의 공백 한 칸(`Google Analytics`)은 남는다. */
export function destinationsIn(text: string): { line: number; vendors: string[] }[] {
  const out: { line: number; vendors: string[] }[] = [];
  text.split("\n").forEach((line, index) => {
    if (!/analytics/i.test(line)) return;
    const arrow = /(?:→|──►)(.*)$/.exec(line);
    if (!arrow) return;
    const cell = arrow[1].split(/ {2,}/)[0];
    const match = /^\s*([A-Za-z0-9 ./+-]*(?:\/[A-Za-z0-9 .+-]+)+)/.exec(cell);
    if (!match) return;
    const vendors = match[1]
      .split("/")
      .map(v => v.trim())
      .filter(v => /^[A-Za-z][A-Za-z0-9 .+-]*$/.test(v) && v.length > 2);
    if (vendors.length >= 2) out.push({ line: index + 1, vendors });
  });
  return out;
}

/** 이름 → 분석 소스에서 찾을 토큰. 이름과 토큰이 다른 것만 적는다. */
const TOKEN: Record<string, string> = {
  ga4: "gtag",
  "google analytics": "gtag",
  "microsoft clarity": "clarity",
};

const source = analyticsSource();
const declared = destinationsIn(doc);

test("파서가 실제로 목적지 줄을 찾았다 - 0건 통과를 막는다", () => {
  expect(declared.length).toBeGreaterThan(0);
  expect(source.length).toBeGreaterThan(2000);
  // 그리고 실재하는 벤더 하나는 반드시 잡혀야 한다.
  expect(declared.some(row => row.vendors.some(v => /clarity/i.test(v)))).toBe(true);
});

test("목적지로 이름 오른 벤더가 분석 모듈에 실재한다", () => {
  const ghosts: string[] = [];
  for (const row of declared) {
    for (const vendor of row.vendors) {
      const key = vendor.toLowerCase();
      const token = TOKEN[key] ?? key.split(" ").pop()!;
      if (!source.includes(token)) ghosts.push(`문서 ${row.line}행: "${vendor}" (찾은 토큰 "${token}" 0건)`);
    }
  }
  expect(ghosts).toEqual([]);
});

describe("검사기 자신의 대조군", () => {
  test("목적지 줄을 알아본다", () => {
    const rows = destinationsIn("analytics events → GA4 / Clarity | 뒤에 뭐가 더");
    expect(rows).toHaveLength(1);
    expect(rows[0].vendors).toEqual(["GA4", "Clarity"]);
  });

  test("흐름도 옆 칸은 목적지가 아니다", () => {
    // 실제 230행의 모양이다. 왼쪽 칸이 분석, 오른쪽 칸이 LLM 이그레스인데
    // 한 물리 줄에 놓여 있다. 줄 전체를 읽던 첫 판이 `Vertex` 를 유령 벤더로
    // 신고한 자리 - 옆 칸을 읽으면 멀쩡한 흐름도가 위반이 된다.
    const rows = destinationsIn("      analytics events ──► GA4/Clarity        / Vertex");
    expect(rows).toHaveLength(1);
    expect(rows[0].vendors).toEqual(["GA4", "Clarity"]);
  });

  test("벤더 이름 안의 공백 한 칸은 살아남는다", () => {
    const rows = destinationsIn("analytics events → Google Analytics / Clarity");
    expect(rows[0].vendors).toEqual(["Google Analytics", "Clarity"]);
  });

  test("분석을 말하지 않는 화살표는 목적지가 아니다", () => {
    // 3.1 흐름도의 LLM 경로가 여기 걸리면 검사기가 자기 주장보다 넓어진다.
    expect(destinationsIn("wiki snapshot ──► gemini-proxy / Vertex")).toEqual([]);
  });

  test("화살표 없는 산문은 목적지가 아니다", () => {
    expect(destinationsIn("PostHog / Sentry 는 설정만 돼 있고 닿는 경로가 없다.")).toEqual([]);
  });

  test("유령 벤더를 잡는다", () => {
    const rows = destinationsIn("analytics events → GA4 / PostHog");
    expect(rows).toHaveLength(1);
    const src = analyticsSource();
    expect(src.includes("posthog")).toBe(false);
    expect(src.includes("gtag")).toBe(true);
  });

  test("실재 판정은 분석 모듈만 본다", () => {
    // 저장소 어딘가에 이름이 있다고 수신자인 것은 아니다 - `@sentry/react-native`
    // 는 아직 의존성이지만 분석 모듈은 그것을 참조하지 않는다.
    expect(analyticsSource().includes("sentry")).toBe(false);
  });
});
