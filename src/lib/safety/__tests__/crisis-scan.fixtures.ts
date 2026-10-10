// Original gate reports: g1-safety-daybreak-r1, safescan-daybreak-r2/r3
// in E:/Coding Infra/reports/codex-audit-261010/gates/. Defensive fixtures only.
export const SCANLINE_RED = [
  // G1-01 (5)
  "지금 죽.고 싶어.", "지금 죽 고 싶어.", "지금 자\u200b살하고 싶어.",
  "I want.to die.", "I want-to-die.",
  // SS-01 (2): literal RED must survive a boundary that loose scanning ignores.
  "I'm\u200bsuicidal.", "I'm having suicidal\u200bthoughts.",
  // SS-03 (5)
  "지금 죽/고 싶어.", "지금 죽. 고 싶어.", "I want/to die.",
  "I want. to die.", "I'm thinking about sui.cide.",
  // S3-03 (2), S3-04 (4)
  "I.want.to.die,name@example.com", "https://example.com—I.want.to.die.",
  "I'm thinking about sui,cide.", "I want|to die.", "지금 죽:고 싶어.",
  "I'm thinking about sui\u200ecide.",
  // An altered phrase is never cancelled by either legacy exception.
  "I don't want.to die.", "I'm not sui.cidal.", "자.살하려는 건 아냐.",
  "일을 끝내고 싶어요. 지금 죽.고 싶어.",
];

export const SCANLINE_GREEN = [
  // SS-02 (6)
  "혼자\u200b살고 싶어.", "혼자.살고 싶어.", "날짜.살펴봐.",
  "He made a fade-away jumper.", "fade-away@example.com", "https://example.com/fade-away-jumper",
  // S3-01 (2), S3-02 (3), S3-03 (2)
  "혼.자.살고 싶어.", "자. 살펴봐.", "He practiced two fade-away jumpers.",
  "He practiced a fade-away jump shot.", "const fade_away = 1;",
  "example.com/sui.cide", "sui.cide@localhost",
  // User's fixed additions (7), G1-05 (2)
  "혼자 살고 싶어", "매일 자 살펴봐", "2026.10.10", "3.14", "state-of-the-art",
  "죽 고르는 일을 하고 싶어요.", "자. 살펴봐",
  "I’m not suicidal.", "I don’t want to die.",
  // Additional counterexamples: don't synthesize nouns out of ordinary stems.
  "자.살펴봐.", "자.해바라기를 봐.", "자.살구를 먹어.",
  "혼.자.살하고 싶어.", "자. 살하고 싶어.",
  "I want/to diet.", "I want/to diesel.", "ésui.cide", "sui.cideé",
  "sui2cide", "sui٢cide", "sui२cide", "sui𑓐cide", "suiᄀcide", "suiㄱcide",
  "sui cide", "자 살", "self" + "-".repeat(50_000) + "x",
];

// 24 seams from distinct classes. This is test sampling, never an insertion
// allowlist in the scanner. Whitespace is tested separately as a word boundary.
export const SCANLINE_SEAMS = [
  ".", ",", "/", "-", ":", "|", "_", "+", "=", "~", "!", "?",
  "\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\u202a", "\u2060", "\ufeff",
  "★", "😀", "\u0000", "\u034f",
];

export const SCANLINE_VARIANTS: { name: string; cases: { text: string; red: boolean }[] }[] = [
  { name: "EN single-word internal seams", cases: SCANLINE_SEAMS.map((s) => ({ text: `sui${s}cide`, red: true })) },
  { name: "KO single-word internal seams", cases: SCANLINE_SEAMS.map((s) => ({ text: `자${s}살하고 싶어.`, red: true })) },
  { name: "EN phrase word seams", cases: SCANLINE_SEAMS.map((s) => ({ text: `I want${s}to die.`, red: true })) },
  { name: "KO mixed seams and whitespace", cases: SCANLINE_SEAMS.map((s) => ({ text: `지금 죽${s}\t고\n싶어.`, red: true })) },
  { name: "KO chunk boundaries", cases: SCANLINE_SEAMS.flatMap((s) => [
    { text: `혼${s}자${s}살고 싶어.`, red: false }, { text: `자${s} 살펴봐.`, red: false },
    { text: `자${s}살펴봐.`, red: false }, { text: `자${s}해바라기를 봐.`, red: false },
  ]) },
  { name: "ambiguous phrases stay literal-only", cases: SCANLINE_SEAMS.flatMap((s) => [
    // Legacy \s already treats FEFF as whitespace: retain its existing RED.
    { text: `He practiced a fade${s}away jumper.`, red: s === "\ufeff" },
    { text: `I'm ending${s}it after lunch.`, red: s === "\ufeff" },
    { text: `일을 끝낼${s}거예요.`, red: false },
  ]) },
  { name: "address syntax", cases: Array.from({ length: 24 }, (_,n) => [
    { text: `user${n}.sui.cide@localhost`, red: false },
    { text: `site${n}.example/sui.cide`, red: false },
    { text: `https://site${n}.example:8080/sui.cide?x=1#fragment`, red: false },
  ]).flat() },
  { name: "address-adjacent prose", cases: Array.from({ length: 24 }, (_,n) => [
    { text: `I.want.to.die,user${n}@example.com`, red: true },
    { text: `https://site${n}.example—I.want.to.die.`, red: true },
    { text: `(user${n}@example.com)I.want.to.die.`, red: true },
  ]).flat() },
  { name: "legacy RED boundaries", cases: Array.from({ length: 24 }, (_,n) => ({ text: `Entry ${n}: I'm\u200bsuicidal.`, red: true })) },
  { name: "smart apostrophe denials", cases: Array.from({ length: 24 }, (_,n) => ({
    text: `${" ".repeat(n)}${n % 2 ? "I’m not suicidal." : "I don’t want to die."}`, red: false,
  })) },
];

// Desired RED but deliberately unresolved: address ambiguity takes precedence,
// and NFKC composition is not broadened into stripping Latin diacritics.
// These must be printed verbatim in the handoff, never counted as caught cases.
export const SCANLINE_UNRESOLVED = [
  { text: "I.want/to die.", reason: "I.want/to has dotted-host/path syntax." },
  { text: "k.ill/my.self", reason: "k.ill/my.self has dotted-host/path syntax." },
  { text: "sui\u0301cide", reason: "NFKC composes the accent into the Latin letter í." },
];
