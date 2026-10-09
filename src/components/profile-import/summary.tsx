import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PhoneFlatList as FlatList, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { Text } from "@/components/ui/Text";
import { MdButton, MdCard } from "@/components/m3";
import type { ContextItem, ContextSource } from "@/lib/import/profile-context";
import type { ProfileImportedContext } from "@/lib/supabase/profile-context-import";
import { useImportStyles } from "./parts";

/** Read-only product view. Never display the import's internal JSON or provenance ids. */
export function ProfileContextSummary({ context }: { context: ProfileImportedContext }) {
  const { t } = useTranslation("profile");
  const s = useImportStyles();
  const [visibleCount, setVisibleCount] = useState(5);
  const { document, confirmedIds } = context;
  return <FlatList scrollEnabled={false} data={document.items.slice(0, visibleCount)}
    keyExtractor={(item) => item.id} contentContainerStyle={s.stack}
    ListHeaderComponent={<View style={s.stack}>
      <Text style={s.text}>{t("contextImport.doneBody", { count: document.items.length })}</Text>
      <Text style={s.small}>{t("contextImport.sourceReported")}</Text>
    </View>}
    renderItem={({ item }) => <ContextSummaryItem item={item} confirmed={confirmedIds.includes(item.id)}
      sources={document.sources.filter((source) => item.evidence_ids.includes(source.id))} />}
    ListFooterComponent={visibleCount < document.items.length
      ? <MdButton label={t("contextImport.loadMore")} variant="text" onPress={() => setVisibleCount((count) => count + 5)} /> : null} />;
}

function ContextSummaryItem({ item, sources, confirmed }: { item: ContextItem; sources: ContextSource[]; confirmed: boolean }) {
  const { t } = useTranslation("profile");
  const s = useImportStyles();
  const [showSources, setShowSources] = useState(false);
  // Keep the reference check here too: an unrelated excerpt must never attach to this story.
  const excerpts = sources.filter((source) => item.evidence_ids.includes(source.id) && source.excerpt?.trim());
  return <MdCard variant="outlined" style={s.card}>
    <View style={s.row}>
      <Text style={[s.small, s.accent]}>{t(`contextImport.category.${item.category}`)}</Text>
      <Text style={s.small}>{t(`contextImport.basis.${item.reported_basis}`)}</Text>
    </View>
    <Text selectable style={s.text}>{item.statement}</Text>
    {confirmed ? <Text style={s.small}>{t("contextImport.confirmInference")}</Text> : null}
    {excerpts.length ? <>
      <MdButton variant="text" label={t("contextImport.source")} accessibilityState={{ expanded: showSources }} onPress={() => setShowSources(!showSources)} />
      {showSources ? <FlatList scrollEnabled={false} data={excerpts} keyExtractor={(source) => source.id}
        contentContainerStyle={s.stack} renderItem={({ item: source }) => <View style={s.quote}>
          <Text selectable style={s.text}>{source.excerpt}</Text>
        </View>} /> : null}
    </> : <Text style={s.small}>{t("contextImport.noSource")}</Text>}
  </MdCard>;
}
