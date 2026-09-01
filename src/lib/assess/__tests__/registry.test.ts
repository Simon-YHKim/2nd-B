// 레지스트리가 **실제 앱과 어긋나지 않는가.**
//
// 렌즈 레지스트리(`src/lib/lenses/__tests__/registry.test.ts`)와 같은 방식이다:
// 목록이 자기 자신만 보고 통과하면 의미가 없으므로, **화면 소스를 읽어서**
// 대조한다. 태그가 어긋나면 완료 판정이 조용히 실패하고(= 이미 한 검사를 계속
// 권한다) 그건 테스트 없이는 안 보인다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ASSESSMENTS,
  OFFERABLE,
  completionRatio,
  getAssessment,
  recommendAssessments,
  type AssessmentId,
  type AssessmentStates,
} from "../registry";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** URL 라우트 -> Expo 화면 파일. query/hash는 화면 파일명이 아니다. */
const screenFor = (route: string) => `src/app${route.split(/[?#]/, 1)[0]}.tsx`;

describe("레지스트리가 실재하는 화면을 가리킨다", () => {
  it("검사가 놀고 있지 않다", () => {
    expect(ASSESSMENTS.length).toBeGreaterThan(5);
  });

  it.each(ASSESSMENTS.map((a) => [a.id, a] as const))("%s 의 라우트 파일이 있다", (id, a) => {
    expect(existsSync(join(ROOT, screenFor(a.route)))).toBe(true);
  });

  it("id 와 라우트가 유일하다", () => {
    expect(new Set(ASSESSMENTS.map((a) => a.id)).size).toBe(ASSESSMENTS.length);
    expect(new Set(ASSESSMENTS.map((a) => a.route)).size).toBe(ASSESSMENTS.length);
  });

  it("Life Audit은 deep-space에서도 고정 스크리너를 명시적으로 연다", () => {
    const audit = getAssessment("audit");
    expect(audit.route).toBe("/audit?screener=1");
    expect(screenFor(audit.route)).toBe("src/app/audit.tsx");

    const screen = read(screenFor(audit.route));
    expect(screen).toContain("useLocalSearchParams");
    expect(screen).toMatch(/screener\s*===\s*["']1["']/);
  });

  it("직접 만든 Life Audit 진입점도 PastMe 기본 경로로 새지 않는다", () => {
    const explicitRoute = 'route: "/audit?screener=1"';
    const persona = read("src/app/persona.tsx");
    expect(persona).not.toContain('route: "/audit"');
    expect(persona.split(explicitRoute).length - 1).toBeGreaterThanOrEqual(5);
    expect(read("src/app/capture.tsx")).toContain('router.push("/audit?screener=1")');
  });
});

describe("완료 태그가 화면이 실제로 쓰는 태그와 같다", () => {
  // 이게 이 파일의 관문 ① 이다. 태그가 어긋나면 "이미 했는데 또 권하는" 버그가
  // 생기고, 그건 화면을 열어보기 전에는 안 보인다.
  //
  // 대조 대상은 화면의 `createRecord({ tags: [...] })` 이거나, 화면이 태그를
  // 안 쓰는 경우 그 결과를 읽는 로더(`persona/build.ts` 의 `.contains`)다.
  const SOURCES = ["src/lib/persona/build.ts"];

  it.each(
    ASSESSMENTS.filter((a) => a.provenance !== "dormant" && a.completionTags.length > 0).map(
      (a) => [a.id, a] as const,
    ),
  )("%s", (id, a) => {
    const screen = read(screenFor(a.route));
    const haystack = screen + SOURCES.map(read).join("\n");
    for (const tag of a.completionTags) {
      if (!haystack.includes(`"${tag}"`)) {
        throw new Error(
          `"${id}" 의 완료 태그 "${tag}" 가 ${a.route} 화면에도, 로더에도 없다.\n` +
            `화면이 태그를 바꿨다면 레지스트리도 같이 고칠 것 — 안 그러면 이미 끝낸 ` +
            `검사를 계속 권하게 되고, 증상은 조용하다.`,
        );
      }
    }
  });
});

describe("휴면 도구는 어디서도 권하지 않는다 (그러나 지우지도 않는다)", () => {
  const dormant = ASSESSMENTS.filter((a) => a.provenance === "dormant");

  it("휴면 목록이 비어 있지 않다 (검사가 놀고 있지 않다)", () => {
    expect(dormant.length).toBeGreaterThan(0);
  });

  it("OFFERABLE 에서 빠진다", () => {
    for (const a of dormant) expect(OFFERABLE.map((o) => o.id)).not.toContain(a.id);
  });

  it("추천에서 절대 안 나온다 (아무것도 안 한 상태에서도)", () => {
    const all = recommendAssessments({}, new Date("2026-08-23T00:00:00Z"), 99);
    for (const a of dormant) expect(all.map((r) => r.id)).not.toContain(a.id);
  });

  it("그렇다고 모듈을 지우지는 않는다 (Simon D5)", () => {
    // 휴면 != 폐기. MBTI 문항과 채점기는 호출부가 없어도 온전히 남아 있어야
    // 한다 -- Simon D5 (2026-08-18) "재미로 할 수 있도록 작업은 해놓자. 화면을
    // 살릴지는 나중에." 내가 이걸 "죽은 코드" 로 읽고 지우는 PR 을 냈다가
    // 철회했다(#1329).
    const mbti = read("src/lib/persona/mbti.ts");
    expect(mbti).toContain("export const MBTI_ITEMS");
    expect(mbti).toContain("export function scoreMbti");
  });

  it("휴면 화면은 리다이렉트다", () => {
    for (const a of dormant) {
      expect(read(screenFor(a.route))).toContain("<Redirect");
    }
  });

  it("어떤 도구 목록도 휴면 라우트를 안 걸어둔다", () => {
    // 실제로 있었던 버그: MBTI 화면이 은퇴해 리다이렉트가 됐는데 `/persona` 의
    // 도구 카드가 여전히 MBTI 를 권했다. 누르면 같은 화면으로 되돌아온다 --
    // 사용자에게는 버튼이 안 먹는 것으로 보인다. 레거시 스킨에만 있어서
    // 배포되진 않았지만, 목록과 화면이 갈라지는 그 형태 자체가 문제다.
    //
    // 화면 파일 전체를 훑는다. `/persona` 만 보면 다음 목록이 다른 데 생겼을 때
    // 또 놓친다.
    const files = ["src/app/persona.tsx", "src/app/core-brain.tsx"];
    for (const f of files) {
      const src = read(f);
      for (const a of dormant) {
        expect(src).not.toContain(`route: "${a.route}"`);
        expect(src).not.toContain(`push("${a.route}")`);
      }
    }
  });

  it("휴면 도구는 라벨 키를 안 갖는다 (도구 목록에 나올 준비를 안 한다)", () => {
    for (const a of dormant) expect(a.labelKey).toBe("");
  });
});

describe("화면이 레지스트리에서 목록을 끌어온다", () => {
  // 하드코딩된 목록은 조용히 갈라진다. 실제로 그랬다 -- `/core-brain` 이 넷만
  // 걸어두고 있어서 아홉 중 다섯(IPIP-NEO-120 · 생활만족 · 동기 · 인생점검 ·
  // 대화)은 그 화면에서 닿을 수 없었다.
  const src = read("src/app/core-brain.tsx");

  it("도구 목록을 registry 에서 만든다", () => {
    expect(src).toContain('from "@/lib/assess/registry"');
    expect(src).toContain("VALIDATED_TOOLS");
    expect(src).toContain("SELF_TOOLS");
  });

  it("라우트를 손으로 안 적는다", () => {
    // 레지스트리를 쓰기 전에는 `route: "/big-five"` 처럼 박혀 있었다.
    for (const a of OFFERABLE) {
      expect(src).not.toContain(`route: "${a.route}"`);
    }
  });

  it("검증된 것과 자체 제작을 갈라 놓는다", () => {
    // "검증된 검사로 별을 하나씩 밝힙니다" 아래에 자체 문항이 섞여 있었다.
    // 문구가 그렇게 말하는 이상 그건 화면이 거짓말을 하는 것이다.
    expect(src).toContain('t("validatedChecks")');
    expect(src).toContain('t("selfChecks")');
    const validatedAt = src.indexOf('t("validatedChecks")');
    const selfAt = src.indexOf('t("selfChecks")');
    const validatedList = src.indexOf("VALIDATED_TOOLS.map");
    const selfList = src.indexOf("SELF_TOOLS.map");
    // 검증 목록은 검증 문구 뒤, 자체 문구 앞에 있어야 한다.
    expect(validatedList).toBeGreaterThan(validatedAt);
    expect(validatedList).toBeLessThan(selfAt);
    expect(selfList).toBeGreaterThan(selfAt);
  });

  it("모든 라벨 키가 로케일 5종에 다 있다", () => {
    for (const locale of ["en", "ko", "es", "id", "pt"]) {
      const dict = JSON.parse(read(`locales/${locale}/core-brain.json`));
      for (const a of OFFERABLE) {
        expect(typeof dict[a.labelKey]).toBe("string");
      }
      expect(typeof dict.selfChecks).toBe("string");
    }
  });
});

describe("추천 순서", () => {
  const NOW = new Date("2026-08-23T00:00:00Z");
  const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  it("아무것도 안 했으면 싼 것부터 권한다", () => {
    const rec = recommendAssessments({}, NOW, 3);
    const minutes = rec.map((r) => getAssessment(r.id).minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(rec[0].reason).toBe("new");
  });

  it("120문항을 12문항보다 먼저 권하지 않는다", () => {
    const rec = recommendAssessments({}, NOW, 99);
    const ids = rec.map((r) => r.id);
    expect(ids.indexOf("ecrS")).toBeLessThan(ids.indexOf("ipipNeo120"));
  });

  it("한 것은 다시 안 권한다 (주기가 아직 안 됐으면)", () => {
    const states: AssessmentStates = { ecrS: { completedAt: ago(10) } };
    expect(recommendAssessments(states, NOW, 99).map((r) => r.id)).not.toContain("ecrS");
  });

  it("주기가 지나면 재검으로 다시 나온다", () => {
    const states: AssessmentStates = { rlss: { completedAt: ago(40) } }; // 주기 30일
    const rec = recommendAssessments(states, NOW, 99).find((r) => r.id === "rlss");
    expect(rec?.reason).toBe("retest");
  });

  it("안 한 것이 재검보다 먼저다", () => {
    const states: AssessmentStates = { rlss: { completedAt: ago(400) } };
    const rec = recommendAssessments(states, NOW, 99);
    const firstRetest = rec.findIndex((r) => r.reason === "retest");
    const lastNew = rec.map((r) => r.reason).lastIndexOf("new");
    expect(lastNew).toBeLessThan(firstRetest);
  });

  it("상위 도구를 했으면 하위는 안 권한다", () => {
    const states: AssessmentStates = { ipipNeo120: { completedAt: ago(1) } };
    expect(recommendAssessments(states, NOW, 99).map((r) => r.id)).not.toContain("bfi44");
  });

  it("반대는 아니다 — BFI-44 를 했어도 IPIP 는 여전히 권한다", () => {
    const states: AssessmentStates = { bfi44: { completedAt: ago(1) } };
    expect(recommendAssessments(states, NOW, 99).map((r) => r.id)).toContain("ipipNeo120");
  });

  it("재검 주기가 없는 것은 영영 재검으로 안 나온다", () => {
    const states: AssessmentStates = { interview: { completedAt: ago(9999) } };
    expect(recommendAssessments(states, NOW, 99).map((r) => r.id)).not.toContain("interview");
  });

  it("미래 시각이 찍혀 있어도 재검으로 안 샌다 (기기 시계 변경)", () => {
    const future = new Date(NOW.getTime() + 86_400_000 * 30).toISOString();
    const states: AssessmentStates = { rlss: { completedAt: future } };
    expect(recommendAssessments(states, NOW, 99).map((r) => r.id)).not.toContain("rlss");
  });

  it("limit 를 지킨다", () => {
    expect(recommendAssessments({}, NOW, 2)).toHaveLength(2);
  });
});

describe("출처 구분", () => {
  it("자체 제작 문항을 검증 척도라고 부르지 않는다", () => {
    // values/strengths/motivation 은 프레임워크 어휘만 빌린 자체 문항이다.
    // 파일 헤더가 스스로 그렇게 적고 있고, 여기서도 그렇게 표시해야 한다.
    for (const id of ["values", "strengths", "motivation"] as AssessmentId[]) {
      expect(getAssessment(id).provenance).toBe("selfAuthored");
    }
  });

  it("검증 척도로 표시한 것은 실제로 출판된 척도다", () => {
    for (const id of ["bfi44", "ipipNeo120", "ecrS", "rlss"] as AssessmentId[]) {
      expect(getAssessment(id).provenance).toBe("validated");
    }
  });

  it("자체 제작 파일이 스스로 그렇게 적고 있다 (표시가 근거를 갖는다)", () => {
    const files: Record<string, string> = {
      values: "src/lib/persona/values-survey.ts",
      strengths: "src/lib/persona/strengths-survey.ts",
      motivation: "src/lib/persona/motivation-survey.ts",
    };
    for (const [, path] of Object.entries(files)) {
      expect(read(path)).toContain("self-report");
    }
  });
});

describe("completionRatio", () => {
  it("아무것도 안 했으면 0", () => {
    expect(completionRatio({})).toBe(0);
  });

  it("휴면은 분모에 안 들어간다", () => {
    const all: AssessmentStates = {};
    for (const a of OFFERABLE) all[a.id] = { completedAt: "2026-01-01T00:00:00Z" };
    expect(completionRatio(all)).toBe(1);
  });
});

describe("재검 주기가 리서치와 어긋나지 않는다", () => {
  it("성격 검사를 한 달 안에 다시 권하지 않는다", () => {
    // 성격은 10년에 0.1~0.2 SD 움직인다(Roberts 2006). 짧은 주기 재검은
    // 변화가 아니라 측정 노이즈를 보여주고, 사용자는 그걸 변화로 읽는다.
    for (const id of ["bfi44", "ipipNeo120", "ecrS"] as AssessmentId[]) {
      const days = getAssessment(id).retestDays;
      expect(days).not.toBeNull();
      expect(days!).toBeGreaterThanOrEqual(180);
    }
  });

  it("생활만족은 성격보다 자주 잰다", () => {
    // wellbeing-kpi 배치의 cadence: WHO-5 주간 · SWLS 월간 · PERMA 분기.
    expect(getAssessment("rlss").retestDays!).toBeLessThan(getAssessment("bfi44").retestDays!);
  });
});
