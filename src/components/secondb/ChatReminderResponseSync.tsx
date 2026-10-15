import { useEffect } from "react";
import { Platform } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { useAuth } from "@/lib/auth/AuthContext";
import { observeChatReminderResponses } from "@/lib/ops/chat-reminder-response";

/** The notification opens its owner's list only after auth and the router are ready. */
export function ChatReminderResponseSync() {
  const { userId, loading, hasProfile } = useAuth();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (Platform.OS === "web" || loading || !userId || hasProfile !== true || !navigation?.key) return;
    return observeChatReminderResponses(userId, () => router.push("/reminders"));
  }, [userId, loading, hasProfile, navigation?.key]);
  return null;
}
