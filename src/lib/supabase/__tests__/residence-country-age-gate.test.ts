// C10 unreadable-region recovery. The default expo-localization mock deliberately
// reports no region, so both registration paths must require a residence choice
// before touching auth or the database.

jest.mock("../client", () => {
  const mock = {
    auth: { getUser: jest.fn(), signUp: jest.fn() },
    from: jest.fn(),
  };
  return { getSupabaseClient: () => mock, __mock: mock };
});

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

import {
  AgeGateError,
  ResidenceCountryRequiredError,
  ensureUserProfile,
  signUpWithEmail,
} from "../auth";
import { emptyConsentSelections, setAllRequiredAcks } from "../../auth/consent-selections";
import { RESIDENCE_COUNTRY_NOT_LISTED } from "../../auth/residence-jurisdiction";

const { __mock: supabaseMock } = require("../client") as {
  __mock: { auth: { getUser: jest.Mock; signUp: jest.Mock }; from: jest.Mock };
};

const requiredConsent = setAllRequiredAcks(emptyConsentSelections(), true);

function yearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

describe("ensureUserProfile — 읽을 수 없는 기기 지역의 거주 국가 복구", () => {
  beforeEach(() => {
    supabaseMock.auth.getUser.mockReset();
    supabaseMock.auth.signUp.mockReset();
    supabaseMock.from.mockReset();
  });

  test("이메일 가입도 거주 국가 선택 전에는 auth 호출 전에 닫힌다", async () => {
    await expect(
      signUpWithEmail({
        email: "unreadable-region@example.invalid",
        password: "not-checked-password",
        birthDate: yearsAgo(30),
        locale: "en",
        consent: requiredConsent,
      }),
    ).rejects.toBeInstanceOf(ResidenceCountryRequiredError);

    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  test("이메일 가입의 TH 19세도 유출 조회나 auth 호출 전에 닫힌다", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");

    await expect(
      signUpWithEmail({
        email: "th-under-floor@example.invalid",
        password: "not-checked-password",
        birthDate: yearsAgo(19),
        locale: "en",
        residenceCountry: "TH",
        consent: requiredConsent,
      }),
    ).rejects.toBeInstanceOf(AgeGateError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("거주 국가를 고르지 않으면 auth/DB 전에 닫힌다", async () => {
    await expect(
      ensureUserProfile({ birthDate: yearsAgo(30), locale: "en" }),
    ).rejects.toBeInstanceOf(ResidenceCountryRequiredError);

    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  test("KR을 고른 15세는 14세 하한을 지나 auth까지 도달한다", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      ensureUserProfile({ birthDate: yearsAgo(15), locale: "ko", residenceCountry: "KR" }),
    ).rejects.not.toBeInstanceOf(AgeGateError);
    expect(supabaseMock.auth.getUser).toHaveBeenCalledTimes(1);
  });

  test("TH을 고른 19세는 20세 하한에서 auth/DB 전에 닫힌다", async () => {
    await expect(
      ensureUserProfile({ birthDate: yearsAgo(19), locale: "en", residenceCountry: "TH" }),
    ).rejects.toBeInstanceOf(AgeGateError);

    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  test("목록에 없음은 17세를 보수적 18세 하한에서 닫는다", async () => {
    await expect(
      ensureUserProfile({
        birthDate: yearsAgo(17),
        locale: "en",
        residenceCountry: RESIDENCE_COUNTRY_NOT_LISTED,
      }),
    ).rejects.toBeInstanceOf(AgeGateError);

    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
