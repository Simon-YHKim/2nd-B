import { extractSmsAppointmentHints, parseSmsBackup } from "../sms";

const XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<smses count="3">',
  '  <sms address="01012345678" date="1704430920000" type="1" body="내일 3시에 볼까?" />',
  "  <sms address='0299998888' date='1704434520000' type='2' body='네 좋아요' />",
  '  <sms address="018" date="bad" type="1" body="줄바꿈&#10;테스트 &amp; 인코딩" />',
  "</smses>",
].join("\n");

describe("parseSmsBackup (SMS Backup & Restore XML)", () => {
  test("parses address/date/direction/body, decodes entities", () => {
    const out = parseSmsBackup(XML);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ address: "01012345678", direction: "received", text: "내일 3시에 볼까?" });
    expect(out[0].atIso).not.toBeNull();
    expect(out[1].direction).toBe("sent");
    expect(out[2].text).toBe("줄바꿈\n테스트 & 인코딩"); // &#10; → \n, &amp; → &
    expect(out[2].atIso).toBeNull(); // unparseable date
  });

  test("empty / no sms tags → []", () => {
    expect(parseSmsBackup("")).toEqual([]);
    expect(parseSmsBackup("<smses></smses>")).toEqual([]);
  });
});

describe("extractSmsAppointmentHints", () => {
  test("flags only plan-like messages", () => {
    const hints = extractSmsAppointmentHints(parseSmsBackup(XML));
    expect(hints).toHaveLength(1);
    expect(hints[0].text).toContain("내일 3시");
  });
});
