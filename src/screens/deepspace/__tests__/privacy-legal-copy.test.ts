// T09: preserve the exact B-1/B-2/B-3 copy approved in the 2026-10-23 internal review.
// 2026-10-24 correction: PT/ID B-1 names account deletion, matching KO withdrawal.
// A1 adds the overseas destination. This is display copy, not a consent revision.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const APPROVED = {
  "ko": {
    "retention": "계정을 쓰는 동안 보관하고, 탈퇴하면 지체 없이 지웁니다. 결제 기록 등 법으로 정한 기록만 정한 기간 따로 보관합니다.",
    "none": "처리방침에 적은 경우만",
    "status": "기록은 나를 이해하도록 돕는 기능에 씁니다. 자세한 쓰임은 처리방침에 있습니다.",
    "tip": "어떤 데이터를 쓸지 직접 정할 수 있습니다.",
    "processing": "기록은 서버에 저장하고, AI 기능을 쓸 때 필요한 내용은 국외 AI 제공사로 보냅니다."
  },
  "en": {
    "retention": "Kept while you use your account and deleted without delay when you leave. Only records the law requires, such as payment records, are kept separately for the required period.",
    "none": "Only as listed in the privacy policy",
    "status": "Your records power features that help you understand yourself. Full details are in the privacy policy.",
    "tip": "You can choose which data is used.",
    "processing": "Records are stored on the server. Content needed for AI features is sent to overseas AI providers."
  },
  "es": {
    "retention": "Se guarda mientras uses tu cuenta y se borra sin demora cuando te das de baja. Solo los registros que exige la ley, como los de pago, se guardan aparte durante el plazo obligatorio.",
    "none": "Solo en los casos de la política de privacidad",
    "status": "Tus registros se usan en funciones que te ayudan a conocerte. Los detalles están en la política de privacidad.",
    "tip": "Puedes elegir qué datos se usan.",
    "processing": "Los registros se guardan en el servidor. El contenido necesario para las funciones de IA se envía a los proveedores de IA en el extranjero."
  },
  "pt": {
    "retention": "Fica guardado enquanto você usa a conta e é excluído sem demora quando você exclui a conta. Só os registros exigidos por lei, como os de pagamento, ficam guardados à parte pelo prazo obrigatório.",
    "none": "Só nos casos da política de privacidade",
    "status": "Seus registros são usados em funções que ajudam você a se conhecer. Os detalhes estão na política de privacidade.",
    "tip": "Você pode escolher quais dados são usados.",
    "processing": "Os registros ficam salvos no servidor. O conteúdo necessário para as funções de IA é enviado aos fornecedores de IA no exterior."
  },
  "id": {
    "retention": "Disimpan selama kamu memakai akun dan dihapus tanpa ditunda saat kamu menghapus akun. Hanya catatan yang diwajibkan hukum, seperti catatan pembayaran, disimpan terpisah selama jangka waktu yang diwajibkan.",
    "none": "Hanya sesuai kebijakan privasi",
    "status": "Catatanmu dipakai untuk fitur yang membantumu memahami diri. Rinciannya ada di kebijakan privasi.",
    "tip": "Kamu bisa memilih data mana yang digunakan.",
    "processing": "Catatan disimpan di server. Konten yang diperlukan untuk fitur AI dikirim ke penyedia AI di luar negeri."
  }
};

describe("privacy legal conditions (T09)", () => {
  describe.each(Object.keys(APPROVED) as (keyof typeof APPROVED)[])("%s approved copy", (locale) => {
    const { privacy } = JSON.parse(read(`locales/${locale}/deepspace.json`));
    const expected = APPROVED[locale];
    it("B-1 states prompt deletion with the statutory retention exception", () => {
      expect(privacy.facts.retention.v).toBe(expected.retention);
    });
    it("B-2 replaces the unmeasured zero with the policy qualification", () => {
      expect(privacy.none).toBe(expected.none);
    });
    it("B-3 states the feature purpose and points to the full policy", () => {
      expect(privacy.status).toBe(expected.status);
    });
    it("B-3 describes a choice without promising prior confirmation for every use", () => {
      expect(privacy.tip).toBe(expected.tip);
    });
    it("A1 discloses server storage and the overseas AI destination", () => {
      expect(privacy.facts.onDevice.v).toBe(expected.processing);
    });
  });

  it.each([
    "design/proto_rev2/reference-app/data/screens/gaps.json",
    "public/proto/data/screens/gaps.json",
  ])("%s renders the approved Korean retention and processing facts", (file) => {
    const { privacyFacts } = JSON.parse(read(file));
    expect(privacyFacts.find((fact: { label: string }) => fact.label === "보관 기간")?.v).toBe(APPROVED.ko.retention);
    expect(privacyFacts.find((fact: { label: string }) => fact.label === "기록 처리")?.v).toBe(APPROVED.ko.processing);
  });

  it("B-2 opens the policy instead of displaying a fixed disclosure count", () => {
    const file = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const screen = ast.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpacePrivacyDesignScreen",
    );
    if (!screen) throw new Error("Privacy screen not found");
    const actions: ts.JsxSelfClosingElement[] = [];
    const attr = (node: ts.JsxSelfClosingElement, name: string) => {
      const prop = node.attributes.properties.find((item): item is ts.JsxAttribute =>
        ts.isJsxAttribute(item) && item.name.getText(ast) === name,
      );
      const init = prop?.initializer;
      return init && ts.isJsxExpression(init) ? init.expression?.getText(ast) : undefined;
    };
    const visit = (node: ts.Node): void => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "Action" &&
        attr(node, "label") === 't("privacy.thirdParty")') actions.push(node);
      ts.forEachChild(node, visit);
    };
    visit(screen);
    expect(actions).toHaveLength(1);
    expect(attr(actions[0], "value")).toBe('t("privacy.view")');
    expect(attr(actions[0], "onPress")).toBe('() => router.push("/privacy-policy")');
    expect(screen.getText(ast)).not.toContain('t("privacy.none")');
    const route = read("src/app/(auth)/privacy-policy.tsx");
    expect(route).toContain("<DeepSpaceLegalDocScreen");
    expect(route).toContain("doc={PRIVACY_DOC}");
  });
});
