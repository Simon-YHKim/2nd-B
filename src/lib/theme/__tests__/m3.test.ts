// 토큰 기반 고정 가드 — **PIXEL-CLAY v4** (Simon 결정 V1 · P1~P5).
//
// 이 파일은 원래 "M3 이주 목표가 조용히 흐르지 않게" 값을 박아뒀다. 그 목표가
// 2026-08-19 에 바뀌었다(M3 → PIXEL-CLAY). 가드가 틀렸던 게 아니라 **겨누는 곳이
// 옮겨진 것**이라, 값을 새 목표로 다시 박는다.
//
// 이름은 그대로 `m3.*` 다 — 35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로
// 읽으므로 이름을 바꾸면 그 전부를 건드려야 한다. 인수 번들의 `px-bridge.css` 도
// 웹에서 같은 일을 한다(M3 어휘를 PIXEL-CLAY 시맨틱으로 별칭).
import { m3, m3ColorDark, m3Type, m3Shape, m3Elevation, m3State, m3Persona, m3Spacing } from "../m3";
import { radii } from "../tokens";

describe("PIXEL-CLAY 절대 규칙이 토큰에 박혀 있다", () => {
  test("모서리가 없다 — 전 화면 radius 0", () => {
    // 절대 규칙 2. `full` 까지 0 이라 알약 모양도 사각이 된다.
    for (const [name, v] of Object.entries(m3Shape)) {
      expect({ name, radius: v }).toEqual({ name, radius: 0 });
    }
  });

  test("`radii` 도 0 이다 — 세 번째 반경 토큰 세트", () => {
    // ⚠ 이 세트는 `m3Shape` 와 따로 살아 있었고, 값이 4/8/12/16 이라
    //   규칙 2 위반 252건 중 대부분을 만들고 있었다(`/support` 의 8px 도 이것).
    //   가드(`check-pixel-rules.ts`)가 `radii.*` 를 허용하는 근거가 이 검사다 —
    //   여기가 빨개지면 가드의 허용도 같이 무효가 된다.
    for (const [name, v] of Object.entries(radii)) {
      expect({ name, radius: v }).toEqual({ name, radius: 0 });
    }
  });

  test("그림자가 없다 — 깊이는 베벨과 쌓임 순서로만", () => {
    // 절대 규칙 3(블러 금지). RN `shadowRadius` 는 블러 반경이므로 0 이 아니면 위반이다.
    // Android `elevation` 도 그림자를 만들므로 같이 0 이어야 한다.
    for (const [name, e] of Object.entries(m3Elevation)) {
      expect({ name, radius: e.shadowRadius, opacity: e.shadowOpacity, android: e.elevation }).toEqual({
        name,
        radius: 0,
        opacity: 0,
        android: 0,
      });
    }
    // 레벨 이름은 남는다 — 호출부를 안 건드리기 위해서다.
    expect(Object.keys(m3Elevation)).toEqual(["level0", "level1", "level2", "level3", "level4", "level5"]);
  });

  test("모션이 계단에 가깝고 짧다", () => {
    // 절대 규칙 5. 곡선 이징은 부분 픽셀 위치를 만들어 격자를 흐린다.
    // 배열 모양은 유지해야 한다 — 호출부가 `Easing.bezier(...easing.standard)` 로 쓴다.
    for (const [name, curve] of Object.entries(m3.motion.easing)) {
      expect({ name, len: curve.length }).toEqual({ name, len: 4 });
      // 첫 제어점이 1 에 가까울수록 계단에 가깝다.
      expect(curve[0]).toBeGreaterThanOrEqual(0.9);
    }
    // 픽셀아트에 M3 의 150~500ms 는 느리다. 번들은 60/120/240 을 쓴다.
    for (const [name, ms] of Object.entries(m3.motion.duration)) {
      expect({ name, tooSlow: ms > 240 }).toEqual({ name, tooSlow: false });
    }
  });
});

