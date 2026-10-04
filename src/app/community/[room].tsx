import { useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { CommunityRoomContent } from "@/components/community/CommunityRoomContent";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";

export default function CommunityRoomScreen() {
  const { t } = useTranslation("community");
  const { userId, loading } = useAuth();
  const params = useLocalSearchParams<{ room?: string }>();
  const roomId = typeof params.room === "string" ? params.room : null;
  const [titleState, setTitleState] = useState<{ roomId: string; title: string } | null>(null);
  const title = titleState?.roomId === roomId ? titleState.title : t("title");

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!roomId) return <Redirect href="/community" />;
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
      <CommunityRoomContent
        roomId={roomId}
        onTitleChange={(nextTitle) => setTitleState({ roomId, title: nextTitle })}
        onReturnToList={() => router.replace("/community")}
      />
    </DeepSpaceScreen>
  );
}
