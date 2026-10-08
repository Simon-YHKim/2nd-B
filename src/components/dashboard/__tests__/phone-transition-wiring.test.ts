import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import React from "react";
import { advancePhoneTransition, initialPhoneTransition, type PhoneScene, type PhoneTransition } from "@/lib/dashboard/phone-transition";

const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup(element: React.ReactNode): string };

const path = join(__dirname, "..", "DashboardPhone.tsx");
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function elements(node: ts.Node, tag: string): Array<ts.JsxElement | ts.JsxSelfClosingElement> {
  const matches: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  const visit = (child: ts.Node): void => {
    if (ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === tag) matches.push(child);
    if (ts.isJsxSelfClosingElement(child) && child.tagName.getText(source) === tag) matches.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return matches;
}

function props(element: ts.JsxElement | ts.JsxSelfClosingElement): Record<string, string | undefined> {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  return Object.fromEntries(opening.attributes.properties.filter(ts.isJsxAttribute).map((prop) => [prop.name.getText(source), prop.initializer?.getText(source)]));
}

test("only the live display content moves, with stable frame, status bar, and page controls", () => {
  const transitions = elements(source, "SceneTransition");
  expect(transitions).toHaveLength(1);
  const transition = transitions[0];
  expect(props(transition)).toMatchObject({
    transitionKey: "{phoneTransition.key}", kind: "{phoneTransition.kind}",
    scope: '"phone"', animateOnMount: "{false}", style: "{styles.pageBody}",
  });
  // Changing an animation must never remount the form or scrolling list.
  expect(props(transition)).not.toHaveProperty("key");
  for (const tag of ["NavBack", "PhoneEmbedProvider", "FlatList", "MuseumPhoneContent"]) expect(elements(transition, tag)).toHaveLength(1);
  for (const tag of ["StatusBar", "PhoneFrame", "PhoneWallpaper"]) expect(elements(transition, tag)).toHaveLength(0);
  expect(transition.getText(source)).not.toContain('t("phone.pageControls")');
  expect(transition.getText(source)).not.toContain('t("phone.nav.home")');
});

test("route lifecycle, bounded scroll, and hosted gesture ownership survive the moving wrapper", () => {
  const transition = elements(source, "SceneTransition")[0];
  const hosted = elements(transition, "View").find((element) => props(element).testID === '"phone-hosted-screen"');
  expect(hosted).toBeDefined();
  expect(props(hosted!)).toMatchObject({ key: "{insideRoute}", style: "{styles.hostedScreen}" });
  expect(elements(transition, "PhoneEmbedProvider")).toHaveLength(1);
  const list = props(elements(transition, "FlatList")[0]);
  expect(list.key).toContain('${insideRoute ?? "home"}');
  expect(list).toHaveProperty("onScroll");
  expect(list).toHaveProperty("onContentSizeChange");
  expect(list).toHaveProperty("onLayout");
  expect(transition.getText(source)).toContain("{...(ownsDisplay ? {} : pagePan.panHandlers)}");
  expect(source.getText()).toContain("{...(ownsDisplay ? {} : phonePan.panHandlers)}");
  expect(transition.getText(source)).not.toMatch(/screenStack\.(map|slice)\(/);
});

test("the real derived state settles before children render and retains motion across a data render", () => {
  // Like phone-back-focus.test, execute the actual source block without loading
  // every hosted route. React itself processes its render-phase state update.
  const text = source.getText();
  const start = text.indexOf("const scene = { screenStack, pageIndex, phoneApp, selectedNoticeId };");
  const end = text.indexOf("const showPage = useCallback", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const scenes: PhoneScene[] = [[], ["/settings"], ["/settings", "/account"], ["/settings", "/account"], ["/settings"], []]
    .map((screenStack) => ({ screenStack, pageIndex: 2, phoneApp: null, selectedNoticeId: null }));
  const settled: PhoneTransition[] = [];
  const child = jest.fn(({ transitionKey }: { transitionKey: string }) => React.createElement("span", null, transitionKey));
  const script = ts.transpileModule(`return function Probe() {
    const [step, setStep] = useState(0);
    const { screenStack, pageIndex, phoneApp, selectedNoticeId } = scenes[step];
    ${text.slice(start, end)}
    if (phoneTransition === nextTransition) {
      settled.push(phoneTransition);
      if (step < scenes.length - 1) setStep(step + 1);
    }
    return React.createElement(child, { transitionKey: phoneTransition.key });
  };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const Probe = new Function("React", "useState", "initialPhoneTransition", "advancePhoneTransition", "scenes", "settled", "child", script)(
    React, React.useState, initialPhoneTransition, advancePhoneTransition, scenes, settled, child,
  ) as React.FunctionComponent;
  renderToStaticMarkup(React.createElement(Probe));
  expect(settled.map((transition) => transition.kind)).toEqual(["open", "open", "push", "push", "back", "home"]);
  expect(settled[3]).toBe(settled[2]);
  expect(child).toHaveBeenCalledTimes(1);
  expect(child.mock.calls[0][0].transitionKey).toBe(settled[5].key);
});
