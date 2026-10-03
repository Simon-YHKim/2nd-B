import { useTranslation } from "react-i18next";
import { MdButton } from "@/components/m3";
import { useAppRouter } from "@/lib/nav/phone-embed";

export function ServiceConsentLink() {
  // Phone-aware: inside the dashboard phone, the consent screen opens there.
  const router = useAppRouter();
  const { t } = useTranslation("consent");
  return <MdButton variant="outlined" label={t("serviceControl.title")} onPress={() => router.push("/service-consent")} />;
}
