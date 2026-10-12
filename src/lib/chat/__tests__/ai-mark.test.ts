import fs from "node:fs";
import path from "node:path";

import { aiMarkFor, type AiMarkTurn } from "../ai-mark";

// Simon 2026-10-12: the chat marks its answers as AI-made. Placement = by every
// answer's name (Q-261012-64, pick 가). Wording = 「이 답은 AI가 만들었어요.」 (his
// answer to Q-261012-30, relayed 23:17). The sentence is spelled out on the first
// answer of a conversation and is the spoken name of every mark.

const user: AiMarkTurn = { role: "user" };
const answer: AiMarkTurn = { role: "secondb", safetyZone: "green" };
const marks = (turns: AiMarkTurn[]) => turns.map((_, index) => aiMarkFor(turns, index));

describe("aiMarkFor: which chat turns say they are AI-made", () => {
  test("my own messages never carry the mark", () => {
    expect(marks([user, user])).toEqual(["none", "none"]);
  });

  test("the first answer spells the sentence out; later answers carry the mark only", () => {
    expect(marks([user, answer, user, answer, user, answer])).toEqual(["none", "spelled", "none", "mark", "none", "mark"]);
  });

  test("lines the app wrote itself are not called AI-made", () => {
    const hint: AiMarkTurn = { role: "secondb", synthetic: true };
    // A limit hint or an error line before the first real answer does not use up the spelled-out slot.
    expect(marks([user, hint, user, answer, user, answer])).toEqual(["none", "none", "none", "spelled", "none", "mark"]);
  });

  test("the fixed safety reply is not a model answer either", () => {
    const safety: AiMarkTurn = { role: "secondb", safetyZone: "red" };
    expect(marks([user, safety, user, answer])).toEqual(["none", "none", "none", "spelled"]);
    // A cautious (yellow) reply still comes from the model.
    expect(marks([user, { role: "secondb", safetyZone: "yellow" }])).toEqual(["none", "spelled"]);
  });

  test("an older in-memory answer without a zone counts as an answer", () => {
    expect(marks([user, { role: "secondb" }])).toEqual(["none", "spelled"]);
  });

  test("an index outside the list is none", () => {
    expect(aiMarkFor([user, answer], 5)).toBe("none");
    expect(aiMarkFor([], 0)).toBe("none");
  });
});

describe("chat screen and locales carry the mark", () => {
  const root = path.resolve(__dirname, "../../../..");
  const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
  const screen = read("src/app/secondb.tsx");
  const header = screen.slice(screen.indexOf("testID={`chat-message-header-${turn.role}-${i}`}"), screen.indexOf("<View style={ds.bubbleCol}>"));

  test("the mark sits in the answer's name row, right after the name", () => {
    expect(screen).toContain('import { aiMarkFor } from "@/lib/chat/ai-mark";');
    expect(header.indexOf("chat-message-name-")).toBeGreaterThan(0);
    expect(header.indexOf("chat-ai-mark-")).toBeGreaterThan(header.indexOf("chat-message-name-"));
    expect(header).toContain("aiMarkFor(turns, i)");
    expect(header).toContain('{t("aiMark.short")}');
  });

  test("the sentence is the mark's spoken name and is drawn once, on the spelled-out turn", () => {
    expect(header).toContain('accessibilityLabel={t("aiMark.spoken")}');
    expect(header).toMatch(/=== "spelled" \? \(\s*<Text[^>]*testID=\{`chat-ai-sentence-\$\{i\}`\}/);
    // Drawn as text once (the other use is the mark's spoken name).
    expect(header.match(/^\s*\{t\("aiMark\.spoken"\)\}\s*$/gm)).toHaveLength(1);
  });

  test("the answer's name row may wrap so the sentence never pushes past the edge", () => {
    expect(screen).toContain('aiMessageHeader: { flexWrap: "wrap" },');
    expect(screen).toContain('turn.role === "secondb" && ds.aiMessageHeader]} testID={`chat-message-header-${turn.role}-${i}`}>');
  });

  test("Korean uses Simon's sentence as written; every locale has both strings", () => {
    const copy = (lng: string) => (JSON.parse(read(`locales/${lng}/secondb.json`)) as { aiMark?: { short?: string; spoken?: string } }).aiMark;
    expect(copy("ko")).toEqual({ short: "AI", spoken: "이 답은 AI가 만들었어요." });
    for (const lng of ["en", "es", "pt", "id"]) {
      expect(copy(lng)?.short).toMatch(/^(AI|IA)$/);
      expect((copy(lng)?.spoken ?? "").length).toBeGreaterThan(10);
    }
  });
});
