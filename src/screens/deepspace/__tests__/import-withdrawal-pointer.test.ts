import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import ts from "typescript";

import { buildProposals, proposalsToMarkdown, type ImportOutcome } from "@/lib/import/proposals";
import enDeepspace from "../../../../locales/en/deepspace.json";
import koDeepspace from "../../../../locales/ko/deepspace.json";

// 철회가 "일부만 지워졌다" 를 실패로 세지 않아서, 남은 행을 가리키는 유일한
// 포인터를 버린다.
//
// 두 화면이 **같은 불변식을 각자 적어 두고** 있다:
//
//   dds-import-inbox-screens.tsx
//     "On delete failure keep the entry and surface an error so the withdrawal
//      can be retried - never drop the only pointer to rows that still exist."
//
//   ImportHubScreen.tsx
//     "The history entry is the only pointer to those rows, so if the delete
//      fails we must KEEP it and surface an error - dropping it would strand the
//      imported rows as unrevokable while telling the user they were withdrawn
//      (the exact false-assurance this screen exists to prevent)."
//
// ⚠ 둘 다 **"delete fails"** 에만 걸려 있다. `deleteSourcesByIds` 는 요청한 것보다
// 적게 지워도 **던지지 않는다** - 지운 개수를 돌려줄 뿐이고, 그 수를 두 화면 모두
// 버린다. 그래서 다섯 중 셋만 지워져도 catch 에 안 걸리고 기록 항목이 삭제된다.
// 남은 둘은 서버에 있는데 가리키는 것이 사라진다 - 화면 주석이 "이 화면이 막으려고
// 존재하는 바로 그 거짓 확신" 이라고 부르는 상태다.
//
// ⚠ 짧은 개수만으로 "남아 있다" 를 단정할 수는 없다. 이미 지워진 id 였을 수도 있다.
// 그래서 고침은 개수로 판정하지 않고, **개수가 짧을 때만 남았는지 되읽는다.**
// 정상 경로에는 질의가 늘지 않는다.
//
// 화면을 렌더하지 않고 실제 핸들러 선언을 AST 로 떼어 inert 컨텍스트에서 돌린다.
const SCREENS = {
  deepspace: {
    file: "src/screens/deepspace/dds-import-inbox-screens.tsx",
    fn: "revokeImport",
    kind: "function",
  },
  hub: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "removeHistory",
    kind: "arrow",
  },
  hubRatify: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "ratify",
    kind: "arrow",
  },
  hubRender: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "renderHub",
    kind: "function",
  },
} as const;

