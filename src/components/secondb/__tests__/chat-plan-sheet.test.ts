import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as domains from "@/lib/ops/domains";
import { isValidISO } from "@/components/m3/date-picker/calendar-math";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
const source = readFileSync(resolve(__dirname, "../ChatPlanSheet.tsx"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function mount(suggestion: Props | null, extra: Props = {}) {
  const onConfirm = jest.fn(); const onClose = jest.fn();
  let props = { suggestion, onConfirm, onClose, busy: false, ...extra };
  let tree: Tree | null; let index = 0; let dirty = false;
  const slots: unknown[] = [];
  const jsx = (type: string, value: Props) => ({ type, props: value });
  const modules: Record<string, unknown> = {
    react: { useState: (initial: unknown) => {
      const slot = index; index += 1;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (next: unknown) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; dirty = true; }];
    } },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute" } } },
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 34 }) },
    "@/components/phone/PhoneUIKit": { PhoneView: "View", PhoneScrollView: "ScrollView", PhonePressable: "Pressable" },
    "@/components/ui/ScreenModal": { ScreenModal: "ScreenModal" },
    "@/components/ui/Text": { Text: "Text" },
    "@/components/m3/Field": { Field: "Field" },
    "@/components/m3/MdButton": { MdButton: "MdButton" },
    "@/components/m3/SegBtn": { SegBtn: "SegBtn" },
    "@/components/m3/date-picker": { DateField: "DateField" },
    "@/components/m3/date-picker/calendar-math": { isValidISO, todayISO: () => "2026-10-09" },
    "@/components/pixel/PixelSurface": { PixelSurface: "PixelSurface" },
    "@/components/pixel/PixelDither": { PixelScrim: "PixelScrim" },
    "@/components/pixel/PixelGlyph": { PixelGlyph: "PixelGlyph" },
    "@/lib/ui/keyboard": { KeyboardAvoidingArea: "KeyboardAvoidingArea" },
    "@/lib/ops/domains": domains,
    "@/lib/theme/m3": { m3: { color: { primary: "blue", outlineVariant: "border", secondaryContainer: "selected" } } },
  };
  const exported: { ChatPlanSheet?: (value: Props) => Tree | null } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error("Unexpected dependency: " + name);
    return modules[name];
  }, exported);
  function render() { index = 0; dirty = false; tree = exported.ChatPlanSheet!(props); }
  function all(): Tree[] {
    const out: Tree[] = [];
    function visit(node: unknown) {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const item = node as Tree; out.push(item); visit(item.props.children);
    }
    visit(tree); return out;
  }
  function find(id: string): Tree {
    const found = all().find(node => node.props.testID === id);
    if (!found) throw new Error("Missing testID " + id);
    return found;
  }
  function invoke(node: Tree, handler: string, value?: unknown) {
    (node.props[handler] as (value?: unknown) => void)(value);
    if (dirty) render();
  }
  render();
  return {
    onConfirm, onClose, find, all, invoke,
    get tree() { return tree; },
    update(next: Props) { props = { ...props, ...next }; render(); },
    change(id: string, value: string) { invoke(find(id), "onChangeText", value); },
    press(id: string) { invoke(find(id), "onPress"); },
  };
}
const routine = { kind: "routine", title: "Read a chapter", recurrence: "daily", domainId: "reading_list" };
const reminder = { kind: "reminder", title: "Call Alex", date: "2026-10-10", time: "14:30" };

test("opening a suggestion never saves and unknown routine time stays blank without a first-date fiction", () => {
  const host = mount(routine);
  expect(host.onConfirm).not.toHaveBeenCalled();
  expect(host.find("chat-plan-title").props.value).toBe("Read a chapter");
  expect(host.find("chat-plan-time").props.value).toBe("");
  expect(host.all().filter(node => node.type === "DateField")).toHaveLength(0);
  expect(host.find("chat-plan-confirm").props).toMatchObject({ label: "planSuggestion.saveRoutine", disabled: false });
  host.change("chat-plan-title", "  Read two pages  ");
  expect(host.onConfirm).not.toHaveBeenCalled();
  host.press("chat-plan-confirm");
  expect(host.onConfirm).toHaveBeenCalledWith({ kind: "routine", title: "Read two pages", recurrence: "daily", weekday: null, date: "", time: "", domainId: "reading_list", exportConsent: false });
});

test("weekly routine requires an explicit weekday and keeps the edited category", () => {
  const host = mount({ ...routine, recurrence: "weekly" });
  expect(host.find("chat-plan-confirm").props.disabled).toBe(true);
  host.press("chat-plan-confirm"); expect(host.onConfirm).not.toHaveBeenCalled();
  host.press("chat-plan-weekday-0");
  expect(host.find("chat-plan-weekday-0").props.accessibilityState).toMatchObject({ checked: true });
  host.press("chat-plan-group-living"); host.press("chat-plan-domain-home_reset");
  host.press("chat-plan-confirm");
  expect(host.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ recurrence: "weekly", weekday: 0, domainId: "home_reset" }));
  const cadence = host.all().find(node => node.type === "SegBtn")!;
  host.invoke(cadence, "onSelect", "daily"); host.press("chat-plan-confirm");
  expect(host.onConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ recurrence: "daily", weekday: null }));
});

