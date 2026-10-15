// Ops/assistant surface copy (/meals · /ledger · /reading · /milestones ·
// /side-project · /reminders and the phone hub). The text lives in the ops bundle
// under `copy.*`, in all five locales; this module only names the fields.
//
// Q-261005-01 = A (QA 261006, R2B-03): these strings used to be two in-code maps,
// `en` and `ko`, picked with "KO for Korean, EN otherwise", so es/pt/id users saw
// English under translated chrome. The en and ko bundle values are the old map
// values byte for byte; es/pt/id are translated with the ops pack's own terms.
// `demoReminders` (the canon's four sample reminders) went with the maps: no
// screen read it.
//
// Framing policy: plans / routines / ideas only - no outcome claims, no blame,
// no medical advice (vocabulary policy).

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { renderedUiLanguage } from "@/lib/i18n/ui-language";

export interface OpsCopy {
  // shared
  todaysRoutine: string;
  send: string;
  share: string;
  sendToApps: string;
  receivedOnly: string;
  notMedical: string;
  /** 도구 바로가기 섹션. 허브가 자기 도구들을 링크하지 않아 만들어진 자리 -
   *  추천 목록과 역할이 다르다(추천 = 오늘 무엇을 할까, 도구 = 어디로 갈까). */
  toolsTitle: string;
  toolsHint: string;
  toolReading: string;
  toolMilestones: string;
  toolLedger: string;
  toolSideProject: string;
  toolMeals: string;
  toolFocus: string;
  toolSrs: string;
  toolReminders: string;
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
  // states (E)
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  errorTitle: string;
  errorBody: string;
  // A failed WRITE. Distinct from errorTitle/errorBody, which describe a failed READ:
  // a read failure means we cannot show you your data; a write failure means the thing
  // you just did did not happen. The ops screens used to say nothing at all for the
  // second case -- the tap simply did nothing, and the user was left to guess.
  saveFailed: string;
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
  // `fxNote` (a ledger line claiming other currencies were converted for you) was removed
  // 2026-10-05 (R2C-11): the form takes won only, ops_ledger has no currency column, and nothing
  // calls lib/finance/fx.ts. The true sentence lives in the ops bundle as
  // toolScreens.ledger.currencyNote, in all five locales. fx.ts itself stays (Q-261004-20 B).
  amountPlaceholder: string;
  categoryPlaceholder: string;
  addEntry: string;
  entriesLabel: string;
  /** Booking day of a ledger row: createLedgerEntry always took occurred_on, but
   *  the form never sent one, so yesterday's spending could not be recorded. */
  entryDate: string;
  deleteEntry: string;
  // github (7)
  sideProject: string;
  thisWeek: string;
  commits: string;
  githubLinked: string;
  manage: string;
  repos: string;
  githubHandle: string;
  // foods (6)
  weeklyMeals: string;
  prevWeek: string;
  nextWeek: string;
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
  // milestones (③) — named goals. Before these existed the add button wrote a
  // hardcoded "새 목표"/"New goal" with no way to name or rename one, so every
  // goal in the list was indistinguishable.
  goalTitlePlaceholder: string;
  goalRename: string;
  cancel: string;
  // due dates: the model + the overdue chip already existed, but nothing could
  // SET target_date, so "Overdue" was unreachable. These label the picker.
  dueDate: string;
  dueClear: string;
  // reading shelf (med#21) — status moves that make the NOW-READING hero real.
  startReading: string;
  finishedReading: string;
}

/** Every OpsCopy field. A Record over the interface, so adding a field without
 *  listing it here (or listing one the interface lacks) fails the type check. */
const OPS_COPY_FIELD_SET: Record<keyof OpsCopy, true> = {
  todaysRoutine: true,
  send: true,
  share: true,
  sendToApps: true,
  receivedOnly: true,
  notMedical: true,
  toolsTitle: true,
  toolsHint: true,
  toolReading: true,
  toolMilestones: true,
  toolLedger: true,
  toolSideProject: true,
  toolMeals: true,
  toolFocus: true,
  toolSrs: true,
  toolReminders: true,
  retry: true,
  whereToSend: true,
  consentOnce: true,
  deviceCalendar: true,
  deviceCalendarSub: true,
  googleCalendar: true,
  googleCalendarSub: true,
  icsFile: true,
  icsFileSub: true,
  shareChecklist: true,
  shareChecklistSub: true,
  recommended: true,
  allowAndContinue: true,
  scheduledReminders: true,
  active: true,
  needsPermission: true,
  notOnThisDevice: true,
  enableNotifications: true,
  reminderUnavailableNote: true,
  remindersDeviceNote: true,
  remindersCountTemplate: true,
  addFromAssistant: true,
  assistantSource: true,
  starWord: true,
  emptyTitle: true,
  emptyBody: true,
  emptyCta: true,
  errorTitle: true,
  errorBody: true,
  saveFailed: true,
  unlinkedTitle: true,
  unlinkedBody: true,
  unlinkedCta: true,
  rateTitle: true,
  rateBody: true,
  myShelf: true,
  searchBooks: true,
  nowReading: true,
  wantToRead: true,
  add: true,
  whatReading: true,
  goals: true,
  inProgress: true,
  planning: true,
  done: true,
  overdue: true,
  nextStep: true,
  monthCheck: true,
  income: true,
  expense: true,
  left: true,
  record: true,
  byCategory: true,
  amountPlaceholder: true,
  categoryPlaceholder: true,
  addEntry: true,
  entriesLabel: true,
  entryDate: true,
  deleteEntry: true,
  sideProject: true,
  thisWeek: true,
  commits: true,
  githubLinked: true,
  manage: true,
  repos: true,
  githubHandle: true,
  weeklyMeals: true,
  prevWeek: true,
  nextWeek: true,
  whatToEatNow: true,
  quickMode: true,
  breakfast: true,
  lunch: true,
  dinner: true,
  mealIdeas: true,
  nutritionNote: true,
  planMeal: true,
  save: true,
  daily: true,
  weekly: true,
  once: true,
  remindersTip: true,
  remindersEntry: true,
  goalTitlePlaceholder: true,
  goalRename: true,
  cancel: true,
  dueDate: true,
  dueClear: true,
  startReading: true,
  finishedReading: true,
};

export const OPS_COPY_FIELDS = Object.keys(OPS_COPY_FIELD_SET) as (keyof OpsCopy)[];

/** The ops bundle key a field is read from. */
export const opsCopyKey = (field: keyof OpsCopy): string => `copy.${field}`;

/** Builds the copy from an ops-namespace translator (pure, so tests can feed a real i18next). */
export function opsCopyFrom(t: (key: string) => string): OpsCopy {
  const out = {} as OpsCopy;
  for (const field of OPS_COPY_FIELDS) out[field] = t(opsCopyKey(field));
  return out;
}

/** Returns the Ops copy in the language the UI is painted in (ops bundle `copy.*`). */
export function useOpsCopy(): OpsCopy {
  const { t, i18n } = useTranslation("ops");
  // Read in the painted language (a lazy es/pt/id pack attaching flips it from
  // the "en" fallback), and keep one object per language so the screens' memo
  // and effect dependencies stay stable.
  const lng = renderedUiLanguage(i18n);
  return useMemo(() => opsCopyFrom((key) => t(key, { lng })), [t, lng]);
}
