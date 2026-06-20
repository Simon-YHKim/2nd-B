import {
  buildBooksSearchUrl,
  extractYear,
  httpsOnly,
  parseGoogleBooksResponse,
} from "../books";

describe("httpsOnly (link scheme guard)", () => {
  test("keeps https as-is", () => {
    expect(httpsOnly("https://books.google.com/x")).toBe("https://books.google.com/x");
  });
  test("upgrades http thumbnails to https", () => {
    expect(httpsOnly("http://books.google.com/img")).toBe("https://books.google.com/img");
  });
  test("drops javascript:, data:, and junk", () => {
    expect(httpsOnly("javascript:alert(1)")).toBeUndefined();
    expect(httpsOnly("data:text/html,x")).toBeUndefined();
    expect(httpsOnly("not a url")).toBeUndefined();
    expect(httpsOnly("")).toBeUndefined();
    expect(httpsOnly(null)).toBeUndefined();
  });
});

describe("extractYear (leading 4-digit year)", () => {
  test("parses full date, year-month, and year-only", () => {
    expect(extractYear("2019-05-01")).toBe(2019);
    expect(extractYear("2019-05")).toBe(2019);
    expect(extractYear("2019")).toBe(2019);
  });
  test("rejects malformed / out-of-window", () => {
    expect(extractYear("May 2019")).toBeUndefined();
    expect(extractYear("0007")).toBeUndefined();
    expect(extractYear(undefined)).toBeUndefined();
    expect(extractYear(2019 as unknown)).toBeUndefined();
  });
});

describe("buildBooksSearchUrl (keyless, clamped)", () => {
  test("encodes the query and clamps result count to 1..10", () => {
    const url = buildBooksSearchUrl("clean code", 50);
    expect(url).toContain("https://www.googleapis.com/books/v1/volumes?");
    expect(url).toContain("q=clean+code");
    expect(url).toContain("maxResults=10"); // clamped down from 50
    expect(url).toContain("printType=books");
    expect(url).not.toContain("key="); // keyless
  });
  test("floors at 1 result", () => {
    expect(buildBooksSearchUrl("x", 0)).toContain("maxResults=1");
  });
});

describe("parseGoogleBooksResponse (network proposes, this clamps)", () => {
  test("extracts the fields we read and upgrades the thumbnail", () => {
    const json = {
      items: [
        {
          id: "vol1",
          volumeInfo: {
            title: "Clean Code",
            authors: ["Robert C. Martin"],
            publishedDate: "2008-08-01",
            pageCount: 464,
            imageLinks: { thumbnail: "http://books.google.com/t1" },
            infoLink: "https://books.google.com/info1",
          },
        },
      ],
    };
    const out = parseGoogleBooksResponse(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: "vol1",
      title: "Clean Code",
      authors: ["Robert C. Martin"],
      publishedYear: 2008,
      pageCount: 464,
      thumbnail: "https://books.google.com/t1",
      infoLink: "https://books.google.com/info1",
    });
  });

  test("drops rows missing id or title; tolerates missing volumeInfo", () => {
    const json = {
      items: [
        { id: "noTitle", volumeInfo: { authors: ["x"] } },
        { volumeInfo: { title: "no id" } },
        { id: "ok", volumeInfo: { title: "Kept" } },
        { id: "noInfo" },
      ],
    };
    const out = parseGoogleBooksResponse(json);
    expect(out.map((b) => b.id)).toEqual(["ok"]);
    expect(out[0].authors).toEqual([]);
  });

  test("caps result count and ignores junk shapes", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: `v${i}`,
      volumeInfo: { title: `Book ${i}` },
    }));
    const out = parseGoogleBooksResponse({ items }, 5);
    expect(out).toHaveLength(5);
    expect(parseGoogleBooksResponse(null)).toEqual([]);
    expect(parseGoogleBooksResponse({})).toEqual([]);
    expect(parseGoogleBooksResponse({ items: "nope" })).toEqual([]);
  });

  test("drops a non-https infoLink but keeps the rest of the row", () => {
    const json = {
      items: [
        {
          id: "v1",
          volumeInfo: { title: "T", infoLink: "javascript:alert(1)" },
        },
      ],
    };
    const out = parseGoogleBooksResponse(json);
    expect(out).toHaveLength(1);
    expect(out[0].infoLink).toBeUndefined();
  });
});
