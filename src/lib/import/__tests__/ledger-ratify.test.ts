// Contract for the finance-csv ratify seam: exactly the CHOSEN ledger
// proposals are booked, per-row fail-soft, fixed import category.

const createLedgerEntry = jest.fn(async () => ({}));
jest.mock("../../finance/ledger", () => ({
  createLedgerEntry: (...a: unknown[]) => createLedgerEntry(...(a as [])),
}));

import { IMPORT_LEDGER_CATEGORY, ratifyLedgerEntries } from "../ledger-ratify";
import type { ImportProposal } from "../proposals";

const ledgerProposal = (id: string, amountKrw: number): ImportProposal => ({
  id,
  label: `2026-06-03 커피 ${amountKrw}원`,
  sub: "지출 → 재정 원장",
  sensitive: true,
  ledgerEntry: { occurredOn: "2026-06-03", kind: "expense", amountKrw, label: "커피" },
});

beforeEach(() => {
  createLedgerEntry.mockReset();
  createLedgerEntry.mockResolvedValue({});
});

describe("ratifyLedgerEntries", () => {
  test("books only proposals that carry a ledgerEntry", async () => {
    const chosen: ImportProposal[] = [
      ledgerProposal("fin-0", 4500),
      { id: "md-0", label: "회고", sub: "노트 → 기록", sensitive: false }, // no ledgerEntry
    ];
    const result = await ratifyLedgerEntries("user-1", chosen);
    expect(result).toEqual({ inserted: 1, failed: 0 });
    expect(createLedgerEntry).toHaveBeenCalledTimes(1);
    expect(createLedgerEntry).toHaveBeenCalledWith("user-1", {
      occurred_on: "2026-06-03",
      kind: "expense",
      amount_krw: 4500,
      category: IMPORT_LEDGER_CATEGORY,
      note: "커피",
    });
  });

  test("one failing insert does not abort the rest (fail-soft counts)", async () => {
    createLedgerEntry
      .mockRejectedValueOnce(new Error("rls"))
      .mockResolvedValueOnce({});
    const result = await ratifyLedgerEntries("user-1", [ledgerProposal("a", 1000), ledgerProposal("b", 2000)]);
    expect(result).toEqual({ inserted: 1, failed: 1 });
    expect(createLedgerEntry).toHaveBeenCalledTimes(2);
  });

  test("nothing chosen -> nothing booked", async () => {
    const result = await ratifyLedgerEntries("user-1", []);
    expect(result).toEqual({ inserted: 0, failed: 0 });
    expect(createLedgerEntry).not.toHaveBeenCalled();
  });
});
