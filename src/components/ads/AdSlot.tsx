// Web AdSense slot, policy-gated (Simon directive 2026-06-11).
//
// Renders NOTHING unless every layer agrees (src/lib/ads/policy.ts):
// build flag + AdSense client configured, free tier, adult, explicit ads
// consent, non-sensitive route. Native is a no-op — AdMob ships with the
// native build track (docs/ADS.md).
//
// Ads consent comes from users.privacy_prefs.ads (the privacy screen toggle,
// default false, minors locked off server-side by 0032) — fetched once per
// mount; until it resolves the policy fails closed. Never default it on.

import { useEffect, useRef, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { usePathname, router } from "expo-router";
import { Text } from "@/components/ui/Text";
import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { getEnv } from "@/lib/env";
import { canShowAds } from "@/lib/ads/policy";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";
import { semantic, radii, spacing } from "@/lib/theme/tokens";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let adsenseScriptRequested = false;
function ensureAdsenseScript(client: string): void {
  if (typeof document === "undefined" || adsenseScriptRequested) return;
  adsenseScriptRequested = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

export function AdSlot({ slotEnvKey }: { slotEnvKey: "EXPO_PUBLIC_ADSENSE_SLOT_RECORDS" }) {
  const { t } = useTranslation("common");
  const { userId, isMinor } = useAuth();
  const progression = useProgression();
  const pathname = usePathname();
  const hostRef = useRef<View | null>(null);
  // users.privacy_prefs.ads — null until resolved (policy fails closed).
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  // AdBlock / load-failure fallback: when the ad never fills, show the quiet
  // subscription upsell instead of a blank box (ads → "remove ads with a
  // subscription" loop).
  const [fallback, setFallback] = useState(false);

  const env = getEnv();
  const client = env.EXPO_PUBLIC_ADSENSE_CLIENT;
  const slot = env[slotEnvKey];

  // Resolve the ads consent pref. Only bother on web with a configured slot —
  // native and unconfigured builds stay a pure no-op with zero extra fetches.
  useEffect(() => {
    if (Platform.OS !== "web" || !slot || !userId) return;
    let cancelled = false;
    fetchPrivacyPrefs(userId)
      .then((prefs) => {
        if (!cancelled) setAdsConsent(prefs.ads === true);
      })
      .catch(() => {
        if (!cancelled) setAdsConsent(false); // fetch failure = no ads
      });
    return () => {
      cancelled = true;
    };
  }, [slot, userId]);

  const allowed =
    Platform.OS === "web" &&
    !!slot &&
    canShowAds({
      // While the tier is still resolving, pass null — the policy fails
      // closed so a subscriber never sees an ad flash during the fetch.
      tier: progression.loading ? null : progression.tier,
      isMinor,
      adsConsent,
      route: pathname ?? "/",
    });

  useEffect(() => {
    if (!allowed || !client || !slot) return;
    ensureAdsenseScript(client);
    // react-native-web View refs expose the underlying DOM element.
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || host.querySelector("ins.adsbygoogle")) return;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.style.width = "100%";
    ins.setAttribute("data-ad-client", client);
    ins.setAttribute("data-ad-slot", slot);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      setFallback(true);
    }
    // If nothing filled within a grace window (blocked script, no inventory),
    // collapse to the upsell line rather than leaving dead space.
    const check = setTimeout(() => {
      if (ins.getAttribute("data-ad-status") !== "filled") setFallback(true);
    }, 4000);
    return () => clearTimeout(check);
  }, [allowed, client, slot]);

  if (!allowed) return null;

  if (fallback) {
    return (
      <Pressable
        onPress={() => router.push("/plans")}
        style={styles.fallback}
        accessibilityRole="button"
        accessibilityLabel={t("ads.removeUpsell")}
      >
        <Text variant="subtle" color="textMuted">
          {t("ads.removeUpsell")}
        </Text>
      </Pressable>
    );
  }

  return <View ref={hostRef} style={styles.host} accessibilityLabel={t("ads.label")} />;
}

const styles = StyleSheet.create({
  host: { width: "100%", minHeight: 50, marginTop: spacing.md },
  fallback: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
});
