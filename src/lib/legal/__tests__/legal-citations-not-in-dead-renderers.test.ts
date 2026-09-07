import fs from "node:fs";
import path from "node:path";

// A citation can pass every check this repo has — the path resolves, the line
// range fits the file, the symbol really is on that line — and still point at
// code **no deployment draws**.
//
// That has now happened three times, each found by accident:
//
//   round 60  Q-H1 cited `src/app/data.tsx:62-71` for the Art.20 export entry
//             point. That block is inside `DataManagementLegacy`. Found while
//             re-reading counsel questions.
//   round 61  I wired a crisis hand-off into `audit.tsx`'s questionnaire before
//             noticing the shipped /audit is a different screen. Found because a
//             byte-stability pin broke.
//   round 63  the DPIA cited `src/app/ops.tsx:104-129` seven times for the D-20
//             minor recommendation lock. Found because a peer tried to retire
//             the legacy renderer and my other guards went red.
//
// The shape is always the same:
//
//   if (isDeepSpaceUI()) return <TheShippedScreen />;
//   return <TheLegacyOne />;          <-- citations land in here
//
// `UI_MODE` defaults to "deep-space" (src/lib/ui-mode.ts) and every delivery
// path sets it explicitly, so the second branch needs someone to opt in with
// EXPO_PUBLIC_UI=legacy. Nothing ships that way.
//
// ⚠ This test does NOT say the legacy renderer is wrong to exist, and it does
// not say the document's CLAIM is wrong — in the /ops case the claim was true
// and shipped, and only the coordinates were dead. It says one thing: a legal
// document must not point a reader at a copy of the code that no build runs,
// because "I read it and it is there" then means nothing.
const ROOT = process.cwd();
const LEGAL_DIR = path.join(ROOT, "docs", "legal");
const CITATION = /`([A-Za-z0-9_@./()-]+\.tsx?):([0-9][0-9,\-\s]*)`/g;

/** `if (isDeepSpaceUI()) return <X />;` followed by `return <Legacy />;` */
const DELEGATION = /if \(isDeepSpaceUI\(\)\) return <\w+ \/>;\s*\r?\n\s*return <(\w+) \/>;/;

interface DeadSpan {
  file: string;
  component: string;
  from: number;
  to: number;
}

/** Line span of a top-level `function Name(` up to its column-0 closing brace. */
function topLevelSpan(lines: readonly string[], name: string): { from: number; to: number } | null {
  const start = lines.findIndex(l => l.startsWith(`function ${name}(`));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "}") return { from: start + 1, to: i + 1 };
  }
  return null;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
      sourceFiles(full, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

const deadSpans: DeadSpan[] = [];
for (const rel of sourceFiles(path.join(ROOT, "src", "app"))) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const match = DELEGATION.exec(text);
  if (!match) continue;
  const span = topLevelSpan(text.split(/\r?\n/), match[1]);
  if (span) deadSpans.push({ file: rel, component: match[1], ...span });
}

test("배송되지 않는 렌더러를 실제로 찾았다 - 0건 통과를 막는다", () => {
  // 이 검사가 아무 렌더러도 못 찾으면 아래 검사는 영원히 초록이다.
  expect(deadSpans.length).toBeGreaterThanOrEqual(2);
  expect(deadSpans.map(s => s.file)).toEqual(
    expect.arrayContaining(["src/app/ops.tsx", "src/app/audit.tsx"]),
  );
});

test("법무 문서가 어떤 배포도 안 그리는 렌더러를 인용하지 않는다", () => {
  const docs = fs.readdirSync(LEGAL_DIR).filter(n => n.endsWith(".md")).sort();
  const offences: string[] = [];
  for (const doc of docs) {
    const text = fs.readFileSync(path.join(LEGAL_DIR, doc), "utf8").replace(/\r\n/g, "\n");
    text.split("\n").forEach((line, index) => {
      for (const m of line.matchAll(CITATION)) {
        const file = m[1];
        const numbers = m[2].split(/[,\-\s]+/).filter(Boolean).map(Number);
        const span = deadSpans.find(d => d.file === file);
        if (!span) continue;
        const inside = numbers.some(n => n >= span.from && n <= span.to);
        if (inside) {
          offences.push(
            `${doc}:${index + 1} — \`${file}:${m[2].trim()}\` 이 ${span.component}` +
              ` (${span.from}-${span.to}) 안이다. 배송되는 화면을 인용할 것.`,
          );
        }
      }
    });
  }
  expect(offences).toEqual([]);
});
