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
 * ⚠ **CLI 버전마다 모양이 다르다. 그리고 CI 는 버전을 고정하지 않는다.**
 *
 * 워크플로우는 `npx eas-cli` 를 쓴다 — 매번 **최신본**을 받아온다. 그래서
 * 로컬과 CI 가 서로 다른 모양을 보며, **다음 릴리스에 또 바뀔 수 있다.**
 * 둘 다 실측이다(2026-08-26, 같은 빌드 33 을 두 버전으로 조회해 대조):
 *
 *     eas-cli 21.0.2 →  "channel": "preview",
 *                        "runtimeVersion": "c2806751…",
 *                        "fingerprint": { "hash": "c2806751…" }
 *
 *     eas-cli 22.4.0 →  "updateChannel": { "id": "019ef866…", "name": "preview" },
 *                        "runtime": { "id": "01a03c85…", "version": "c2806751…" },
 *                        "fingerprint": { "hash": "c2806751…" }
 *
 * 즉 **두 필드가 함께 개명됐다** — `channel` 과 `runtimeVersion` 둘 다.
 * 한쪽만 고치면 더 나쁜 일이 난다: 채널은 잡히는데 런타임을 못 읽어
 * **모든 빌드가 "좌초됨"으로** 보고된다. 2026-08-26 에 실제로 그랬다 —
 * 도달 보고가 방금 때린 v0.4.0 빌드를 "좌초" 로 찍었다.
 *
 * 검사가 못 잡은 이유는 **픽스처가 코드와 같은 이름을 지어낸 탓**이다.
 * 픽스처는 항상 자기 코드와 동의한다 — 현실과 맞춰본 적이 없으면. 그래서
 * 검사는 이제 **두 버전의 진짜 출력을 그대로 박은** 픽스처로 돌린다.
 */
function channelOf(b) {
  return b?.updateChannel?.name ?? b?.channel ?? null;
}

/**
 * 한 빌드가 어느 런타임(=지문)을 지니고 있는가. 읽을 수 없으면 `null`.
 *
 * 위 `channelOf` 와 같은 이유로 세 자리를 본다. 반환값 `null` 은
 * "다른 값을 지닌다" 와 **같은 값이 아니다** — 못 읽은 빌드를 좌초로 세면
 * 검사가 모르는 것을 아는 척 하게 된다. 호출부가 그 둘을 갈라 다룬다.
 */
function runtimeOf(b) {
  return b?.runtimeVersion || b?.runtime?.version || b?.fingerprint?.hash || null;
}

/**
 * @param {string} runtimeVersion  the runtimeVersion `eas update` reported
 * @param {string} channel         the channel it published to
 * @param {Array<object>} builds   `eas build:list --json` output
 */
function reachOf(runtimeVersion, channel, builds) {
  const onChannel = builds.filter((b) => channelOf(b) === channel);
  const reached = onChannel.filter((b) => runtimeOf(b) === runtimeVersion);

  // Stranded = installed-and-usable builds on this channel that this update
  // cannot land on. Errored builds never reached a device, so they are not
  // stranded; counting them would inflate every report.
  //
  // ⚠ 런타임을 **못 읽은** 빌드는 여기 넣지 않는다. 그것까지 좌초로 세면
  //   필드 이름이 바뀌기만 해도 "전부 좌초" 라는 확신에 찬 오답이 나온다.
  const finished = onChannel.filter((b) => b.status === "FINISHED");
  const stranded = finished.filter((b) => {
    const rv = runtimeOf(b);
    return rv !== null && rv !== runtimeVersion;
  });
  const unreadable = finished.filter((b) => runtimeOf(b) === null);

  return {
    reached: reached.map(describe),
    stranded: stranded.map(describe),
    unreadable: unreadable.map(describe),
    // The distinction that matters: nothing on this channel at all, versus
    // builds exist and none of them match — versus **we could not tell**.
    verdict:
      reached.length > 0
        ? "reaches"
        : onChannel.length === 0
          ? "no-builds"
          : unreadable.length > 0
            ? "unknown"
            : "reaches-nothing",
  };
}

function describe(b) {
  const v = [b.appVersion, b.appBuildVersion].filter(Boolean).join(" · build ");
  const rv = runtimeOf(b);
  return `${v || b.id} (${b.buildProfile || "?"}, ${rv ? `${rv.slice(0, 8)}…` : "runtime 읽기 실패"})`;
}

/**
 * @param {{reached: string[], stranded: string[], unreadable?: string[], verdict: string}} result
 * @param {string} runtimeVersion
 * @param {string} channel
 */
function render({ reached, stranded, unreadable = [], verdict }, runtimeVersion, channel) {
  const lines = [];
  const short = `${String(runtimeVersion).slice(0, 8)}…`;

  if (verdict === "reaches") {
    lines.push(`OTA reach: ${reached.length} installed build(s) on '${channel}' carry ${short}.`);
    for (const r of reached) lines.push(`  reaches  ${r}`);
  } else if (verdict === "no-builds") {
    lines.push(`OTA reach: no builds exist on channel '${channel}' yet.`);
    lines.push(`  This update is waiting for the first one. Nothing is stranded.`);
  } else if (verdict === "unknown") {
    lines.push(`OTA reach: UNKNOWN — 도달을 판단할 수 없다.`);
    lines.push(
      `  '${channel}' 의 빌드 ${unreadable.length}개에서 런타임을 읽지 못했다 — eas-cli 가`,
    );
    lines.push(`  필드 이름을 또 바꿨을 가능성이 높다(워크플로우가 버전을 고정하지 않는다).`);
    lines.push(`  이것은 "아무것도 못 받는다" 와 **다른 상황**이다. 업데이트 자체는 발행됐다.`);
    lines.push(`  scripts/check-ota-reach.js 의 runtimeOf() 에 새 모양을 더할 것.`);
    for (const u of unreadable.slice(0, 5)) lines.push(`    ?  ${u}`);
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

module.exports = { reachOf, render, describe, channelOf, runtimeOf, BUILD_LIMIT };

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
  if (result.verdict === "unknown") {
    console.log(
      `::warning title=OTA reach unknown::'${channel}' 의 빌드에서 런타임을 읽지 못했다. eas-cli 출력 모양이 바뀌었을 수 있다 — scripts/check-ota-reach.js 의 runtimeOf() 를 볼 것.`,
    );
  }
  if (result.verdict === "reaches-nothing") {
    console.log(
      `::warning title=OTA reached nothing::No build on '${channel}' carries runtimeVersion ${runtimeVersion}. The update is published but undeliverable until a build with that fingerprint ships.`,
    );
  }
}
