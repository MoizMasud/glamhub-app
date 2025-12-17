import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { getMyProfile, MyProfile } from "../lib/profile";
import {
  listMyBookings,
  listArtistBookings,
  updateBookingStatus,
  hideBookingForMe,
  BookingRow,
  BookingStatus,
} from "../lib/bookings";
import { Ionicons } from "@expo/vector-icons";

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFfF";
const MUTED = "rgba(0,0,0,0.6)";
const BORDER = "rgba(0,0,0,0.08)";
const CARD_BG = "rgba(0,0,0,0.03)";

function isExpectedNoSessionError(e: any) {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("no user session") || msg.includes("not signed in");
}

// Friendly, readable date/time
function formatWhenPretty(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { date, time };
}

function shortId(id?: string | null) {
  if (!id) return "—";
  return `${id.slice(0, 6)}…`;
}

// Try to show a real name if your BookingRow provides it; otherwise fallback to id
function getDisplayNameForRow(b: any, role: "client" | "artist") {
  const clientName =
    b.client_name ?? b.client?.name ?? b.client_profile?.full_name ?? b.client_full_name;
  const artistName =
    b.artist_name ?? b.artist?.name ?? b.artist_profile?.display_name ?? b.artist_display_name;

  if (role === "artist") return clientName || shortId(b.client_id);
  return artistName || shortId(b.artist_id);
}

