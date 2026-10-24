// Execute source declarations and real hook lifetimes without a native renderer.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { hookHarness } from "../../nav/__tests__/hook-harness";
import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { monthBucket, weekBucket, type ReasoningUsage } from "../../entitlements/usage";

const mockRead = jest.fn();
let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual<typeof import("react")>("react").useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
  },
}));
jest.mock("@/lib/entitlements/reasoning-usage-read", () => ({
  readReasoningUsageStrict: (...args: unknown[]) => mockRead(...args),
}));

export const snapshot = (used = 0, rewardCredits = 0, rewardEarned = 0): ReasoningUsage =>
  ({ used, rewardCredits, rewardEarned, weekBucket: weekBucket(), monthBucket: monthBucket() });

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

export function sourceFile(path: string) {
  const source = readFileSync(resolve(__dirname, "../../../..", path), "utf8").replace(/\r\n/g, "\n");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = (marker: string) => {
    const found: string[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isVariableStatement(node) || ts.isFunctionDeclaration(node) || ts.isExpressionStatement(node)) {
        const text = node.getText(ast);
        if (text.includes(marker)) found.push(text);
      }
      node.forEachChild(walk);
    };
    walk(ast);
    if (!found.length) throw new Error(`Missing source contract: ${marker}`);
    return found.sort((a, b) => a.length - b.length)[0];
  };
  const between = (start: string, end: string) => {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`Missing source range: ${start} -> ${end}`);
    return source.slice(from, to);
  };
  return { source, statement, between };
}

export function compile<T>(source: string, dependencies: Record<string, unknown>): T {
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(dependencies), output)(...Object.values(dependencies)) as T;
}

export function usageHarness() {
  let hooks = hookHarness();
  const spies: jest.SpyInstance[] = [];
  return {
    read: mockRead,
    install() {
      const React = jest.requireActual<typeof import("react")>("react");
      for (const key of ["useState", "useRef", "useMemo", "useCallback", "useEffect"] as const) {
        spies.push(jest.spyOn(React, key).mockImplementation(((...args: unknown[]) =>
          (hooks.hooks[key] as (...values: unknown[]) => unknown)(...args)) as never));
      }
      return {
        ...React,
        // The mock focus effect above, not the native router.
        useFocusEffect: jest.requireMock("expo-router").useFocusEffect,
        ...jest.requireActual<typeof import("../use-reasoning-usage-read")>("../use-reasoning-usage-read"),
        ...jest.requireActual<typeof import("../../auth/account-epoch")>("../../auth/account-epoch"),
      };
    },
    reset() {
      jest.useFakeTimers();
      hooks = hookHarness(); mockFocused = true; mockRead.mockReset().mockResolvedValue(snapshot());
      noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
    },
    owner(owner: string | null) { beginAccountOwnerTransition(owner); noteResolvedOwner(owner); clearAccountTransition(currentAccountEpoch()); },
    focus(focused: boolean) { mockFocused = focused; },
    render<T>(fn: () => T) { return hooks.render(fn); },
    async settle<T>(fn: () => T) { let value = hooks.render(fn); for (let i = 0; i < 12; i++) { await Promise.resolve(); value = hooks.render(fn); } return value; },
    cleanup() { hooks.unmount(); jest.clearAllTimers(); jest.useRealTimers(); },
    restore() { spies.forEach((spy) => spy.mockRestore()); },
  };
}
