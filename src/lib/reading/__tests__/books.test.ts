import {
  buildBooksSearchUrl,
  extractYear,
  httpsOnly,
  isBooksRateLimited,
  parseGoogleBooksResponse,
  searchBooks,
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

// R2C-02 (2026-10-05): the keyless quota answered every search with HTTP 429 and the
// screen showed "no suggestions yet" as if nothing had happened. The screen can only
// say the right thing if the failure arrives as a failure, and a quota refusal has to
// be told apart from a network blip: retrying will not help, adding by title will.
describe("searchBooks failures arrive typed, never as an empty result", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const answer = (status: number, body: unknown = {}) => {
    global.fetch = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
  };

  test("HTTP 429 (the keyless quota) is rate_limited", async () => {
    answer(429, { error: { status: "RESOURCE_EXHAUSTED" } });
    await expect(searchBooks("demian")).rejects.toBe("rate_limited");
  });

  test("any other non-2xx is fetch_failed, not rate_limited", async () => {
    answer(503);
    await expect(searchBooks("demian")).rejects.toBe("fetch_failed");
  });

  test("a network error is fetch_failed", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    await expect(searchBooks("demian")).rejects.toBe("fetch_failed");
  });

  test("a real zero-hit answer is an empty list, not an error", async () => {
    answer(200, { totalItems: 0 });
    await expect(searchBooks("zzqqxx")).resolves.toEqual([]);
  });

  test("isBooksRateLimited reads only the quota refusal", () => {
    expect(isBooksRateLimited("rate_limited")).toBe(true);
    expect(isBooksRateLimited("fetch_failed")).toBe(false);
    expect(isBooksRateLimited(new Error("rate_limited"))).toBe(false);
  });
});
