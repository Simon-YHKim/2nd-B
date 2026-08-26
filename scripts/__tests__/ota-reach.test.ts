// "Published successfully" and "reached a device" are different facts, and
// until 2026-08-24 nothing in this repo distinguished them.
//
// The real case, with the real hashes: eas.json was edited so native would stop
// routing every AI call at Gemini, an OTA was published to carry that fix to the
// already-released APK, and it reached nothing. eas.json is itself a fingerprint
// source (`eas fingerprint:compare` names it, reason "easBuild"), so editing it
// changes the runtimeVersion — which means the edit that made the update
// necessary is the same edit that put every existing build out of reach.
//
// The publish still exits 0 and prints a dashboard link. That is why this has to
// be checked rather than noticed.

import { channelOf, reachOf, render, runtimeOf } from "../check-ota-reach";

const build = (
  appBuildVersion: number,
  channel: string,
  runtimeVersion: string,
  status = "FINISHED",
  buildProfile = channel,
) => ({ appVersion: "0.2.0", appBuildVersion, channel, runtimeVersion, status, buildProfile });

// The three Android builds that mattered on the day, with their real fingerprints.
const RELEASED_APK = build(25, "preview", "fffe35e2eec54ecf93a0539525d580b5eea033de");
const NEW_AAB = build(26, "production", "b5688832ccf270e56ee859f24fd6b2cf985144a1");
const ALPHA_V20 = build(20, "production", "c1e1f6e844de10e5d82197caebbf3f17c91974e5");
const PUBLISHED_RV = "b5688832ccf270e56ee859f24fd6b2cf985144a1";

describe("the day it reached nothing", () => {
  test("an update published to preview does not reach the preview build on another runtime", () => {
    const r = reachOf(PUBLISHED_RV, "preview", [RELEASED_APK, NEW_AAB, ALPHA_V20]);
    expect(r.verdict).toBe("reaches-nothing");
    expect(r.reached).toEqual([]);
  });

  test("and it names the build it stranded, so the gap is not left to be inferred", () => {
    const r = reachOf(PUBLISHED_RV, "preview", [RELEASED_APK, NEW_AAB, ALPHA_V20]);
    expect(r.stranded).toHaveLength(1);
    expect(r.stranded[0]).toContain("build 25");
  });

  test("the report says so in words, not just in a field", () => {
    const out = render(reachOf(PUBLISHED_RV, "preview", [RELEASED_APK]), PUBLISHED_RV, "preview");
    expect(out).toContain("NOTHING");
    expect(out).toContain("no device can pick it up");
    // The next person needs the cause, not just the symptom.
    expect(out).toContain("eas.json is itself a fingerprint source");
    expect(out).toContain("fingerprint:compare");
  });
});

describe("it does not cry wolf", () => {
  test("a matching build is a plain success", () => {
    const r = reachOf(PUBLISHED_RV, "production", [NEW_AAB, ALPHA_V20]);
    expect(r.verdict).toBe("reaches");
    expect(r.reached[0]).toContain("build 26");
  });

  test("publishing before any build exists on the channel is not a failure", () => {
    // Update-then-build is a legitimate order. Calling it "reached nothing"
    // would make the warning meaningless within a week.
    const r = reachOf(PUBLISHED_RV, "development", [RELEASED_APK, NEW_AAB]);
    expect(r.verdict).toBe("no-builds");
    expect(r.stranded).toEqual([]);
    expect(render(r, PUBLISHED_RV, "development")).toContain("Nothing is stranded");
  });

  test("an errored build is not stranded, because it never reached a device", () => {
    const dead = build(18, "production", "94359bee7475761ae1a02b5f4c8f7364e2073716", "ERRORED");
    const r = reachOf(PUBLISHED_RV, "production", [NEW_AAB, dead]);
    expect(r.stranded).toEqual([]);
    expect(r.verdict).toBe("reaches");
  });

  test("builds on other channels are none of this channel's business", () => {
    // preview and production are separate populations. Counting the other
    // channel's builds as stranded would report a problem that does not exist.
    const r = reachOf(PUBLISHED_RV, "production", [NEW_AAB, RELEASED_APK]);
    expect(r.stranded).toEqual([]);
    expect(r.reached).toHaveLength(1);
  });
});

