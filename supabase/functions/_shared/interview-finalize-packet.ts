// Dormant S2a leaf. No endpoint, RPC, storage, activation or provenance inference.
import { parseStrictJson } from './request-json.ts';
import { interviewAnswerLabel, storedTurns, storyTitle } from '../../../src/lib/interview/saved-story.ts';

export const INTERVIEW_FINALIZE_PACKET_MAX_BYTES = 256 * 1024;
export const INTERVIEW_FINALIZE_MAX_TURNS = 4000;
export const INTERVIEW_FINALIZE_MAX_TEXT_CODE_POINTS = 8000;
const PREFIX = 'T16-FINALIZE-PACKET/1\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODS = ['infancy', 'school', 'twenties', 'later', 'work', 'now'] as const;
const LAYERS = ['fact', 'feeling', 'meaning', 'belief', 'echo'] as const;
const UI_LANGUAGES = ['ko', 'en', 'es', 'pt', 'id'] as const;
const ASK_KINDS = ['seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback'] as const;
const USER_STATES = ['judged', 'unsettled', 'local_block', 'control'] as const;
type Period = typeof PERIODS[number];
type Layer = typeof LAYERS[number];
type UiLanguage = typeof UI_LANGUAGES[number];
type AskKind = typeof ASK_KINDS[number];
type UserState = typeof USER_STATES[number];

export interface InterviewFinalizeTurn {
  readonly n: number;
  readonly scene: number;
  readonly role: 'interviewer' | 'user';
  readonly text: string;
  readonly layer: Layer | null;
  readonly origin: 'model' | 'fixed' | 'user';
  readonly askKind: AskKind | null;
  readonly openerUnedited: boolean | null;
  readonly state: UserState | null;
}
export interface InterviewFinalizePacket {
  readonly v: 1;
  readonly intent: Readonly<{
    requestId: string;
    sessionId: string;
    draftId: string;
    revision: number;
    contentGeneration: string;
  }>;
  readonly ruleSet: 'r0' | 'r1-q5';
  readonly period: Period;
  readonly conversationLocale: 'ko' | 'en';
  readonly uiLanguage: UiLanguage;
  readonly growthOrigin: boolean;
  readonly turns: readonly InterviewFinalizeTurn[];
}
export type InterviewFinalizePacketErrorCode = 'invalid_packet' | 'packet_too_large' | 'unsupported_provenance';
export class InterviewFinalizePacketError extends Error {
  constructor(readonly code: InterviewFinalizePacketErrorCode) { super(code); this.name = 'InterviewFinalizePacketError'; }
}
function fail(code: InterviewFinalizePacketErrorCode = 'invalid_packet'): never {
  throw new InterviewFinalizePacketError(code);
}
const encoder = new TextEncoder();

// Own data properties only: a programmatic caller cannot cause getters to run
// while validation/canonicalization selects fields. Raw HTTP JSON uses decode().
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of names) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) fail();
    result[key] = property.value;
  }
  return result;
}
function arrayValues(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail();
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 1 || length > INTERVIEW_FINALIZE_MAX_TURNS) fail();
  if (Reflect.ownKeys(value).length !== length + 1) fail();
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const property = Object.getOwnPropertyDescriptor(value, String(i));
    if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) fail();
    result.push(property.value);
  }
  return result;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) fail();
  return value as T;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail();
  return value.toLowerCase();
}
function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) fail();
  return value;
}
function text(value: unknown, maxCodePoints = INTERVIEW_FINALIZE_MAX_TEXT_CODE_POINTS): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxCodePoints * 2) fail();
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) fail(); // PostgreSQL text/JSON cannot retain NUL.
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
    } else if (code >= 0xdc00 && code <= 0xdfff) fail();
    if (++count > maxCodePoints) fail();
  }
  return value;
}
function parse(value: unknown): InterviewFinalizePacket {
  const root = fields(value, ['v', 'intent', 'ruleSet', 'period', 'conversationLocale', 'uiLanguage', 'growthOrigin', 'turns']);
  if (root.v !== 1 || typeof root.growthOrigin !== 'boolean') fail();
  const rawIntent = fields(root.intent, ['requestId', 'sessionId', 'draftId', 'revision', 'contentGeneration']);
  const intent = Object.freeze({
    requestId: uuid(rawIntent.requestId), sessionId: uuid(rawIntent.sessionId), draftId: uuid(rawIntent.draftId),
    revision: integer(rawIntent.revision, Number.MAX_SAFE_INTEGER), contentGeneration: uuid(rawIntent.contentGeneration),
  });
  const uiLanguage = oneOf(root.uiLanguage, UI_LANGUAGES);
  const conversationLocale = oneOf(root.conversationLocale, ['ko', 'en'] as const);
  if (conversationLocale !== (uiLanguage === 'ko' ? 'ko' : 'en')) fail();
  let previousScene = 0;
  let textBytes = 0;
  const turns = arrayValues(root.turns).map((raw, index): InterviewFinalizeTurn => {
    // Explicit provenance is required; no legacy answered flag can supply it.
    if (raw && typeof raw === 'object' && !Object.getOwnPropertyDescriptor(raw, 'origin')) fail('unsupported_provenance');
    const turn = fields(raw, ['n', 'scene', 'role', 'text', 'layer', 'origin', 'askKind', 'openerUnedited', 'state']);
    const n = integer(turn.n, INTERVIEW_FINALIZE_MAX_TURNS);
    const scene = integer(turn.scene, 10000);
    if (n !== index + 1 || scene < previousScene) fail();
    previousScene = scene;
    const role = oneOf(turn.role, ['interviewer', 'user'] as const);
    const body = text(turn.text);
    textBytes += encoder.encode(body).length;
    if (textBytes > INTERVIEW_FINALIZE_PACKET_MAX_BYTES) fail('packet_too_large');
    const layer = turn.layer === null ? null : oneOf(turn.layer, LAYERS);
    const origin = oneOf(turn.origin, ['model', 'fixed', 'user'] as const);
    const askKind = turn.askKind === null ? null : oneOf(turn.askKind, ASK_KINDS);
    const state = turn.state === null ? null : oneOf(turn.state, USER_STATES);
    if (!(turn.openerUnedited === null || typeof turn.openerUnedited === 'boolean')) fail();
    if (role === 'interviewer' && (origin === 'user' || state !== null || turn.openerUnedited !== null)) fail();
    if (role === 'user' && (origin !== 'user' || askKind !== null || state === null)) fail();
    return Object.freeze({ n, scene, role, text: body, layer, origin, askKind, openerUnedited: turn.openerUnedited, state });
  });
  // Select exactly what the existing save stores. Validate the entire input first;
  // provenance/size checks are not bypassed by appending an unanswered question.
  const retained = Object.freeze(storedTurns(turns));
  if (retained.length === 0) fail();
  const packet: InterviewFinalizePacket = Object.freeze({ v: 1, intent,
    ruleSet: oneOf(root.ruleSet, ['r0', 'r1-q5'] as const), period: oneOf(root.period, PERIODS),
    conversationLocale, uiLanguage, growthOrigin: root.growthOrigin, turns: retained });
  if (encoder.encode(JSON.stringify({ ...packet, turns })).length > INTERVIEW_FINALIZE_PACKET_MAX_BYTES) fail('packet_too_large');
  return packet;
}

