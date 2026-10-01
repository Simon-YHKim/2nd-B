// Ad network publication gate. The existing privacy_prefs.ads boolean records
// an older UI choice, not consent to the specific third-party disclosure and
// overseas transfer required for AdMob. The recipient entity, destination
// countries, and retention terms are still unverified, so no valid new consent
// can be collected yet. Keep this independent of build flags and ad unit IDs.
//
// To open this gate, first publish the complete bilingual disclosure and a
// versioned, separately recorded third-party/overseas consent flow. Every ad
// caller must then check that current per-user consent, not this old boolean.
export function adNetworkPublicationReady(): boolean {
  return false;
}