describe("it survives the shapes the CLI actually returns", () => {
  test("an empty build list reads as no-builds, not as a false all-clear", () => {
    const r = reachOf(PUBLISHED_RV, "preview", []);
    expect(r.verdict).toBe("no-builds");
  });

  test("a build with no runtimeVersion never counts as a match", () => {
    // A null must not compare equal to anything. If it did, one malformed row
    // would report full reach and re-hide the whole problem.
    const partial = { appBuildVersion: 9, channel: "preview", status: "FINISHED" };
    const r = reachOf(PUBLISHED_RV, "preview", [partial as never]);
    expect(r.reached).toEqual([]);
    // ⚠ 2026-08-26 에 여기가 `reaches-nothing` 이었다. 그 판정은 **틀렸는데
    //   확신에 차 있어서** 더 나빴다 — 읽지 못한 것을 "안 맞는다" 로 단정한다.
    //   `reached` 가 비어야 한다는 이 검사의 원래 의도는 위 줄에 그대로 있다.
    expect(r.verdict).toBe("unknown");
  });

  test("a build missing its version still gets described rather than dropped", () => {
    const r = reachOf(PUBLISHED_RV, "preview", [
      { id: "abc-123", channel: "preview", status: "FINISHED", runtimeVersion: "0".repeat(40) } as never,
    ]);
    expect(r.stranded[0]).toContain("abc-123");
  });
});

// ── 픽스처가 현실과 같은 모양인가 (2026-08-26) ────────────────────
//
// ⚠ 이 파일은 **초록불인 채 두 번 틀렸다.** 둘 다 같은 원인이다 —
//   픽스처를 **지어냈기 때문**이다.
//
//   1차: 위의 `build()` 헬퍼가 `channel: string` 을 낸다. eas-cli 22.x 는
//         `updateChannel: { id, name }` 을 낸다. 채널 필터가 항상 빈 배열을 냈다.
//
//   2차: 1차를 고치면서 만든 `REAL_CLI_BUILD` 가 **하이브리드**였다 —
//         22.x 의 `updateChannel` 과 21.x 의 `runtimeVersion` 을 한 객체에 섞었다.
//         그 조합은 **어느 버전에도 없다.** 그래서 검사는 초록인데 CI 는
//         방금 때린 v0.4.0 빌드를 "좌초" 로 찍었다.
//
//   그래서 이제 지어내지 않는다. 아래 둘은 **같은 빌드(33)를 두 버전으로
//   조회해 그대로 옮긴 값**이다. 다시 보려면:
//
//     npx eas-cli@21.0.2 build:list --platform android --limit 1 --json --non-interactive
//     npx eas-cli@22.4.0 build:list --platform android --limit 1 --json --non-interactive
describe("실제 eas-cli 출력 모양 — 두 버전", () => {
  // eas-cli 21.0.2 (로컬 devDependency 가 깔아 주는 버전)
  const V21 = {
    status: "FINISHED",
    channel: "preview",
    buildProfile: "preview",
    appVersion: "0.4.0",
    appBuildVersion: "33",
    runtimeVersion: "c28067519b5576eaa29279c7e3b4ce9707623812",
    fingerprint: {
      id: "01a03c85-4b56-784f-9f10-a1e3414bf47a",
      hash: "c28067519b5576eaa29279c7e3b4ce9707623812",
    },
  };

  // eas-cli 22.4.0 — **CI 가 실제로 받는 버전**.
  // 워크플로우가 `npx eas-cli` 로 부르므로 버전이 고정돼 있지 않다.
  const V22 = {
    status: "FINISHED",
    updateChannel: { id: "019ef866-55fc-719b-bfea-dfa91ee86bf4", name: "preview" },
    buildProfile: "preview",
    appVersion: "0.4.0",
    appBuildVersion: "33",
    runtime: {
      id: "01a03c85-4b50-7fbb-863d-e092a924342f",
      version: "c28067519b5576eaa29279c7e3b4ce9707623812",
    },
    fingerprint: {
      id: "01a03c85-4b56-784f-9f10-a1e3414bf47a",
      hash: "c28067519b5576eaa29279c7e3b4ce9707623812",
    },
  };

  const RV = "c28067519b5576eaa29279c7e3b4ce9707623812";

  test("두 버전은 서로 없는 필드를 쓴다 — 이게 이 파일의 요점이다", () => {
    // 하이브리드 픽스처를 다시 지어내면 여기서 빨간불이 된다.
    expect((V21 as Record<string, unknown>).updateChannel).toBeUndefined();
    expect((V21 as Record<string, unknown>).runtime).toBeUndefined();
    expect((V22 as Record<string, unknown>).channel).toBeUndefined();
    expect((V22 as Record<string, unknown>).runtimeVersion).toBeUndefined();
  });

  test.each([
    ["21.0.2", V21],
    ["22.4.0", V22],
  ])("%s 모양에서 채널과 런타임을 둘 다 읽는다", (_v, b) => {
    expect(channelOf(b as never)).toBe("preview");
    expect(runtimeOf(b as never)).toBe(RV);
  });

  test.each([
    ["21.0.2", V21],
    ["22.4.0", V22],
  ])("%s 모양에서 도달을 옳게 판정한다", (_v, b) => {
    const r = reachOf(RV, "preview", [b] as never);
    expect(r.verdict).toBe("reaches");
    expect(r.reached).toHaveLength(1);
    expect(r.stranded).toHaveLength(0);
  });

  test.each([
    ["21.0.2", V21],
    ["22.4.0", V22],
  ])("%s 모양에서 좌초도 옳게 판정한다", (_v, b) => {
    const r = reachOf("0".repeat(40), "preview", [b] as never);
    expect(r.verdict).toBe("reaches-nothing");
    expect(r.stranded).toHaveLength(1);
  });
});

