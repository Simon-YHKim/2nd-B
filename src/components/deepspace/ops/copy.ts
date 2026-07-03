// Ops/assistant surface copy (EN canonical + KO), matching the Claude Design
// canonical (ops-assistant.dc.html EN/KO table). Kept as a typed bilingual map
// so EN↔KO parity is enforced at compile time (ko is typed as the en shape).
// Framing policy: plans / routines / ideas only — no outcome claims, no blame,
// no medical advice (vocabulary policy). Selected by the active locale.

import { useTranslation } from "react-i18next";

/** A demo/fallback reminder shown when the account has no scheduled routines
 *  yet (sb-more RemindersScreen static data, verbatim). */
export interface OpsDemoReminder {
  title: string;
  when: string;
  repeat: string;
  src: string;
  star: string;
}

export interface OpsCopy {
  // shared
  todaysRoutine: string;
  send: string;
  share: string;
  sendToApps: string;
  receivedOnly: string;
  notMedical: string;
  retry: string;
  // push sheet (B)
  whereToSend: string;
  consentOnce: string;
  deviceCalendar: string;
  deviceCalendarSub: string;
  googleCalendar: string;
  googleCalendarSub: string;
  icsFile: string;
  icsFileSub: string;
  shareChecklist: string;
  shareChecklistSub: string;
  recommended: string;
  allowAndContinue: string;
  // reminders (C)
  scheduledReminders: string;
  active: string;
  needsPermission: string;
  notOnThisDevice: string;
  enableNotifications: string;
  reminderUnavailableNote: string;
  remindersDeviceNote: string;
  remindersCountTemplate: string;
  addFromAssistant: string;
  assistantSource: string;
  starWord: string;
  demoReminders: OpsDemoReminder[];
  // states (E)
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  errorTitle: string;
  errorBody: string;
  unlinkedTitle: string;
  unlinkedBody: string;
  unlinkedCta: string;
  rateTitle: string;
  rateBody: string;
  // reading (2)
  myShelf: string;
  searchBooks: string;
  nowReading: string;
  wantToRead: string;
  add: string;
  whatReading: string;
  // milestones (3)
  goals: string;
  inProgress: string;
  planning: string;
  done: string;
  overdue: string;
  nextStep: string;
  // ledger (4)
  monthCheck: string;
  income: string;
  expense: string;
  left: string;
  record: string;
  byCategory: string;
  fxNote: string;
  // github (5)
  sideProject: string;
  thisWeek: string;
  commits: string;
  githubLinked: string;
  manage: string;
  // foods (6)
  weeklyMeals: string;
  whatToEatNow: string;
  quickMode: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  mealIdeas: string;
  nutritionNote: string;
  // meal persistence + reminders (④)
  planMeal: string;
  save: string;
  daily: string;
  weekly: string;
  once: string;
  remindersTip: string;
  remindersEntry: string;
}

const en: OpsCopy = {
  todaysRoutine: "Today's routine",
  send: "Send",
  share: "Share",
  sendToApps: "Send to my apps",
  receivedOnly: "Only the steps you accept go to your apps.",
  notMedical: "Not medical advice — ideas from your records.",
  retry: "Try again",
  whereToSend: "Where should this routine go?",
  consentOnce: "Just once. Allow calendar access.",
  deviceCalendar: "Device calendar",
  deviceCalendarSub: "Apple · Samsung · Outlook auto",
  googleCalendar: "Google Calendar",
  googleCalendarSub: "Open on the web",
  icsFile: "Calendar file (.ics)",
  icsFileSub: "Export via share",
  shareChecklist: "Share checklist",
  shareChecklistSub: "To notes / to-do apps",
  recommended: "Recommended",
  allowAndContinue: "Allow and continue",
  scheduledReminders: "Scheduled reminders",
  active: "Active",
  needsPermission: "Needs permission",
  notOnThisDevice: "Not on this device",
  enableNotifications: "Turn on notifications",
  reminderUnavailableNote: "You can schedule this in the full app.",
  remindersDeviceNote: "Sent as device notifications only. Nothing leaves your device.",
  remindersCountTemplate: "{n} scheduled reminders",
  addFromAssistant: "Add from today's assistant",
  assistantSource: "Today's assistant",
  starWord: "star",
  demoReminders: [
    { title: "Reach out to someone close", when: "Today 8:00 PM", repeat: "Once", src: "Today's assistant", star: "Relationships" },
    { title: "Screen off before midnight", when: "Every day 23:30", repeat: "Daily", src: "Routine", star: "Health" },
    { title: "Finish the saved read", when: "Tomorrow 9:00 AM", repeat: "Once", src: "SecondB suggestion", star: "Growth" },
    { title: "Check this month's subscriptions", when: "Jun 28, 10:00", repeat: "Monthly", src: "Today's assistant", star: "Finance" },
  ],
  emptyTitle: "No suggestions yet",
  emptyBody: "As your records grow I'll pick steps for you",
  emptyCta: "Add a record",
  errorTitle: "Couldn't load just now",
  errorBody: "Please check your connection",
  unlinkedTitle: "Not connected yet",
  unlinkedBody: "Connect for automatic, or just write it yourself",
  unlinkedCta: "Connect",
  rateTitle: "One moment",
  rateBody: "Lots of requests — resting briefly, back soon",
  myShelf: "My shelf",
  searchBooks: "Search title or author",
  nowReading: "NOW READING",
  wantToRead: "Want to read",
  add: "Add",
  whatReading: "What are you reading?",
  goals: "Goals",
  inProgress: "In progress",
  planning: "Planning",
  done: "Done",
  overdue: "Overdue",
  nextStep: "Next step",
  monthCheck: "This month",
  income: "Income",
  expense: "Spent",
  left: "Left",
  record: "Record",
  byCategory: "By category",
  fxNote: "Other currencies convert automatically (FX).",
  sideProject: "Side project",
  thisWeek: "THIS WEEK",
  commits: "commits",
  githubLinked: "GitHub linked",
  manage: "Manage",
  weeklyMeals: "This week's meals",
  whatToEatNow: "What should I eat now?",
  quickMode: "Quick mode",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  mealIdeas: "Meal ideas",
  nutritionNote: "Nutrition values are a reference — not dietary or medical advice.",
  planMeal: "Plan a meal",
  save: "Save",
  daily: "Daily",
  weekly: "Weekly",
  once: "Once",
  remindersTip: "Turn any of them off anytime.",
  remindersEntry: "Scheduled reminders",
};

