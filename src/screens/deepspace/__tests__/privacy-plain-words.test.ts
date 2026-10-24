// Z76 / T09: the privacy summary uses everyday words, and its legal links work.
// Source contracts avoid importing the React Native renderer (RN 0.85).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const ast = ts.createSourceFile(FILE, read(FILE), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = ast.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpacePrivacyDesignScreen",
);
if (!screen) throw new Error("Privacy screen not found");

function attribute(node: ts.JsxSelfClosingElement, name: string): string | undefined {
  const attr = node.attributes.properties.find((prop): prop is ts.JsxAttribute =>
    ts.isJsxAttribute(prop) && prop.name.getText(ast) === name,
  );
  const init = attr?.initializer;
  return init && ts.isJsxExpression(init) ? init.expression?.getText(ast) : undefined;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const JARGON = {
  ko: /온디바이스|파생\s*신호|렌즈\s*점수|벡터|GA4|색인/i,
  en: /on.device\s+first|derived\s+signals?|lens\s+scores?|vectors?|GA4|index(?:ed|ing)?|semantic/i,
  es: /primero en el dispositivo|señales derivadas|puntuaciones de lentes|vectores|GA4|index(?:a|ar)/i,
  pt: /primeiro no dispositivo|sinais derivados|pontuações de lentes|vetores|GA4|index(?:a|ar)/i,
  id: /diproses di perangkat lebih dulu|sinyal turun|skor lensa|vektor|GA4|diindeks/i,
};
const LABELS = {
  ko: ["이용약관", "환불 정책"],
  en: ["Terms of service", "Refund policy"],
  es: ["Términos de servicio", "Política de reembolso"],
  pt: ["Termos de uso", "Política de reembolso"],
  id: ["Ketentuan layanan", "Kebijakan pengembalian dana"],
};
const locales = Object.keys(JARGON) as (keyof typeof JARGON)[];

// Pin each disclosure where the user reads it, not a bag of words from the whole screen.
// These clauses preserve the condition, action and object together in each language.
const FACTS = {
  ko: {
    collect: /위치·통신 자료는 동의할 때만 모읍니다\./,
    stored: /기록은 서버에 저장하고/,
    sent: /AI 기능을 쓸 때 필요한 내용은 국외 AI 제공사로 보냅니다/,
    removed: /끄면 연결용 데이터만 삭제하고 기록은 남깁니다/,
    applied: /^웹 Google Analytics에 선택 반영 · Android 사용 통계 꺼짐$/,
  },
  en: {
    collect: /Location and communications data are collected only with your consent\./,
    stored: /Records are stored on the server/,
    sent: /Content needed for AI features is sent to overseas AI providers/,
    removed: /Turning this off removes connection data and keeps your records/,
    applied: /^Choice applies to web Google Analytics · Android usage statistics off$/,
  },
  es: {
    collect: /Los datos de ubicación y comunicaciones solo se recopilan con tu consentimiento\./,
    stored: /Los registros se guardan en el servidor/,
    sent: /El contenido necesario para las funciones de IA se envía a los proveedores de IA/,
    removed: /Al desactivar, se borran los datos para las conexiones y se conservan tus registros/,
    applied: /^La elección se aplica a Google Analytics en la web · Estadísticas de uso desactivadas en Android$/,
  },
  pt: {
    collect: /Os dados de localização e comunicações só são coletados com seu consentimento\./,
    stored: /Os registros ficam salvos no servidor/,
    sent: /O conteúdo necessário para as funções de IA é enviado aos fornecedores de IA/,
    removed: /Ao desligar, os dados usados nas conexões são excluídos e seus registros ficam salvos/,
    applied: /^A escolha vale para o Google Analytics na web · Estatísticas de uso desativadas no Android$/,
  },
  id: {
    collect: /Data lokasi dan komunikasi hanya dikumpulkan dengan persetujuanmu\./,
    stored: /Catatan disimpan di server/,
    sent: /Konten yang diperlukan untuk fitur AI dikirim ke penyedia AI/,
    removed: /Jika dimatikan, data untuk menghubungkan catatan dihapus dan catatanmu tetap tersimpan/,
    applied: /^Pilihan berlaku untuk Google Analytics di web · Statistik penggunaan nonaktif di Android$/,
  },
};

describe("privacy plain words and legal links (Z76)", () => {
  it("puts terms and refund immediately after the policy, in the same card, with working routes", () => {
    const actions: ts.JsxSelfClosingElement[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "Action") actions.push(node);
      ts.forEachChild(node, visit);
    };
    visit(screen);
    const legal = ["policy", "terms", "refund"].map((key) => {
      const matches = actions.filter((node) => attribute(node, "label") === `t("privacy.${key}")`);
      expect(matches).toHaveLength(1);
      return matches[0];
    });
    const parent = legal[0].parent;
    expect(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(ast)).toBe("Card");
    legal.forEach((node, i) => {
      expect(node.parent).toBe(parent);
      expect(attribute(node, "value")).toBe('t("privacy.view")');
      const route = ["privacy-policy", "terms", "refund"][i];
      expect(attribute(node, "onPress")).toBe(`() => router.push("/${route}")`);
      expect(read(`src/app/(auth)/${route}.tsx`)).toContain("DeepSpaceLegalDocScreen");
    });
    if (!ts.isJsxElement(parent)) throw new Error("Legal links have no card");
    const siblings = parent.children.filter((node) => !(ts.isJsxText(node) ||
      (ts.isJsxExpression(node) && !node.expression)));
    const start = siblings.indexOf(legal[0]);
    expect(siblings.slice(start, start + 3)).toEqual(legal);
  });

  it.each(locales)("%s privacy copy has no retired or developer terms", (locale) => {
    const { privacy } = JSON.parse(read(`locales/${locale}/deepspace.json`));
    const copy = strings(privacy);
    expect(copy.length).toBeGreaterThan(50);
    expect(copy.filter((value) => JARGON[locale].test(value))).toEqual([]);
  });

  it.each(locales)("%s names both legal documents and keeps the analytics providers", (locale) => {
    const { privacy } = JSON.parse(read(`locales/${locale}/deepspace.json`));
    expect([privacy.terms, privacy.refund]).toEqual(LABELS[locale]);
    for (const provider of ["Google Analytics", "Firebase Analytics", "Microsoft Clarity"]) {
      expect(privacy.analytics.adultLead).toContain(provider);
    }
    expect(privacy.analytics.applied).toContain("Google Analytics");
  });

  describe.each(locales)("%s required facts", (locale) => {
    const { privacy } = JSON.parse(read(`locales/${locale}/deepspace.json`));
    const fact = FACTS[locale];
    it("collect requires consent for both location and communications", () => {
      expect(privacy.facts.collect.v).toMatch(fact.collect);
    });
    it("processing says server storage and transmission to AI providers", () => {
      expect(privacy.facts.onDevice.v).toMatch(fact.stored);
      expect(privacy.facts.onDevice.v).toMatch(fact.sent);
    });
    it("turning connections off removes connection data and retains records", () => {
      expect(privacy.semantic.onBody).toMatch(fact.removed);
    });
    it("the analytics choice applies on web while Android statistics stay off", () => {
      expect(privacy.analytics.applied).toMatch(fact.applied);
    });
  });

  it.each([
    "design/proto_rev2/reference-app/data/screens/gaps.json",
    "public/proto/data/screens/gaps.json",
  ])("%s retains the collection condition in the Korean fact actually rendered", (file) => {
    const { privacyFacts } = JSON.parse(read(file));
    const fact = privacyFacts.find((entry: { label: string }) => entry.label === "수집 항목");
    expect(fact?.v).toMatch(FACTS.ko.collect);
  });
});