test("reminder requires a real date and explicit valid time; a native confirmation schedules only after pressing", () => {
  const host = mount({ kind: "reminder", title: "Call Alex" });
  expect(host.find("chat-plan-time").props.value).toBe("");
  expect(host.find("chat-plan-confirm").props.disabled).toBe(true);
  const dateField = () => host.all().find(node => node.type === "DateField")!;
  host.invoke(dateField(), "onChange", "2026-02-30"); host.change("chat-plan-time", "14:30");
  expect(host.find("chat-plan-confirm").props.disabled).toBe(true);
  host.invoke(dateField(), "onChange", "2026-10-08");
  expect(host.find("chat-plan-confirm").props.disabled).toBe(true);
  host.invoke(dateField(), "onChange", "2026-10-10"); host.change("chat-plan-time", "25:00");
  expect(host.find("chat-plan-confirm").props.disabled).toBe(true);
  host.change("chat-plan-time", "14:30");
  expect(host.find("chat-plan-confirm").props).toMatchObject({ label: "planSuggestion.scheduleReminder", disabled: false });
  expect(host.onConfirm).not.toHaveBeenCalled(); host.press("chat-plan-confirm");
  expect(host.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "reminder", date: "2026-10-10", time: "14:30" }));
});

test("web reminder explains its limit and requires separate unchecked export consent", () => {
  const host = mount(reminder, { webReminder: true });
  expect(host.find("chat-plan-web-notice").props.children).toBe("planSuggestion.webNotice");
  expect(host.find("chat-plan-confirm").props).toMatchObject({ label: "planSuggestion.exportCalendar", disabled: true });
  expect(host.find("chat-plan-export-consent").props.accessibilityState).toMatchObject({ checked: false });
  host.press("chat-plan-confirm"); expect(host.onConfirm).not.toHaveBeenCalled();
  host.press("chat-plan-export-consent");
  expect(host.find("chat-plan-confirm").props.disabled).toBe(false);
  expect(host.onConfirm).not.toHaveBeenCalled(); host.press("chat-plan-confirm");
  expect(host.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ exportConsent: true }));
  const nextOwner = mount({ ...reminder, title: "New owner's appointment" }, { webReminder: true });
  expect(nextOwner.find("chat-plan-export-consent").props.accessibilityState).toMatchObject({ checked: false });
  expect(nextOwner.find("chat-plan-title").props.value).toBe("New owner's appointment");
});

test("busy blocks edits, confirm and every close path while retaining visible status", () => {
  const host = mount(routine, { busy: true, notice: "Saving" });
  host.change("chat-plan-title", "Ignored edit");
  expect(host.find("chat-plan-title").props.value).toBe("Read a chapter");
  host.press("chat-plan-close"); host.press("chat-plan-confirm");
  host.invoke(host.tree!, "onRequestClose");
  host.invoke(host.find("chat-plan-sheet"), "onAccessibilityEscape");
  const scrim = host.all().find(node => node.props.onResponderRelease)!;
  host.invoke(scrim, "onResponderRelease");
  expect(host.onClose).not.toHaveBeenCalled(); expect(host.onConfirm).not.toHaveBeenCalled();
  expect(host.find("chat-plan-confirm").props).toMatchObject({ disabled: true, loading: true });
  expect(host.find("chat-plan-notice").props).toMatchObject({ accessibilityRole: "alert", accessibilityLiveRegion: "polite", children: "Saving" });
  host.update({ busy: false }); host.press("chat-plan-close"); expect(host.onClose).toHaveBeenCalledTimes(1);
});

test("blank title or malformed optional time blocks confirmation, and a missing candidate renders no modal", () => {
  expect(mount(null).tree).toBeNull();
  const host = mount(routine);
  host.change("chat-plan-title", "   "); host.press("chat-plan-confirm"); expect(host.onConfirm).not.toHaveBeenCalled();
  host.change("chat-plan-title", "Read"); host.change("chat-plan-time", "9:xx");
  expect(host.find("chat-plan-confirm").props.disabled).toBe(true);
  host.change("chat-plan-time", ""); expect(host.find("chat-plan-confirm").props.disabled).toBe(false);
});

test("the phone-aware sheet limits scrolling, keeps keyboard avoidance, and respects the safe bottom", () => {
  const host = mount(routine);
  expect(host.tree).toMatchObject({ type: "ScreenModal", props: { visible: true, transitionKind: "sheet" } });
  expect(host.all().some(node => node.type === "KeyboardAvoidingArea")).toBe(true);
  expect(host.all().find(node => node.type === "PixelSurface")?.props.shrink).toBe(true);
  expect(host.all().find(node => node.type === "ScrollView")?.props.keyboardShouldPersistTaps).toBe("handled");
  expect(host.all().some(node => Array.isArray(node.props.style) && node.props.style.some(style => (style as Props)?.paddingBottom === 34))).toBe(true);
});
