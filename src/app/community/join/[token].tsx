import { useCallback, useRef } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { CommunityJoinContent } from "@/components/community/CommunityJoinContent";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";

export default function CommunityJoin() {
  const { t } = useTranslation("community");
  const { userId, loading } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : null;
  const onReturnToList = useCallback(() => router.replace("/community"), []);
  const backActionRef = useRef<(() => void) | null>(null);
  const onJoined = useCallback((room: string) => {
    router.replace({ pathname: "/community/[room]", params: { room } });
  }, []);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!token) return <Redirect href="/community" />;
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("joinTitle")} onBack={() => backActionRef.current?.()}>
      <CommunityJoinContent token={token} onJoined={onJoined} onReturnToList={onReturnToList} backActionRef={backActionRef} />
    </DeepSpaceScreen>
  );
}
