import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

/**
 * Android AsyncStorage has a 2MB CursorWindow limit per key.
 * Large JSON blobs (like Wiki exports) must use the FileSystem.
 */
export async function saveLargeJson(key: string, data: any): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return "localStorage";
    } catch (e) {
      return null;
    }
  }

  try {
    const path = `${FileSystem.documentDirectory}${key}.json`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
    return path;
  } catch (e) {
    if (typeof console !== "undefined") console.error("[FileSystem] save failed", e);
    return null;
  }
}

export async function readLargeJson<T>(key: string): Promise<T | null> {
  if (Platform.OS === "web") {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  try {
    const path = `${FileSystem.documentDirectory}${key}.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw);
  } catch (e) {
    if (typeof console !== "undefined") console.error("[FileSystem] read failed", e);
    return null;
  }
}
