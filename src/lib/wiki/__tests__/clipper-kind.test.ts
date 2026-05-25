import { detectClipperKind } from "../clipper-kind";

describe("detectClipperKind", () => {
  test.each([
    ["https://www.youtube.com/watch?v=abc", "video"],
    ["https://youtu.be/abc", "video"],
    ["https://m.youtube.com/watch?v=abc", "video"],
    ["https://www.reddit.com/r/MachineLearning/comments/x/", "reddit"],
    ["https://old.reddit.com/r/x/", "reddit"],
    ["https://arxiv.org/abs/2401.01234", "paper"],
    ["https://doi.org/10.1234/abc", "paper"],
    ["https://www.nature.com/articles/x", "paper"],
    ["https://onlinelibrary.wiley.com/doi/x", "paper"],
    ["https://psycnet.apa.org/record/x", "paper"],
    ["https://www.anthropic.com/news/claude-3-5", "ai_tool"],
    ["https://claude.ai/code", "ai_tool"],
    ["https://platform.openai.com/docs/x", "ai_tool"],
    ["https://huggingface.co/meta-llama/x", "ai_tool"],
    ["https://github.com/anthropics/claude-code", "code"],
    ["https://github.com/owner/repo/tree/main", "code"],
    ["https://example.com/some-article", "article"],
    ["https://www.example.com/", "article"],
    ["https://blog.example.com/post/123", "article"],
  ])("%s → %s", (url, expected) => {
    expect(detectClipperKind(url)).toBe(expected);
  });

  test("github.com root (no path) falls through to article", () => {
    expect(detectClipperKind("https://github.com")).toBe("article");
    expect(detectClipperKind("https://github.com/")).toBe("article");
  });

  test("github.com/<owner> only is still article, not code", () => {
    expect(detectClipperKind("https://github.com/anthropics")).toBe("article");
  });

  test("invalid URL → inbox fallback", () => {
    expect(detectClipperKind("not a url")).toBe("inbox");
    expect(detectClipperKind("")).toBe("inbox");
    expect(detectClipperKind("file:///etc/passwd")).toBe("inbox");
  });

  test("case-insensitive host matching", () => {
    expect(detectClipperKind("https://YouTube.com/watch?v=x")).toBe("video");
    expect(detectClipperKind("https://ArXiv.org/abs/x")).toBe("paper");
  });

  test("strips leading www. before matching", () => {
    expect(detectClipperKind("https://www.youtube.com/watch?v=x")).toBe("video");
    expect(detectClipperKind("https://www.nature.com/x")).toBe("paper");
  });
});
