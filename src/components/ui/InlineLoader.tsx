// Minimal inline loader for in-screen auth resolution. Use this instead
// of <LoadingScreen> on screens where the user has already seen the
// intro sequence and just needs a brief 'still loading' indicator while
// the AuthContext resolves.
//
// Keep self-contained: no provider or font dependency.

import { ActivityIndicator, StyleSheet, View } from "react-native";

export function InlineLoader() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="불러오는 중">
      <ActivityIndicator color="#2F97FC" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#02040A",
  },
});
