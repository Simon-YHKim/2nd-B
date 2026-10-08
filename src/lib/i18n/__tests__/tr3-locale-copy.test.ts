// Q-261005-01 = A (QA 261006, R2B-03) translation bundle tr3.
//
// WHY. The import hub (/import-hub), the avatar studio's catalog names
// (/avatar-studio), the career path block (/career), the weekly growth
// observation (/growth) and the /reasoning screen picked their copy with "Korean,
// otherwise English" in code: a COPY(ko) table and nameKo/nameEn pairs in
// ImportHubScreen, the avatar engine's ko/en catalog, ko/en literals in career,
// obsKo/obsEn in WeeklyGrowthScreen and ~50 `ko ? "..." : "..."` ternaries in
// reasoning. The es/pt/id packs had every key, so check:i18n-keys passed while
// those routes painted English (2026-10-05 web sweep: /import-hub 30 lines,
// /avatar-studio 26, /reasoning 16, /career 5, /growth 3). This bundle moved that
// copy into locale keys. The gates below keep it moved:
//
//   1. each screen reads the new keys and the old in-code tables are gone;
//   2. en and ko keep their text: the hub and growth values are pinned verbatim,
//      the avatar names equal the approved engine's ko/en pair, and the reasoning
//      screen's reused keys (limit sheet lines, home domain names) say what the
//      screen said;
//   3. es/pt/id hold their own text for every moved key, not the English (a
//      short list of proper nouns and same-spelled words is named below and in
//      scripts/i18n-identical-allowlist.json);
//   4. a real i18next paints the es/pt/id text through the keys the screens call.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import i18next, { type i18n } from "i18next";
import * as ts from "typescript";

import { AVATAR_CATALOG } from "@/lib/avatar";
import { monthLabelFor } from "@/lib/reasoning/remaining-copy";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const OTHERS = ["es", "pt", "id"] as const;
type Lng = (typeof LOCALES)[number];
const pack = (lng: string, ns: string) => JSON.parse(read(`locales/${lng}/${ns}.json`)) as Record<string, unknown>;
const at = (node: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((n, part) => (n as Record<string, unknown> | undefined)?.[part], node);
function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
const ALLOW = new Set(JSON.parse(read("scripts/i18n-identical-allowlist.json")) as string[]);

/** Identifiers and string/template text of a source file - comments are not code. */
function codeOf(src: string, file: string): { idents: Set<string>; strings: string[] } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const idents = new Set<string>();
  const strings: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) idents.add(node.text);
    else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text);
    else if (ts.isJsxText(node) && node.text.trim()) strings.push(node.text.trim());
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { idents, strings };
}
const hasKorean = (texts: string[]) => texts.filter((t) => /[가-힣]/.test(t));

/** Every key under `ns:prefix` holds text in all five locales, and es/pt/id differ from en unless allowlisted. */
function expectTranslated(ns: string, prefix: string, expectedCount: number) {
  const en = flatten(at(pack("en", ns), prefix), prefix);
  expect(Object.keys(en).length).toBe(expectedCount);
  for (const lng of LOCALES) {
    const mine = flatten(at(pack(lng, ns), prefix), prefix);
    expect({ lng, keys: Object.keys(mine).sort() }).toEqual({ lng, keys: Object.keys(en).sort() });
    for (const [key, value] of Object.entries(mine)) {
      expect({ lng, key, ok: value.trim().length > 0 }).toEqual({ lng, key, ok: true });
    }
  }
  for (const lng of OTHERS) {
    const mine = flatten(at(pack(lng, ns), prefix), prefix);
    for (const [key, value] of Object.entries(en)) {
      const allowed = ALLOW.has(`${ns}:${key}`) || value.length < 4;
      if (!allowed) expect({ lng, key, translated: mine[key] !== value }).toEqual({ lng, key, translated: true });
    }
  }
}

const HUB = read("src/screens/deepspace/import/ImportHubScreen.tsx");
const AVATAR_STUDIO = read("src/app/avatar-studio.tsx");
const CAREER = read("src/app/career.tsx");
const GROWTH = read("src/screens/deepspace/growth/WeeklyGrowthScreen.tsx");
const REASONING = read("src/app/reasoning.tsx");

