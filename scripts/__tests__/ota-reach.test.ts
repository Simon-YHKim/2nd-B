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

import { channelOf, reachOf, render } from "../check-ota-reach";

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
    expect(r.verdict).toBe("reaches-nothing");
  });

  test("a build missing its version still gets described rather than dropped", () => {
    const r = reachOf(PUBLISHED_RV, "preview", [
      { id: "abc-123", channel: "preview", status: "FINISHED", runtimeVersion: "0".repeat(40) } as never,
    ]);
    expect(r.stranded[0]).toContain("abc-123");
  });
});

// ── 픽스처가 현실과 같은 모양인가 (2026-08-26) ────────────────────────────
//
// ⚠ 이 파일은 **초록불인 채로 1년 가까이 틀려 있었다.** 위의 `build()` 헬퍼가
//   `channel: string` 을 가진 객체를 만드는데, `eas-cli build:list --json` 은
//   그런 필드를 내지 않는다. 실제 출력은 `updateChannel: { id, name }` 이다.
//
//   그래서 `reachOf` 의 채널 필터는 언제나 빈 배열을 냈고, 도달 보고는
//   **빌드가 몇 대가 있든** "아직 빌드가 없다" 를 찍어 왔다. 2026-08-24 사고
//   뒤에 만든 안전망이 한 번도 작동한 적이 없었던 셈이다.
//
//   픽스처는 항상 자기 코드와 동의한다 — 현실과 맞춰본 적이 없으면.
//   그래서 아래 값은 **v0.4.0 빌드 로그에서 그대로 옮긴 것**이다.
describe("실제 eas-cli 출력 모양", () => {
  // 2026-08-26 v0.4.0 릴리즈 빌드 로그에서 그대로 옮겼다
  // (GitHub Actions run 32933720629, "Get the build artifact" 스텝).
  const REAL_CLI_BUILD = {
    status: "FINISHED",
    updateChannel: { id: "019ef866-55fc-719b-bfea-dfa91ee86bf4", name: "preview" },
    buildProfile: "preview",
    appVersion: "0.4.0",
    appBuildVersion: 11,
    runtimeVersion: "c28067519b5576eaa29279c7e3b4ce9707623812",
  };

  test("채널을 updateChannel.name 에서 읽는다 — CLI 에 b.channel 은 없다", () => {
    expect(channelOf(REAL_CLI_BUILD)).toBe("preview");
    // 이 단언이 이 파일의 요점이다: 옛 코드는 여기서 undefined 를 봤다.
    expect((REAL_CLI_BUILD as Record<string, unknown>).channel).toBeUndefined();
  });

  test("실제 모양에서 도달을 옳게 판정한다", () => {
    const r = reachOf(REAL_CLI_BUILD.runtimeVersion, "preview", [REAL_CLI_BUILD] as never);
    expect(r.verdict).toBe("reaches");
    expect(r.reached).toHaveLength(1);
  });

  test("실제 모양에서 좌초도 옳게 판정한다", () => {
    const r = reachOf("0".repeat(40), "preview", [REAL_CLI_BUILD] as never);
    expect(r.verdict).toBe("reaches-nothing");
    expect(r.stranded).toHaveLength(1);
  });

  test("옛 모양(b.channel)도 계속 읽는다 — 되돌리는 게 목적이 아니다", () => {
    expect(channelOf({ channel: "preview" } as never)).toBe("preview");
  });

  test("채널을 모르는 빌드는 어느 채널에도 안 속한다", () => {
    expect(channelOf({} as never)).toBeNull();
    const r = reachOf("aaa", "preview", [{ status: "FINISHED", runtimeVersion: "aaa" }] as never);
    expect(r.verdict).toBe("no-builds");
  });
});
