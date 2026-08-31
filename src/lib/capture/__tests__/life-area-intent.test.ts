import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isDomainTag } from "@/lib/persona/domain-stars";
import { withDomainTag } from "@/lib/records/detect-domain";

import {
  LIFE_AREA_IDS,
  LIFE_AREA_INTENT_COPY,
  LIFE_AREA_LOCALES,
  isRecordCaptureMode,
  lifeAreaFromTag,
  resolveLifeAreaLocale,
  withSelectedLifeArea,
} from "../life-area-intent";

const read = (file: string): string => readFileSync(join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("capture-full life-area intent model", () => {
  test("contains the six life areas and never promotes collect", () => {
    expect(LIFE_AREA_IDS).toEqual([
      "career",
      "finance",
      "relation",
      "health",
      "growth",
      "recreation",
    ]);
    expect(LIFE_AREA_IDS).not.toContain("collect");
  });

  test("provides complete typed copy for all five UI locales", () => {
    expect(LIFE_AREA_LOCALES).toEqual(["en", "ko", "es", "pt", "id"]);
    for (const locale of LIFE_AREA_LOCALES) {
      const copy = LIFE_AREA_INTENT_COPY[locale];
      expect(copy.title).toBeTruthy();
      expect(copy.helper).toBeTruthy();
      expect(copy.selected).toBeTruthy();
      expect(copy.clear).toBeTruthy();
      expect(Object.keys(copy.cards)).toEqual([...LIFE_AREA_IDS]);
      for (const area of LIFE_AREA_IDS) {
        expect(copy.cards[area].label).toBeTruthy();
        expect(copy.cards[area].helper).toBeTruthy();
        expect(copy.cards[area].context).toBeTruthy();
      }
    }
    expect(resolveLifeAreaLocale("pt-BR")).toBe("pt");
    expect(resolveLifeAreaLocale("fr-FR")).toBe("en");
    expect(LIFE_AREA_INTENT_COPY.en.cards.recreation.label).toBe("Rest");
    expect(LIFE_AREA_INTENT_COPY.ko.cards.recreation.label).toBe("휴식");
    expect(LIFE_AREA_INTENT_COPY.es.cards.recreation.label).toBe("Descanso");
    expect(LIFE_AREA_INTENT_COPY.pt.cards.recreation.label).toBe("Descanso");
    expect(LIFE_AREA_INTENT_COPY.id.cards.recreation.label).toBe("Istirahat");

    const visibleCopy = JSON.stringify(LIFE_AREA_INTENT_COPY);
    expect(visibleCopy).not.toMatch(/\b(?:star|sensor|score|connected)\b|별|센서|점수|연결됨/i);
  });

  test("accepts only exact canonical life-area tags", () => {
    expect(lifeAreaFromTag("domain:career")).toBe("career");
    expect(lifeAreaFromTag(" DOMAIN:HEALTH ")).toBe("health");
    expect(lifeAreaFromTag("domain:collect")).toBeNull();
    expect(lifeAreaFromTag("domain:unknown")).toBeNull();
    expect(lifeAreaFromTag("domain:career:extra")).toBeNull();
    expect(lifeAreaFromTag("career")).toBeNull();
  });

  test("composes one selected tag after AI suggestions and removes competing domains", () => {
    const tags = withSelectedLifeArea(
      ["domain:finance", "plan", "domain:career", "notes"],
      "health",
    );
    expect(tags).toEqual(["domain:health", "plan", "notes"]);
    expect(tags.filter(isDomainTag)).toHaveLength(1);
  });

  test("record modes remain instrument-owned", () => {
    expect(isRecordCaptureMode("journal")).toBe(true);
    expect(isRecordCaptureMode("voice")).toBe(true);
    expect(isRecordCaptureMode("todo")).toBe(true);
    expect(isRecordCaptureMode("fourw")).toBe(true);
    expect(isRecordCaptureMode("memo")).toBe(false);
    expect(withDomainTag(["domain:finance", "mine"], "회사 면접")).toEqual([
      "domain:career",
      "mine",
    ]);
  });
});

describe("capture-full life-area screen wiring", () => {
  const routeSource = read("src/app/capture-full.tsx");
  const captureSource = read("src/app/capture.tsx");

  test("enables the embedded selector only from capture-full", () => {
    expect(routeSource).toContain("<CaptureLegacy enableLifeAreaIntents />");
    expect(captureSource).toContain("enableLifeAreaIntents = false");
    expect(captureSource).toContain("return <CaptureLegacy />");
  });

  test("starts collapsed, exposes selected state, and closes first on Android Back", () => {
    expect(captureSource).toContain("const [lifeAreaOpen, setLifeAreaOpen] = useState(false)");
    expect(captureSource).toContain("accessibilityState={{ expanded: lifeAreaOpen }}");
    expect(captureSource).toContain("accessibilityState={{ selected }}");
    expect(captureSource).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(captureSource).toContain("if (!lifeAreaOpen) return false");
    expect(captureSource).toContain("setLifeAreaOpen(false);\n        return true;");
  });

  test("clears local area state at sign-out and direct account changes", () => {
    const boundaryStart = captureSource.indexOf('useEffect(() => {\n    if (!userId) {');
    const boundaryEnd = captureSource.indexOf("void loadCaptureDraftState(userId)", boundaryStart);
    const boundary = captureSource.slice(boundaryStart, boundaryEnd);

    expect(boundaryStart).toBeGreaterThan(0);
    expect(boundaryEnd).toBeGreaterThan(boundaryStart);
    expect(boundary.match(/setLifeAreaOpen\(false\)/g)).toHaveLength(2);
    expect(boundary.match(/setSelectedLifeArea\(null\)/g)).toHaveLength(2);
    expect(boundary).toContain("Account boundaries also own the unsaved hidden area context");
  });

  test("keeps domain queries hidden, fails closed, and preserves ordinary tags", () => {
    expect(captureSource).toContain("const area = lifeAreaFromTag(tg)");
    expect(captureSource).toContain("if (tg && isDomainTag(tg))");
    expect(captureSource).toContain("if (!area || (m !== null && isRecordCaptureMode(m)))");
    expect(captureSource).toContain("Ordinary user tags retain the existing deep-link contract");
    expect(captureSource).toContain("enableLifeAreaIntents && isDomainTag(norm)");
  });

  test("selects the real memo composer and clears the intent for record modes", () => {
    expect(captureSource).toContain('switchCaptureMode("memo")');
    expect(captureSource).toContain("enableLifeAreaIntents && isRecordCaptureMode(nextMode)");
    expect(captureSource).toContain("setSelectedLifeArea(null)");
  });

  test("adds the selected tag after classification and only on the source path", () => {
    const recordReturn = captureSource.indexOf('if (mode === "journal") return handleJournalSubmit()');
    const classify = captureSource.indexOf("const cls = await classifyClipper");
    const compose = captureSource.indexOf("finalTags = withSelectedLifeArea(finalTags, selectedLifeArea)");
    const save = captureSource.indexOf("const result = await captureFromMarkdown");
    const reset = captureSource.indexOf("\n      reset();", save);

    expect(recordReturn).toBeGreaterThan(0);
    expect(classify).toBeGreaterThan(recordReturn);
    expect(compose).toBeGreaterThan(classify);
    expect(save).toBeGreaterThan(compose);
    expect(reset).toBeGreaterThan(save);
    expect(captureSource).toContain("setSavedPending(result.storagePending)");
  });

  test("uses Pixel primitives, 44dp sizing, and no alpha or curved styling in the new section", () => {
    const start = captureSource.indexOf("{enableLifeAreaIntents && !savedTitle ? (");
    const end = captureSource.indexOf("{/* Import success", start);
    const section = captureSource.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(section).toContain("<PixelPressable");
    expect(section).toContain("<PixelSurface");
    expect(section).toContain("<PixelGlyph");
    expect(section).not.toContain("<Pressable");
    expect(section).not.toMatch(/opacity|withAlpha|rgba|borderRadius|gradient|blur|domain:/i);
    expect(captureSource).toContain("{lifeAreaCopy.clear}</Text>");
    expect(captureSource).toContain("lifeAreaHeader: {\n    minHeight: m3.minTouch");
    expect(captureSource).toContain("lifeAreaCard: {\n    minHeight: 88");
    expect(captureSource).toContain("lifeAreaClear: {\n    minWidth: m3.minTouch");
  });
});