let inst: i18n;
beforeAll(async () => {
  inst = i18next.createInstance();
  await inst.init({
    lng: "en",
    fallbackLng: "en",
    resources: Object.fromEntries(
      LOCALES.map((lng) => [
        lng,
        { import: pack(lng, "import"), avatar: pack(lng, "avatar"), deepspace: pack(lng, "deepspace"), home: pack(lng, "home") },
      ]),
    ),
    interpolation: { escapeValue: false },
  });
});
const tFor = (lng: Lng, ns: string) => inst.getFixedT(lng, ns);

describe("tr3 /import-hub: hub copy reads import hub.* in the painted language", () => {
  it("the COPY(ko) table and the tile ko/en fields are gone; t() reads the bundle", () => {
    const code = codeOf(HUB, "ImportHubScreen.tsx");
    for (const gone of ["COPY", "nameKo", "nameEn", "subKo", "subEn", "whatKo", "whatEn", "startsWith"]) {
      expect({ gone, present: code.idents.has(gone) }).toEqual({ gone, present: false });
    }
    expect(hasKorean(code.strings)).toEqual([]);
    expect(HUB).toContain('const ko = renderedUiLanguage(i18n) === "ko";');
    expect(HUB).toContain("const t = (k: string) => importT(`hub.${k}`);");
    expect(HUB).toContain("const name = (s: ImportSource) => importT(`hub.sources.${s.key}.name`);");
    expect(HUB).toContain('{sourceCopy(s, "sub")}');
    expect(HUB).toContain('{sourceCopy(s, "what")}');
  });

  it("every hub key is used by the screen, and every source tile has its copy", () => {
    const en = at(pack("en", "import"), "hub") as Record<string, unknown>;
    const copyKeys = Object.keys(en).filter((k) => k !== "sources");
    // 57: ledgerSkippedNote (0224, RD-261007-01 발주 2) joined the hub copy.
    expect(copyKeys).toHaveLength(57);
    for (const k of copyKeys) {
      const used = HUB.includes(`"${k}"`) || (k.startsWith("tier_") && HUB.includes("t(`tier_${"));
      expect({ k, used }).toEqual({ k, used: true });
    }
    const block = HUB.slice(HUB.indexOf("const SOURCES: ImportSource[] = ["), HUB.indexOf("];", HUB.indexOf("const SOURCES")));
    const tileKeys = [...block.matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]);
    expect(tileKeys).toHaveLength(10);
    expect(Object.keys(en.sources as Record<string, unknown>).sort()).toEqual([...tileKeys].sort());
  });

  it("en and ko keep the text the COPY table and the tiles painted (sample pinned verbatim)", () => {
    const hub = (lng: Lng) => at(pack(lng, "import"), "hub") as Record<string, unknown>;
    const en = hub("en");
    const ko = hub("ko");
    expect([en.hubBubble, en.hubTip, en.tier_critical, en.what, en.applyN, en.revokeNeedsSignIn]).toEqual([
      "What should we bring in?",
      "Only what you approve is kept.",
      "Most sensitive · consent required",
      "WHAT",
      "Apply {n} to records",
      "Sign in to withdraw - the server-side rows must be deleted together.",
    ]);
    expect([ko.hubBubble, ko.hubTip, ko.tier_critical, ko.what, ko.applyN, ko.connectorNote]).toEqual([
      "무엇을 들여올까요?",
      "네가 승인한 것만 기록에 남습니다.",
      "최민감 · 명시 동의 필요",
      "무엇을",
      "고른 {n}건 기록에 반영",
      // 2026-10-07 재설계 발주 1: 이 타일은 위치 권한을 요청하지 않고 파일 입력으로 간다 - 문구를 동작에 맞췄다.
      "앱은 지금 위치를 직접 읽지 않습니다. 구글 타임라인처럼 내보낸 위치 기록 파일을 올려 주세요.",
    ]);
    expect(at(en, "sources.kakao")).toEqual({
      name: "KakaoTalk",
      sub: "Comms · file export",
      what: "Only plan mention counts and relationship frequency. We don't store message text.",
    });
    expect(at(ko, "sources.kakao")).toEqual({
      name: "카카오톡 대화",
      sub: "통신 · 파일 내보내기",
      what: "약속 언급 횟수와 관계 빈도만 뽑습니다. 메시지 본문은 저장하지 않습니다.",
    });
    expect(at(ko, "sources.calendar.name")).toBe("캘린더(.ics)");
  });

  it.each(LOCALES)("%s keeps the single-brace slots the screen replaces", (lng) => {
    const hub = at(pack(lng, "import"), "hub") as Record<string, string>;
    expect(hub.applyN).toContain("{n}");
    expect(hub.ledgerWarnPartBody).toContain("{failed}");
    expect(hub.ledgerWarnPartBody).toContain("{inserted}");
    // 0224 (RD-261007-01): re-importing is safe now; the skipped note carries its own count.
    expect(hub.ledgerSkippedNote).toContain("{skipped}");
  });
  it("the screen still replaces exactly those slots", () => {
    expect(HUB).toContain('t("applyN").replace("{n}", String(count))');
    expect(HUB).toContain('.replace("{failed}", String(ledgerWarn.failed))');
    expect(HUB).toContain('.replace("{inserted}", String(ledgerWarn.inserted))');
  });

  it("es/pt/id translate every hub line (brand names named in the allowlist)", () => {
    expectTranslated("import", "hub", 87);
    for (const brand of ["kakao", "takeout", "notion", "google", "google-tasks"]) {
      expect(ALLOW.has(`import:hub.sources.${brand}.name`)).toBe(true);
    }
  });

  it("a real i18next paints the es/pt/id hub", () => {
    expect(tFor("es", "import")("hub.hubBubble")).toBe("¿Qué quieres traer?");
    expect(tFor("pt", "import")("hub.sources.health.name")).toBe("Saúde");
    expect(tFor("id", "import")("hub.consentPick")).toBe("Setujui dan pilih file");
  });
});

