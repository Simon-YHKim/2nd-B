import React from "react";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { OpsEmbeddedFrameHost } from "@/components/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

import {
  LedgerScreen,
  MealsScreen,
  MilestonesScreen,
  OpsHomeScreen,
  ReadingScreen,
  RemindersScreen,
  SideProjectScreen,
} from "./screens";

export type OpsPhoneScreen = "ops" | "reading" | "reminders" | "ledger" | "milestones" | "meals" | "side-project";

/** Mounts the existing Ops screen in a phone list without a second route shell. */
export function OpsPhoneContent({ screen, onBack, onNavigate }: {
  screen: OpsPhoneScreen;
  onBack: () => void;
  onNavigate: (route: "/ops") => void;
}) {
  const { userId, loading } = useAuth();
  const { t } = useTranslation("ops");

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const content = (() => {
    switch (screen) {
      case "ops": return <OpsHomeScreen key={userId} />;
      case "reading": return <ReadingScreen key={userId} />;
      case "reminders": return <RemindersScreen key={userId} onOpenAssistant={() => onNavigate("/ops")} />;
      case "ledger": return <LedgerScreen key={userId} />;
      case "milestones": return <MilestonesScreen key={userId} />;
      case "meals": return <MealsScreen key={userId} />;
      case "side-project": return <SideProjectScreen key={userId} userId={userId} />;
    }
  })();

  return (
    <OpsEmbeddedFrameHost onBack={onBack} backLabel={t("phone.appsBack")}>
      {content}
    </OpsEmbeddedFrameHost>
  );
}
