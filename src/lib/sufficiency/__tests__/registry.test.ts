// 충분한 데이터 문턱 표를 **테스트가** 지킨다. (B2, 재설계 W0 · 2026-10-07)
//
// 문서는 코드가 바뀌어도 조용하다. 그래서 표의 약속을 실행 가능한 검사로 둔다 -
// `src/lib/lenses/__tests__/registry.test.ts` 의 관문 ① 방식(선언이 지목한 파일을
// 읽어서 그 선언이 실재하는지 본다)을 그대로 쓴다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOWANCE_LOCK_KINDS,
  DASHBOARD_THRESHOLDS,
  DASHBOARD_THRESHOLD_IDS,
  dashboardParam,
  DATA_UNITS,
  LLM_COMMON_LOCKS,
  LOCK_KINDS,
  THRESHOLDS,
  THRESHOLD_IDS,
  locksFor,
  sufficiencyFor,
  thresholdById,
  type DataTerm,
  type LockReason,
  type SourceRef,
  type ThresholdId,
} from "../registry";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** 표가 지목하는 모든 출처: 행의 source · 잠김의 source · 진행 표시 자리 · 공통 잠김. */
function allRefs(): { where: string; ref: SourceRef }[] {
  const out: { where: string; ref: SourceRef }[] = [];
  for (const row of THRESHOLDS) {
    out.push({ where: `${row.id}.source`, ref: row.source });
    row.lockReasons.forEach((l, i) => out.push({ where: `${row.id}.lockReasons[${i}]`, ref: l.source }));
    if (row.progress.at) out.push({ where: `${row.id}.progress.at`, ref: row.progress.at });
  }
  LLM_COMMON_LOCKS.forEach((l, i) => out.push({ where: `LLM_COMMON_LOCKS[${i}]`, ref: l.source }));
  return out;
}

describe("① 출처 - 선언이 지목한 파일에 그 식별자가 실재한다", () => {
  const refs = allRefs();

  it("검사할 출처가 실제로 있다 (검사가 놀고 있지 않다)", () => {
    expect(refs.length).toBeGreaterThanOrEqual(THRESHOLDS.length);
  });

  it.each(refs.map((r) => [r.where, r.ref] as const))("%s", (where, ref) => {
    let src: string;
    try {
      src = read(ref.file);
    } catch {
      throw new Error(
        `${where} 가 지목한 파일(${ref.file})이 없다. 파일이 옮겨졌다면 표를 같이 고칠 것.`,
      );
    }
    if (!src.includes(ref.anchor)) {
      throw new Error(
        `${where} 의 선언 \`${ref.anchor}\` 가 ${ref.file} 에 없다.\n` +
          `문턱 값이 바뀌었거나 상수가 옮겨졌다는 뜻이다. 표의 minimum · lockReasons 문장과\n` +
          `anchor 를 **같은 PR 에서** 고칠 것 - 표와 코드가 조용히 어긋나는 것이 이 표가 막으려는 일이다.`,
      );
    }
  });

  it("anchor 가 너무 짧지 않다 (우연히 통과하지 않게)", () => {
    for (const { where, ref } of refs) {
      if (ref.anchor.trim().length < 12) throw new Error(`${where} 의 anchor 가 너무 짧다: ${ref.anchor}`);
    }
  });
});

