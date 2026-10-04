import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

// 진단 APK 는 OTA 를 확인하지 않고, EAS 빌드는 채널로 계속 확인한다 (Q-261004-36, 2026-10-04).
//
// android-release.yml 의 진단 APK 는 expo prebuild + gradle 로 빌드돼 eas.json 프로필을 거치지 않는다.
// 그래서 업데이트 채널(expo-channel-name 헤더)이 없고, 실행할 때마다 u.expo.dev 에 묻다가 HTTP 400 을
// 받았다(QA 261004 D-13: 실행 14회 중 14회). 그 APK 는 그 커밋의 origin/main 과 같은 소프트웨어여야
// 하므로(scripts/app-parity.cjs) OTA 를 받아서도 안 된다. 그래서 확인을 성공시키지 않고 없앤다:
// DIAGNOSTIC_APK=1 이면 app.config.js 가 updates.checkAutomatically 를 "NEVER" 로 둔다.
//
// 지키는 것 셋.
//   1. 변수가 있을 때만 확인이 꺼지고, 업데이트 기능 자체(ENABLED)는 켜진 채다. enabled:false 는
//      src/lib/build-info.ts 의 표시를 "dev" 로 바꾼다.
//   2. 그 변수는 진단 APK 워크플로의 job env 에만 있고, 설정 digest(app-env-digest)를 바꾸지 않는다.
//   3. EAS 빌드 프로필은 전부 채널이 있고 이 변수를 켜지 않는다. 그래서 EAS 빌드는 계속 확인한다.
//
// 매니페스트 값은 짐작하지 않고 expo-updates 설정 플러그인이 쓰는 함수 그대로 계산한다
// (@expo/config-plugins 의 setUpdatesConfigAsync 가 ENABLED · CHECK_ON_LAUNCH 를 이 함수로 쓴다).

type UpdatesConfig = { url?: string; enabled?: boolean; checkAutomatically?: string; [k: string]: unknown };
type ExpoConfig = { updates?: UpdatesConfig; [k: string]: unknown };
type EasProfile = { channel?: unknown; extends?: string; env?: Record<string, unknown>; [k: string]: unknown };

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n?/g, "\n");

const appJson = JSON.parse(read("app.json")).expo as ExpoConfig;
const easBuild = (JSON.parse(read("eas.json")).build ?? {}) as Record<string, EasProfile>;
const WORKFLOW = ".github/workflows/android-release.yml";
const workflowText = read(WORKFLOW);

const appConfig = require("../../app.config.js") as (ctx: { config: ExpoConfig }) => ExpoConfig;
const { Updates } = require("expo/config-plugins") as {
  Updates: {
    getUpdatesEnabled(c: ExpoConfig): boolean;
    getUpdatesCheckOnLaunch(c: ExpoConfig, expoUpdatesVersion?: string | null): string;
    getUpdateUrl(c: ExpoConfig): string | null;
  };
};
const EXPO_UPDATES_VERSION = (require("expo-updates/package.json") as { version: string }).version;
const { appEnv, envDigest } = require("../app-parity.cjs") as {
  appEnv(text: string, vars: Record<string, string>): Record<string, string>;
  envDigest(env: Record<string, string>): string;
};

/** app.config.js 를 그 값의 DIAGNOSTIC_APK 로 푼다(undefined = 변수 없음). 끝나면 환경을 되돌린다. */
function resolveWith(value: string | undefined): ExpoConfig {
  const saved = process.env.DIAGNOSTIC_APK;
  if (value === undefined) delete process.env.DIAGNOSTIC_APK;
  else process.env.DIAGNOSTIC_APK = value;
  try {
    return appConfig({ config: JSON.parse(JSON.stringify(appJson)) });
  } finally {
    if (saved === undefined) delete process.env.DIAGNOSTIC_APK;
    else process.env.DIAGNOSTIC_APK = saved;
  }
}

/** 설정 플러그인이 AndroidManifest 에 쓰는 expo.modules.updates.* 값. */
function manifestOf(config: ExpoConfig) {
  return {
    ENABLED: String(Updates.getUpdatesEnabled(config)),
    EXPO_UPDATES_CHECK_ON_LAUNCH: Updates.getUpdatesCheckOnLaunch(config, EXPO_UPDATES_VERSION),
    EXPO_UPDATE_URL: Updates.getUpdateUrl(config),
  };
}

function withoutUpdates(config: ExpoConfig): ExpoConfig {
  const { updates: _drop, ...rest } = config;
  return rest;
}

