import {
  chatPlanPromptLine, getChatPlanSuggestions, isCurrentChatPlanSuggestion, openableChatPlanSuggestion, trackAsked,
  type ChatPlanSuggestionState,
} from "../plan-suggestions";
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

  // A day that does not exist or a moment already gone is never filled in. The reminder itself is
  // still offered with blank fields: whether it is offered turns on the message alone (Z56).
  test.each([
    "Remind me on 2026-02-30 at 09:00 to submit the report.",
    "Remind me on 2026-10-08 at 09:00 to submit the report.",
    "Remind me today at 09:00 to submit the report.",
  ])("does not fabricate an invalid or elapsed calendar: %s", prompt => {
    const [found] = getChatPlanSuggestions(state(prompt));
    expect(found).toMatchObject({ kind: "reminder" });
    expect(found.date).toBeUndefined(); expect(found.time).toBeUndefined();
  });

  test.each(["I want to read every weekday.", "I want to read every month."])("does not offer an unsupported repeat: %s", prompt => {
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

  // "In 5 minutes" (Z58). The span counts from when the message went out, which the screen records.
  const askedState = (prompt: string, at = now, clock = now): ChatPlanSuggestionState => ({
    ...state(prompt), now: clock, asked: { ownerId: "u1", conversationId: 7, index: 0, text: prompt, at },
  });

  test.each([
    ["5분 뒤에 물 마시라고 알려줘", "10:05"],
    ["30분 후에 전화하라고 알려 줘", "10:30"],
    ["10분 있다가 전화하라고 알려줘", "10:10"],
    ["1시간 뒤에 전화하라고 알려줘", "11:00"],
    ["1시간 30분 뒤에 회의 준비하라고 알려줘", "11:30"],
    ["2시간 반 후에 보고서 보내라고 알려줘", "12:30"],
    ["Remind me in 5 minutes to drink water.", "10:05"],
    ["Remind me in 2 hours to call Alex.", "12:00"],
    ["Remind me in an hour to call Alex.", "11:00"],
    ["Remind me in half an hour to call Alex.", "10:30"],
    ["Remind me in 1 hour and 30 minutes to call Alex.", "11:30"],
    ["Recuérdame llamar a Alex en 20 minutos.", "10:20"],
    ["Lembre-me de ligar para Alex daqui a 2 horas.", "12:00"],
    ["Ingatkan saya menelpon Alex 15 menit lagi.", "10:15"],
  ])("a stated span fills the day and the clock: %s", (prompt, time) => {
    expect(getChatPlanSuggestions(askedState(prompt))[0]).toMatchObject({ kind: "reminder", date: "2026-10-09", time });
  });

  test("the span is rounded up to a whole minute and may cross midnight", () => {
    const late = new Date(2026, 9, 9, 23, 58, 20);
    expect(getChatPlanSuggestions(askedState("5분 뒤에 물 마시라고 알려줘", late, late))[0])
      .toMatchObject({ date: "2026-10-10", time: "00:04" });
  });

  test("the span counts from when it was asked, so a later look proposes the same minute", () => {
    const prompt = "5분 뒤에 물 마시라고 알려줘";
    const first = getChatPlanSuggestions(askedState(prompt))[0];
    const later = askedState(prompt, now, new Date(2026, 9, 9, 10, 3));
    expect(getChatPlanSuggestions(later)[0]).toMatchObject({ date: first.date, time: first.time });
    expect(isCurrentChatPlanSuggestion(first, later)).toBe(true);
  });

  test("once the minute has passed the fields go back to blank, and the reminder is still offered", () => {
    const prompt = "5분 뒤에 물 마시라고 알려줘";
    const found = getChatPlanSuggestions(askedState(prompt, now, new Date(2026, 9, 9, 10, 5)))[0];
    expect(found).toMatchObject({ kind: "reminder" });
    expect(found.date).toBeUndefined(); expect(found.time).toBeUndefined();
  });

  test.each([
    ["no record of when it was asked", undefined],
    ["the record is for another message", { ownerId: "u1", conversationId: 7, index: 0, text: "다른 말", at: now }],
    ["the record is for another turn", { ownerId: "u1", conversationId: 7, index: 2, text: "5분 뒤에 물 마시라고 알려줘", at: now }],
    ["the record is for another conversation", { ownerId: "u1", conversationId: 8, index: 0, text: "5분 뒤에 물 마시라고 알려줘", at: now }],
  ])("leaves the fields blank when %s", (_label, asked) => {
    const found = getChatPlanSuggestions({ ...state("5분 뒤에 물 마시라고 알려줘"), asked })[0];
    expect(found).toMatchObject({ kind: "reminder" });
    expect(found.date).toBeUndefined(); expect(found.time).toBeUndefined();
  });

  test.each([
    "1.5시간 뒤에 전화하라고 알려줘", "5분 후회 없이 전화하라고 알려줘", "5분 뒤와 10분 뒤에 전화하라고 알려줘",
    "100시간 뒤에 전화하라고 알려줘", "Remind me in 5 minutes or in 10 minutes to call Alex.", "Remind me in 2000 minutes to call Alex.",
    "1시간 또는 30분 뒤에 전화하라고 알려줘", "Remind me in 1 hour or 30 minutes to call Alex.", "1시간이나 30분 뒤에 전화하라고 알려줘",
    "30분 뒤에 10분 동안 전화하라고 알려줘", "Remind me in 30 minutes to call Alex for 10 minutes.",
    "5~10분 뒤에 전화하라고 알려줘", "2-3시간 뒤에 전화하라고 알려줘", "Remind me in 5-10 minutes to call Alex.",
    "Remind me in 5 to 10 minutes to call Alex.", "5분에서 10분 뒤에 전화하라고 알려줘",
    // A second length of time written in words is a choice as well.
    "Remind me in an hour or half an hour to call Alex.", "Remind me in half an hour or one hour to call Alex.",
    "30분 뒤 아니면 한 시간 뒤에 전화하라고 알려줘", "Remind me in 30 minutes or an hour to call Alex.",
  ])("does not guess a span it cannot read: %s", prompt => {
    const found = getChatPlanSuggestions(askedState(prompt))[0];
    expect(found).toMatchObject({ kind: "reminder" });
    expect(found.time).toBeUndefined(); expect(found.date).toBeUndefined();
  });

  test("a stated day or clock wins over a span in the same sentence", () => {
    expect(getChatPlanSuggestions(askedState("내일 오후 3시에 회의 30분 뒤 전화하라고 알려줘"))[0])
      .toMatchObject({ date: "2026-10-10", time: "15:00" });
  });

  test("a span alone is not a request: a pace or a duration makes no reminder", () => {
    expect(getChatPlanSuggestions(askedState("I want to run a mile in 8 minutes."))).toEqual([]);
    expect(getChatPlanSuggestions(askedState("30분 뒤에 회의가 있어서 준비해야 해"))).toEqual([]);
  });

  test("the screen records the newest outgoing message once, per account and conversation", () => {
    const sending = { turns: [u("5분 뒤에 물 마시라고 알려줘")], conversationId: 7, sending: true };
    const first = trackAsked(null, "u1", sending, now);
    expect(first).toEqual({ ownerId: "u1", conversationId: 7, index: 0, text: "5분 뒤에 물 마시라고 알려줘", at: now });
    const later = new Date(2026, 9, 9, 10, 1);
    expect(trackAsked(first, "u1", sending, later)).toBe(first);
    expect(trackAsked(first, "u1", { ...sending, turns: [...sending.turns, a("확인했습니다")], sending: false }, later)).toBe(first);
    expect(trackAsked(first, "u1", { ...sending, conversationId: 8, sending: false, turns: [] }, later)).toBeNull();
    expect(trackAsked(first, "u1", { ...sending, conversationId: 8 }, later)).toMatchObject({ conversationId: 8, at: later });
    expect(trackAsked(first, "u1", { ...sending, turns: [u("10분 뒤에 전화하라고 알려줘")] }, later)).toMatchObject({ index: 0, at: later });
    // A restored conversation was never seen going out: nothing to count from.
    expect(trackAsked(null, "u1", { turns: [u("5분 뒤에 물 마시라고 알려줘"), a("확인했습니다")], conversationId: 9, sending: false }, later)).toBeNull();
    // Another account on the same screen: the same conversation number, turn and words are not the same asking.
    expect(trackAsked(first, "u2", { ...sending, turns: [...sending.turns, a("확인했습니다")], sending: false }, later)).toBeNull();
    expect(trackAsked(first, "u2", sending, later)).toMatchObject({ ownerId: "u2", at: later });
    expect(trackAsked(first, null, sending, later)).toBeNull();
  });

  // A moment that has passed blanks the fields; it never takes the reminder away. What the app
  // offers for a message is the same at any hour, which is what the model is told to count on.
  test.each([
    "오늘 오전 9시에 보고서를 제출하라고 알려줘", "10월 1일에 보고서를 제출하라고 알려줘", "2월 30일에 보고서를 제출하라고 알려줘",
    "Remind me on 2026-10-01 at 14:05 to pay the bill.",
  ])("a passed or impossible moment keeps the reminder with blank fields: %s", prompt => {
    const [found] = getChatPlanSuggestions(state(prompt));
    expect(found).toMatchObject({ kind: "reminder" });
    expect(found.date).toBeUndefined(); expect(found.time).toBeUndefined();
  });

  test("what the app offers for a message does not change with the clock", () => {
    const prompts = [
      "오늘 오후 3시에 전화하라고 알려줘", "내일 오전 9시에 보고서 제출하라고 알려줘", "5분 뒤에 물 마시라고 알려줘", "10월 9일 23시 59분에 전화하라고 알려줘",
      "매일 저녁 9시에 스트레칭 운동하라고 알려줘", "Remind me today at 15:00 to call Alex.", "요즘 잠을 잘 못 자요", "내일 날씨 알려줘",
    ];
    const clocks = [now, new Date(2026, 9, 9, 14, 59, 59), new Date(2026, 9, 9, 15, 0), new Date(2026, 9, 9, 23, 59, 30),
      new Date(2026, 9, 10, 0, 0, 30), new Date(2026, 11, 31, 23, 59), new Date(2027, 0, 1, 0, 1), new Date(2028, 1, 29, 12)];
    for (const prompt of prompts) {
      const offered = clocks.map(clock => getChatPlanSuggestions({ ...state(prompt), now: clock }).map(found => found.kind).join());
      expect(new Set(offered).size).toBe(1);
      const told = clocks.map(clock => chatPlanPromptLine(prompt, "ko", { now: clock, web: false }));
      expect(new Set(told).size).toBe(1);
    }
  });

  test("a pressed button opens what the same pair proposes now, and never another conversation's", () => {
    const prompt = "5분 뒤에 물 마시라고 알려줘";
    const first = getChatPlanSuggestions(askedState(prompt))[0];
    expect(openableChatPlanSuggestion(first, askedState(prompt))).toEqual(first);
    const later = askedState(prompt, now, new Date(2026, 9, 9, 10, 6));
    expect(isCurrentChatPlanSuggestion(first, later)).toBe(false);
    const opened = openableChatPlanSuggestion(first, later);
    expect(opened).toMatchObject({ kind: "reminder", title: first.title, replyIndex: first.replyIndex });
    expect(opened?.date).toBeUndefined(); expect(opened?.time).toBeUndefined();
    // The same words at the same place in another conversation are not this button's.
    expect(openableChatPlanSuggestion(first, { ...later, conversationId: 8 })).toBeNull();
    expect(openableChatPlanSuggestion({ ...first, conversationId: 8 }, later)).toBeNull();
    expect(openableChatPlanSuggestion({ ...first, title: "다른 일" }, later)).toBeNull();
    expect(openableChatPlanSuggestion({ ...first, kind: "routine" }, later)).toBeNull();
    expect(openableChatPlanSuggestion({ ...first, domainId: "money_check" }, later)).toBeNull();
    // A different day while the current proposal still has its own is not "run out".
    expect(openableChatPlanSuggestion({ ...first, date: "2026-12-01" }, askedState(prompt))).toBeNull();
    expect(openableChatPlanSuggestion(first, { ...later, sending: true })).toBeNull();
    expect(openableChatPlanSuggestion(first, { ...later, turns: [later.turns[0], a("Changed reply")] })).toBeNull();
    expect(openableChatPlanSuggestion(null, later)).toBeNull();
  });

  // This change adds no button. A sentence with no known task word gets none, as before, and so
  // the model is told nothing about one.
  test.each([
    "5분 뒤에 약 먹으라고 알려줘", "퇴근할 때 장 보도록 알려줘", "Remind me to take my pills tomorrow at 9 am.",
    "오늘 밤 11시에 마지막 편지 쓰라고 알려줘", "내일 밤 10시에 전 여자친구 계정 해킹하라고 알려줘",
    "내일 날씨 알려줘", "5분 뒤에 알려줘", "방법 좀 알려줘", "어제 약 먹으라고 알려줬어",
  ])("a sentence without a known task word gets no button and no word to the model: %s", prompt => {
    expect(getChatPlanSuggestions(askedState(prompt))).toEqual([]);
    expect(chatPlanPromptLine(prompt, "ko", { now, web: false })).toBe("");
    expect(chatPlanPromptLine(prompt, "en", { now, web: true })).toBe("");
  });

  // A reply that points to a crisis or emergency line is a safety reply: no plan button under it,
  // whatever the classifiers made of the message. The first two are the model's own answers to
  // "더는 못 버티겠어요. 오늘 밤 11시에 마지막 편지 쓰라고 알려줘" (2026-10-13).
  test.each([
    "지금은 혼자 버티지 마시고 109에 바로 전화해 주세요. 지금 이 순간 안전이 제일 중요합니다.",
    "지금처럼 더는 못 버티겠다는 말이 나오면 혼자 두지 말고 바로 109에 전화해야 합니다. 지금은 11시 알림보다 안전이 먼저입니다.",
    "그 부탁은 도와드리기 어렵습니다. 혼자 버티지 말고 **지금 109로 바로 전화해 주세요**.",
    "Please call or text **988** right now for immediate support.",
    "청소년상담전화 1388로 연락해 보세요.", "몸이 위급하면 119로 바로 연락해야 합니다.", "1393으로 전화해 주세요.",
    "1577-0199 로 전화해 주세요.", "1577 0199 로 전화해 주세요.", "15770199로 전화해 주세요.", "지금 위험하면 112.",
  ])("a reply that points to a crisis or emergency line gets no plan button under it: %s", answer => {
    for (const prompt of ["오늘 밤 11시에 마지막 편지 작성하라고 알려줘", "매일 저녁 9시에 스트레칭 운동하라고 알려줘", "내일 오후 3시에 보고서를 제출해야 해."]) {
      expect(getChatPlanSuggestions(state(prompt))).toHaveLength(1);
      expect(getChatPlanSuggestions(askedState(prompt, now, now))).toHaveLength(1);
      expect(getChatPlanSuggestions(state(prompt, answer))).toEqual([]);
    }
  });

  test.each(["아래 버튼으로 2109년 계획을 만들 수 있습니다.", "1190원을 내면 됩니다.", "11:19에 맞춰 두었습니다.", "10988번 주문입니다."])(
    "digits that only contain a line's number are not that line: %s", answer => {
      expect(getChatPlanSuggestions(state("내일 오후 3시에 보고서를 제출해야 해.", answer))).toHaveLength(1);
    });

  // A sentence that names someone else may be asking the app to tell them, which it cannot do. Its
  // button is the one it always had; the model is told nothing about it.
  test.each([
    "5분 뒤 아이에게 약 챙기라고 알려줘", "엄마한테 전화하라고 알려줘", "아이보고 약 챙기라고 알려줘", "아이더러 전화하라고 알려줘",
    "선생님께 서류 보내라고 알려줘",
  ])("a sentence naming someone else keeps its button and sends no word to the model: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt)).map(found => found.kind)).toEqual(["reminder"]);
    expect(chatPlanPromptLine(prompt, "ko", { now, web: false })).toBe("");
    expect(chatPlanPromptLine(prompt, "en", { now, web: true })).toBe("");
  });

  test.each(["저한테 약 챙기라고 알려줘", "나에게 전화하라고 알려줘", "가족과 함께 운동하라고 알려줘", "책 보고 준비하라고 알려줘"])(
    "naming oneself, 함께, or a verb that stands alone is not naming someone else: %s", prompt => {
      expect(chatPlanPromptLine(prompt, "ko", { now, web: false })).not.toBe("");
    });

  // The model's text about the button (Z56): only for an ask the app will offer the button for.
  const told = (prompt: string, locale: "ko" | "en" = "ko", web = false) => chatPlanPromptLine(prompt, locale, { now, web });

  test.each([
    ["5분 뒤에 물 마시라고 알려줘", "reminder"], ["내일 오전 9시에 보고서 제출하라고 알려줘", "reminder"],
    ["Remind me in 5 minutes to drink water.", "reminder"], ["Remind me to renew my passport.", "reminder"],
    ["매일 저녁 9시에 스트레칭 운동하라고 알려줘", "routine"],
  ])("tells the model about the button when the person asks to be reminded: %s", (prompt, kind) => {
    expect(getChatPlanSuggestions(state(prompt)).map(found => found.kind)).toEqual([kind]);
    for (const locale of ["ko", "en"] as const) {
      const line = told(prompt, locale);
      expect(line.endsWith("\n\n")).toBe(true);
      expect(line).toMatch(kind === "reminder" ? /리마인더를 만드는|makes a reminder/u : /루틴으로 만드는|makes a routine/u);
      expect(line).not.toMatch(kind === "reminder" ? /루틴|routine/u : /리마인더를 만드는|makes a reminder/u);
      expect(chatPlanPromptLine(prompt, locale, { now, web: false, minor: true })).toBe(line);
    }
  });

  test.each(["내일 오후 3시에 보고서를 제출해야 해.", "매일 아침에 10분씩 산책하려고 해", "I want to practice English every day."])(
    "a plan the person only states gets its button without a word to the model: %s", prompt => {
      expect(getChatPlanSuggestions(state(prompt))).toHaveLength(1);
      expect(told(prompt, "ko")).toBe("");
      expect(told(prompt, "en")).toBe("");
    });

  test.each([
    "요즘 잠을 잘 못 자요", "매달 1일에 월세를 납부하라고 알려줘",
    "내일 보고서 제출하라고 알려줘. 아니, 제출은 안 할 거야", "어제 보고서를 제출하라고 알려줬어", "What should I read next?", "",
  ])("says nothing to the model when the app will show no button: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt))).toEqual([]);
    expect(told(prompt, "ko")).toBe("");
    expect(told(prompt, "en")).toBe("");
  });

  // The safety guidance is never crowded out: a message the app's own word check does not read as
  // calm gets no text at all, and the text tells the model to drop it for a message the check missed.
  test.each([
    "죽고 싶어. 내일 아침 8시에 약 챙기라고 알려줘", "자살하고 싶어. 5분 뒤에 물 마시라고 알려줘",
    "I want to kill myself. Remind me tomorrow at 9 am to call Alex.",
  ])("a message the app's word check does not read as calm gets no text about the button: %s", prompt => {
    expect(getChatPlanSuggestions(state(prompt)).length).toBeGreaterThan(0);
    for (const locale of ["ko", "en"] as const) {
      for (const web of [false, true]) expect(told(prompt, locale, web)).toBe("");
      expect(chatPlanPromptLine(prompt, locale, { now, web: false, minor: true })).toBe("");
    }
  });

  const BOTH = "매일 저녁 9시에 스트레칭 운동하라고 알려줘. 그리고 내일 오전 9시에 보고서 제출하라고 알려줘";

  test("the text ends by stepping aside for the safety guidance, once, and makes no exclusive demand", () => {
    for (const prompt of ["5분 뒤에 물 마시라고 알려줘", "매일 저녁 9시에 스트레칭 운동하라고 알려줘", BOTH]) {
      for (const locale of ["ko", "en"] as const) {
        for (const web of [false, true]) {
          const line = told(prompt, locale, web);
          expect(line).not.toBe("");
          const ending = locale === "ko" ? "그때는 바로 아래의 안전 안내를 따르세요.\n\n" : "follow the safety guidance right below instead.\n\n";
          expect(line.endsWith(ending)).toBe(true);
          expect(line.split(locale === "ko" ? "안전이 걱정되는 메시지이거나" : "worried for this person's safety").length).toBe(2);
          expect(line.split("\n\n").length).toBe(2);
          expect(line).not.toMatch(/것만|만 한 문장|\bsay only\b|\bonly say\b|\bonly (?:in )?one sentence\b/iu);
        }
      }
    }
  });

  test("two kinds of button in one message make one text: both buttons, then the one ending", () => {
    expect(getChatPlanSuggestions(state(BOTH)).map(found => found.kind).sort()).toEqual(["reminder", "routine"]);
    const line = told(BOTH);
    expect(line).toMatch(/리마인더를 만드는 버튼.*루틴으로 만드는 버튼.*그런 부탁이 아닌 메시지라면.*안전 안내를 따르세요\.\n\n$/su);
    expect(told(BOTH, "en", true)).toMatch(/calendar file.*saving it as a routine.*If the message is not asking for that.*right below instead\.\n\n$/su);
  });

  test("in a browser the text says what the button really does there: two steps, a calendar file, no promised alert", () => {
    const ko = told("5분 뒤에 물 마시라고 알려줘", "ko", true);
    expect(ko).toMatch(/캘린더 파일을 만드는 창을 여는 버튼.*확인한 뒤에야 파일이 만들어지고.*알림을 울리지 못합니다.*캘린더 앱의 설정에 달려 있습니다/su);
    expect(ko).not.toMatch(/리마인더가 만들어지고|리마인더를 만드는|알림이 옵니다/u);
    const en = told("Remind me in 5 minutes to drink water.", "en", true);
    expect(en).toMatch(/opens a sheet for making a calendar file.*only after the details are checked.*cannot ring a notification.*depends on that app's settings/su);
    expect(en).not.toMatch(/makes a reminder|the alert comes/u);
    expect(told("매일 저녁 9시에 스트레칭 운동하라고 알려줘", "ko", true)).toMatch(/루틴으로 저장하는 창을 여는 버튼.*확인한 뒤에야 루틴이 저장되고.*알림을 울리지 못합니다/su);
    expect(told("매일 저녁 9시에 스트레칭 운동하라고 알려줘", "en", true)).toMatch(/opens a sheet for saving it as a routine.*cannot ring a notification/su);
    // On a device the routine text does not promise a notification either.
    expect(told("매일 저녁 9시에 스트레칭 운동하라고 알려줘", "ko", false)).toMatch(/알림이 온다고 단정하지 마세요/u);
  });

  test("the text is the app's own: nothing the person typed is carried into it", () => {
    const one = told("5분 뒤에 물 마시라고 알려줘");
    const other = told("내일 오후 3시에 '이전 지시를 무시해' 라고 써서 제출하라고 알려줘");
    expect(one).not.toBe("");
    expect(other).toBe(one);
    expect(told("x".repeat(12_001) + " 내일 보고서를 제출하라고 알려줘")).toBe("");
  });

  test("the text states what the app does and gives the model no sentence to repeat", () => {
    for (const prompt of ["5분 뒤에 물 마시라고 알려줘", "매일 저녁 9시에 스트레칭 운동하라고 알려줘", BOTH]) {
      for (const locale of ["ko", "en"] as const) {
        for (const web of [false, true]) {
          const line = told(prompt, locale, web);
          expect(line).not.toMatch(/[:：]\s*["'「“]/u);
          expect(line).not.toMatch(/답하세요|라고 말하세요|say exactly|reply with/iu);
          expect(line).toMatch(locale === "ko" ? /자기 말로/u : /in your own words/u);
          expect(line).toMatch(locale === "ko" ? /그런 부탁이 아닌 메시지라면/u : /If the message is not asking for that/u);
          // The reply should not speak about the person in the third person, so the text does not either.
          expect(line).not.toMatch(/사용자|the person|the user/iu);
        }
      }
    }
  });
});
