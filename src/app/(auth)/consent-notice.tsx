// Consent-notice detail route: what each sign-up consent row actually covers
// (collection, purpose, retention, refusal right), one section per item,
// ?item=<selection key> scrolls to that section. In the (auth) group so the
// IntroGate exemption applies and a signed-out user mid-sign-up can read it.
// Canon-only: new work gets no legacy skin (CLAUDE.md, LEGACY note).
import { DeepSpaceConsentNoticeScreen } from "@/screens/deepspace/dds-consent-notice-screen";

export default function ConsentNoticeRoute() {
  return <DeepSpaceConsentNoticeScreen />;
}
