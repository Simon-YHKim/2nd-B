import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

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
  const js = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as
    (arg: unknown) => Promise<void>;
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
