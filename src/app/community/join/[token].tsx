// Community invite deep-link landing (0117). The raw token arrives only via
// this URL; we ensure the pseudonymous profile exists, then hand the token to
// the community_join RPC (which hashes and validates it server-side) and
// replace into the room. Errors stay on this screen with honest reasons.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing } from "@/lib/theme/tokens";
import { communityErrorCode, ensureCommunityProfile, joinByToken } from "@/lib/community/chat";

type Phase = "joining" | "error";

export default function CommunityJoin() {
  const { t } = useTranslation("community");
  const { userId, loading, isMinor } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : null;

  const [phase, setPhase] = useState<Phase>("joining");
  const [errorKey, setErrorKey] = useState("joinFailed");

  const adult = isMinor === false;

  const attempt = useCallback(() => {
    if (!userId || !token) return;
    if (!adult) {
      setErrorKey("adultOnly");
      setPhase("error");
      return;
    }
    setPhase("joining");
    ensureCommunityProfile()
      .then(() => joinByToken(token))
      .then((roomId) => {
        router.replace({ pathname: "/community/[room]", params: { room: roomId } });
      })
      .catch((e) => {
        setErrorKey(joinErrorKey(communityErrorCode(e)));
        setPhase("error");
      });
  }, [userId, token, adult]);

  useEffect(attempt, [attempt]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!token) return <Redirect href="/community" />;

  return (
    <DeepSpaceScreen active="lens" variant="windowed" title={t("joinTitle")} onBack={() => router.replace("/community")}>
      <View style={styles.body}>
        <MdCard variant="outlined" style={styles.card}>
          {phase === "joining" ? (
            <Text variant="body" color="textMuted">{t("joining")}</Text>
          ) : (
            <>
              <Text variant="body" color="textMuted">{t(errorKey)}</Text>
              {errorKey === "joinFailed" ? (
                <MdButton variant="tonal" label={t("retryCta")} onPress={attempt} />
              ) : null}
              <MdButton variant="text" label={t("backToList")} onPress={() => router.replace("/community")} />
            </>
          )}
        </MdCard>
      </View>
    </DeepSpaceScreen>
  );
}

function joinErrorKey(code: string | null): string {
  switch (code) {
    case "community_adult_only": return "adultOnly";
    case "community_invite_unknown": return "inviteUnknown";
    case "community_invite_expired": return "inviteExpired";
    case "community_invite_spent": return "inviteSpent";
    case "community_room_full": return "roomFull";
    default: return "joinFailed";
  }
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg },
  card: { padding: spacing.md, gap: spacing.sm },
});
