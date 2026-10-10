import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { chatStatusMaxLines } from "@/components/secondb/chat-font-layout";

// UI2-CHAT-01..05: execute only source expressions, never a React/RN renderer.
const source = readFileSync(resolve(__dirname, "../secondb.tsx"), "utf8").replace(/\r\n/g, "\n");
const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
type Props = Record<string, unknown>;
type Element = { type: string; props: Props; children: Element[] };
const locales = ["en", "ko", "es", "pt", "id"];
const copy = (locale: string) => JSON.parse(readFileSync(resolve(__dirname, `../../../locales/${locale}/secondb.json`), "utf8"));
function nodes(predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(ast); return found;
}
function execute(code: string, scope: Props = {}): unknown {
  return runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
  } }).outputText, scope);
}
function elementByStyle(style: string): ts.JsxElement {
  const result = nodes(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.getText(ast) === "style" && prop.initializer?.getText(ast) === `{ds.${style}}`));
  if (result.length !== 1) throw new Error(`Expected one ${style} element`);
  return result[0] as ts.JsxElement;
}
const dsDeclaration = nodes(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "ds")[0] as ts.VariableDeclaration;
const dsObject = (dsDeclaration.initializer as ts.CallExpression).arguments[0] as ts.ObjectLiteralExpression;
const token = new Proxy({}, { get: (_target, key) => String(key) });
const spacing = { xs: 4, sm: 8, md: 12 };
function style(name: string): Props {
  const property = dsObject.properties.find(p => p.name?.getText(ast) === name) as ts.PropertyAssignment | undefined;
  if (!property) throw new Error(`Missing style ${name}`);
  return execute(`(${property.initializer.getText(ast)})`, {
    semantic: token, deepSpace: token, deepSpaceSpacing: spacing,
    m3: { shape: { medium: 0 }, color: token }, fontFamilies: token,
  }) as Props;
}
function tree(node: ts.Node, scope: Props = {}): Element {
  return execute(`(${node.getText(ast)})`, {
    React: { createElement: (type: string, props: Props, ...children: Element[]) => ({ type, props, children }) },
    View: "View", Text: "Text", Pressable: "Pressable", PixelGlyph: "PixelGlyph", HustleKPortrait: "HustleKPortrait",
    ds: token, semantic: token, t: (key: string) => key, ...scope,
  }) as Element;
}
function descendants(root: Element, type: string): Element[] {
  if (!root || typeof root !== "object") return [];
  return [...(root.type === type ? [root] : []), ...(root.children ?? []).flatMap(child => descendants(child, type))];
}

