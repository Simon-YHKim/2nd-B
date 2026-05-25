import { Link } from "expo-router";
import { View, StyleSheet } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="heading">404</Text>
        <Text variant="body" color="textMuted">This screen does not exist.</Text>
        <Link href="/" asChild>
          <Button label="Go home" variant="primary" />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
});
