// Does the OTA we just published reach anything?
//
// An `eas update` always succeeds. It says "Update group ID ...", prints a
// dashboard link, and exits 0 — whether a thousand devices pick it up or none
// can. Reach is decided by the runtimeVersion, and nothing in the publish
// output tells you which installed builds carry that runtimeVersion.
//
// On 2026-08-24 that gap cost a real fix. eas.json was edited to move native
// off Gemini, the OTA was published to carry it, and it reached nothing:
//
//     build 25 (the released v0.2.0 APK)   fingerprint fffe35e2…
//     the update published to              fingerprint b5688832…
//
// `eas fingerprint:compare` named the single differing source: eas.json.
// It is a fingerprint input (reason "easBuild"), so THE EDIT THAT MADE THE
// UPDATE NECESSARY IS THE EDIT THAT PUT IT OUT OF REACH. That is not a mistake
// anyone makes once — it is the shape of the file, and it will do the same
// thing to the next person who changes a vendor switch there.
//
// So the publish step now states its own reach. It does not fail: publishing
// ahead of a build is legitimate (an update waiting for a build that lands
// later is the normal ordering). What it must never do again is let "published
// successfully" read as "delivered".

const BUILD_LIMIT = 30;

/**
 * 한 빌드가 어느 채널에 묶여 있는가.
 *
 * ⚠ **이 함수가 없어서 이 파일은 한 번도 작동한 적이 없었다(2026-08-26 발견).**
 *
 * 전에는 `b.channel` 을 읽었는데, `eas-cli build:list --json` 은 그런 필드를
 * 내지 않는다. 실제 출력은 이렇게 생겼다(v0.4.0 빌드 로그에서 그대로 보는 값):
 *
 *     "status": "FINISHED",
 *     "updateChannel": { "id": "019ef866-…", "name": "preview" },
 *     "buildProfile": "preview",
 *     "appVersion": "0.4.0",
 *
 * 그래서 `b.channel` 은 언제나 `undefined` 였고, 채널 필터는 항상 빈 배열을 내고,
 * 판정은 항상 `no-builds` 였다 — 즉 도달 보고가 **빌드가 몇 대가 있든**
 * "아직 빌드가 없다, 아무것도 좀초되지 않았다" 를 찍어 왔다.
 *
 * 검사가 못 잡은 이유는 **픽스쳐가 코드와 같은 이름을 지어낸 탓**이다
 * (`scripts/__tests__/ota-reach.test.ts` 가 `channel` 을 가진 객체를 만들었다).
 * 픽스쳐는 항상 자기 코드와 동의한다 — 현실과 맞춰본 적이 없으면.
 */
function channelOf(b) {
  return b?.updateChannel?.name ?? b?.channel ?? null;
}

/**
 * @param {string} runtimeVersion  the runtimeVersion `eas update` reported
 * @param {string} channel         the channel it published to
 * @param {Array<object>} builds   `eas build:list --json` output
 */
function reachOf(runtimeVersion, channel, builds) {
  const onChannel = builds.filter((b) => channelOf(b) === channel);
  const reached = onChannel.filter((b) => b.runtimeVersion === runtimeVersion);

  // Stranded = installed-and-usable builds on this channel that this update
  // cannot land on. Errored builds never reached a device, so they are not
  // stranded; counting them would inflate every report.
  const stranded = onChannel.filter(
    (b) => b.runtimeVersion !== runtimeVersion && b.status === "FINISHED",
  );

  return {
    reached: reached.map(describe),
    stranded: stranded.map(describe),
    // The distinction that matters: nothing on this channel at all, versus
    // builds exist and none of them match.
    verdict:
      reached.length > 0 ? "reaches" : onChannel.length === 0 ? "no-builds" : "reaches-nothing",
  };
}

function describe(b) {
  const v = [b.appVersion, b.appBuildVersion].filter(Boolean).join(" · build ");
  return `${v || b.id} (${b.buildProfile || "?"}, ${String(b.runtimeVersion || "").slice(0, 8)}…)`;
}

function render({ reached, stranded, verdict }, runtimeVersion, channel) {
  const lines = [];
  const short = `${String(runtimeVersion).slice(0, 8)}…`;

  if (verdict === "reaches") {
    lines.push(`OTA reach: ${reached.length} installed build(s) on '${channel}' carry ${short}.`);
    for (const r of reached) lines.push(`  reaches  ${r}`);
  } else if (verdict === "no-builds") {
    lines.push(`OTA reach: no builds exist on channel '${channel}' yet.`);
    lines.push(`  This update is waiting for the first one. Nothing is stranded.`);
  } else {
    lines.push(`OTA reach: NOTHING. No build on '${channel}' carries ${short}.`);
    lines.push(`  The update published fine and no device can pick it up.`);
  }

  if (stranded.length > 0) {
    lines.push(
      `  ${stranded.length} finished build(s) on '${channel}' are on a different runtime and will NOT get this update:`,
    );
    for (const s of stranded) lines.push(`    stranded  ${s}`);
    lines.push(
      `  To find out why, run:  npx eas-cli fingerprint:compare <theirs> ${runtimeVersion}`,
    );
    lines.push(
      `  Note eas.json is itself a fingerprint source — editing it strands every prior build.`,
    );
  }

  return lines.join("\n");
}

module.exports = { reachOf, render, describe, channelOf, BUILD_LIMIT };

if (require.main === module) {
  const [, , runtimeVersion, channel] = process.argv;
  if (!runtimeVersion || !channel) {
    console.error("usage: check-ota-reach.js <runtimeVersion> <channel>  (builds JSON on stdin)");
    process.exit(2);
  }
  const raw = require("node:fs").readFileSync(0, "utf8").trim();
  let builds = [];
  try {
    builds = raw ? JSON.parse(raw) : [];
  } catch {
    // Never fail the publish over a listing we could not parse. Say so instead:
    // a silent skip here would recreate exactly the blind spot this file exists
    // to remove.
    console.log("OTA reach: could not read the build list, so reach is UNKNOWN.");
    process.exit(0);
  }
  const result = reachOf(runtimeVersion, channel, Array.isArray(builds) ? builds : []);
  console.log(render(result, runtimeVersion, channel));
  if (result.verdict === "reaches-nothing") {
    console.log(
      `::warning title=OTA reached nothing::No build on '${channel}' carries runtimeVersion ${runtimeVersion}. The update is published but undeliverable until a build with that fingerprint ships.`,
    );
  }
}
