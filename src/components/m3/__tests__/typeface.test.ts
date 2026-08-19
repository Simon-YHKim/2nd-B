// 타입 역할 -> 실제로 로드된 Galmuri 얼굴 (PIXEL-CLAY 2단계).
//
// 2단계 전 이 파일은 `robotoFor` 가 굵기를 Roboto 3종에 매핑하는지 봤다. 그 시험은
// 통과하면서도 **정작 중요한 것을 못 봤다** — 그 매핑이 `m3.font.*` 를 한 번도 안
// 읽어서, 토큰을 바꿔도 화면이 안 바뀌는 상태였다는 것. 그래서 여기서는 이름 매핑이
// 아니라 **격자와 실재성**을 시험한다: 크기가 얼굴의 정수배인가, 그 얼굴이 진짜
// 번들에 있는가.
import { readFileSync } from "node:fs";
import path from "node:path";

import { m3, m3Type } from "@/lib/theme/m3";

import { NATIVE_PX, chromeFaceFor, faceForSize, galmuriFor, m3TextStyle } from "../typeface";

const ROOT = path.resolve(__dirname, "../../../..");
const typographySrc = readFileSync(path.join(ROOT, "src/theme/typography.ts"), "utf8");

/** `fontAssets` 에 실제로 등록된 키. 문자열이 여기 없으면 런타임에 시스템 폰트로 떨어진다. */
function isRegistered(family: string): boolean {
  // 정규식 대신 정확한 문자열 — `Galmuri11:` 이 `Galmuri11Bold:` 에 걸리지 않게
  // 콜론까지 포함해서 본다.
  return typographySrc.includes(`
  ${family}:`);
}

describe("크기가 얼굴을 정한다 — 픽셀 격자", () => {
  test("모든 타입 역할의 크기가 그 얼굴의 정수배다", () => {
    // 이것이 이 이주 전체에서 제일 조용한 실패다. 분수 배율은 깨지지 않고 그냥
    // **흐려진다** — 스크린샷으로도 테스트로도 안 잡히던 종류다.
    const offGrid = Object.entries(m3Type)
      .map(([role, t]) => {
        const face = faceForSize(t.size);
        return { role, size: t.size, face, multiple: t.size / NATIVE_PX[face] };
      })
      .filter((r) => !Number.isInteger(r.multiple));
    expect(offGrid).toEqual([]);
  });

  test("PRD §2-4 가 허용한 여섯 크기만 쓴다", () => {
    const sizes = [...new Set(Object.values(m3Type).map((t) => t.size))].sort((a, b) => a - b);
    expect(sizes).toEqual([10, 12, 15, 24, 30, 45]);
  });

  test("자간이 전부 0 이다", () => {
    // 분수 자간은 글리프를 반픽셀에 앉힌다. 브리지도 letter-spacing 을 선언하지 않는다.
    const withTracking = Object.entries(m3Type)
      .filter(([, t]) => t.tracking !== 0)
      .map(([role]) => role);
    expect(withTracking).toEqual([]);
  });

  test("줄높이가 전부 정수다", () => {
    // RN 의 lineHeight 는 dp 다. 45x1.5=67.5 같은 값을 그대로 두면 줄 상자가
    // 반픽셀에 앉는다.
    const fractional = Object.entries(m3Type)
      .filter(([, t]) => !Number.isInteger(t.line))
      .map(([role, t]) => `${role}=${t.line}`);
    expect(fractional).toEqual([]);
  });
});