describe("chat screen tidy", () => {
  test.each(locales)("%s shows each persona's existing role in the tab and accessible name", locale => {
    const map = nodes(node => ts.isCallExpression(node) && node.expression.getText(ast) === "REV2_PERSONA_IDS.map")[0];
    const strings = copy(locale);
    const t = (key: string) => key.split(".").reduce((value, part) => value[part], strings);
    for (const allowed of [true, false]) {
      const tabs = tree(map, {
        REV2_PERSONA_IDS: ["secondb", "meta", "twi"], rev2Persona: "secondb", effectiveTier: "free", t,
        personaAllowed: () => allowed, rev2PersonaAccent: () => "accent", rev2PersonaOnSoft: () => "ink",
        rev2PersonaSoftBg: () => "fill", m3: { color: token }, LOCKED_CHIP_BORDER: "border", LOCKED_CHIP_INK: "ink",
      }) as unknown as Element[];
      tabs.forEach((tab, index) => {
        const id = ["secondb", "meta", "twi"][index];
        expect(tab.children[1].children).toEqual([strings.rev2[id].role]);
        expect(tab.props.accessibilityLabel).toContain(`${strings.rev2[id].lensName} · ${strings.rev2[id].role}`);
        expect(tab.props.accessibilityState).toEqual({ selected: index === 0, disabled: index !== 0 && !allowed });
      });
    }
  });

  test.each([1, 1.3])("status at scale %s keeps one truncated description and reserves usage and clear", fontScale => {
    const description = tree(elementByStyle("bannerDesc"), { rev2Persona: "meta", fontScale, chatStatusMaxLines });
    expect(description.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: "tail" });
    expect(description.children).toEqual(["rev2.meta.desc"]);
    expect(style("banner")).toMatchObject({ flexDirection: "row", alignItems: "center" });
    expect(style("bannerDesc")).toMatchObject({ flex: 1, minWidth: 0 });
    expect(style("bannerUsage").flexShrink).toBe(0);
    expect(style("clearLink")).toMatchObject({ flexShrink: 0, minHeight: 44 });
    expect(source).not.toMatch(/ds\.banner(Dot|Tag)/);
  });

  test.each(["secondb", "meta", "twi"])("%s empty state has only a static decorative portrait and existing guidance", rev2Persona => {
    const empty = tree(elementByStyle("empty"), { rev2Persona });
    const decoration = descendants(empty, "View").find(el => el.props.testID === `chat-empty-portrait-${rev2Persona}`);
    expect(decoration?.props).toMatchObject({ key: rev2Persona, accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
    const portrait = descendants(empty, "HustleKPortrait");
    expect(portrait).toHaveLength(1);
    expect(portrait[0].props).toEqual({ expression: "A01", size: 96 });
    expect(descendants(empty, "Text").map(el => el.children)).toEqual([["empty"]]);
    expect(style("empty")).toMatchObject({ flex: 1, justifyContent: "center", alignItems: "center" });
    expect(source).toContain("turns.length === 0 && ds.scrollEmpty");
    expect(style("scrollEmpty").flexGrow).toBe(1);
    const portraitSource = readFileSync(resolve(__dirname, "../../components/character/HustleKPortrait.tsx"), "utf8");
    expect(portraitSource).toContain("transition={0}");
  });

  test("first entry no longer reads or writes retired intro keys or mounts an intro", () => {
    expect(source).not.toMatch(/introOpen|setIntroOpen|readIntroDismissed|writeIntroDismissed|INTRO_DISMISS_KEY|secondB_intro_dismissed|onboarding\.coachmarks/);
    expect(source).not.toMatch(/t\("(?:intro_title|intro_body|intro_ok|intro_mute|closeIntro|closeIntroHint)"\)/);
    expect(source).toContain("visible={refDrawer !== null}");
    expect(source).toContain("<PixelScrim style={ds.modalScrimImage}");
  });

  test("save notice is one line with the original settings and dismissal actions", () => {
    const dismissSaveNotice = jest.fn();
    const push = jest.fn();
    const notice = tree(elementByStyle("saveNotice"), { dismissSaveNotice, router: { push } });
    expect(notice.props.accessibilityRole).toBe("alert");
    const texts = descendants(notice, "Text");
    expect(texts.map(el => el.children)).toEqual([["chatSaveNotice"], ["chatSaveNoticeOpen"]]);
    expect(texts[0].props).toMatchObject({ numberOfLines: 1, ellipsizeMode: "tail" });
    const buttons = descendants(notice, "Pressable");
    expect(buttons.map(el => el.props.accessibilityLabel)).toEqual(["chatSaveNoticeOpen", "chatSaveNoticeDismiss"]);
    (buttons[0].props.onPress as () => void)();
    expect(dismissSaveNotice).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/privacy");
    (buttons[1].props.onPress as () => void)();
    expect(dismissSaveNotice).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
    expect(descendants(buttons[1], "PixelGlyph")[0].props.name).toBe("close");
    expect(style("saveNotice")).toMatchObject({ flexDirection: "row", alignItems: "center" });
    expect(style("saveNoticeTitle")).toMatchObject({ flex: 1, minWidth: 0 });
    expect(style("saveNoticeBtn")).toMatchObject({ flexShrink: 0, minHeight: 44 });
    expect(style("saveNoticeClose")).toMatchObject({ flexShrink: 0, width: 44, height: 44 });
    expect(source).toContain("shouldShowChatSaveNotice({\n          autosaveConsent,\n          dismissed: saveNoticeDismissed,\n          turnCount: turns.length,");
  });

  test.each(locales)("%s removes only the retired guidance keys", locale => {
    const strings = copy(locale);
    for (const key of ["intro_title", "intro_body", "intro_ok", "intro_mute", "closeIntro", "closeIntroHint", "chatSaveNoticeBody"]) {
      expect(strings[key]).toBeUndefined();
    }
    for (const key of ["empty", "chatSaveNotice", "chatSaveNoticeOpen", "chatSaveNoticeDismiss"]) {
      expect(strings[key]).toEqual(expect.any(String));
    }
  });

  test.each([[360, 1], [390, 1], [360, 1.3], [390, 1.3]])("%ipx width at scale %s preserves a single status line and positive text space", (width, fontScale) => {
    // Shell inset + border = 26; transcript inset = 36. Conservative glyph bounds:
    // 999/999 at the scaled 11px mono size, and four scaled 12px glyphs for clear.
    // This reserves space; actual glyph layout remains a native device check.
    const banner = style("banner");
    const statusTextWidth = width - 26 - 2 * Number(banner.paddingHorizontal) - 2 * Number(banner.gap) - 7 * 11 * fontScale - (4 * 12 * fontScale + 8);
    expect(statusTextWidth).toBeGreaterThan(0);
    if (fontScale === 1) expect(statusTextWidth).toBeGreaterThanOrEqual(120);
    const description = tree(elementByStyle("bannerDesc"), { rev2Persona: "secondb", fontScale, chatStatusMaxLines });
    expect(description.props.numberOfLines).toBe(1);
    // The save notice is unchanged; retain its original unscaled width guard.
    const notice = style("saveNotice");
    const noticeTextWidth = width - 26 - 36 - 2 * Number(notice.borderWidth) - Number(notice.paddingLeft) - 2 * Number(notice.gap) - (4 * 12 + 16) - Number(style("saveNoticeClose").width);
    expect(noticeTextWidth).toBeGreaterThanOrEqual(170);
  });
});
