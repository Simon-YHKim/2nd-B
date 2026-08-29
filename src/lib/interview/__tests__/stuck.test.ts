// 사람이 "모르겠다"고 했을 때 시스템이 **더 깊이 내려가지 않는가**, 그리고
// 그 답이 **칸을 채우지 않는가.**
//
// 이 테스트는 실측에서 나왔다 (Simon, 2026-08-24). 인터뷰를 실제로 쳐보니
// "잘 모르겠는데" → 믿음(L4) → "모르겠다구" → 울림(L5) 로 계속 내려갔고,
// 못 답한 칸이 전부 채워진 것으로 셌다.
import { emptyCoverage, incrementCoverage, nextMove, type Coverage } from "../probe";
import { isNonAnswer, shouldScaffold, SCAFFOLD_FALLBACK, scaffoldQuestion, MAX_SCAFFOLDS_PER_LAYER } from "../stuck";
import { narrativeStarLevel } from "../narrative-level";
import { livedPeriods } from "../periods";
import { classifyInputAnyLocale } from "../../safety/classifier";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NOW = new Date("2026-08-24T12:00:00Z");

describe("못 답했다는 신호를 알아본다", () => {
  it.each([
    "모르겠다",
    "잘 모르겠는데",
    "모르겠다구",
    "몰라",
    "글쎄...",
    "딱히 없는데",
    "기억 안 나",
    "생각 안 남",
    "패스",
  ])("ko 비-답변: %s", (t) => {
    expect(isNonAnswer(t, "ko")).toBe(true);
  });

  it.each(["I don't know", "no idea", "not sure", "dunno", "idk", "skip"])(
    "en 비-답변: %s",
    (t) => {
      expect(isNonAnswer(t, "en")).toBe(true);
    },
  );

  it.each([
    "경기에 완전히 집중해서 봤었지",
    "무서웠어",
    "한일월드컵 때 반 친구들과 만석공원에서 한미 전을 봤던것이 기억나",
  ])("진짜 답은 비-답변이 아니다: %s", (t) => {
    expect(isNonAnswer(t, "ko")).toBe(false);
  });

  it("길게 말했으면 '모르겠다'가 들어 있어도 답으로 본다", () => {
    // 재료를 버리지 않기 위해 보수적으로 잡는다.
    const long = "뭘 의미했는지는 잘 모르겠는데, 그날 아버지가 처음으로 내 편을 들어줬어";
    expect(isNonAnswer(long, "ko")).toBe(false);
  });

  it("빈 답은 여기서 참이 아니다 (화면이 먼저 막는다)", () => {
    expect(isNonAnswer("", "ko")).toBe(false);
    expect(isNonAnswer("   ", "ko")).toBe(false);
  });
});

describe("막히면 같은 층에 머문다 — 더 깊이 가지 않는다", () => {
  // 사실·감정은 채웠고 의미(L3)에서 막힌 상태.
  const cov: Coverage = (() => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "infancy", "fact");
    c = incrementCoverage(c, "infancy", "feeling");
    return c;
  })();

  it("막힘이 없으면 평소대로 빈 칸을 찾아 내려간다", () => {
    const move = nextMove(cov, "infancy", [], NOW, null);
    expect(move).toEqual({ kind: "drill", layer: "meaning" });
  });

  it("한 번 막히면 그 층을 다시 묻는다 (믿음으로 안 넘어간다)", () => {
    const move = nextMove(cov, "infancy", [], NOW, { layer: "meaning", streak: 1 });
    expect(move).toEqual({ kind: "scaffold", layer: "meaning" });
  });

  it("두 번째도 발판이다", () => {
    const move = nextMove(cov, "infancy", [], NOW, { layer: "meaning", streak: 2 });
    expect(move).toEqual({ kind: "scaffold", layer: "meaning" });
  });

  it("두 번 시도해도 막히면 그때 넘어간다", () => {
    const move = nextMove(cov, "infancy", [], NOW, { layer: "meaning", streak: 3 });
    expect(move.kind).toBe("drill");
  });

  it("⚠ 포기한 층을 다시 집지 않는다 (실행해서 잡은 제자리 돌기)", () => {
    // 실측 2026-08-24: 칸을 안 채우는 것만으로는 부족했다. "가장 먼저 비어 있는
    // 칸" 규칙이 방금 포기한 그 칸을 바로 다시 집어서, 같은 L3 질문이 계속 나왔다.
    const noSkip = nextMove(cov, "infancy", [], NOW, { layer: "meaning", streak: 3 }, []);
    expect(noSkip).toEqual({ kind: "drill", layer: "meaning" }); // ← 예전의 제자리 돌기

    const skipped = nextMove(cov, "infancy", [], NOW, { layer: "meaning", streak: 3 }, ["meaning"]);
    expect(skipped).toEqual({ kind: "drill", layer: "belief" }); // ← 지금은 넘어간다
  });

  it("층을 전부 포기해도 멈추지 않는다 (0으로 나누듯 막히지 않게)", () => {
    const all = ["fact", "feeling", "meaning", "belief", "echo"] as const;
    const move = nextMove(emptyCoverage(), "infancy", [], NOW, null, all);
    expect(move.kind).toBe("drill");
    expect(all).toContain((move as { layer: string }).layer);
  });

  it("발판 횟수 상한이 Simon 결정(2회)과 같다", () => {
    expect(MAX_SCAFFOLDS_PER_LAYER).toBe(2);
    expect(shouldScaffold(0)).toBe(false);
    expect(shouldScaffold(1)).toBe(true);
    expect(shouldScaffold(2)).toBe(true);
    expect(shouldScaffold(3)).toBe(false);
  });
});

