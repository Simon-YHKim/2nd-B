import { detectImportKind } from "../detect";
import { emailLooksLikeAppointment, parseEml } from "../email";

describe("detectImportKind (content sniff > extension)", () => {
  test("each source by content", () => {
    expect(detectImportKind("x", "BEGIN:VCALENDAR\nBEGIN:VEVENT")).toBe("ics");
    expect(detectImportKind("x", '<HealthData locale="ko_KR">')).toBe("apple-health");
    expect(detectImportKind("x", '<smses count="1"><sms body="hi"/></smses>')).toBe("sms");
    expect(detectImportKind("x", '{"timelineObjects": []}')).toBe("takeout-location");
    expect(detectImportKind("x", '{"locations": []}')).toBe("takeout-location");
    expect(detectImportKind("x", "2024년 1월 5일 오후 3:42, 홍길동 : 안녕")).toBe("kakao");
    expect(detectImportKind("x", "From: a@b.com\nSubject: hi\n\nbody")).toBe("email");
  });

  test("falls back to extension, then unknown", () => {
    expect(detectImportKind("notes.md", "anything")).toBe("markdown");
    expect(detectImportKind("chat.ics", "no marker")).toBe("ics");
    expect(detectImportKind("x.bin", "random")).toBe("unknown");
  });
});

describe("parseEml", () => {
  const EML = [
    "From: 홍길동 <hong@example.com>",
    "Subject: 내일 회의",
    "Date: Fri, 05 Jan 2024 09:00:00 +0900",
    "X-Folded: line one",
    " continued",
    "",
    "내일 3시에 봅시다.",
    "감사합니다.",
  ].join("\n");

  test("extracts headers (unfolded), date→ISO, body", () => {
    const e = parseEml(EML);
    expect(e).not.toBeNull();
    expect(e?.from).toContain("hong@example.com");
    expect(e?.subject).toBe("내일 회의");
    expect(e?.dateIso).toBe("2024-01-05T00:00:00.000Z"); // +0900 → 00:00 UTC
    expect(e?.text).toContain("내일 3시");
  });

  test("appointment detection + empty input", () => {
    expect(emailLooksLikeAppointment(parseEml(EML)!)).toBe(true);
    expect(parseEml("")).toBeNull();
    expect(parseEml("no headers here")).toBeNull(); // no "Name: value" → no headers → null
  });
});

describe("detectImportKind: P1 kinds (youtube-history / finance-csv)", () => {
  test("Takeout watch-history JSON routes to youtube-history", () => {
    const json = JSON.stringify([
      { header: "YouTube", title: "Watched x", titleUrl: "https://www.youtube.com/watch?v=1", time: "2026-06-01T00:00:00Z" },
    ]);
    expect(detectImportKind("watch-history.json", json)).toBe("youtube-history");
    expect(detectImportKind("anything.json", json)).toBe("youtube-history"); // content sniff wins
  });

  test("takeout LOCATION json still routes to takeout-location (object, not array)", () => {
    const json = JSON.stringify({ timelineObjects: [] });
    expect(detectImportKind("Records.json", json)).toBe("takeout-location");
  });

  test("bank/card statement CSVs route to finance-csv", () => {
    const bank = '"거래일시","적요","출금액","입금액"\n"2026-06-03","커피","4,500",""';
    const card = "이용일,가맹점명,이용금액\n2026.6.3,서점,28000";
    expect(detectImportKind("statement.csv", bank)).toBe("finance-csv");
    expect(detectImportKind("card.csv", card)).toBe("finance-csv");
  });

  test("non-finance CSV stays unknown (no ledger overreach)", () => {
    expect(detectImportKind("NetflixViewingHistory.csv", "Title,Date\nSome Show,2026-06-01")).toBe("unknown");
  });
});