describe("app.config.js: 진단 APK 만 실행 때 OTA 를 확인하지 않는다", () => {
  it("변수가 없으면(EAS 빌드 · localhost) updates 는 app.json 그대로이고 실행할 때마다 확인한다", () => {
    const config = resolveWith(undefined);
    expect(appJson.updates?.url).toMatch(/^https:\/\/u\.expo\.dev\//);
    expect(config.updates).toEqual(appJson.updates);
    expect(manifestOf(config)).toEqual({
      ENABLED: "true",
      EXPO_UPDATES_CHECK_ON_LAUNCH: "ALWAYS",
      EXPO_UPDATE_URL: appJson.updates?.url,
    });
  });

  it("DIAGNOSTIC_APK=1 이면 확인만 끈다 - 업데이트 기능 · URL · 나머지 설정은 그대로", () => {
    const config = resolveWith("1");
    expect(config.updates?.checkAutomatically).toBe("NEVER");
    // enabled:false 로 끄면 Updates.isEnabled 가 거짓이 되어 build-info 가 "dev" 를 낸다 - 그래서 쓰지 않는다
    expect(config.updates?.enabled).toBeUndefined();
    expect(manifestOf(config)).toEqual({
      ENABLED: "true",
      EXPO_UPDATES_CHECK_ON_LAUNCH: "NEVER",
      EXPO_UPDATE_URL: appJson.updates?.url,
    });
    const { checkAutomatically: _never, ...restUpdates } = config.updates ?? {};
    expect(restUpdates).toEqual(appJson.updates);
    expect(withoutUpdates(config)).toEqual(withoutUpdates(resolveWith(undefined)));
  });

  it.each(["0", "", "false"])("DIAGNOSTIC_APK=%j 는 켜지 않는다 - 정확히 \"1\" 일 때만", (value) => {
    const config = resolveWith(value);
    expect(config.updates).toEqual(appJson.updates);
    expect(manifestOf(config).EXPO_UPDATES_CHECK_ON_LAUNCH).toBe("ALWAYS");
  });
});

describe("android-release.yml: 진단 변수는 job 전체에 걸리고 설정 digest 밖에 있다", () => {
  const doc = parse(workflowText) as {
    jobs?: { build?: { env?: Record<string, unknown>; steps?: Array<{ name?: string; env?: Record<string, unknown>; run?: string }> } };
  };
  const build = doc.jobs?.build;

  it("jobs.build.env 에 DIAGNOSTIC_APK=\"1\" 이 있다(prebuild 와 gradle 의 지문 · 매니페스트 단계가 둘 다 본다)", () => {
    expect(build?.env?.DIAGNOSTIC_APK).toBe("1");
  });

  it("어느 단계도 그 값을 덮어쓰거나 지우지 않는다", () => {
    for (const step of build?.steps ?? []) {
      expect(Object.keys(step.env ?? {})).not.toContain("DIAGNOSTIC_APK");
      expect(String(step.run ?? "")).not.toMatch(/DIAGNOSTIC_APK/);
    }
  });

  it("설정 digest(app-env-digest)는 그 변수가 있든 없든 같다", () => {
    const without = parse(workflowText) as typeof doc;
    delete without.jobs?.build?.env?.DIAGNOSTIC_APK;
    const withoutText = stringify(without);
    const varSets: Array<Record<string, string>> = [{}, { EXPO_PUBLIC_CHAT_VENDOR: "claude" }];
    for (const vars of varSets) {
      const env = appEnv(workflowText, vars);
      expect(Object.keys(env)).not.toContain("DIAGNOSTIC_APK");
      expect(envDigest(env)).toBe(envDigest(appEnv(withoutText, vars)));
    }
  });

  it("다른 워크플로는 이 변수를 걸지 않는다(OTA 게시 · EAS 빌드가 진단 설정으로 지문을 계산하지 않게)", () => {
    // 주석은 보지 않는다: 파싱한 문서에서 env 키로 걸거나, run 안에서 값을 대입하는 것만 센다.
    const sets = (node: unknown): number => {
      if (typeof node === "string") return (node.match(/\bDIAGNOSTIC_APK\s*=/g) ?? []).length;
      if (Array.isArray(node)) return node.reduce((n: number, v) => n + sets(v), 0);
      if (node && typeof node === "object") {
        return Object.entries(node).reduce((n, [k, v]) => n + (k === "DIAGNOSTIC_APK" ? 1 : 0) + sets(v), 0);
      }
      return 0;
    };
    const dir = path.join(root, ".github/workflows");
    const users = fs
      .readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => [`.github/workflows/${f}`, sets(parse(read(`.github/workflows/${f}`)))] as const)
      .filter(([, n]) => n > 0);
    expect(users).toEqual([[WORKFLOW, 1]]);
  });
});

describe("eas.json: EAS 빌드는 채널로 계속 확인한다", () => {
  /** extends 를 따라가 그 프로필에 실제로 걸리는 값들을 모은다. */
  function resolved(name: string, seen: string[] = []): EasProfile[] {
    const profile = easBuild[name];
    if (!profile) throw new Error(`eas.json build.${name} 이 없다 (extends: ${seen.join(" -> ")})`);
    if (seen.includes(name)) throw new Error(`eas.json extends 순환: ${[...seen, name].join(" -> ")}`);
    return [profile, ...(profile.extends ? resolved(profile.extends, [...seen, name]) : [])];
  }

  const names = Object.keys(easBuild);

  it("빌드 프로필이 있다", () => {
    expect(names).toEqual(expect.arrayContaining(["development", "preview", "production"]));
  });

  it.each(names)("%s 프로필은 업데이트 채널이 있다", (name) => {
    const channel = resolved(name).map((p) => p.channel).find((c) => c !== undefined);
    expect(typeof channel).toBe("string");
    expect(String(channel).trim()).not.toBe("");
  });

  it.each(names)("%s 프로필은 DIAGNOSTIC_APK 를 켜지 않는다", (name) => {
    const envs: Array<Record<string, unknown>> = [];
    for (const p of resolved(name)) {
      if (p.env) envs.push(p.env);
      for (const platform of ["android", "ios"] as const) {
        const sub = p[platform] as { env?: Record<string, unknown> } | undefined;
        if (sub?.env) envs.push(sub.env);
      }
    }
    for (const env of envs) expect(Object.keys(env)).not.toContain("DIAGNOSTIC_APK");
  });
});
