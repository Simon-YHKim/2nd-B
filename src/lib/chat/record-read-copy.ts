// Q-71/Q-72: approved 2026-10-13 copy, legal's pre-S4 retention recommendation.
// The consent/policy/terms tuple remains an external activation condition.
type ConsentLine = Readonly<{ label: string; text: string }>;
type RetentionLine = ConsentLine & Readonly<{ link: { label: string; section: "5" } }>;
export type RecordReadCopy = Readonly<{
  version: string | null;
  title: string;
  lines: readonly [ConsentLine, ConsentLine, ConsentLine, RetentionLine, ConsentLine];
  smallPrint: string;
  ack: string;
  agree: string;
  notNow: string;
  afterPress: Readonly<{ agreed: string; declined: string }>;
  settings: Readonly<{
    name: string; off: string; enable: string; confirmEnable: string;
    on: string; disable: string; justDisabled: string; minor: string;
  }>;
}>;

export function recordReadCopy(t: (key: string) => string, version: string | null = null): RecordReadCopy {
  const line = (name: string): ConsentLine => ({ label: t(`recordRead.lines.${name}.label`), text: t(`recordRead.lines.${name}.text`) });
  return {
    version, title: t("recordRead.title"),
    lines: [line("sent"), line("purpose"), line("recipient"),
      { ...line("retention"), link: { label: t("recordRead.policyClause"), section: "5" } }, line("choice")],
    smallPrint: t("recordRead.smallPrint"), ack: t("recordRead.ack"),
    agree: t("recordRead.agree"), notNow: t("recordRead.notNow"),
    afterPress: { agreed: t("recordRead.afterPress.agreed"), declined: t("recordRead.afterPress.declined") },
    settings: {
      name: t("recordRead.setting"), off: t("recordRead.settings.off"), enable: t("recordRead.settings.enable"),
      confirmEnable: t("recordRead.settings.confirmEnable"), on: t("recordRead.settings.on"),
      disable: t("recordRead.settings.disable"), justDisabled: t("recordRead.settings.justDisabled"), minor: t("recordRead.settings.minor"),
    },
  };
}
