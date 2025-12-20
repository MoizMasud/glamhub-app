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
import { Image as ExpoImage } from "expo-image";
import { useAuth } from "../context/AuthContext";
import { avatarPublicUrl } from "../lib/profile";

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFfF";
const MUTED = "rgba(0,0,0,0.6)";
const BORDER = "rgba(0,0,0,0.08)";

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
  onOpenEditProfile,
}: {
  onBack: () => void;
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
  onOpenBookings: () => void;
  onSignedOut: () => void;
  onOpenEditProfile: () => void;
}) {
  const { user, signOut, profile, profileLoading, refreshProfile } = useAuth();

  // ✅ Only show page when avatar is prefetched (prevents "pop in")
  const [pageReady, setPageReady] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  const role = useMemo(() => profile?.role ?? "client", [profile?.role]);
  const isArtist = role === "artist";

  useEffect(() => {
    let mounted = true;

    (async () => {
      // If not logged in, page can render immediately
      if (!user) {
        if (mounted) {
          setAvatarUrl("");
          setPageReady(true);
        }
        return;
      }

      try {
        setPageReady(false);

        // always refresh so avatar is up-to-date when returning
        const p = await refreshProfile();

        const raw = avatarPublicUrl((p as any)?.avatar_url ?? profile?.avatar_url ?? null);
        const url = raw ? `${raw}?v=${Date.now()}` : "";

        // Prefetch avatar so it doesn't appear half a second later
        if (url) {
          await ExpoImage.prefetch(url);
        }

        if (mounted) setAvatarUrl(url);
      } catch {
        // no alert; keep clean. fall back to initial.
        if (mounted) setAvatarUrl("");
      } finally {
        if (mounted) setPageReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
    // ✅ refresh when user changes OR avatar path changes
  }, [user?.id, profile?.avatar_url]);

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

  const showLoading = !pageReady || profileLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
        </Pressable>

        {showLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            {/* Header card */}
            <Pressable
              onPress={onOpenEditProfile}
              style={({ pressed }) => [styles.headerCard, pressed && { opacity: 0.95 }]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <ExpoImage
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImg}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={0}
                    onError={() => setAvatarUrl("")}
                  />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{username}</Text>
                <Text style={styles.headerSub}>
                  {email} • {isArtist ? "Artist" : "Client"}
                </Text>
              </View>
            </Pressable>


            {/* Menu */}
            <View style={styles.menuCard}>
              <MenuItem icon="calendar-outline" label="Manage Bookings" onPress={onOpenBookings} />
              <MenuItem icon="create-outline" label="Edit Profile" onPress={onOpenOnboarding} />
              <MenuItem icon="settings-outline" label="Settings" onPress={onOpenSettings} />

              <View style={styles.divider} />

              <Pressable
                onPress={onSignOutPress}
                style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.9 }]}
              >
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
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  container: { flex: 1, padding: 20 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerCard: {
    backgroundColor: PINK,
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
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { fontWeight: "900", fontSize: 22, color: BLACK },

  headerTitle: { fontWeight: "900", color: BLACK, fontSize: 18 },
  headerSub: { color: MUTED, marginTop: 2, fontWeight: "600" },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  menuCard: {
    marginTop: 16,
    backgroundColor: PINK,
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
});
