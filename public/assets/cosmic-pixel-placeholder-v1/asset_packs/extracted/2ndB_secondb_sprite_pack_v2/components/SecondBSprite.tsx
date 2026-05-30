import type { ImgHTMLAttributes } from "react";

export type SecondBState =
  | "idle"
  | "blink"
  | "happy"
  | "thinking"
  | "carrying_shard"
  | "chat"
  | "sleep"
  | "alert"
  | "wave_a"
  | "wave_b"
  | "walk_1"
  | "walk_2";

const SRC_BY_STATE: Record<SecondBState, string> = {
  idle: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_idle.svg",
  blink: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_blink.svg",
  happy: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_happy.svg",
  thinking: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_thinking.svg",
  carrying_shard: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_carrying_shard.svg",
  chat: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_chat.svg",
  sleep: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_sleep.svg",
  alert: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_alert.svg",
  wave_a: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_wave_a.svg",
  wave_b: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_wave_b.svg",
  walk_1: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_walk_1.svg",
  walk_2: "/assets/cosmic-pixel-v2/secondb/sprites/secondb_walk_2.svg",
};

export function SecondBSprite({
  state = "idle",
  alt = "세컨비",
  className,
  ...props
}: { state?: SecondBState } & ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={SRC_BY_STATE[state]}
      alt={alt}
      width={64}
      height={64}
      draggable={false}
      className={["secondb-sprite", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
