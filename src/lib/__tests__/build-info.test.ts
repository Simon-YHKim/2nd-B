// 설정·계정 화면 맨 아래 빌드 줄이 **어느 번들이 돌고 있는지** 맞게 말하는가.
//
// 재현 근거: vibe r260913 T1a (E:/Coding Infra/reports/vibe-r260913/T1a/result.md,
// "실행된 JS 번들" 절 · 부수 발견 1). v0.8.0 preview APK 의 내장 번들로 돌고 있었다.
// 기기 `updates.db` 에 행이 1개(c437df67…)였고 `files/.expo-internal` 은 비어 있었다.
// 그런데 빌드 줄은 `… · preview · OTA c437df67` 이었다. 그 id 는 APK 안
// `assets/app.manifest` 의 id 다. 내장 번들에도 updateId 가 있어서 "id 가 있으면 OTA"
// 판정이 늘 OTA 쪽으로 갔다.
//
// 가르는 값은 expo-updates 가 따로 준다: `isEmbeddedLaunch`
// (node_modules/expo-updates/build/Updates.d.ts, 56.0.20). 네이티브 정의도 같은 뜻이다.
// Android IUpdatesController.kt 는 `launchedUpdate.id == embeddedUpdate.id`,
// iOS AppController.swift 는 `embeddedUpdate?.updateId == launchedUpdate?.updateId`.
//
// expo-updates 는 ESM 이라 ts-jest 가 읽지 못한다. 모듈을 흉내 내고, buildInfoLine 은
// 부를 때마다 상수를 읽으므로 테스트마다 값을 바꿔 끼운다.
jest.mock("expo-updates", () => ({
  __esModule: true,
  isEnabled: true,
  runtimeVersion: null,
  channel: null,
  updateId: null,
  isEmbeddedLaunch: false,
}));

import * as Updates from "expo-updates";

import { buildInfoLine } from "../build-info";

type UpdatesConstants = {
  isEnabled: boolean;
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
};

/** 흉내 낸 모듈의 상수를 바꾼다. 선언은 readonly 라 여기서만 푼다. */
const setUpdates = (next: Partial<UpdatesConstants>) =>
  Object.assign(Updates as unknown as UpdatesConstants, next);

/** T1a 기기에서 읽은 값 그대로. */
const T1A = {
  runtimeVersion: "0b9d5a91af97c0ffa62aeee62488e0eb83839ed8",
  channel: "preview",
  updateId: "c437df67-3120-4c1a-aa8a-f1d57dbe20e2",
};

beforeEach(() => {
  setUpdates({ isEnabled: true, runtimeVersion: null, channel: null, updateId: null, isEmbeddedLaunch: false });
});

describe("빌드 줄: 내장 번들과 OTA 는 isEmbeddedLaunch 로 가른다", () => {
  it("T1a 재현: 내장 번들에도 updateId 가 있지만 OTA 라고 하지 않는다", () => {
    setUpdates({ ...T1A, isEmbeddedLaunch: true });
    const line = buildInfoLine();
    expect(line).not.toContain("OTA");
    // id 는 남긴다. 내장 실행이면 APK 의 assets/app.manifest id 와 맞춰 볼 수 있다.
    expect(line).toBe("v0b9d5a91af97c0ffa62aeee62488e0eb83839ed8 · preview · embedded c437df67");
  });

  it("서버에서 받은 업데이트로 떴으면 OTA 와 그 id 를 보인다", () => {
    setUpdates({ ...T1A, updateId: "019f0239-5b1e-4c7a-9d2f-3a8e6b1c0d4e", isEmbeddedLaunch: false });
    expect(buildInfoLine()).toBe("v0b9d5a91af97c0ffa62aeee62488e0eb83839ed8 · preview · OTA 019f0239");
  });

  it("내장 실행인데 id 를 모르면 embedded 만 적는다", () => {
    setUpdates({ runtimeVersion: "1.0.0", channel: null, updateId: null, isEmbeddedLaunch: true });
    expect(buildInfoLine()).toBe("v1.0.0 · \u2014 · embedded");
  });

  it("expo-updates 가 꺼져 있으면(dev · web · Expo Go) 던지지 않고 dev 로 적는다", () => {
    setUpdates({ isEnabled: false, runtimeVersion: null });
    expect(buildInfoLine()).toBe("v? · dev");
  });
});
