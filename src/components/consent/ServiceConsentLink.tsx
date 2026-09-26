import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { MdButton } from "@/components/m3";

export function ServiceConsentLink() {
  const { t } = useTranslation("consent");
  return <MdButton variant="outlined" label={t("serviceControl.title")} onPress={() => router.push("/service-consent")} />;
}
