import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
  join(process.cwd(), "db", "migrations", "0164_knowledge_source_https.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("knowledge_sources stored-link constraints", () => {
  test("targets the canonical knowledge_sources DOI and URL columns only", () => {
    expect(SQL).toMatch(/ALTER TABLE public\.knowledge_sources/i);
    expect(SQL).toMatch(/ADD CONSTRAINT ks_doi_canonical/i);
    expect(SQL).toMatch(/ADD CONSTRAINT ks_url_https_only/i);
    expect(SQL).not.toMatch(/ALTER TABLE (?:public\.)?sources\b/i);
    expect(SQL).not.toMatch(/\bsource_url\b/i);
  });

  test("enforces canonical DOI tokens for every new authenticated write", () => {
    expect(SQL).toMatch(/char_length\(doi\) BETWEEN 7 AND 255/i);
    expect(SQL).toContain("doi ~ '^10\\.[0-9]{4,9}/");
    expect(SQL).toMatch(/doi !~ '\[\[:cntrl:\]\[:space:\]\]'/i);
    expect(SQL).toMatch(/position\('\/\/' in doi\) = 0/i);
    expect(SQL).toContain("doi !~ '(^|/)[.]{1,2}(/|$)'");
  });

  test("enforces bounded HTTPS URLs without userinfo or parser ambiguity", () => {
    expect(SQL).toMatch(/char_length\(url\) BETWEEN 1 AND 2048/i);
    expect(SQL).toMatch(/url ~\* '\^https:\/\/[^']+'/i);
    expect(SQL).toContain("lower(substring(url from 1 for 8)) = 'https://'");
    expect(SQL).toMatch(/url !~ '\[\[:cntrl:\]\[:space:\]\]'/i);
    expect(SQL).toMatch(/position\(\s*'@' in/i);
    expect(SQL).toMatch(/position\(E'\\\\' in url\) = 0/i);
    expect(SQL).toMatch(/url !~\* '[^']*%[^']*'/i);
  });

  test("blocks new bad rows immediately but defers legacy-row validation", () => {
    const notValidCount = SQL.match(/\) NOT VALID/gi)?.length ?? 0;
    expect(notValidCount).toBe(2);
    expect(SQL).not.toMatch(/VALIDATE CONSTRAINT/i);
    expect(SQL).toContain("PROVISIONAL");
  });
});
