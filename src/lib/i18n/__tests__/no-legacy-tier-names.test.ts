// The old tier names Soma / Cortex / Brain are legacy (Simon, 2026-10-14). People have seen
// 별바라기 · 항해자 · 북극성 (Stargazer · Voyager · North Star) since #703 (2026-07-03), and soma
// stopped selling on 2026-07-30 (#1140). The internal keys free / soma / cortex / brain stay as
// they are in code, database and server; only the words people see changed. Two places still
// showed the old words: the journal advisor lock line on /capture-full ("(Brain)", "Brain 요금제")
// and the plans.json f2 / f3 lines ("Everything in Soma", "Soma의 모든 기능").
//
// One rule everywhere: soma / cortex / brain as a whole word in any casing, and the Korean renderings.
// It reads locale values, both canon screens.json copies, and every string literal, template piece and
// JSX text under src (outside __tests__). In code the same words are also the internal keys
// ("brain", tier === "brain", the route "core-brain"), so each of those spots is listed one by one
// below (Simon, Q-261014-80 나, 2026-10-14): by file, the node's place in the syntax and its exact
// text, with how many times it occurs there. No line numbers, so moving code does not break the list;
// a new spot, a changed text, a changed count or a listed spot that is gone all fail.
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const root = process.cwd();

// "Whole word" means no Latin letter on either side, so a Korean particle glued to the name still
// counts ("Soma의 모든 기능" was a hit, and \b misses it), while "coreBrain" and "Brainstorm" do not.
// 브레인스토밍 (brainstorming) is a different word.
const LEGACY_TIER_NAME: readonly RegExp[] = [
  /(?<![A-Za-z])(?:soma|cortex|brain)(?![A-Za-z])/i,
  /소마|코텍스|코르텍스|브레인(?!스토밍)/,
];

const namesLegacyTier = (text: string): boolean => LEGACY_TIER_NAME.some((rule) => rule.test(text));

// Shown text (locale values, canon JSON): an exemption is one exact key path and one exact string.
interface Exemption {
  where: string;
  text: string;
  reason: string;
}

const LOCALE_EXEMPTIONS: readonly Exemption[] = [
  {
    where: "en/common.app.tagline",
    text: "A second brain built from what you write and save.",
    reason: "\"a second brain\" is the ordinary phrase for a personal note system, not the tier",
  },
  {
    where: "en/deepspace.graph.title",
    text: "My brain map",
    reason: "the brain as in the mind (the wiki graph's title), not the tier",
  },
];

const CANON_SCREENS = ["public/proto/data/app/screens.json", "design/proto_rev2/reference-app/data/app/screens.json"];

const CANON_EXEMPTIONS: readonly Exemption[] = CANON_SCREENS.map((file) => ({
  where: `${file}:screens.4.route`,
  text: "core-brain",
  reason: "route id of the 북극성 screen (/core-brain), a path segment, not shown text; its title is 북극성",
}));

interface Found {
  where: string;
  at: string;
  text: string;
}

function check(found: readonly Found[], exemptions: readonly Exemption[]): { hits: string[]; unused: Exemption[] } {
  const used = new Set<Exemption>();
  const hits: string[] = [];
  for (const item of found) {
    if (!namesLegacyTier(item.text)) continue;
    const exemption = exemptions.find((e) => e.where === item.where && e.text === item.text);
    if (exemption) used.add(exemption);
    else hits.push(`${item.at}: ${item.text}`);
  }
  return { hits, unused: exemptions.filter((e) => !used.has(e)) };
}

function strings(value: unknown, trail: string, out: Found[]): void {
  if (typeof value === "string") out.push({ where: trail, at: trail, text: value });
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      strings(child, trail.endsWith(":") ? `${trail}${key}` : `${trail}.${key}`, out);
    }
  }
}

const readJson = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

