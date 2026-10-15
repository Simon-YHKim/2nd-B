# Community content hosts

The three `*Content` components contain the same adult-only, authenticated flows used by the standalone `/community` routes. Route wrappers supply `DeepSpaceScreen` and Expo Router navigation. A phone host can supply its own navigation callbacks:

- `CommunityListContent`: `onOpenRoom(roomId)`, `onOpenJoin(token)`.
- `CommunityRoomContent`: `roomId`, `onReturnToList()`, optional `onTitleChange(title)`.
- `CommunityJoinContent`: `token`, `onJoined(roomId)`, `onReturnToList()`, optional `backActionRef` for the host back button. Invoke the registered action before leaving an in-flight join so its late response cannot navigate.

The list and room components each own one vertical `FlatList`. Render them in a plain, bounded `View` with `flex: 1`; do not place either inside the phone's outer `FlatList` or a `ScrollView`. Switch the phone content host from its outer list to a plain `View` for `/community`, `/community/[room]`, and `/community/join/[token]`. Unmount the prior content on a local route change so focused polling stops. Keep the route wrappers for direct links and sign-in redirects.

The phone host must keep `roomId` and `token` as route state, and must not log, persist, or display the raw invite token. The server RPCs still enforce membership and adult access; the client hides actions while `isMinor` is unknown or the room lookup is unresolved.
