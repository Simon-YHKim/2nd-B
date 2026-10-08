import { getChatPlanSuggestions, isCurrentChatPlanSuggestion, type ChatPlanSuggestionState } from "../plan-suggestions";
import type { ChatPresentationTurn } from "../presentation-policy";

const now = new Date(2026, 9, 9, 10, 0); // Friday, local wall clock.
const u = (text: string): ChatPresentationTurn => ({ role: "user", text });
const a = (text: string, extra: Partial<ChatPresentationTurn> = {}): ChatPresentationTurn => ({ role: "secondb", text, ...extra });
const state = (prompt: string, answer = "원하는 내용을 확인하고 직접 설정할 수 있습니다."): ChatPlanSuggestionState => ({
  turns: [u(prompt), a(answer)], conversationId: 7, sending: false, now,
});

describe("local routine and reminder suggestions", () => {
  test.each([
    ["매일 아침에 10분씩 산책하려고 해", "daily", "exercise_routine"],
    ["매주 월요일에 책을 읽는 루틴을 만들고 싶어", "weekly", "reading_list"],
    ["I want to practice English every day.", "daily", "language_practice"],
    ["Quiero caminar cada día.", "daily", "exercise_routine"],
    ["Quero caminhar todos os dias.", "daily", "exercise_routine"],
    ["Saya ingin berjalan setiap hari.", "daily", "exercise_routine"],
  ])("offers a user-intended recurring action: %s", (prompt, recurrence, domainId) => {
    const found = getChatPlanSuggestions(state(prompt));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "routine", recurrence, domainId, replyIndex: 1, conversationId: 7 });
    expect(found[0].title.length).toBeLessThanOrEqual(80);
  });

  test("weekly routine carries Sunday-zero weekday, without an invented clock time", () => {
    const [found] = getChatPlanSuggestions(state("매주 월요일에 책을 읽는 루틴을 만들고 싶어"));
    expect(found).toMatchObject({ recurrence: "weekly", weekday: 1 });
    expect(found.time).toBeUndefined();
    expect(found.date).toBeUndefined();
  });

  test("a clear future task becomes a reminder with explicit local date and time", () => {
    const [found] = getChatPlanSuggestions(state("내일 오후 3시에 보고서를 제출해야 해."));
    expect(found).toMatchObject({ kind: "reminder", date: "2026-10-10", time: "15:00" });
    expect(found.recurrence).toBeUndefined();
    expect(found.title).toContain("보고서");
  });

  test.each([
    ["Remind me tomorrow at 3:30 pm to call Alex.", "2026-10-10", "15:30"],
    ["Remind me next Monday at 09:00 to submit the report.", "2026-10-12", "09:00"],
    ["2026년 10월 20일 오전 9시에 서류를 제출해야 해.", "2026-10-20", "09:00"],
    ["Remind me on 2026-10-20 at 14:05 to pay the bill.", "2026-10-20", "14:05"],
    ["모레 오후 12시에 회의 준비를 해야 해.", "2026-10-11", "12:00"],
  ])("parses only stated calendar details: %s", (prompt, date, time) => {
    expect(getChatPlanSuggestions(state(prompt))[0]).toMatchObject({ kind: "reminder", date, time });
  });

  test.each([
    "내일 7시에 전화해야 해.", "Remind me tomorrow morning to call Alex.",
    "Remind me tomorrow at 7 to call Alex.", "Remind me tomorrow at 3 pm or 5 pm to call Alex.",
  ])("leaves ambiguous time for the user to choose: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt))[0]).toMatchObject({ kind: "reminder", date: "2026-10-10" });
    expect(getChatPlanSuggestions(state(prompt))[0].time).toBeUndefined();
  });

  test("an explicit reminder without a date leaves it blank", () => {
    const [found] = getChatPlanSuggestions(state("Remind me to renew my passport."));
    expect(found).toMatchObject({ kind: "reminder" });
    expect(found.date).toBeUndefined(); expect(found.time).toBeUndefined();
  });

  test("keeps different routine and one-off tasks separate", () => {
    const found = getChatPlanSuggestions(state("매일 10분 산책하려고 해. 그리고 내일 오후 3시에 보고서를 제출해야 해."));
    expect(found.map(row => row.kind)).toEqual(["routine", "reminder"]);
    expect(found[0].title).not.toContain("보고서");
    expect(found[1].title).not.toContain("산책");
  });

  test("a recurring reminder is one routine, not a duplicate one-off reminder", () => {
    const found = getChatPlanSuggestions(state("Remind me every day at 08:00 to read a book."));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "routine", recurrence: "daily", time: "08:00" });
  });

  test("may use an AI cadence for the user's own concrete habit intent", () => {
    const found = getChatPlanSuggestions(state("책을 읽는 습관을 만들고 싶어.", "매일 아침에 책을 10쪽씩 읽어 보세요."));
    expect(found[0]).toMatchObject({ kind: "routine", recurrence: "daily", domainId: "reading_list" });
    expect(found[0].title).toContain("10쪽");
  });

  test.each([
    ["안녕", "매일 산책하고 내일 보고서를 제출해 보세요."],
    ["오늘 날씨가 좋아", "매일 책을 읽는 루틴을 만들어 보세요."],
    ["계획을 세우고 싶어", "매일 아침 산책을 해 보세요."],
    ["책을 읽는 습관을 만들고 싶어", "매일 아침 산책을 해 보세요."],
    ["고마워", "내일 오전 9시에 은행에 가 보세요."],
  ])("does not turn arbitrary AI advice into the user's plan: %s", (prompt, answer) => {
    expect(getChatPlanSuggestions(state(prompt, answer))).toEqual([]);
  });

  test.each([
    "매일 산책은 안 하려고 해.", "매일 산책하는 루틴은 만들고 싶지 않아.",
    "내일 보고서를 제출하지 않을 거야.", "I do not want to walk every day.",
    "Don't remind me tomorrow to call Alex.", "I used to read every day.",
    "I already finished the report for tomorrow.", "어제 보고서를 이미 제출했어.",
    "Quiero caminar cada día, pero no quiero crear una rutina.",
    "내일 전화하는 건 취소했어.", "Remind me tomorrow.",
    "How do reminders work?", "Should I read every day?",
  ])("excludes negated, completed, past or noncommittal plans: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt))).toEqual([]);
  });

  test("does not misread 'don't forget' as a refusal", () => {
    expect(getChatPlanSuggestions(state("Don't forget to remind me tomorrow to call Alex."))[0]?.kind).toBe("reminder");
  });

  test.each([
    "Remind me on 2026-02-30 at 09:00 to submit the report.",
    "Remind me on 2026-10-08 at 09:00 to submit the report.",
    "Remind me today at 09:00 to submit the report.",
    "I want to read every weekday.",
    "I want to read every month.",
  ])("does not fabricate an invalid, elapsed or unsupported calendar: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt))).toEqual([]);
  });

  test("only the latest completed safe pair can produce a suggestion", () => {
    const initial = state("내일 오후 3시에 보고서를 제출해야 해");
    expect(getChatPlanSuggestions({ ...initial, sending: true })).toEqual([]);
    for (const extra of [{ synthetic: true }, { consentError: "paused" }, { safetyZone: "red" as const }]) {
      expect(getChatPlanSuggestions({ ...initial, turns: [initial.turns[0], a("확인했습니다", extra)] })).toEqual([]);
    }
    expect(getChatPlanSuggestions(state("내일 보고서를 제출해야 해", "죄송하지만 해당 요청을 도와드릴 수 없습니다."))).toEqual([]);
    expect(getChatPlanSuggestions({ ...initial, turns: [...initial.turns, u("thanks"), a("You are welcome.")] })).toEqual([]);
    expect(getChatPlanSuggestions({ ...initial, turns: [...initial.turns, u("새 질문")] })).toEqual([]);
    expect(getChatPlanSuggestions({ ...initial, turns: [...initial.turns, a("매일 산책해 보세요.")] })).toEqual([]);
  });

  test("captured suggestions are invalid after a new conversation, new reply, edit or send", () => {
    const initial = state("내일 오후 3시에 보고서를 제출해야 해.");
    const candidate = getChatPlanSuggestions(initial)[0];
    expect(candidate).toBeDefined();
    expect(isCurrentChatPlanSuggestion(candidate, initial)).toBe(true);
    expect(isCurrentChatPlanSuggestion(candidate, { ...initial, conversationId: 8 })).toBe(false);
    expect(isCurrentChatPlanSuggestion(candidate, { ...initial, sending: true })).toBe(false);
    expect(isCurrentChatPlanSuggestion(candidate, { ...initial, turns: [] })).toBe(false);
    expect(isCurrentChatPlanSuggestion(candidate, { ...initial, turns: [initial.turns[0], a("Changed reply")] })).toBe(false);
    expect(isCurrentChatPlanSuggestion({ ...candidate, date: "2026-12-01" }, initial)).toBe(false);
  });

  test.each([
    ["매일 산책하려고 해. 아니, 취소할게.", "네, 알겠습니다."],
    ["I want to walk every day. Actually, I don't want to do that.", "That is your choice."],
    ["I want to build a walking habit.", "Run five kilometres every day."],
    ["I want to build an English practice habit.", "Practice Spanish every day."],
  ])("does not retain revoked plans or replace the user's chosen activity", (prompt, answer) => {
    expect(getChatPlanSuggestions(state(prompt, answer))).toEqual([]);
  });

  test.each([
    "Remind me tomorrow or next Monday to call Alex.",
    "Remind me tomorrow on 2026-10-20 to call Alex.",
    "Remind me on 2026-10-20 or 2026-10-21 to call Alex.",
  ])("keeps conflicting calendar dates blank: %s", prompt => {
    const [found] = getChatPlanSuggestions(state(prompt));
    expect(found?.kind).toBe("reminder");
    expect(found?.date).toBeUndefined();
  });

  test.each([
    "내일 오후 3시부터 5시까지 회의를 준비해야 해.",
    "Remind me tomorrow at 3 pm or 7 to call Alex.",
    "Remind me tomorrow at 09:00 UTC to call Alex.",
  ])("does not choose a start or timezone from an ambiguous clock: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt))[0]?.time).toBeUndefined();
  });

  test("relative local dates cross the year without adding an arbitrary time", () => {
    const [found] = getChatPlanSuggestions({ ...state("내일 보고서를 제출해야 해."), now: new Date(2026, 11, 31, 10) });
    expect(found).toMatchObject({ date: "2027-01-01" });
    expect(found.time).toBeUndefined();
  });

  test("다음 주 means the next calendar week even when the weekday is still ahead this week", () => {
    const [found] = getChatPlanSuggestions({ ...state("다음 주 금요일 오후 3시에 서류를 제출해야 해."), now: new Date(2026, 9, 8, 10) });
    expect(found).toMatchObject({ date: "2026-10-16", time: "15:00" });
  });

  test.each([
    "매일 산책하고 싶어. 아니 산책은 안 할래.",
    "I want to walk every day. Actually I don't want to walk.",
    "내일 보고서를 제출해야 해. 아니 보고서 제출은 취소할게.",
  ])("withdrawal naming the action suppresses its earlier proposal: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt))).toEqual([]);
  });

  test.each(["저녁", "아침", "새벽"])("%s 12시 does not guess between midnight and noon", period => {
    const [found] = getChatPlanSuggestions(state(`내일 ${period} 12시에 전화하도록 알려줘.`));
    expect(found).toMatchObject({ kind: "reminder", date: "2026-10-10" });
    expect(found.time).toBeUndefined();
  });

  test.each([["오전", "00:00"], ["오후", "12:00"]])("explicit %s 12시 retains its unambiguous clock", (period, time) => {
    expect(getChatPlanSuggestions(state(`내일 ${period} 12시에 전화하도록 알려줘.`))[0]).toMatchObject({ time });
  });
});
