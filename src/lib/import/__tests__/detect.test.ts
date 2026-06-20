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
