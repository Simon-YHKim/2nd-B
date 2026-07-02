import {
  shouldTryNativeSocialSignIn,
  supportsNativeSocialSdk,
  tryNativeSocialSignIn,
} from "@/lib/auth/native-social";
import { signInWithIdTokenProvider } from "@/lib/supabase/auth";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { login as kakaoLogin } from "@react-native-seoul/kakao-login";

// The Supabase exchange + both native SDKs are mocked: jest never loads the real native
// modules, and we drive each branch by setting the mock return value.
jest.mock("@/lib/supabase/auth", () => ({ signInWithIdTokenProvider: jest.fn() }));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
}));
jest.mock("@react-native-seoul/kakao-login", () => ({ login: jest.fn() }));

const mockedExchange = signInWithIdTokenProvider as jest.MockedFunction<typeof signInWithIdTokenProvider>;
const mockedGoogleSignIn = GoogleSignin.signIn as jest.Mock;
const mockedKakaoLogin = kakaoLogin as jest.Mock;

type NavHolder = { navigator?: { product?: string } };
const originalNav = (globalThis as NavHolder).navigator;
const originalFlag = process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK;

function setNativeRuntime(on: boolean): void {
  (globalThis as NavHolder).navigator = on ? { product: "ReactNative" } : undefined;
}

afterEach(() => {
  (globalThis as NavHolder).navigator = originalNav;
  process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = originalFlag;
  jest.clearAllMocks();
});

describe("supportsNativeSocialSdk", () => {
  it("is true only for google and kakao", () => {
    expect(supportsNativeSocialSdk("google")).toBe(true);
    expect(supportsNativeSocialSdk("kakao")).toBe(true);
    expect(supportsNativeSocialSdk("apple")).toBe(false);
    expect(supportsNativeSocialSdk("facebook")).toBe(false);
    expect(supportsNativeSocialSdk("github")).toBe(false);
  });
});

describe("shouldTryNativeSocialSignIn", () => {
  it("is false on a non-native runtime even with the flag on (web/jest)", () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "true";
    setNativeRuntime(false);
    expect(shouldTryNativeSocialSignIn("google")).toBe(false);
  });

  it("is false when the flag is off even on a native runtime", () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "false";
    setNativeRuntime(true);
    expect(shouldTryNativeSocialSignIn("google")).toBe(false);
  });

  it("is true for google/kakao on native with the flag on, false for apple", () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "true";
    setNativeRuntime(true);
    expect(shouldTryNativeSocialSignIn("google")).toBe(true);
    expect(shouldTryNativeSocialSignIn("kakao")).toBe(true);
    expect(shouldTryNativeSocialSignIn("apple")).toBe(false);
  });
});

describe("tryNativeSocialSignIn", () => {
  it("returns false (caller falls back to browser) when not eligible", async () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "false";
    setNativeRuntime(true);
    await expect(tryNativeSocialSignIn("google")).resolves.toBe(false);
    expect(mockedExchange).not.toHaveBeenCalled();
  });

  it("google: exchanges the idToken and returns handled", async () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "true";
    setNativeRuntime(true);
    mockedGoogleSignIn.mockResolvedValue({ type: "success", data: { idToken: "g-tok" } });
    await expect(tryNativeSocialSignIn("google")).resolves.toBe(true);
    expect(mockedExchange).toHaveBeenCalledWith("google", "g-tok");
  });

  it("google: cancelled is handled without an exchange", async () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "true";
    setNativeRuntime(true);
    mockedGoogleSignIn.mockResolvedValue({ type: "cancelled", data: null });
    await expect(tryNativeSocialSignIn("google")).resolves.toBe(true);
    expect(mockedExchange).not.toHaveBeenCalled();
  });

  it("kakao: exchanges the idToken and returns handled", async () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "true";
    setNativeRuntime(true);
    mockedKakaoLogin.mockResolvedValue({ idToken: "k-tok" });
    await expect(tryNativeSocialSignIn("kakao")).resolves.toBe(true);
    expect(mockedExchange).toHaveBeenCalledWith("kakao", "k-tok");
  });

  it("throws when google returns no idToken so the caller can fall back", async () => {
    process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK = "true";
    setNativeRuntime(true);
    mockedGoogleSignIn.mockResolvedValue({ type: "success", data: { idToken: null } });
    await expect(tryNativeSocialSignIn("google")).rejects.toThrow(/no idToken/);
  });
});
