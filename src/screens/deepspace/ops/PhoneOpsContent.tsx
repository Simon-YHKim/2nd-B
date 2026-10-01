import React from "react";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { OpsEmbeddedFrameHost } from "@/components/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

import { ReadingScreen, SideProjectScreen } from "./screens";

export type OpsPhoneScreen = "reading" | "side-project";

/** Mounts the existing Ops screen in a phone list without a second route shell. */
export function OpsPhoneContent({ screen, onBack }: { screen: OpsPhoneScreen; onBack: () => void }) {
  const { userId, loading } = useAuth();
  const { t } = useTranslation("ops");

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <OpsEmbeddedFrameHost onBack={onBack} backLabel={t("phone.appsBack")}>
      {screen === "reading"
        ? <ReadingScreen key={userId} />
        : <SideProjectScreen key={userId} userId={userId} />}
    </OpsEmbeddedFrameHost>
  );
}
