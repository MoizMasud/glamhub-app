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
  TextInput,
  FlatList,
  StyleSheet as RNStyleSheet,
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

type StatusFilter = "all" | "pending" | "accepted" | "cancelled" | "completed";
type SortMode = "soonest" | "newest" | "oldest";
const PAGE_SIZE = 20;

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
function formatDateOnly(d: Date) {
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeProfileMaybeArray(p: any) {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}
function bestDisplayName(profile: any, fallbackLabel: string) {
  const p = normalizeProfileMaybeArray(profile);
  const full = String(p?.full_name ?? "").trim();
  const user = String(p?.username ?? "").trim();
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
  x.setHours(23, 59, 59, 999);
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

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}
function endOfWeek(d: Date) {
  return endOfDay(addDays(startOfWeek(d), 6));
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function endOfMonth(d: Date) {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  x.setMilliseconds(-1);
  return x;
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
      <View style={styles.sheetBackdrop}>
        {/* backdrop is separate so picker stays responsive */}
        <Pressable style={RNStyleSheet.absoluteFill} onPress={onCancel} />

        <View style={styles.sheetCard}>
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
        </View>
      </View>
    </Modal>
  );
}

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

  if (error) return rows;

  const map = new Map<string, any>();
  (data ?? []).forEach((p: any) => map.set(String(p.id), p));

  return (rows ?? []).map((b: any) => {
    const patched = { ...b } as any;
    if (!patched.client_profile && map.has(String(patched.client_id)))
      patched.client_profile = map.get(String(patched.client_id));
    if (!patched.artist_profile && map.has(String(patched.artist_id)))
      patched.artist_profile = map.get(String(patched.artist_id));
    return patched;
  });
}

type DateRange = { start: Date; end: Date };
type ParsedQuery = {
  text: string;
  status?: BookingStatus;
  range?: DateRange;
  mode?: "upcoming";
};

function normalizeStatusToken(t: string): BookingStatus | undefined {
  const x = t.toLowerCase();
  if (x === "pending" || x === "awaiting") return "pending";
  if (x === "accepted" || x === "accept" || x === "confirmed" || x === "confirm") return "accepted";
  if (x === "cancelled" || x === "canceled" || x === "cancel" || x === "void") return "cancelled";
  if (x === "completed" || x === "complete" || x === "done" || x === "finished") return "completed";
  return undefined;
}

function parseSmartQuery(input: string): ParsedQuery {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return { text: "" };

  const now = new Date();
  let status: BookingStatus | undefined;
  let range: DateRange | undefined;
  let mode: "upcoming" | undefined;

  const has = (p: string) => raw.includes(p);

  if (has("today")) range = { start: startOfDay(now), end: endOfDay(now) };
  else if (has("yesterday")) {
    const d = addDays(now, -1);
    range = { start: startOfDay(d), end: endOfDay(d) };
  } else if (has("tomorrow")) {
    const d = addDays(now, 1);
    range = { start: startOfDay(d), end: endOfDay(d) };
  } else if (has("this week")) range = { start: startOfWeek(now), end: endOfWeek(now) };
  else if (has("next week")) {
    const d = addDays(startOfWeek(now), 7);
    range = { start: startOfWeek(d), end: endOfWeek(d) };
  } else if (has("last week")) {
    const d = addDays(startOfWeek(now), -7);
    range = { start: startOfWeek(d), end: endOfWeek(d) };
  } else if (has("this month")) range = { start: startOfMonth(now), end: endOfMonth(now) };
  else if (has("next month")) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    range = { start: startOfMonth(d), end: endOfMonth(d) };
  } else if (has("last month")) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    range = { start: startOfMonth(d), end: endOfMonth(d) };
  }

  if (has("upcoming") || has("future") || has("next")) mode = "upcoming";

  const noise = new Set([
    "today",
    "tomorrow",
    "yesterday",
    "this",
    "next",
    "last",
    "week",
    "month",
    "upcoming",
    "future",
  ]);

  const tokens = raw.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (!status) {
      const s = normalizeStatusToken(t);
      if (s) status = s;
    }
  }

  const leftover = tokens.filter((t) => !noise.has(t) && !normalizeStatusToken(t)).join(" ").trim();
  return { text: leftover, status, range, mode };
}

