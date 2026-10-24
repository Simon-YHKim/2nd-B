// Execute the screen's own callbacks without mounting the RN 0.85 renderer.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canRetryFailedTurn, createChatSendLock, retryableMessage } from "@/lib/chat/retry-failed";
import { classifyInputAnyLocale } from "@/lib/safety/classifier";
import { parseSourceCitations } from "@/lib/chat/sources";
import { parseTwiBranches } from "@/lib/chat/twi-branches";
import { kstDateToday } from "@/lib/chat/limits";
import type { ChatTurn } from "@/lib/chat/session-types";
import { beginTurnAttempt, createTurnResultState, finishTurnFailure, receiveTurnCrisis, receiveTurnReceipt, selectTurnResult, startTurnReservation } from "@/lib/chat/turn-result-state";
import type { SendMessageOk } from "@/lib/chat/conversation";

export type Line = ChatTurn & { pairId?: string };
export const screenSource = readFileSync(resolve(__dirname, "../../secondb.tsx"), "utf8");
const ast = ts.createSourceFile("secondb.tsx", screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
export function screenCallback(name: string): string {
  let result = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      result = (node.initializer as ts.CallExpression).arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!result) throw new Error(`missing_callback:${name}`);
  return result;
}
export function executeCallback<T>(name: string, scope: Record<string, unknown>): T {
  return runInNewContext(ts.transpileModule(`(${screenCallback(name)})`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, scope) as T;
}

/** Dependencies are either the real live chain or controlled completion stubs.
 * State setters are synchronous to inspect ordering before a React render. */
export function createScreenHarness(turns: Line[], dependencies: Record<string, unknown>) {
  const events: string[] = [];
  const scope: Record<string, any> = {
    userId: "owner-a", locale: "en", isMinor: false, progression: { tier: "free" },
    rev2Persona: "secondb", chatMode: "analytic", limit: 5, allowance: 5,
    conversationId: { current: 0 }, chatMounted: { current: true }, pairSequence: { current: 0 },
    liveTurnRef: { current: null }, sendLock: { current: createChatSendLock() },
    usedTodayRef: { current: null }, usageRevision: { current: 0 },
    turns, turnsRef: { current: turns }, sending: false, underLimit: true,
    setSending: jest.fn((value: boolean) => { events.push(`sending:${value}`); scope.sending = value; }),
    setSendingPersona: jest.fn(),
    setTurns: (update: (previous: Line[]) => Line[]) => {
      const next = update(turns);
      turns.splice(0, turns.length, ...next);
      events.push("turns");
    },
    setUsedToday: jest.fn((value: number | null) => {
      events.push(`usage:${value}`);
      scope.underLimit = value === null || value < scope.allowance;
    }),
    setAdBonusToday: jest.fn(),
    setLimitRefused: jest.fn(), setPendingUpgrade: jest.fn(),
    rewardedAllowedRef: { current: false }, setChatRewardVisible: jest.fn(),
    captureEvent: jest.fn(), secondBSession: (event: unknown) => event,
    currentDisplayName: () => "Alex", rev2PersonaHint: (id: string) => id,
    holdExpression: () => jest.fn(), reactExpression: jest.fn(),
    replyCueAllowed: () => false, isRecordingAudioMode: () => false, playReplyCue: jest.fn(),
    classifyInputAnyLocale, publishCrisisNotice: jest.fn(), parseSourceCitations, parseTwiBranches,
    kstDateToday, canRetryFailedTurn, retryableMessage,
    consentT: (key: string) => key, t: (key: string) => key,
    console: { warn: jest.fn() }, ...dependencies,
  };
  scope.applyUsedToday = jest.fn(executeCallback<(value: number | null) => void>("applyUsedToday", scope));
  const send = executeCallback<(message: string, retry?: { failedIndex: number }) => boolean>("handleSend", scope);
  scope.handleSend = send;
  const retry = executeCallback<(index: number) => void>("retryFailed", scope);
  return { scope, events, send, retry };
}

export class ControlledConsentError extends Error { code = "consent_required"; }

/** Presentation regressions control the engine completion, not its network. */
export function createControlledSender(turns: Line[]) {
  type Result = Record<string, any>;
  let settle!: { resolve: (value: Result) => void; reject: (error: Error) => void };
  const calls: Result[] = [];
  const createLiveChatTurn = (options: Result) => {
    let state = createTurnResultState<SendMessageOk>({ ownerId: options.owner.ownerId, ownerEpoch: options.owner.epoch,
      conversationId: options.conversationId, pairId: options.pairId }, options.message);
    return {
      read: () => state,
      retireRetry: () => { state = { ...state, retryClosed: true }; },
      run: async (input: Result) => {
        calls.push(input);
        state = beginTurnAttempt(state, kstDateToday(), { vendor: "xai", reservationSupported: false });
        const ticket = state.attempts.at(-1)!.ticket;
        try {
          const result = await new Promise<Result>((resolve, reject) => { settle = { resolve, reject }; });
          if (typeof result.used === "number") {
            const receipt = { count: result.used, turnId: null };
            state = receiveTurnReceipt(startTurnReservation(state, ticket), ticket, receipt);
            options.onReceipt?.(receipt);
          }
          if (result.status === "blocked") {
            state = finishTurnFailure(state, ticket, "limit");
            return { status: "blocked", result };
          }
          if (result.reply.safety?.zone === "red") {
            state = receiveTurnCrisis(state, ticket);
            options.onCrisisDetected(result.reply.safety.crisisRouting?.hotline);
            return { status: "crisis", result: result.reply };
          }
          state = selectTurnResult(state, ticket, result as SendMessageOk);
          return { status: "selected", result };
        } catch (error) {
          state = finishTurnFailure(state, ticket, error instanceof ControlledConsentError ? "consent" : undefined);
          throw error;
        }
      },
    };
  };
  const sendChatMessage = jest.fn((input: Result, live: ReturnType<typeof createLiveChatTurn>) => live.run(input));
  const chat = createScreenHarness(turns, { createLiveChatTurn, sendLiveChatMessage: sendChatMessage,
    captureAccountOwnerLease: () => ({ ownerId: "owner-a", epoch: 1, isCurrent: () => true }),
    LlmConsentError: ControlledConsentError,
  });
  return { ...chat, calls, sendChatMessage,
    async answer(result: Result | Error) {
      if (result instanceof Error) settle.reject(result); else settle.resolve(result);
      for (let i = 0; i < 10 && chat.scope.sending; i++) await new Promise<void>(resolve => setImmediate(resolve));
      expect(chat.scope.sending).toBe(false);
    },
  };
}