describe("굵기는 진짜 얼굴이 있을 때만", () => {
  test("700 을 요구하는 역할은 전부 Bold 얼굴이 등록된 서체다", () => {
    // Galmuri 중 Bold 를 파는 것은 11 하나다. 얼굴이 없는 굵기를 요청하면
    // 안드로이드에서 가짜 굵기나 시스템 폰트로 떨어져 격자가 깨진다.
    const bad = Object.entries(m3Type)
      .filter(([, t]) => t.weight === "700")
      .map(([role, t]) => ({ role, family: galmuriFor(t.size, t.weight) }))
      .filter((r) => !r.family.endsWith("Bold"));
    expect(bad).toEqual([]);
  });

  test("500 은 어떤 역할도 쓰지 않는다", () => {
    // `m3Type` 이 `as const` 라 굵기 합집합이 "400" | "700" 으로 좁혀져 있고,
    // 그래서 `t.weight === "500"` 은 **컴파일이 거부한다**(TS2367). 런타임 비교보다
    // 강한 보증이라 그 사실 자체를 시험으로 박아둔다 — 누가 500 을 되살리면
    // 이 배열이 비지 않게 된다.
    const weights = [...new Set(Object.values(m3Type).map((t) => t.weight))].sort();
    expect(weights).toEqual(["400", "700"]);
  });

  test("500 을 넘겨도 가짜 중간굵기를 만들지 않고 400 얼굴을 준다", () => {
    expect(galmuriFor(12, "500")).toBe("Galmuri11");
    expect(galmuriFor(12, "700")).toBe("Galmuri11Bold");
  });
});

describe("해석된 얼굴이 실제로 번들에 있다", () => {
  test("모든 역할이 등록된 패밀리로 해석된다", () => {
    // 이 시험의 요점은 이름 대조가 아니라 **등록 여부**다. 문자열이 fontAssets 에
    // 없으면 RN 은 조용히 시스템 폰트로 떨어지고, 화면은 '픽셀이 아닌 것' 말고는
    // 아무 신호도 안 준다.
    const unregistered = (Object.keys(m3Type) as (keyof typeof m3Type)[])
      .map((role) => m3TextStyle(role).fontFamily)
      .filter((family, i, all) => all.indexOf(family) === i)
      .filter((family) => !isRegistered(family));
    expect(unregistered).toEqual([]);
  });

  test("토큰이 가리키는 얼굴 셋도 등록돼 있다", () => {
    for (const family of [m3.font.brand, m3.font.plain, m3.font.mono, m3.font.chrome]) {
      expect({ family, registered: isRegistered(family) }).toEqual({ family, registered: true });
    }
  });

  test("크롬 얼굴도 등록된 것으로 해석된다", () => {
    expect(isRegistered(chromeFaceFor("400"))).toBe(true);
    expect(isRegistered(chromeFaceFor("700"))).toBe(true);
    expect(chromeFaceFor("700")).toBe("Galmuri11Bold");
  });
});

describe("m3TextStyle — 역할에서 RN 스타일로", () => {
  test("굵은 역할은 굵은 얼굴로, 굵기 속성은 안 내보낸다", () => {
    expect(m3TextStyle("labelLarge")).toEqual({
      fontFamily: "Galmuri11Bold",
      fontSize: 12,
      lineHeight: 18,
      letterSpacing: 0,
    });
  });

  test("15px 역할은 디스플레이 얼굴로 간다", () => {
    expect(m3TextStyle("bodyLarge")).toEqual({
      fontFamily: "Galmuri14",
      fontSize: 15,
      lineHeight: 23,
      letterSpacing: 0,
    });
  });

  test("10px 역할은 마이크로 얼굴로 간다", () => {
    expect(m3TextStyle("labelSmall").fontFamily).toBe("Galmuri9");
  });

  test("어떤 역할도 fontWeight 을 내보내지 않는다", () => {
    // 굵기는 얼굴 이름 안에 있다. fontWeight 을 같이 내보내면 RN 이 그 위에
    // 가짜 굵기를 덧씌운다.
    for (const role of Object.keys(m3Type) as (keyof typeof m3Type)[]) {
      expect({ role, keys: Object.keys(m3TextStyle(role)).sort() }).toEqual({
        role,
        keys: ["fontFamily", "fontSize", "letterSpacing", "lineHeight"],
      });
    }
  });

  test("격자 밖 크기는 시스템 폰트가 아니라 기본 얼굴로 떨어진다", () => {
    // 흐려지더라도 문자는 픽셀 서체로 보여야 한다. 등록 안 된 이름을 주면
    // 그 화면만 통째로 시스템 산세리프가 된다.
    expect(faceForSize(13)).toBe(m3.font.brand);
    expect(isRegistered(faceForSize(13))).toBe(true);
  });
});
