// Adapt a `notices` row into the ProductNotice shape the list rows and the
// dialog already render.
//
// Deliberately an adapter rather than a second renderer: NoticeDialog and the
// /notices list are shipped, reviewed UI. Feeding remote rows through the same
// shape means the DB-backed notices inherit the existing layout, the scroll
// behaviour, the accessibility labels and the Korean line-breaking (keepAllKo)
// for free, and there is exactly one dialog to keep in sync with DESIGN.md.

import { noticeBodyToBlocks } from "./markdown";
import type { ProductNotice, RemoteNotice, RemoteNoticeKind } from "./types";

/** Tag copy shown in the dialog eyebrow and as the list row's kind label.
 *  ko/en only, matching the bundled notices and the ko/en columns in the table;
 *  es/id/pt fall back to EN exactly as the bundled notices already do. */
const KIND_LABEL: Record<RemoteNoticeKind, { ko: string; en: string }> = {
  major: { ko: "중요 공지", en: "IMPORTANT" },
  minor: { ko: "안내", en: "NOTICE" },
};

/** `2026.08.09`. Absolute, not relative ("3일 전"), because a notice about a
 *  maintenance window or an incident is read for its date; a relative label
 *  also drifts without a re-render. */
export function formatNoticeDate(publishedAt: string): string {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

export function adaptRemoteNotice(notice: RemoteNotice): ProductNotice {
  // remote.ts already drops rows whose kind is outside the enum, but this stays
  // total anyway: the client is untyped, this runs inside the home shell, and a
  // TypeError here would blank the screen. An unrecognised kind degrades to the
  // quiet one - it renders, and pickPopupNotice() will not let it interrupt
  // because that check is a strict === "major".
  const kind: RemoteNoticeKind = notice.kind === "major" ? "major" : "minor";
  const label = KIND_LABEL[kind];
  const date = formatNoticeDate(notice.publishedAt);
  return {
    id: notice.id,
    kind,
    eyebrow: label,
    when: {
      ko: date === "" ? label.ko : `${date} · ${label.ko}`,
      en: date === "" ? label.en : `${date} · ${label.en}`,
    },
    listMeta: {
      ko: date === "" ? label.ko : `${label.ko} · ${date}`,
      en: date === "" ? label.en : `${label.en} · ${date}`,
    },
    title: { ko: notice.titleKo, en: notice.titleEn },
    body: noticeBodyToBlocks(notice.bodyKo, notice.bodyEn),
    sortAt: notice.publishedAt,
  };
}
