import React from "react";

export type CompanionName = "momo" | "lulu" | "archi" | "vela" | "gadi";

export type CompanionState =
  | "idle"
  | "note"
  | "store"
  | "read"
  | "label"
  | "happy"
  | "sleep"
  | "fly_1"
  | "fly_2"
  | "carrying_shard"
  | "scan"
  | "success"
  | "dash"
  | "linking"
  | "measure"
  | "highlight"
  | "thinking"
  | "build"
  | "spark"
  | "dream"
  | "unfold"
  | "save"
  | "guard"
  | "alert"
  | "soft_stop"
  | "clear";

const DEFAULT_STATE: Record<CompanionName, CompanionState> = {
  momo: "idle",
  lulu: "idle",
  archi: "idle",
  vela: "idle",
  gadi: "idle",
};

export const companionAlt: Record<CompanionName, string> = {
  momo: "모모, 기록 관리자",
  lulu: "루루, 수집 드론",
  archi: "아치, 연결 설계자",
  vela: "벨라, 공상 확장자",
  gadi: "가디, 안전 관리자",
};

export function getCompanionSpritePath(
  companion: CompanionName,
  state?: CompanionState,
  basePath = "/assets/cosmic-pixel-v2/companions"
): string {
  const resolvedState = state ?? DEFAULT_STATE[companion];
  return `${basePath}/sprites/${companion}/${companion}_${resolvedState}.svg`;
}

export type CompanionSpriteProps = {
  companion: CompanionName;
  state?: CompanionState;
  size?: number;
  className?: string;
  decorative?: boolean;
  basePath?: string;
};

export function CompanionSprite({
  companion,
  state,
  size = 64,
  className = "",
  decorative = true,
  basePath,
}: CompanionSpriteProps) {
  const src = getCompanionSpritePath(companion, state, basePath);
  return (
    <img
      src={src}
      width={size}
      height={size}
      className={`companion-sprite ${className}`.trim()}
      alt={decorative ? "" : companionAlt[companion]}
      aria-hidden={decorative ? "true" : undefined}
      draggable={false}
    />
  );
}

export type CompanionEvent =
  | "journal_saved"
  | "capture_saved"
  | "link_found"
  | "imagine_ready"
  | "safety_soft_stop";

const EVENT_CUE_FILE: Record<CompanionEvent, string> = {
  journal_saved: "journal_saved.svg",
  capture_saved: "capture_saved.svg",
  link_found: "link_found.svg",
  imagine_ready: "imagine_ready.svg",
  safety_soft_stop: "safety_soft_stop.svg",
};

export function getCompanionCuePath(
  event: CompanionEvent,
  basePath = "/assets/cosmic-pixel-v2/companions"
): string {
  return `${basePath}/event_cues/${EVENT_CUE_FILE[event]}`;
}

export function CompanionEventCue({
  event,
  size = 76,
  className = "",
  basePath,
}: {
  event: CompanionEvent;
  size?: number;
  className?: string;
  basePath?: string;
}) {
  return (
    <img
      src={getCompanionCuePath(event, basePath)}
      width={size}
      height={size}
      className={`companion-cue companion-cue--enter ${className}`.trim()}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
