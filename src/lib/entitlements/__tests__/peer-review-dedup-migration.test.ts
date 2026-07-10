// Structural guard for db/migrations/0081_peer_review_dedup.sql - the partial
// UNIQUE indexes that stop a concurrent/retried peer-respond submit from writing
// duplicate consent/observation rows that double-weight one informant (wave-3).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0081_peer_review_dedup.sql"),
  "utf8",
);

describe("0081_peer_review_dedup.sql - structure", () => {
  test("informant_consents has a partial-unique on invitation_id (active rows)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS informant_consents_invitation_uniq[\s\S]*ON public\.informant_consents \(invitation_id\)[\s\S]*WHERE withdrawn_at IS NULL/);
  });

  test("peer_observations has a partial-unique on invitation_id (active rows)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS peer_observations_invitation_uniq[\s\S]*ON public\.peer_observations \(invitation_id\)[\s\S]*WHERE withdrawn_at IS NULL/);
  });
});