test("no locale string names a tier by its legacy name", () => {
  const localesDir = path.join(root, "locales");
  const found: Found[] = [];
  for (const lang of fs.readdirSync(localesDir)) {
    for (const file of fs.readdirSync(path.join(localesDir, lang)).filter((name) => name.endsWith(".json"))) {
      strings(readJson(`locales/${lang}/${file}`), `${lang}/${file.replace(/\.json$/, "")}`, found);
    }
  }
  // Sight control: the walk really read every language's bundles (21,985 strings on 2026-10-14).
  expect(found.length).toBeGreaterThan(15000);
  expect(check(found, LOCALE_EXEMPTIONS)).toEqual({ hits: [], unused: [] });
});

test("no canon screen string names a tier by its legacy name, in both copies", () => {
  const found: Found[] = [];
  for (const file of CANON_SCREENS) strings(readJson(file), `${file}:`, found);
  // Sight control: both copies were read (457 strings each on 2026-10-14).
  expect(found.length).toBeGreaterThan(800);
  expect(check(found, CANON_EXEMPTIONS)).toEqual({ hits: [], unused: [] });
  // The app reads public/proto; the reference app keeps the other copy. They must not drift apart.
  expect(readJson(CANON_SCREENS[1])).toEqual(readJson(CANON_SCREENS[0]));
});

test("the rule sees the strings that prompted it and leaves the rest alone", () => {
  for (const text of [
    "Ask HustleK about this entry (Brain)",
    "기록에 대한 답변은 Brain 요금제에서 받을 수 있습니다.",
    "Soma의 모든 기능",
    "Everything in Cortex",
    "⚠ 트위비는 Brain(pro) 전용",
    "브레인 트리니티 (은퇴)",
    "코르텍스 요금제",
    "Upgrade to BRAIN",
    "(brain)",
    "Everything in soma",
    "(BrAiN)",
    "Upgrade to cortex",
    "brain",
  ]) expect([text, namesLegacyTier(text)]).toEqual([text, true]);
  for (const text of [
    "coreBrain",
    "Brainstorm a list",
    "브레인스토밍",
    "기록에 대한 답변은 북극성 요금제에서 받을 수 있습니다.",
    "⚠ 트위비는 북극성(pro) 전용",
  ]) expect([text, namesLegacyTier(text)]).toEqual([text, false]);
});

test("a use that is not a tier needs its own exact exemption", () => {
  const found: Found[] = [{ where: "ko/common.tagline", at: "ko/common.tagline", text: "세컨드 브레인처럼 쓰는 기록" }];
  const exempt: Exemption = { where: "ko/common.tagline", text: "세컨드 브레인처럼 쓰는 기록", reason: "a phrase, not a tier" };
  // Without the entry it fails; with it, it passes.
  expect(check(found, []).hits).toEqual(["ko/common.tagline: 세컨드 브레인처럼 쓰는 기록"]);
  expect(check(found, [exempt])).toEqual({ hits: [], unused: [] });
  // The entry is not a pattern: another key, or the same key with other words, is checked again.
  expect(check([{ ...found[0], where: "ko/common.title", at: "ko/common.title" }], [exempt]).hits).toHaveLength(1);
  expect(check([{ ...found[0], text: "세컨드 브레인 요금제" }], [exempt]).hits).toHaveLength(1);
  // An entry that nothing matches any more is reported, so the list cannot rot.
  expect(check([], [exempt]).unused).toEqual([exempt]);
});

// ── App code ──────────────────────────────────────────────────────────────────────────────────

// Where a string node sits, without line numbers: the nearest named declaration that holds it, and
// the node's slot in the syntax ("operand of ===", "value of label", "literal type", "case label").
function ownerOf(node: ts.Node): string {
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || ts.isTypeAliasDeclaration(p)
      || ts.isInterfaceDeclaration(p) || ts.isClassDeclaration(p) || ts.isPropertyDeclaration(p))
      && p.name && ts.isIdentifier(p.name)) return p.name.text;
  }
  return "(module)";
}

function nameOf(expr: ts.Node): string {
  if (ts.isIdentifier(expr) || ts.isPrivateIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isStringLiteral(expr) || ts.isNumericLiteral(expr)) return expr.text;
  return ts.SyntaxKind[expr.kind];
}

