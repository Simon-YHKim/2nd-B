import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { modeSwitchPersona } from "../mode-switch";
import type { Rev2PersonaId } from "../rev2-personas";
import type { ChatTurn } from "../session-types";
import { composeExchangeBody, findPrompt } from "../keep-exchange";
import { phoneStyle } from "@/lib/theme/phone-design";
import { phoneIos } from "@/lib/theme/phone-ios";
import { semantic, spacing } from "@/lib/theme/tokens";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const screen = read("src/app/secondb.tsx");
const line = read("src/components/secondb/ChatModeLine.tsx");
const source = ts.createSourceFile("secondb.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const user = (persona?: Rev2PersonaId): ChatTurn => ({ role: "user", text: "My question", persona });
const reply = (persona?: Rev2PersonaId, extra: Partial<ChatTurn> = {}): ChatTurn => ({
  role: "secondb", text: "The answer", persona, ...extra,
});
const pair = (persona: Rev2PersonaId) => [user(persona), reply(persona)];

// The same adjacent-turn and trailing selectors are checked on the screen below.
function lines(turns: readonly ChatTurn[], selected: Rev2PersonaId) {
  return [...turns.map((turn, i) => ({ before: i, persona: modeSwitchPersona(turns[i - 1]?.persona, turn.persona) })),
    { before: turns.length, persona: modeSwitchPersona(turns[turns.length - 1]?.persona, selected) }]
    .filter(item => item.persona !== null);
}

describe("Z87 mode boundaries", () => {
  test.each<Rev2PersonaId>(["secondb", "meta", "twi"])("first choice or cleared chat: %s has no line", selected => {
    expect(lines([], selected)).toEqual([]);
    expect(lines(pair(selected), selected)).toEqual([]);
  });

  test.each<[Rev2PersonaId, Rev2PersonaId]>([
    ["secondb", "meta"], ["secondb", "twi"], ["meta", "secondb"],
    ["meta", "twi"], ["twi", "secondb"], ["twi", "meta"],
  ])("switch %s to %s, then send, moves the trailing line between turns", (from, to) => {
    const turns = pair(from);
    expect(lines(turns, to)).toEqual([{ before: 2, persona: to }]);
    expect(lines([...turns, user(to)], to)).toEqual([{ before: 2, persona: to }]);
    expect(lines([...turns, ...pair(to)], to)).toEqual([{ before: 2, persona: to }]);
    // Reselecting and switching back without sending leave no historical entry.
    expect(lines(turns, from)).toEqual([]);
    expect(turns).toEqual(pair(from));
  });

  test("a late reply remains before the line even after several choices", () => {
    const turns = [user("meta")];
    expect(lines(turns, "twi")).toEqual([{ before: 1, persona: "twi" }]);
    expect(lines([...turns, reply("meta")], "secondb")).toEqual([{ before: 2, persona: "secondb" }]);
    expect(lines([...turns, reply("meta")], "meta")).toEqual([]);
  });

  test("multiple sent mode changes each keep their own line", () => {
    expect(lines([...pair("meta"), ...pair("twi"), ...pair("secondb")], "meta")).toEqual([
      { before: 2, persona: "twi" }, { before: 4, persona: "secondb" }, { before: 6, persona: "meta" },
    ]);
  });

  test("older JSON with missing persona remains readable without invented boundaries", () => {
    const older = JSON.parse('[{"role":"user","text":"Old question"},{"role":"secondb","text":"Old answer"}]') as ChatTurn[];
    expect(lines(older, "meta")).toEqual([]);
    expect(lines([...older, ...pair("twi")], "twi")).toEqual([]);
    expect(lines([reply("meta"), user(), reply("twi")], "twi")).toEqual([]);
    expect(lines([reply("meta"), user()], "twi")).toEqual([]);
    const current = JSON.parse(JSON.stringify([...pair("meta"), ...pair("twi")])) as ChatTurn[];
    expect(lines(current, "twi")).toEqual([{ before: 2, persona: "twi" }]);
  });

  test.each<Partial<ChatTurn>>([
    { safetyZone: "red", crisisNotice: true },
    { synthetic: true },
    { synthetic: true, retryText: "My question" },
    { synthetic: true, consentError: "consent_required" },
  ])("crisis and synthetic replies retain their send mode: %j", extra => {
    const turns = [user("meta"), reply("meta", extra)];
    expect(lines(turns, "meta")).toEqual([]);
    expect(lines(turns, "twi")).toEqual([{ before: 2, persona: "twi" }]);
    expect(lines([...turns, ...pair("twi")], "twi")).toEqual([{ before: 2, persona: "twi" }]);
  });

  test("retrying the failed pair under another mode replaces its boundary", () => {
    const earlier = pair("secondb");
    const failed = [...earlier, user("meta"), reply("meta", { synthetic: true, retryText: "My question" })];
    expect(lines(failed, "twi")).toEqual([{ before: 2, persona: "meta" }, { before: 4, persona: "twi" }]);
    expect(lines([...failed.slice(0, 2), ...pair("twi")], "twi")).toEqual([{ before: 2, persona: "twi" }]);
  });
});

function nodes<T extends ts.Node>(guard: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  function visit(node: ts.Node) {
    if (guard(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

describe("screen source contracts (no native renderer)", () => {
  test("both roles capture the admitted request persona, including crisis and synthetic branches", () => {
    const turns = nodes(ts.isObjectLiteralExpression).filter(node => node.properties.some(prop =>
      ts.isPropertyAssignment(prop) && prop.name.getText(source) === "role"
      && ts.isStringLiteral(prop.initializer) && ["user", "secondb"].includes(prop.initializer.text)));
    expect(turns).toHaveLength(5);
    for (const turn of turns) {
      const persona = turn.properties.find(prop => ts.isPropertyAssignment(prop) && prop.name.getText(source) === "persona");
      expect(persona && ts.isPropertyAssignment(persona) && persona.initializer.getText(source)).toBe("requestPersona");
    }
    expect(screen).toContain("const requestPersona = rev2Persona;");
    expect(read("src/lib/chat/session-types.ts")).toContain("persona?: Rev2PersonaId;");
  });

  test("adjacent line precedes the bubble, hidden crisis text stays hidden, tail follows pending reply", () => {
    expect(screen).toMatch(/turns\.map\(\(turn, i\) => \(\s*<Fragment key=\{i\}>\s*<ChatModeLine previousPersona=\{turns\[i - 1\]\?\.persona\} persona=\{turn\.persona\} \/>\s*\{turn\.crisisNotice \? null : \(/);
    const transcript = screen.slice(screen.indexOf('testID="chat-transcript"'));
    const tail = '<ChatModeLine previousPersona={turns[turns.length - 1]?.persona} persona={rev2Persona} />';
    expect(transcript).toContain(tail);
    expect(transcript.indexOf(tail)).toBeGreaterThan(transcript.indexOf("{sending ? ("));
    expect(transcript.indexOf(tail)).toBeLessThan(transcript.indexOf("</ScrollView>"));
    expect(screen.match(/<ChatModeLine /g)).toHaveLength(2);
  });

  test("choosing or clearing a mode never inserts a transcript message", () => {
    const select = nodes(ts.isFunctionDeclaration).find(node => node.name?.text === "selectRev2Persona");
    expect(select?.getText(source)).toContain("setRev2Persona(id)");
    expect(select?.getText(source)).not.toContain("setTurns");
    expect(screen).toContain("setTurns([]);");
    expect(line).toContain("const nextPersona = modeSwitchPersona(previousPersona, persona);");
    expect(line).toContain("if (nextPersona === null) return null;");
  });

  test("model history stays role/text only and excludes synthetic and red turns", () => {
    const history = nodes(ts.isPropertyAssignment).find(node => node.name.getText(source) === "history");
    expect(history).toBeDefined();
    const js = ts.transpileModule(`const result = ${history!.initializer.getText(source)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const project = new Function("earlier", `${js}\nreturn result;`) as (turns: ChatTurn[]) => unknown;
    const turns = [...pair("meta"), reply("twi", { synthetic: true }), user("twi"), reply("twi", { safetyZone: "red", crisisNotice: true })];
    const expected = [{ role: "user", text: "My question" }, { role: "assistant", text: "The answer" }, { role: "user", text: "My question" }];
    expect(project(turns)).toEqual(expected);
    expect(project(turns.map(({ persona: _persona, ...turn }) => turn))).toEqual(expected);
  });

  test("wiki and automatic saving still consume the same text, without mode markup", () => {
    const turns = pair("meta");
    const body = (items: ChatTurn[]) => composeExchangeBody({ prompt: findPrompt(items, 1), reply: items[1].text, speaker: "HustleK" }, "en");
    expect(body(turns)).toBe(body(turns.map(({ persona: _persona, ...turn }) => turn)));
    expect(screen).toContain('const speaker = t("title");');
    expect(screen).toContain("composeExchangeBody({ prompt, reply: reply.text, speaker }, locale)");
    expect(screen).toContain("rawMd: exchangeMarkdown(topic, body)");
    expect(screen).toContain("(signal) => keepExchange(idx, signal)");
  });
});

describe("a quiet line in both themes", () => {
  test("only an existing, localized mode name is spoken, with no visible text", () => {
    expect(line).toContain('useTranslation("secondb")');
    expect(line).toContain('accessible accessibilityRole="text"');
    expect(line).toContain('accessibilityLabel={t(`rev2.${nextPersona}.lensName`)}');
    expect(line).not.toMatch(/<Text|accessibilityLiveRegion|announceForAccessibility/);
    for (const locale of ["ko", "en", "es", "pt", "id"]) {
      const bundle = JSON.parse(read(`locales/${locale}/secondb.json`));
      for (const persona of ["secondb", "meta", "twi"]) expect(bundle.rev2[persona].lensName).toEqual(expect.any(String));
    }
  });

  test("PhoneView keeps a token-colored thin border visible inside and outside the phone", () => {
    expect(line).toContain('import { PhoneView as View } from "@/components/phone/PhoneUIKit"');
    expect(line).toContain("style={styles.line}");
    expect(line).toContain("borderTopWidth: StyleSheet.hairlineWidth");
    expect(line).toContain("borderTopColor: semantic.textSubtle");
    expect(line).toContain("marginVertical: spacing.sm");
    expect(line).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    const styleSource = line.slice(line.indexOf("const styles = StyleSheet.create("));
    const js = ts.transpileModule(styleSource, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const styles = new Function("StyleSheet", "semantic", "spacing", `${js}\nreturn styles;`)(
      { create: (value: unknown) => value, hairlineWidth: 0.5 }, semantic, spacing,
    ) as { line: { borderTopWidth: number; borderTopColor: string; marginVertical: number } };
    const standalone = styles.line;
    expect(standalone.borderTopWidth).toBe(0.5);
    expect(standalone.borderTopColor).not.toBe(semantic.background);
    expect(phoneStyle(standalone)).toEqual({ ...standalone, borderTopColor: phoneIos.separator });
    expect(phoneIos.separator).not.toBe(phoneIos.cell);
    expect(phoneIos.separator).not.toBe(phoneIos.grouped);
  });
});