describe("발판 문장은 해석을 요구하지 않는다", () => {
  const LAYERS = ["fact", "feeling", "meaning", "belief", "echo"] as const;

  it.each(LAYERS)("%s 층에 ko·en 발판이 두 개씩 있다", (l) => {
    for (const loc of ["ko", "en"] as const) {
      const pair = SCAFFOLD_FALLBACK[loc][l];
      expect(pair).toHaveLength(2);
      for (const q of pair) {
        expect(typeof q).toBe("string");
        expect(q).toContain("?");
        expect(q.length).toBeGreaterThan(15);
      }
      // 둘이 같으면 발판을 두 번 줘도 같은 문장이 두 번 나간다 -- 실측으로 겪었다.
      expect(pair[0]).not.toBe(pair[1]);
    }
  });

  it("발판 번호마다 다른 문장을 준다", () => {
    for (const loc of ["ko", "en"] as const) {
      for (const l of LAYERS) {
        expect(scaffoldQuestion(l, loc, 1)).toBe(SCAFFOLD_FALLBACK[loc][l][0]);
        expect(scaffoldQuestion(l, loc, 2)).toBe(SCAFFOLD_FALLBACK[loc][l][1]);
        expect(scaffoldQuestion(l, loc, 1)).not.toBe(scaffoldQuestion(l, loc, 2));
        // 범위를 벗어나도 터지지 않는다
        expect(typeof scaffoldQuestion(l, loc, 0)).toBe("string");
        expect(typeof scaffoldQuestion(l, loc, 9)).toBe("string");
      }
    }
  });

  it("발판이 원래 질문과 다르다 (같으면 발판이 아니다)", () => {
    // 원래 질문을 그대로 되돌려주면 방금 못 답한 그 질문을 다시 묻는 셈이다.
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "probe.ts"), "utf8",
    ) as string;
    const orig = /const LAYER_FALLBACK[\s\S]*?\n};/.exec(src)?.[0] ?? "";
    for (const loc of ["ko", "en"] as const) {
      for (const l of LAYERS) {
        for (const q of SCAFFOLD_FALLBACK[loc][l]) expect(orig).not.toContain(q);
      }
    }
  });
});

describe("⚠ 못 판 칸은 등급에도 안 잡힌다 (이 변경의 핵심)", () => {
  const periods = livedPeriods(31);

  it("'모르겠다' 세 번은 등급을 올리지 못한다", () => {
    // 예전 동작: 세 칸이 채워져 L2~L3 이 나왔다. 지금은 아무것도 안 채운다.
    const c = emptyCoverage();
    for (const answer of ["잘 모르겠는데", "모르겠다구", "글쎄"]) {
      expect(isNonAnswer(answer, "ko")).toBe(true);
      // 화면이 이 경우 incrementCoverage 를 부르지 않는다 -> 행렬은 그대로
    }
    expect(narrativeStarLevel(c, periods)).toBe(1);
  });

  it("진짜 답 세 번은 등급을 올린다 (막는 것이 과하지 않다)", () => {
    let c = emptyCoverage();
    for (const l of ["fact", "feeling", "meaning"] as const) {
      c = incrementCoverage(c, "infancy", l);
    }
    expect(narrativeStarLevel(c, periods)).toBeGreaterThan(1);
  });
});

