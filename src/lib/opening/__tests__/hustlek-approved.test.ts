import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("../../../../assets/opening/hustlek-approved-261002/sounds/grass-a.wav", () => 1);
jest.mock("../../../../assets/opening/hustlek-approved-261002/sounds/grass-b.wav", () => 2);
jest.mock("../../../../assets/opening/hustlek-approved-261002/sounds/ratchet.wav", () => 3);
jest.mock("../../../../assets/opening/hustlek-approved-261002/sounds/ping.wav", () => 4);

import {
  APPROVED_OPENING_ASSETS,
  APPROVED_OPENING_CONFIG,
  APPROVED_OPENING_DURATION_MS,
  APPROVED_OPENING_IMAGE_SOURCES,
  APPROVED_OPENING_SEQUENCE,
  APPROVED_OPENING_SETTINGS,
  cameraAt,
  getApprovedOpeningCues,
  getApprovedOpeningFrame,
  getApprovedOpeningScene,
  twinkleAt,
  viewportLayout,
} from "../hustlek-approved";

const assetsRoot = resolve(__dirname, "../../../../assets/opening/hustlek-approved-261002");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pingStart = 8469.523809523811;
const panStart = 5006.666666666667;
const panEnd = 8149.523809523811;

describe("approved HustleK opening", () => {
  test("preserves all source bytes and the submitted JSON", () => {
    const manifest = JSON.parse(readFileSync(resolve(assetsRoot, "manifest.json"), "utf8"));
    expect(manifest.assets.filter((asset: { role: string }) => asset.role === "image")).toHaveLength(22);
    expect(manifest.assets.filter((asset: { role: string }) => asset.role === "audio")).toHaveLength(4);
    for (const asset of manifest.assets) {
      const bytes = readFileSync(resolve(assetsRoot, asset.file));
      expect(bytes.length).toBe(asset.bytes);
      expect(sha256(bytes)).toBe(asset.sha256);
    }
    const submitted = readFileSync(resolve(assetsRoot, "approved-settings.json"));
    expect(sha256(submitted)).toBe("9d66ce82c7e2e2842592ccabd6a9f07171d9763fed1294acd8a37d98bf968ced");
    expect(APPROVED_OPENING_SETTINGS).toEqual(JSON.parse(submitted.toString("utf8")));
    expect(APPROVED_OPENING_SETTINGS.actionSettings.walk).toMatchObject({ speed: 1.6, volume: 0.2 });
    expect(APPROVED_OPENING_SETTINGS.actionSettings.adjust).toMatchObject({ speed: 3, volume: 0.2 });
    expect(APPROVED_OPENING_SETTINGS.actionSettings.pan.speed).toBe(0.7);
    expect(APPROVED_OPENING_SETTINGS.actionSettings.ping).toMatchObject({ speed: 2, volume: 0.1 });
  });

  test("preloads the complete image catalog and retains the unused turn pose", () => {
    expect(APPROVED_OPENING_IMAGE_SOURCES).toHaveLength(22);
    expect(Object.keys(APPROVED_OPENING_ASSETS.frames)).toHaveLength(17);
    expect(APPROVED_OPENING_ASSETS.frames["turn-2"]).toBeDefined();
    expect(APPROVED_OPENING_SEQUENCE.some(item => item.frameId === "turn-2")).toBe(false);
    expect(APPROVED_OPENING_ASSETS.sounds).toEqual({ grassA: 1, grassB: 2, ratchet: 3, ping: 4 });
    expect(APPROVED_OPENING_ASSETS.audio).toEqual(APPROVED_OPENING_ASSETS.sounds);
  });

  test("applies action speed once while retaining the raw frame durations", () => {
    expect(APPROVED_OPENING_SEQUENCE).toHaveLength(40);
    expect(APPROVED_OPENING_DURATION_MS).toBeCloseTo(10119.523809523811, 8);
    expect(APPROVED_OPENING_SEQUENCE.reduce((sum, item) => sum + item.rawDurationMs, 0)).toBeCloseTo(11980, 8);
    expect(APPROVED_OPENING_SEQUENCE[0].durationMs).toBeCloseTo(166.66666666666666 / 1.6, 8);
    const stages = [
      [0, "walk", "walk-03"],
      [2500, "turn", "turn-1"],
      [2740, "adjust", "adjust-1"],
      [3166.666666666667, "observe", "observe-1"],
      [4606.666666666667, "contact", "observe-3"],
      [panStart, "pan", "observe-3"],
      [panEnd, "center", "observe-3"],
      [pingStart, "ping", "observe-3"],
      [8919.523809523811, "end", "observe-3"],
    ] as const;
    for (const [time, stage, frameId] of stages) {
      expect(getApprovedOpeningFrame(time)).toMatchObject({ stage, frameId, finished: false });
    }
    expect(getApprovedOpeningFrame(APPROVED_OPENING_DURATION_MS)).toMatchObject({ frameId: "observe-3", stage: "end", finished: true });
    expect(getApprovedOpeningFrame(-1).frameId).toBe("walk-03");
    expect(() => getApprovedOpeningFrame(NaN)).toThrow();
  });

  test("starts entirely outside and arrives without stretching the source pose", () => {
    const first = getApprovedOpeningScene(0, 320, 692);
    expect(first.character).toMatchObject({ left: -176, top: 428, width: 160, height: 224, zIndex: 3 });
    expect(first.character.left + first.character.width).toBeLessThan(0);
    expect(first.background).toMatchObject({ left: -704, top: -800, width: 1024, height: 1536 });
    const arrived = getApprovedOpeningScene(2500, 320, 692);
    expect(arrived.character.left).toBe(80);
    expect(arrived.telescope).toMatchObject({ left: 64, top: 396, width: 256, height: 256, zIndex: 2 });
    const contact = getApprovedOpeningScene(4606.666666666667, 320, 692);
    expect(contact.frame.width).toBe(480);
    expect(contact.character.width / contact.character.height).toBeCloseTo(480 / 560, 12);
  });

  // Simon localhost QA 2026-10-04: the character box widened at adjust-3 -> observe-1
  // before the new image was drawn, so adjust-3 showed 1.2x wide for one frame on
  // web and Android. The slot must never change size; contain + top-left inside it
  // must land exactly on each frame's own box.
  test.each([[320, 692], [390, 844], [412, 915], [1920, 1080]])("keeps one character slot size at %i×%i so a frame swap cannot stretch the old frame", (width, height) => {
    const sizes = new Set<string>();
    for (let time = 0; time <= APPROVED_OPENING_DURATION_MS; time += 5) {
      const scene = getApprovedOpeningScene(time, width, height), slot = scene.characterSlot, own = scene.character;
      sizes.add(`${slot.width}x${slot.height}`);
      const fit = Math.min(slot.width / scene.frame.width, slot.height / scene.frame.height);
      expect([slot.left, slot.top, slot.source, slot.zIndex]).toEqual([own.left, own.top, own.source, own.zIndex]);
      expect(scene.frame.width * fit).toBeCloseTo(own.width, 9);
      expect(scene.frame.height * fit).toBeCloseTo(own.height, 9);
    }
    expect(sizes.size).toBe(1);
    expect(new Set(APPROVED_OPENING_CONFIG.frames.map(frame => frame.width))).toEqual(new Set([400, 480]));
  });

  test("matches the approved cubic camera path and 4px snap", () => {
    expect(cameraAt(panStart)).toEqual({ x: 704, y: 800 });
    expect(cameraAt(panEnd)).toEqual({ x: 704, y: 40 });
    expect(cameraAt((panStart + panEnd) / 2)).toEqual({ x: 704, y: 420 });
    expect(cameraAt(panStart + (panEnd - panStart) / 4)).toEqual({ x: 704, y: 752 });
    for (let time = panStart; time <= panEnd; time += 17) expect(cameraAt(time).y % 4).toBe(0);
  });

  test.each([[320, 692], [390, 844], [360, 800], [375, 667], [412, 915], [430, 932], [280, 653], [768, 1024], [1024, 768], [844, 390], [800, 360], [1280, 720], [1920, 1080], [2560, 1080]])("covers %i×%i and centers the final star", (width, height) => {
    for (const time of [0, 1000, 2500, 4607, panStart, (panStart + panEnd) / 2, panEnd, pingStart + 200, APPROVED_OPENING_DURATION_MS]) {
      const scene = getApprovedOpeningScene(time, width, height);
      expect(scene.background.left).toBeLessThanOrEqual(1e-7);
      expect(scene.background.top).toBeLessThanOrEqual(1e-7);
      expect(scene.background.left + scene.background.width).toBeGreaterThanOrEqual(width - 1e-7);
      expect(scene.background.top + scene.background.height).toBeGreaterThanOrEqual(height - 1e-7);
      expect(scene.character.width / scene.character.height).toBeCloseTo(scene.frame.width / scene.frame.height, 12);
    }
    const end = getApprovedOpeningScene(APPROVED_OPENING_DURATION_MS, width, height);
    expect(end.star.left + end.star.width / 2).toBeCloseTo(width / 2, 10);
    expect(end.star.top + end.star.height / 2).toBeCloseTo(height / 2, 10);
    expect(getApprovedOpeningScene(0, width, height).character.left + getApprovedOpeningScene(0, width, height).character.width).toBeLessThan(0);
  });

  test("shows two pixel flashes, fixed star centers, and restores the original star", () => {
    expect(twinkleAt(pingStart - 1)).toEqual([]);
    expect(twinkleAt(pingStart)).toHaveLength(3);
    expect(twinkleAt(pingStart + 90)).toEqual([]);
    expect(twinkleAt(pingStart + 200)).toHaveLength(7);
    expect(twinkleAt(pingStart + 450)).toEqual([]);
    for (const relative of [0, 50, 100, 180, 200, 240, 300, 449, 450]) {
      const scene = getApprovedOpeningScene(pingStart + relative, 320, 692);
      expect(scene.star.left + scene.star.width / 2).toBe(160);
      expect(scene.star.top + scene.star.height / 2).toBe(346);
      for (const rect of scene.twinkle.rects) {
        for (const value of [rect.left, rect.top, rect.width, rect.height]) expect(value % 4).toBe(0);
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.top).toBeGreaterThanOrEqual(0);
      }
    }
    expect(getApprovedOpeningScene(pingStart + 450, 320, 692).star.width).toBe(24);
  });

  test("uses regular contact cues, silent backwards seeking, and no delayed cue flood", () => {
    const grass = APPROVED_OPENING_CONFIG.cues.filter(cue => cue.sourceId === "grass");
    grass.forEach((cue, index) => expect(cue.atMs).toBeCloseTo(index * 312.5, 8));
    expect(grass.map(cue => cue.variantIndex)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(getApprovedOpeningCues(-1e-8, 0)).toMatchObject([{ sourceId: "grass", variantId: "grass-a", volume: 0.2 }]);
    expect(getApprovedOpeningCues(0, 0)).toEqual([]);
    expect(getApprovedOpeningCues(100, 0)).toEqual([]);
    expect(getApprovedOpeningCues(0, 312.5)).toMatchObject([{ sourceId: "grass", variantId: "grass-a", variantIndex: 0, atMs: 312.5 }]);
    expect(getApprovedOpeningCues(0, 2400)).toHaveLength(1);
    const delayed = getApprovedOpeningCues(-1e-8, APPROVED_OPENING_DURATION_MS);
    expect(delayed.map(cue => cue.sourceId)).toEqual(["grass", "ratchet", "ping"]);
    expect(delayed.find(cue => cue.sourceId === "ping")).toMatchObject({ atMs: pingStart, volume: 0.1 });
    expect(APPROVED_OPENING_CONFIG.cues.filter(cue => cue.sourceId === "ratchet")).toHaveLength(6);
    expect(getApprovedOpeningCues(pingStart, pingStart + 1)).toEqual([]);
  });

  // Simon Q-261005-05 = A (2026-10-05): every walking step plays grass-a. The approved manifest
  // keeps its a/b record (checked above); only the cues handed to playback change.
  test("plays grass-a on every walking step while the approved manifest keeps a/b", () => {
    const steps: { variantId: string; variantIndex: number; atMs: number; key: string }[] = [];
    let from = -1e-8;
    for (const cue of APPROVED_OPENING_CONFIG.cues.filter(c => c.sourceId === "grass")) {
      steps.push(...getApprovedOpeningCues(from, cue.atMs).filter(c => c.sourceId === "grass"));
      from = cue.atMs;
    }
    expect(steps).toHaveLength(8);
    expect(steps.map(step => [step.variantId, step.variantIndex])).toEqual(Array.from({ length: 8 }, () => ["grass-a", 0]));
    expect(new Set(steps.map(step => step.key)).size).toBe(8);
    expect(APPROVED_OPENING_CONFIG.cues.filter(c => c.sourceId === "grass").map(c => c.variantId)).toContain("grass-b");
    // Ratchet and ping pass through untouched.
    const others = getApprovedOpeningCues(-1e-8, APPROVED_OPENING_DURATION_MS).filter(c => c.sourceId !== "grass");
    const lastRatchet = APPROVED_OPENING_CONFIG.cues.filter(c => c.sourceId === "ratchet").slice(-1)[0];
    const ping = APPROVED_OPENING_CONFIG.cues.filter(c => c.sourceId === "ping")[0];
    expect(others).toEqual([lastRatchet, ping]);
  });

  test("rejects invalid screen sizes", () => {
    for (const [width, height] of [[0, 692], [320, -1], [Infinity, 692], [320, NaN]]) expect(() => viewportLayout(width, height)).toThrow();
  });
});
