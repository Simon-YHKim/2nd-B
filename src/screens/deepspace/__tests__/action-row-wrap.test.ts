// action 행 - 긴 언어에서도 라벨이 값에 붙거나 값이 잘리지 않는다 (2026-10-07 실기 DEV3-01).
//
// 스페인어 /privacy 의 "Registro de procesamiento de datos" 행에서 라벨이 값에 붙고, 값
// "Últimos 7 días" 가 카드 오른쪽에서 "Últimos 7 dí" 로 잘렸다(실기 캡처
// round3-device/shots/es_privacy_p3_row_crop.png). 원인은 dds-styles 의 action 행이다:
// 가로 줄 + space-between 인데 라벨에도 값에도 flexShrink 가 없었다. 네이티브 Yoga 의
// flexShrink 기본값은 0 이라 긴 라벨이 줄지 않고 값을 카드 밖으로 밀었다.
//
// 이 저장소의 Jest(node)는 RN 을 렌더하지 못한다(렌더 테스트는 재시도하지 않는다). 그래서
// (1) 시트에서 세 스타일을 읽어 한 줄 flex 분배를 숫자로 돌려 보고, (2) 그 시트가 실제 행에
// 걸리는지와 (3) 줄지 않는 값 칸에 들어가는 문구가 짧은지를 소스와 로케일에서 확인한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const STYLES = join(ROOT, "src", "screens", "deepspace", "dds-styles.ts");
const SCREENS = join(ROOT, "src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/** 시트 소스에서 `name:{...}` 한 칸의 본문. 없으면 테스트가 실패한다. */
function styleBody(source: string, name: string): string {
  const match = source.match(new RegExp(`[\\s,{]${name}:\\{([^}]*)\\}`));
  if (!match) throw new Error(`dds-styles 에 ${name} 이 없다`);
  return match[1];
}

/** 숫자 값 하나(없으면 undefined). `spacing.sm` 같은 토큰은 주어진 표로 푼다. */
function numberProp(body: string, prop: string, tokens: Record<string, number> = {}): number | undefined {
  const match = body.match(new RegExp(`(?:^|,)\\s*${prop}:\\s*([^,]+)`));
  if (!match) return undefined;
  const raw = match[1].trim();
  if (raw in tokens) return tokens[raw];
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${prop} 값을 숫자로 못 읽었다: ${raw}`);
  return value;
}

interface RowItem {
  /** 한 줄로 쟀을 때의 폭(dp). */
  natural: number;
  flexShrink: number;
}

/**
 * 한 줄 flex 행의 폭 분배 - CSS flexbox / Yoga 가 넘친 폭을 나누는 방식 그대로:
 * 넘친 만큼을 flexShrink x 기본 폭 비율로 나눠 줄인다. 줄일 수 없는 항목(flexShrink 0)은
 * 제 폭을 지키고, 아무도 못 줄이면 마지막 항목이 행 밖으로 밀려 잘린다.
 */
function layoutRow(container: number, gap: number, items: RowItem[]): { widths: number[]; visible: number[] } {
  const total = items.reduce((sum, item) => sum + item.natural, 0) + gap * (items.length - 1);
  const overflow = Math.max(0, total - container);
  const weight = items.reduce((sum, item) => sum + item.flexShrink * item.natural, 0);
  const widths = items.map((item) =>
    weight > 0 ? item.natural - (overflow * item.flexShrink * item.natural) / weight : item.natural,
  );
  let x = 0;
  const visible = widths.map((width) => {
    const start = x;
    x += width + gap;
    return Math.max(0, Math.min(width, container - start));
  });
  return { widths, visible };
}

// 실기 캡처(1440px 폭, 3.5x)에서 어림한 dp. 행 폭 320, 라벨 한 줄 폭 278, 값 한 줄 폭 83.
const ES_ROW = { container: 320, label: 278, value: 83 };
const TOKENS = { "spacing.sm": 8 };

/**
 * 시트의 세 스타일로 /privacy 스페인어 행을 배치한다. `engine` 은 flexShrink 를 적지 않은
 * 항목의 기본값을 정한다 - 네이티브 Yoga 0, 웹(react-native-web Text = CSS flex 항목) 1.
 */
function layoutEsRow(action: string, label: string, value: string, engine: "native" | "web") {
  const fallback = engine === "native" ? 0 : 1;
  const gap = numberProp(action, "gap", TOKENS) ?? 0;
  return layoutRow(ES_ROW.container, gap, [
    { natural: ES_ROW.label, flexShrink: numberProp(label, "flexShrink") ?? fallback },
    { natural: ES_ROW.value, flexShrink: numberProp(value, "flexShrink") ?? fallback },
  ]);
}

describe("action 행 - 긴 라벨은 줄바꿈하고 값은 잘리지 않는다 (DEV3-01)", () => {
  const sheet = read(STYLES);
  const action = styleBody(sheet, "action");
  const actionLabel = styleBody(sheet, "actionLabel");
  const actionValue = styleBody(sheet, "actionValue");

  test("시트 값: 가로 행에 간격, 라벨은 줄고 값은 제 폭", () => {
    expect(action).toContain("flexDirection:'row'");
    expect(numberProp(action, "gap", TOKENS)).toBeGreaterThan(0);
    expect(numberProp(actionLabel, "flexShrink")).toBe(1);
    expect(numberProp(actionLabel, "minWidth")).toBe(0);
    expect(numberProp(actionValue, "flexShrink")).toBe(0);
    // flex 축약은 쓰지 않는다 - longhand 와 섞이면 두 엔진이 다르게 풀고, Toggle 의 세로
    // 글자 칸(TOGGLE_TEXT) 안에서 flexBasis 0 이 라벨 높이를 0 으로 만들 수 있다.
    expect(actionLabel).not.toMatch(/(?:^|,)\s*flex:/);
    expect(actionValue).not.toMatch(/(?:^|,)\s*flex:/);
  });

  test.each(["native", "web"] as const)("%s: 스페인어 /privacy 행에서 값이 다 보이고 라벨과 떨어진다", (engine) => {
    const { widths, visible } = layoutEsRow(action, actionLabel, actionValue, engine);
    const [labelWidth, valueWidth] = widths;
    // 값은 한 줄 폭 그대로, 전부 보인다("Últimos 7 dí" 로 잘리지 않는다).
    expect(valueWidth).toBeCloseTo(ES_ROW.value, 5);
    expect(visible[1]).toBeCloseTo(ES_ROW.value, 5);
    // 라벨은 남는 폭으로 줄어(줄바꿈) 행 안에 들어가고, 값과 사이가 있다.
    expect(labelWidth).toBeLessThan(ES_ROW.label);
    expect(labelWidth + (numberProp(action, "gap", TOKENS) ?? 0) + valueWidth).toBeCloseTo(ES_ROW.container, 5);
  });

  test("변이 검증: 고치기 전 시트로 돌리면 네이티브에서 값이 잘리고 라벨에 붙는다", () => {
    const before = {
      action:
        "minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm",
      label: "color:colors.textHi,fontSize:14",
      value: "color:colors.textLo,fontSize:12",
    };
    const native = layoutEsRow(before.action, before.label, before.value, "native");
    expect(native.visible[1]).toBeLessThan(ES_ROW.value); // 잘린다
    expect(numberProp(before.action, "gap", TOKENS)).toBeUndefined(); // 붙는다
    // 라벨만 고치고 값을 줄 수 있게 두면 웹에서 값이 같이 줄어 두 줄로 꺾인다.
    const labelOnly = layoutEsRow(action, actionLabel, "color:colors.textLo,fontSize:12", "web");
    expect(labelOnly.widths[1]).toBeLessThan(ES_ROW.value);
  });

  test("이 시트가 실제 행에 걸린다 - Action · 고정 값 행 · SelectRow", () => {
    const screens = read(SCREENS);
    expect(screens).toContain('import { ddsStyles as styles } from "./dds-styles";');
    const actionFn = screens.slice(screens.indexOf("function Action("), screens.indexOf("function Toggle("));
    expect(actionFn).toContain("style={styles.action}");
    expect(actionFn).toContain("style={styles.actionLabel}");
    expect(actionFn).toContain("style={styles.actionValue}");
    // 영어 원문은 이 줄에 들어가지만 긴 언어는 넘친다 - 그 행이 Action 이어야 위 수정이 닿는다.
    expect(screens).toContain(
      '<Action label={t("privacy.processingLog")} value={t("privacy.last7")} onPress={() => router.push("/processing-log")} />',
    );
    const selectRow = screens.slice(screens.indexOf("function SelectRow("), screens.indexOf("export function DeepSpaceThemeScreen("));
    expect(selectRow).toContain("style={styles.action}");
    expect(selectRow).toContain("style={styles.actionLabel}");
  });

  test("줄지 않는 값 칸의 문구는 다섯 로케일 모두 짧다", () => {
    const screens = read(SCREENS);
    const keys = new Set<string>();
    for (const m of screens.matchAll(/<Action\b[^>]*\bvalue=\{t\("([^"]+)"\)\}/g)) keys.add(m[1]);
    for (const m of screens.matchAll(/style=\{styles\.actionValue\}>\{t\("([^"]+)"\)\}/g)) keys.add(m[1]);
    // 아무것도 못 찾은 채 통과하지 않게: /privacy 4개 + /formats 1개.
    expect([...keys].sort()).toEqual(
      expect.arrayContaining(["formats.included", "privacy.last7", "privacy.none", "privacy.open", "privacy.view"]),
    );
    const tooLong: string[] = [];
    for (const locale of LOCALES) {
      const bundle = JSON.parse(read(join(ROOT, "locales", locale, "deepspace.json"))) as Record<string, unknown>;
      for (const key of keys) {
        const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
        if (typeof value !== "string") throw new Error(`${locale}/deepspace.json 에 ${key} 가 없다`);
        // 값 칸은 줄지 않는다(flexShrink 0). 길어지면 라벨 몫을 다 먹는다 - 16자 이내로 둔다.
        if ([...value].length > 16) tooLong.push(`${locale} ${key}: ${value}`);
      }
    }
    expect(tooLong).toEqual([]);
  });
});
