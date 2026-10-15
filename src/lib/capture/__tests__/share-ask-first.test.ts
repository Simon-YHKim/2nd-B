import { appendSharedChunk, planSharedConsumption } from "../draft";
import { classifyLinkOrClip, titledLinkIn } from "../../wiki/link-or-clip";
import { normalizeSharedCaptureParams } from "../share-params";

// Q-261013-78 (Simon, 2026-10-13, option 나) · Z112: a share that arrived while unsaved text sat in
// the link box was added under that text without a word. The screen now asks first. The planner's
// part: with existingLinkText "hold" it changes nothing in that draft and hands the share back.
const EMPTY_LIVE = { body: "", topic: "", conclusion: "" };
const base = {
  liveDraft: EMPTY_LIVE,
  liveMode: "linkclip" as const,
  currentMode: "linkclip" as const,
  liveFourw: null,
  restoreSkipped: true,
  modeParam: undefined,
  tagParam: undefined,
};

describe("a share landing on unsaved text in the link box", () => {
  const draft = { body: "쓰던 글입니다.", topic: "", conclusion: "", tags: ["읽을것"] };

  test("hold: the draft is untouched and the share comes back for the screen to ask", () => {
    const plan = planSharedConsumption({ ...base, drafts: { linkclip: draft }, content: "https://example.com/a", existingLinkText: "hold" });
    expect(plan.held).toEqual({ content: "https://example.com/a", tag: null });
    expect(plan.mode).toBe("linkclip");
    expect(plan.drafts.linkclip).toEqual(draft);
    expect(plan.liveBody).toBe("쓰던 글입니다.");
    expect(plan.liveTags).toEqual(["읽을것"]);
    expect(plan.persistMode).toBe("linkclip");
  });

  test("hold keeps what the user was typing a moment ago, not only what was stored", () => {
    const plan = planSharedConsumption({
      ...base,
      restoreSkipped: false,
      liveDraft: { body: "방금 친 글", topic: "", conclusion: "" },
      drafts: {},
      content: "https://example.com/a",
      existingLinkText: "hold",
    });
    expect(plan.held?.content).toBe("https://example.com/a");
    expect(plan.drafts.linkclip?.body).toBe("방금 친 글");
  });

  test("hold carries the ordinary tag that came with the share, and does not add it yet", () => {
    const plan = planSharedConsumption({ ...base, drafts: { linkclip: draft }, content: "새 공유", tagParam: "나중에", existingLinkText: "hold" });
    expect(plan.held).toEqual({ content: "새 공유", tag: "나중에" });
    expect(plan.drafts.linkclip?.tags).toEqual(["읽을것"]);
  });

  test("an empty link box takes the share directly even with hold", () => {
    const plan = planSharedConsumption({ ...base, drafts: {}, content: "https://example.com/a", existingLinkText: "hold" });
    expect(plan.held).toBeNull();
    expect(plan.drafts.linkclip?.body).toBe("https://example.com/a");
  });

  test("the same share delivered again is not asked about: nothing would be added", () => {
    const plan = planSharedConsumption({
      ...base,
      drafts: { linkclip: { body: "쓰던 글입니다.\n\nhttps://example.com/a", topic: "", conclusion: "" } },
      content: "https://example.com/a",
      existingLinkText: "hold",
    });
    expect(plan.held).toBeNull();
    expect(plan.drafts.linkclip?.body).toBe("쓰던 글입니다.\n\nhttps://example.com/a");
  });

  test("without hold the long-standing behaviour stays: the share goes below the text", () => {
    const plan = planSharedConsumption({ ...base, drafts: { linkclip: draft }, content: "https://example.com/a" });
    expect(plan.held).toBeNull();
    expect(plan.drafts.linkclip?.body).toBe("쓰던 글입니다.\n\nhttps://example.com/a");
  });

  test("hold is only about the link box: a share aimed at another composer still appends there", () => {
    const plan = planSharedConsumption({
      ...base,
      drafts: { memo: { body: "메모 초안", topic: "", conclusion: "" } },
      content: "공유된 글",
      modeParam: "memo",
      existingLinkText: "hold",
    });
    expect(plan.held).toBeNull();
    expect(plan.mode).toBe("memo");
    expect(plan.drafts.memo?.body).toBe("메모 초안\n\n공유된 글");
  });

  test("the two answers the screen offers: add below, or start with the share alone", () => {
    expect(appendSharedChunk("쓰던 글입니다.", "https://example.com/a")).toBe("쓰던 글입니다.\n\nhttps://example.com/a");
    expect(appendSharedChunk("", "https://example.com/a")).toBe("https://example.com/a");
  });
});

// Z113: a browser shares a title and an address. The box holds both, and it is a link.
describe("a share with a title and one address is a link", () => {
  test("the composed share is recognised, title and address apart", () => {
    const shared = normalizeSharedCaptureParams({ title: "Example Domain", text: "https://example.com/" });
    expect(shared?.content).toBe("Example Domain\n\nhttps://example.com/");
    expect(titledLinkIn(shared!.content)).toEqual({ title: "Example Domain", url: "https://example.com/" });
    expect(classifyLinkOrClip(shared!.content)).toBe("markdown");
  });

  test.each([
    ["an address alone", "https://example.com/"],
    ["a title alone", "Example Domain"],
    ["two paragraphs and an address", "첫 문단\n\n둘째 문단\n\nhttps://example.com/"],
    ["an address inside the title", "보세요 https://a.example\n\nhttps://example.com/"],
    ["a two-line title", "첫 줄\n둘째 줄\n\nhttps://example.com/"],
    ["text after the address", "Example Domain\n\nhttps://example.com/ 그리고 더"],
    ["unsaved text with a share added below it", "쓰던 글입니다.\n\nExample Domain\n\nhttps://example.com/"],
    ["empty", "   "],
  ])("%s is not a titled link", (_name, input) => {
    expect(titledLinkIn(input)).toBeNull();
  });

  test("surrounding blank lines do not matter", () => {
    expect(titledLinkIn("\n Example Domain \n\n\n https://example.com/a?b=1 \n")).toEqual({ title: "Example Domain", url: "https://example.com/a?b=1" });
  });
});
