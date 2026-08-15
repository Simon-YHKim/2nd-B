// docs/legal/*.md  <->  src/lib/legal/legal-documents.ts parity.
//
// There are three copies of every legal document and only two of them were
// guarded. The markdown is canonical; public/legal/*.html is regenerated from it
// and check-legal-html-fresh.ts fails when that is stale. The THIRD copy — the
// in-app snapshot in legal-documents.ts — was a hand-mirror with nothing
// checking it, and it is the copy users actually read inside the app.
//
// So the failure mode was: edit the policy, regenerate the HTML, ship, and have
// the app keep showing the old text to every user while the website shows the
// new one. For a document whose whole job is to state what is true right now,
// that is the worst of the three to leave unguarded.
//
// This compares them after undoing the escapes a template literal forces on the
// markdown: \ , \` and \${ . One left-to-right pass, not sequential replaces —
// unescaping backslashes first would eat the backslash out of \` and turn a
// markdown escape into a stray backtick.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SNAPSHOT_PATH = join(ROOT, "src", "lib", "legal", "legal-documents.ts");

const DOCS: { constName: string; md: string }[] = [
  { constName: "TERMS_DOC", md: "terms-of-service.md" },
  { constName: "REFUND_DOC", md: "refund-policy.md" },
  { constName: "PRIVACY_DOC", md: "privacy-policy.md" },
];

const snapshotSrc = readFileSync(SNAPSHOT_PATH, "utf8").replace(/\r\n/g, "\n");

/** The body template literal of one exported LegalDoc, un-escaped. */
function snapshotBody(constName: string): string | null {
  // Non-greedy up to the first "`,\n};" that closes the object. The bodies
  // contain backticks, but only ESCAPED ones (\`), so an unescaped backtick
  // followed by ",\n};" is unambiguously the terminator.
  const re = new RegExp(`export const ${constName}[\\s\\S]*?body: \`([\\s\\S]*?)\`,\\n\\};`);
  const m = re.exec(snapshotSrc);
  if (!m) return null;
  return m[1].replace(/\\(\\|`|\$\{)/g, "$1");
}

function normalize(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    // The snapshot header says em dashes are scrubbed on the way in, and
    // check:emdash enforces their absence in shipped strings. Normalizing here
    // means this guard reports real wording drift, not punctuation policy.
    .replace(/—/g, "-")
    .trim()
    .split("\n")
    .map((l) => l.trimEnd());
}

let failed = false;

for (const doc of DOCS) {
  const body = snapshotBody(doc.constName);
  if (body === null) {
    console.error(
      `legal-snapshot FAILED  could not find ${doc.constName}'s body literal in ` +
        `src/lib/legal/legal-documents.ts. If the export was renamed or reshaped, ` +
        `update scripts/check-legal-snapshot-parity.ts to match.`,
    );
    failed = true;
    continue;
  }

  const source = normalize(readFileSync(join(ROOT, "docs", "legal", doc.md), "utf8"));
  const snapshot = normalize(body);

  const max = Math.max(source.length, snapshot.length);
  const diffs: string[] = [];
  for (let i = 0; i < max; i++) {
    if (source[i] !== snapshot[i]) {
      diffs.push(
        `    line ${i + 1}\n` +
          `      docs/legal/${doc.md}: ${source[i] ?? "(missing)"}\n` +
          `      legal-documents.ts:  ${snapshot[i] ?? "(missing)"}`,
      );
      if (diffs.length >= 5) break;
    }
  }

  if (diffs.length > 0) {
    console.error(
      `legal-snapshot FAILED  ${doc.constName} has drifted from docs/legal/${doc.md}:\n` +
        `${diffs.join("\n")}\n` +
        `  The markdown is canonical. Mirror the change into ${doc.constName}.body ` +
        `(escaping backticks as \\\`), or the app will keep showing users the old text.`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`legal-snapshot PASS  ${DOCS.length} in-app documents match their docs/legal source`);