describe("tr3 /avatar-studio: catalog names read avatar:items.<category>.<id>", () => {
  const CATS = Object.keys(AVATAR_CATALOG) as (keyof typeof AVATAR_CATALOG)[];

  it("the studio reads the bundle; the ko/en pick is gone", () => {
    expect(AVATAR_STUDIO).toContain("return t(`avatar:items.${choice.category}.${choice.item.id}`);");
    expect(codeOf(AVATAR_STUDIO, "avatar-studio.tsx").idents.has("koreanNames")).toBe(false);
    expect(AVATAR_STUDIO).not.toMatch(/choice\.item\.(ko|en)\b/);
  });

  it("the bundle's en/ko equal the approved engine's names, for every catalog item", () => {
    let compared = 0;
    for (const cat of CATS) {
      const items = AVATAR_CATALOG[cat] as readonly { id: string; ko: string; en: string }[];
      for (const lng of LOCALES) {
        const block = at(pack(lng, "avatar"), `items.${cat}`) as Record<string, string>;
        expect({ lng, cat, ids: Object.keys(block) }).toEqual({ lng, cat, ids: items.map((i) => i.id) });
      }
      for (const item of items) {
        expect(at(pack("en", "avatar"), `items.${cat}.${item.id}`)).toBe(item.en);
        expect(at(pack("ko", "avatar"), `items.${cat}.${item.id}`)).toBe(item.ko);
        compared++;
      }
    }
    expect(compared).toBe(144);
  });

  it("es/pt/id translate every catalog name (same-spelled words named in the allowlist)", () => {
    expectTranslated("avatar", "items", 144);
  });

  it("a real i18next paints the es/pt/id hair names", () => {
    expect(tFor("es", "avatar")("items.hair.sidepart")).toBe("Raya al lado");
    expect(tFor("pt", "avatar")("items.hair.ponytail")).toBe("Rabo de cavalo");
    expect(tFor("id", "avatar")("items.hair.bald")).toBe("Botak");
  });
});

