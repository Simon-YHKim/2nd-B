import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdChip } from "@/components/m3";
import { PremiumLoadingState, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import {
  AVATAR_ACCESSORIES,
  AVATAR_HEADTOP_ACCESSORIES,
  AVATAR_JOB_GROUPS,
  AVATAR_JOBS,
  AVATAR_JOBS_BY_ID,
  Avatar64,
  type AvatarCatalogItem,
  type AvatarJob,
} from "@/lib/avatar/Avatar64";
import { avatarJobForOccupation, type ProfileAvatar } from "@/lib/avatar/profile-avatar";
import { useAuth } from "@/lib/auth/AuthContext";
import { withJosa } from "@/lib/i18n/josa";
import { fetchProfileAvatar, saveProfileAvatarRole } from "@/lib/supabase/avatar";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

interface JobOption {
  id: string | null;
  label: string;
  job?: AvatarJob;
}

function catalogLabel(item: AvatarCatalogItem, language: string): string {
  return language.startsWith("ko") ? item.ko : item.en;
}

export default function AvatarRoleScreen() {
  const { t, i18n } = useTranslation("profile");
  const { userId, hasProfile, loading: authLoading } = useAuth();
  const [avatar, setAvatar] = useState<ProfileAvatar | null>(null);
  const [occupation, setOccupation] = useState<string | undefined>();
  const [group, setGroup] = useState(AVATAR_JOB_GROUPS[0].id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchProfileAvatar(userId).then((state) => {
      if (!alive) return;
      setAvatar(state.avatar);
      setOccupation(state.occupation);
      const selected = state.avatar?.job ? AVATAR_JOBS_BY_ID[state.avatar.job] : undefined;
      if (selected) setGroup(selected.group);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const language = i18n.resolvedLanguage ?? i18n.language;
  const saveLocale = language.startsWith("ko") ? "ko" : "en";
  const options = useMemo<readonly JobOption[]>(
    () => [
      { id: null, label: t("avatar.role.noJob") },
      ...AVATAR_JOBS.filter((job) => job.group === group).map((job) => ({
        id: job.id,
        label: catalogLabel(job, language),
        job,
      })),
    ],
    [group, language, t],
  );

  const selectedJob = avatar?.job ? AVATAR_JOBS_BY_ID[avatar.job] : undefined;
  const selectedJobLabel = selectedJob ? catalogLabel(selectedJob, language) : undefined;
  const accessory = avatar
    ? AVATAR_ACCESSORIES.find((candidate) => candidate.id === avatar.acc)
    : undefined;
  const accessoryCovered = Boolean(
    avatar && selectedJob?.hat && AVATAR_HEADTOP_ACCESSORIES.includes(avatar.acc),
  );
  const mappedOccupation = avatarJobForOccupation(occupation);
  const customOccupation = occupation && !mappedOccupation ? occupation : undefined;
  const customOccupationSubject =
    customOccupation && language.startsWith("ko")
      ? withJosa(customOccupation, "은는")
      : customOccupation;

  const chooseJob = useCallback((jobId: string | null) => {
    setAvatar((current) => (current ? { ...current, job: jobId } : current));
    setDirty(true);
  }, []);

  const chooseUniform = useCallback((wearUniform: boolean) => {
    setAvatar((current) => (current ? { ...current, wearUniform } : current));
    setDirty(true);
  }, []);

  const onSave = useCallback(async () => {
    if (!avatar || saving || !dirty) return;
    setSaving(true);
    try {
      const saved = await saveProfileAvatarRole(
        avatar,
        avatar.job,
        avatar.wearUniform !== false,
        saveLocale,
        avatar.seed,
      );
      setAvatar(saved.avatar);
      setOccupation(saved.occupation);
      setDirty(false);
      setToast({ message: t("avatar.role.saved"), tone: "success" });
    } catch {
      setToast({ message: t("avatar.role.saveError"), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }, [avatar, dirty, saveLocale, saving, t]);

  const title = t("avatar.role.screenTitle");
  if (authLoading || hasProfile !== true || loading) {
    return (
      <DeepSpaceScreen
        active="account"
        header="none"
        variant="museumLike"
        title={title}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  if (!avatar) {
    return (
      <DeepSpaceScreen
        active="account"
        header="none"
        variant="museumLike"
        title={title}
        onBack={() => router.back()}
      >
        <View style={styles.state}>
          <Text style={styles.stateTitle}>{t("avatar.role.characterMissing")}</Text>
          <MdButton
            variant="filled"
            label={t("avatar.role.createCharacter")}
            onPress={() => router.replace("/profile-character")}
          />
        </View>
      </DeepSpaceScreen>
    );
  }

  if (avatar.type === "animal") {
    return (
      <DeepSpaceScreen
        active="account"
        header="none"
        variant="museumLike"
        title={title}
        onBack={() => router.back()}
      >
        <View style={styles.state}>
          <Avatar64 spec={avatar} size={128} accessibilityLabel={t("avatar.role.previewLabel")} />
          <Text style={styles.stateTitle}>{t("avatar.role.animalTitle")}</Text>
          <Text style={styles.stateBody}>{t("avatar.role.animalBody")}</Text>
          <MdButton
            variant="outlined"
            label={t("avatar.role.editCharacter")}
            onPress={() => router.replace("/profile-character")}
          />
        </View>
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen
      active="account"
      header="none"
      variant="museumLike"
      title={title}
      onBack={() => router.back()}
    >
      <FlatList
        key={group}
        data={options}
        numColumns={3}
        keyExtractor={(item) => item.id ?? "none"}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.optionRow}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{t("avatar.role.eyebrow")}</Text>
            <Text style={styles.title}>{t("avatar.role.title")}</Text>
            <Text style={styles.intro}>{t("avatar.role.intro")}</Text>
            <View
              style={styles.previewCard}
              accessible
              accessibilityLabel={t("avatar.role.previewLabel")}
            >
              <Text style={styles.previewLabel}>{t("avatar.role.previewLabel")}</Text>
              <Avatar64
                spec={avatar}
                size={128}
                accessibilityLabel={t("avatar.role.previewLabel")}
              />
              <Text style={styles.occupation}>
                {selectedJobLabel
                  ? t("avatar.role.currentOccupation", { occupation: selectedJobLabel })
                  : t("avatar.role.noOccupation")}
              </Text>
            </View>
            {customOccupationSubject && !avatar.job ? (
              <Text style={styles.notice}>
                {t("avatar.role.customOccupation", { occupation: customOccupationSubject })}
              </Text>
            ) : null}
            {accessoryCovered && accessory ? (
              <Text style={styles.notice}>
                {t("avatar.role.covered", { accessory: catalogLabel(accessory, language) })}
              </Text>
            ) : null}
            <Text style={styles.sectionLabel}>{t("avatar.role.group")}</Text>
            <View style={styles.groups}>
              {AVATAR_JOB_GROUPS.map((item) => (
                <MdChip
                  key={item.id}
                  kind="filter"
                  label={catalogLabel(item, language)}
                  selected={item.id === group}
                  onPress={() => setGroup(item.id)}
                />
              ))}
            </View>
            {avatar.job ? (
              <View style={styles.uniformBlock}>
                <View style={styles.uniformChoices}>
                  <MdChip
                    kind="filter"
                    label={t("avatar.role.uniform")}
                    selected={avatar.wearUniform !== false}
                    onPress={() => chooseUniform(true)}
                  />
                  <MdChip
                    kind="filter"
                    label={t("avatar.role.ownColor")}
                    selected={avatar.wearUniform === false}
                    onPress={() => chooseUniform(false)}
                  />
                </View>
                <Text style={styles.hint}>
                  {avatar.wearUniform === false
                    ? t("avatar.role.ownColorHint")
                    : t("avatar.role.uniformHint")}
                </Text>
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>{t("avatar.role.jobs")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const selected = avatar.job === item.id;
          const preview: ProfileAvatar = { ...avatar, job: item.id };
          return (
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() => chooseJob(item.id)}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={
                selected ? t("avatar.role.jobSelected", { name: item.label }) : item.label
              }
            >
              <Avatar64 spec={preview} size={64} />
              <Text style={styles.optionLabel} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <MdButton
              variant="filled"
              label={saving ? t("avatar.role.saving") : t("avatar.role.save")}
              loading={saving}
              disabled={!dirty}
              onPress={() => void onSave()}
            />
          </View>
        }
      />
      {toast ? <PremiumToast message={toast.message} tone={toast.tone} /> : null}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.md,
    padding: deepSpaceSpacing.xl,
  },
  stateTitle: { color: deepSpace.textHi, fontSize: 18, textAlign: "center" },
  stateBody: { color: deepSpace.textMid, fontSize: 13, lineHeight: 20, textAlign: "center" },
  content: { padding: deepSpaceSpacing.lg, paddingBottom: 56, gap: deepSpaceSpacing.sm },
  header: { gap: deepSpaceSpacing.md, marginBottom: deepSpaceSpacing.sm },
  eyebrow: { color: deepSpace.accentSoft, fontSize: 12 },
  title: { color: deepSpace.textHi, fontSize: 20 },
  intro: { color: deepSpace.textMid, fontSize: 13, lineHeight: 20 },
  previewCard: {
    minHeight: 204,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.sm,
    padding: deepSpaceSpacing.md,
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLineStrong,
    borderWidth: 1,
    borderRadius: m3.shape.none,
  },
  previewLabel: { color: deepSpace.textLo, fontSize: 12 },
  occupation: { color: deepSpace.textHi, fontSize: 13, textAlign: "center" },
  notice: {
    color: deepSpace.warning,
    fontSize: 12,
    lineHeight: 18,
    padding: deepSpaceSpacing.sm,
    backgroundColor: deepSpace.warningBg,
    borderColor: deepSpace.warningLine,
    borderWidth: 1,
    borderRadius: m3.shape.none,
  },
  sectionLabel: { color: deepSpace.textHi, fontSize: 14 },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: deepSpaceSpacing.sm },
  uniformBlock: {
    gap: deepSpaceSpacing.sm,
    padding: deepSpaceSpacing.sm,
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: m3.shape.none,
  },
  uniformChoices: { flexDirection: "row", flexWrap: "wrap", gap: deepSpaceSpacing.sm },
  hint: { color: deepSpace.textLo, fontSize: 12, lineHeight: 18 },
  optionRow: { gap: deepSpaceSpacing.sm },
  option: {
    flex: 1,
    minHeight: 126,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.xs,
    padding: deepSpaceSpacing.sm,
    marginBottom: deepSpaceSpacing.sm,
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: m3.shape.none,
  },
  optionSelected: { backgroundColor: deepSpace.cardPressed, borderColor: deepSpace.accent },
  optionLabel: { color: deepSpace.textHi, fontSize: 11, lineHeight: 15, textAlign: "center" },
  footer: { paddingTop: deepSpaceSpacing.md },
});
