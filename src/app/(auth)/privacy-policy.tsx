// /privacy-policy -- the Privacy Policy document (PIPA). (auth) group:
// IntroGate-exempt, readable while signed out (the sign-up consent line names
// it, so it must be readable BEFORE agreeing). /privacy stays the settings
// screen; this is the document it links to. Canon-only; content snapshot in
// src/lib/legal/legal-documents.ts (source: docs/legal/privacy-policy.md).
import { DeepSpaceLegalDocScreen } from "@/screens/deepspace/dds-legal-doc-screen";
import { PRIVACY_DOC, REFUND_DOC, TERMS_DOC } from "@/lib/legal/legal-documents";

export default function PrivacyPolicyRoute() {
  return (
    <DeepSpaceLegalDocScreen
      doc={PRIVACY_DOC}
      crossLinks={[
        { href: "/terms", label: TERMS_DOC.title },
        { href: "/refund", label: REFUND_DOC.title },
      ]}
    />
  );
}
