import type { WikiPageRow } from "./types";

// Keep the phone search aligned with the wiki browser's local title/slug filter.
export function filterPhoneWikiPages(pages: WikiPageRow[], query: string): WikiPageRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return pages;
  return pages.filter((page) =>
    page.title.toLocaleLowerCase().includes(needle) || page.slug.toLocaleLowerCase().includes(needle),
  );
}
