// BookingsScreen.tsx
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
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAuth } from "../context/AuthContext";
import { getMyProfile } from "../lib/profile";
import { supabase } from "../lib/supabase";
import {
  listMyBookings,
  listArtistBookings,
  updateBookingStatus,
  hideBookingForMe,
  updateBookingConsultationMeta,
  BookingRow,
  BookingStatus,
} from "../lib/bookings";

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";
const MUTED = "rgba(0,0,0,0.6)";
const BORDER = "rgba(0,0,0,0.10)";
const CARD_BG = "rgba(0,0,0,0.03)";

type ArtistFilter = "all" | "consultations";
type ConsultStatus = "" | "requested" | "proposed" | "scheduled" | "declined";

function normConsultStatus(raw: any): ConsultStatus {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "requested" || v === "proposed" || v === "scheduled" || v === "declined") return v;
  return "";
}

function isExpectedNoSessionError(e: any) {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("no user session") || msg.includes("not signed in");
}

function formatIsoPretty(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "—", time: "" };
  return formatDatePretty(d);
}
function formatDatePretty(d: Date) {
  if (!d || isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function shortId(id?: string | null) {
  if (!id) return "—";
  return `${id.slice(0, 6)}…`;
}
function normalizeProfileMaybeArray(p: any) {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}
function bestDisplayName(profile: any, fallbackLabel: string) {
  const p = normalizeProfileMaybeArray(profile);
  const full = String(p?.full_name ?? "").trim();
  const user = String(p?.username ?? "").trim();
  // ✅ Never show raw IDs to users
  return full || user || fallbackLabel;
}
function hasConsultation(b: any) {
  return !!b?.consultation_meta?.wants_consultation;
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 0, 0);
  return x;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function applyPickedTime(baseDate: Date, pickedTime: Date) {
  const next = new Date(baseDate);
  next.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
  return next;
}
function applyPickedDate(baseDate: Date, pickedDate: Date) {
  const next = new Date(baseDate);
  next.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
  return next;
}
function clampToFuture(d: Date) {
  const now = new Date();
  return d.getTime() < now.getTime() ? now : d;
}
function snapToMinuteStep(d: Date, step: number) {
  const out = new Date(d);
  const mins = out.getMinutes();
  const snapped = Math.round(mins / step) * step;

  if (snapped >= 60) {
    out.setHours(out.getHours() + 1, 0, 0, 0);
    return out;
  }

  out.setMinutes(snapped, 0, 0);
  return out;
}

/**
 * Consultation max time rules relative to BOOKING START:
 * - allowSameDay=false → latest is day BEFORE booking at 23:59
 * - allowSameDay=true  → latest is bookingTime - 5 minutes (must be strictly before booking)
 */
function consultationMaxForBooking(bookingStart: Date, allowSameDay: boolean) {
  if (allowSameDay) return addMinutes(bookingStart, -5);
  return endOfDay(addDays(startOfDay(bookingStart), -1));
}

function clampConsultationToRules(next: Date, bookingStart: Date, allowSameDay: boolean) {
  let out = new Date(next);
  out = clampToFuture(out);

  const max = consultationMaxForBooking(bookingStart, allowSameDay);
  if (out.getTime() > max.getTime()) out = new Date(max);

  if (allowSameDay && sameDay(out, bookingStart) && out.getTime() >= bookingStart.getTime()) {
    out = new Date(addMinutes(bookingStart, -5));
  }
  return out;
}

function showCalendarHelp() {
  Alert.alert(
    "Consultation tips",
    "Booking acceptance and consultation scheduling are separate.\n\nOnly ONE side can propose at a time. After you propose, you must wait for the other person to accept or counter."
  );
}

function PickerSheet(props: {
  title: string;
  visible: boolean;
  mode: "date" | "time";
  value: Date;
  minuteInterval?: number;
  onChangeValue: (next: Date) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { title, visible, mode, value, minuteInterval, onChangeValue, onCancel, onDone } = props;

  if (Platform.OS !== "ios") return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.sheetBackdrop} onPress={onCancel}>
        <Pressable style={styles.sheetCard} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={showCalendarHelp} style={styles.infoIconBtn}>
              <Ionicons name="information-circle-outline" size={20} color={BLACK} />
            </Pressable>
          </View>

          <DateTimePicker
            value={new Date(value)}
            mode={mode}
            display="spinner"
            minuteInterval={minuteInterval}
            onChange={(e: DateTimePickerEvent, picked?: Date) => {
              if (e.type === "dismissed") return;
              if (!picked) return;
              onChangeValue(picked);
            }}
          />

          <View style={styles.sheetActions}>
            <Pressable onPress={onCancel} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>

            <Pressable onPress={onDone} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** who proposed last */
function metaProposedBy(meta: any): "client" | "artist" | null {
  const note = String(meta?.proposed_note ?? "").toLowerCase();
  if (note.includes("from_client")) return "client";
  if (note.includes("from_artist")) return "artist";
  return null;
}
function uniqAppend(arr: any[], iso: string) {
  const next = [...(arr ?? [])].filter(Boolean).map(String);
  if (!next.includes(iso)) next.push(iso);
  return next;
}

function bookingStatusLabel(s: any) {
  const v = String(s ?? "pending").toLowerCase();
  if (v === "pending") return "Pending";
  if (v === "accepted") return "Accepted";
  if (v === "cancelled") return "Cancelled";
  if (v === "completed") return "Completed";
  return String(s ?? "Pending");
}

function consultStatusLabel(s: ConsultStatus) {
  if (s === "requested") return "Requested";
  if (s === "proposed") return "Proposed";
  if (s === "scheduled") return "Scheduled";
  if (s === "declined") return "Declined";
  return "Requested";
}

/**
 * ✅ RLS-safe hydration:
 * Sometimes the joined `client_profile` / `artist_profile` comes back null due to RLS.
 * We patch names by fetching profiles directly for the IDs we need.
 */
async function hydrateProfilesIntoBookings(rows: BookingRow[]) {
  const ids = new Set<string>();
  (rows ?? []).forEach((b: any) => {
    if (!b?.client_profile && b?.client_id) ids.add(String(b.client_id));
    if (!b?.artist_profile && b?.artist_id) ids.add(String(b.artist_id));
  });

  const list = Array.from(ids);
  if (list.length === 0) return rows;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, phone, allow_same_day_consultation")
    .in("id", list);

  if (error) {
    // If profiles are also blocked, just return original rows
    return rows;
  }

  const map = new Map<string, any>();
  (data ?? []).forEach((p: any) => map.set(String(p.id), p));

  return (rows ?? []).map((b: any) => {
    const patched = { ...b } as any;
    if (!patched.client_profile && map.has(String(patched.client_id))) patched.client_profile = map.get(String(patched.client_id));
    if (!patched.artist_profile && map.has(String(patched.artist_id))) patched.artist_profile = map.get(String(patched.artist_id));
    return patched;
  });
}

export default function BookingsScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();

  const [ready, setReady] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const [profile, setProfile] = useState<any>(null);
  const role = useMemo(() => (profile?.role ?? "client") as "client" | "artist", [profile?.role]);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const [artistFilter, setArtistFilter] = useState<ArtistFilter>("all");
  const bootRef = useRef(0);

  // compose
  const [composeId, setComposeId] = useState<string | null>(null);
  const [composeBookingStartIso, setComposeBookingStartIso] = useState<string | null>(null);
  const [composeAllowSameDay, setComposeAllowSameDay] = useState(false);
  const [composeValue, setComposeValue] = useState<Date | null>(null);

  const [showDateSheet, setShowDateSheet] = useState(false);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [draftValue, setDraftValue] = useState<Date | null>(null);

  const bootstrap = async () => {
    const bootId = ++bootRef.current;
    setReady(false);

    try {
      if (!user) {
        setProfile(null);
        setBookings([]);
        setReady(true);
        return;
      }

      const p = await getMyProfile();
      if (bootRef.current !== bootId) return;
      setProfile(p);

      const raw = p.role === "artist" ? await listArtistBookings() : await listMyBookings();
      if (bootRef.current !== bootId) return;

      const hydrated = await hydrateProfilesIntoBookings(raw);
      if (bootRef.current !== bootId) return;
      setBookings(hydrated);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
    } finally {
      if (bootRef.current === bootId) setReady(true);
    }
  };

  const refreshBookingsOnly = async () => {
    if (!user) return;
    setBookingsLoading(true);
    try {
      const p = await getMyProfile();
      setProfile(p);

      const raw = p.role === "artist" ? await listArtistBookings() : await listMyBookings();
      const hydrated = await hydrateProfilesIntoBookings(raw);
      setBookings(hydrated);
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    return () => {
      bootRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const visibleBookings = useMemo(() => {
    if (role !== "artist") return bookings;
    if (artistFilter === "consultations") return bookings.filter((b: any) => hasConsultation(b));
    return bookings;
  }, [bookings, role, artistFilter]);

  const doUpdateStatus = async (id: string, status: BookingStatus) => {
    if (mutatingId) return;
    setMutatingId(id);

    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));

    try {
      await updateBookingStatus(id, status);
      await refreshBookingsOnly();
    } catch (e: any) {
      if (!isExpectedNoSessionError(e)) Alert.alert("Error", e.message);
      await refreshBookingsOnly();
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

  // consultation
  const closeCompose = () => {
    setComposeId(null);
    setComposeBookingStartIso(null);
    setComposeAllowSameDay(false);
    setComposeValue(null);
    setDraftValue(null);
    setShowDateSheet(false);
    setShowTimeSheet(false);
  };

  const openCompose = (b: any) => {
    const bookingStart = new Date(b.start_time);
    if (isNaN(bookingStart.getTime())) {
      Alert.alert("Error", "Invalid booking time.");
      return;
    }

    const sameDayAllowed =
      role === "artist"
        ? Boolean(profile?.allow_same_day_consultation)
        : Boolean((normalizeProfileMaybeArray(b?.artist_profile) as any)?.allow_same_day_consultation);

    const max = consultationMaxForBooking(bookingStart, sameDayAllowed);
    if (max.getTime() <= new Date().getTime()) {
      Alert.alert("Too late", "This booking is too soon to schedule a consultation.");
      return;
    }

    const meta = b?.consultation_meta ?? {};
    const existing = meta?.proposed_time_iso ? new Date(meta.proposed_time_iso) : null;

    let initial = existing && !isNaN(existing.getTime()) ? existing : new Date();
    initial = snapToMinuteStep(initial, 5);
    initial = clampConsultationToRules(initial, bookingStart, sameDayAllowed);

    setComposeId(b.id);
    setComposeBookingStartIso(b.start_time);
    setComposeAllowSameDay(sameDayAllowed);
    setComposeValue(initial);
    setDraftValue(initial);
  };

  const openDate = () => {
    if (!composeValue) return;
    setDraftValue(composeValue);
    if (Platform.OS === "ios") {
      setShowTimeSheet(false);
      setShowDateSheet(true);
    } else {
      setShowDateSheet(true);
    }
  };

  const openTime = () => {
    if (!composeValue) return;
    setDraftValue(composeValue);
    if (Platform.OS === "ios") {
      setShowDateSheet(false);
      setShowTimeSheet(true);
    } else {
      setShowTimeSheet(true);
    }
  };

  const onAndroidDateChange = (e: DateTimePickerEvent, picked?: Date) => {
    if (e.type === "dismissed") {
      setShowDateSheet(false);
      return;
    }
    if (!picked || !draftValue) return;
    setDraftValue(applyPickedDate(draftValue, picked));
  };

  const onAndroidTimeChange = (e: DateTimePickerEvent, picked?: Date) => {
    if (e.type === "dismissed") {
      setShowTimeSheet(false);
      return;
    }
    if (!picked || !draftValue) return;
    setDraftValue(applyPickedTime(draftValue, picked));
  };

  const commitDraft = () => {
    if (!composeBookingStartIso || !draftValue) return;

    const bookingStart = new Date(composeBookingStartIso);
    const clamped = snapToMinuteStep(
      clampConsultationToRules(draftValue, bookingStart, composeAllowSameDay),
      5
    );

    setComposeValue(clamped);
    setDraftValue(clamped);
    setShowDateSheet(false);
    setShowTimeSheet(false);
  };

  const cancelDraft = () => {
    setDraftValue(composeValue);
    setShowDateSheet(false);
    setShowTimeSheet(false);
  };

  const sendProposal = async () => {
    if (!composeId || !composeValue) return;

    const booking = bookings.find((x) => x.id === composeId) as any;
    const meta = booking?.consultation_meta ?? {};
    const existingAvail = meta?.availability ?? [];

    try {
      setMutatingId(composeId);

      const iso = composeValue.toISOString();
      const nextAvail = uniqAppend(existingAvail, iso);

      await updateBookingConsultationMeta(composeId, {
        consult_status: "proposed",
        proposed_time_iso: iso,
        availability: nextAvail,
        proposed_note: role === "client" ? "from_client" : "from_artist",
      });

      closeCompose();
      await refreshBookingsOnly();
      Alert.alert("Sent ✅", "Proposal sent. Waiting for the other person to respond.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send proposal.");
    } finally {
      setMutatingId(null);
    }
  };

  const acceptProposal = async (bookingId: string, proposedIso: string) => {
    try {
      setMutatingId(bookingId);

      await updateBookingConsultationMeta(bookingId, {
        consult_status: "scheduled",
        proposed_time_iso: proposedIso,
        availability: [proposedIso],
        proposed_note: "scheduled",
      });

      await refreshBookingsOnly();
      Alert.alert("Accepted ✅", "Consultation time confirmed.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to accept.");
    } finally {
      setMutatingId(null);
    }
  };

  const declineConsultation = async (bookingId: string) => {
    try {
      setMutatingId(bookingId);

      await updateBookingConsultationMeta(bookingId, {
        consult_status: "declined",
        proposed_note: role === "client" ? "declined_by_client" : "declined_by_artist",
      });

      await refreshBookingsOnly();
      Alert.alert("Declined", "Consultation was declined. Booking remains unchanged.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to decline consultation.");
    } finally {
      setMutatingId(null);
    }
  };

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
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="rgba(0,0,0,0.75)" />
          </Pressable>

          <Pressable onPress={refreshBookingsOnly} style={styles.iconBtn}>
            {bookingsLoading ? <ActivityIndicator /> : <Ionicons name="refresh" size={20} color="rgba(0,0,0,0.75)" />}
          </Pressable>
        </View>

        <Text style={styles.h1}>Bookings</Text>
        <Text style={styles.sub}>
          {role === "artist"
            ? "Booking acceptance and consultation scheduling are separate."
            : "Your booking and consultation are managed separately."}
        </Text>

        {role === "artist" && (
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setArtistFilter("all")}
              style={[styles.filterPill, artistFilter === "all" && styles.filterPillOn]}
            >
              <Text style={[styles.filterText, artistFilter === "all" && styles.filterTextOn]}>All</Text>
            </Pressable>

            <Pressable
              onPress={() => setArtistFilter("consultations")}
              style={[styles.filterPill, artistFilter === "consultations" && styles.filterPillOn]}
            >
              <Ionicons name="videocam-outline" size={16} color={artistFilter === "consultations" ? OFF_WHITE : BLACK} />
              <Text style={[styles.filterText, artistFilter === "consultations" && styles.filterTextOn]}>
                Consultations
              </Text>
            </Pressable>
          </View>
        )}

        {visibleBookings.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptySub}>Book a service from the marketplace and it’ll show here.</Text>
          </View>
        ) : (
          <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 10, gap: 12 }}>
            {visibleBookings.map((b: any) => {
              const isPending = b.status === "pending";
              const isAccepted = b.status === "accepted";
              const isCancelled = b.status === "cancelled";
              const isCompleted = b.status === "completed";

              // ✅ ONLY disable consult stuff when booking is cancelled/completed
              const bookingLive = !isCancelled && !isCompleted;

              const who =
                role === "artist"
                  ? bestDisplayName(b.client_profile, "Client")
                  : bestDisplayName(b.artist_profile, "Artist");

              const when = formatIsoPretty(b.start_time);

              const consultationRequested = hasConsultation(b);
              const consultStatus = normConsultStatus(b?.consultation_meta?.consult_status);
              const meta = b?.consultation_meta ?? {};

              const proposedIso: string | null =
                meta?.proposed_time_iso ??
                (Array.isArray(meta?.availability) && meta.availability[0] ? String(meta.availability[0]) : null);

              const proposedPretty = proposedIso ? formatIsoPretty(proposedIso) : null;

              const proposedBy = metaProposedBy(meta);
              const iProposedLast =
                proposedBy &&
                ((proposedBy === "client" && role === "client") || (proposedBy === "artist" && role === "artist"));

              // ✅ Accept proposed consult if other side proposed
              const canAcceptConsult =
                bookingLive &&
                !!proposedIso &&
                consultStatus !== "scheduled" &&
                consultStatus !== "declined" &&
                !iProposedLast;

              // ✅ Turn-taking (anti-spam)
              const canProposeInRequested = consultStatus === "requested" && role === "artist";
              const canProposeInProposed = consultStatus === "proposed" && !iProposedLast;
              const canProposeInBlank = consultStatus === "" && role === "artist";

              const canOpenCompose =
                bookingLive &&
                consultationRequested &&
                consultStatus !== "scheduled" &&
                consultStatus !== "declined" &&
                (canProposeInRequested || canProposeInProposed || canProposeInBlank);

              const waitingText =
                consultStatus === "scheduled"
                  ? "Consultation confirmed."
                  : consultStatus === "declined"
                  ? "Consultation declined."
                  : consultStatus === "proposed"
                  ? iProposedLast
                    ? "Waiting for the other person to accept or counter."
                    : "You can accept, or propose another time."
                  : consultStatus === "requested"
                  ? role === "artist"
                    ? "Client requested a consultation — propose a time."
                    : "Waiting for the artist to propose a time."
                  : consultationRequested && role === "client"
                  ? "Waiting for the artist to propose a time."
                  : "";

              return (
                <View key={b.id} style={styles.bookingCard}>
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookingMeta}>
                        {role === "artist" ? "Client: " : "Artist: "}
                        <Text style={styles.bookingMetaStrong}>{who}</Text>
                      </Text>
                    </View>

                    {(isCancelled || isCompleted) && (
                      <Pressable
                        disabled={mutatingId === b.id}
                        onPress={() =>
                          Alert.alert("Remove from my view?", "This removes it from your view only.", [
                            { text: "No" },
                            { text: "Remove", onPress: () => doRemoveForMe(b.id) },
                          ])
                        }
                        style={[styles.iconActionBtn, mutatingId === b.id && styles.disabledBtn]}
                      >
                        <Ionicons name="trash-outline" size={18} color={BLACK} />
                      </Pressable>
                    )}
                  </View>

                  {/* BOOKING REQUEST */}
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionTop}>
                      <Text style={styles.sectionTitle}>Booking request</Text>
                      <View style={[styles.sectionPill, styles.bookingPill]}>
                        <Text style={styles.sectionPillText}>{bookingStatusLabel(b.status)}</Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.dateText}>{when.date}</Text>
                      <Text style={styles.timeText}>{when.time}</Text>
                    </View>

                    <View style={[styles.actionRow, { marginTop: 10 }]}>
                      {role === "artist" && isPending && (
                        <Pressable
                          disabled={mutatingId === b.id}
                          onPress={() => doUpdateStatus(b.id, "accepted")}
                          style={[styles.primaryBtn, mutatingId === b.id && styles.disabledBtn]}
                        >
                          <Ionicons name="checkmark" size={18} color={OFF_WHITE} />
                          <Text style={styles.primaryBtnText}>Accept booking</Text>
                        </Pressable>
                      )}

                      {role === "artist" && (isPending || isAccepted) && (
                        <Pressable
                          disabled={mutatingId === b.id}
                          onPress={() =>
                            Alert.alert("Cancel booking?", "This will cancel the booking.", [
                              { text: "No" },
                              { text: "Yes", onPress: () => doUpdateStatus(b.id, "cancelled") },
                            ])
                          }
                          style={[styles.secondaryBtn, mutatingId === b.id && styles.disabledBtn]}
                        >
                          <Ionicons name="close-circle-outline" size={18} color={BLACK} />
                          <Text style={styles.secondaryBtnText}>Cancel booking</Text>
                        </Pressable>
                      )}

                      {role === "artist" && isAccepted && (
                        <Pressable
                          disabled={mutatingId === b.id}
                          onPress={() => doUpdateStatus(b.id, "completed")}
                          style={[styles.secondaryBtn, mutatingId === b.id && styles.disabledBtn]}
                        >
                          <Ionicons name="checkmark-circle-outline" size={18} color={BLACK} />
                          <Text style={styles.secondaryBtnText}>Mark completed</Text>
                        </Pressable>
                      )}
                    </View>

                    {consultationRequested && (
                      <Text style={styles.sectionHint}>
                        Booking acceptance does <Text style={{ fontWeight: "900" }}>not</Text> confirm the consultation.
                      </Text>
                    )}
                  </View>

                  {/* CONSULTATION REQUEST */}
                  {consultationRequested && (
                    <View style={styles.sectionCard}>
                      <View style={styles.sectionTop}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name="videocam-outline" size={16} color={BLACK} />
                          <Text style={styles.sectionTitle}>Consultation</Text>
                        </View>
                        <View style={[styles.sectionPill, styles.consultPill]}>
                          <Text style={styles.sectionPillText}>{consultStatusLabel(consultStatus || "requested")}</Text>
                        </View>
                      </View>

                      {!bookingLive && (
                        <Text style={styles.waitingText}>Booking is not live anymore, so consultation actions are disabled.</Text>
                      )}

                      {!!waitingText && <Text style={styles.waitingText}>{waitingText}</Text>}

                      {proposedPretty && (
                        <View style={styles.proposedBadge}>
                          <Ionicons name="time-outline" size={14} color={BLACK} />
                          <Text style={styles.proposedBadgeText}>
                            Proposed {proposedBy ? `(${proposedBy})` : ""}: {proposedPretty.date} • {proposedPretty.time}
                          </Text>
                        </View>
                      )}

                      {/* Compose */}
                      {composeId === b.id && composeValue && bookingLive && (
                        <View style={styles.proposeBox}>
                          <View style={styles.proposeHeaderRow}>
                            <Text style={styles.proposeTitle}>Propose consultation time</Text>
                            <Pressable onPress={showCalendarHelp} style={styles.infoIconBtn}>
                              <Ionicons name="information-circle-outline" size={20} color={BLACK} />
                            </Pressable>
                          </View>

                          <View style={styles.proposeRow}>
                            <Pressable onPress={openDate} style={styles.proposeBtn}>
                              <Ionicons name="calendar-outline" size={16} color={BLACK} />
                              <Text style={styles.proposeBtnText}>{formatDatePretty(composeValue).date}</Text>
                            </Pressable>

                            <Pressable onPress={openTime} style={styles.proposeBtn}>
                              <Ionicons name="time-outline" size={16} color={BLACK} />
                              <Text style={styles.proposeBtnText}>{formatDatePretty(composeValue).time}</Text>
                            </Pressable>
                          </View>

                          <View style={styles.proposeActions}>
                            <Pressable onPress={closeCompose} style={styles.secondaryBtn}>
                              <Text style={styles.secondaryBtnText}>Cancel</Text>
                            </Pressable>

                            <Pressable
                              disabled={mutatingId === b.id || showDateSheet || showTimeSheet}
                              onPress={sendProposal}
                              style={[
                                styles.primaryBtn,
                                (mutatingId === b.id || showDateSheet || showTimeSheet) && styles.disabledBtn,
                              ]}
                            >
                              <Text style={styles.primaryBtnText}>Send proposal</Text>
                            </Pressable>
                          </View>
                        </View>
                      )}

                      {/* Actions */}
                      <View style={[styles.actionRow, { marginTop: 10 }]}>
                        {bookingLive && canOpenCompose && composeId !== b.id && (
                          <Pressable
                            disabled={mutatingId === b.id}
                            onPress={() => openCompose(b)}
                            style={[styles.secondaryBtn, mutatingId === b.id && styles.disabledBtn]}
                          >
                            <Ionicons name="time-outline" size={18} color={BLACK} />
                            <Text style={styles.secondaryBtnText}>
                              {consultStatus === "proposed" ? "Propose another time" : "Propose consultation time"}
                            </Text>
                          </Pressable>
                        )}

                        {bookingLive && canAcceptConsult && proposedIso && (
                          <Pressable
                            disabled={mutatingId === b.id}
                            onPress={() => acceptProposal(b.id, proposedIso)}
                            style={[styles.primaryBtn, mutatingId === b.id && styles.disabledBtn]}
                          >
                            <Ionicons name="checkmark" size={18} color={OFF_WHITE} />
                            <Text style={styles.primaryBtnText}>Accept consultation time</Text>
                          </Pressable>
                        )}

                        {bookingLive && consultStatus !== "scheduled" && consultStatus !== "declined" && (
                          <Pressable
                            disabled={mutatingId === b.id}
                            onPress={() =>
                              Alert.alert(
                                "Decline consultation?",
                                "This will decline the consultation only. The booking stays the same.",
                                [
                                  { text: "No" },
                                  { text: "Decline", onPress: () => declineConsultation(b.id), style: "destructive" },
                                ]
                              )
                            }
                            style={[styles.secondaryBtn, mutatingId === b.id && styles.disabledBtn]}
                          >
                            <Ionicons name="close-circle-outline" size={18} color={BLACK} />
                            <Text style={styles.secondaryBtnText}>Decline consultation</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* iOS Sheets */}
      {composeId && composeValue && draftValue && (
        <>
          <PickerSheet
            title="Pick a date"
            visible={showDateSheet}
            mode="date"
            value={draftValue}
            onChangeValue={(picked) => setDraftValue((prev) => (prev ? applyPickedDate(prev, picked) : picked))}
            onCancel={cancelDraft}
            onDone={commitDraft}
          />
          <PickerSheet
            title="Pick a time"
            visible={showTimeSheet}
            mode="time"
            value={draftValue}
            minuteInterval={5}
            onChangeValue={(picked) => setDraftValue((prev) => (prev ? applyPickedTime(prev, picked) : picked))}
            onCancel={cancelDraft}
            onDone={commitDraft}
          />
        </>
      )}

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

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  h1: { fontSize: 22, fontWeight: "900", color: BLACK },
  sub: { marginTop: 4, color: MUTED, fontWeight: "600" },

  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  filterRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },
  filterPillOn: { backgroundColor: BLACK, borderColor: "rgba(0,0,0,0.20)" },
  filterText: { fontWeight: "900", color: BLACK },
  filterTextOn: { color: OFF_WHITE },

  empty: { marginTop: 12, borderRadius: 16, backgroundColor: PINK, padding: 14 },
  emptyTitle: { fontWeight: "900", color: BLACK },
  emptySub: { marginTop: 6, fontWeight: "700", color: MUTED },

  bookingCard: {
    borderRadius: 18,
    backgroundColor: OFF_WHITE,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },

  bookingMeta: { color: MUTED, fontWeight: "800" },
  bookingMetaStrong: { color: BLACK, fontWeight: "900" },
  smallMuted: { marginTop: 4, color: "rgba(0,0,0,0.45)", fontWeight: "800", fontSize: 12 },

  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    padding: 12,
  },
  sectionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { fontWeight: "900", color: BLACK },

  sectionPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  bookingPill: { backgroundColor: PINK },
  consultPill: { backgroundColor: "rgba(0,0,0,0.06)" },
  sectionPillText: { fontWeight: "900", color: BLACK, fontSize: 12 },

  dateText: { fontSize: 15, fontWeight: "900", color: BLACK },
  timeText: { marginTop: 3, fontSize: 13, fontWeight: "800", color: "rgba(0,0,0,0.72)" },

  sectionHint: { marginTop: 10, color: "rgba(0,0,0,0.55)", fontWeight: "800", fontSize: 12 },

  proposedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  proposedBadgeText: { fontWeight: "900", fontSize: 12, color: BLACK },

  waitingText: { marginTop: 10, color: MUTED, fontWeight: "800", fontSize: 12 },

  proposeBox: { backgroundColor: OFF_WHITE, borderRadius: 14, padding: 12, gap: 10, marginTop: 10 },
  proposeHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  infoIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },

  proposeTitle: { fontWeight: "900", color: BLACK },
  proposeRow: { flexDirection: "row", gap: 10 },

  proposeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: OFF_WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  proposeBtnText: { fontWeight: "900", color: BLACK, fontSize: 12 },

  proposeActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },

  actionRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    justifyContent: "center",
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

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end", padding: 12 },
  sheetCard: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 14, fontWeight: "900", color: BLACK },
  sheetActions: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 10 },
});