function slotOf(node: ts.Node): string {
  const p = node.parent;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return "module path";
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== node) return `argument of ${nameOf(p.expression)}`;
  if (ts.isPropertyAssignment(p)) return p.initializer === node ? `value of ${nameOf(p.name)}` : "property name";
  if (ts.isBinaryExpression(p)) return `operand of ${ts.tokenToString(p.operatorToken.kind)}`;
  if (ts.isCaseClause(p)) return "case label";
  if (ts.isLiteralTypeNode(p)) return "literal type";
  if (ts.isArrayLiteralExpression(p)) return "array element";
  if (ts.isJsxAttribute(p)) return `attribute ${p.name.getText()}`;
  if (ts.isVariableDeclaration(p)) return "initializer";
  return ts.SyntaxKind[p.kind];
}

const contextOf = (node: ts.Node): string => `${ownerOf(node)} › ${slotOf(node)}`;

// [file, context, exact text, how many times]. Made once from main by a script outside this file
// (2026-10-14); each group names why its words are not the tier name shown to people.
type Spot = readonly [file: string, context: string, text: string, count: number];

const SOURCE_EXEMPTIONS: readonly { reason: string; spots: readonly Spot[] }[] = [
  {
    reason: "internal tier key: the value code, database and server use for a tier (types, comparisons, maps, case labels)",
    spots: [
      ["src/app/secondb.tsx", "SecondBChatBody › operand of ??", "cortex", 1],
      ["src/lib/analytics/conversion-events.ts", "cleanConversionProps › operand of !==", "cortex", 1],
      ["src/lib/analytics/conversion-events.ts", "cleanConversionProps › operand of !==", "brain", 1],
      ["src/lib/analytics/conversion-events.ts", "ConversionTier › literal type", "cortex", 1],
      ["src/lib/analytics/conversion-events.ts", "ConversionTier › literal type", "brain", 1],
      ["src/lib/billing/paddle-checkout.ts", "CheckoutTier › literal type", "cortex", 1],
      ["src/lib/billing/paddle-checkout.ts", "CheckoutTier › literal type", "brain", 1],
      ["src/lib/chat/limits.ts", "NEXT_TIER › value of cortex", "brain", 1],
      ["src/lib/chat/limits.ts", "NEXT_TIER › value of free", "cortex", 1],
      ["src/lib/chat/limits.ts", "NEXT_TIER › value of soma", "cortex", 1],
      ["src/lib/entitlements/reasoning-cap.ts", "pricingLabel › case label", "cortex", 1],
      ["src/lib/entitlements/reasoning-cap.ts", "pricingLabel › case label", "brain", 1],
      ["src/lib/entitlements/reasoning-cap.ts", "pricingLabel › case label", "soma", 1],
      ["src/lib/entitlements/tier-map.ts", "DB_TIER_BY_PUBLIC › value of plus", "cortex", 1],
      ["src/lib/entitlements/tier-map.ts", "DB_TIER_BY_PUBLIC › value of pro", "brain", 1],
      ["src/lib/payments/purchases-select.ts", "other › array element", "brain", 1],
      ["src/lib/payments/purchases-select.ts", "other › array element", "cortex", 1],
      ["src/lib/payments/purchases-select.ts", "requested › array element", "cortex", 1],
      ["src/lib/payments/purchases-select.ts", "requested › array element", "brain", 1],
      ["src/lib/persona/polaris-progress.ts", "isQaPolarisAutoEligible › operand of ===", "brain", 1],
      ["src/lib/progression/dev-tier-url.ts", "URL_TIER_MAP › value of all", "brain", 1],
      ["src/lib/progression/dev-tier-url.ts", "URL_TIER_MAP › value of brain", "brain", 1],
      ["src/lib/progression/dev-tier-url.ts", "URL_TIER_MAP › value of cortex", "cortex", 1],
      ["src/lib/progression/dev-tier-url.ts", "URL_TIER_MAP › value of plus", "cortex", 1],
      ["src/lib/progression/dev-tier-url.ts", "URL_TIER_MAP › value of pro", "brain", 1],
      ["src/lib/progression/dev-tier-url.ts", "URL_TIER_MAP › value of soma", "soma", 1],
      ["src/lib/progression/entitlements.ts", "PREMIUM_MIN_TIER › value of advisor", "brain", 1],
      ["src/lib/progression/entitlements.ts", "PREMIUM_MIN_TIER › value of planner", "brain", 1],
      ["src/lib/progression/entitlements.ts", "SubscriptionTier › literal type", "soma", 1],
      ["src/lib/progression/entitlements.ts", "SubscriptionTier › literal type", "cortex", 1],
      ["src/lib/progression/entitlements.ts", "SubscriptionTier › literal type", "brain", 1],
      ["src/lib/progression/pricing.ts", "SellableTier › literal type", "cortex", 1],
      ["src/lib/progression/pricing.ts", "SellableTier › literal type", "brain", 1],
      ["src/screens/deepspace/dds-plans-screen.tsx", "onNorthStar › operand of ===", "brain", 1],
      ["src/screens/deepspace/dds-plans-screen.tsx", "onVoyager › operand of ===", "cortex", 1],
      ["src/screens/deepspace/dds-plans-screen.tsx", "onVoyager › operand of ===", "soma", 1],
      ["src/screens/deepspace/dds-plans-screen.tsx", "paddleTier › ConditionalExpression", "cortex", 2],
      ["src/screens/deepspace/dds-plans-screen.tsx", "paddleTier › ConditionalExpression", "brain", 2],
      ["src/screens/deepspace/dds-plans-screen.tsx", "yearlyOffered › argument of paddleCheckoutAvailable", "cortex", 2],
      ["src/screens/deepspace/dds-plans-screen.tsx", "yearlyOffered › argument of paddleCheckoutAvailable", "brain", 2],
    ],
  },
  {
    reason: "path: the 북극성 screen's route /core-brain and its i18n namespace keep the internal name (only the name Core Brain is legacy, never the screen)",
    spots: [
      ["src/app/_layout.tsx", "RootLayout › attribute name", "core-brain", 1],
      ["src/app/audit.tsx", "AuditScreenerShell › argument of useTranslation", "core-brain", 1],
      ["src/app/brightness.tsx", "BrightnessTimelineScreen › argument of replace", "/core-brain", 1],
      ["src/app/core-brain.tsx", "CoreBrainScreen › argument of useTranslation", "core-brain", 1],
      ["src/app/northstar.tsx", "NorthstarSentence › argument of useTranslation", "core-brain", 1],
      ["src/app/persona.tsx", "Persona › attribute href", "/core-brain", 1],
      ["src/app/ratifications.tsx", "empty › argument of replace", "/core-brain", 1],
      ["src/app/trinity.tsx", "Trinity › attribute href", "/core-brain", 1],
      ["src/components/dashboard/DashboardPhone.tsx", "phonePage › ReturnStatement", "/core-brain", 1],
      ["src/components/dashboard/phone-screens.tsx", "(module) › module path", "@/app/core-brain", 1],
      ["src/components/dashboard/phone-screens.tsx", "PHONE_ROUTE_SCREENS › property name", "/core-brain", 1],
      ["src/components/deep-space/DeepSpaceScreen.tsx", "TAB_ROUTE › value of lens", "/core-brain", 1],
      ["src/components/deep-space/DeepSpaceShell.tsx", "DeepSpaceShell › value of pathname", "/core-brain", 1],
      ["src/components/deep-space/PolarisCardOverlay.tsx", "PolarisCardOverlay › argument of useTranslation", "core-brain", 1],
      ["src/components/deep-space/PolarisCategorySlots.tsx", "PolarisCategorySlots › argument of useTranslation", "core-brain", 1],
      ["src/components/deep-space/PolarisDeck.tsx", "PolarisDeck › argument of t", "core-brain:closeCard", 1],
      ["src/components/deep-space/PolarisDeck.tsx", "PolarisDeck › array element", "core-brain", 1],
      ["src/components/motion/WorldRouteTransition.tsx", "WorldRouteTransition › operand of ===", "core-brain", 1],
      ["src/lib/dev/screen-index.ts", "DEV_SCREEN_GROUPS › value of file", "core-brain", 1],
      ["src/lib/dev/screen-index.ts", "DEV_SCREEN_GROUPS › value of href", "/core-brain", 1],
      ["src/lib/dev/screen-index.ts", "DEV_SCREEN_GROUPS › value of note", "'나를 보는 자리'의 정본은 /core-brain 이라 그리로 넘긴다. 레거시 실화면(PersonaLegacy)은 2026-10-05 EXPO_PUBLIC_UI 레버와 함께 빠졌다(Q-261004-11)", 1],
      ["src/lib/dev/screen-index.ts", "DEV_SCREEN_GROUPS › value of note", "저장된 옛 링크 호환 전용. /persona 가 다시 /core-brain 으로 넘기므로 두 홉으로 /core-brain 까지 간다", 1],
      ["src/lib/dev/screen-index.ts", "DEV_SCREEN_GROUPS › value of to", "/core-brain", 2],
      ["src/lib/i18n/index.ts", "(module) › module path", "../../../locales/en/core-brain.json", 1],
      ["src/lib/i18n/index.ts", "(module) › module path", "../../../locales/ko/core-brain.json", 1],
      ["src/lib/i18n/index.ts", "NAMESPACES › array element", "core-brain", 1],
      ["src/lib/i18n/index.ts", "resources › property name", "core-brain", 2],
      ["src/lib/i18n/packs/es.ts", "(module) › module path", "../../../../locales/es/core-brain.json", 1],
      ["src/lib/i18n/packs/es.ts", "pack › property name", "core-brain", 1],
      ["src/lib/i18n/packs/id.ts", "(module) › module path", "../../../../locales/id/core-brain.json", 1],
      ["src/lib/i18n/packs/id.ts", "pack › property name", "core-brain", 1],
      ["src/lib/i18n/packs/pt.ts", "(module) › module path", "../../../../locales/pt/core-brain.json", 1],
      ["src/lib/i18n/packs/pt.ts", "pack › property name", "core-brain", 1],
      ["src/lib/motion/route-visibility.ts", "worldRouteVisible › operand of !==", "core-brain", 1],
      ["src/lib/nav/tabs.ts", "DEEP_SPACE_DOCK_PATHS › array element", "/core-brain", 1],
      ["src/screens/deepspace/dds-profile-screen.tsx", "routeGroups › value of key", "core-brain", 1],
      ["src/screens/deepspace/dds-profile-screen.tsx", "routeGroups › value of route", "/core-brain", 1],
      ["src/screens/deepspace/dds-wiki-records-screens.tsx", "DeepSpaceRecordsScreen › argument of push", "/core-brain", 2],
      ["src/screens/deepspace/dds-wiki-records-screens.tsx", "DeepSpaceRecordsScreen › argument of t", "core-brain:roleGraphFiltered", 1],
      ["src/screens/deepspace/dds-wiki-records-screens.tsx", "DeepSpaceRecordsScreen › argument of t", "core-brain:roleGraphEmpty", 1],
      ["src/screens/deepspace/dds-wiki-records-screens.tsx", "DeepSpaceRecordsScreen › argument of t", "core-brain:roleOpenPolaris", 1],
      ["src/screens/deepspace/DeepSpaceFlowMapScreen.tsx", "FLOW › value of path", "/core-brain", 1],
      ["src/screens/deepspace/DeepSpaceFlowMapScreen.tsx", "FLOW_BY_LOCALE › operand of ===", "/core-brain", 1],
      ["src/screens/deepspace/DeepSpaceFlowMapScreen.tsx", "FLOW_BY_LOCALE › value of path", "/core-brain", 4],
      ["src/screens/deepspace/DeepSpaceHomeScreen.tsx", "travel › argument of push", "/core-brain", 1],
    ],
  },
  {
    reason: "environment value: EXPO_PUBLIC_FORCE_TIER takes the internal keys (its schema, and the dev screen note that names it)",
    spots: [
      ["src/lib/dev/screen-index.ts", "DEV_SCREEN_GROUPS › value of note", "`chatMode` 를 divergent 로, `rev2Persona` 를 조이케이로 심는다. 초기값일 뿐이라 보내기 전에는 호출이 없다. ⚠ 조이케이는 북극성(pro) 전용 — free·plus 로 열면 페르소나가 조용히 허슬케이로 되돌아간다. 확인하려면 EXPO_PUBLIC_FORCE_TIER=brain (QA 계정은 free)", 1],
      ["src/lib/env.ts", "schema › array element", "soma", 1],
      ["src/lib/env.ts", "schema › array element", "cortex", 1],
      ["src/lib/env.ts", "schema › array element", "brain", 1],
    ],
  },
  {
    reason: "old product name 2nd-Brain in identifiers people do not read (iCalendar PRODID and UID, storage keys)",
    spots: [
      ["src/lib/google/calendar.ts", "lines › array element", "PRODID:-//2nd-Brain//Google Calendar import//EN", 1],
      ["src/lib/i18n/languageDetector.ts", "STORAGE_KEY › initializer", "2nd-brain:locale", 1],
      ["src/lib/ops/push.ts", "lines › array element", "PRODID:-//2nd-Brain//ops//EN", 1],
      ["src/lib/ops/push.ts", "uid › TemplateSpan", "@2nd-brain", 1],
      ["src/lib/theme/retired-theme-mode.ts", "RETIRED_THEME_MODE_KEY › initializer", "2nd-brain:theme-mode", 1],
    ],
  },
  {
    reason: "threshold registry (src/lib/sufficiency/registry.ts): declarations checked by its own test, not rendered; its notes and anchors name internal keys, a file path and server SQL",
    spots: [
      ["src/lib/sufficiency/registry.ts", "THRESHOLDS › argument of at", "src/app/core-brain.tsx", 7],
      ["src/lib/sufficiency/registry.ts", "THRESHOLDS › argument of at", "v_cap := CASE COALESCE(v_tier,'free') WHEN 'brain' THEN NULL WHEN 'cortex' THEN 7 WHEN 'soma' THEN 7 ELSE 2 END;", 2],
      ["src/lib/sufficiency/registry.ts", "THRESHOLDS › operand of +", "첫 확인 전에는 제안을 막고 읽기 실패 시 재시도한다. free 2 · soma 7 · cortex 7 · brain 무제한, 보상 크레딧이 있으면 그만큼 더", 1],
      ["src/lib/sufficiency/registry.ts", "THRESHOLDS › value of output", "/core-brain 빈 상태 해제", 1],
      ["src/lib/sufficiency/registry.ts", "THRESHOLDS › value of text", "free 2 · soma 7 · cortex 7 · brain 무제한. 넘으면 크레딧 1, 크레딧도 없으면 polaris_limit_exceeded", 1],
      ["src/lib/sufficiency/registry.ts", "THRESHOLDS › value of text", "하루 대화 횟수. free 는 freeChatDaily() · soma 30 · cortex 80 · brain 250, 보상 광고 보너스 포함", 1],
    ],
  },
];

