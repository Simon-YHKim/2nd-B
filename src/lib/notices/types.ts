// Shared notice types.
//
// Two sources feed the same UI and deliberately stay separate:
//
//   bundled  - the PRODUCT_NOTICES array in src/app/notices.tsx. Release notes
//              that ship inside the binary and describe that binary. Read state
//              is a local "last seen id" cursor, because the ids are string
//              slugs that predate the notices table.
//   remote   - rows in the `notices` table (db/migrations/0113_notices.sql),
//              published by an operator after a release. Read state is a row in
//              user_notice_reads, so it follows the account across devices.
//
// This module holds the shapes both sides render through. It imports nothing
// from src/app so that src/app/notices.tsx can depend on it without a cycle
// (check:cycles is a zero-tolerance gate).

/** Display kind. `patch` / `developer` / `maintenance` are bundled-only; `major`
 *  / `minor` come from the notices table and are the only kinds that carry
 *  behaviour: `major` may interrupt with a popup, `minor` never does. */
export type NoticeKind = "patch" | "developer" | "maintenance" | "major" | "minor";

/** The two values of the `notice_kind` Postgres enum, in migration order.
 *  Mirrored by db/migrations/0113_notices.sql and asserted by
 *  src/lib/notices/__tests__/notices-migration.test.ts. */
export const REMOTE_NOTICE_KINDS = ["major", "minor"] as const;

export type RemoteNoticeKind = (typeof REMOTE_NOTICE_KINDS)[number];

export type LocalizedNoticeText = Readonly<{ ko: string; en: string }>;

export interface NoticeBodyBlock {
  kind: "paragraph" | "bullet";
  text: LocalizedNoticeText;
}

/** What the list rows and the dialog render. Bundled notices are authored in
 *  this shape directly; remote rows are adapted into it. */
export interface ProductNotice {
  id: string;
  kind: NoticeKind;
  eyebrow: LocalizedNoticeText;
  version?: string;
  when: LocalizedNoticeText;
  listMeta: LocalizedNoticeText;
  title: LocalizedNoticeText;
  body: readonly NoticeBodyBlock[];
}

/** A row of `notices`, camel-cased at the data-access boundary. */
export interface RemoteNotice {
  id: string;
  kind: RemoteNoticeKind;
  titleKo: string;
  titleEn: string;
  /** Markdown. Only paragraph / bullet structure is interpreted - see markdown.ts. */
  bodyKo: string;
  bodyEn: string;
  publishedAt: string;
  /** NULL in the table = visible to every build. */
  minAppVersion: string | null;
}
