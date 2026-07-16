// /terms -- the Terms of Service document (U4). (auth) group: IntroGate-exempt,
// readable while signed out (a user must be able to read terms BEFORE agreeing
// at sign-up). Canon-only; content snapshot in src/lib/legal/legal-documents.ts.
import { DeepSpaceLegalDocScreen } from "@/screens/deepspace/dds-legal-doc-screen";
import { REFUND_DOC, TERMS_DOC } from "@/lib/legal/legal-documents";

export default function TermsRoute() {
  return <DeepSpaceLegalDocScreen doc={TERMS_DOC} crossLink={{ href: "/refund", label: REFUND_DOC.title }} />;
}