interface FoundNode {
  file: string;
  context: string;
  at: string;
  text: string;
}

const spotKey = (file: string, context: string, text: string): string => JSON.stringify([file, context, text]);

function checkSource(found: readonly FoundNode[], groups: readonly { spots: readonly Spot[] }[]): { hits: string[]; unused: string[] } {
  const listed = new Map<string, number>();
  for (const group of groups) for (const [file, context, text, count] of group.spots) listed.set(spotKey(file, context, text), count);
  const seen = new Map<string, number>();
  const hits: string[] = [];
  for (const node of found) {
    if (!namesLegacyTier(node.text)) continue;
    const key = spotKey(node.file, node.context, node.text);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!listed.has(key)) hits.push(`${node.at} [${node.context}]: ${node.text}`);
  }
  for (const [key, count] of listed) {
    const actual = seen.get(key) ?? 0;
    if (actual > 0 && actual !== count) hits.push(`${key}: found ${actual}, listed ${count}`);
  }
  return { hits, unused: [...listed.keys()].filter((key) => !seen.has(key)) };
}

// The chat limit bubble's TIER_DISPLAY map ("Soma" / "Cortex" / "Brain") was the last pending
// exception here; it went with the upgrade pitch (Simon 2026-10-14, Q-261014-24), so nothing in
// app code is exempt beyond the listed spots.