// ── 모르는 것을 아는 척 하지 않는다 ─────────────────────────────
//
// 2026-08-26 사고의 진짜 모양은 이것이었다: 채널은 읽혔는데 런타임을
// 못 읽어서 **모든 빌드가 좌초로** 보고됐다. 그건 틀린 답이 아니라
// **틀렸는데 확신에 차 있는** 답이라 더 나쁘다 — 그 보고를 믿고
// 빌드를 다시 뜨게 된다.
describe("런타임을 못 읽으면 좌초가 아니라 판단 불가다", () => {
  const UNKNOWN_SHAPE = {
    status: "FINISHED",
    updateChannel: { name: "preview" },
    buildProfile: "preview",
    appVersion: "9.9.9",
    appBuildVersion: "99",
    // 다음 버전이 또 개명한 자리. runtimeVersion·runtime·fingerprint 셋 다 없다.
    runtimeDigest: { value: "ffffffffffffffffffffffffffffffffffffffff" },
  };

  test("좌초 목록에 넣지 않는다", () => {
    const r = reachOf("c2806751", "preview", [UNKNOWN_SHAPE] as never);
    expect(r.stranded).toHaveLength(0);
  });

  test("판정은 reaches-nothing 이 아니라 unknown 이다", () => {
    const r = reachOf("c2806751", "preview", [UNKNOWN_SHAPE] as never);
    expect(r.verdict).toBe("unknown");
    expect(r.unreadable).toHaveLength(1);
  });

  test("보고문이 모른다고 말한다 — 아무것도 못 받는다고 하지 않는다", () => {
    const r = reachOf("c2806751", "preview", [UNKNOWN_SHAPE] as never);
    const text = render(r, "c2806751", "preview");
    expect(text).toContain("UNKNOWN");
    expect(text).not.toContain("NOTHING");
    // 사람이 뭐를 고쳐야 하는지까지 적혀 있어야 한다.
    expect(text).toContain("runtimeOf()");
  });

  test("읽힐 때는 여전히 평소대로 판정한다 — 과잉 발동 금지", () => {
    const ok = { status: "FINISHED", channel: "preview", runtimeVersion: "b".repeat(40) };
    const r = reachOf("a".repeat(40), "preview", [ok] as never);
    expect(r.verdict).toBe("reaches-nothing");
    expect(r.unreadable).toHaveLength(0);
  });
});