describe("② id - 중복이 없고 조사 원장과 일대일이다", () => {
  it("id 가 유일하다", () => {
    expect(new Set(THRESHOLD_IDS).size).toBe(THRESHOLDS.length);
  });

  it("행은 조사 원장 22개 + 대화 1개 = 23개다", () => {
    expect(THRESHOLDS).toHaveLength(23);
  });

  it("조사 원장 순번 1~22 가 한 번씩만 나온다", () => {
    const a3 = THRESHOLDS.map((r) => r.a3).filter((n): n is number => n !== null);
    expect([...a3].sort((x, y) => x - y)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });

  it("thresholdById 는 찾고, 없는 id 는 던진다", () => {
    expect(thresholdById("chat").a3).toBeNull();
    expect(() => thresholdById("nope" as ThresholdId)).toThrow(/unknown threshold/);
  });
});

describe("③ 대화 = 데이터 문턱 없음 (Simon 결정)", () => {
  const chat = thresholdById("chat");

  it("데이터 문턱이 0 이다", () => {
    expect(chat.minimum.terms).toHaveLength(0);
  });

  it("데이터 · 서버 설정 · 나이 · 순서 잠김이 없다 (사용량만 허용)", () => {
    // 하루 대화 한도(CHAT_DAILY_LIMIT)는 실재해서 선언돼 있다. 그것 말고는 없어야 한다.
    for (const lock of chat.lockReasons) {
      expect(ALLOWANCE_LOCK_KINDS).toContain(lock.kind);
    }
  });

  it("관측값을 하나도 안 넘겨도 대화는 준비돼 있다", () => {
    const s = sufficiencyFor("chat");
    expect(s.short).toHaveLength(0);
    expect(s.unknown).toHaveLength(0);
    expect(s.ready).toBe(true);
  });

  it("데이터 문턱이 0 인 gate 행은 무엇으로 닫히는지 lockReasons 에 적혀 있다", () => {
    // 문턱도 잠김도 없는 gate 는 '언제나 열림'이라는 뜻이고, 그건 표에 적을 문턱이 아니다.
    const silent = THRESHOLDS.filter(
      (r) => r.nature === "gate" && r.minimum.terms.length === 0 && r.lockReasons.length === 0,
    ).map((r) => r.id);
    expect(silent).toEqual([]);
  });
});

describe("④ 잠김 사유와 데이터 부족은 같은 칸에 섞이지 않는다", () => {
  it("타입 - 데이터 단위 자리에 잠김 종류를, 잠김 자리에 데이터 단위를 넣으면 컴파일이 깨진다", () => {
    const _badTerm: DataTerm = {
      key: "records.auditResponse",
      atLeast: 1,
      // @ts-expect-error 잠김 종류는 데이터 단위가 될 수 없다
      unit: "weeklyAllowance",
      of: "x",
    };
    const _badLock: LockReason = {
      // @ts-expect-error 데이터 단위는 잠김 종류가 될 수 없다
      kind: "row",
      text: "x",
      source: { file: "x", anchor: "x" },
    };
    expect(_badTerm.atLeast + _badLock.text.length).toBeGreaterThan(0);
  });

  it("런타임 - 단위 집합과 잠김 집합이 겹치지 않는다", () => {
    const units = new Set<string>(DATA_UNITS);
    for (const kind of LOCK_KINDS) expect(units.has(kind)).toBe(false);
  });

  it("모든 행의 데이터 문턱은 데이터 단위만, 잠김은 잠김 종류만 쓴다", () => {
    const units = new Set<string>(DATA_UNITS);
    const kinds = new Set<string>(LOCK_KINDS);
    for (const row of THRESHOLDS) {
      for (const term of row.minimum.terms) expect(units.has(term.unit)).toBe(true);
      for (const lock of locksFor(row)) expect(kinds.has(lock.kind)).toBe(true);
    }
  });

  it("데이터 문턱 문장에 잠김 이야기가 섞이지 않는다", () => {
    // 이 단어가 minimum.text 에 필요해지면 그건 lockReasons 로 옮길 내용이다.
    const LOCK_WORDS = ["한도", "플래그", "나이", "동의", "잠김", "잠금", "사용량"];
    for (const row of THRESHOLDS) {
      for (const word of LOCK_WORDS) {
        if (row.minimum.text.includes(word)) {
          throw new Error(`${row.id} 의 minimum.text 에 '${word}' 가 있다 - lockReasons 로 옮길 것`);
        }
      }
    }
  });

  it("판정도 둘을 따로 돌려준다 - 데이터가 충분해도 잠김은 잠김으로 남는다", () => {
    const s = sufficiencyFor("polaris.generate.weekly", { locks: { weeklyAllowance: true } });
    expect(s.short).toHaveLength(0);
    expect(s.locked.map((l) => l.kind)).toEqual(["weeklyAllowance"]);
    expect(s.ready).toBe(false);
  });
});

describe("판정 sufficiencyFor", () => {
  it("모자라면 얼마나 모자란지 말한다", () => {
    const s = sufficiencyFor("northstar.draft", { data: { "records.recentNonNorthstar": 3 } });
    expect(s.short).toHaveLength(1);
    expect(s.short[0].have).toBe(3);
    expect(s.short[0].need).toBe(5);
    expect(s.ready).toBe(false);
  });

  it("관측값이 없으면 0 이 아니라 '모름'이다", () => {
    const s = sufficiencyFor("seven.ratify", { data: { "interview.layers.period": 2 } });
    expect(s.short).toHaveLength(0);
    expect(s.unknown).toEqual(["interview.records.period"]);
    expect(s.ready).toBe(false);
  });

  it("any 는 하나만 넘어도 준비된다", () => {
    const s = sufficiencyFor("portrait.fields", {
      data: { "assessment.mbtiOrAttachment": 0, "assessment.valueFrameworks": 1 },
    });
    expect(s.ready).toBe(true);
  });

  it("LLM 출력에는 공통 동의 잠김이 붙고, LLM 이 없는 행에는 안 붙는다", () => {
    expect(sufficiencyFor("chat", { locks: { consent: true } }).locked.map((l) => l.kind)).toEqual(["consent"]);
    expect(sufficiencyFor("seven.brightness", { locks: { consent: true } }).locked).toHaveLength(0);
  });
});

describe("대시보드 하루 관리판 문턱 (PS-DASH-001, W0)", () => {
  it("id 가 유일하다", () => {
    expect(new Set(DASHBOARD_THRESHOLD_IDS).size).toBe(DASHBOARD_THRESHOLDS.length);
  });

  it("미정(null) 칸은 이름으로 센다 - 발주에 숫자가 없던 처리할 것 최소 점수 하나뿐", () => {
    const undecided = DASHBOARD_THRESHOLDS.flatMap((t) =>
      Object.entries(t.values).filter(([, v]) => v === null).map(([k]) => `${t.id}.${k}`),
    );
    expect(undecided).toEqual(["dash.P-04.minScore"]);
  });

  it("미정 칸을 숫자로 읽으려 하면 던진다 (조용히 0 으로 쓰지 않는다)", () => {
    expect(() => dashboardParam("dash.P-04", "minScore")).toThrow(/not decided yet/);
    expect(() => dashboardParam("dash.P-04", "nope")).toThrow(/unknown param/);
    expect(dashboardParam("dash.P-04", "maxCards")).toBe(3);
  });

  it("잠김은 잠김 종류만, 조건 문장에는 잠김 이야기가 없다", () => {
    const kinds = new Set<string>(LOCK_KINDS);
    const LOCK_WORDS = ["한도", "플래그", "나이", "동의", "잠김", "잠금", "사용량"];
    for (const t of DASHBOARD_THRESHOLDS) {
      for (const k of t.lockKinds) expect(kinds.has(k)).toBe(true);
      for (const word of LOCK_WORDS) {
        if (t.text.includes(word)) throw new Error(`${t.id} 의 text 에 '${word}' 가 있다 - lockKinds 로 옮길 것`);
      }
    }
  });

  it("발주의 숫자가 그대로 들어 있다 (값을 바꾸면 이 줄도 같이 바꾼다)", () => {
    expect(dashboardParam("dash.P-06", "usualWindowDays")).toBe(14);
    expect(dashboardParam("dash.P-06", "displayMinDays")).toBe(3);
    expect(dashboardParam("dash.P-06", "displayWindowDays")).toBe(7);
    expect(dashboardParam("dash.M-02", "minDays")).toBe(4);
    expect(dashboardParam("dash.M-05", "minTagged")).toBe(5);
    expect(dashboardParam("dash.custom", "snoozeDays")).toBe(30);
    expect([6, 13, 20]).toEqual([
      dashboardParam("dash.P-02", "morningHour"),
      dashboardParam("dash.P-02", "middayHour"),
      dashboardParam("dash.P-02", "eveningHour"),
    ]);
  });
});
