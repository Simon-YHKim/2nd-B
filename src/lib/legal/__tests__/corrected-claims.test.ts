// 한 번 정정한 주장이 **다른 자리에서 다시 서 있지 않은가.**
//
// ## 무엇을 검사하고 무엇을 검사하지 않는가
//
// 회차 67 이 이렇게 적었다: *"'인용이 맞다' 는 검사할 수 있고 '문단이 제 인용과
// 같은 말을 한다' 는 못 한다."* **앞은 맞고 뒤는 너무 넓게 말한 것이었다.**
//
// 산문의 모순 일반은 기계가 못 읽는다. 그건 그대로다. 그런데 이 저장소에서
// 실제로 일어난 것은 **그보다 훨씬 좁은 모양**이었다 - 문서가 어떤 주장을
// 여러 자리에 적어 두고, 정정이 **산문만** 훑고 지나가고, **표와 요약이 옛
// 주장을 그대로 들고 남는 것.**
//
// 그 좁은 모양은 검사할 수 있다.
//
// ## 실측 (2026-09-08, 회차 73)
//
// "가입 동의 UI 가 아직 배선되지 않았다" 는 주장이 회차 64·67·69 에서 **세 번**
// 정정됐다. 그런데 세 번을 다 살아남은 자리가 **셋 더** 있었고, 하필 셋 다
// **행동을 결정하는 표**였다:
//
//     :603  잔여위험 등급표    "High until sign-up consent UI ships"  · Launch-blocking
//     :613  런치 블로커 목록   "5B-R2 (consent UI not wired)"
//     :680  갭 표 8행          제목이 **제 Status 칸과 모순**  · P1
//
// 회차 69 의 C-SENS 와 같은 이유다 - **정정하는 사람이 문단을 읽고 있었고 표는
// 산문이 아니었다.**
//
// ## 인용된 것과 서 있는 것을 가른다
//
// 정정문은 옛 주장을 **인용**한다(회차 67·69 가 그렇게 썼다). 그래서 문자열만
// 세면 정정문 자신이 위반으로 잡힌다 - **지키려는 대상보다 넓은 검사**가 된다.
// 따옴표 안이면 기록이고, 밖이면 살아 있는 주장이다.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEGAL = path.join(ROOT, "docs", "legal");

interface CorrectedClaim {
  /** 무엇에 대한 주장인가. */
  subject: RegExp;
  /** "아직 아니다" 라고 말하는 표현. */
  stale: RegExp;
  /** 왜 이 주장이 이제 거짓인가 - 근거가 되는 자리. */
  why: string;
  /** 살아 있어도 되는 자리와 그 이유. 정정문이 과거형으로 옛 근거를 **서술**하는
   *  경우가 있고, 그것은 인용부호가 없어도 기록이다. */
  standing: Readonly<Record<string, string>>;
}

const CORRECTED: CorrectedClaim[] = [
  {
    subject: /consent (?:UI|capture|notice)|ack checkboxes|notice\/ack/i,
    stale: /not wired|not yet wired|until .{0,40}ships|has not shipped/i,
    why:
      "가입 동의 수집은 배선돼 있다 - `signup-required-acks.test.ts` 가 **배송 화면**" +
      "(`dds-sign-up-screen.tsx`)을 읽어 필수 ack 이 전부 렌더되는지 확인하고, " +
      "`recordConsentBestEffort()` 가 append-only 원장에 쓴다. 회차 64·67·69 가 이 주장을 " +
      "세 번 정정했고, 표 셋이 세 번을 다 살아남았다.",
    standing: {
      "was rated **material** on the basis that the notice and ack checkboxes were not wired":
        "정정문이 **옛 등급의 근거를 과거형으로 서술**하는 자리다. 바로 뒤에 " +
        "'**They are wired**' 가 온다 - 주장이 아니라 무엇을 뒤집는지 밝히는 문장.",
    },
  },
];

/** 따옴표(“…” 또는 "…") 안에 있는 구간. 그 안의 옛 주장은 **기록**이다. */
const QUOTED = /[“"][^“”"]{0,400}?[”"]/g;

function legalLines(): { doc: string; line: number; text: string }[] {
  const out: { doc: string; line: number; text: string }[] = [];
  for (const name of fs.readdirSync(LEGAL).filter(n => n.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(LEGAL, name), "utf8").replace(/\r\n/g, "\n");
    text.split("\n").forEach((line, i) => out.push({ doc: name, line: i + 1, text: line }));
  }
  return out;
}

const lines = legalLines();

/** 그 줄에서 `stale` 이 **따옴표 밖에** 서 있는가. */
function standsUnquoted(text: string, stale: RegExp): boolean {
  const m = stale.exec(text);
  if (!m) return false;
  const spans = [...text.matchAll(QUOTED)].map(q => [q.index ?? 0, (q.index ?? 0) + q[0].length]);
  return !spans.some(([a, b]) => a <= m.index && m.index + m[0].length <= b);
}

describe("정정한 주장이 다른 자리에서 다시 서 있지 않다", () => {
  it("법무 문서를 실제로 읽었다 - 0건 통과를 막는다", () => {
    expect(lines.length).toBeGreaterThan(800);
    expect(CORRECTED.length).toBeGreaterThanOrEqual(1);
  });

  it("옛 주장이 문서 어딘가에 **인용된 채로는** 남아 있다 - 대조군", () => {
    // 하나도 안 남아 있으면 정정문이 사라졌다는 뜻이고, 그러면 아래 검사는
    // 아무것도 안 지킨다. **제 산문에 매치되는 대조군은 대조군이 아니므로**
    // 여기서는 반대로 "따옴표 안" 만 센다.
    for (const c of CORRECTED) {
      const quoted = lines.filter(
        l => c.subject.test(l.text) && c.stale.test(l.text) && !standsUnquoted(l.text, c.stale),
      );
      expect(quoted.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("살아 있는 옛 주장이 없다 - 명단에 적힌 자리만 예외", () => {
    const live: string[] = [];
    for (const c of CORRECTED) {
      for (const l of lines) {
        if (!c.subject.test(l.text) || !standsUnquoted(l.text, c.stale)) continue;
        const excused = Object.keys(c.standing).some(k => l.text.includes(k));
        if (!excused) live.push(`${l.doc}:${l.line} :: ${l.text.trim().slice(0, 90)}`);
      }
    }
    expect(live).toEqual([]);
  });

  it("명단의 모든 면제가 아직 지킬 대상을 갖는다", () => {
    // 면제가 가리키던 문장이 사라지면 그 줄은 아무것도 설명하지 않으면서 남는다.
    // "설명이 틀렸다" 와 "설명할 것이 없어졌다" 는 다른 상태다.
    const orphan: string[] = [];
    for (const c of CORRECTED) {
      for (const key of Object.keys(c.standing)) {
        if (!lines.some(l => l.text.includes(key))) orphan.push(key.slice(0, 60));
      }
    }
    expect(orphan).toEqual([]);
  });

  it("모든 면제가 근거를 적었다", () => {
    const thin: string[] = [];
    for (const c of CORRECTED) {
      for (const [key, reason] of Object.entries(c.standing)) {
        if (reason.trim().length < 20) thin.push(key.slice(0, 60));
      }
    }
    expect(thin).toEqual([]);
  });

  it("각 주장이 왜 거짓인지 적혀 있다", () => {
    expect(CORRECTED.filter(c => c.why.trim().length < 40)).toEqual([]);
  });
});
