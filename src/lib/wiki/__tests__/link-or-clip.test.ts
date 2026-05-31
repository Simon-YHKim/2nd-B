import { classifyLinkOrClip, isBareUrl, firstUrlIn } from "../link-or-clip";

describe("classifyLinkOrClip", () => {
  test("empty input", () => {
    expect(classifyLinkOrClip("")).toBe("empty");
    expect(classifyLinkOrClip("   \n  ")).toBe("empty");
  });
  test("single URL → url", () => {
    expect(classifyLinkOrClip("https://example.com/a")).toBe("url");
    expect(classifyLinkOrClip("  http://x.io  ")).toBe("url");
  });
  test("multi-line or prose → markdown", () => {
    expect(classifyLinkOrClip("# Title\n\nbody text")).toBe("markdown");
    expect(classifyLinkOrClip("https://x.io and some note")).toBe("markdown");
    expect(classifyLinkOrClip("그냥 메모")).toBe("markdown");
  });
});

describe("isBareUrl", () => {
  test("true only for a lone URL", () => {
    expect(isBareUrl("https://x.io")).toBe(true);
    expect(isBareUrl("https://x.io extra")).toBe(false);
    expect(isBareUrl("note")).toBe(false);
  });
});

describe("firstUrlIn", () => {
  test("pulls the first URL out of markdown", () => {
    expect(firstUrlIn("see https://a.com/x for more")).toBe("https://a.com/x");
    expect(firstUrlIn("[link](https://b.io/y) here")).toBe("https://b.io/y");
  });
  test("null when no url", () => {
    expect(firstUrlIn("no links here")).toBeNull();
  });
});
