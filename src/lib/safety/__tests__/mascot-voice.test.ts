import { mascotVoiceViolations } from "../mascot-voice";

describe("mascot copy policy", () => {
  test.each([
    "Hola. Puedes omitir esta pregunta.",
    "Olá. Você pode pular esta pergunta.",
    "Halo. Kamu boleh melewati pertanyaan ini.",
  ])("allows translated opt-out instructions without invented evidence: %s", text => {
    expect(mascotVoiceViolations(text, { requireSource: true })).toEqual([]);
  });

  test.each([
    "No digas 'te quiero'.", "Não diga 'eu te amo'.", "Jangan mengatakan 'aku sayang kamu'.",
  ])("recognizes a local prohibition only inside an instruction: %s", text => {
    expect(mascotVoiceViolations(text, { instruction: true })).toEqual([]);
    expect(mascotVoiceViolations(text)).toContain("attachment-or-overclaim");
  });

  test.each([
    "No digas 'te quiero', pero te extrañé.",
    "Não diga 'eu te amo', mas senti saudades de você.",
    "Jangan mengatakan 'aku sayang kamu', tetapi aku merindukanmu.",
    "No digas 'te quiero' y te conozco mejor que tú mismo.",
    "Não diga 'eu te amo' e eu sei o que você sente.",
    "Jangan mengatakan 'aku sayang kamu' dan aku tahu apa yang kamu rasakan.",
  ])("a translated prohibition cannot excuse a separate claim: %s", text => {
    expect(mascotVoiceViolations(text, { instruction: true })).toContain("attachment-or-overclaim");
  });

  test.each([
    "Tus registros están aquí, pero siempre evitas las decisiones difíciles.",
    "Seus registros estão aqui, mas você sempre evita decisões difíceis.",
    "Catatanmu ada di sini, tetapi kamu selalu menghindari keputusan sulit.",
  ])("requires evidence in each translated assertion: %s", text => {
    expect(mascotVoiceViolations(text, { requireSource: true })).toContain("unsourced-claim");
  });
  test.each([
    "안녕하세요. 무엇부터 이야기할까요?",
    "반가워요. 기록을 골라 보세요.",
    "Hello. Choose a record to open.",
    "Hola. ¿Qué quieres mirar?",
    "Olá. Escolha um registro.",
    "Halo. Pilih catatan.",
    "친구처럼 편하게 말해도 돼요.",
    "기록을 같이 들여다볼까요?",
    "Hello, {{who}}.",
    "반가워요. 편한 주제부터 이야기해 주세요.",
    "You can skip this question.",
  ])("allows ordinary warmth and instructions: %s", text => {
    expect(mascotVoiceViolations(text, { requireSource: true })).toEqual([]);
  });

  test.each([
    "I missed you.", "I'm always here for you.", "Don't leave me.",
    "당신을 사랑해요.", "당신의 마음을 알아요.",
    "I'm your only friend.", "너에게는 나만 있으면 돼.",
  ])("still rejects attachment or mind-reading: %s", text => {
    expect(mascotVoiceViolations(text)).toContain("attachment-or-overclaim");
  });

  test.each([
    "You always avoid difficult decisions.",
    "어려운 결정을 피하는 편이에요.",
    "반가워요. 당신은 책임감이 강해요.",
    "Your records are here. You never face a challenge.",
    "기록을 열어보세요. 책임감이 강한 사람이에요.",
    "A hidden pattern reveals your true character.",
    "Your records are ready, but you always avoid difficult decisions.",
    "기록이 있어요, 하지만 당신은 책임감이 없어요.",
    "Choose a note, you are always careless.",
    "Choose a note and you are always careless.",
  ])("requires evidence for each personal assertion: %s", text => {
    expect(mascotVoiceViolations(text, { requireSource: true })).toContain("unsourced-claim");
  });

  test.each([
    "기록에서 회의를 미뤘다는 내용이 두 번 나와요. 나와 맞는지 확인해 보세요.",
    "Here are things that come up often in your records. Check whether they fit you.",
    "Aquí está lo que se repite en tus registros. Comprueba si encaja contigo.",
    "Veja o que se repete nos seus registros. Você pode conferir as fontes e decidir o que fazer a seguir.",
    "Lihat pola yang berulang di catatanmu.",
  ])("allows sourced observations and next actions: %s", text => {
    expect(mascotVoiceViolations(text, { requireSource: true })).toEqual([]);
  });

  test("exempts a prohibition only in an instruction field", () => {
    const text = "Never say 'I missed you'.";
    expect(mascotVoiceViolations(text, { instruction: true })).toEqual([]);
    expect(mascotVoiceViolations(text)).toContain("attachment-or-overclaim");
  });

  test.each([
    "Never invent facts. I'm always here for you.",
    "Do not invent facts, but I missed you.",
    "Never invent facts, I love you.",
    "Never invent facts and I love you.",
    "Never say 'I missed you', I'm always here for you.",
    "Never say 'I missed you'; don't leave me.",
    "Do not say 'I love you'; stay with me.",
    "추측하지 마세요. 당신을 사랑해요.",
    "사실을 지어내지 마세요. 당신의 마음을 알아요.",
  ])("a separate prohibition cannot conceal a claim: %s", text => {
    expect(mascotVoiceViolations(text, { instruction: true })).toContain("attachment-or-overclaim");
  });

  test("permits a quoted Korean prohibition in a prompt", () => {
    expect(mascotVoiceViolations("'당신을 사랑해요'라고 말하지 마세요.", { instruction: true })).toEqual([]);
  });
});
