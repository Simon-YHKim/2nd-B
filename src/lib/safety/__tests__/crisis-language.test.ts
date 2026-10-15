import { matchAdditionalCrisisLanguage } from "../crisis-language";

// Independent sentences, not a loop over the implementation's phrase list.
// Existing EN/KO decisions and their closed context exceptions are unchanged.
const CRISIS = [
  ["es", "Ahora quiero suicidarme."],
  ["es", "Me quiero suicidar; necesito ayuda."],
  ["es", "Esta noche voy a quitarme la vida."],
  ["es", "No quiero seguir viviendo."],
  ["es", "Me estoy autolesionando."],
  ["pt", "Eu quero me matar."],
  ["pt", "Agora vou tirar a minha vida."],
  ["pt", "Não quero mais viver."],
  ["pt", "Nao quero mais viver."],
  ["pt", "Estou me machucando de propósito."],
  ["id", "Saya ingin bunuh diri."],
  ["id", "Aku mau bunuh diri malam ini."],
  ["id", "Saya ingin mengakhiri hidup saya."],
  ["id", "Aku melukai diri sendiri."],
] as const;

const ORDINARY = [
  "Quiero terminar mi trabajo y descansar.",
  "Voy a cortar las verduras para la cena.",
  "Quiero empezar una vida nueva en otra ciudad.",
  "Hoy estoy cansado y necesito dormir.",
  "Quero terminar o projeto amanhã.",
  "Vou cortar os legumes para o jantar.",
  "Quero mudar minha vida e aprender português.",
  "Estou cansado depois do trabalho.",
  "Saya ingin menyelesaikan pekerjaan ini.",
  "Aku mau tidur setelah makan malam.",
  "Saya ingin mengubah hidup saya.",
  "Lampu kamar saya mati lagi.",
  "xquiero suicidarme", "quiero suicidarmex",
  "équiero suicidarme", "quiero suicidarmeé",
  "𐐀quiero suicidarme", "quiero suicidarme𐐀",
  "_ingin bunuh diri", "ingin bunuh diri_",
] as const;

describe("additional-language crisis phrases", () => {
  test.each(CRISIS)("recognizes an explicit %s claim: %s", (language, text) => {
    expect(matchAdditionalCrisisLanguage(text)?.language).toBe(language);
    expect(matchAdditionalCrisisLanguage(text.toUpperCase())?.language).toBe(language);
    expect(matchAdditionalCrisisLanguage(text.normalize("NFD"))?.language).toBe(language);
    expect(matchAdditionalCrisisLanguage(text.replace(/ /g, "\n\u00a0"))?.language).toBe(language);
  });

  test.each(ORDINARY)("does not match this ordinary or embedded text: %s", (text) => {
    expect(matchAdditionalCrisisLanguage(text)).toBeNull();
  });


  test.each([
    "No quiero suicidarme.", "Eu não quero me matar.",
    "Saya tidak ingin bunuh diri.", "Aku nggak mau bunuh diri.",
    'Ella dijo: "quiero suicidarme".',
    'Ontem eu disse "quero me matar".',
    'Kemarin saya menulis "ingin bunuh diri".',
  ])("keeps unresolved negation/quotation/past context visible: %s", (text) => {
    expect(matchAdditionalCrisisLanguage(text)).not.toBeNull();
  });

  test("keeps scanning after an embedded first occurrence", () => {
    expect(matchAdditionalCrisisLanguage("xquiero suicidarme. Ahora quiero suicidarme.")?.language).toBe("es");
  });

  test("does not interpret a UI locale or return a phone number", () => {
    expect(matchAdditionalCrisisLanguage("Saya ingin bunuh diri.")).toEqual({
      language: "id", phrase: "ingin bunuh diri",
    });
  });

  test.each([
    ["es", "No quiero suicidarme, pero me estoy autolesionando."],
    ["es", "No, quiero suicidarme."],
    ["pt", "Não quero me matar, mas estou me machucando de propósito."],
    ["id", "Saya tidak mau bunuh diri, tapi aku melukai diri sendiri."],
  ])("does not let a negated claim hide a later %s claim", (language, text) => {
    expect(matchAdditionalCrisisLanguage(text)?.language).toBe(language);
  });
});
