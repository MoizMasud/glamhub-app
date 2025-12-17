import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

const MUTED = "rgba(0,0,0,0.60)";
const BORDER = "rgba(0,0,0,0.12)";

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoCleanup, setAutoCleanup] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("profiles")
        .select("auto_cleanup_bookings")
        .eq("id", auth.user.id)
        .single();

      if (error) throw error;

      setAutoCleanup(!!data?.auto_cleanup_bookings);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async (value: boolean) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const { error } = await supabase
      .from("profiles")
      .update({ auto_cleanup_bookings: value })
      .eq("id", auth.user.id);

    if (error) throw error;
  };

  const onToggle = (nextValue: boolean) => {
    // If turning ON, warn first
    if (!autoCleanup && nextValue) {
      Alert.alert(
        "Enable auto-remove?",
        "When enabled, cancelled/completed bookings will be automatically removed from YOUR view after 24 hours. You can turn this off anytime.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enable",
            style: "default",
            onPress: async () => {
              try {
                setSaving(true);
                await save(true);
                setAutoCleanup(true);
              } catch (e: any) {
                Alert.alert("Save failed", e.message);
              } finally {
                setSaving(false);
              }
            },
          },
        ]
      );
      return;
    }

    // Turning OFF (no warning)
    (async () => {
      try {
        setSaving(true);
        await save(false);
        setAutoCleanup(false);
      } catch (e: any) {
        Alert.alert("Save failed", e.message);
      } finally {
        setSaving(false);
      }
    })();
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header (match other screens) */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
          </Pressable>

          <Text style={styles.h1}>Settings</Text>

          <Pressable
            onPress={load}
            style={[styles.iconBtn, (loading || saving) && { opacity: 0.6 }]}
            disabled={loading || saving}
            accessibilityRole="button"
            accessibilityLabel="Refresh settings"
          >
            <Ionicons name="refresh" size={20} color={"rgba(0,0,0,0.75)"} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Booking history</Text>
            <Text style={styles.help}>
              Choose whether cancelled/completed bookings should be removed from your view automatically.
            </Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.rowTitle}>Auto-remove after 24 hours</Text>
                <Text style={styles.rowSub}>Applies only to your view (the other person may still see it).</Text>
              </View>

              <Switch value={autoCleanup} onValueChange={onToggle} disabled={saving} />
            </View>

            {saving && <Text style={styles.savingText}>Saving…</Text>}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  container: { flex: 1, backgroundColor: OFF_WHITE },

  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 18,
    padding: 14,
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    gap: 10,
  },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  help: { color: MUTED, fontWeight: "700", fontSize: 12, lineHeight: 16 },

  settingRow: {
    marginTop: 6,
    backgroundColor: OFF_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rowTitle: { fontWeight: "900", color: BLACK, fontSize: 14 },
  rowSub: { marginTop: 4, fontWeight: "800", color: MUTED, fontSize: 12, lineHeight: 16 },

  savingText: { color: MUTED, fontWeight: "800", marginTop: 2 },

  tip: {
    marginTop: 6,
    backgroundColor: OFF_WHITE,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  tipText: { flex: 1, color: "rgba(0,0,0,0.75)", fontWeight: "800", lineHeight: 18 },
});
