// Android-first Firebase scoping (native-analytics phase 1).
//
// @react-native-firebase requires `use_frameworks :static` on iOS (official
// Expo guide), which this repo's iOS build has not adopted yet - the
// interaction with the existing pods (kakao-login, healthkit, sentry) is
// untested. Until an iOS pass provisions GoogleService-Info.plist and flips
// expo-build-properties useFrameworks, keep the Firebase pods OUT of iOS
// autolinking entirely so current iOS/EAS builds stay byte-identical. The JS
// layer already fails closed (src/lib/analytics lazy-imports the SDK and
// swallows the missing-native-module error), so iOS behavior is unchanged.
module.exports = {
  dependencies: {
    "@react-native-firebase/app": {
      platforms: { ios: null },
    },
    "@react-native-firebase/analytics": {
      platforms: { ios: null },
    },
    // Clarity ships an iOS pod too. The alpha track this was added for is
    // Android, the iOS build is frozen behind the same untested
    // useFrameworks:static question as Firebase, and the JS layer already
    // fails closed when the native module is absent. Keeping it out of iOS
    // autolinking leaves current iOS/EAS builds byte-identical.
    "@microsoft/react-native-clarity": {
      platforms: { ios: null },
    },
  },
};
