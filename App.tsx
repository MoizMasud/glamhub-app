import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

const PINK = "#F6D6D6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";

export default function App() {
  const env = Constants.expoConfig?.extra?.env ?? "unknown";
  const showBadge = env === "dev" || env === "staging";

  return (
    <View style={styles.container}>
      {showBadge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{env.toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.title}>GlamHub</Text>
      <Text style={styles.subtitle}>Marketplace for beauty services</Text>

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 55,
    right: 16,
    backgroundColor: BLACK,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: OFF_WHITE,
    fontWeight: "700",
    letterSpacing: 1,
    fontSize: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: BLACK,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: BLACK,
    opacity: 0.8,
    backgroundColor: PINK,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
});
