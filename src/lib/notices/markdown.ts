// The notice body arrives as markdown (notices.body_ko / body_en) but the
// dialog renders a fixed list of paragraph and bullet blocks - there is no
// markdown renderer in the app and adding one for this surface would pull a
// dependency for three text shapes.
//
// So the supported subset is deliberately tiny and stated in the runbook
// (docs/OPERATIONS-NOTICES.md):
//
//   - a line starting with "- " or "* " becomes a bullet
//   - consecutive other lines join into one paragraph, blank line ends it
//   - a leading "# " / "## " is stripped (operators reach for it by reflex,
//     and a literal hash in the dialog looks like a bug)
//
// Everything else, including inline **bold** and [links](), is passed through
// verbatim. That is a documented limitation, not an oversight: silently
// deleting characters an operator typed is worse than showing them.

import type { NoticeBodyBlock } from "./types";

const BULLET = /^\s*[-*]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

/** Parse one language's markdown body into blocks. Exported for the tests and
 *  for adaptRemoteNotice(); callers normally want the latter. */
export function parseNoticeMarkdown(body: string): { kind: "paragraph" | "bullet"; text: string }[] {
  const blocks: { kind: "paragraph" | "bullet"; text: string }[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (BULLET.test(line)) {
      // A bullet always starts its own block, so any open paragraph closes first.
      flush();
      const text = line.replace(BULLET, "").trim();
      if (text !== "") blocks.push({ kind: "bullet", text });
      continue;
    }
    paragraph.push(line.replace(HEADING, "").trim());
  }
  flush();

  return blocks;
}

/**
 * The blocks worth drawing for ONE language.
 *
 * noticeBodyToBlocks pads the shorter language with "" so no content is ever
 * dropped from the longer one, which means an operator who wrote three Korean
 * bullets and two English ones leaves a block whose EN text is empty. Rendered
 * as-is that is a bare "✦" with nothing after it - a notice that looks broken,
 * to exactly the readers who cannot see the language it was complete in.
 *
 * Pulled out of the dialog JSX so it is testable: component renders do not run
 * in this repo (RN 0.85 + jest 29).
 */
export function renderableBlocks(
  blocks: readonly NoticeBodyBlock[],
  ko: boolean,
): NoticeBodyBlock[] {
  return blocks.filter((block) => (ko ? block.text.ko : block.text.en).trim() !== "");
}

/** Parse the ko and en bodies together into the localized block shape the
 *  dialog consumes.
 *
 *  The two languages are parsed independently, so a KO body may use bullets
 *  where the EN body uses a paragraph. When the block counts differ the shorter
 *  side is padded with an empty string rather than dropping content from the
 *  longer one: an operator who wrote three KO bullets and two EN bullets should
 *  still see all three in KO. */
export function noticeBodyToBlocks(bodyKo: string, bodyEn: string): NoticeBodyBlock[] {
  const ko = parseNoticeMarkdown(bodyKo);
  const en = parseNoticeMarkdown(bodyEn);
  const length = Math.max(ko.length, en.length);

  const blocks: NoticeBodyBlock[] = [];
  for (let index = 0; index < length; index += 1) {
    const koBlock = ko[index];
    const enBlock = en[index];
    blocks.push({
      // Bullet wins so a list marker never silently becomes a paragraph in one
      // language while staying a bullet in the other.
      kind: koBlock?.kind === "bullet" || enBlock?.kind === "bullet" ? "bullet" : "paragraph",
      text: { ko: koBlock?.text ?? "", en: enBlock?.text ?? "" },
    });
  }
  return blocks;
}
