import { filterPhoneWikiPages } from "../phone-search";
import type { WikiPageRow } from "../types";

const page = (id: string, title: string, slug: string): WikiPageRow => ({
  id, title, slug, user_id: "owner", kind: "concept", body_md: "", frontmatter: {},
  tags: [], source_id: null, created_at: "2026-10-01", updated_at: "2026-10-01",
});

test("phone wiki search uses saved wiki pages, matching title or slug without a 20-record cap", () => {
  const pages = Array.from({ length: 30 }, (_, index) => page(String(index), `Title ${index}`, `saved-${index}`));
  pages[25] = page("25", "PolaScope", "saved-25");
  expect(filterPhoneWikiPages(pages, " POLASCOPE ").map((item) => item.id)).toEqual(["25"]);
  expect(filterPhoneWikiPages(pages, "SAVED-29").map((item) => item.id)).toEqual(["29"]);
  expect(filterPhoneWikiPages(pages, " ")).toBe(pages);
});

test("phone wiki search handles localized titles", () => {
  expect(filterPhoneWikiPages([page("one", "나의 별", "my-star")], "별").map((item) => item.id)).toEqual(["one"]);
});