export default function BookingsScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();

  const [profile, setProfile] = useState<MyProfile | null>(null);

  // loading = bootstrap loading (first paint)
  const [loading, setLoading] = useState(true);

  // ready = prevents ANY UI from rendering until profile+bookings are both loaded once
  const [ready, setReady] = useState(false);

  // bookingsLoading = refresh spinner state (does NOT blank screen)
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // prevents race conditions / double paints when navigating quickly
  const bootRef = useRef(0);

  const role = useMemo(() => profile?.role ?? "client", [profile?.role]);

  const bootstrap = async () => {
    const bootId = ++bootRef.current;

    setReady(false);
    setLoading(true);

    try {
      if (!user) {
        setProfile(null);
        setBookings([]);
        return;
      }

      const p = await getMyProfile();
      if (bootRef.current !== bootId) return;

      setProfile(p);

      const data = p.role === "artist" ? await listArtistBookings() : await listMyBookings();
      if (bootRef.current !== bootId) return;

      setBookings(data);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
    } finally {
      if (bootRef.current === bootId) {
        setLoading(false);
        setReady(true);
      }
    }
  };

  const refreshBookingsOnly = async () => {
    if (!profile?.role) return;

    setBookingsLoading(true);
    try {
      const data = profile.role === "artist" ? await listArtistBookings() : await listMyBookings();
      setBookings(data);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();

    return () => {
      // invalidate any in-flight bootstrap when leaving screen
      bootRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const doUpdateStatus = async (id: string, status: BookingStatus) => {
    if (mutatingId) return;
    setMutatingId(id);

    // optimistic
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));

    try {
      await updateBookingStatus(id, status);
      await refreshBookingsOnly();
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
      await refreshBookingsOnly(); // rollback via refetch
    } finally {
      setMutatingId(null);
    }
  };

  const doRemoveForMe = async (id: string) => {
    if (mutatingId) return;
    setMutatingId(id);

    const prev = bookings;
    setBookings((p) => p.filter((b) => b.id !== id));

    try {
      await hideBookingForMe(id);
      await refreshBookingsOnly();
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Remove failed", e.message);
      setBookings(prev);
    } finally {
      setMutatingId(null);
    }
  };

  const title = "Bookings";
  const subtitle =
    role === "artist"
      ? "Review and manage client booking requests."
      : "Track your booking requests and confirmations.";

  // ✅ Hard gate: nothing renders until initial bootstrap (profile+bookings) is done.
  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.screen, styles.fullCenter]}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
          </Pressable>

          <Pressable
            onPress={refreshBookingsOnly}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Refresh bookings"
          >
            {bookingsLoading ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="refresh" size={20} color={"rgba(0,0,0,0.75)"} />
            )}
          </Pressable>
        </View>

        {/* (design unchanged) */}
        <Text style={styles.h1}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>

        {bookings.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptySub}>Book a service from the marketplace and it’ll show here.</Text>
          </View>
        ) : (
          <ScrollView
            style={{ marginTop: 12 }}
            contentContainerStyle={{ paddingBottom: 10, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {bookings.map((b: any) => {
              const isPending = b.status === "pending";
              const isAccepted = b.status === "accepted";
              const isCancelled = b.status === "cancelled";
              const isCompleted = b.status === "completed";

              const showClientCancel = role === "client" && (isPending || isAccepted);
              const showArtistAccept = role === "artist" && isPending;
              const showArtistCancel = role === "artist" && (isPending || isAccepted);
              const showArtistComplete = role === "artist" && isAccepted;

              const showRemove = isCancelled || isCompleted;
              const disabled = mutatingId === b.id;

              const { date, time } = formatWhenPretty(b.start_time);
              const nameLabel = role === "artist" ? "Client" : "Artist";
              const displayName = getDisplayNameForRow(b, role);

              return (
                <View key={b.id} style={styles.bookingCard}>
                  <View style={styles.bookingTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dateText}>{date}</Text>
                      <Text style={styles.timeText}>{time}</Text>

                      <Text style={styles.bookingMeta}>
                        {nameLabel}: <Text style={styles.bookingMetaStrong}>{displayName}</Text>
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusPill,
                        isCancelled && { opacity: 0.7 },
                        isCompleted && { opacity: 0.85 },
                      ]}
                    >
                      <Text style={styles.statusText}>{String(b.status).toUpperCase()}</Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    {/* Client cancel (icon) */}
                    {role === "client" && showClientCancel && (
                      <Pressable
                        disabled={disabled}
                        onPress={() =>
                          Alert.alert("Cancel booking?", "This will cancel your booking.", [
                            { text: "No" },
                            { text: "Yes", onPress: () => doUpdateStatus(b.id, "cancelled") },
                          ])
                        }
                        style={[styles.iconActionBtn, disabled && styles.disabledBtn]}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel booking"
                      >
                        <Ionicons name="close-circle-outline" size={18} color={BLACK} />
                      </Pressable>
                    )}

                    {/* Artist accept (primary button) */}
                    {role === "artist" && showArtistAccept && (
                      <Pressable
                        disabled={disabled}
                        onPress={() => doUpdateStatus(b.id, "accepted")}
                        style={[styles.primaryBtn, styles.primaryBtnRow, disabled && styles.disabledBtn]}
                      >
                        <Ionicons name="checkmark" size={18} color={OFF_WHITE} />
                        <Text style={styles.primaryBtnText}>Accept</Text>
                      </Pressable>
                    )}

                    {/* Artist cancel (icon) */}
                    {role === "artist" && showArtistCancel && (
                      <Pressable
                        disabled={disabled}
                        onPress={() =>
                          Alert.alert("Cancel request?", "This will cancel the booking.", [
                            { text: "No" },
                            { text: "Yes", onPress: () => doUpdateStatus(b.id, "cancelled") },
                          ])
                        }
                        style={[styles.iconActionBtn, disabled && styles.disabledBtn]}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel request"
                      >
                        <Ionicons name="close-circle-outline" size={18} color={BLACK} />
                      </Pressable>
                    )}

                    {/* Artist complete (secondary button) */}
                    {role === "artist" && showArtistComplete && (
                      <Pressable
                        disabled={disabled}
                        onPress={() => doUpdateStatus(b.id, "completed")}
                        style={[styles.secondaryBtn, disabled && styles.disabledBtn]}
                      >
                        <Ionicons name="checkmark-circle-outline" size={18} color={BLACK} />
                        <Text style={styles.secondaryBtnText}>Complete</Text>
                      </Pressable>
                    )}

                    {/* Remove (icon) */}
                    {showRemove && (
                      <Pressable
                        disabled={disabled}
                        onPress={() =>
                          Alert.alert("Remove from my view?", "This removes it from your view only.", [
                            { text: "No" },
                            { text: "Remove", onPress: () => doRemoveForMe(b.id) },
                          ])
                        }
                        style={[styles.iconActionBtn, disabled && styles.disabledBtn]}
                        accessibilityRole="button"
                        accessibilityLabel="Remove booking"
                      >
                        <Ionicons name="trash-outline" size={18} color={BLACK} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={{ height: 90 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  screen: { flex: 1, padding: 20 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    marginBottom: 12,
  },

  primaryBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  h1: { fontSize: 22, fontWeight: "900", color: BLACK },
  sub: { marginTop: 4, color: MUTED, fontWeight: "600" },

  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  empty: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: PINK,
    padding: 14,
  },
  emptyTitle: { fontWeight: "900", color: BLACK },
  emptySub: { marginTop: 6, fontWeight: "700", color: MUTED },

  bookingCard: {
    borderRadius: 18,
    backgroundColor: OFF_WHITE,
    padding: 14,
    gap: 12,
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },

  dateText: { fontSize: 15, fontWeight: "900", color: BLACK },
  timeText: { marginTop: 3, fontSize: 13, fontWeight: "800", color: "rgba(0,0,0,0.72)" },

  bookingMeta: { marginTop: 10, color: MUTED, fontWeight: "700" },
  bookingMetaStrong: { color: BLACK, fontWeight: "900" },

  statusPill: {
    backgroundColor: PINK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  statusText: { color: BLACK, fontWeight: "900" },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
    alignItems: "center",
  },

  primaryBtn: {
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryBtnText: { color: OFF_WHITE, fontWeight: "900" },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: OFF_WHITE,
  },
  secondaryBtnText: { color: BLACK, fontWeight: "900" },

  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },

  disabledBtn: { opacity: 0.55 },
});