function extract(which: keyof typeof SCREENS, context: Record<string, unknown>) {
  const spec = SCREENS[which];
  const source = fs.readFileSync(path.join(process.cwd(), spec.file), "utf8");
  const ast = ts.createSourceFile(spec.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text = "";
  const visit = (node: ts.Node): void => {
    if (spec.kind === "function" && ts.isFunctionDeclaration(node) && node.name?.text === spec.fn) {
      text = `${node.getText(ast)}\nconst run = ${spec.fn};`;
    }
    if (spec.kind === "arrow" && ts.isVariableDeclaration(node)
      && node.name.getText(ast) === spec.fn && node.initializer) {
      text = `const run = (${node.initializer.getText(ast)});`;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!text) throw new Error(`${spec.fn} 선언을 찾지 못했다`);
  // TSX 로 읽어야 renderHub 같은 JSX 본문도 뗄 수 있다. JSX 는 React.createElement
  // 호출이 되고, 그 React 는 context 가 준다.
  const js = ts.transpileModule(text, {
    fileName: "handler.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as
    (arg: unknown) => Promise<void>;
}

/**
 * 누구의 행인지는 화면이 import 하는 실제 판정 함수가 정한다 - 하네스가 다시 쓰지 않는다.
 * 부를 때 불러오므로, 이 판정을 부르지 않는 핸들러 본문도 같은 하네스로 돈다.
 */
function ownership(name: "withoutSharedSourceIds" | "createdSourceIds") {
  return (...args: unknown[]) =>
    (require("../../../lib/import/history-ownership") as Record<string, (...a: unknown[]) => unknown>)[name](
      ...args,
    );
}

const ENTRY = { id: "entry-1", sourceIds: ["s1", "s2", "s3", "s4", "s5"] };

interface Options {
  deleted?: number;
  surviving?: string[];
  deleteThrows?: boolean;
}

function harness(which: keyof typeof SCREENS, options: Options = {}) {
  const calls = { removedHistory: [] as string[], errors: [] as unknown[], surviveQueries: 0 };
  const context: Record<string, unknown> = {
    userId: "user-a", ko: true,
    history: [ENTRY],
    setRevokeErr: (value: unknown) => { if (value !== null) calls.errors.push(value); },
    setHistErr: (value: unknown) => { if (value !== null) calls.errors.push(value); },
    setHistory: () => undefined,
    reactExpression: () => undefined,
    t: (key: string) => key,
    deleteSourcesByIds: async (_id: string, ids: string[]) => {
      if (options.deleteThrows) throw new Error("network");
      return options.deleted ?? ids.length;
    },
    findSurvivingSourceIds: async () => {
      calls.surviveQueries += 1;
      return options.surviving ?? [];
    },
    removeImportHistory: async (_userId: string, id: string) => { calls.removedHistory.push(id); },
    getImportHistory: async () => [],
    withoutSharedSourceIds: ownership("withoutSharedSourceIds"),
  };
  return { run: extract(which, context), calls };
}

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회", (which) => {
  const arg = which === "hub" ? ENTRY.id : ENTRY;

  test("전부 지워지면 기록 항목도 지운다", async () => {
    const screen = harness(which, { deleted: 5 });
    await screen.run(arg);
    expect(screen.calls.removedHistory).toEqual([ENTRY.id]);
    expect(screen.calls.errors).toEqual([]);
  });

  test("일부만 지워졌는데 남은 것이 있으면 기록 항목을 지우지 않는다", async () => {
    // 다섯 중 셋만 지워졌고 되읽어 보니 둘이 남아 있다. 여기서 항목을 지우면
    // 그 둘을 가리키는 것이 사라진다 - 화면이 막으려고 존재하는 상태다.
    const screen = harness(which, { deleted: 3, surviving: ["s4", "s5"] });
    await screen.run(arg);
    expect(screen.calls.removedHistory).toEqual([]);
    expect(screen.calls.errors.length).toBeGreaterThan(0);
  });

  test("개수가 짧아도 남은 것이 없으면 지운다 - 이미 지워진 id 를 실패로 세지 않는다", async () => {
    const screen = harness(which, { deleted: 3, surviving: [] });
    await screen.run(arg);
    expect(screen.calls.removedHistory).toEqual([ENTRY.id]);
    expect(screen.calls.errors).toEqual([]);
  });

  test("정상 경로에는 되읽기 질의가 늘지 않는다", async () => {
    const screen = harness(which, { deleted: 5 });
    await screen.run(arg);
    expect(screen.calls.surviveQueries).toBe(0);
  });

  test("던져진 실패는 지금까지처럼 항목을 남기고 알린다", async () => {
    const screen = harness(which, { deleteThrows: true });
    await screen.run(arg);
    expect(screen.calls.removedHistory).toEqual([]);
    expect(screen.calls.errors.length).toBeGreaterThan(0);
  });
});

test("두 화면이 같은 불변식을 각자 적어 두고 있다", () => {
  // 이 검사가 지키는 것이 그 불변식이다. 문구가 사라지면 다음 사람이 이 회차의
  // 이유를 잃는다.
  const deepspace = fs.readFileSync(path.join(process.cwd(), SCREENS.deepspace.file), "utf8");
  const hub = fs.readFileSync(path.join(process.cwd(), SCREENS.hub.file), "utf8");
  expect(deepspace).toContain("never drop the only pointer to rows that still exist");
  expect(hub).toContain("the only pointer to those rows");
});

// ── 한 행을 두 항목이 가리킬 때 (r29 §3-6) ───────────────────────────────────
//
// 재현 근거: vibe r260919 r29 §3-6 (E:/Coding Infra/reports/vibe-r260919/r29-fix1814e/result.md).
//
// 이력 로그(import.history:<uid>)는 두 화면이 함께 쓴다. 둘 다 로그 전체를 그리고
// 어느 항목이든 철회할 수 있다. 허브는 비준할 때 정확 중복으로 돌아온 기존 행 R 을
// 두 번째 항목에도 적었다(capture 는 그때 새 행도 원문도 쓰지 않는다). 그 두 번째
// 항목을 철회하면 첫 가져오기가 만든 R 이 지워지고, 첫 항목은 없는 행을 가리킨 채
// 남는다. 나중에 첫 항목을 철회하면 지운 수 0 · 남은 행 0 이라 조용히 성공한다.
//
// 아래 판은 행 원장(sources)과 공유 로그를 함께 들고, 허브의 실제 ratify 와 두 화면의
// 실제 철회 핸들러를 그 위에서 돌린다.

type Entry = {
  id: string;
  sourceKey: string;
  name: string;
  atIso: string;
  summary: string;
  sourceIds: string[];
};

const entry = (id: string, sourceIds: string[]): Entry => ({
  id,
  sourceKey: "notion",
  name: "Notion · Obsidian",
  atIso: "2026-09-20T00:00:00.000Z",
  summary: "",
  sourceIds,
});

const NOTES = "# 첫 노트\n본문 하나\n\n# 둘째 노트\n본문 둘";

/** 가계부 반영을 싣는 제안 하나. 허브는 제안의 ledgerEntry 를 보고 거래를 적는다. */
function financeOutcome(): ImportOutcome {
  return {
    proposals: [
      {
        id: "fin-0",
        label: "2026-09-01 카페 4,500원",
        sub: "지출 → 재정 원장",
        sensitive: true,
        ledgerEntry: { occurredOn: "2026-09-01", kind: "expense", amountKrw: 4500, label: "카페" },
      },
    ],
    summary: { appointments: 0, places: 0, events: 0, health: 0, notes: 0, watches: 0, transactions: 1, raw: 0 },
  };
}

function world(options: { rows?: string[]; log?: Entry[]; outcome?: ImportOutcome } = {}) {
  const rows = new Map<string, string>((options.rows ?? []).map((id) => [id, `body of ${id}`]));
  const outcome = options.outcome ?? buildProposals("markdown", NOTES);
  const state = {
    log: [...(options.log ?? [])],
    errors: [] as unknown[],
    deleteAsked: [] as string[],
    alreadyImported: [] as unknown[],
    readFails: false,
  };
  let created = 0;
  const note = (value: unknown) => {
    if (value !== null && value !== false) state.errors.push(value);
  };
  const withdrawal = (screenHistory: Entry[]): Record<string, unknown> => ({
    userId: "user-a",
    ko: true,
    history: screenHistory,
    setRevokeErr: note,
    setHistErr: note,
    setHistory: () => undefined,
    reactExpression: () => undefined,
    t: (key: string) => key,
    deleteSourcesByIds: async (_userId: string, ids: string[]) => {
      state.deleteAsked.push(...ids);
      let removed = 0;
      for (const id of ids) if (rows.delete(id)) removed += 1;
      return removed;
    },
    findSurvivingSourceIds: async (_userId: string, ids: string[]) => ids.filter((id) => rows.has(id)),
    removeImportHistory: async (_userId: string, id: string) => {
      state.log = state.log.filter((e) => e.id !== id);
    },
    getImportHistory: async () => {
      // 네이티브의 암호화 저장소는 읽기 실패를 빈 목록과 구분해서 던진다(history.ts).
      if (state.readFails) throw new Error("import_history_invalid");
      return state.log.map((e) => ({ ...e, sourceIds: [...e.sourceIds] }));
    },
    withoutSharedSourceIds: ownership("withoutSharedSourceIds"),
  });

  /** 화면 목록의 항목 하나에서 철회를 누른다. 화면 목록은 따로 주지 않으면 지금 로그다. */
  const revoke = async (which: "deepspace" | "hub", id: string, screenHistory: Entry[] = state.log) => {
    const target = screenHistory.find((e) => e.id === id);
    if (!target) throw new Error(`화면 목록에 ${id} 가 없다`);
    await extract(which, withdrawal(screenHistory))(which === "hub" ? id : target);
  };

  /** 허브에서 같은 파일 · 같은 선택으로 '고른 N건 기록에 반영' 을 누른다. */
  const ratify = async () => {
    const tile = { key: "notion", nameKo: "Notion · Obsidian", nameEn: "Notion · Obsidian", tier: "normal", minorLocked: false };
    await extract("hubRatify", {
      active: tile,
      outcome,
      selected: new Set(outcome.proposals.map((p) => p.id)),
      outcomeKind: null,
      MINOR_LOCKED_KINDS: new Set(),
      userId: "user-a",
      isMinor: false,
      busy: false,
      ko: true,
      progression: { tier: "free" },
      name: (s: typeof tile) => s.nameKo,
      t: (key: string) => key,
      proposalsToMarkdown,
      // capture.ts 의 정확 중복 계약: 본문이 같으면 새 행도 원문도 쓰지 않고 기존 행을 돌려준다.
      captureFromMarkdown: async ({ rawMd }: { rawMd: string }) => {
        for (const [id, body] of rows) {
          if (body === rawMd) return { source: { id, title: "import" }, deduped: "exact_duplicate" };
        }
        created += 1;
        const id = `row-${created}`;
        rows.set(id, rawMd);
        return { source: { id, title: "import" }, deduped: null };
      },
      captureEvent: () => undefined,
      proposalDecided: () => ({}),
      ratifyLedgerEntries: async (_userId: string, chosen: unknown[]) => ({ inserted: chosen.length, failed: 0 }),
      addImportHistory: async (_userId: string, e: Entry) => {
        state.log = [e, ...state.log];
      },
      recordImportConsent: () => undefined,
      enqueueAutoReasoningSource: () => undefined,
      upsertKakaoRelationPeople: async () => undefined,
      reactExpression: () => undefined,
      setImportErr: note,
      setBusy: () => undefined,
      setLedgerWarn: () => undefined,
      setActive: () => undefined,
      setOutcome: () => undefined,
      setOutcomeKind: () => undefined,
      setStep: () => undefined,
      setAlreadyImported: (value: unknown) => state.alreadyImported.push(value),
      createdSourceIds: ownership("createdSourceIds"),
    })(undefined);
  };

  return { rows, state, revoke, ratify };
}

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 한 행을 두 항목이 가리킬 때", (which) => {
  test("옛 허브 항목 E2=[R] 을 철회해도 E1 이 만든 R 은 남고 E2 만 빠진다", async () => {
    const w = world({ rows: ["r"], log: [entry("e2", ["r"]), entry("e1", ["r"])] });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.deleteAsked).not.toContain("r");
    expect(w.state.log.map((e) => e.id)).toEqual(["e1"]);
    expect(w.state.errors).toEqual([]);
  });

  test("마지막으로 가리키던 항목을 철회하면 그때 지운다", async () => {
    const w = world({ rows: ["r"], log: [entry("e2", ["r"]), entry("e1", ["r"])] });
    await w.revoke(which, "e2");
    await w.revoke(which, "e1");
    expect(w.rows.has("r")).toBe(false);
    expect(w.state.log).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("공유가 없으면 지금까지처럼 그 항목의 행을 모두 지운다", async () => {
    const w = world({ rows: ["a", "b1", "b2"], log: [entry("e2", ["b1", "b2"]), entry("e1", ["a"])] });
    await w.revoke(which, "e2");
    expect([...w.rows.keys()]).toEqual(["a"]);
    expect(w.state.log.map((e) => e.id)).toEqual(["e1"]);
    expect(w.state.errors).toEqual([]);
  });

  test("공유 행은 남기고, 이미 없어진 자기 행은 실패로 세지 않는다", async () => {
    // 개수가 짧을 때의 되읽기는 지우려던 행만 묻는다. 남기기로 한 R 까지 물으면 R 이
    // '남아 있다' 로 나와서 멀쩡한 철회가 실패로 끝난다.
    const w = world({ rows: ["r"], log: [entry("e2", ["r", "s"]), entry("e1", ["r"])] });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.log.map((e) => e.id)).toEqual(["e1"]);
    expect(w.state.errors).toEqual([]);
  });

  test("판정은 화면이 들고 있던 목록이 아니라 방금 읽은 로그로 한다", async () => {
    // e1 은 다른 화면(또는 탭)에서 이미 철회됐는데 이 화면의 목록에는 아직 있다. 낡은
    // 목록으로 판정하면 R 을 'e1 의 것' 으로 남기고 e2 까지 빼서, 아무도 가리키지 않는
    // 행이 된다. 화면 주석이 막겠다고 한 거짓 확신이다.
    const w = world({ rows: ["r"], log: [entry("e2", ["r"])] });
    await w.revoke(which, "e2", [entry("e2", ["r"]), entry("e1", ["r"])]);
    expect(w.rows.has("r")).toBe(false);
    expect(w.state.log).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("로그를 못 읽으면 아무것도 지우지 않고 항목을 남긴 채 알린다", async () => {
    const w = world({ rows: ["r"], log: [entry("e2", ["r"]), entry("e1", ["r"])] });
    w.state.readFails = true;
    await w.revoke(which, "e2");
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.log.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(w.state.errors.length).toBeGreaterThan(0);
  });
});

describe("가져오기 허브 - 같은 파일 · 같은 선택을 두 번 비준하면", () => {
  beforeEach(() => {
    // 항목 id 는 Date.now() 다. 두 비준이 같은 밀리초에 끝나면 id 가 겹쳐 철회가 둘을
    // 함께 빼므로 시계를 한 칸씩 민다.
    let clock = Date.UTC(2026, 8, 20);
    jest.spyOn(Date, "now").mockImplementation(() => ++clock);
  });
  afterEach(() => jest.restoreAllMocks());

  test("두 번째 비준의 항목을 철회해도 첫 가져오기의 행은 남는다 (r29 재현 순서)", async () => {
    const w = world();
    await w.ratify();
    const [first] = w.state.log;
    const [row] = first.sourceIds;
    await w.ratify();
    // 두 번째 비준이 남긴 항목이 있으면 그것을 철회한다. 고치기 전에는 E2=[R] 이 생겼다.
    for (const later of w.state.log.filter((e) => e.id !== first.id)) await w.revoke("hub", later.id);
    expect(w.rows.has(row)).toBe(true);
    expect(w.state.log.find((e) => e.id === first.id)?.sourceIds).toEqual([row]);
    expect(w.state.errors).toEqual([]);
  });

  test("두 번째 비준은 행 id 를 적지 않고, 새로 담은 것이 없다고 알린다", async () => {
    const w = world();
    await w.ratify();
    await w.ratify();
    expect(w.state.log).toHaveLength(1);
    // 알림 값은 고른 건수다. 허브는 고른 것을 노트 하나로 묶어 담으므로, 1 이라고 하면
    // 고른 것 가운데 하나만 겹친 것처럼 읽힌다.
    expect(w.state.alreadyImported).toEqual([0, 2]);
  });

  test("정확 중복이어도 거래를 새로 적었으면 이력 줄은 남기되 그 행 id 는 적지 않는다", async () => {
    // 가계부 반영이 통째로 실패하면 화면은 '같은 파일을 다시 가져오면 반영돼요' 라고
    // 안내한다. 그 재가져오기는 노트가 정확 중복이어도 거래를 새로 적는다. 줄이 없으면
    // 안내를 따른 결과가 어디에도 안 보인다.
    const w = world({ outcome: financeOutcome() });
    await w.ratify();
    const [first] = w.state.log;
    await w.ratify();
    const [second] = w.state.log;
    expect(w.state.log).toHaveLength(2);
    expect(second.sourceIds).toEqual([]);
    expect(second.summary).toContain("txns 1");
    expect(w.state.alreadyImported).toEqual([0, 0]);
    await w.revoke("hub", second.id);
    expect(w.rows.has(first.sourceIds[0])).toBe(true);
    expect(w.state.errors).toEqual([]);
  });

  test("알림은 허브 첫 화면에 파일 가져오기의 결과 줄 문구로 그려지고, 0 이면 그리지 않는다", async () => {
    // 렌더 테스트는 막혀 있어(RN 0.85) 실제 renderHub 선언을 떼어, JSX 를 평범한 객체로
    // 만드는 React 대역 위에서 돌린다. 문구는 앱과 같은 옵션으로 띄운 i18next 가 실제
    // 로케일 번들에서 찾는다. 기대값도 같은 인스턴스로 만든다 - 문구 원문을 여기 박으면
    // 문구를 고칠 때마다 이 테스트가 깨진다. ko 로는 "0개를 정리함에 담았어요 · 중복 2개".
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "en",
      resources: { ko: { deepspace: koDeepspace }, en: { deepspace: enDeepspace } },
      ns: ["deepspace"],
      defaultNS: "common",
      interpolation: { escapeValue: false },
      compatibilityJSON: "v3",
    });
    type Node = { children: unknown[] };
    const React = {
      Fragment: "Fragment",
      createElement: (type: unknown, props: unknown, ...children: unknown[]): Node & { type: unknown; props: unknown } => ({
        type,
        props,
        children,
      }),
    };
    const texts = (value: unknown, out: string[] = []): string[] => {
      if (typeof value === "string") out.push(value);
      else if (Array.isArray(value)) for (const v of value) texts(v, out);
      else if (value && typeof value === "object" && "children" in value) texts((value as Node).children, out);
      return out;
    };
    const hub = (alreadyImported: number) =>
      texts(
        (extract("hubRender", {
          React,
          i18n,
          alreadyImported,
          ledgerWarn: null,
          SOURCES: [],
          TIER_COLOR: {},
          styles: {},
          t: (key: string) => key,
          View: "View",
          Text: "Text",
          OpsState: "OpsState",
        }) as unknown as () => unknown)(),
      );

    const line = (n: number) =>
      `${i18n.t("deepspace:ds.import.resultAdded", { count: 0 })} · ` +
      i18n.t("deepspace:ds.import.resultDuplicate", { count: n });
    // 키가 번들에 없으면 줄이 키 이름 그대로 그려진다.
    for (const key of ["deepspace:ds.import.resultAdded", "deepspace:ds.import.resultDuplicate"]) {
      expect(i18n.exists(key)).toBe(true);
    }

    expect(hub(2)).toContain(line(2));
    await i18n.changeLanguage("en");
    expect(hub(12)).toContain(line(12));
    const added = i18n.t("deepspace:ds.import.resultAdded", { count: 0 });
    expect(hub(0).filter((text) => text.includes(added))).toEqual([]);
  });
});
