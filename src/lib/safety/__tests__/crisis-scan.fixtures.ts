// Original gate reports: g1-safety-daybreak-r1, safescan-daybreak-r2/r3
// in E:/Coding Infra/reports/codex-audit-261010/gates/. Defensive fixtures only.
export const SCANLINE_RED = [
  // Existing literal RED remains authoritative with every loose rule dormant.
  "I'm\u200bsuicidal.", "I'm having suicidal\u200bthoughts.",
  "일을 끝내고 싶어요. 지금 죽.고 싶어.",
];

// Round 1 caught these only with loose rules. Round 2's no-new-false-alarm
// priority withdraws that coverage. Keep every input executable and visible.
export const SCANLINE_WITHDRAWN = [
  // SL-02: prose after a port URL remains visible.
  "example.com:8080/x—I.want.to.die.",
  // G1-01 (5)
  "지금 죽.고 싶어.", "지금 죽 고 싶어.", "지금 자\u200b살하고 싶어.",
  "I want.to die.", "I want-to-die.",
  // SS-03 (5)
  "지금 죽/고 싶어.", "지금 죽. 고 싶어.", "I want/to die.",
  "I want. to die.", "I'm thinking about sui.cide.",
  // S3-03 (2), S3-04 (4)
  "I.want.to.die,name@example.com", "https://example.com—I.want.to.die.",
  "I'm thinking about sui,cide.", "I want|to die.", "지금 죽:고 싶어.",
  "I'm thinking about sui\u200ecide.",
  // An altered phrase is never cancelled by either legacy exception.
  "I don't want.to die.", "I'm not sui.cidal.", "자.살하려는 건 아냐.",
  "k.ill my.self", "self/ha.rm", "목.숨을/끊", "죽.고싶어",
];

export const SCANLINE_GREEN = [
  // SL-01/02: separate clauses and a scheme-less URL with a port.
  "In the end, my life improved.",
  "문서는 example.com:8080/want/to/die 에 있습니다.",
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
  { name: "withdrawn EN single-word internal seams", cases: SCANLINE_SEAMS.map((s) => ({ text: `sui${s}cide`, red: false })) },
  { name: "withdrawn KO single-word internal seams", cases: SCANLINE_SEAMS.map((s) => ({ text: `자${s}살하고 싶어.`, red: false })) },
  { name: "withdrawn EN phrase word seams except legacy whitespace", cases: SCANLINE_SEAMS.map((s) => ({ text: `I want${s}to die.`, red: s === "\ufeff" })) },
  { name: "withdrawn KO mixed seams and whitespace", cases: SCANLINE_SEAMS.map((s) => ({ text: `지금 죽${s}\t고\n싶어.`, red: false })) },
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
  { name: "withdrawn address-adjacent prose", cases: Array.from({ length: 24 }, (_,n) => [
    { text: `I.want.to.die,user${n}@example.com`, red: false },
    { text: `https://site${n}.example—I.want.to.die.`, red: false },
    { text: `(user${n}@example.com)I.want.to.die.`, red: false },
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
  ...SCANLINE_WITHDRAWN.map((text) => ({ text, reason: "Round 2 disables loose rules after ordinary clause/code/path false alarms." })),
  { text: "end/my.l.ife", reason: "SL-01: end my life is literal-only to avoid joining ordinary clauses." },
  { text: "I have no reason/to live.", reason: "SL-03: no reason to live stays literal-only." },
  { text: "유.서를 써 두었어.", reason: "SL-03: 유서 stays literal-only." },
  { text: "영영 잠들고/싶어.", reason: "SL-03: 영영 잠들고 싶 stays literal-only." },
  { text: "I.want/to die.", reason: "I.want/to has dotted-host/path syntax." },
  { text: "k.ill/my.self", reason: "k.ill/my.self has dotted-host/path syntax." },
  { text: "sui\u0301cide", reason: "NFKC composes the accent into the Latin letter í." },
];

// Independent round-2 search: 48 clause cases and 84 address/file/code cases.
// The expected REDs below are main's existing literal results, not newly added
// false alarms. Both the app and the two real Edge matchers run these cohorts.
export const SCANLINE_R2_TERMS = [
  ["suicide", "sui", "cide"], ["suicidal", "sui", "cidal"],
  ["kill myself", "kill", "myself"], ["self-harm", "self", "harm"],
  ["self harm", "self", "harm"], ["want to die", "want", "to_die"],
  ["i want to die", "i", "want_to_die"], ["자살", "자", "살"],
  ["죽고 싶", "죽고", "싶"], ["죽고싶", "죽", "고싶"],
  ["자해", "자", "해"], ["목숨을 끊", "목숨을", "끊"],
] as const;

export const SCANLINE_R2_VARIANTS = [
  { name: "round 2 separate clauses", cases: [
    ...SCANLINE_R2_TERMS.flatMap(([term, left, right]) => [", ", ". ", "\n"].map((seam) => ({
      text: `The first identifier is ${left}${seam}${right} is the next identifier.`,
      red: seam === "\n" && ["kill myself", "self-harm", "self harm", "죽고 싶", "목숨을 끊"].includes(term),
    }))),
    ...[", ", ". ", "\n"].flatMap((seam) => [
      `The pests I kill${seam}myself I keep safe.`,
      `We study the self${seam}harm is a separate topic.`,
      `고양이 목숨을${seam}끊어진 전선에서 구했어.`,
      `In the end${seam}my life improved.`,
    ].map((text) => ({ text, red: seam === "\n" }))),
  ] },
  { name: "round 2 addresses files and code", cases: SCANLINE_R2_TERMS.flatMap(([, left, right]) => [
    `문서는 example.com:8080/${left}/${right.replaceAll("_", "/")} 에 있습니다.`,
    `문서는 https://example.com/${left}/${right.replaceAll("_", "/")} 에 있습니다.`,
    `문서는 /docs/${left}/${right.replaceAll("_", "/")} 에 있습니다.`,
    `문서는 C:\\docs\\${left}\\${right.replaceAll("_", "\\")} 에 있습니다.`,
    `const ${left}_${right} = 1;`,
    `const result = ${left}.${right};`,
    `필드 이름은 \`${left}_${right}\` 입니다.`,
  ].map((text) => ({ text, red: false }))) },
];
