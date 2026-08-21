// 조사 판정 + **하드코딩 조사가 새로 들어오는 것을 막는 가드.**
//
// 가드가 이 파일의 본론이다. 지금 앱에는 조사 버그가 없는데, 그건 우연이 아니라
// `addressTerm()` 이 항상 받침으로 끝나게 설계했기 때문이다. 그 설계를 모르는
// 사람이 `{{domain}}을` 같은 문자열을 새로 추가하면 조용히 깨진다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { canDecideJosa, hasJongseong, josaFor, withJosa } from "../josa";

describe("조사 판정", () => {
  it("한글 받침을 본다", () => {
    expect(hasJongseong("서울")).toBe(true); // ㄹ
    expect(hasJongseong("커리어")).toBe(false);
    expect(hasJongseong("당신")).toBe(true); // ㄴ
    expect(hasJongseong("세컨비")).toBe(false);
    expect(hasJongseong("허슬케이님")).toBe(true); // ㅁ
  });

  it("숫자는 읽는 소리로 판정한다", () => {
    // 영·일·삼·육·칠·팔 = 받침 있음 / 이·사·오·구 = 없음
    for (const d of ["0", "1", "3", "6", "7", "8"]) expect(hasJongseong(d)).toBe(true);
    for (const d of ["2", "4", "5", "9"]) expect(hasJongseong(d)).toBe(false);
    // 여러 자리는 마지막 자리만 본다
    expect(hasJongseong("2026")).toBe(true); // …육
    expect(hasJongseong("12")).toBe(false); // …이
  });

  it("네 쌍을 올바른 방향으로 만든다", () => {
    expect(withJosa("기록", "을를")).toBe("기록을");
    expect(withJosa("커리어", "을를")).toBe("커리어를");
    expect(withJosa("기록", "이가")).toBe("기록이");
    expect(withJosa("커리어", "이가")).toBe("커리어가");
    expect(withJosa("기록", "은는")).toBe("기록은");
    expect(withJosa("커리어", "은는")).toBe("커리어는");
  });

  it("와/과 는 방향이 반대다", () => {
    // 다른 쌍과 달리 받침이 있으면 '과' 다. 헷갈려서 자주 틀리는 자리.
    expect(withJosa("기록", "와과")).toBe("기록과");
    expect(withJosa("커리어", "와과")).toBe("커리어와");
  });

  // ── 원본 프로토타입이 놓친 것 ────────────────────────────────
  it("(으)로 의 ㄹ 예외를 지킨다", () => {
    // 인수 프로토타입(sb-persona.jsx:324-331)은 이 예외가 없어서 "…일으로" 를 만든다.
    expect(withJosa("서울", "으로로")).toBe("서울로"); // ㄹ 받침 -> 로
    expect(withJosa("1", "으로로")).toBe("1로"); // 일 -> ㄹ
    expect(withJosa("7", "으로로")).toBe("7로"); // 칠 -> ㄹ
    expect(withJosa("8", "으로로")).toBe("8로"); // 팔 -> ㄹ
    expect(withJosa("기록", "으로로")).toBe("기록으로"); // ㄱ 받침 -> 으로
    expect(withJosa("커리어", "으로로")).toBe("커리어로"); // 받침 없음 -> 로
    expect(withJosa("3", "으로로")).toBe("3으로"); // 삼 -> ㅁ
  });

  it("장식 문자를 건너뛰고 판정한다", () => {
    expect(withJosa("(커리어)", "을를")).toBe("(커리어)를");
    expect(withJosa("기록.", "이가")).toBe("기록.이");
  });

  it("판정할 수 없는 값을 스스로 밝힌다", () => {
    // 라틴 문자는 읽는 소리를 모른다. 조용히 틀리는 대신 물어볼 수 있어야 한다.
    expect(canDecideJosa("Slack")).toBe(false);
    expect(canDecideJosa("기록")).toBe(true);
    expect(canDecideJosa("2026")).toBe(true);
    expect(canDecideJosa("")).toBe(false);
    // 판정 불가는 받침 없음 쪽으로 떨어진다 (fail-soft).
    expect(josaFor("Slack", "을를")).toBe("를");
  });
});

// ── 가드 ──────────────────────────────────────────────────────
//
// 한국어 로케일에서 `{{변수}}조사` 형태를 찾아, **받침이 보장된다고 증명된
// 변수**가 아니면 실패시킨다.
describe("로케일에 하드코딩된 조사", () => {
  /**
   * 받침이 보장되어 하드코딩해도 되는 보간 변수.
   *
   * 새로 추가하려면 **왜 항상 받침으로 끝나는지** 근거를 함께 적어라.
   * 근거를 못 대면 `withJosa()` 를 쓰고 문자열에서 조사를 빼는 것이 맞다.
   */
  const JONGSEONG_GUARANTEED: Record<string, string> = {
    // addressTerm() 이 항상 "님" 을 붙이고, 이름이 없으면 "당신" 으로 폴백한다.
    // 둘 다 받침으로 끝난다. src/lib/persona/address.ts 헤더에 근거가 있다.
    who: "addressTerm(): 항상 '…님' 또는 '당신'",
    // CONFIRM_PHRASE = "DELETE" 고정 상수. 값이 바뀌지 않는다.
    phrase: 'CONFIRM_PHRASE = "DELETE" 고정 상수',
  };

  const KO = join(process.cwd(), "locales", "ko");
  const PATTERN = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}(을|를|이|가|은|는|와|과|으로|로|이나|나)(?![가-힣])/g;

  function offenders(): string[] {
    const out: string[] = [];
    const walk = (node: unknown, file: string, keyPath: string): void => {
      if (typeof node === "string") {
        for (const m of node.matchAll(PATTERN)) {
          if (m[1] in JONGSEONG_GUARANTEED) continue;
          out.push(`${file}:${keyPath} → {{${m[1]}}}${m[2]}`);
        }
        return;
      }
      if (!node || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, file, keyPath ? `${keyPath}.${k}` : k);
      }
    };
    for (const f of readdirSync(KO)) {
      if (!f.endsWith(".json")) continue;
      walk(JSON.parse(readFileSync(join(KO, f), "utf8")), f, "");
    }
    return out.sort();
  }

  it("받침이 보장되지 않는 값 뒤에 조사를 하드코딩하지 않는다", () => {
    // 실패했다면 둘 중 하나다:
    //   1. 그 변수도 항상 받침으로 끝난다  -> JONGSEONG_GUARANTEED 에 근거와 함께 추가
    //   2. 아니다                          -> 문자열에서 조사를 빼고 withJosa() 로 붙인다
    expect(offenders()).toEqual([]);
  });

  it("안전 목록의 모든 항목이 근거를 달고 있다", () => {
    for (const [k, why] of Object.entries(JONGSEONG_GUARANTEED)) {
      expect({ key: k, hasReason: why.trim().length > 8 }).toEqual({ key: k, hasReason: true });
    }
  });

  it("안전 목록이 실제로 쓰이고 있다", () => {
    // 안 쓰이는 면제는 낡은 면제다. 근거가 사라졌는데 목록만 남으면
    // 다음에 같은 이름을 쓴 새 변수가 공짜로 통과한다.
    const all = readdirSync(KO)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readFileSync(join(KO, f), "utf8"))
      .join("\n");
    for (const k of Object.keys(JONGSEONG_GUARANTEED)) {
      expect({ key: k, used: new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`).test(all) }).toEqual({
        key: k,
        used: true,
      });
    }
  });
});
