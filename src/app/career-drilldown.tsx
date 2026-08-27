// 커리어 Drill Down — rev2 3C4P (P4d 잔여). A career achievement decomposed as
// 3C = "왜 했는가"(Customer/Company/Competitor) + 4P = "무엇을 · 어떻게"
// (Product/Place/Price/Promotion). Pure input scaffolding (prototype
// sb-drilldown 1:1): nothing persists here — submit seeds a 세컨비 chat draft
// (the qualitative complement to /career's structured 성과 담기), reusing the
// existing /secondb fromNode prefill contract.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { composeStructured } from "@/lib/capture/structured";
import { deepSpace, flattenAlpha, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

type CareerCopyLocale = "en" | "ko" | "es" | "pt" | "id";

interface DdField {
  key: string;
  label: string;
  hint: string;
  multiline?: boolean;
}

interface DdGroup {
  id: string;
  name: string;
  kr: string;
  fields: DdField[];
}

interface DdBand {
  code: "3C" | "4P";
  label: string;
  why: string;
  groups: DdGroup[];
}

const CAREER_COPY: Record<
  CareerCopyLocale,
  { title: string; seedPrefix: string; typeLineLabel: string; expTypes: string[]; bands: DdBand[] }
> = {
  en: {
    title: "Drill down",
    seedPrefix: "Drill down",
    typeLineLabel: "Type",
    expTypes: [
      "Study",
      "School project",
      "Campus club",
      "External activity",
      "Research or development",
      "Contest or competition",
      "Internship",
      "Part-time work",
      "Contract or dispatch role",
      "Full-time role",
      "Business, startup, or side project",
    ],
    bands: [
      {
        code: "3C",
        label: "Why you did it",
        why: "Why",
        groups: [
          {
            id: "customer",
            name: "Customer",
            kr: "Beneficiary",
            fields: [
              { key: "c_target", label: "Who benefited", hint: "Example: people in their 20s and 30s who dropped off right after signup" },
              { key: "c_need", label: "What they needed", hint: "Example: quickly understanding what to do after signup" },
            ],
          },
          {
            id: "company",
            name: "Company",
            kr: "Team",
            fields: [
              { key: "o_org", label: "Where you belonged", hint: "Example: Nova Tech Company, design platform team" },
              { key: "o_goal", label: "Your or your team's goal", hint: "Example: raise onboarding completion" },
              { key: "o_problem", label: "Problem, cause, or opportunity", hint: "Example: 40% dropped at step 1 because the first screen had too much information", multiline: true },
              { key: "o_role", label: "Your role in the team", hint: "Example: flow design and experiment lead" },
            ],
          },
          {
            id: "competitor",
            name: "Competitor",
            kr: "Reference",
            fields: [
              { key: "x_subject", label: "What you researched", hint: "Example: onboarding flows from three similar apps" },
              { key: "x_applied", label: "What you applied after research", hint: "Example: compressed three steps into one and added progress feedback", multiline: true },
            ],
          },
        ],
      },
      {
        code: "4P",
        label: "What and how",
        why: "What + How",
        groups: [
          {
            id: "product",
            name: "Product",
            kr: "Outcome",
            fields: [
              { key: "p_result", label: "Result", hint: "Example: onboarding completion rose from 52% to 71%" },
              { key: "p_meaning", label: "What the result meant", hint: "Example: new-user 30-day retention rose too, showing the first experience mattered", multiline: true },
            ],
          },
          {
            id: "place",
            name: "Place",
            kr: "Channel",
            fields: [
              { key: "l_where", label: "Where the solution worked", hint: "Example: first app launch onboarding and push reminders" },
            ],
          },
          {
            id: "price",
            name: "Price",
            kr: "Efficiency",
            fields: [
              { key: "r_productivity", label: "Productivity angle", hint: "Example: onboarding-related support requests dropped 30%" },
            ],
          },
          {
            id: "promotion",
            name: "Promotion",
            kr: "Sharing",
            fields: [
              { key: "m_share", label: "How it was shared", hint: "Example: shared the improvement story in the team weekly and blog" },
            ],
          },
        ],
      },
    ],
  },
  ko: {
    title: "Drill Down",
    seedPrefix: "Drill Down",
    typeLineLabel: "유형",
    expTypes: [
      "학업",
      "학교 프로젝트",
      "교내 동아리",
      "대외활동 (교외 동아리)",
      "연구/개발",
      "공모전/대회",
      "인턴",
      "아르바이트",
      "계약직/파견직",
      "정규 입사 경험",
      "개인 사업/창업/사이드 프로젝트",
    ],
    bands: [
      {
        code: "3C",
        label: "왜 했는가",
        why: "Why",
        groups: [
          {
            id: "customer",
            name: "Customer",
            kr: "고객",
            fields: [
              { key: "c_target", label: "혜택을 받는 대상", hint: "예) 가입 직후 이탈하던 20-30대" },
              { key: "c_need", label: "대상이 필요로 한 것", hint: "예) 가입 직후 '뭘 해야 할지' 빠르게 아는 것" },
            ],
          },
          {
            id: "company",
            name: "Company",
            kr: "자사",
            fields: [
              { key: "o_org", label: "내가 속했던 곳", hint: "예) 테크컴퍼니 노바 · 디자인 플랫폼팀" },
              { key: "o_goal", label: "본인(팀)의 목표", hint: "예) 온보딩 완료율을 끌어올리기" },
              { key: "o_problem", label: "문제 · 원인 (혹은 기회 상황)", hint: "예) 1단계에서 40% 이탈, 첫 화면 정보 과다", multiline: true },
              { key: "o_role", label: "팀 내에서 나의 역할", hint: "예) 플로우 설계 · 실험 리드" },
            ],
          },
          {
            id: "competitor",
            name: "Competitor",
            kr: "경쟁사",
            fields: [
              { key: "x_subject", label: "조사한 대상", hint: "예) 동종 앱 3종의 온보딩 플로우" },
              { key: "x_applied", label: "조사 후 적용한 내용", hint: "예) 3단계를 1단계로 압축, 진행률 표시 도입", multiline: true },
            ],
          },
        ],
      },
      {
        code: "4P",
        label: "무엇을 · 어떻게",
        why: "What + How",
        groups: [
          {
            id: "product",
            name: "Product",
            kr: "상품",
            fields: [
              { key: "p_result", label: "결과", hint: "예) 온보딩 완료율 52%에서 71%" },
              { key: "p_meaning", label: "결과의 의미", hint: "예) 신규 30일 잔존이 동반 상승, 첫 경험이 핵심", multiline: true },
            ],
          },
          {
            id: "place",
            name: "Place",
            kr: "위치",
            fields: [
              { key: "l_where", label: "문제 해결을 할 수 있었던 장소 · 지점 · 채널", hint: "예) 앱 첫 실행 온보딩 · 푸시 리마인드" },
            ],
          },
          {
            id: "price",
            name: "Price",
            kr: "가격",
            fields: [
              { key: "r_productivity", label: "생산성 관점 (비용 감소 · 효율 · 시간 단축 등)", hint: "예) 온보딩 관련 CS 문의 30% 감소" },
            ],
          },
          {
            id: "promotion",
            name: "Promotion",
            kr: "마케팅",
            fields: [
              { key: "m_share", label: "알리기 관점", hint: "예) 개선 사례를 사내 위클리·블로그로 공유" },
            ],
          },
        ],
      },
    ],
  },
  es: {
    title: "Profundizar",
    seedPrefix: "Profundizar",
    typeLineLabel: "Tipo",
    expTypes: [
      "Estudios",
      "Proyecto escolar",
      "Club del campus",
      "Actividad externa",
      "Investigación o desarrollo",
      "Concurso o competencia",
      "Prácticas",
      "Trabajo a tiempo parcial",
      "Contrato o puesto temporal",
      "Puesto de tiempo completo",
      "Negocio, startup o proyecto paralelo",
    ],
    bands: [
      {
        code: "3C",
        label: "Por que lo hiciste",
        why: "Por que",
        groups: [
          {
            id: "customer",
            name: "Customer",
            kr: "Beneficiario",
            fields: [
              { key: "c_target", label: "Quien recibio el beneficio", hint: "Ejemplo: personas de 20 a 39 anos que abandonaban justo despues de registrarse" },
              { key: "c_need", label: "Que necesitaban", hint: "Ejemplo: entender rapido que hacer despues del registro" },
            ],
          },
          {
            id: "company",
            name: "Company",
            kr: "Equipo",
            fields: [
              { key: "o_org", label: "Donde estabas", hint: "Ejemplo: Nova Tech Company, equipo de plataforma de diseno" },
              { key: "o_goal", label: "Objetivo tuyo o del equipo", hint: "Ejemplo: aumentar la finalizacion del onboarding" },
              { key: "o_problem", label: "Problema, causa u oportunidad", hint: "Ejemplo: 40% abandonaba en el paso 1 porque la primera pantalla tenia demasiada informacion", multiline: true },
              { key: "o_role", label: "Tu rol en el equipo", hint: "Ejemplo: diseno del flujo y liderazgo del experimento" },
            ],
          },
          {
            id: "competitor",
            name: "Competitor",
            kr: "Referencia",
            fields: [
              { key: "x_subject", label: "Que investigaste", hint: "Ejemplo: flujos de onboarding de tres apps similares" },
              { key: "x_applied", label: "Que aplicaste despues", hint: "Ejemplo: comprimiste tres pasos en uno y agregaste feedback de progreso", multiline: true },
            ],
          },
        ],
      },
      {
        code: "4P",
        label: "Que y como",
        why: "Que + como",
        groups: [
          {
            id: "product",
            name: "Product",
            kr: "Resultado",
            fields: [
              { key: "p_result", label: "Resultado", hint: "Ejemplo: la finalizacion del onboarding subio de 52% a 71%" },
              { key: "p_meaning", label: "Que significo el resultado", hint: "Ejemplo: tambien subio la retencion a 30 dias, asi que la primera experiencia importaba", multiline: true },
            ],
          },
          {
            id: "place",
            name: "Place",
            kr: "Canal",
            fields: [
              { key: "l_where", label: "Donde funciono la solucion", hint: "Ejemplo: onboarding del primer inicio y recordatorios push" },
            ],
          },
          {
            id: "price",
            name: "Price",
            kr: "Eficiencia",
            fields: [
              { key: "r_productivity", label: "Angulo de productividad", hint: "Ejemplo: las consultas de soporte sobre onboarding bajaron 30%" },
            ],
          },
          {
            id: "promotion",
            name: "Promotion",
            kr: "Difusion",
            fields: [
              { key: "m_share", label: "Como se compartio", hint: "Ejemplo: compartiste la mejora en la reunion semanal y el blog del equipo" },
            ],
          },
        ],
      },
    ],
  },
  pt: {
    title: "Aprofundar",
    seedPrefix: "Aprofundar",
    typeLineLabel: "Tipo",
    expTypes: [
      "Estudos",
      "Projeto escolar",
      "Clube acadêmico",
      "Atividade externa",
      "Pesquisa ou desenvolvimento",
      "Concurso ou competição",
      "Estágio",
      "Trabalho de meio período",
      "Contrato ou função temporária",
      "Cargo efetivo",
      "Negócio, startup ou projeto paralelo",
    ],
    bands: [
      {
        code: "3C",
        label: "Por que voce fez",
        why: "Por que",
        groups: [
          {
            id: "customer",
            name: "Customer",
            kr: "Beneficiario",
            fields: [
              { key: "c_target", label: "Quem recebeu o beneficio", hint: "Exemplo: pessoas de 20 a 39 anos que abandonavam logo apos o cadastro" },
              { key: "c_need", label: "O que elas precisavam", hint: "Exemplo: entender rapidamente o que fazer depois do cadastro" },
            ],
          },
          {
            id: "company",
            name: "Company",
            kr: "Equipe",
            fields: [
              { key: "o_org", label: "Onde voce estava", hint: "Exemplo: Nova Tech Company, equipe de plataforma de design" },
              { key: "o_goal", label: "Meta sua ou da equipe", hint: "Exemplo: aumentar a conclusao do onboarding" },
              { key: "o_problem", label: "Problema, causa ou oportunidade", hint: "Exemplo: 40% desistiam na etapa 1 porque a primeira tela tinha informacao demais", multiline: true },
              { key: "o_role", label: "Seu papel na equipe", hint: "Exemplo: desenho do fluxo e lideranca do experimento" },
            ],
          },
          {
            id: "competitor",
            name: "Competitor",
            kr: "Referencia",
            fields: [
              { key: "x_subject", label: "O que voce pesquisou", hint: "Exemplo: fluxos de onboarding de tres apps parecidos" },
              { key: "x_applied", label: "O que voce aplicou depois", hint: "Exemplo: comprimiu tres etapas em uma e adicionou feedback de progresso", multiline: true },
            ],
          },
        ],
      },
      {
        code: "4P",
        label: "O que e como",
        why: "O que + como",
        groups: [
          {
            id: "product",
            name: "Product",
            kr: "Resultado",
            fields: [
              { key: "p_result", label: "Resultado", hint: "Exemplo: a conclusao do onboarding subiu de 52% para 71%" },
              { key: "p_meaning", label: "O que o resultado significou", hint: "Exemplo: a retencao de 30 dias tambem subiu, mostrando que a primeira experiencia importava", multiline: true },
            ],
          },
          {
            id: "place",
            name: "Place",
            kr: "Canal",
            fields: [
              { key: "l_where", label: "Onde a solucao funcionou", hint: "Exemplo: onboarding do primeiro uso e lembretes push" },
            ],
          },
          {
            id: "price",
            name: "Price",
            kr: "Eficiencia",
            fields: [
              { key: "r_productivity", label: "Angulo de produtividade", hint: "Exemplo: chamados de suporte sobre onboarding cairam 30%" },
            ],
          },
          {
            id: "promotion",
            name: "Promotion",
            kr: "Divulgacao",
            fields: [
              { key: "m_share", label: "Como foi compartilhado", hint: "Exemplo: compartilhou a melhoria na reuniao semanal e no blog da equipe" },
            ],
          },
        ],
      },
    ],
  },
  id: {
    title: "Telusuri lebih dalam",
    seedPrefix: "Telusuri",
    typeLineLabel: "Jenis",
    expTypes: [
      "Studi",
      "Proyek sekolah",
      "Klub kampus",
      "Kegiatan eksternal",
      "Riset atau pengembangan",
      "Kontes atau kompetisi",
      "Magang",
      "Kerja paruh waktu",
      "Kontrak atau peran sementara",
      "Peran penuh waktu",
      "Bisnis, startup, atau proyek sampingan",
    ],
    bands: [
      {
        code: "3C",
        label: "Mengapa kamu melakukannya",
        why: "Mengapa",
        groups: [
          {
            id: "customer",
            name: "Customer",
            kr: "Penerima manfaat",
            fields: [
              { key: "c_target", label: "Siapa yang mendapat manfaat", hint: "Contoh: pengguna usia 20-an dan 30-an yang keluar tepat setelah daftar" },
              { key: "c_need", label: "Apa yang mereka butuhkan", hint: "Contoh: cepat memahami apa yang perlu dilakukan setelah daftar" },
            ],
          },
          {
            id: "company",
            name: "Company",
            kr: "Tim",
            fields: [
              { key: "o_org", label: "Tempat kamu berada", hint: "Contoh: Nova Tech Company, tim platform desain" },
              { key: "o_goal", label: "Tujuan kamu atau tim", hint: "Contoh: menaikkan penyelesaian onboarding" },
              { key: "o_problem", label: "Masalah, penyebab, atau peluang", hint: "Contoh: 40% keluar di langkah 1 karena layar pertama terlalu padat informasi", multiline: true },
              { key: "o_role", label: "Peran kamu di tim", hint: "Contoh: desain alur dan pemimpin eksperimen" },
            ],
          },
          {
            id: "competitor",
            name: "Competitor",
            kr: "Referensi",
            fields: [
              { key: "x_subject", label: "Apa yang kamu teliti", hint: "Contoh: alur onboarding dari tiga aplikasi serupa" },
              { key: "x_applied", label: "Apa yang kamu terapkan setelahnya", hint: "Contoh: memadatkan tiga langkah menjadi satu dan menambah umpan balik progres", multiline: true },
            ],
          },
        ],
      },
      {
        code: "4P",
        label: "Apa dan bagaimana",
        why: "Apa + bagaimana",
        groups: [
          {
            id: "product",
            name: "Product",
            kr: "Hasil",
            fields: [
              { key: "p_result", label: "Hasil", hint: "Contoh: penyelesaian onboarding naik dari 52% ke 71%" },
              { key: "p_meaning", label: "Makna hasil itu", hint: "Contoh: retensi 30 hari pengguna baru ikut naik, jadi pengalaman pertama memang penting", multiline: true },
            ],
          },
          {
            id: "place",
            name: "Place",
            kr: "Kanal",
            fields: [
              { key: "l_where", label: "Di mana solusi bekerja", hint: "Contoh: onboarding saat pertama membuka aplikasi dan pengingat push" },
            ],
          },
          {
            id: "price",
            name: "Price",
            kr: "Efisiensi",
            fields: [
              { key: "r_productivity", label: "Sudut produktivitas", hint: "Contoh: pertanyaan dukungan terkait onboarding turun 30%" },
            ],
          },
          {
            id: "promotion",
            name: "Promotion",
            kr: "Berbagi",
            fields: [
              { key: "m_share", label: "Bagaimana dibagikan", hint: "Contoh: membagikan cerita perbaikan di weekly tim dan blog" },
            ],
          },
        ],
      },
    ],
  },
};

function careerLocale(language: string | undefined): CareerCopyLocale {
  const base = language?.split("-")[0];
  return base === "ko" || base === "es" || base === "pt" || base === "id" ? base : "en";
}

export default function CareerDrilldown() {
  const { t, i18n } = useTranslation("deepspace");
  const copy = CAREER_COPY[careerLocale(i18n.resolvedLanguage ?? i18n.language)];
  const isKo = careerLocale(i18n.resolvedLanguage ?? i18n.language) === "ko";
  const { userId, loading } = useAuth();

  const [summary, setSummary] = useState("");
  const [expType, setExpType] = useState<string | null>(null);
  // The navigation used to run whether or not the save worked. It does not any more, so
  // the failure has to be visible: otherwise the button simply does nothing forever.
  const [saveErr, setSaveErr] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filled = useMemo(
    () => summary.trim().length > 0 || Object.values(values).some((v) => v.trim().length > 0),
    [summary, values],
  );

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const setField = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  // 0066: persist the drill-down as a record FIRST (human-readable body +
  // machine-readable structured payload), then seed the 세컨비 chat via the
  // existing /secondb fromNode prefill contract. Best-effort save: a network
  // miss still opens the chat so the user's flow is never blocked.
  const submit = async () => {
    const head = summary.trim().length > 0 ? summary.trim() : t("deepspace:careerDrilldown.summaryFallback");
    const seed = expType ? `${copy.seedPrefix} · ${head} · ${expType}` : `${copy.seedPrefix} · ${head}`;
    if (!saving && userId) {
      setSaving(true);
      try {
        const labelOf: Record<string, string> = {};
        for (const band of copy.bands) for (const g of band.groups) for (const f of g.fields) labelOf[f.key] = f.label;
        const bodyLines = [head, expType ? `${copy.typeLineLabel}: ${expType}` : null]
          .concat(
            Object.entries(values)
              .filter(([, v]) => v.trim().length > 0)
              .map(([k, v]) => `${labelOf[k] ?? k}: ${v.trim()}`),
          )
          .filter(Boolean) as string[];
        await createRecord({
          userId,
          locale: isKo ? "ko" : "en",
          kind: "note",
          body: bodyLines.join("\n"),
          topic: head,
          tags: ["career_drilldown"],
          structured: composeStructured("career_3c4p", { summary: summary, exp_type: expType ?? "", ...values }) ?? undefined,
        });
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[drilldown] save failed", (e as Error).message);
        // The navigation below used to sit OUTSIDE the try, so it ran whether or not the
        // save worked. A failed 3C4P drilldown -- several minutes of the user structuring
        // their own career experience -- was logged to a console nobody reads and then the
        // screen cheerfully moved on to 세컨비, as if it had been kept. It had not.
        setSaveErr(true);
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    router.push({ pathname: "/secondb", params: { fromNode: seed } });
  };

  return (
    <DeepSpaceScreen active="lens">
      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="heading">{copy.title}</Text>

          {/* intro (tertiary framing, prototype copy verbatim) */}
          <MdCard variant="filled" style={styles.introCard}>
            <Text style={styles.introText}>
              {t("deepspace:careerDrilldown.intro")}
            </Text>
          </MdCard>

          {/* 경험 개요 */}
          <MdCard variant="outlined" style={styles.groupCard}>
            <Field
              label={t("deepspace:careerDrilldown.summaryLabel")}
              value={summary}
              onChangeText={setSummary}
              placeholder={t("deepspace:careerDrilldown.summaryPlaceholder")}
            />
            <Pressable
              onPress={() => setTypeOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: typeOpen }}
              accessibilityLabel={t("deepspace:careerDrilldown.expTypeA11y")}
              style={styles.typeButton}
            >
              <Text style={[styles.typeButtonText, expType == null && styles.typeButtonPlaceholder]}>
                {expType ?? t("deepspace:careerDrilldown.expTypePlaceholder")}
              </Text>
              <Text style={styles.typeCaret}>{typeOpen ? "▴" : "▾"}</Text>
            </Pressable>
            {typeOpen ? (
              <View style={styles.typeGrid}>
                {copy.expTypes.map((t) => (
                  <MdChip
                    key={t}
                    label={t}
                    selected={expType === t}
                    onPress={() => {
                      setExpType((prev) => (prev === t ? null : t));
                      setTypeOpen(false);
                    }}
                  />
                ))}
              </View>
            ) : null}
          </MdCard>

          {/* 3C / 4P bands */}
          {copy.bands.map((band) => (
            <View key={band.code} style={styles.band}>
              <View style={styles.bandHead}>
                <View style={styles.bandCode}>
                  <Text style={styles.bandCodeText}>{band.code}</Text>
                </View>
                <Text style={styles.bandLabel}>{band.label}</Text>
                <Text style={styles.bandWhy}>{band.why}</Text>
              </View>
              {band.groups.map((g) => (
                <MdCard key={g.id} variant="outlined" style={styles.groupCard}>
                  <View style={styles.groupHead}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupKr}>{g.kr}</Text>
                  </View>
                  {g.fields.map((f) => (
                    <Field
                      key={f.key}
                      label={f.label}
                      value={values[f.key] ?? ""}
                      onChangeText={setField(f.key)}
                      placeholder={f.hint}
                      multiline={f.multiline}
                    />
                  ))}
                </MdCard>
              ))}
            </View>
          ))}
        </ScrollView>

        {/* submit bar */}
        {saveErr ? (
          <Text variant="caption" style={styles.saveErr} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {t("deepspace:careerDrilldown.saveFailed")}
          </Text>
        ) : null}
        <View style={styles.submitBar}>
          <MdButton
            variant="filled"
            label={t("deepspace:careerDrilldown.submit")}
            onPress={() => void submit()}
            disabled={!filled || saving}
            accessibilityLabel={t("deepspace:careerDrilldown.submit")}
          />
        </View>
      </View>
    </DeepSpaceScreen>
  );
}

// ⚠ **바탕 선언** (PIXEL-CLAY 규칙 4 — 정적 반투명 금지).
//   이 화면은 `DeepSpaceScreen` 의 스테이지 위에 앉는다 — 스테이지는
//   `stageFloor` 를 0.92 로 깔고 그 아래가 `bgEdge` 다.
//   바탕이 틀리면 알파를 그대로 두는 것보다 나쁘니, 옮기는 사람은 여기부터 다시 재야 한다.
const CD_GROUND = flattenAlpha(m3.accent.stageFloor, 0.92, deepSpace.bgEdge);
const cdAlpha = (c: string, a: number): string => flattenAlpha(c, a, CD_GROUND);

const styles = StyleSheet.create({
  saveErr: { color: deepSpace.dangerText, marginBottom: spacing.xs, textAlign: "center" },
  body: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  introCard: { backgroundColor: cdAlpha(m3.color.tertiary, 0.12) },
  introText: { fontSize: 13.5, lineHeight: 21, color: m3.color.onSurface },
  groupCard: { gap: spacing.sm },
  typeButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: m3.shape.none,
    paddingHorizontal: spacing.md,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  typeButtonText: { fontSize: 14, color: m3.color.onSurface },
  typeButtonPlaceholder: { color: m3.color.onSurfaceVariant },
  typeCaret: { fontSize: 12, color: m3.color.onSurfaceVariant },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  band: { gap: spacing.sm },
  bandHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  bandCode: {
    minWidth: 44,
    height: 32,
    borderRadius: m3.shape.none,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.tertiaryContainer,
    paddingHorizontal: 12,
  },
  bandCodeText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5, color: m3.color.onTertiaryContainer },
  bandLabel: { fontSize: 16, fontWeight: "600", color: m3.color.onSurface },
  bandWhy: { fontSize: 11, color: m3.color.onSurfaceVariant },
  groupHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  groupName: { fontSize: 14, fontWeight: "700", color: m3.color.tertiary },
  groupKr: { fontSize: 12, color: m3.color.onSurfaceVariant },
  submitBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: deepSpace.bgEdge,
    borderTopWidth: 1,
    borderTopColor: cdAlpha(m3.color.outlineVariant, 0.4),
  },
});
