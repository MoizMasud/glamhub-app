import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { listArtistActiveServices, getServiceDetails, MarketplaceService, ServiceRow } from "../lib/services";
import { createBooking } from "../lib/bookings";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";
const MUTED = "rgba(0,0,0,0.65)";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

function toISO(d: Date) {
  return d.toISOString();
}

// Simple, clean timeslots: 9:00–18:00 every 30 mins
function buildTimeSlots(baseDate: Date) {
  const day = startOfDay(baseDate);
  const slots: Date[] = [];
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(day);
  end.setHours(18, 0, 0, 0);

  let cur = start;
  while (cur <= end) {
    slots.push(new Date(cur));
    cur = addMinutes(cur, 30);
  }
  return slots;
}

function formatDatePretty(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTimePretty(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function BookingScreen({
  artistId,
  initialServiceIds,
  onBack,
  onRequestSignIn,
  onBooked,
}: {
  artistId: string;
  initialServiceIds?: string[];
  onBack: () => void;
  onRequestSignIn: () => void;
  onBooked: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detailsCache, setDetailsCache] = useState<Record<string, MarketplaceService>>({});

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [joinChannel, setJoinChannel] = useState(false);

  const [confirming, setConfirming] = useState(false);

  const didInitRef = useRef(false);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const selectedServicesDetailed = useMemo(() => {
    return selectedIds
      .map((id) => detailsCache[id])
      .filter(Boolean);
  }, [selectedIds, detailsCache]);

  const totalCents = useMemo(() => {
    return selectedServicesDetailed.reduce((sum, s) => sum + (s?.price_cents ?? 0), 0);
  }, [selectedServicesDetailed]);

  const totalDuration = useMemo(() => {
    return selectedServicesDetailed.reduce((sum, s) => sum + (s?.duration_minutes ?? 0), 0);
  }, [selectedServicesDetailed]);

  const canConfirm =
    selectedIds.length > 0 &&
    !!selectedDate &&
    !!selectedTime &&
    agreeTerms &&
    !confirming;

  const toggleService = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const load = async () => {
    try {
      setLoading(true);
      setErrorText(null);

      const s = await withTimeout(
        listArtistActiveServices(artistId),
        12000,
        "Request timed out. Try again."
      );

      setServices(s ?? []);

      // init selected only once (from initialServiceIds)
      if (!didInitRef.current) {
        didInitRef.current = true;
        const init: Record<string, boolean> = {};
        (s ?? []).forEach((row: any) => {
          init[row.id] = !!initialServiceIds?.includes(row.id);
        });
        setSelected(init);
      } else {
        // keep previous selection
        setSelected((prev) => {
          const next: Record<string, boolean> = {};
          (s ?? []).forEach((row: any) => (next[row.id] = !!prev[row.id]));
          return next;
        });
      }
    } catch (e: any) {
      setServices([]);
      setErrorText(e?.message ?? "Failed to load booking.");
    } finally {
      setLoading(false);
    }
  };

  // prefetch details for selected services (clean summary)
  const ensureDetails = async (serviceId: string) => {
    if (detailsCache[serviceId]) return;
    try {
      const d = await withTimeout(
        getServiceDetails(serviceId),
        12000,
        "Request timed out. Try again."
      );
      setDetailsCache((prev) => ({ ...prev, [serviceId]: d }));
    } catch {
      // non-fatal: summary may be missing
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);

  useEffect(() => {
    // whenever selected changes, make sure details are loaded
    selectedIds.forEach((id) => ensureDetails(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join("|")]);

  const dateOptions = useMemo(() => {
    const arr: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) arr.push(addMinutes(startOfDay(today), i * 24 * 60));
    return arr;
  }, []);

  const timeSlots = useMemo(() => {
    if (!selectedDate) return [];
    return buildTimeSlots(selectedDate);
  }, [selectedDate]);

  const pickDate = (d: Date) => {
    setSelectedDate(d);
    setSelectedTime(null); // reset time when date changes
  };

  const pickTime = (t: Date) => {
    // merge selectedDate day with chosen time
    if (!selectedDate) return;
    const merged = new Date(selectedDate);
    merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
    setSelectedTime(merged);
  };

  const confirm = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      onRequestSignIn();
      return;
    }

    if (!selectedTime) return;

    try {
      setConfirming(true);

      // basic guard: prevent booking your own services (if any)
      // also prevent duplicates: if a booking exists for any selected service (pending/accepted)
      const uid = data.user.id;
      const selectedList = selectedServicesDetailed.length ? selectedServicesDetailed : [];

      // if some details not loaded, load them now for artist_id checks
      const full: MarketplaceService[] = [];
      for (const id of selectedIds) {
        let s = detailsCache[id];
        if (!s) {
          try {
            s = await withTimeout(getServiceDetails(id), 12000, "Request timed out. Try again.");
            setDetailsCache((prev) => ({ ...prev, [id]: s! }));
          } catch {
            // if still missing, skip booking for safety
          }
        }
        if (s) full.push(s);
      }

      // Own service protection
      if (full.some((s) => s.artist_id === uid)) {
        Alert.alert("Not allowed", "You can’t book your own service.");
        return;
      }

      // Active booking protection (any selected service)
      const { data: existing, error } = await supabase
        .from("bookings")
        .select("id, service_id")
        .eq("client_id", uid)
        .in("service_id", selectedIds)
        .in("status", ["pending", "accepted"])
        .limit(1);

      if (error) throw error;
      if ((existing ?? []).length > 0) {
        Alert.alert("Already booked", "You already have an active booking for one of these services.");
        return;
      }

      // Create bookings sequentially (back-to-back)
      let cursor = new Date(selectedTime);

      for (const s of full) {
        await createBooking({
          serviceId: s.id,
          artistId: s.artist_id,
          startTimeISO: toISO(cursor),
          notes: joinChannel ? "Join channel: yes" : "Join channel: no",
        });

        cursor = addMinutes(cursor, (s.duration_minutes ?? 0));
      }

      Alert.alert("Booked ✅", "Your booking was created successfully.", [
        { text: "View booking", onPress: onBooked },
      ]);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.toLowerCase().includes("unique")) {
        Alert.alert("Already booked", "You already have an active booking.");
      } else {
        Alert.alert("Error", e?.message ?? "Failed to book.");
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
          </Pressable>

          <Text style={styles.h1}>Booking</Text>

          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : errorText ? (
          <View style={styles.center}>
            <Text style={styles.errTitle}>Couldn’t load booking</Text>
            <Text style={styles.errText}>{errorText}</Text>
            <Pressable onPress={load} style={styles.btnOutline}>
              <Text style={styles.btnOutlineText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Step 1 */}
            <Text style={styles.stepLabel}>Step 1</Text>
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>Choose Service</Text>

              {services.length === 0 ? (
                <Text style={styles.muted}>No services available.</Text>
              ) : (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {services.map((s: any) => {
                    const isSel = !!selected[s.id];
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => toggleService(s.id)}
                        style={[styles.pickRow, isSel && { borderColor: BLACK }]}
                      >
                        <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                          {isSel && <Ionicons name="checkmark" size={16} color={OFF_WHITE} />}
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={styles.pickTitle}>
                            {s.title}
                          </Text>
                          <Text style={styles.pickMeta}>
                            {formatPrice(s.price_cents)} • {s.duration_minutes} min
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Step 2 */}
            <Text style={styles.stepLabel}>Step 2</Text>
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>Select Date</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
                {dateOptions.map((d) => {
                  const on = !!selectedDate && startOfDay(d).getTime() === startOfDay(selectedDate).getTime();
                  return (
                    <Pressable
                      key={d.toISOString()}
                      onPress={() => pickDate(d)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{formatDatePretty(d)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Step 3 */}
            <Text style={styles.stepLabel}>Step 3</Text>
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>Select Time Slot</Text>

              {!selectedDate ? (
                <Text style={styles.muted}>Pick a date first.</Text>
              ) : (
                <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {timeSlots.map((t) => {
                    const merged = new Date(selectedDate);
                    merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
                    const on = !!selectedTime && merged.getTime() === selectedTime.getTime();

                    return (
                      <Pressable
                        key={t.toISOString()}
                        onPress={() => pickTime(t)}
                        style={[styles.timeChip, on && styles.timeChipOn]}
                      >
                        <Text style={[styles.timeChipText, on && styles.timeChipTextOn]}>
                          {formatTimePretty(merged)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Step 4 */}
            <Text style={styles.stepLabel}>Step 4</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Services Selected</Text>

              {selectedServicesDetailed.length === 0 ? (
                <Text style={styles.muted}>Select at least 1 service.</Text>
              ) : (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {selectedServicesDetailed.map((s) => (
                    <View key={s.id} style={styles.summaryRow}>
                      <Text style={styles.summaryName}>{s.title}</Text>
                      <Text style={styles.summaryPrice}>{formatPrice(s.price_cents)}</Text>
                    </View>
                  ))}

                  <View style={styles.hr} />

                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryName, { fontWeight: "900" }]}>Total</Text>
                    <Text style={[styles.summaryPrice, { fontWeight: "900" }]}>{formatPrice(totalCents)}</Text>
                  </View>

                  <Text style={styles.muted}>
                    {totalDuration > 0 ? `Estimated duration: ${totalDuration} min` : ""}
                  </Text>
                </View>
              )}

              {/* Checkboxes like your screenshot */}
              <View style={{ marginTop: 14, gap: 10 }}>
                <Pressable onPress={() => setJoinChannel((v) => !v)} style={styles.agreeRow}>
                  <View style={[styles.smallBox, joinChannel && styles.smallBoxOn]}>
                    {joinChannel && <Ionicons name="checkmark" size={14} color={OFF_WHITE} />}
                  </View>
                  <Text style={styles.agreeText}>Join this professional’s community channel</Text>
                </Pressable>

                <Pressable onPress={() => setAgreeTerms((v) => !v)} style={styles.agreeRow}>
                  <View style={[styles.smallBox, agreeTerms && styles.smallBoxOn]}>
                    {agreeTerms && <Ionicons name="checkmark" size={14} color={OFF_WHITE} />}
                  </View>
                  <Text style={styles.agreeText}>
                    Agree to the <Text style={{ fontWeight: "900" }}>Terms & Services</Text> of booking with Smart Beauty Networking
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={confirm}
              disabled={!canConfirm}
              style={[styles.confirmBtn, (!canConfirm || confirming) && { opacity: 0.55 }]}
            >
              <Text style={styles.confirmText}>{confirming ? "Confirming…" : "Confirm Booking"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PINK,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  screen: {
    flexGrow: 1,
    backgroundColor: PINK,
    padding: 16,
    paddingBottom: 24,
  },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },

  stepLabel: { marginTop: 14, color: MUTED, fontWeight: "900" },
  stepCard: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  stepTitle: { fontSize: 14, fontWeight: "900", color: BLACK },

  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: OFF_WHITE,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: BLACK, borderColor: BLACK },

  pickTitle: { fontWeight: "900", color: BLACK, fontSize: 16 },
  pickMeta: { marginTop: 2, color: MUTED, fontWeight: "800" },

  chip: {
    backgroundColor: OFF_WHITE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  chipOn: { backgroundColor: BLACK, borderColor: BLACK },
  chipText: { color: BLACK, fontWeight: "900" },
  chipTextOn: { color: OFF_WHITE },

  timeChip: {
    backgroundColor: OFF_WHITE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  timeChipOn: { backgroundColor: BLACK, borderColor: BLACK },
  timeChipText: { color: BLACK, fontWeight: "900" },
  timeChipTextOn: { color: OFF_WHITE },

  summaryCard: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  summaryTitle: { fontSize: 14, fontWeight: "900", color: BLACK },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryName: { color: BLACK, fontWeight: "800" },
  summaryPrice: { color: BLACK, fontWeight: "800" },
  hr: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 10 },

  agreeRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  smallBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  smallBoxOn: { backgroundColor: BLACK, borderColor: BLACK },
  agreeText: { flex: 1, color: BLACK, fontWeight: "800", lineHeight: 18, opacity: 0.9 },

  muted: { marginTop: 10, color: MUTED, fontWeight: "800" },

  confirmBtn: {
    marginTop: 14,
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  confirmText: { color: OFF_WHITE, fontWeight: "900" },

  errTitle: { fontSize: 18, fontWeight: "900", color: BLACK },
  errText: { marginTop: 8, color: MUTED, textAlign: "center", fontWeight: "700" },
  btnOutline: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BLACK,
    backgroundColor: OFF_WHITE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  btnOutlineText: { color: BLACK, fontWeight: "900" },
});
