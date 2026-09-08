import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  pendingStatus,
  addToPendingList,
  normalizePendingList,
  addPendingCapture,
  loadPendingCaptures,
  drainPendingCaptures,
  clearPendingCaptures,
  countPendingCaptures,
  PREAUTH_PENDING_CAP,
  PREAUTH_PENDING_NEAR,
  PREAUTH_PENDING_MAX_CHARS,
  type PendingCapture,
} from "../preauth-pending";

function item(i: number): PendingCapture {
  return { localId: `p_${i}`, text: `line ${i}`, capturedAt: "2026-06-21T00:00:00.000Z" };
}

describe("pendingStatus (D-17 honest capacity)", () => {
  test("empty queue: room to spare, not near/full", () => {
    expect(pendingStatus(0)).toEqual({
      count: 0,
      cap: PREAUTH_PENDING_CAP,
      remaining: PREAUTH_PENDING_CAP,
      nearFull: false,
      full: false,
    });
  });

  test("near threshold flips nearFull (drives the 'almost full' copy)", () => {
    expect(pendingStatus(PREAUTH_PENDING_NEAR - 1).nearFull).toBe(false);
    expect(pendingStatus(PREAUTH_PENDING_NEAR).nearFull).toBe(true);
    expect(pendingStatus(PREAUTH_PENDING_NEAR).full).toBe(false);
  });

  test("at the cap the queue is full with zero remaining", () => {
    const s = pendingStatus(PREAUTH_PENDING_CAP);
    expect(s.full).toBe(true);
    expect(s.remaining).toBe(0);
  });

  test("clamps negative / fractional counts", () => {
    expect(pendingStatus(-5).count).toBe(0);
    expect(pendingStatus(3.7).count).toBe(3);
  });
});

describe("addToPendingList (pure core)", () => {
  test("appends a trimmed plaintext item", () => {
    const r = addToPendingList([], "  hello  ", "2026-06-21T00:00:00.000Z", "p_x");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item).toEqual({ localId: "p_x", text: "hello", capturedAt: "2026-06-21T00:00:00.000Z" });
      expect(r.list).toHaveLength(1);
      expect(r.status.count).toBe(1);
    }
  });

  test("refuses empty / whitespace-only without dropping anything", () => {
    const r = addToPendingList([item(1)], "   ", "now", "p_y");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
    expect(r.list).toHaveLength(1);
  });

  test("refuses an over-long item (storage-ceiling guard)", () => {
    const big = "x".repeat(PREAUTH_PENDING_MAX_CHARS + 1);
    const r = addToPendingList([], big, "now", "p_z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_long");
  });

  test("refuses once full instead of silently dropping (honest, not punitive)", () => {
    const full = Array.from({ length: PREAUTH_PENDING_CAP }, (_, i) => item(i));
    const r = addToPendingList(full, "one more", "now", "p_over");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("full");
      expect(r.status.full).toBe(true);
    }
    expect(r.list).toHaveLength(PREAUTH_PENDING_CAP);
  });
});

describe("normalizePendingList", () => {
  test("drops malformed entries and non-arrays", () => {
    expect(normalizePendingList(null)).toEqual([]);
    expect(normalizePendingList("nope")).toEqual([]);
    expect(
      normalizePendingList([item(1), { localId: "x" }, { text: "", localId: "y", capturedAt: "z" }, item(2)]),
    ).toHaveLength(2);
  });

  test("hard-caps a tampered oversized array", () => {
    const many = Array.from({ length: PREAUTH_PENDING_CAP + 20 }, (_, i) => item(i));
    expect(normalizePendingList(many)).toHaveLength(PREAUTH_PENDING_CAP);
  });
});

describe("storage round-trip (add / load / drain)", () => {
  beforeEach(async () => {
    await clearPendingCaptures();
  });

  test("persists a capture, loads it back, then drains to empty", async () => {
    if (typeof localStorage === "undefined") return; // node env without storage: skip
    const r = await addPendingCapture("first line", "2026-06-21T01:00:00.000Z");
    expect(r.ok).toBe(true);
    const loaded = await loadPendingCaptures();
    expect(loaded.map((i) => i.text)).toEqual(["first line"]);
    const drained = await drainPendingCaptures();
    expect(drained).toHaveLength(1);
    expect(await countPendingCaptures()).toBe(0);
  });
});

// ── 홈 라우트가 이 배수구를 붙들고 있는가 ───────────────────────────────
//
// 2026-09-08 에 홈 라우트가 22줄 래퍼가 됐다. 얇아 보이는 파일은 "정리" 대상이
// 되기 쉬운데, 그 안의 `useImportPendingCaptures()` 한 줄이 **계정 만들기 전에
// 담아둔 것들을 계정으로 옮기는 유일한 자리**다. 지우면 예외도 안 나고 화면도
// 안 죽고, 가입 전에 적어둔 글만 기기에 남는다.
//
// 부르는 곳이 여기 하나뿐이라 이 핀이 없으면 아무도 안 운다(실측: 정의 파일과
// 라우트 밖 참조 0건).
describe("가입 전에 담은 것을 계정으로 옮기는 자리", () => {
  const read = (rel: string): string =>
    readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

  it("홈 라우트가 배수구를 마운트한다", () => {
    const route = read("src/app/index.tsx");
    expect(route).toContain("useImportPendingCaptures();");
    expect(route).toContain('import { useImportPendingCaptures } from "@/lib/capture/use-import-pending";');
  });

  it("배수구는 로그인과 프로필이 갖춰진 뒤에만 돈다", () => {
    // C10 - 나이를 모르는 채로 기록을 만들지 않는다.
    const hook = read("src/lib/capture/use-import-pending.ts");
    expect(hook).toContain("if (!userId || hasProfile !== true) return;");
    expect(hook).toContain("minor: ctx.minor");
    // 한 번만 - 세션마다 다시 붓지 않는다.
    expect(hook).toContain("if (ran.current) return;");
  });
});
