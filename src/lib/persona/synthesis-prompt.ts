// System instruction for the persona NARRATIVE synthesis — the single LLM call
// in buildPersona that summarizes a person's own entries back to them.
//
// WHY (2026-06-28 AI-rigor research): build.ts previously passed NO system prompt
// for purpose "persona_chat", so the model ran UNGUIDED on the raw entries. That
// is exactly where the documented failure modes bite a self-knowledge app:
//   - fabrication / post-rationalization — inventing traits or causes the entries
//     don't support ("grounded in your data" is not self-proving),
//   - the Barnum/Forer effect — vague, flattering, could-fit-anyone verdicts that
//     feel accurate regardless of truth,
//   - sycophancy — agreeing with and amplifying a self-judgment the person wrote
//     instead of mirroring what the entries actually show.
// This instruction encodes the research's countermeasures (ground in the entries,
// pattern-not-verdict, balanced-not-flattering, calibrated/tentative, third-person
// about the data, no unique-greatness flattery that misfires across cultures).
//
// LLM-meta is in English (models follow it reliably); output is kept in the user's
// language. It rides the TRUSTED system channel (not crisis-scanned) and is purely
// a framing constraint, so C9/C3 (the user-channel crisis gate + audit) are
// unaffected. Deliberately free of clinical vocabulary (lexicon policy).
//
// NOTE: per the research, a prompt is necessary but NOT sufficient (it does not by
// itself eliminate sycophancy/fabrication). The structural complement already
// shipped is the verifiable receipts surface (the user can open the cited record).
// This change should be validated with output telemetry, not assumed perfect.

export function personaSynthesisSystem(locale: "en" | "ko"): string {
  const lang = locale === "ko" ? "Korean" : "English";
  return [
    "You reflect a person's OWN recent journal and audit entries back to them, for self-understanding (not advice).",
    "Rules:",
    "1. Ground every observation ONLY in the entries provided. Never invent traits, causes, or events that are not in the entries. If the entries are thin or mixed, say so plainly instead of filling the gap.",
    '2. Describe the PATTERN IN THE ENTRIES ("these entries keep returning to...", "a few mention..."), not flattering verdicts about the person ("you are so..."). Avoid generic, could-fit-anyone statements.',
    "3. Be honest and balanced, not reassuring. Where the entries show a tension or an open question, name it. Do NOT simply agree with or amplify a self-judgment the person wrote -- reflect what the entries actually show, even when it differs.",
    '4. Use tentative, calibrated language ("seems", "in these entries"), never certainty about who they are.',
    "5. Do not label the person; make no claim beyond what the entries support. Avoid flattery about unique inner greatness -- it reads as inaccurate and lands differently across cultures.",
    `6. Keep it warm and plain: 2-3 short sentences, written in ${lang}.`,
  ].join("\n");
}
