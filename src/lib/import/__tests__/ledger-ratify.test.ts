// Contract for the finance-csv ratify seam: exactly the CHOSEN ledger
// proposals are booked, per-row fail-soft, fixed import category, and (0224)
// each row carries an import key so a second import of the same statement
// books nothing new.

const createImportedLedgerEntry = jest.fn(async (): Promise<unknown> => ({}));
jest.mock("../../finance/ledger", () => ({
  createImportedLedgerEntry: (...a: unknown[]) => createImportedLedgerEntry(...(a as [])),
}));

import { IMPORT_LEDGER_CATEGORY, LEDGER_IMPORT_KEY_PREFIX, ledgerImportKey, ratifyLedgerEntries } from "../ledger-ratify";
import type { ImportProposal } from "../proposals";

const ledgerProposal = (id: string, amountKrw: number, label = "커피"): ImportProposal => ({
  id,
  label: `2026-06-03 ${label} ${amountKrw}원`,
  sub: "지출 → 재정 원장",
  sensitive: true,
  ledgerEntry: { occurredOn: "2026-06-03", kind: "expense", amountKrw, label },
});

/** Third argument of each call: the import key sent with that row. */
const sentKeys = () => createImportedLedgerEntry.mock.calls.map((c) => (c as unknown[])[2] as string);

beforeEach(() => {
  createImportedLedgerEntry.mockReset();
  createImportedLedgerEntry.mockResolvedValue({});
});

describe("ratifyLedgerEntries", () => {
  test("books only proposals that carry a ledgerEntry", async () => {
    const chosen: ImportProposal[] = [
      ledgerProposal("fin-0", 4500),
      { id: "md-0", label: "회고", sub: "노트 → 기록", sensitive: false }, // no ledgerEntry
    ];
    const result = await ratifyLedgerEntries("user-1", chosen);
    expect(result).toEqual({ inserted: 1, failed: 0, skipped: 0 });
    expect(createImportedLedgerEntry).toHaveBeenCalledTimes(1);
    expect(createImportedLedgerEntry).toHaveBeenCalledWith(
      "user-1",
      {
        occurred_on: "2026-06-03",
        kind: "expense",
        amount_krw: 4500,
        category: IMPORT_LEDGER_CATEGORY,
        note: "커피",
      },
      expect.stringMatching(new RegExp(`^${LEDGER_IMPORT_KEY_PREFIX}[0-9a-f]{16}$`)),
    );
  });

  test("one failing insert does not abort the rest (fail-soft counts)", async () => {
    createImportedLedgerEntry
      .mockRejectedValueOnce(new Error("rls"))
      .mockResolvedValueOnce({});
    const result = await ratifyLedgerEntries("user-1", [ledgerProposal("a", 1000), ledgerProposal("b", 2000)]);
    expect(result).toEqual({ inserted: 1, failed: 1, skipped: 0 });
    expect(createImportedLedgerEntry).toHaveBeenCalledTimes(2);
  });

  test("nothing chosen -> nothing booked", async () => {
    const result = await ratifyLedgerEntries("user-1", []);
    expect(result).toEqual({ inserted: 0, failed: 0, skipped: 0 });
    expect(createImportedLedgerEntry).not.toHaveBeenCalled();
  });

  test("a row the server already holds is skipped, not failed", async () => {
    createImportedLedgerEntry.mockResolvedValueOnce(null).mockResolvedValueOnce({});
    const result = await ratifyLedgerEntries("user-1", [ledgerProposal("a", 1000), ledgerProposal("b", 2000)]);
    expect(result).toEqual({ inserted: 1, failed: 0, skipped: 1 });
  });

  test("two identical rows in one statement get two keys; the same statement again sends the same keys", async () => {
    const statement = [ledgerProposal("a", 4500), ledgerProposal("b", 4500), ledgerProposal("c", 9000)];
    await ratifyLedgerEntries("user-1", statement);
    const first = sentKeys();
    expect(new Set(first).size).toBe(3);
    createImportedLedgerEntry.mockClear();
    await ratifyLedgerEntries("user-1", statement);
    expect(sentKeys()).toEqual(first);
    expect(first[0]).toBe(ledgerImportKey(statement[0].ledgerEntry!, 0));
    expect(first[1]).toBe(ledgerImportKey(statement[1].ledgerEntry!, 1));
  });
});
