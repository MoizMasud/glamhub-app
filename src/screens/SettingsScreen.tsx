import React, { useEffect, useMemo, useState } from "react";
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
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

const MUTED = "rgba(0,0,0,0.60)";
const BORDER = "rgba(0,0,0,0.12)";

type ConsultationType = "zoom" | "google_meet";

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // existing
  const [autoCleanup, setAutoCleanup] = useState(false);

  // ✅ artist role
  const [role, setRole] = useState<string>("client");

  // ✅ consultation settings
  const [consultEnabled, setConsultEnabled] = useState(false);
  const [consultType, setConsultType] = useState<ConsultationType>("zoom");
  const [consultLink, setConsultLink] = useState("");
  const [consultDirty, setConsultDirty] = useState(false);

  const isArtist = useMemo(() => role === "artist", [role]);

  const load = async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("profiles")
        .select("role, auto_cleanup_bookings, consultation_enabled, consultation_type, consultation_link")
        .eq("id", auth.user.id)
        .single();

      if (error) throw error;

      setRole((data?.role ?? "client") as string);

      setAutoCleanup(!!data?.auto_cleanup_bookings);

      setConsultEnabled(!!data?.consultation_enabled);

      const ct = (data?.consultation_type ?? "zoom") as any;
      setConsultType(ct === "google_meet" ? "google_meet" : "zoom");

      setConsultLink((data?.consultation_link ?? "") as string);
      setConsultDirty(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveProfilePatch = async (patch: Record<string, any>) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const { error } = await supabase.from("profiles").update(patch).eq("id", auth.user.id);
    if (error) throw error;
  };

  const onToggleAutoCleanup = (nextValue: boolean) => {
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
                await saveProfilePatch({ auto_cleanup_bookings: true });
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

    (async () => {
      try {
        setSaving(true);
        await saveProfilePatch({ auto_cleanup_bookings: false });
        setAutoCleanup(false);
      } catch (e: any) {
        Alert.alert("Save failed", e.message);
      } finally {
        setSaving(false);
      }
    })();
  };

  const onToggleConsult = (nextValue: boolean) => {
    if (!consultEnabled && nextValue) {
      Alert.alert(
        "Enable consultations?",
        "When enabled, clients will see your Zoom/Google Meet link on your profile so they can schedule a consultation before booking.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enable",
            style: "default",
            onPress: async () => {
              try {
                setSaving(true);
                await saveProfilePatch({
                  consultation_enabled: true,
                  consultation_type: consultType,
                  consultation_link: consultLink.trim() || null,
                });
                setConsultEnabled(true);
                setConsultDirty(false);
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

    // turning OFF
    (async () => {
      try {
        setSaving(true);
        await saveProfilePatch({ consultation_enabled: false });
        setConsultEnabled(false);
        setConsultDirty(false);
      } catch (e: any) {
        Alert.alert("Save failed", e.message);
      } finally {
        setSaving(false);
      }
    })();
  };

  const saveConsultDetails = async () => {
    try {
      setSaving(true);

      if (consultEnabled && !consultLink.trim()) {
        Alert.alert("Missing link", "Please paste your Zoom/Google Meet link.");
        return;
      }

      await saveProfilePatch({
        consultation_type: consultType,
        consultation_link: consultEnabled ? consultLink.trim() : null,
      });

      setConsultDirty(false);
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const TypePill = ({ label, value }: { label: string; value: ConsultationType }) => {
    const on = consultType === value;
    return (
      <Pressable
        onPress={() => {
          setConsultType(value);
          setConsultDirty(true);
        }}
        style={[styles.typePill, on && styles.typePillOn]}
        accessibilityRole="button"
      >
        <Text style={[styles.typePillText, on && styles.typePillTextOn]}>{label}</Text>
      </Pressable>
    );
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
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
          <>
            {/* Booking history */}
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

                <Switch value={autoCleanup} onValueChange={onToggleAutoCleanup} disabled={saving} />
              </View>

              {saving && <Text style={styles.savingText}>Saving…</Text>}
            </View>

            {/* ✅ Consultation settings (artists only) */}
            {isArtist && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Consultations</Text>
                <Text style={styles.help}>
                  If enabled, clients can use your Zoom/Google Meet link for a quick consultation before booking.
                </Text>

                <View style={styles.settingRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.rowTitle}>Enable consultation link</Text>
                    <Text style={styles.rowSub}>Shows a consultation button on your public profile.</Text>
                  </View>

                  <Switch value={consultEnabled} onValueChange={onToggleConsult} disabled={saving} />
                </View>

                {consultEnabled && (
                  <>
                    <View style={styles.typeRow}>
                      <TypePill label="Zoom" value="zoom" />
                      <TypePill label="Google Meet" value="google_meet" />
                    </View>

                    <Text style={styles.label}>Consultation link</Text>
                    <TextInput
                      value={consultLink}
                      onChangeText={(t) => {
                        setConsultLink(t);
                        setConsultDirty(true);
                      }}
                      style={styles.input}
                      placeholder="Paste your Zoom or Google Meet link"
                      autoCapitalize="none"
                    />

                    <Pressable
                      onPress={saveConsultDetails}
                      disabled={saving || !consultDirty}
                      style={[styles.primaryBtn, (!consultDirty || saving) && { opacity: 0.55 }]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save consultation settings"}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </>
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

  label: { fontWeight: "900", color: BLACK, marginTop: 6 },

  input: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: OFF_WHITE,
    color: BLACK,
    fontWeight: "800",
    marginTop: 6,
  },

  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 },
  typePill: {
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typePillOn: { backgroundColor: BLACK, borderColor: BLACK },
  typePillText: { fontWeight: "900", color: "rgba(0,0,0,0.75)" },
  typePillTextOn: { color: OFF_WHITE },

  primaryBtn: {
    marginTop: 10,
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: OFF_WHITE, fontWeight: "900" },
});

