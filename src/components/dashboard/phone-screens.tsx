// Full screens the dashboard phone hosts inside its display.
//
// Each entry renders the same content as its standalone route, inside a
// PhoneEmbedProvider (DashboardPhone supplies it). DeepSpaceScreen turns into
// the phone's compact shell there, and navigation goes through the phone's
// stack. The host gives each screen a bounded View outside the phone's list,
// keyed by route, so a route change unmounts the previous screen and stops its
// focused polling (community README).
//
// Only screens whose navigation is phone-aware may be listed: a direct
// `router.back()` inside the phone would pop the app stack and leave the
// dashboard. See src/lib/nav/phone-embed.tsx.
import { useCallback, useRef, useState, type ComponentType, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { CommunityJoinContent } from "@/components/community/CommunityJoinContent";
import { CommunityListContent } from "@/components/community/CommunityListContent";
import { CommunityRoomContent } from "@/components/community/CommunityRoomContent";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceWikiScreen } from "@/screens/deepspace/dds-wiki-records-screens";
import AccountScreen from "@/app/account";
import AvatarPaletteScreen from "@/app/avatar-palette";
import DataScreen from "@/app/data";
import DataConnectionsScreen from "@/app/data-connections";
import ImportScreen from "@/app/import";
import ImportHubScreen from "@/app/import-hub";
import ManualScreen from "@/app/manual";
import NoticesScreen from "@/app/notices";
import PermissionsScreen from "@/app/permissions";
import PlansScreen from "@/app/plans";
import PrivacyScreen from "@/app/privacy";
import ProfileScreen from "@/app/profile";
import ReasoningScreen from "@/app/reasoning";
import SettingsScreen from "@/app/settings";
import SourcesScreen from "@/app/sources";
import SubscriptionScreen from "@/app/subscription";
import SupportScreen from "@/app/support";
import ThemeScreen from "@/app/theme";
import { splitPhoneRoute, useHardwareBack, usePhoneEmbed, type PhoneEmbedNav } from "@/lib/nav/phone-embed";

function useNav(): PhoneEmbedNav {
  const nav = usePhoneEmbed();
  if (!nav) throw new Error("phone screens render only inside PhoneEmbedProvider");
  return nav;
}

function PhoneCommunityList() {
  const { t } = useTranslation("community");
  const nav = useNav();
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("title")}>
      <CommunityListContent
        onOpenRoom={(room) => nav.push(`/community/${encodeURIComponent(room)}`)}
        onOpenJoin={(token) => nav.push(`/community/join/${encodeURIComponent(token)}`)}
      />
    </DeepSpaceScreen>
  );
}

function PhoneCommunityRoom({ roomId }: { roomId: string }) {
  const { t } = useTranslation("community");
  const nav = useNav();
  const [titleState, setTitleState] = useState<{ roomId: string; title: string } | null>(null);
  const title = titleState?.roomId === roomId ? titleState.title : t("title");
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title}>
      <CommunityRoomContent
        roomId={roomId}
        onTitleChange={(nextTitle) => setTitleState({ roomId, title: nextTitle })}
        onReturnToList={nav.back}
      />
    </DeepSpaceScreen>
  );
}

function PhoneCommunityJoin({ token }: { token: string }) {
  const { t } = useTranslation("community");
  const nav = useNav();
  const backActionRef = useRef<(() => void) | null>(null);
  // The join's own back action invalidates an in-flight join before leaving, so
  // a late response cannot navigate. Android Back must take the same path.
  useHardwareBack(useCallback(() => {
    if (!backActionRef.current) return false;
    backActionRef.current();
    return true;
  }, []));
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={t("joinTitle")}
      onBack={() => (backActionRef.current ? backActionRef.current() : nav.back())}
    >
      <CommunityJoinContent
        token={token}
        onJoined={(room) => nav.replace(`/community/${encodeURIComponent(room)}`)}
        onReturnToList={nav.back}
        backActionRef={backActionRef}
      />
    </DeepSpaceScreen>
  );
}

/** Standalone route screens converted to useAppRouter / useScreenParams. */
const PHONE_ROUTE_SCREENS: Readonly<Record<string, ComponentType>> = {
  "/account": AccountScreen,
  "/avatar-palette": AvatarPaletteScreen,
  "/data": DataScreen,
  "/data-connections": DataConnectionsScreen,
  "/import": ImportScreen,
  "/import-hub": ImportHubScreen,
  "/manual": ManualScreen,
  "/notices": NoticesScreen,
  "/permissions": PermissionsScreen,
  "/plans": PlansScreen,
  "/privacy": PrivacyScreen,
  "/profile": ProfileScreen,
  "/reasoning": ReasoningScreen,
  "/settings": SettingsScreen,
  "/sources": SourcesScreen,
  "/subscription": SubscriptionScreen,
  "/support": SupportScreen,
  "/theme": ThemeScreen,
  // The phone keeps its own wiki search at /wiki (the deep-space wiki screen
  // has none); this key opens that screen's tag filter and graph beside it.
  "/wiki/graph": DeepSpaceWikiScreen,
};

/** The phone screen for `route`, or null when the phone renders it some other way. */
export function resolvePhoneScreen(route: string): ReactElement | null {
  const { path } = splitPhoneRoute(route);
  if (path === "/community") return <PhoneCommunityList />;
  const join = /^\/community\/join\/([^/]+)$/.exec(path);
  if (join) return <PhoneCommunityJoin token={decodeURIComponent(join[1])} />;
  const room = /^\/community\/([^/]+)$/.exec(path);
  if (room) return <PhoneCommunityRoom roomId={decodeURIComponent(room[1])} />;
  const Screen = PHONE_ROUTE_SCREENS[path];
  return Screen ? <Screen /> : null;
}