describe("⚠ 층을 정하는 곳은 하나다 (실행해서 잡은 두 번째 결함)", () => {
  // 실측 2026-08-24: `nextMove` 가 "포기했으니 믿음으로" 라고 정했는데
  // `nextProbe` 가 그 결정을 버리고 `nextLayerSuggestion` 으로 **다시 골랐다.**
  // 그쪽은 포기 목록을 모르니 방금 포기한 의미(L3)를 도로 집었고, 화면에는
  // 같은 질문이 계속 나왔다. 화면이 `move.layer` 를 **항상** 넘겨야 한다.
  const SCREEN = readFileSync(join(__dirname, "..", "..", "..", "app", "interview.tsx"), "utf8");

  it("화면이 nextProbe 에 move.layer 를 항상 넘긴다", () => {
    expect(SCREEN).toContain("0, move.layer,");
    // 발판은 nextProbe 앞에서 반환하고, 평상시에도 nextMove가 고른 층을 넘긴다.
    expect(SCREEN).not.toContain("isScaffold ? move.layer : null");
  });

  it("nextProbe 가 넘겨받은 층을 우선한다", () => {
    const SRC = readFileSync(join(__dirname, "..", "probe.ts"), "utf8");
    expect(SRC).toContain("const layer = forceLayer ?? nextLayerSuggestion(coverage, period);");
  });
});

describe('⚠ "모르겠다"는 성찰 기록이 아니다 (되묻기가 대신 걸리지 않게)', () => {
  // 실측 2026-08-24: 같은 표현으로 세 번 못 답했더니 발판 대신 **되묻기**가 떴다.
  // "같은 결론으로 자꾸 돌아오시나요?" -- 못 답한 사람에게 곱씹는다고 말하는 셈이다.
  // 화면이 `entriesOf` 에서 비-답변을 걸러내야 `detectLoops` 가 그걸 안 본다.
  const SCREEN = readFileSync(join(__dirname, "..", "..", "..", "app", "interview.tsx"), "utf8");

  it("화면이 entriesOf 에서 비-답변을 걸러낸다", () => {
    expect(SCREEN).toContain(".filter((turn) => !isBlockedAnswer(turn.text))");
  });

  it("걸러내면 되묻기 기준(3편 초과)에 안 닿는다", () => {
    const answers = ["잘 모르겠는데", "잘 모르겠는데", "잘 모르겠는데", "잘 모르겠는데"];
    const kept = answers.filter((t) => !isNonAnswer(t, "ko"));
    expect(kept).toHaveLength(0);
  });
});

