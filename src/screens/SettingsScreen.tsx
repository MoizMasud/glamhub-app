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
import { supabase } from "../lib/supabase";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";

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
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.pillBtn}>
            <Text style={styles.pillText}>Back</Text>
          </Pressable>

          <Text style={styles.h1}>Settings</Text>

          <Pressable onPress={load} style={styles.pillBtn}>
            <Text style={styles.pillText}>Refresh</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Booking history</Text>
            <Text style={styles.cardSub}>
              Choose whether cancelled/completed bookings should be removed from your
              view automatically.
            </Text>

            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.rowLabel}>Auto-remove after 24 hours</Text>
                <Text style={styles.rowHint}>
                  Applies only to your view (the other person may still see it).
                </Text>
              </View>

              <Switch value={autoCleanup} onValueChange={onToggle} disabled={saving} />
            </View>

            {saving && <Text style={styles.savingText}>Saving…</Text>}

            <View style={styles.tip}>
              <Text style={styles.tipText}>
                Tip: In Account, you can manually “Remove” cancelled/completed bookings
                anytime.
              </Text>
            </View>
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
  screen: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },

  pillBtn: {
    backgroundColor: OFF_WHITE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
  },
  pillText: { color: BLACK, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    borderRadius: 20,
    backgroundColor: OFF_WHITE,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  cardSub: { color: BLACK, opacity: 0.75, fontWeight: "700", lineHeight: 18 },

  row: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: PINK,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  rowLabel: { color: BLACK, fontWeight: "900" },
  rowHint: { marginTop: 4, color: BLACK, opacity: 0.75, fontWeight: "700", lineHeight: 18 },

  savingText: { color: BLACK, opacity: 0.7, fontWeight: "800" },

  tip: {
    marginTop: 6,
    backgroundColor: OFF_WHITE,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  tipText: { color: BLACK, fontWeight: "800", opacity: 0.85, lineHeight: 18 },
});
