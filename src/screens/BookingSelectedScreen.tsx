// BookingSelectedScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import DateTimePickerModal from "react-native-modal-datetime-picker";

import { supabase } from "../lib/supabase";
import { getServiceDetails, MarketplaceService } from "../lib/services";
import { createBooking } from "../lib/bookings";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";
const MUTED = "rgba(0,0,0,0.65)";
const BORDER = "rgba(0,0,0,0.08)";
const SOFT = "rgba(0,0,0,0.05)";

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

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clampToFuture(d: Date) {
  const now = new Date();
  return d.getTime() < now.getTime() ? now : d;
}

function formatDatePretty(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimePretty(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// iOS stable time list (every 15 min)
function buildTimeOptions(stepMinutes = 15) {
  const out: { label: string; h: number; m: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      out.push({ label: formatTimePretty(d), h, m });
    }
  }
  return out;
}

/** ---------------------------
 * Availability (time-based)
 * --------------------------*/
type BusyInterval = { start: Date; end: Date };

function overlaps(a: BusyInterval, b: BusyInterval) {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

function dayBounds(d: Date) {
  const start = startOfDay(d);
  const end = endOfDay(d);
  return { start, end };
}

async function fetchBusyIntervals(args: { artistId: string; day: Date }): Promise<BusyInterval[]> {
  const { artistId, day } = args;
  const { start, end } = dayBounds(day);

  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("start_time, end_time")
    .eq("artist_id", artistId)
    .in("status", ["pending", "accepted"])
    .lt("start_time", end.toISOString())
    .gt("end_time", start.toISOString());

  if (bErr) throw bErr;

  const { data: off, error: oErr } = await supabase
    .from("artist_time_off")
    .select("start_time, end_time, all_day")
    .eq("artist_id", artistId)
    .lt("start_time", end.toISOString())
    .gt("end_time", start.toISOString());

  if (oErr) throw oErr;

  const intervals: BusyInterval[] = [];

  for (const r of bookings ?? []) {
    const s = new Date((r as any).start_time);
    const e = new Date((r as any).end_time);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) intervals.push({ start: s, end: e });
  }

  for (const r of off ?? []) {
    const s = new Date((r as any).start_time);
    const e = new Date((r as any).end_time);
    if (!isNaN(s.getTime()) || !isNaN(e.getTime())) intervals.push({ start: s, end: e });
  }

  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  return intervals;
}

/** ---------------------------
 * Proper day blocking (ALL-DAY time off)
 * We reject blocked days on date confirm (clean UX + year selection)
 * --------------------------*/
async function fetchAllDayTimeOffDays(args: { artistId: string; rangeStart: Date; rangeEnd: Date }): Promise<Set<string>> {
  const { artistId, rangeStart, rangeEnd } = args;

  const { data, error } = await supabase
    .from("artist_time_off")
    .select("start_time, end_time, all_day")
    .eq("artist_id", artistId)
    .eq("all_day", true)
    .lt("start_time", rangeEnd.toISOString())
    .gt("end_time", rangeStart.toISOString());

  if (error) throw error;

  const disabled = new Set<string>();

  for (const r of (data ?? []) as any[]) {
    const s = new Date(r.start_time);
    const e = new Date(r.end_time);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;

    // mark each date in the span
    let cursor = startOfDay(s);
    const last = startOfDay(e);
    while (cursor.getTime() <= last.getTime()) {
      disabled.add(toYMD(cursor));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return disabled;
}

function humanWhen(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown time";
  return `${formatDatePretty(d)} at ${formatTimePretty(d)}`;
}

export default function BookingSelectedScreen({
  artistId,
  serviceIds,
  onBack,
  onRequestSignIn,
  onBooked,
}: {
  artistId: string;
  serviceIds: string[];
  onBack: () => void;
  onRequestSignIn: () => void;
  onBooked: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);

  const [busyIntervals, setBusyIntervals] = useState<BusyInterval[]>([]);
  const [disabledTimes, setDisabledTimes] = useState<Set<string>>(new Set());
  const [busyLoading, setBusyLoading] = useState(false);

  // ✅ blocked ALL-DAY dates
  const [blockedDaysLoading, setBlockedDaysLoading] = useState(false);
  const [blockedDays, setBlockedDays] = useState<Set<string>>(new Set());

  // Date picker modal (clean + year jump)
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Android time picker / iOS time list
  const [showAndroidTime, setShowAndroidTime] = useState(false);
  const [iosTimeOpen, setIosTimeOpen] = useState(false);

  // Optional consult (kept lightweight)
  const [wantsConsultation, setWantsConsultation] = useState(false);
  const [consultDateTime, setConsultDateTime] = useState<Date | null>(null);
  const [consultNote, setConsultNote] = useState("");

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const totalCents = useMemo(() => services.reduce((sum, s) => sum + (s?.price_cents ?? 0), 0), [services]);
  const totalDuration = useMemo(() => services.reduce((sum, s) => sum + (s?.duration_minutes ?? 0), 0), [services]);
  const timeOptions = useMemo(() => buildTimeOptions(15), []);

  const minDate = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return d;
  }, []);

  const canConfirm =
    services.length > 0 &&
    !!selectedDateTime &&
    agreeTerms &&
    !confirming &&
    !busyLoading &&
    (!wantsConsultation || !!consultDateTime);

  const load = async () => {
    try {
      setLoading(true);
      setErrorText(null);

      const full: MarketplaceService[] = [];
      for (const id of serviceIds) {
        const s = await withTimeout(getServiceDetails(id), 12000, "Request timed out. Try again.");
        full.push(s);
      }
      setServices(full);
    } catch (e: any) {
      setServices([]);
      setErrorText(e?.message ?? "Failed to load selected services.");
    } finally {
      setLoading(false);
    }
  };

  // preload blocked days for next 5 years (usually small dataset)
  const loadBlockedDays = useCallback(async () => {
    try {
      setBlockedDaysLoading(true);
      const rangeStart = startOfDay(new Date());
      const rangeEnd = endOfDay(maxDate);
      const set = await fetchAllDayTimeOffDays({ artistId, rangeStart, rangeEnd });
      setBlockedDays(set);
    } catch (e) {
      // fail open: don’t block booking if we can’t fetch
      console.warn("Failed to load blocked days", e);
      setBlockedDays(new Set());
    } finally {
      setBlockedDaysLoading(false);
    }
  }, [artistId, maxDate]);

  useEffect(() => {
    load();
    loadBlockedDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, serviceIds.join("|")]);

  const computeDisabledTimes = useCallback(
    async (day: Date) => {
      if (!totalDuration || totalDuration <= 0) {
        setBusyIntervals([]);
        setDisabledTimes(new Set());
        return;
      }

      try {
        setBusyLoading(true);

        const intervals = await fetchBusyIntervals({ artistId, day });
        setBusyIntervals(intervals);

        const disabled = new Set<string>();
        const now = new Date();

        for (const t of timeOptions) {
          const start = new Date(day);
          start.setHours(t.h, t.m, 0, 0);

          // past times for today
          if (sameDay(day, now) && start.getTime() < now.getTime()) {
            disabled.add(`${t.h}:${t.m}`);
            continue;
          }

          const end = new Date(start.getTime() + totalDuration * 60_000);

          // prevent cross-midnight booking blocks
          if (!sameDay(start, end)) {
            disabled.add(`${t.h}:${t.m}`);
            continue;
          }

          if (intervals.some((b) => overlaps(b, { start, end }))) {
            disabled.add(`${t.h}:${t.m}`);
          }
        }

        setDisabledTimes(disabled);

        // if currently selected time becomes invalid, clear it
        setSelectedDateTime((prev) => {
          if (!prev) return prev;
          if (!sameDay(prev, day)) return prev;
          const key = `${prev.getHours()}:${prev.getMinutes()}`;
          if (disabled.has(key)) return null;
          return prev;
        });
      } catch (e) {
        console.warn("Failed to load availability", e);
        setBusyIntervals([]);
        setDisabledTimes(new Set());
      } finally {
        setBusyLoading(false);
      }
    },
    [artistId, timeOptions, totalDuration]
  );

  useEffect(() => {
    if (!selectedDateTime) return;
    computeDisabledTimes(selectedDateTime);
  }, [selectedDateTime ? selectedDateTime.toDateString() : "", computeDisabledTimes]);

  const openBookingDate = () => {
    setSelectedDateTime((prev) => prev ?? clampToFuture(new Date()));
    setDatePickerOpen(true);
  };

  const openBookingTime = () => {
    if (!selectedDateTime) {
      Alert.alert("Pick a date first", "Choose a booking date before selecting a time.");
      return;
    }
    if (Platform.OS === "ios") setIosTimeOpen(true);
    else setShowAndroidTime(true);
  };

  const isTimeDisabled = (day: Date, h: number, m: number) => {
    if (!selectedDateTime) return false;
    if (!sameDay(day, selectedDateTime)) return false;
    return disabledTimes.has(`${h}:${m}`);
  };

  const onChangeBookingTimeAndroid = (event: DateTimePickerEvent, date?: Date) => {
    setShowAndroidTime(false);
    if (event.type === "dismissed" || !date) return;

    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      const fixed = clampToFuture(next);

      if (isTimeDisabled(base, fixed.getHours(), fixed.getMinutes())) {
        Alert.alert("Unavailable", "That time is already booked or the artist is unavailable.");
        return prev;
      }

      return fixed;
    });
  };

  const setBookingTimeIOS = (h: number, m: number) => {
    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(h, m, 0, 0);
      const fixed = clampToFuture(next);

      if (isTimeDisabled(base, h, m)) {
        Alert.alert("Unavailable", "That time is already booked or the artist is unavailable.");
        return prev;
      }
      return fixed;
    });
  };

  const createAllBookings = async (uid: string) => {
    if (!selectedDateTime) return;

    let cursor = new Date(selectedDateTime);

    for (const s of services) {
      const start = new Date(cursor);
      const end = new Date(start.getTime() + (s.duration_minutes ?? 0) * 60_000);

      await createBooking({
        serviceId: s.id,
        artistId: s.artist_id,
        startTimeISO: start.toISOString(),
        endTimeISO: end.toISOString(),
        notes: wantsConsultation ? "Consultation requested" : undefined,
        consultation_meta:
          wantsConsultation && consultDateTime
            ? {
                wants_consultation: true,
                availability: [consultDateTime.toISOString()],
                note: consultNote.trim() ? consultNote.trim() : null, // ✅ null, not undefined
              }
            : undefined,
      });

      cursor = end;
    }
  };

  const checkDuplicateServiceAndConfirm = async (uid: string): Promise<boolean> => {
    // Check if the user already has an active booking for any of these services.
    // If yes: warn + allow them to proceed (Yes/No).
    const { data: existing, error } = await supabase
      .from("bookings")
      .select("id, service_id, start_time, status")
      .eq("client_id", uid)
      .in("service_id", serviceIds)
      .in("status", ["pending", "accepted"])
      .order("start_time", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!existing || existing.length === 0) return true;

    const serviceIdToTitle = new Map<string, string>();
    for (const s of services) serviceIdToTitle.set(s.id, s.title);

    // Build a clean message
    const lines = existing.slice(0, 3).map((b: any) => {
      const title = serviceIdToTitle.get(String(b.service_id)) ?? "This service";
      const when = b.start_time ? humanWhen(String(b.start_time)) : "Unknown time";
      return `• ${title} — ${when}`;
    });

    const more = existing.length > 3 ? `\n\n(+${existing.length - 3} more)` : "";

    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Book again?",
        `You already booked this service before.\n\nYou’re about to book the same service again at a different time.\n\nExisting booking(s):\n${lines.join(
          "\n"
        )}${more}\n\nDo you want to continue?`,
        [
          { text: "No", style: "cancel", onPress: () => resolve(false) },
          { text: "Yes", style: "default", onPress: () => resolve(true) },
        ]
      );
    });
  };

  const confirm = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      onRequestSignIn();
      return;
    }
    if (!selectedDateTime) return;

    const ymd = toYMD(selectedDateTime);
    if (blockedDays.has(ymd)) {
      Alert.alert("Unavailable day", "This day is booked off by the artist. Please choose another date.");
      return;
    }

    const key = `${selectedDateTime.getHours()}:${selectedDateTime.getMinutes()}`;
    if (disabledTimes.has(key)) {
      Alert.alert("Time unavailable", "That time was just booked or blocked. Please choose another time.");
      return;
    }

    const uid = data.user.id;

    if (services.some((s) => s.artist_id === uid)) {
      Alert.alert("Not allowed", "You can’t book your own service.");
      return;
    }

    try {
      setConfirming(true);

      // ✅ NEW behavior:
      // Instead of hard-blocking duplicate service bookings,
      // warn the user and let them choose Yes/No.
      const okToProceed = await checkDuplicateServiceAndConfirm(uid);
      if (!okToProceed) return;

      await createAllBookings(uid);

      Alert.alert("Booked", "Your booking was created successfully.", [{ text: "View booking", onPress: onBooked }]);
      } catch (e: any) {
        const msg = String(e?.message ?? "").toLowerCase();

        // real overlap protection (keep this)
        if (msg.includes("exclude") || msg.includes("overlap")) {
          Alert.alert(
            "Unavailable",
            "That time is already booked. Please choose another time."
          );
          return;
        }

        // everything else
        Alert.alert("Error", e?.message ?? "Failed to book.");
      } finally {
        setConfirming(false);
      }



  };

  const dateLabel = selectedDateTime ? formatDatePretty(selectedDateTime) : "Choose date";
  const timeLabel = selectedDateTime ? formatTimePretty(selectedDateTime) : "Choose time";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen}>
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
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Services Selected</Text>

              <View style={{ marginTop: 10, gap: 10 }}>
                {services.map((s) => (
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

                <Text style={styles.muted}>{totalDuration ? `Estimated duration: ${totalDuration} min` : ""}</Text>
              </View>
            </View>

            {/* Date */}
            <View style={styles.stepCard}>
              <Pressable onPress={openBookingDate} style={styles.pickerRow}>
                <Text style={styles.pickerText}>{dateLabel}</Text>
                <Ionicons name="calendar-outline" size={18} color={"rgba(0,0,0,0.65)"} />
              </Pressable>

              <Text style={styles.availHint}>
                {blockedDaysLoading
                  ? "Loading booked-off dates…"
                  : "If you see an “Unavailable” alert, that date is booked off by the artist. Pick another day."}
              </Text>
            </View>

            {/* Time */}
            <View style={styles.stepCard}>
              <Pressable onPress={openBookingTime} style={styles.pickerRow}>
                <Text style={styles.pickerText}>{timeLabel}</Text>
                <Ionicons name="time-outline" size={18} color={"rgba(0,0,0,0.65)"} />
              </Pressable>

              {!!selectedDateTime && (
                <View style={{ marginTop: 8 }}>
                  {busyLoading ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator />
                      <Text style={styles.availHint}>Loading available times…</Text>
                    </View>
                  ) : (
                    <Text style={styles.availHint}>
                      {busyIntervals.length > 0 ? "Some times are unavailable." : "No conflicts found — all times should be available."}
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Optional consult (simple) */}
            <View style={[styles.summaryCard, { marginTop: 12 }]}>
              <Pressable
                onPress={() => {
                  setWantsConsultation((v) => {
                    const next = !v;
                    if (!next) {
                      setConsultDateTime(null);
                      setConsultNote("");
                    } else {
                      setConsultDateTime(clampToFuture(new Date()));
                    }
                    return next;
                  });
                }}
                style={styles.agreeRow}
              >
                <View style={[styles.smallBox, wantsConsultation && styles.smallBoxOn]}>
                  {wantsConsultation && <Ionicons name="checkmark" size={14} color={OFF_WHITE} />}
                </View>
                <Text style={styles.agreeText}>
                  Consultation before appointment <Text style={{ color: MUTED }}>(optional)</Text>
                </Text>
              </Pressable>

              {wantsConsultation && (
                <>
                  <TextInput
                    value={consultNote}
                    onChangeText={setConsultNote}
                    placeholder="Optional note for the artist"
                    placeholderTextColor={"rgba(0,0,0,0.40)"}
                    style={styles.consultInput}
                    multiline
                  />
                </>
              )}
            </View>

            <View style={[styles.summaryCard, { marginTop: 12 }]}>
              <Pressable onPress={() => setAgreeTerms((v) => !v)} style={styles.agreeRow}>
                <View style={[styles.smallBox, agreeTerms && styles.smallBoxOn]}>
                  {agreeTerms && <Ionicons name="checkmark" size={14} color={OFF_WHITE} />}
                </View>
                <Text style={styles.agreeText}>
                  Agree to the <Text style={{ fontWeight: "900" }}>Terms & Services</Text> of booking
                </Text>
              </Pressable>
            </View>

            <Pressable onPress={confirm} disabled={!canConfirm} style={[styles.confirmBtn, (!canConfirm || confirming) && { opacity: 0.55 }]}>
              <Text style={styles.confirmText}>{confirming ? "Confirming…" : "Confirm Booking"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* ✅ CLEAN date picker with year selection */}
      <DateTimePickerModal
        isVisible={datePickerOpen}
        mode="date"
        date={selectedDateTime ?? clampToFuture(new Date())}
        minimumDate={minDate}
        maximumDate={maxDate}
        onCancel={() => setDatePickerOpen(false)}
        onConfirm={(picked) => {
          // normalize to keep existing time (or set a sane default)
          const base = selectedDateTime ?? clampToFuture(new Date());
          const next = new Date(base);
          next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());

          const ymd = toYMD(next);
          if (blockedDays.has(ymd)) {
            Alert.alert("Unavailable day", "This day is booked off by the artist. Please choose another date.");
            // keep picker open for quick re-pick
            return;
          }

          const fixed = clampToFuture(next);
          setSelectedDateTime(fixed);
          setDatePickerOpen(false);
        }}
      />

      {/* Android time picker */}
      {Platform.OS === "android" && showAndroidTime && (
        <DateTimePicker
          value={selectedDateTime ?? clampToFuture(new Date())}
          mode="time"
          onChange={onChangeBookingTimeAndroid}
          display="default"
          minuteInterval={5}
          is24Hour={false}
        />
      )}

      {/* iOS time list modal */}
      {Platform.OS === "ios" && (
        <Modal visible={iosTimeOpen} transparent animationType="fade" onRequestClose={() => setIosTimeOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCardTall}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select time</Text>
                <Pressable onPress={() => setIosTimeOpen(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={18} color={BLACK} />
                </Pressable>
              </View>

              <ScrollView style={styles.timeList} contentContainerStyle={{ paddingBottom: 10 }}>
                {timeOptions.map((t) => {
                  const key = `${t.h}:${t.m}`;
                  const isSelected = !!selectedDateTime && selectedDateTime.getHours() === t.h && selectedDateTime.getMinutes() === t.m;
                  const isDisabled = !!selectedDateTime && disabledTimes.has(key);

                  return (
                    <Pressable
                      key={key}
                      disabled={isDisabled}
                      onPress={() => {
                        if (isDisabled) return;
                        setBookingTimeIOS(t.h, t.m);
                        setIosTimeOpen(false);
                      }}
                      style={[styles.timeRow, isSelected && styles.timeRowSelected, isDisabled && { opacity: 0.35 }]}
                    >
                      <Text style={[styles.timeText, isSelected && styles.timeTextSelected]}>{t.label} {isDisabled ? "• Unavailable" : ""}</Text>
                      <Text style={[styles.timeSub, isSelected && styles.timeTextSelected]}>
                        {pad2(t.h)}:{pad2(t.m)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
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

  summaryCard: {
    marginTop: 10,
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryTitle: { fontSize: 14, fontWeight: "900", color: BLACK },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryName: { color: BLACK, fontWeight: "800" },
  summaryPrice: { color: BLACK, fontWeight: "800" },
  hr: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 10 },
  muted: { marginTop: 8, color: MUTED, fontWeight: "800" },

  stepCard: {
    marginTop: 8,
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pickerRow: {
    backgroundColor: OFF_WHITE,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
  },
  pickerText: { color: BLACK, fontWeight: "900" },
  availHint: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

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

  consultInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "800",
    color: BLACK,
    backgroundColor: OFF_WHITE,
    minHeight: 44,
  },

  confirmBtn: {
    marginTop: 14,
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
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

  // iOS time modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", padding: 18, justifyContent: "center" },
  modalCardTall: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    maxHeight: "82%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 15, fontWeight: "900", color: BLACK },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SOFT,
  },
  timeList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  timeRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: OFF_WHITE,
  },
  timeRowSelected: { backgroundColor: "rgba(0,0,0,0.06)" },
  timeText: { fontWeight: "900", color: BLACK },
  timeSub: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },
  timeTextSelected: { color: BLACK },
});
