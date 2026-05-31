import { buildProposeTemplatePrompt, parseProposedTemplate } from "../propose-template";
import { FORBIDDEN_TERMS } from "../../safety/lexicon";

describe("buildProposeTemplatePrompt", () => {
  it("lists the 8 base kinds, includes the url, caps the content", () => {
    const { system, user } = buildProposeTemplatePrompt("x".repeat(9000), "https://example.com/p", "en");
    for (const k of ["inbox", "article", "video", "paper", "reddit", "code", "ai_tool", "self_knowledge"]) {
      expect(system).toContain(k);
    }
    expect(system).toContain("https://example.com/p");
    expect(user.length).toBe(4000);
  });
});

describe("parseProposedTemplate", () => {
  it("parses a well-formed proposal and sanitizes slug + tags + props", () => {
    const raw = JSON.stringify({
      slug: "Podcast Episode!!",
      base_kind: "video",
      name: { en: "Podcast Episode", ko: "팟캐스트 에피소드" },
      what: { en: "A podcast episode page.", ko: "팟캐스트 에피소드 페이지." },
      defaultTags: ["#Podcast", "audio show"],
      targetCategory: "concepts",
      aiProperties: [
        { name: "host", type: "text", describe: { en: "The host(s).", ko: "진행자." } },
        { name: "" }, // dropped — no name
      ],
    });
    const p = parseProposedTemplate(raw, "inbox");
    expect(p).not.toBeNull();
    expect(p!.baseKind).toBe("video");
    expect(p!.slug).toBe("podcast-episode");
    expect(p!.name.ko).toBe("팟캐스트 에피소드");
    expect(p!.defaultTags).toEqual(["podcast", "audio-show"]);
    expect(p!.targetCategory).toBe("concepts");
    expect(p!.aiProperties).toHaveLength(1);
    expect(p!.aiProperties[0].name).toBe("host");
  });

  it("returns null on bad JSON or a missing name", () => {
    expect(parseProposedTemplate("not json", "inbox")).toBeNull();
    expect(parseProposedTemplate(JSON.stringify({ base_kind: "video" }), "inbox")).toBeNull();
  });

  it("drops a proposal carrying clinical vocabulary (C-vocabulary gate)", () => {
    // Source the banned term from the lexicon so this test file itself stays
    // clean of forbidden literals (src/lib/wiki/__tests__ isn't on the scan allowlist).
    const banned = FORBIDDEN_TERMS.en[0];
    const raw = JSON.stringify({
      name: { en: `${banned} notes`, ko: "노트" },
      what: { en: "x", ko: "y" },
      base_kind: "article",
    });
    expect(parseProposedTemplate(raw, "inbox")).toBeNull();
  });

  it("falls back to the URL-derived kind when base_kind is invalid", () => {
    const raw = JSON.stringify({ name: { en: "Thing", ko: "" }, base_kind: "nope" });
    expect(parseProposedTemplate(raw, "paper")!.baseKind).toBe("paper");
  });
});
