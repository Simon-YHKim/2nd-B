import { partsOnPage, type BoardContract, type BoardPage } from "./board/contract";

/** The status bar and board use the same local, 24-hour clock. */
export function formatPhoneTime(now: Date, locale: string): string {
  return now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Only a rendered board clock replaces the status-bar time. */
export function hasPhoneBoardClock(board: BoardContract, page: BoardPage, dashboard: boolean): boolean {
  return dashboard && partsOnPage(board, page).some((part) => part.id === "P-01");
}
