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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { getMyProfile, MyProfile } from "../lib/profile";

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFfF";
const MUTED = "rgba(0,0,0,0.6)";
const BORDER = "rgba(0,0,0,0.08)";

function isExpectedNoSessionError(e: any) {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("no user session") || msg.includes("not signed in");
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: any;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.9 }]}>
      <View style={styles.itemLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={BLACK} />
        </View>
        <Text style={styles.itemLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </Pressable>
  );
}

export default function AccountScreen({
  onBack,
  onOpenOnboarding,
  onOpenSettings,
  onOpenBookings,
  onSignedOut,
}: {
  onBack: () => void;
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
  onOpenBookings: () => void;
  onSignedOut: () => void;
}) {
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const role = useMemo(() => profile?.role ?? "client", [profile?.role]);
  const isArtist = role === "artist";

  const load = async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const p = await getMyProfile();
      setProfile(p);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onSignOutPress = async () => {
    try {
      await signOut();
      onSignedOut();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const username = profile?.username || user?.email?.split("@")[0] || "Account";
  const email = user?.email ?? "";
  const initial = (username?.[0] || "A").toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
        </Pressable>


        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            {/* Header card (same vibe as your new design) */}
            <View style={styles.headerCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{username}</Text>
                <Text style={styles.headerSub}>
                  {email} • {isArtist ? "Artist" : "Client"}
                </Text>
              </View>
            </View>

            {/* Menu */}
            <View style={styles.menuCard}>
              <MenuItem icon="calendar-outline" label="Manage Bookings" onPress={onOpenBookings} />
              
              <MenuItem icon="create-outline" label="Edit Profile" onPress={onOpenOnboarding} />

              <MenuItem icon="settings-outline" label="Settings" onPress={onOpenSettings} />

              <View style={styles.divider} />

              <Pressable onPress={onSignOutPress} style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.9 }]}>
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PINK,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  container: { flex: 1, padding: 20 },
  backText: { color: BLACK, fontWeight: "700" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerCard: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "900", fontSize: 22, color: BLACK },

  headerTitle: { fontWeight: "900", color: BLACK, fontSize: 18 },
  headerName: { fontWeight: "800", color: BLACK, marginTop: 2 },
  headerSub: { color: MUTED, marginTop: 2, fontWeight: "600" },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  menuCard: {
    marginTop: 16,
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: { fontWeight: "800", color: BLACK },

  divider: { height: 1, backgroundColor: BORDER },

  signOutBtn: { paddingHorizontal: 14, paddingVertical: 14, alignItems: "center" },
  signOutText: { fontWeight: "900", color: BLACK },

  footerHint: {
    marginTop: 12,
    color: MUTED,
    fontWeight: "600",
    textAlign: "center",
  },
});
