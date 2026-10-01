test("direct native UMP and SDK initialization calls do not load the ad SDK during legal hold", async () => {
  jest.doMock("react-native", () => ({ Platform: { OS: "android" } }));
  const sdkModuleLoaded = jest.fn();
  jest.doMock("react-native-google-mobile-ads", () => {
    sdkModuleLoaded();
    return {
      AdsConsent: {
        requestInfoUpdate: jest.fn(),
        loadAndShowConsentFormIfRequired: jest.fn(),
      },
      default: () => ({ initialize: jest.fn() }),
    };
  });

  const { ensureUmpConsent, ensureAdsInitialized } = await import("../consent.native");

  await expect(ensureUmpConsent()).resolves.toEqual({ canRequestAds: false });
  await expect(ensureAdsInitialized()).resolves.toBe(false);
  expect(sdkModuleLoaded).not.toHaveBeenCalled();
});
