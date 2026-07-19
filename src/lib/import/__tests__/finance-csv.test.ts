// Fixture-based contract for the bank/card statement CSV parser (P1 조건부).
// Three real-world layout families: split 출금/입금 bank CSV, unsigned
// card-statement CSV, signed single-column export. Manual upload only —
// this parser must never grow an account-connection path (허가제 경계).

import { looksLikeFinanceCsvHeader, parseFinanceCsv } from "../finance-csv";

const BANK_SPLIT = [
  "조회기간: 2026-06-01 ~ 2026-06-30",
  '"거래일시","적요","출금액","입금액","거래후잔액"',
  '"2026-06-03 09:12:11","커피 한잔","4,500","","1,995,500"',
  '"2026-06-10 18:00:00","급여","","2,500,000","4,495,500"',
  '"2026-06-12 12:00:00","점심","12,000","","4,483,500"',
].join("\n");

const CARD_UNSIGNED = [
  "이용일,가맹점명,이용금액,할부",
  "2026.6.3,서점,28000,일시불",
  "2026.6.15,버스,1500,일시불",
].join("\n");

const SIGNED_EXPORT = [
  "날짜,내용,금액",
  "2026-06-01,이자,+1200",
  "2026-06-02,마트,-45600",
].join("\n");

describe("looksLikeFinanceCsvHeader", () => {
  test("recognizes the three layout families", () => {
    expect(looksLikeFinanceCsvHeader(BANK_SPLIT)).toBe(true);
    expect(looksLikeFinanceCsvHeader(CARD_UNSIGNED)).toBe(true);
    expect(looksLikeFinanceCsvHeader(SIGNED_EXPORT)).toBe(true);
  });

  test("rejects non-finance CSVs (Netflix-style) and prose", () => {
    expect(looksLikeFinanceCsvHeader("Title,Date\nSome Show,2026-06-01")).toBe(false);
    expect(looksLikeFinanceCsvHeader("# 회고 노트\n이번 주 배운 것.")).toBe(false);
  });
});

describe("parseFinanceCsv", () => {
  test("split 출금/입금 bank CSV: per-row direction, quoted thousands, preamble skipped", () => {
    const { txns, skipped } = parseFinanceCsv(BANK_SPLIT);
    expect(skipped).toBe(0);
    expect(txns).toEqual([
      { occurredOn: "2026-06-03", kind: "expense", amountKrw: 4500, label: "커피 한잔" },
      { occurredOn: "2026-06-10", kind: "income", amountKrw: 2500000, label: "급여" },
      { occurredOn: "2026-06-12", kind: "expense", amountKrw: 12000, label: "점심" },
    ]);
  });

  test("unsigned card CSV: every row defaults to expense (card-statement law)", () => {
    const { txns } = parseFinanceCsv(CARD_UNSIGNED);
    expect(txns).toEqual([
      { occurredOn: "2026-06-03", kind: "expense", amountKrw: 28000, label: "서점" },
      { occurredOn: "2026-06-15", kind: "expense", amountKrw: 1500, label: "버스" },
    ]);
  });

  test("signed single-column export: negative = expense, positive = income", () => {
    const { txns } = parseFinanceCsv(SIGNED_EXPORT);
    expect(txns).toEqual([
      { occurredOn: "2026-06-01", kind: "income", amountKrw: 1200, label: "이자" },
      { occurredOn: "2026-06-02", kind: "expense", amountKrw: 45600, label: "마트" },
    ]);
  });

  test("unsigned single column with a 구분 column: 입금 rows become income", () => {
    const csv = ["일자,구분,내용,금액", "2026-06-01,입금,환급,10000", "2026-06-02,출금,마트,4500"].join("\n");
    const { txns } = parseFinanceCsv(csv);
    expect(txns[0]).toMatchObject({ kind: "income", amountKrw: 10000 });
    expect(txns[1]).toMatchObject({ kind: "expense", amountKrw: 4500 });
  });

  test("bad dates and ambiguous rows are skipped, honestly counted", () => {
    const csv = [
      '"거래일시","적요","출금액","입금액"',
      '"not-a-date","??","1,000",""',
      '"2026-06-05","양쪽기재","1,000","2,000"',
      '"2026-06-06","정상","3,000",""',
    ].join("\n");
    const { txns, skipped } = parseFinanceCsv(csv);
    expect(txns).toHaveLength(1);
    expect(txns[0].amountKrw).toBe(3000);
    expect(skipped).toBe(2);
  });

  test("garbage input yields nothing without throwing", () => {
    expect(parseFinanceCsv("")).toEqual({ txns: [], skipped: 0 });
    expect(parseFinanceCsv("hello world")).toEqual({ txns: [], skipped: 0 });
  });
});
