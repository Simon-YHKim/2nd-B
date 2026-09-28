import { useMemo } from "react";
import { SvgXml } from "react-native-svg";

import { renderAvatarSvg, type AvatarSpec } from "@/lib/avatar";

export interface AvatarPreviewProps {
  spec: AvatarSpec;
  /** An integer multiple of the 64-cell grid keeps full portraits crisp. */
  size: number;
  /** Focus on the 40×40 head region in small chips, as in the prototype. */
  crop?: boolean;
}

export function AvatarPreview({ spec, size, crop = false }: AvatarPreviewProps) {
  const xml = useMemo(() => {
    const full = renderAvatarSvg(spec, size);
    return crop
      ? full.replace('viewBox="0 0 64 64"', 'viewBox="12 0 40 40"')
      : full;
  }, [spec, size, crop]);

  return <SvgXml xml={xml} width={size} height={size} />;
}