const ko: OpsCopy = {
  todaysRoutine: "오늘의 루틴",
  send: "보내기",
  share: "공유",
  sendToApps: "내 앱으로 보내기",
  receivedOnly: "받은 걸음만 네 앱으로 나가요.",
  notMedical: "의료·진단 조언이 아니라 기록에서 뽑은 아이디어예요.",
  retry: "다시 시도",
  whereToSend: "이 루틴을 어디로 보낼까요?",
  consentOnce: "처음 한 번만. 캘린더 접근을 허용할게요.",
  deviceCalendar: "기기 캘린더",
  deviceCalendarSub: "애플 · 삼성 · Outlook 자동",
  googleCalendar: "Google 캘린더",
  googleCalendarSub: "웹으로 열기",
  icsFile: "캘린더 파일 (.ics)",
  icsFileSub: "공유로 내보내기",
  shareChecklist: "체크리스트 공유",
  shareChecklistSub: "메모 · 투두 앱으로",
  recommended: "추천",
  allowAndContinue: "허용하고 계속",
  scheduledReminders: "예약 리마인더",
  active: "활성",
  needsPermission: "권한 필요",
  notOnThisDevice: "이 기기 불가",
  enableNotifications: "알림 권한 켜기",
  reminderUnavailableNote: "정식 앱에서 예약할 수 있어요.",
  remindersDeviceNote: "기기 알림으로만 보내요. 내용은 기기를 떠나지 않아요.",
  remindersCountTemplate: "예약된 리마인더 {n}개",
  addFromAssistant: "오늘의 비서에서 추가",
  assistantSource: "오늘의 비서",
  starWord: "별",
  demoReminders: [
    { title: "가까운 사람에게 안부 전하기", when: "오늘 저녁 8:00", repeat: "한 번", src: "오늘의 비서", star: "관계" },
    { title: "밤 12시 전 화면 끄기", when: "매일 23:30", repeat: "매일", src: "루틴", star: "건강" },
    { title: "담아둔 「몰입」 마저 읽기", when: "내일 오전 9:00", repeat: "한 번", src: "세컨비 제안", star: "성장" },
    { title: "이번 달 구독 점검", when: "6월 28일 10:00", repeat: "매월", src: "오늘의 비서", star: "재정" },
  ],
  emptyTitle: "아직 추천이 없어요",
  emptyBody: "기록이 쌓이면 걸음을 골라줄게요",
  emptyCta: "기록 담기",
  errorTitle: "잠시 불러오지 못했어요",
  errorBody: "네트워크를 확인해 주세요",
  unlinkedTitle: "아직 연결 안 됐어요",
  unlinkedBody: "연결하면 자동으로, 아니면 직접 적어요",
  unlinkedCta: "연결하기",
  rateTitle: "잠시만요",
  rateBody: "요청이 많아 잠깐 쉬어가요 · 곧 다시",
  myShelf: "내 책장",
  searchBooks: "제목 · 저자 검색",
  nowReading: "NOW READING",
  wantToRead: "읽고 싶은 책",
  add: "담기",
  whatReading: "무슨 책을 읽고 있나요?",
  goals: "목표",
  inProgress: "진행 중",
  planning: "계획",
  done: "완료",
  overdue: "마감 지남",
  nextStep: "다음 한 걸음",
  monthCheck: "이번 달 점검",
  income: "수입",
  expense: "지출",
  left: "잔여",
  record: "기록",
  byCategory: "분류별 지출",
  fxNote: "다통화는 자동 환산돼요 (FX).",
  sideProject: "사이드 프로젝트",
  thisWeek: "THIS WEEK",
  commits: "커밋",
  githubLinked: "GitHub 연결됨",
  manage: "관리",
  weeklyMeals: "이번 주 식단",
  whatToEatNow: "지금 뭐 먹지?",
  quickMode: "간단 모드",
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  mealIdeas: "아이디어",
  nutritionNote: "영양 수치는 참고용이에요 · 식이·의료 조언이 아닙니다.",
  planMeal: "끼니 입력",
  save: "저장",
  daily: "매일",
  weekly: "매주",
  once: "한 번",
  remindersTip: "언제든 항목별로 끌 수 있어요.",
  remindersEntry: "예약 리마인더",
};

export const OPS_COPY = { en, ko } as const;

/** Returns the Ops copy for the active locale (KO for Korean, EN otherwise). */
export function useOpsCopy(): OpsCopy {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("ko") ? ko : en;
}
