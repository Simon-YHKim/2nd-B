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

import { deadRendererSpans, delegationCandidates } from "../dead-renderer-spans";

// ⚠ 스팬 계산은 `../dead-renderer-spans.ts` 로 뺐다. ttl-work-b6 가 같은 계산을
// **검사·가드 핀** 쪽에 필요로 해서다 - 죽은 사본에 심볼을 고정한 핀은 영원히
// 초록이면서 아무것도 안 지킨다. 두 가드가 같은 부류를 따로 발견했으므로 계산을
// 공유하고 주장만 각자 갖는다.
const deadSpans = deadRendererSpans(ROOT);

// 파싱하지 못하는 위임 모양. **개수가 아니라 명단으로** 적는다.
//
// ⚠ ttl-work-b6 가 재사용하려다 찾았다: `DELEGATION` 정규식은
// `return <X />;` **바로 다음 줄에** `return <Y />;` 을 요구하는데, 스킨을
// 분기하는 파일 서른한 개 중 열한 개가 다른 모양이다(변수로 받기 · 삼항 ·
// 블록 · 조건이 하나 더). 그런데 옛 하한은 `>= 2` 에 ops·audit 를 지목해서,
// **스무 개를 찾든 두 개를 찾든 통과**했다. 커버리지가 줄어도 초록이었다 -
// "0건이다" 와 "안 봤다" 를 같은 신호로 보고하던 것이다.
//
// 명단으로 적으면 **새 모양은 즉시 실패**하고, 은퇴로 분모가 줄어드는 것은
// 그냥 항목이 빠지는 일이 된다. 개수 하한이나 비율은 둘 다 못 하는 구분이다.
const NOT_A_DEAD_SPAN: Readonly<Record<string, string>> = {
  "src/app/audit.tsx":
    "위임은 파싱되지만 AuditLegacy 는 `?screener=1` 로도 닿는다 - 죽은 스팬이 아니다(회차 64)",
  "src/app/(auth)/reset-password.tsx": "스킨을 분기하지 않고 참조만 한다",
  "src/app/capture-full.tsx": "블록 분기",
  "src/app/capture.tsx": "결과를 상수로 받아 쓴다",
  "src/app/core-brain.tsx": "삼항",
  "src/app/digest.tsx": "블록 분기",
  "src/app/esm.tsx": "삼항",
  "src/app/formats.tsx": "조건이 하나 더 붙는다 (view === export && …)",
  "src/app/persona.tsx": "블록 분기",
  "src/app/secondb.tsx": "주석에만 등장",
  "src/app/settings.tsx": "결과를 상수로 받아 쓴다",
  "src/app/trinity.tsx": "블록 분기",
};

test("스킨을 분기하는 파일이 전부 설명돼 있다 - 커버리지가 조용히 줄지 않는다", () => {
  const candidates = delegationCandidates(ROOT);
  const parsed = new Set(deadSpans.map(s => s.file));
  const unexplained = candidates.filter(
    rel => !parsed.has(rel) && !(rel in NOT_A_DEAD_SPAN),
  );
  expect(unexplained).toEqual([]);
  expect(candidates.length).toBeGreaterThanOrEqual(10);
  // 명단의 근거도 검사한다: "죽은 스팬이 아니다" 라고 적어 둔 파일이
  // 실제로 죽은 스팬으로 잡히면 그 설명은 더 이상 사실이 아니다.
  const contradicted = Object.keys(NOT_A_DEAD_SPAN).filter(rel => parsed.has(rel));
  expect(contradicted).toEqual([]);

  // 그리고 **면제가 아직 지킬 대상을 갖는지** 본다. 은퇴가 진행 중이라
  // (ttl-work-b6: ops 완료 · account · sign-up · wiki 예정) 명단에 적힌 파일이
  // 사라질 수 있는데, 그러면 그 줄은 아무것도 설명하지 않으면서 남는다.
  // "설명이 틀렸다" 와 "설명할 것이 없어졌다" 는 다른 상태다.
  const gone = Object.keys(NOT_A_DEAD_SPAN).filter(
    rel => !fs.existsSync(path.join(ROOT, rel)),
  );
  expect(gone).toEqual([]);
});

test("배송되지 않는 렌더러를 실제로 찾았다 - 0건 통과를 막는다", () => {
  // 아무것도 못 찾으면 아래 검사는 영원히 초록이다. 개별 파일 이름은 앵커로
  // 쓰지 않는다 - 은퇴가 진행 중이라 어떤 이름도 유효기간이 짧다.
  expect(deadSpans.length).toBeGreaterThanOrEqual(5);
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
