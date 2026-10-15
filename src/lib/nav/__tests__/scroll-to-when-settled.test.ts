// Two touch-ups measured on 8081 (2026-10-13). A share that lands in the scrap screen's link box
// arrived below the first screenful: the box top sat at 791 of 844 and the card that asks about
// unsaved text at 791 too, both under the dock. And on sign-up the failure notice, which appears
// just above the submit button, pushed the button's label to 855 of 844.
import fs from "node:fs";
import path from "node:path";
import { hookHarness } from "./hook-harness";

const mockHarness = hookHarness();
jest.mock("react", () => mockHarness.hooks);
jest.mock("react-native", () => ({ BackHandler: { addEventListener: () => ({ remove: () => undefined }) } }));
jest.mock("expo-router", () => ({ router: {}, useFocusEffect: () => undefined, useLocalSearchParams: () => ({}) }));

type Helper = ReturnType<typeof import("../phone-embed").useScrollToWhenSettled>;
const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const numberIn = (source: string, name: string): number => {
  const found = new RegExp(`const ${name} = (\\d+);`).exec(source);
  expect(found).not.toBeNull();
  return Number(found?.[1]);
};

const embed = read("src/lib/nav/phone-embed.tsx");
const AFTER = numberIn(embed, "START_AT_END_AFTER_MS");
const FOLLOW = numberIn(embed, "SCROLL_TO_FOLLOW_MS");

describe("a scroll asked for while the screen is still settling", () => {
  let helper: Helper;
  let scrolls: number[];

  beforeAll(async () => {
    const mod = await import("../phone-embed");
    helper = mockHarness.render(() => mod.useScrollToWhenSettled());
  });
  beforeEach(() => {
    jest.useFakeTimers();
    scrolls = [];
    helper.scrollRef.current = { scrollTo: ({ y }: { y: number }) => { scrolls.push(y); } } as unknown as Helper["scrollRef"]["current"];
  });
  afterEach(() => {
    // Let any request from this test run out so the next one starts with none.
    jest.advanceTimersByTime(FOLLOW + AFTER + 1);
    helper.onContentSizeChange();
    jest.useRealTimers();
  });

  test("waits until the scroll memory's own restore has let go", () => {
    helper.scrollToWhenSettled(() => 400);
    expect(scrolls).toEqual([]);
    jest.advanceTimersByTime(AFTER - 1);
    expect(scrolls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(scrolls).toEqual([400]);
    const settle = /memory\.pending = false;\s*\}, (\d+)\);/.exec(read("src/lib/nav/scroll-memory.tsx"));
    expect(AFTER).toBeGreaterThan(Number(settle?.[1]) + 100);
  });

  test("content that changes size right after starts the wait again and the newest offset is used", () => {
    let top = 400;
    helper.scrollToWhenSettled(() => top);
    jest.advanceTimersByTime(AFTER - 100);
    top = 520;
    helper.onContentSizeChange();
    jest.advanceTimersByTime(AFTER - 1);
    expect(scrolls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(scrolls).toEqual([520]);
  });

  test("nothing moves while the target is not laid out, and its later layout is followed", () => {
    let top: number | null = null;
    helper.scrollToWhenSettled(() => top);
    jest.advanceTimersByTime(AFTER);
    expect(scrolls).toEqual([]);
    top = 300;
    helper.onContentSizeChange();
    jest.advanceTimersByTime(AFTER);
    expect(scrolls).toEqual([300]);
  });

  test("after a moment the scroll belongs to the person again", () => {
    helper.scrollToWhenSettled(() => 400);
    jest.advanceTimersByTime(AFTER);
    expect(scrolls).toEqual([400]);
    jest.advanceTimersByTime(FOLLOW);
    helper.onContentSizeChange();
    jest.advanceTimersByTime(AFTER * 3);
    expect(scrolls).toEqual([400]);
    expect(FOLLOW).toBeLessThanOrEqual(2000);
  });

  test("an offset above the top goes to the top", () => {
    helper.scrollToWhenSettled(() => -12);
    jest.advanceTimersByTime(AFTER);
    expect(scrolls).toEqual([0]);
  });

  test("without a request a change in content size moves nothing", () => {
    helper.onContentSizeChange();
    jest.advanceTimersByTime(AFTER * 3);
    expect(scrolls).toEqual([]);
  });
});

describe("the scrap screen brings the link box into view when a share lands in it", () => {
  const capture = read("src/app/capture.tsx");

  test("the screen's scroll view is the one the helper moves", () => {
    expect(capture).toContain("const { scrollRef: shareScrollRef, onContentSizeChange: followShareScroll, scrollToWhenSettled } = useScrollToWhenSettled();");
    expect(capture).toContain("        <ScrollView\n          ref={shareScrollRef}\n          onContentSizeChange={followShareScroll}\n");
  });

  test("the link box's group reports where it is", () => {
    expect(capture).toContain(
      '          {mode === "linkclip" ? (\n            <View style={styles.fieldGroup} onLayout={(event) => { linkGroupTopRef.current = event.nativeEvent.layout.y; }}>',
    );
  });

  test("only a share that lands in the link box asks for the scroll", () => {
    const calls = capture.split("scrollToWhenSettled(() =>").length - 1;
    expect(calls).toBe(1);
    const effectStart = capture.indexOf("const plan = planSharedConsumption({");
    const effectEnd = capture.indexOf("setHeldShare(plan.held);", effectStart);
    const call = capture.indexOf('if (plan.mode === "linkclip") {\n      scrollToWhenSettled(');
    expect(effectStart).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(effectStart);
    expect(call).toBeLessThan(effectEnd);
  });
});

describe("sign-up keeps the submit button on screen when a failure notice appears above it", () => {
  const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");

  test("the notice asks for it only for a failure on the form, not on the code step", () => {
    expect(signUp).toContain(
      'onLayout={toast.tone === "danger" && confirmSentTo === null ? () => scrollRef.current?.scrollToEnd({ animated: false }) : undefined}',
    );
  });

  // Going to the END only shows the button while the button is the last thing in the scroll.
  test("the submit button is still the last thing in the scroll, right after the notice", () => {
    // One notice element, shared by the form and the code step (Z18); the form draws it last but one.
    expect(signUp.split("<SignUpToast\n").length - 1).toBe(1);
    const notice = signUp.lastIndexOf("{notice}");
    expect(notice).toBeGreaterThan(-1);
    const tail = signUp.slice(notice, signUp.indexOf("</PixelGateShell>", notice));
    expect(tail.split("<PixelPressable").length - 1).toBe(1);
    expect(tail).toContain("onPress={() => void handleSubmit()}");
    expect(tail.trimEnd().endsWith("</PixelPressable>")).toBe(true);
  });
});
