import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet } from "react-native";
import { PhoneView as View } from "@/components/phone/PhoneUIKit";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { HustleKPortrait } from "@/components/character/HustleKPortrait";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { fetchAvatarSpec } from "@/lib/supabase/avatar-spec";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import type { AvatarSpec } from "@/lib/avatar";
import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import { deepSpace } from "@/lib/theme/tokens";

/** One owner-bound read for the whole transcript, refreshed after profile edits. */
export function useChatUserAvatar(userId: string | null): AvatarSpec | null {
  const [saved, setSaved] = useState<{ owner: string; spec: AvatarSpec | null } | null>(null);
  const activeOwner = useRef(userId);
  activeOwner.current = userId;
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    const lease = captureAccountOwnerLease(userId);
    let cancelled = false;
    if (!lease) return;
    void fetchAvatarSpec(userId).then(spec => {
      if (!cancelled && activeOwner.current === userId && lease.isCurrent()) setSaved({ owner: userId, spec });
    }).catch(() => {
      // Keep this owner's last known portrait; the anonymous fallback is explicit.
    });
    return () => { cancelled = true; };
  }, [userId]));
  return saved?.owner === userId ? saved.spec : null;
}

export function ChatMessageAvatar({ role, userAvatar, expression = "A01", label }: {
  role: "user" | "secondb";
  userAvatar: AvatarSpec | null;
  expression?: HustleKExpressionId;
  label: string;
}) {
  return (
    <View style={styles.frame} testID={`chat-avatar-${role}`} accessible accessibilityRole="image" accessibilityLabel={label}>
      {role === "secondb" ? <HustleKPortrait expression={expression} size={36} />
        : userAvatar ? <AvatarPreview spec={userAvatar} size={36} crop />
          : <PixelGlyph name="person" size={28} color={deepSpace.textMid} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 36, height: 36, flexShrink: 0, alignItems: "center", justifyContent: "center",
    overflow: "hidden", backgroundColor: deepSpace.card,
  },
});