describe("tr3 /career: the path block reads deepspace career.*", () => {
  it("the screen reads the bundle; the ko/en literals and the locale pick are gone", () => {
    const code = codeOf(CAREER, "career.tsx");
    expect(hasKorean(code.strings)).toEqual([]);
    for (const gone of ["The path you've built", "Main", "Side", "Education", "Military", "Awards", "Licenses", "Experience"]) {
      expect({ gone, present: code.strings.includes(gone) }).toEqual({ gone, present: false });
    }
    expect(code.idents.has("locale")).toBe(false);
    expect(code.idents.has("i18n")).toBe(false);
    expect(CAREER).toContain('{t("deepspace:career.pathTitle")}');
    expect(CAREER).toContain('t(tk === "main" ? "deepspace:career.trackMain" : "deepspace:career.trackSide")');
    expect(CAREER).toContain("{t(`deepspace:career.credentials.${c}`)}");
    expect(CAREER).toContain('{t("deepspace:career.sideNote")}');
  });

  it("en and ko keep the old text verbatim", () => {
    const keys = ["pathTitle", "trackMain", "trackSide", "credentials.education", "credentials.military", "credentials.awards", "credentials.licenses", "credentials.experience"];
    const v = (lng: Lng) => keys.map((k) => at(pack(lng, "deepspace"), `career.${k}`));
    expect(v("en")).toEqual(["The path you've built", "Main", "Side", "Education", "Military", "Awards", "Licenses", "Experience"]);
    expect(v("ko")).toEqual(["쌓아온 길", "메인", "사이드", "학력", "병역", "수상", "자격", "경력"]);
    expect(at(pack("ko", "deepspace"), "career.sideNote")).toBe(
      "학력·병역·수상·자격·경력 같은 공식 이력은 연동하면 여기에 자동으로 정리됩니다. 지금은 메인에서 직접 추가한 성과가 쌓입니다.",
    );
  });

  it("es/pt/id translate the path block", () => {
    for (const lng of OTHERS) {
      for (const k of ["pathTitle", "trackMain", "trackSide", "sideNote", "credentials.education", "credentials.experience"]) {
        const v = at(pack(lng, "deepspace"), `career.${k}`);
        expect({ lng, k, ok: typeof v === "string" && v.length > 0 && v !== at(pack("en", "deepspace"), `career.${k}`) }).toEqual({ lng, k, ok: true });
      }
    }
    expect(tFor("es", "deepspace")("career.pathTitle")).toBe("Trayectoria");
  });
});

describe("tr3 /growth: the observation and next step read ds.growth.steps", () => {
  const STARS = ["profile", "infancy", "school", "twenties", "later", "work", "now"];

  it("the screen reads the bundle; the obsKo/obsEn table is gone", () => {
    const code = codeOf(GROWTH, "WeeklyGrowthScreen.tsx");
    for (const gone of ["obsKo", "obsEn", "stepKo", "stepEn", "STEP", "ko", "i18n"]) {
      expect({ gone, present: code.idents.has(gone) }).toEqual({ gone, present: false });
    }
    expect(hasKorean(code.strings)).toEqual([]);
    expect(GROWTH).toContain("const stepObs = (id: SevenStarId) => t(`ds.growth.steps.${id}.obs`);");
    expect(GROWTH).toContain("const stepText = (id: SevenStarId) => t(`ds.growth.steps.${id}.step`);");
    expect(GROWTH).toContain("title: stepText(top.id),");
    expect(GROWTH).toContain("reason: stepObs(top.id),");
    expect(GROWTH).toContain("{stepObs(hero.id)}");
  });

  it("en and ko keep the old table verbatim", () => {
    const v = (lng: Lng, f: "obs" | "step") => STARS.map((s) => at(pack(lng, "deepspace"), `ds.growth.steps.${s}.${f}`));
    expect(v("en", "obs")).toEqual([
      "You filled in more of your basics this week.",
      "You dug into your earliest memories.",
      "You revisited your school years.",
      "You went deep on your twenties.",
      "You looked at how you changed after thirty.",
      "You looked at yourself at work.",
      "You checked in on yourself often.",
    ]);
    expect(v("ko", "obs")).toEqual([
      "내 기본 정보를 채워간 한 주였습니다.",
      "가장 이른 기억을 파본 한 주였습니다.",
      "학창시절을 되짚은 한 주였습니다.",
      "20대의 나를 깊게 판 한 주였습니다.",
      "서른 이후의 변화를 돌아본 한 주였습니다.",
      "일하는 나를 들여다본 한 주였습니다.",
      "지금의 나를 자주 들여다봤습니다.",
    ]);
    expect(v("en", "step")).toEqual([
      "Fill in one profile field",
      "Note one scene that came up",
      "Dig into one more scene from then",
      "Write down one choice from then",
      "Write one line about what changed",
      "Note one scene from work this week",
      "One line of reflection today",
    ]);
    expect(v("ko", "step")).toEqual([
      "프로필 항목 하나 채우기",
      "떠오른 장면 한 조각 적어두기",
      "그 시절 한 장면 더 파보기",
      "그때의 선택 하나 적어보기",
      "달라진 것 한 줄 적기",
      "이번 주 일의 한 장면 적기",
      "오늘 한 줄 돌아보기",
    ]);
  });

  it("es/pt/id translate every observation and step", () => {
    expectTranslated("deepspace", "ds.growth.steps", 14);
    expect(tFor("pt", "deepspace")("ds.growth.steps.work.step")).toBe("Anote uma cena do trabalho desta semana");
  });
});

