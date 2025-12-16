import React, { useEffect, useMemo, useState } from "react";
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

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function isExpectedNoSessionError(e: any) {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("no user session") || msg.includes("not signed in");
}

export default function AccountScreen({
  onBack,
  onOpenOnboarding,
  onOpenSettings,
  onSignedOut,
}: {
  onBack: () => void;
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
  onSignedOut: () => void;
}) {
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

  const role = useMemo(() => profile?.role ?? "client", [profile?.role]);

  const loadProfile = async () => {
    const p = await getMyProfile();
    setProfile(p);
  };

  const loadBookings = async (roleOverride?: "client" | "artist") => {
    const r = roleOverride ?? profile?.role;
    if (!r) return;

    setBookingsLoading(true);
    try {
      const data = r === "artist" ? await listArtistBookings() : await listMyBookings();
      setBookings(data);
    } catch (e: any) {
      // ✅ don't scream during signout transitions
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
    } finally {
      setBookingsLoading(false);
    }
  };

  const load = async () => {
    // ✅ if logged out, don’t try to fetch anything
    if (!user) {
      setProfile(null);
      setBookings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      await loadProfile();
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

  useEffect(() => {
    if (!user) return;
    if (profile?.role) loadBookings(profile.role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, refreshSeq, user?.id]);

  const doUpdateStatus = async (id: string, status: BookingStatus) => {
    if (mutatingId) return;
    setMutatingId(id);

    // Optimistic update
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));

    try {
      await updateBookingStatus(id, status);
      setRefreshSeq((s) => s + 1);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
      setRefreshSeq((s) => s + 1); // rollback via re-fetch
    } finally {
      setMutatingId(null);
    }
  };

  const doRemoveForMe = async (id: string) => {
    if (mutatingId) return;
    setMutatingId(id);

    // Optimistic remove
    const prev = bookings;
    setBookings((p) => p.filter((b) => b.id !== id));

    try {
      await hideBookingForMe(id);
      setRefreshSeq((s) => s + 1);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Remove failed", e.message);
      setBookings(prev);
    } finally {
      setMutatingId(null);
    }
  };

  const onSignOutPress = async () => {
    try {
      await signOut();
      // ✅ Immediately leave this screen so it stops fetching user data
      onSignedOut();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.pillBtn}>
            <Text style={styles.pillText}>Back</Text>
          </Pressable>

          <Text style={styles.h1}>Account</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={async () => {
                try {
                  await loadProfile();
                  await loadBookings(role);
                } catch (e: any) {
                  if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
                }
              }}
              style={styles.pillBtn}
            >
              <Text style={styles.pillText}>Refresh</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>{profile?.username || "User"}</Text>
              <Text style={styles.heroSub}>{user?.email}</Text>

              {profile?.role === "artist" && (
                <View style={styles.rolePillWrap}>
                  <Text style={styles.rolePillText}>Artist</Text>
                </View>
              )}
            </View>

            <View style={{ gap: 10 }}>
              <Pressable onPress={onOpenOnboarding} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>
                  {profile?.role === "artist" ? "Edit Artist Profile" : "Become Artist"}
                </Text>
              </Pressable>

              <Pressable onPress={onSignOutPress} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Sign Out</Text>
              </Pressable>
            </View>

            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {profile?.role === "artist" ? "Requests" : "My bookings"}
                </Text>
                <Text style={styles.sectionSub}>
                  Cancelled/completed bookings can be removed from your view.
                </Text>
              </View>
            </View>

            {bookingsLoading ? (
              <View style={styles.centerSmall}>
                <ActivityIndicator />
              </View>
            ) : bookings.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No bookings yet</Text>
                <Text style={styles.emptySub}>
                  Book a service from the marketplace and it’ll show here.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {bookings.map((b) => {
                  const isPending = b.status === "pending";
                  const isAccepted = b.status === "accepted";
                  const isCancelled = b.status === "cancelled";
                  const isCompleted = b.status === "completed";

                  // Client can cancel if pending/accepted
                  const showClientCancel = role === "client" && (isPending || isAccepted);

                  // Artist can accept if pending; cancel if pending/accepted; complete if accepted
                  const showArtistAccept = role === "artist" && isPending;
                  const showArtistCancel = role === "artist" && (isPending || isAccepted);
                  const showArtistComplete = role === "artist" && isAccepted;

                  // Remove only for cancelled/completed
                  const showRemove = isCancelled || isCompleted;

                  const disabled = mutatingId === b.id;

                  return (
                    <View key={b.id} style={styles.bookingCard}>
                      <View style={styles.bookingTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bookingTitle}>{formatWhen(b.start_time)}</Text>
                          <Text style={styles.bookingMeta}>
                            {role === "artist"
                              ? `Client: ${b.client_id.slice(0, 6)}…`
                              : `Artist: ${b.artist_id.slice(0, 6)}…`}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.statusPill,
                            isCancelled && styles.statusCancelled,
                            isCompleted && styles.statusCompleted,
                          ]}
                        >
                          <Text style={styles.statusText}>{b.status.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={styles.actionRow}>
                        {role === "client" && showClientCancel && (
                          <Pressable
                            disabled={disabled}
                            onPress={() =>
                              Alert.alert("Cancel booking?", "This will cancel your booking.", [
                                { text: "No" },
                                { text: "Yes", onPress: () => doUpdateStatus(b.id, "cancelled") },
                              ])
                            }
                            style={[styles.actionBtnOutline, disabled && styles.disabledBtn]}
                          >
                            <Text style={styles.actionBtnOutlineText}>Cancel</Text>
                          </Pressable>
                        )}

                        {role === "artist" && showArtistAccept && (
                          <Pressable
                            disabled={disabled}
                            onPress={() => doUpdateStatus(b.id, "accepted")}
                            style={[styles.actionBtn, disabled && styles.disabledBtn]}
                          >
                            <Text style={styles.actionBtnText}>Accept</Text>
                          </Pressable>
                        )}

                        {role === "artist" && showArtistCancel && (
                          <Pressable
                            disabled={disabled}
                            onPress={() =>
                              Alert.alert("Cancel request?", "This will cancel the booking.", [
                                { text: "No" },
                                { text: "Yes", onPress: () => doUpdateStatus(b.id, "cancelled") },
                              ])
                            }
                            style={[styles.actionBtnOutline, disabled && styles.disabledBtn]}
                          >
                            <Text style={styles.actionBtnOutlineText}>Cancel</Text>
                          </Pressable>
                        )}

                        {role === "artist" && showArtistComplete && (
                          <Pressable
                            disabled={disabled}
                            onPress={() => doUpdateStatus(b.id, "completed")}
                            style={[styles.actionBtn, disabled && styles.disabledBtn]}
                          >
                            <Text style={styles.actionBtnText}>Complete</Text>
                          </Pressable>
                        )}

                        {showRemove && (
                          <Pressable
                            disabled={disabled}
                            onPress={() =>
                              Alert.alert(
                                "Remove from my view?",
                                "This removes it from your view only.",
                                [
                                  { text: "No" },
                                  { text: "Remove", onPress: () => doRemoveForMe(b.id) },
                                ]
                              )
                            }
                            style={[styles.actionBtnOutline, disabled && styles.disabledBtn]}
                          >
                            <Text style={styles.actionBtnOutlineText}>Remove</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* extra padding so bottom doesn’t look like a “hard border” */}
            <View style={{ height: 110 }} />
          </ScrollView>
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
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK, letterSpacing: 0.2 },

  pillBtn: {
    backgroundColor: OFF_WHITE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
  },
  pillBtnSoft: {
    backgroundColor: PINK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  pillText: { color: BLACK, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerSmall: { paddingVertical: 12, alignItems: "center" },

  scrollContent: {
    paddingBottom: 10,
    gap: 12,
  },

  heroCard: {
    borderRadius: 20,
    backgroundColor: PINK,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  heroTitle: { fontSize: 22, fontWeight: "900", color: BLACK },
  heroSub: { marginTop: 4, color: BLACK, opacity: 0.78, fontWeight: "700" },

  rolePillWrap: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: OFF_WHITE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  rolePillText: { color: BLACK, fontWeight: "900" },

  primaryBtn: {
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  primaryBtnText: { color: OFF_WHITE, fontWeight: "900", letterSpacing: 0.2 },

  secondaryBtn: {
    backgroundColor: OFF_WHITE,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
  },
  secondaryBtnText: { color: BLACK, fontWeight: "900" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  sectionSub: { color: BLACK, opacity: 0.7, fontWeight: "700", marginTop: 4 },

  emptyCard: {
    borderRadius: 20,
    backgroundColor: OFF_WHITE,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  emptyTitle: { color: BLACK, fontWeight: "900" },
  emptySub: { marginTop: 6, color: BLACK, opacity: 0.7, fontWeight: "700" },

  bookingCard: {
    borderRadius: 20,
    backgroundColor: OFF_WHITE,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 1,
    gap: 10,
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  bookingTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  bookingMeta: { marginTop: 6, color: BLACK, opacity: 0.7, fontWeight: "700" },

  statusPill: {
    backgroundColor: PINK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    alignSelf: "flex-start",
  },
  statusCancelled: { opacity: 0.7 },
  statusCompleted: { opacity: 0.85 },
  statusText: { color: BLACK, fontWeight: "900" },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
    alignItems: "center",
  },
  actionBtn: {
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionBtnText: { color: OFF_WHITE, fontWeight: "900" },

  actionBtnOutline: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: OFF_WHITE,
  },
  actionBtnOutlineText: { color: BLACK, fontWeight: "900" },

  disabledBtn: { opacity: 0.55 },
});