function parse(rel: string): ts.SourceFile {
  const file = path.join(root, rel);
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
}

function sourceFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") sourceFiles(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
    }
  }
}

test("no app string names a tier by its legacy name outside the listed internal spots", () => {
  const files: string[] = [];
  sourceFiles(path.join(root, "src"), files);
  const found: FoundNode[] = [];
  for (const rel of files) {
    const source = parse(rel);
    // Comments are not nodes, so they are never read.
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node)
        || ts.isTemplateTail(node) || ts.isJsxText(node)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        found.push({ file: rel, context: contextOf(node), at: `${rel}:${line}`, text: node.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // Sight control: the walk read the app (946 files and 63,496 string nodes on 2026-10-14).
  expect(files.length).toBeGreaterThan(500);
  expect(found.length).toBeGreaterThan(40000);
  expect(checkSource(found, SOURCE_EXEMPTIONS)).toEqual({ hits: [], unused: [] });
});

test("a listed spot holds only its own place, text and count", () => {
  const spot: Spot = ["src/x.ts", "TIERS › array element", "brain", 1];
  const at = (context: string, text: string): FoundNode => ({ file: "src/x.ts", context, at: "src/x.ts:1", text });
  expect(checkSource([at("TIERS › array element", "brain")], [{ spots: [spot] }])).toEqual({ hits: [], unused: [] });
  // The same word in another slot or owner, another text, or once more than listed: all fail.
  expect(checkSource([at("Badge › value of label", "brain")], [{ spots: [spot] }]).hits).toHaveLength(1);
  expect(checkSource([at("TIERS › array element", "Brain")], [{ spots: [spot] }]).hits).toHaveLength(1);
  expect(checkSource([at("TIERS › array element", "brain"), at("TIERS › array element", "brain")], [{ spots: [spot] }]).hits)
    .toEqual([`${spotKey(spot[0], spot[1], spot[2])}: found 2, listed 1`]);
  // A listed spot that is gone is reported.
  expect(checkSource([], [{ spots: [spot] }]).unused).toHaveLength(1);
  // The context names the place by syntax, not by line.
  const probe = ts.createSourceFile("p.ts", "\n\nconst TIERS = [\"brain\"];\nfunction f(t: string) { return t === \"cortex\"; }\nconst B = { label: \"soma\" };", ts.ScriptTarget.Latest, true);
  const contexts: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) contexts.push(`${contextOf(node)}: ${node.text}`);
    ts.forEachChild(node, visit);
  };
  visit(probe);
  expect(contexts).toEqual(["TIERS › array element: brain", "f › operand of ===: cortex", "B › value of label: soma"]);
});

test("the chat limit bubble names no tier", () => {
  // Simon 2026-10-14 (Q-261014-24): the limit sentence and the 요금제 보기 link only.
  const declared: string[] = [];
  const pieces: string[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      pieces.push(node.text);
    }
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === "BLOCKED_HINT" || node.name.text === "TIER_DISPLAY") declared.push(node.name.text);
      if (node.name.text === "BLOCKED_HINT") collect(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse("src/lib/chat/conversation.ts"));
  expect(declared).toEqual(["BLOCKED_HINT"]);
  expect(pieces).toEqual([
    "You've hit today's chat limit (", "). Limits reset at midnight KST.",
    "오늘 채팅 한도(", "회)를 모두 사용했어요. 한도는 KST 자정에 초기화돼요.",
  ]);
});
