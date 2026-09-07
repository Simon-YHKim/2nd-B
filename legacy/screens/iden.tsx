// RETIRED — moved out of the build on 2026-09-08.
//
//   was:  src/app/iden.tsx   (IdenExportScreenLegacy + the styles only it used)
//   why:  every delivery path pins deep-space and no variable can override it,
//         so this branch had been unreachable for months.
//   read: kept verbatim below. The live half (IdenExportScreenDeepSpace) stayed
//         in src/app/iden.tsx.
//   run:  not buildable from here — legacy/ is excluded from tsconfig, jest,
//         eslint and metro, and the imports below resolve against the route file
//         this was split out of. To run it, restore that file whole:
//           git show <sha-before-retirement>:src/app/iden.tsx
//
// Nothing in src/ imports this file. See legacy/screens/INDEX.md.

function IdenExportScreenLegacy() {
  const { t, i18n } = useTranslation("iden");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, loading, hasProfile, profileProbeFailed, isMinor } = useAuth();
  const { session, retry } = usePersistedIdenSession({
    userId,
    authLoading: loading,
    hasProfile,
    profileProbeFailed,
    isMinor,
    locale,
  });
  const doc = session?.status === "ready" ? session.doc : null;
  const [resultOpen, setResultOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((next: Toast) => {
    setToast(next);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const currentResult = useCallback(() => {
    if (!doc) return null;
    return buildIdenExport(visibleIdenDocForExport(doc, []), { locale });
  }, [doc, locale]);

  const handleBuild = useCallback(() => {
    if (!doc) return;
    setResultOpen(true);
  }, [doc]);

  const handleCopy = useCallback(async () => {
    const result = currentResult();
    if (!result) return;
    try {
      await Clipboard.setStringAsync(result.iden);
      notify({ tone: "success", message: t("result.copied") });
    } catch {
      notify({ tone: "danger", message: t("error") });
    }
  }, [currentResult, notify, t]);

  const handleShare = useCallback(async () => {
    const result = currentResult();
    if (!result) return;
    try {
      await Share.share({ message: result.iden });
    } catch {
      /* user dismissed the share sheet */
    }
  }, [currentResult]);

  if (!loading && !userId) return <Redirect href="/sign-in" />;
  if (!loading && hasProfile === false && !profileProbeFailed) return <Redirect href="/complete-profile" />;
  if (loading || !userId || profileProbeFailed || hasProfile !== true || isMinor === null) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (session?.status === "error") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="body" color="textMuted">{t("ds.loadError")}</Text>
          <Button label={t("ds.retry")} onPress={retry} />
        </View>
      </PremiumAppShell>
    );
  }

  if (session?.status === "empty") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="body" color="textMuted">{t("ds.empty")}</Text>
          <Button label={t("ds.startGathering")} onPress={() => router.push("/interview")} />
        </View>
      </PremiumAppShell>
    );
  }

  if (!doc) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }

  const isWeb = Platform.OS === "web";
  const renderedResult = resultOpen ? currentResult() : null;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.records.island}
          worker={VILLAGE_UI.records.worker}
          accent={VILLAGE_UI.records.accent}
          speech={t("hero.speech")}
        />

        <View style={[styles.section, { borderStartColor: cosmic.soulViolet }]}>
          <Text variant="body" color="textMuted">{t("intro.body")}</Text>
          <Button
            label={t("ds.export")}
            onPress={handleBuild}
            accessibilityHint={t("generate.accessibilityHint")}
          />
        </View>
      </ScrollView>

      <PremiumModal visible={resultOpen && renderedResult !== null} onClose={() => setResultOpen(false)}>
        <Text variant="heading" color="text">{t("result.title")}</Text>
        <Text variant="caption" color="textMuted" style={styles.hint}>{t("result.hint")}</Text>
        <ScrollView style={styles.codeBox}>
          <Text variant="caption" color="textMuted" style={styles.code} selectable>{renderedResult?.iden}</Text>
        </ScrollView>
        <View style={styles.actions}>
          <Button label={t("result.copy")} onPress={handleCopy} />
          {isWeb ? (
            <Button label={t("result.openSheet")} variant="secondary" onPress={() => {
              const result = currentResult();
              if (result) openSheetInNewTab(result.html);
            }} />
          ) : (
            <Button label={t("result.share")} variant="secondary" onPress={handleShare} />
          )}
          <Button label={t("result.close")} variant="ghost" onPress={() => setResultOpen(false)} />
        </View>
      </PremiumModal>

      {toast && <PremiumToast message={toast.message} tone={toast.tone} />}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  section: {
    gap: spacing.md,
    padding: spacing.lg,
    borderStartWidth: 3,
    borderRadius: 0,
    backgroundColor: semantic.surface,
  },
  hint: { marginTop: spacing.xs },
  codeBox: {
    maxHeight: 280,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 0,
    backgroundColor: semantic.background,
  },
  code: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
