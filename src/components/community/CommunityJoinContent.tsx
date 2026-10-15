import { PhoneView as View } from "@/components/phone/PhoneUIKit";
// Community invite deep-link landing (0117). The raw token arrives only via
// an invite link or the pasted-link field; we ensure the pseudonymous profile exists, then hand the token to
// the community_join RPC (which hashes and validates it server-side) and
// replace into the room. Errors stay on this screen with honest reasons.
import React, { useCallback, useRef, useState, type RefObject } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, useFocusEffect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing } from "@/lib/theme/tokens";
import { communityErrorCode, ensureCommunityProfile, joinByToken } from "@/lib/community/chat";
import { joinErrorKey, runCommunityJoinAttempt } from "@/lib/community/join-attempt";

type Phase = "joining" | "error";
type JoinState = { token: string | null; userId: string | null; adult: boolean; phase: Phase; errorKey: string };

export interface CommunityJoinContentProps {
  token: string;
  onJoined: (roomId: string) => void;
  onReturnToList: () => void;
  /** Lets a host top bar invalidate an in-flight join before navigating away. */
  backActionRef?: RefObject<(() => void) | null>;
}

export function CommunityJoinContent({ token, onJoined, onReturnToList, backActionRef }: CommunityJoinContentProps) {
  const { t } = useTranslation("community");
  const { userId, loading, isMinor } = useAuth();

  const adult = isMinor === false;
  const [joinState, setJoinState] = useState<JoinState>({ token, userId, adult, phase: "joining", errorKey: "joinFailed" });
  const requestRef = useRef(0);
  const focusedRef = useRef(false);
  const onJoinedRef = useRef(onJoined);
  const onReturnToListRef = useRef(onReturnToList);
  const identityRef = useRef({ token, userId, adult });
  onJoinedRef.current = onJoined;
  onReturnToListRef.current = onReturnToList;
  identityRef.current = { token, userId, adult };
  const visibleState = joinState.token === token && joinState.userId === userId && joinState.adult === adult
    ? joinState : { phase: "joining" as const, errorKey: "joinFailed" };

  const backToList = useCallback(() => {
    requestRef.current += 1;
    onReturnToListRef.current();
  }, []);
  if (backActionRef) backActionRef.current = backToList;

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
        onJoinedRef.current(roomId);
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

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg },
  card: { padding: spacing.md, gap: spacing.sm },
});
