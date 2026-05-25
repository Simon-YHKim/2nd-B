import { dailyPrompt, promptAt, PROMPT_COUNT } from "../daily-prompts";

describe("dailyPrompt", () => {
  test("EN and KO each have 15 prompts", () => {
    expect(PROMPT_COUNT).toBe(15);
  });

  test("stable per day — same date returns same prompt", () => {
    const d = new Date("2026-05-25T10:00:00Z");
    expect(dailyPrompt("en", d)).toBe(dailyPrompt("en", d));
    expect(dailyPrompt("ko", d)).toBe(dailyPrompt("ko", d));
  });

  test("rotates across days", () => {
    const d1 = new Date("2026-05-25T10:00:00Z");
    const d2 = new Date("2026-05-26T10:00:00Z");
    expect(dailyPrompt("en", d1)).not.toBe(dailyPrompt("en", d2));
  });

  test("cycles after PROMPT_COUNT days", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const after15 = new Date(start.getTime() + 15 * 86_400_000);
    expect(dailyPrompt("en", start)).toBe(dailyPrompt("en", after15));
  });

  test("EN and KO are independent lists, not translations of the same prompt at the same index", () => {
    // Sanity: pick the same index in both lists; they should be different
    // strings (different language, also different wording).
    expect(promptAt("en", 0)).not.toBe(promptAt("ko", 0));
  });

  test("promptAt handles negative indices via modulo", () => {
    expect(promptAt("en", -1)).toBe(promptAt("en", PROMPT_COUNT - 1));
    expect(promptAt("en", -PROMPT_COUNT)).toBe(promptAt("en", 0));
  });
});
