// Community invite deep-link landing (0117). The raw token arrives only via
// this URL; we ensure the pseudonymous profile exists, then hand the token to
// the community_join RPC (which hashes and validates it server-side) and
// replace into the room. Errors stay on this screen with honest reasons.
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing } from "@/lib/theme/tokens";
import { communityErrorCode, ensureCommunityProfile, joinByToken } from "@/lib/community/chat";
import { runCommunityJoinAttempt } from "@/lib/community/join-attempt";

type Phase = "joining" | "error";
type JoinState = { token: string | null; userId: string | null; adult: boolean; phase: Phase; errorKey: string };

export default function CommunityJoin() {
  const { t } = useTranslation("community");
  const { userId, loading, isMinor } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : null;

  const adult = isMinor === false;
  const [joinState, setJoinState] = useState<JoinState>({ token, userId, adult, phase: "joining", errorKey: "joinFailed" });
  const requestRef = useRef(0);
  const focusedRef = useRef(false);
  const identityRef = useRef({ token, userId, adult });
  identityRef.current = { token, userId, adult };
  const visibleState = joinState.token === token && joinState.userId === userId && joinState.adult === adult
    ? joinState : { phase: "joining" as const, errorKey: "joinFailed" };

  const backToList = useCallback(() => {
    requestRef.current += 1;
    router.replace("/community");
  }, []);

  const attempt = useCallback(() => {
    const requestId = ++requestRef.current;
    if (!userId || !token) return;
    const isCurrent = () => focusedRef.current
      && requestRef.current === requestId
      && identityRef.current.token === token
      && identityRef.current.userId === userId
      && identityRef.current.adult === adult;
    if (!adult) {
      setJoinState({ token, userId, adult, phase: "error", errorKey: "adultOnly" });
      return;
    }
    setJoinState({ token, userId, adult, phase: "joining", errorKey: "joinFailed" });
    void runCommunityJoinAttempt(
      token,
      ensureCommunityProfile,
      joinByToken,
      isCurrent,
      (roomId) => {
        router.replace({ pathname: "/community/[room]", params: { room: roomId } });
      },
      (error) => {
        setJoinState({ token, userId, adult, phase: "error", errorKey: joinErrorKey(communityErrorCode(error)) });
      },
    );
  }, [userId, token, adult]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    attempt();
    return () => {
      focusedRef.current = false;
      requestRef.current += 1;
    };
  }, [attempt]));

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!token) return <Redirect href="/community" />;

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("joinTitle")} onBack={backToList}>
      <View style={styles.body}>
        <MdCard variant="outlined" style={styles.card}>
          {visibleState.phase === "joining" ? (
            <Text variant="body" color="textMuted">{t("joining")}</Text>
          ) : (
            <>
              <Text variant="body" color="textMuted">{t(visibleState.errorKey)}</Text>
              {visibleState.errorKey === "joinFailed" ? (
                <MdButton variant="tonal" label={t("retryCta")} onPress={attempt} />
              ) : null}
              <MdButton variant="text" label={t("backToList")} onPress={backToList} />
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