/** Structured input is revalidated and copied; no caller-owned object is retained. */
export function parseInterviewFinalizePacket(value: unknown): InterviewFinalizePacket {
  try { return parse(value); } catch (error) {
    if (error instanceof InterviewFinalizePacketError) throw error;
    throw new InterviewFinalizePacketError('invalid_packet');
  }
}
/** HTTP adapters must bound the stream before decoding; this also bounds raw JSON. */
export function decodeInterviewFinalizePacket(raw: unknown): InterviewFinalizePacket {
  if (typeof raw !== 'string') fail();
  if (raw.length > INTERVIEW_FINALIZE_PACKET_MAX_BYTES || encoder.encode(raw).length > INTERVIEW_FINALIZE_PACKET_MAX_BYTES) fail('packet_too_large');
  try { return parseInterviewFinalizePacket(parseStrictJson(raw, 4)); } catch (error) {
    if (error instanceof InterviewFinalizePacketError) throw error;
    throw new InterviewFinalizePacketError('invalid_packet');
  }
}

type Scalar = string | number | boolean | null;
function frame(value: Scalar): string {
  if (value === null) return 'N;';
  if (typeof value === 'boolean') return value ? 'T;' : 'F;';
  if (typeof value === 'number') return `I${value};`;
  return `S${encoder.encode(value).length}:${value};`;
}
/** Owner must come from verified Auth, never the client packet. The DB still
 * checks that owner/work/generation/request/rule tuple and recomputes this digest. */
export function canonicalInterviewFinalizePacket(value: unknown, verifiedOwnerId: string): string {
  const packet = parseInterviewFinalizePacket(value);
  const owner = uuid(verifiedOwnerId);
  const i = packet.intent;
  const values: Scalar[] = [owner, i.requestId, i.sessionId, i.draftId, i.revision, i.contentGeneration,
    packet.ruleSet, packet.period, packet.conversationLocale, packet.uiLanguage, packet.growthOrigin, packet.turns.length];
  for (const turn of packet.turns) values.push(turn.n, turn.scene, turn.role, turn.layer,
    turn.origin, turn.askKind, turn.openerUnedited, turn.state, turn.text);
  const canonical = PREFIX + values.map(frame).join('');
  if (encoder.encode(canonical).length > INTERVIEW_FINALIZE_PACKET_MAX_BYTES) fail('packet_too_large');
  return canonical;
}
export async function digestInterviewFinalizePacket(value: unknown, verifiedOwnerId: string): Promise<string> {
  // Capture all bytes before the asynchronous digest; later caller edits cannot
  // change the original intent. A hash is a binding, never a commit receipt.
  const bytes = encoder.encode(canonicalInterviewFinalizePacket(value, verifiedOwnerId));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
/** starName is resolved by the service from the approved period/UI catalog. The
 * packet deliberately has no client title, marker, coverage or safe flag. */
export function renderInterviewFinalizeRecord(value: unknown, serverStarName: string): Readonly<{ body: string; summary: string }> {
  const packet = parseInterviewFinalizePacket(value);
  const starName = text(serverStarName, 100);
  const qLabel = packet.conversationLocale === 'ko' ? '질문' : 'Q';
  return Object.freeze({
    body: packet.turns.map(turn => `${turn.role === 'interviewer' ? qLabel : interviewAnswerLabel(turn.openerUnedited === true, packet.conversationLocale)}: ${turn.text}`).join('\n\n'),
    summary: storyTitle(starName, packet.turns.filter(turn => turn.role === 'user').map(turn => turn.text)),
  });
}
