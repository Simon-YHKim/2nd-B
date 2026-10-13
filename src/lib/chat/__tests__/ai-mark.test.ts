import fs from "node:fs";
import path from "node:path";

import { topicParticle } from "@/lib/i18n/josa";

import { isModelAnswer, withAiCopyTail, type AiMarkTurn } from "../ai-mark";

// Simon 2026-10-13 15:49: no mark by each answer's name. One line under the input says the
// answers are AI-made, a card says it once when the chat is first opened, and a copied model
// answer ends with a line that says so. (2026-10-12 had a mark by every name: #2316.)

const user: AiMarkTurn = { role: "user" };
const answer: AiMarkTurn = { role: "secondb", safetyZone: "green" };

describe("isModelAnswer: which chat turns are AI-made", () => {
  test("my own messages are not", () => {
    expect(isModelAnswer(user)).toBe(false);
  });

  test("a model answer is, a cautious (yellow) one and an older one without a zone included", () => {
    expect(isModelAnswer(answer)).toBe(true);
    expect(isModelAnswer({ role: "secondb", safetyZone: "yellow" })).toBe(true);
    expect(isModelAnswer({ role: "secondb" })).toBe(true);
  });

  test("lines the app wrote itself are not", () => {
    expect(isModelAnswer({ role: "secondb", synthetic: true })).toBe(false);
  });

  test("the fixed safety reply is not: no model is called for it", () => {
    expect(isModelAnswer({ role: "secondb", safetyZone: "red" })).toBe(false);
  });

  test("a turn that is not there is not", () => {
    expect(isModelAnswer(undefined)).toBe(false);
  });
});

describe("withAiCopyTail: what a copied model answer ends with", () => {
  test("the last line says it is AI-made, one blank line below the answer", () => {
    expect(withAiCopyTail("답입니다.", "AI가 생성한 내용 (PolaScope)")).toBe("답입니다.\n\nAI가 생성한 내용 (PolaScope)");
  });

  test("blank lines at the end of the answer do not pile up", () => {
    expect(withAiCopyTail("답\n\n", "꼬리")).toBe("답\n\n꼬리");
  });
});

describe("chat screen and locales", () => {
  const root = path.resolve(__dirname, "../../../..");
  const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
  const screen = read("src/app/secondb.tsx");
  type Copy = { aiLine?: string; aiNotice?: { body?: string; confirm?: string }; aiCopyTail?: string; aiMark?: unknown; rev2: Record<string, { lensName: string }> };
  const copy = (lng: string) => JSON.parse(read(`locales/${lng}/secondb.json`)) as Copy;

  test("no mark is drawn by an answer's name any more", () => {
    expect(screen).not.toContain("chat-ai-mark-");
    expect(screen).not.toContain("chat-ai-sentence-");
    expect(screen).not.toContain("aiMark.");
  });

  test("one line sits under the input, inside the composer dock, and names who is answering now", () => {
    const dock = screen.slice(screen.indexOf('testID="chat-composer-dock"'), screen.indexOf("</KeyboardAvoidingArea>"));
    expect(dock.indexOf("<ChatComposer")).toBeGreaterThan(0);
    expect(dock.indexOf('testID="chat-ai-line"')).toBeGreaterThan(dock.indexOf("<ChatComposer"));
    expect(dock).toContain('{t("aiLine", aiNoticeWords)}');
    expect(screen).toContain("const aiNoticeName = t(`rev2.${rev2Persona}.lensName`);");
  });

  test("only a copied model answer gets the last line", () => {
    expect(screen).toContain('const copied = isModelAnswer(turns[i]) ? withAiCopyTail(text, t("aiCopyTail")) : text;');
    expect(screen).toContain("void writeClipboardText(copied)");
    expect(screen).not.toContain("void writeClipboardText(text)");
  });

  test("every locale has the strings with the name slot, and none carries a long dash", () => {
    for (const lng of ["ko", "en", "es", "pt", "id"]) {
      const c = copy(lng);
      expect(c.aiMark).toBeUndefined();
      expect(c.aiLine).toContain("{{name}}");
      expect(c.aiNotice?.body).toContain("{{name}}");
      expect((c.aiNotice?.confirm ?? "").length).toBeGreaterThan(0);
      expect(c.aiCopyTail).toContain("PolaScope");
      for (const text of [c.aiLine, c.aiNotice?.body, c.aiNotice?.confirm, c.aiCopyTail]) expect(text).not.toContain("—");
    }
  });

  test("Korean takes its particle from the code, so a name with or without a final consonant reads right", () => {
    // i18n/josa.test.ts forbids a particle written into the string after a value (「{{name}}는」).
    const ko = copy("ko");
    expect(ko.aiLine?.startsWith("{{name}}{{particle}} AI입니다.")).toBe(true);
    expect(ko.aiNotice?.body?.startsWith("{{name}}{{particle}} AI입니다.")).toBe(true);
    expect(screen).toContain("const aiNoticeWords = { name: aiNoticeName, particle: topicParticle(aiNoticeName) };");
    const said = (name: string) => (ko.aiLine ?? "").replace("{{name}}", name).replace("{{particle}}", topicParticle(name));
    expect(["secondb", "meta", "twi"].map((id) => said(ko.rev2[id].lensName).split(" AI입니다.")[0])).toEqual(["허슬케이는", "메타비는", "트위비는"]);
    expect(said("별").startsWith("별은 AI입니다.")).toBe(true);
    // Only Korean uses the particle slot.
    for (const lng of ["en", "es", "pt", "id"]) expect(JSON.stringify([copy(lng).aiLine, copy(lng).aiNotice])).not.toContain("{{particle}}");
  });
});
