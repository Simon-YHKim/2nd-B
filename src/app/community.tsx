import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { CommunityListContent } from "@/components/community/CommunityListContent";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Community() {
  const { t } = useTranslation("community");
  const { userId, loading } = useAuth();
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("title")} onBack={() => router.back()}>
      <CommunityListContent
        onOpenRoom={(room) => router.push({ pathname: "/community/[room]", params: { room } })}
        onOpenJoin={(token) => router.push({ pathname: "/community/join/[token]", params: { token } })}
      />
    </DeepSpaceScreen>
  );
}