describe("midnight 팔레트 (P2 — 런타임 교체 없음)", () => {
  test("표면·전경이 midnight 시맨틱 그대로다", () => {
    // semantic.css `.theme-dark`: bg=c00 · panel=c01 · panel-2=c02 · fg=c07 · fg-muted=c04
    expect(m3ColorDark.background).toBe("#0a0e18"); // --bg = c00
    expect(m3ColorDark.surface).toBe("#0a0e18");
    expect(m3ColorDark.onSurface).toBe("#eaeef5"); // --fg = c07
    expect(m3ColorDark.onSurfaceVariant).toBe("#8b96b0"); // --fg-muted = c04
    expect(m3ColorDark.surfaceContainer).toBe("#141b2e"); // --panel = c01
    expect(m3ColorDark.surfaceContainerHigh).toBe("#232e4a"); // --panel-2 = c02
  });

  test("primary 가 midnight accent 다", () => {
    expect(m3ColorDark.primary).toBe("#5b8def"); // --accent = c09
    expect(m3ColorDark.onPrimary).toBe("#141b2e"); // --accent-fg = c01
  });

  test("outline 과 outline-variant 가 같다 — 본문에 쓰면 안 되는 이유", () => {
    // 브리지가 둘 다 `--edge-soft` 로 보낸다. PRD §2-2 가 명시적으로 금지한다:
    // `C('outline')` 을 본문 텍스트에 쓰지 말 것 — 보더 전용이라 배경과 구분되지 않는다.
    // 값이 같다는 사실 자체가 그 함정의 근거다.
    expect(m3ColorDark.outline).toBe(m3ColorDark.outlineVariant);
  });

  test("대비가 AA 를 넘는다", () => {
    // 팔레트를 갈아끼우면서 읽을 수 없게 만드는 것이 가장 조용한 실패다.
    const ch = (c: number): number => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string): number => {
      const n = Number.parseInt(hex.replace("#", ""), 16);
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    };
    const ratio = (a: string, b: string): number => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    // 본문 4.5:1
    expect(ratio(m3ColorDark.onSurface, m3ColorDark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(m3ColorDark.onSurfaceVariant, m3ColorDark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(m3ColorDark.onSurfaceVariant, m3ColorDark.surfaceContainer)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(m3ColorDark.primary, m3ColorDark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(m3ColorDark.onPrimary, m3ColorDark.primary)).toBeGreaterThanOrEqual(4.5);
  });
});

// 2026-08-20: 여기 "아직 안 바꾼 것" 블록이 있었다. 그 블록은 스스로 "이 테스트가
// 깨지는 날 = 그 단계를 시작하는 날" 이라고 적어둔 트립와이어였고, 2단계가 그날이다.
// 트립와이어를 지우고 **새 목표**를 박는다.
describe("간격 — `--u` 2px 격자 (D1)", () => {
  test("sN 이 정확히 u x N 이다", () => {
    // 이름이 곧 배수라는 계약. 하나만 어긋나도 그 자리가 격자를 벗어난다.
    const u = 2;
    expect(m3Spacing).toEqual({
      s1: u * 1,
      s2: u * 2,
      s3: u * 3,
      s4: u * 4,
      s5: u * 5,
      s6: u * 6,
      s8: u * 8,
    });
  });

  test("전부 정수다 — 반픽셀 간격이 없다", () => {
    const fractional = Object.entries(m3Spacing)
      .filter(([, v]) => !Number.isInteger(v))
      .map(([k, v]) => `${k}=${v}`);
    expect(fractional).toEqual([]);
  });

  test("최소 터치 규격은 간격과 함께 줄어들지 않는다", () => {
    // 이주가 안 바꾸기로 한 셋 중 하나(`PIXEL-CLAY-MIGRATION.md` §6). 간격을 절반으로
    // 내리면서 이 값까지 따라 내려가면 화면 전체가 조용히 44 밑으로 간다.
    expect(m3.minTouch).toBe(44);
    expect(m3.minTouch).toBeGreaterThan(m3Spacing.s8 * 2);
  });
});

describe("타입 — Galmuri 격자", () => {
  test("본문이 픽셀 서체로 바뀌었다", () => {
    expect(m3.font.brand).toBe("Galmuri11");
    expect(m3.font.mono).toBe("GalmuriMono11");
    // Roboto·Pretendard 는 더 이상 토큰이 가리키는 얼굴이 아니다. (`as const` 라
    // 리터럴 비교는 컴파일이 거부한다 — 접두사로 본다.)
    const faces: string[] = [m3.font.brand, m3.font.plain, m3.font.mono, m3.font.chrome];
    expect(faces.filter((f) => !f.startsWith("Galmuri"))).toEqual([]);
  });

  test("bodyLarge 가 Galmuri14 x1 자리다", () => {
    expect(m3Type.bodyLarge).toEqual({ size: 15, line: 23, tracking: 0, weight: "400" });
  });

  test("역할 이름은 그대로 15개다", () => {
    // 개수가 아니라 이름으로 박는다 — 개수 핀은 치환을 못 잡는다. 호출부 233곳이
    // 이 이름들을 쓰므로 이름이 사라지면 그 화면이 죽는다.
    expect(Object.keys(m3Type).sort()).toEqual(
      [
        "bodyLarge",
        "bodyMedium",
        "bodySmall",
        "displayLarge",
        "displayMedium",
        "displaySmall",
        "headlineLarge",
        "headlineMedium",
        "headlineSmall",
        "labelLarge",
        "labelMedium",
        "labelSmall",
        "titleLarge",
        "titleMedium",
        "titleSmall",
      ].sort()
    );
  });
});

describe("개념 층은 이주와 무관하게 그대로다", () => {
  test("딥스페이스 액센트 — 팔레트와 독립인 별자리 색", () => {
    expect(m3.accent.starCore).toBe("#46B6FF");
    expect(m3.accent.polaris).toBe("#C8B6FF");
    expect(m3.accent.moodPositive).toBe("#5FF0C0");
    expect(m3.accent.moodNeutral).toBe("#A78BFA");
    expect(m3.accent.moodNegative).toBe("#FF7A90");
  });

  test("세컨비는 액센트가 서로 다른 페르소나 셋이다", () => {
    expect(Object.keys(m3Persona).sort()).toEqual(["meta", "secondb", "twi"]);
    const accents = new Set(Object.values(m3Persona).map((p) => p.accent));
    expect(accents.size).toBe(3);
  });

  test("상태 레이어 불투명도", () => {
    expect(m3State.pressed).toBe(0.1);
  });
});
