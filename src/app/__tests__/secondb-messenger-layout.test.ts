import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../secondb.tsx"), "utf8");
const transcript = source.slice(source.indexOf("turns.map((turn, i)"), source.indexOf("{sending ? (", source.indexOf("turns.map((turn, i)")));

describe("HustleK messenger layout", () => {
  test("each message has an avatar, with the saved user portrait passed in", () => {
    expect(transcript).toContain("<ChatMessageAvatar");
    expect(transcript).toContain("userAvatar={userAvatar}");
    expect(transcript).toContain("getExchangeExpression(turns, i)");
  });

  test("save and follow-up actions live in the composer dock, not in each bubble", () => {
    expect(transcript).not.toContain("keepExchange(i)");
    expect(transcript).not.toContain("turn.branches.map");
    const dock = source.slice(source.indexOf('<View testID="chat-composer-dock"'));
    expect(dock.indexOf("<ChatActionBar")).toBeGreaterThan(-1);
    expect(dock.indexOf("<ChatActionBar")).toBeLessThan(dock.indexOf("<ChatComposer"));
    expect(source).toContain("getWikiSuggestion(");
    expect(source).toContain("isCurrentWikiSuggestion(");
  });

  test("the composer uses a multiline growing input and preserves draft ownership", () => {
    expect(source).toContain("<ChatTextInput");
    expect(source).toContain("value={draft}");
    expect(source).toContain("onChangeText={setDraft}");
    expect(source).toContain('if (onSend(draft.trim())) setDraft("")');
  });

  test("clearing the conversation stops the old autosave before reusing turn indices", () => {
    const clear = source.slice(source.indexOf("if (sending || keeping !== null || keepInFlight.current) return;"));
    expect(clear.indexOf("autosaveSessionRef.current?.stop()")).toBeLessThan(clear.indexOf("setTurns([])"));
    expect(clear).toContain("setKeptIdx(new Set())");
    expect(source).toContain("}, [userId, activeConversationId])");
    expect(source).toContain("if (activeConversationId !== conversationId.current) return false");
  });
});
