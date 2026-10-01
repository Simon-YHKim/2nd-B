import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth/AuthContext";
import { DashboardPhone } from "@/components/dashboard/DashboardPhone";

export default function Dashboard() {
  const { userId, isMinor, loading } = useAuth();
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  return <DashboardPhone key={`${userId}:${isMinor}`} ownerId={userId} isMinor={isMinor} />;
}
