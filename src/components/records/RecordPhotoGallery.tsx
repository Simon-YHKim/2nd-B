import { PhoneView as View } from "@/components/phone/PhoneUIKit";
// Photos attached to a 글 record (2026-09-30), shown on the record detail screen.
//
// The files sit in the owner's private Storage folder (lib/capture/record-photos.ts),
// so they are shown through short-lived signed URLs. expo-image keeps them in
// memory only: a signed URL is different every time, so a disk cache would only
// pile up private copies under names nobody reuses.

import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Image } from "expo-image";

import { m3TextStyle } from "@/components/m3";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { PlainText } from "@/components/ui/PlainText";
import { signRecordPhotoUrls, type RecordPhotoRef } from "@/lib/capture/record-photos";
import { m3 } from "@/lib/theme/m3";

const DEFAULT_RATIO = 4 / 3;

/** Width / height for the frame; unknown or extreme sizes fall back to 4:3 or are bounded. */
export function recordPhotoAspectRatio(photo: Pick<RecordPhotoRef, "width" | "height">): number {
  const { width, height } = photo;
  if (!width || !height) return DEFAULT_RATIO;
  return Math.min(2, Math.max(0.5, width / height));
}

export function RecordPhotoGallery({
  photos,
  title,
  itemLabel,
  loadError,
}: {
  photos: readonly RecordPhotoRef[];
  title: string;
  itemLabel: (n: number) => string;
  loadError: string;
}) {
  // Keyed by the joined paths, not the array: the caller re-parses the record on
  // every render, and an array dependency would re-sign (and re-render) forever.
  const pathKey = photos.map((photo) => photo.path).join("\n");
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrls(null);
    setFailed(false);
    const paths = pathKey ? pathKey.split("\n") : [];
    if (paths.length === 0) return;
    signRecordPhotoUrls(paths)
      .then((signed) => {
        if (!alive) return;
        setUrls(signed);
        if (paths.some((path) => !signed[path])) setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [pathKey]);

  if (photos.length === 0) return null;
  return (
    <PixelSurface variant="inset" contentStyle={styles.surface}>
      <PlainText style={[m3TextStyle("labelLarge"), styles.label]}>{title}</PlainText>
      {photos.map((photo, i) => {
        const uri = urls?.[photo.path];
        return (
          <View key={photo.path} style={[styles.frame, { aspectRatio: recordPhotoAspectRatio(photo) }]}>
            {uri ? (
              <Image
                source={{ uri }}
                style={styles.image}
                contentFit="contain"
                cachePolicy="memory"
                accessibilityLabel={itemLabel(i + 1)}
              />
            ) : null}
          </View>
        );
      })}
      {failed ? (
        <PlainText style={[m3TextStyle("bodyMedium"), styles.error]} accessibilityLiveRegion="polite">
          {loadError}
        </PlainText>
      ) : null}
    </PixelSurface>
  );
}

const styles = StyleSheet.create({
  surface: { gap: m3.spacing.s4, paddingVertical: m3.spacing.s6 },
  label: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  frame: {
    width: "100%",
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  image: { width: "100%", height: "100%" },
  error: { color: m3.color.error },
});