function inRange(iso: string, range: DateRange) {
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function safeTs(iso: any) {
  const d = new Date(String(iso ?? ""));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortLabel(mode: SortMode) {
  if (mode === "soonest") return "Next up";
  if (mode === "newest") return "Recently added";
  return "Oldest first";
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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("soonest");
  const [page, setPage] = useState(1);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterDateDraft, setFilterDateDraft] = useState<Date>(new Date());
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const [showAndroidFilterDate, setShowAndroidFilterDate] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // ✅ modal for "view all bookings" per person (removes nested scroll jank)
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalId, setGroupModalId] = useState<string | null>(null);

  const [composeId, setComposeId] = useState<string | null>(null);
  const [composeBookingStartIso, setComposeBookingStartIso] = useState<string | null>(null);
  const [composeAllowSameDay, setComposeAllowSameDay] = useState(false);
  const [composeValue, setComposeValue] = useState<Date | null>(null);

  const [showDateSheet, setShowDateSheet] = useState(false);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [draftValue, setDraftValue] = useState<Date | null>(null);

  const openGroupModal = (id: string) => {
    setGroupModalId(id);
    setGroupModalOpen(true);
  };
  const closeGroupModal = () => {
    setGroupModalOpen(false);
    setGroupModalId(null);
  };

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

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, sortMode, artistFilter, role, bookings.length, filterDate?.toISOString()]);

  const visibleBookings = useMemo(() => {
    if (role !== "artist") return bookings;
    if (artistFilter === "consultations") return bookings.filter((b: any) => hasConsultation(b));
    return bookings;
  }, [bookings, role, artistFilter]);

  const filteredBookings = useMemo(() => {
    let list = [...(visibleBookings ?? [])];

    if (statusFilter !== "all") {
      list = list.filter((b: any) => String(b?.status ?? "").toLowerCase() === statusFilter);
    }

    if (filterDate) {
      const r = { start: startOfDay(filterDate), end: endOfDay(filterDate) };
      list = list.filter((b: any) => inRange(b.start_time, r));
    }

    const parsed = parseSmartQuery(searchQuery);

    if (parsed.status) {
      list = list.filter((b: any) => String(b?.status ?? "").toLowerCase() === parsed.status);
    }

    if (parsed.range) {
      list = list.filter((b: any) => inRange(b.start_time, parsed.range!));
    }

    if (parsed.mode === "upcoming") {
      const nowT = Date.now();
      list = list.filter((b: any) => safeTs(b.start_time) >= nowT);
    }

    if (parsed.text) {
      const q = parsed.text.toLowerCase();
      list = list.filter((b: any) => {
        const who =
          role === "artist"
            ? bestDisplayName(b.client_profile, "Client")
            : bestDisplayName(b.artist_profile, "Artist");
        return who.toLowerCase().includes(q);
      });
    }

    if (sortMode === "soonest") list.sort((a: any, b: any) => safeTs(a?.start_time) - safeTs(b?.start_time));
    else if (sortMode === "newest") list.sort((a: any, b: any) => safeTs(b?.created_at) - safeTs(a?.created_at));
    else list.sort((a: any, b: any) => safeTs(a?.created_at) - safeTs(b?.created_at));

    return list;
  }, [visibleBookings, role, searchQuery, statusFilter, sortMode, filterDate]);

  const pagedBookings = useMemo(() => {
    const take = Math.max(1, page) * PAGE_SIZE;
    return filteredBookings.slice(0, take);
  }, [filteredBookings, page]);

  const canLoadMore = pagedBookings.length < filteredBookings.length;

  const groupedBookings = useMemo(() => {
    const map = new Map<string, { id: string; label: string; items: any[] }>();

    for (const b of pagedBookings as any[]) {
      const otherId = role === "artist" ? String(b.client_id ?? "unknown") : String(b.artist_id ?? "unknown");
      const label =
        role === "artist"
          ? bestDisplayName(b.client_profile, "Client")
          : bestDisplayName(b.artist_profile, "Artist");

      if (!map.has(otherId)) map.set(otherId, { id: otherId, label, items: [] });
      map.get(otherId)!.items.push(b);
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pagedBookings, role]);

  const groupModalData = useMemo(() => {
    if (!groupModalId) return null;
    const g = groupedBookings.find((x) => x.id === groupModalId);
    if (!g) return null;
    const sorted = [...g.items].sort((a, b) => safeTs(a.start_time) - safeTs(b.start_time));
    return { ...g, items: sorted };
  }, [groupModalId, groupedBookings]);

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

  const setQuick = (phrase: "today" | "this week" | "this month" | "upcoming") => {
    setSearchQuery(phrase);
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setArtistFilter("all");
    setSortMode("soonest");
    setFilterDate(null);
    setFilterDateDraft(new Date());
    setIosDateOpen(false);
  };

  const commitFilterDate = (picked: Date) => {
    const d = startOfDay(picked);
    setFilterDate(d);
    setFilterDateDraft(d);
  };

  const openFilterDatePicker = () => {
    const base = filterDate ?? new Date();
    setFilterDateDraft(base);

    if (Platform.OS === "ios") {
      setIosDateOpen((v) => !v);
      return;
    }

    setFiltersOpen(false);
    setTimeout(() => setShowAndroidFilterDate(true), 50);
  };

  const clearFilterDate = () => {
    setFilterDate(null);
    setFilterDateDraft(new Date());
    setIosDateOpen(false);
  };

  const onAndroidFilterDateChange = (e: DateTimePickerEvent, picked?: Date) => {
    if (e.type === "dismissed") {
      setShowAndroidFilterDate(false);
      setTimeout(() => setFiltersOpen(true), 50);
      return;
    }

    if (picked) commitFilterDate(picked);

    setShowAndroidFilterDate(false);
    setTimeout(() => setFiltersOpen(true), 50);
  };

  const activePills = useMemo(() => {
    const pills: Array<{ key: string; label: string; onClear: () => void }> = [];
    const q = searchQuery.trim();
    const qLower = q.toLowerCase();

    const prettyQueryLabel =
      qLower === "today"
        ? "Today"
        : qLower === "this week"
        ? "This week"
        : qLower === "this month"
        ? "This month"
        : qLower === "upcoming"
        ? "Upcoming"
        : q;

    if (q) pills.push({ key: "q", label: prettyQueryLabel, onClear: () => setSearchQuery("") });

    if (filterDate) {
      pills.push({
        key: "date",
        label: `Date: ${formatDateOnly(filterDate)}`,
        onClear: () => clearFilterDate(),
      });
    }

    if (statusFilter !== "all") {
      pills.push({
        key: "status",
        label:
          statusFilter === "pending"
            ? "Status: Pending"
            : statusFilter === "accepted"
            ? "Status: Accepted"
            : statusFilter === "cancelled"
            ? "Status: Cancelled"
            : "Status: Completed",
        onClear: () => setStatusFilter("all"),
      });
    }

    if (role === "artist" && artistFilter !== "all") {
      pills.push({ key: "artistFilter", label: "Consultations only", onClear: () => setArtistFilter("all") });
    }

    if (sortMode !== "soonest") {
      pills.push({ key: "sort", label: `Sort: ${sortLabel(sortMode)}`, onClear: () => setSortMode("soonest") });
    }

    return pills;
  }, [searchQuery, statusFilter, artistFilter, sortMode, role, filterDate]);

  // ✅ booking card renderer
  const renderBookingCard = (b: any) => {
    const isPending = b.status === "pending";
    const isAccepted = b.status === "accepted";
    const isCancelled = b.status === "cancelled";
    const isCompleted = b.status === "completed";

    const bookingLive = !isCancelled && !isCompleted;

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
      proposedBy && ((proposedBy === "client" && role === "client") || (proposedBy === "artist" && role === "artist"));

    const canAcceptConsult =
      bookingLive && !!proposedIso && consultStatus !== "scheduled" && consultStatus !== "declined" && !iProposedLast;

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
          ? "Waiting for the other person to respond."
          : "You can accept, or propose another time."
        : consultStatus === "requested"
        ? role === "artist"
          ? "Client requested a consultation — propose a time."
          : "Waiting for the artist to propose a time."
        : consultationRequested && role === "client"
        ? "Waiting for the artist to propose a time."
        : "";

    const showOverflow = isCancelled || isCompleted;
    const showRemoveInline = consultationRequested || showOverflow;

    return (
      <View style={styles.bookingCard}>
        {/* BOOKING section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTop}>
            <Text style={styles.sectionTitle}>Booking</Text>

            <View style={styles.sectionRightRow}>
              <View style={[styles.sectionPill, styles.bookingPill]}>
                <Text style={styles.sectionPillText}>{bookingStatusLabel(b.status)}</Text>
              </View>
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
            <View style={styles.hintRow}>
              <Text style={styles.sectionHintInline}>
                Booking acceptance does <Text style={{ fontWeight: "900" }}>not</Text> confirm the consultation.
              </Text>

              {showRemoveInline && (
                <Pressable
                  disabled={mutatingId === b.id}
                  onPress={() =>
                    Alert.alert("Remove booking?", "This will remove it from your view.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => doRemoveForMe(b.id) },
                    ])
                  }
                  style={[styles.deleteInlineBtn, mutatingId === b.id && styles.disabledBtn]}
                  accessibilityLabel="Remove booking"
                >
                  <Ionicons name="trash-outline" size={16} color={BLACK} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* CONSULTATION */}
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
              <Text style={styles.waitingText}>This booking is no longer active, so consultation actions are disabled</Text>
            )}

            {!!waitingText && <Text style={styles.waitingText}>{waitingText}</Text>}

            {proposedPretty && (
              <View style={styles.proposedBadge}>
                <Ionicons name="time-outline" size={14} color={BLACK} />
                <Text style={styles.proposedBadgeText}>
                  Proposed{proposedBy ? ` (${proposedBy})` : ""}: {proposedPretty.date} · {proposedPretty.time}
                </Text>
              </View>
            )}

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

  const showEmpty = filteredBookings.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="rgba(0,0,0,0.75)" />
          </Pressable>

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Pressable onPress={() => setFiltersOpen(true)} style={styles.filterBtnTop} accessibilityLabel="Open filters">
              <Ionicons name="options-outline" size={18} color={BLACK} />
            </Pressable>

            <Pressable onPress={refreshBookingsOnly} style={styles.iconBtn}>
              {bookingsLoading ? <ActivityIndicator /> : <Ionicons name="refresh" size={20} color="rgba(0,0,0,0.75)" />}
            </Pressable>
          </View>
        </View>

        <Text style={styles.h1}>Bookings</Text>
        <Text style={styles.sub}>Track your booking requests and confirmations.</Text>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="rgba(0,0,0,0.55)" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor="rgba(0,0,0,0.35)"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn} accessibilityLabel="Clear search">
              <Ionicons name="close" size={16} color="rgba(0,0,0,0.70)" />
            </Pressable>
          )}
        </View>

        {activePills.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillsScroll}
            contentContainerStyle={styles.pillsRow}
          >
            {activePills.map((p) => (
              <View key={p.key} style={styles.activePill}>
                <Text style={styles.activePillText} numberOfLines={1}>
                  {p.label}
                </Text>
                <Pressable onPress={p.onClear} style={styles.pillX} accessibilityLabel={`Remove ${p.label}`}>
                  <Ionicons name="close" size={14} color={BLACK} />
                </Pressable>
              </View>
            ))}

            <Pressable onPress={clearAllFilters} style={styles.clearAllPill}>
              <Ionicons name="trash-outline" size={14} color={BLACK} />
              <Text style={styles.clearAllText}>Clear</Text>
            </Pressable>
          </ScrollView>
        )}

        <View style={styles.countRow}>
          <Text style={styles.resultCount}>
            Showing <Text style={styles.countStrong}>{pagedBookings.length}</Text> of{" "}
            <Text style={styles.countStrong}>{filteredBookings.length}</Text>
          </Text>

          <Pressable
            onPress={() =>
              setSortMode((prev) => (prev === "soonest" ? "newest" : prev === "newest" ? "oldest" : "soonest"))
            }
            style={styles.sortChip}
          >
            <Ionicons name="swap-vertical-outline" size={16} color={BLACK} />
            <Text style={styles.sortChipText}>{sortLabel(sortMode)}</Text>
          </Pressable>
        </View>

        {showEmpty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {searchQuery || statusFilter !== "all" || filterDate || (role === "artist" && artistFilter !== "all")
                ? "No matches"
                : "No bookings yet"}
            </Text>
            <Text style={styles.emptySub}>
              {searchQuery || statusFilter !== "all" || filterDate || (role === "artist" && artistFilter !== "all")
                ? "Try clearing search or adjusting filters."
                : "Book a service from the marketplace and it’ll show here."}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ marginTop: 12 }}
            contentContainerStyle={{ paddingBottom: 140, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {groupedBookings.map((g) => {
              const open = !!expandedGroups[g.id];

              const sortedBySoonest = [...g.items].sort((a, b) => safeTs(a.start_time) - safeTs(b.start_time));
              const nextItem = sortedBySoonest[0];
              const nextWhen = nextItem?.start_time ? formatIsoPretty(nextItem.start_time) : null;
              const remainingCount = Math.max(0, g.items.length - 1);

              return (
                <View key={g.id} style={styles.groupWrap}>
                  <Pressable
                    onPress={() => setExpandedGroups((p) => ({ ...p, [g.id]: !open }))}
                    style={styles.groupHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>{g.label}</Text>
                      {nextWhen ? (
                        <Text style={styles.groupSub}>
                          Next: {nextWhen.date} • {nextWhen.time} · {g.items.length} booking
                          {g.items.length === 1 ? "" : "s"}
                        </Text>
                      ) : (
                        <Text style={styles.groupSub}>
                          {g.items.length} booking{g.items.length === 1 ? "" : "s"}
                        </Text>
                      )}
                    </View>

                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="rgba(0,0,0,0.65)" />
                  </Pressable>

                  {open && (
                    <View style={styles.groupBody}>
                      {/* ✅ show ONLY the next booking card (no nested scroll) */}
                      {!!nextItem && <View style={{ marginTop: 2 }}>{renderBookingCard(nextItem)}</View>}

                      {/* ✅ if more exist, open modal for full list */}
                      {remainingCount > 0 && (
                        <Pressable onPress={() => openGroupModal(g.id)} style={styles.viewAllRow}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={styles.viewAllIcon}>
                              <Ionicons name="layers-outline" size={16} color={BLACK} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.viewAllTitle}>View all bookings</Text>
                              <Text style={styles.viewAllSub}>
                                +{remainingCount} more booking{remainingCount === 1 ? "" : "s"}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.65)" />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {canLoadMore && (
              <Pressable
                onPress={() => setPage((p) => p + 1)}
                style={[styles.secondaryBtn, { alignSelf: "center", marginTop: 6 }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={BLACK} />
                <Text style={styles.secondaryBtnText}>Load more</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </View>

      {/* ✅ Group "View all" Modal (fixed: backdrop does NOT steal scroll) */}
      <Modal visible={groupModalOpen} transparent animationType="fade" onRequestClose={closeGroupModal}>
        <View style={styles.modalBackdropFull}>
          <Pressable style={RNStyleSheet.absoluteFill} onPress={closeGroupModal} />

          {/* Card is NOT a Pressable so FlatList scroll is buttery */}
          <View style={styles.groupModalCard}>
            <View style={styles.groupModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupModalTitle}>{groupModalData?.label ?? "Bookings"}</Text>
                <Text style={styles.groupModalSub}>
                  {groupModalData?.items?.length ?? 0} booking{(groupModalData?.items?.length ?? 0) === 1 ? "" : "s"}
                </Text>
              </View>

              <Pressable onPress={closeGroupModal} style={styles.iconBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={18} color="rgba(0,0,0,0.75)" />
              </Pressable>
            </View>

            <FlatList
              data={groupModalData?.items ?? []}
              keyExtractor={(item: any) => String(item.id)}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 14, gap: 12 }}
              renderItem={({ item }) => <View>{renderBookingCard(item)}</View>}
            />
          </View>
        </View>
      </Modal>

      {/* ✅ Filters Modal (fixed: backdrop does NOT steal scroll/taps) */}
      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={RNStyleSheet.absoluteFill} onPress={() => setFiltersOpen(false)} />

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <Pressable onPress={() => setFiltersOpen(false)} style={styles.iconBtn} accessibilityLabel="Close filters">
                <Ionicons name="close" size={18} color="rgba(0,0,0,0.75)" />
              </Pressable>
            </View>

            <Text style={styles.modalSectionTitle}>Quick date</Text>
            <View style={styles.modalChipsRow}>
              {(
                [
                  ["today", "Today"],
                  ["this week", "This week"],
                  ["this month", "This month"],
                ] as Array<[Parameters<typeof setQuick>[0], string]>
              ).map(([k, label]) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    setQuick(k);
                    setFiltersOpen(false);
                  }}
                  style={styles.modalChip}
                >
                  <Text style={styles.modalChipText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Pick a date</Text>
            <View style={styles.datePickerRow}>
              <Pressable onPress={openFilterDatePicker} style={styles.datePickerBtn}>
                <Ionicons name="calendar-outline" size={16} color={BLACK} />
                <Text style={styles.datePickerBtnText}>{filterDate ? formatDateOnly(filterDate) : "Choose a date"}</Text>
                <View style={{ flex: 1 }} />
                {Platform.OS === "ios" && (
                  <Ionicons name={iosDateOpen ? "chevron-up" : "chevron-down"} size={16} color="rgba(0,0,0,0.6)" />
                )}
              </Pressable>

              {!!filterDate && (
                <Pressable onPress={clearFilterDate} style={styles.dateClearBtn} accessibilityLabel="Clear date filter">
                  <Ionicons name="close" size={16} color={BLACK} />
                </Pressable>
              )}
            </View>

            {Platform.OS === "ios" && iosDateOpen && (
              <View style={styles.inlineDateWrap}>
                <DateTimePicker
                  value={filterDateDraft}
                  mode="date"
                  display="spinner"
                  onChange={(e: DateTimePickerEvent, picked?: Date) => {
                    if (e.type === "dismissed") return;
                    if (!picked) return;
                    setFilterDateDraft(picked);
                    commitFilterDate(picked);
                  }}
                />
                <Pressable
                  onPress={() => setIosDateOpen(false)}
                  style={[styles.primaryBtn, { alignSelf: "flex-end", marginTop: 10 }]}
                >
                  <Text style={styles.primaryBtnText}>Done</Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Status</Text>
            <View style={styles.modalChipsRow}>
              {(
                [
                  ["all", "All"],
                  ["pending", "Pending"],
                  ["accepted", "Accepted"],
                  ["cancelled", "Cancelled"],
                  ["completed", "Completed"],
                ] as Array<[StatusFilter, string]>
              ).map(([key, label]) => {
                const on = statusFilter === key;
                return (
                  <Pressable key={key} onPress={() => setStatusFilter(key)} style={[styles.modalPill, on && styles.modalPillOn]}>
                    <Text style={[styles.modalPillText, on && styles.modalPillTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {role === "artist" && (
              <>
                <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Show</Text>
                <View style={styles.modalChipsRow}>
                  {(
                    [
                      ["all", "All bookings"],
                      ["consultations", "Consultations only"],
                    ] as Array<[ArtistFilter, string]>
                  ).map(([key, label]) => {
                    const on = artistFilter === key;
                    return (
                      <Pressable key={key} onPress={() => setArtistFilter(key)} style={[styles.modalPill, on && styles.modalPillOn]}>
                        <Text style={[styles.modalPillText, on && styles.modalPillTextOn]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Order</Text>
            <View style={styles.modalChipsRow}>
              {(
                [
                  ["soonest", "Next up"],
                  ["newest", "Recently added"],
                  ["oldest", "Oldest first"],
                ] as Array<[SortMode, string]>
              ).map(([key, label]) => {
                const on = sortMode === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSortMode(key)}
                    style={[styles.modalPill, on && styles.modalPillOn]}
                  >
                    <Text style={[styles.modalPillText, on && styles.modalPillTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalFooter}>
              <Pressable onPress={clearAllFilters} style={styles.modalSecondary}>
                <Ionicons name="trash-outline" size={16} color={BLACK} />
                <Text style={styles.modalSecondaryText}>Clear all</Text>
              </Pressable>

              <Pressable onPress={() => setFiltersOpen(false)} style={styles.modalPrimary}>
                <Text style={styles.modalPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Android pickers (consultation) */}
      {Platform.OS !== "ios" && showDateSheet && draftValue && (
        <DateTimePicker value={draftValue} mode="date" display="calendar" onChange={onAndroidDateChange} />
      )}
      {Platform.OS !== "ios" && showTimeSheet && draftValue && (
        <DateTimePicker value={draftValue} mode="time" display="spinner" onChange={onAndroidTimeChange} />
      )}

      {/* Android picker (filters date) */}
      {Platform.OS !== "ios" && showAndroidFilterDate && (
        <DateTimePicker value={filterDateDraft} mode="date" display="calendar" onChange={onAndroidFilterDateChange} />
      )}

      {/* iOS Sheets (consultation) */}
      {composeId && composeValue && draftValue && (
        <>
          <PickerSheet
            title="Pick a date"
            visible={showDateSheet}
            mode="date"
            value={draftValue}
            onChangeValue={(picked) => setDraftValue((prev) => (prev ? applyPickedDate(prev, picked) : picked))}
            onCancel={() => {
              setDraftValue(composeValue);
              setShowDateSheet(false);
              setShowTimeSheet(false);
            }}
            onDone={() => {
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
            }}
          />
          <PickerSheet
            title="Pick a time"
            visible={showTimeSheet}
            mode="time"
            value={draftValue}
            minuteInterval={5}
            onChangeValue={(picked) => setDraftValue((prev) => (prev ? applyPickedTime(prev, picked) : picked))}
            onCancel={() => {
              setDraftValue(composeValue);
              setShowDateSheet(false);
              setShowTimeSheet(false);
            }}
            onDone={() => {
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
            }}
          />
        </>
      )}
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
  sectionHintInline: {
    flex: 1,
    color: "rgba(0,0,0,0.55)",
    fontWeight: "800",
    fontSize: 12,
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  filterBtnTop: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },

  h1: { fontSize: 22, fontWeight: "900", color: BLACK },
  sub: { marginTop: 4, color: MUTED, fontWeight: "600" },

  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  searchBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
  },
  searchInput: { flex: 1, fontWeight: "800", color: BLACK, paddingVertical: 0 },
  clearBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },

  pillsScroll: { marginTop: 10, maxHeight: 44 },
  pillsRow: { flexDirection: "row", gap: 10, paddingVertical: 2, alignItems: "center" },

  hintRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  deleteInlineBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.04)",
  },

  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 280,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  activePillText: { fontWeight: "900", color: BLACK, fontSize: 12, maxWidth: 220 },
  pillX: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  clearAllPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: PINK,
  },
  clearAllText: { fontWeight: "900", color: BLACK, fontSize: 12 },

  countRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultCount: { color: "rgba(0,0,0,0.45)", fontWeight: "800", fontSize: 12 },
  countStrong: { fontWeight: "900", color: BLACK },
  sortChip: {
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
  sortChipText: { fontWeight: "900", color: BLACK, fontSize: 12 },

  empty: { marginTop: 12, borderRadius: 16, backgroundColor: PINK, padding: 14 },
  emptyTitle: { fontWeight: "900", color: BLACK },
  emptySub: { marginTop: 6, fontWeight: "700", color: MUTED },

  groupWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: OFF_WHITE,
    padding: 12,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  groupTitle: { fontWeight: "900", color: BLACK, fontSize: 15 },
  groupSub: { marginTop: 4, fontWeight: "700", color: "rgba(0,0,0,0.55)", fontSize: 12 },
  groupBody: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 10,
    gap: 10,
  },

  viewAllRow: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: OFF_WHITE,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  viewAllIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewAllTitle: { fontWeight: "900", color: BLACK },
  viewAllSub: { marginTop: 4, fontWeight: "800", color: "rgba(0,0,0,0.55)", fontSize: 12 },

  bookingCard: { borderRadius: 18, backgroundColor: OFF_WHITE, gap: 12 },

  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    padding: 12,
  },
  sectionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { fontWeight: "900", color: BLACK },

  sectionRightRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  sectionPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  bookingPill: { backgroundColor: PINK },
  consultPill: { backgroundColor: "rgba(0,0,0,0.06)" },
  sectionPillText: { fontWeight: "900", color: BLACK, fontSize: 12 },

  dateText: { fontSize: 15, fontWeight: "900", color: BLACK },
  timeText: { marginTop: 3, fontSize: 13, fontWeight: "800", color: "rgba(0,0,0,0.72)" },

  proposedBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "stretch",
  },
  proposedBadgeText: { flex: 1, fontWeight: "900", fontSize: 12, color: BLACK, flexWrap: "wrap", lineHeight: 16 },

  waitingText: { marginTop: 10, color: MUTED, fontWeight: "800", fontSize: 12 },

  proposeBox: { backgroundColor: OFF_WHITE, borderRadius: 14, padding: 12, gap: 10, marginTop: 10 },
  proposeHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  infoIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
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

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end", padding: 12 },
  modalCard: {
    backgroundColor: OFF_WHITE,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  modalSectionTitle: { fontWeight: "900", color: BLACK, marginTop: 6 },
  modalChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },

  modalChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  modalChipText: { fontWeight: "900", color: BLACK, fontSize: 12 },

  modalPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },
  modalPillOn: { backgroundColor: BLACK, borderColor: "rgba(0,0,0,0.20)" },
  modalPillText: { fontWeight: "900", color: BLACK, fontSize: 12 },
  modalPillTextOn: { color: OFF_WHITE },

  datePickerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  datePickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },
  datePickerBtnText: { fontWeight: "900", color: BLACK, fontSize: 12 },
  dateClearBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  inlineDateWrap: {
    marginTop: 10,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.03)",
  },

  modalFooter: { flexDirection: "row", gap: 10, justifyContent: "space-between", marginTop: 16 },
  modalSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
    flex: 1,
    justifyContent: "center",
  },
  modalSecondaryText: { fontWeight: "900", color: BLACK },
  modalPrimary: {
    flex: 1,
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  modalPrimaryText: { fontWeight: "900", color: OFF_WHITE },

  modalBackdropFull: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    padding: 12,
  },
  groupModalCard: {
    backgroundColor: OFF_WHITE,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    maxHeight: "88%",
  },
  groupModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  groupModalTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  groupModalSub: { marginTop: 4, fontWeight: "800", color: "rgba(0,0,0,0.55)", fontSize: 12 },
});
