// /refund -- the Refund & Cancellation policy document (U4). (auth) group:
// IntroGate-exempt, readable signed out. Paddle (Merchant of Record) checkout
// will link here from the plans/checkout surface once U3 lands.
import { DeepSpaceLegalDocScreen } from "@/screens/deepspace/dds-legal-doc-screen";
import { REFUND_DOC, TERMS_DOC } from "@/lib/legal/legal-documents";

export default function RefundRoute() {
  return <DeepSpaceLegalDocScreen doc={REFUND_DOC} crossLink={{ href: "/terms", label: TERMS_DOC.title }} />;
}