describe("발판은 네트워크 없이 즉시 보여준다", () => {
  const SCREEN = readFileSync(join(__dirname, "..", "..", "..", "app", "interview.tsx"), "utf8");
  const BOUNDARY = readFileSync(join(__dirname, "..", "..", "llm", "boundary.ts"), "utf8");

  it.each([
    ["ko", false, "죽고 싶어요. 모르겠어요"],
    ["ko", true, "죽고 싶어요. 모르겠어요"],
    ["en", false, "I want to die. I don't know."],
    ["en", true, "I want to die. I don't know."],
  ] as const)("compound red-zone은 locale=%s minor=%s에서도 scaffold가 아니다", (locale, minor, text) => {
    expect(text.toLowerCase()).toMatch(locale === "ko" ? /모르겠/ : /don't know/);
    expect(classifyInputAnyLocale(text, locale, { minor }).zone).toBe("red");
  });

  it.each([
    ["ko", "모르겠어요"],
    ["en", "I'm not sure"],
  ] as const)("exact CTA locale=%s는 green으로 남아 local scaffold를 쓴다", (locale, text) => {
    expect(classifyInputAnyLocale(text, locale).zone).toBe("green");
    const screenTreatsAsNonAnswer = text === (locale === "ko" ? "모르겠어요" : "I'm not sure")
      || isNonAnswer(text, locale);
    expect(screenTreatsAsNonAnswer).toBe(true);
  });

  it("화면은 exact locale CTA를 utility 판정과 동등한 non-answer로 처리한다", () => {
    expect(SCREEN).toContain('text === t("drill.dontKnow") || isNonAnswer(text, locale)');
    expect(SCREEN).toContain('onPress={() => void send(t("drill.dontKnow"))}');
  });

  it("C9 분류는 isNonAnswer·coverage·nextProbe보다 먼저 crisis/hotline으로 반환한다", () => {
    const sendStart = SCREEN.indexOf("async function send(override?: string) {");
    const classifier = SCREEN.indexOf("classifyInputAnyLocale(text, locale, { minor: isMinor === true })", sendStart);
    const redStart = SCREEN.indexOf('if (safety.zone === "red") {', classifier);
    const redReturn = SCREEN.indexOf("return;", redStart);
    const nonAnswer = SCREEN.indexOf("isBlockedAnswer(text)", sendStart);
    const coverageWrite = SCREEN.indexOf("setCoverage(nextCoverage)", sendStart);
    const llmBoundary = SCREEN.indexOf("await ask(nextTurns, nextCoverage", sendStart);

    expect(sendStart).toBeGreaterThan(-1);
    expect(classifier).toBeGreaterThan(sendStart);
    expect(nonAnswer).toBeGreaterThan(classifier);
    expect(coverageWrite).toBeGreaterThan(classifier);
    expect(llmBoundary).toBeGreaterThan(classifier);

    const redBranch = SCREEN.slice(redStart, redReturn + "return;".length);
    expect(SCREEN).toContain("const crisisRouting = useRef(false)");
    expect(redBranch).toContain("startInterviewCrisisRouting(");
    expect(redBranch).toContain("crisisRouting,");
    expect(redBranch).toContain("setBusy(true)");
    expect(redBranch).toContain("setCrisis({ visible: true, hotline: hotlineFor() })");
    expect(redBranch.indexOf("setCrisis")).toBeLessThan(redBranch.indexOf("route.done"));
    expect(redBranch).toContain("void route.done.catch(");
    expect(redBranch).not.toContain("await classifyInterviewTextForCrisis");
    expect(redBranch).not.toMatch(/isNonAnswer|incrementCoverage|setCoverage|nextProbe|callLlm/);
    expect(BOUNDARY).toMatch(/export function startInterviewCrisisRouting[\s\S]*onVisible\(\)[\s\S]*classifyInterviewTextForCrisis\(/);
    expect(BOUNDARY).toMatch(/async function routeCrisis[\s\S]*await writeAiAuditLog\(/);
    expect(BOUNDARY).toMatch(/async function routeCrisis[\s\S]*await writeCrisisEvent\(/);
    expect(SCREEN).toContain('isMinor ? "KR_1388" : "KR_109"');
    expect(SCREEN).toContain(': "GLOBAL_988"');
  });

  it("scaffold 클릭은 LLM 0회, POST 0회이며 coverage를 바꾸지 않는다", () => {
    const scaffoldStart = SCREEN.indexOf('if (move.kind === "scaffold") {');
    const llmBoundary = SCREEN.indexOf("const probe = await nextProbe(");

    expect(scaffoldStart).toBeGreaterThan(-1);
    expect(llmBoundary).toBeGreaterThan(scaffoldStart);

    const deterministicBranch = SCREEN.slice(scaffoldStart, llmBoundary);
    expect(deterministicBranch).toContain("scaffoldQuestion(move.layer, locale, stuck?.streak ?? 1)");
    expect(deterministicBranch).toContain("setPendingLayer(move.layer)");
    expect(deterministicBranch).toContain("return;");
    expect(deterministicBranch).not.toMatch(/nextProbe|callLlm|fetch|createRecord|addCoverage/);
    expect(deterministicBranch).not.toMatch(/(?:increment|decrement|set)Coverage/);
  });

  it('모르겠어요 action은 "여기까지 할래요"를 보여주는 v2 safe 계약이다', () => {
    const nav = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "..", "design", "pixel_clay_260825", "data", "nav.json"),
        "utf8",
      ),
    ) as {
      interview: {
        version: number;
        items: Array<Record<string, unknown>>;
      };
    };
    const action = nav.interview.items.find((item) => item.label === "모르겠어요");

    expect(nav.interview.version).toBe(2);
    expect(action).toEqual({
      label: "모르겠어요",
      kind: "action",
      safe: true,
      locator: { strategy: "role", role: "button", name: "모르겠어요" },
      effect: { type: "visible", role: "button", name: "여기까지 할래요" },
    });
  });

  it("stop button은 exact visible 검증이 읽을 수 있는 직접 painted label을 갖는다", () => {
    expect(SCREEN).toContain('accessibilityLabel={t("drill.enough")}');
    expect(SCREEN).toContain('<Text style={[m3TextStyle("labelLarge"), styles.answerChipText]}>');
    expect(SCREEN).toContain('{t("drill.enough")}');
  });
});