describe("tr3 /reasoning: the screen copy reads ds.reasoningScreen.*", () => {
  it("no copy ternary on the ko/en locale is left; the system locale stays for the prompt and the hotline", () => {
    const flat = REASONING.replace(/\s+/g, " ");
    expect(flat.match(/\bko \? ["'`][^"'`]*["'`]/g)).toEqual(['ko ? "ko"']);
    // Korean left in the file: the two connect-prompt system lines, nothing on screen.
    const korean = hasKorean(codeOf(REASONING, "reasoning.tsx").strings);
    expect(korean).toHaveLength(2);
    for (const line of korean) expect(line).toMatch(/^사용자가 고른 (생활 기록을|자료를) 7개 생활 도메인 중 하나에 연결하세요\./);
    expect(REASONING).not.toContain('args.locale === "ko" ?');
    expect(REASONING).not.toContain("formatWeeklyRemaining");
    expect(REASONING).not.toContain("formatRewardRemaining");
    expect(REASONING).not.toContain("getDomainStar");
    // Not copy: the connect prompt's language and the crisis hotline keep the ko/en locale.
    expect(REASONING).toContain('hotline={ko ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988"}');
    expect(REASONING).toContain('const locale: "ko" | "en" = ko ? "ko" : "en";');
  });

  it("the screen calls the new keys and the reused ones", () => {
    for (const call of [
      'const reasoningTitle = t("ds.reasoningScreen.title");',
      't("ds.reasoningScreen.selectedTitle", { n: selected.size })',
      't("ds.reasoningScreen.weeklyLeft", {',
      't("ds.reasoningLimit.rewardLeft", { n: rewardCredits, month: monthLabelFor(uiLng, monthBucket()) })',
      't("ds.reasoningLimit.resetLine", { cap: cap ?? 0 })',
      't("ds.reasoningLimit.adCta", { n: REWARD_PER_WATCH })',
      "t(`home:ds.home.domainName.${status.domain}`)",
      't("ds.reasoningScreen.proposedFor", { domain: domainName })',
      't("ds.reasoningScreen.runningSummary", { total: selectedItems.length, done: completedCount })',
      'const tl = i18n.getFixedT(uiLng, "deepspace");',
      "const ago = (key: RelativeTimeKey, n: number) => tl(`ds.reasoningScreen.${key}`, { n });",
      'title: recordTitle(row, tl("ds.reasoningScreen.untitledRecord")),',
      "const uiLng = renderedUiLanguage(i18n);",
    ]) {
      expect({ call, present: REASONING.includes(call) }).toEqual({ call, present: true });
    }
    // Automatic runs are queued outside React: the global i18next, in the painted language.
    expect(REASONING).toContain('meta: queuedMeta("record"),');
    expect(REASONING).toContain('meta: queuedMeta("source"),');
    expect(REASONING).toContain("lng: renderedUiLanguage(i18next),");
  });

  it("every ds.reasoningScreen key the screen names exists, and every new key is called", () => {
    const block = at(pack("en", "deepspace"), "ds.reasoningScreen") as Record<string, string>;
    const named = new Set([...REASONING.matchAll(/ds\.reasoningScreen\.(\w+)/g)].map((m) => m[1]));
    for (const k of named) expect({ k, exists: k in block }).toEqual({ k, exists: true });
    const viaTemplate = new Set(["justNow", "hoursAgo", "yesterday", "daysAgo"]);
    const older = new Set(["autoTitle", "autoPaused", "autoBody", "autoNote"]);
    for (const k of Object.keys(block)) {
      if (older.has(k)) continue;
      const called = named.has(k) || (viaTemplate.has(k) && REASONING.includes(`label("${k}"`));
      expect({ k, called }).toEqual({ k, called: true });
    }
  });

  it("en and ko keep the screen's words (sample pinned verbatim)", () => {
    const rs = (lng: Lng) => at(pack(lng, "deepspace"), "ds.reasoningScreen") as Record<string, string>;
    expect([rs("en").title, rs("en").unlimited, rs("en").reasonSelected, rs("en").runHint, rs("en").runningNote, rs("en").queuedRecord]).toEqual([
      "Reasoning",
      "Unlimited connections",
      "Reason over selected items",
      "Select items to enable reasoning.",
      "You can leave this screen. HustleK will let you know when it's ready.",
      "New record · queued",
    ]);
    expect([rs("ko").title, rs("ko").unlimited, rs("ko").reasonSelected, rs("ko").runHint, rs("ko").viewPlans, rs("ko").queuedSource]).toEqual([
      "리즈닝",
      "무제한으로 별을 이을 수 있습니다",
      "선택한 자료 리즈닝",
      "자료를 선택하면 실행 버튼이 켜집니다.",
      "플랜 보기",
      "새 자료 · 자동 대기",
    ]);
    // The reused keys say exactly what the screen's own ko/en strings said.
    const lim = (lng: Lng) => at(pack(lng, "deepspace"), "ds.reasoningLimit") as Record<string, string>;
    expect([lim("en").resetLine, lim("en").adCta]).toEqual(["{{cap}} runs refill Monday at 00:00 KST.", "Watch an ad for {{n}} runs"]);
    expect([lim("ko").resetLine, lim("ko").adCta]).toEqual(["월요일 00:00에 다시 {{cap}}회가 채워집니다.", "광고 보고 {{n}}회 받기"]);
  });

  it("the two quota lines read the same as the old ko/en formatters (spec 결정 5)", () => {
    const ko = tFor("ko", "deepspace");
    const en = tFor("en", "deepspace");
    expect(ko("ds.reasoningScreen.weeklyLeft", { cap: 2, left: 1 })).toBe("이번 주 2회 중 1회 남음 · 월요일 초기화");
    expect(en("ds.reasoningScreen.weeklyLeft", { cap: 2, left: 1 })).toBe("1 of 2 runs left this week · resets Monday");
    const koReward = ko("ds.reasoningLimit.rewardLeft", { n: 4, month: monthLabelFor("ko", "2026-07") });
    expect(koReward).toBe("보상 4회 남음 · 7월 말까지");
    expect(koReward).not.toContain("월요일");
    expect(en("ds.reasoningLimit.rewardLeft", { n: 6, month: monthLabelFor("en", "2026-07") })).toBe(
      "6 reward runs left · through the end of July",
    );
  });

  it("es/pt/id translate every new reasoning line", () => {
    const en = at(pack("en", "deepspace"), "ds.reasoningScreen") as Record<string, string>;
    const fresh = Object.keys(en).filter((k) => !["autoTitle", "autoPaused", "autoBody", "autoNote"].includes(k));
    expect(fresh).toHaveLength(48);
    for (const lng of OTHERS) {
      const mine = at(pack(lng, "deepspace"), "ds.reasoningScreen") as Record<string, string>;
      for (const k of fresh) {
        const same = ALLOW.has(`deepspace:ds.reasoningScreen.${k}`);
        expect({ lng, k, ok: typeof mine[k] === "string" && mine[k].length > 0 && (same || mine[k] !== en[k]) }).toEqual({ lng, k, ok: true });
      }
    }
  });

  it("a real i18next paints the es/pt/id screen", () => {
    expect(tFor("es", "deepspace")("ds.reasoningScreen.weeklyLeft", { cap: 2, left: 1 })).toBe(
      "Búsquedas disponibles esta semana: 1 de 2 · se reinician el lunes",
    );
    expect(tFor("pt", "deepspace")("ds.reasoningScreen.proposedFor", { domain: tFor("pt", "home")("ds.home.domainName.career") })).toBe(
      "Proposto para Carreira",
    );
    expect(tFor("id", "deepspace")("ds.reasoningScreen.hoursAgo", { n: 3 })).toBe("3 jam lalu");
  });
});
