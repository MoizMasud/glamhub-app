// BookingSelectedScreen.tsx
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
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
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

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clampToFuture(d: Date) {
  const now = new Date();
  return d.getTime() < now.getTime() ? now : d;
}

function formatDatePretty(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTimePretty(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ✅ No native time picker on iOS.
// Build a stable list of times (every 15 minutes by default).
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

  // booking datetime
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);

  // consultation
  const [consultationEnabled, setConsultationEnabled] = useState(false);
  const [sameDayConsultation, setSameDayConsultation] = useState(false);
  const [wantsConsultation, setWantsConsultation] = useState(false);
  const [consultDateTime, setConsultDateTime] = useState<Date | null>(null);
  const [consultNote, setConsultNote] = useState("");

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [joinChannel, setJoinChannel] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Android native pickers
  const [showAndroidDate, setShowAndroidDate] = useState(false);
  const [showAndroidTime, setShowAndroidTime] = useState(false);
  const [showAndroidConsultDate, setShowAndroidConsultDate] = useState(false);
  const [showAndroidConsultTime, setShowAndroidConsultTime] = useState(false);

  // iOS time selection modal (stable)
  const [iosTimeOpen, setIosTimeOpen] = useState(false);
  const [iosConsultTimeOpen, setIosConsultTimeOpen] = useState(false);

  // iOS date modal (inline date picker) — this one is stable
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const [iosConsultDateOpen, setIosConsultDateOpen] = useState(false);

  const totalCents = useMemo(
    () => services.reduce((sum, s) => sum + (s?.price_cents ?? 0), 0),
    [services]
  );
  const totalDuration = useMemo(
    () => services.reduce((sum, s) => sum + (s?.duration_minutes ?? 0), 0),
    [services]
  );

  const canConfirm =
    services.length > 0 &&
    !!selectedDateTime &&
    agreeTerms &&
    !confirming &&
    (!wantsConsultation || !!consultDateTime);

  const minDate = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => addMinutes(startOfDay(new Date()), 14 * 24 * 60), []);

  const timeOptions = useMemo(() => buildTimeOptions(15), []);

  // ---- Consultation constraints (core fix) ----
  const consultMaxDate = useMemo(() => {
    // If no booking chosen yet, fall back to normal max range
    if (!selectedDateTime) return maxDate;

    // If same-day consult allowed: you can pick the same DATE as booking
    if (sameDayConsultation) return endOfDay(selectedDateTime);

    // Otherwise: only days strictly BEFORE booking day
    const dayBefore = addMinutes(startOfDay(selectedDateTime), -1); // 23:59 of previous day
    return dayBefore;
  }, [selectedDateTime, sameDayConsultation, maxDate]);

  const isConsultBeforeBooking = (candidate: Date) => {
    if (!selectedDateTime) return true;

    // must be strictly before booking datetime
    if (candidate.getTime() >= selectedDateTime.getTime()) return false;

    // if same-day not allowed, also enforce date strictly before
    if (!sameDayConsultation && sameDay(candidate, selectedDateTime)) return false;

    return true;
  };

  const ensureConsultValid = (candidate: Date | null) => {
    if (!candidate) return null;

    // always keep in the future
    let next = clampToFuture(candidate);

    // if booking exists, enforce "before booking" rules
    if (selectedDateTime && !isConsultBeforeBooking(next)) {
      // best auto-fix:
      // - if same-day allowed: set to 15 minutes before booking (or now if booking is too soon)
      // - if not allowed: set to end of previous day (or null if that's not in the future)
      if (sameDayConsultation) {
        const fallback = addMinutes(selectedDateTime, -15);
        next = clampToFuture(fallback);
        if (!isConsultBeforeBooking(next)) return null;
      } else {
        const prevDayEnd = addMinutes(startOfDay(selectedDateTime), -1); // 23:59 previous day
        // if that is not in the future, there is no valid consult slot
        if (prevDayEnd.getTime() <= new Date().getTime()) return null;
        next = prevDayEnd;
      }
    }

    return next;
  };

  // If booking changes, make sure existing consult selection still valid
  useEffect(() => {
    if (!wantsConsultation) return;
    setConsultDateTime((prev) => ensureConsultValid(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateTime, sameDayConsultation, wantsConsultation]);

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

      // ✅ add same_day_consultation fetch
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("consultation_enabled, allow_same_day_consultation")
        .eq("id", artistId)
        .single();

      if (profErr) throw profErr;

      setConsultationEnabled(!!prof?.consultation_enabled);
      setSameDayConsultation(!!prof?.allow_same_day_consultation)

      if (!prof?.consultation_enabled) {
        setWantsConsultation(false);
        setConsultDateTime(null);
        setConsultNote("");
      }
    } catch (e: any) {
      setServices([]);
      setErrorText(e?.message ?? "Failed to load selected services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, serviceIds.join("|")]);

  // -------- Openers --------
  const openBookingDate = () => {
    setSelectedDateTime((prev) => prev ?? clampToFuture(new Date()));
    if (Platform.OS === "ios") setIosDateOpen(true);
    else setShowAndroidDate(true);
  };

  const openBookingTime = () => {
    setSelectedDateTime((prev) => prev ?? clampToFuture(new Date()));
    if (Platform.OS === "ios") setIosTimeOpen(true);
    else setShowAndroidTime(true);
  };

  const openConsultDate = () => {
    setConsultDateTime((prev) => ensureConsultValid(prev ?? clampToFuture(new Date())));
    if (Platform.OS === "ios") setIosConsultDateOpen(true);
    else setShowAndroidConsultDate(true);
  };

  const openConsultTime = () => {
    setConsultDateTime((prev) => ensureConsultValid(prev ?? clampToFuture(new Date())));
    if (Platform.OS === "ios") setIosConsultTimeOpen(true);
    else setShowAndroidConsultTime(true);
  };

  // -------- Android handlers --------
  const onChangeBookingDateAndroid = (event: DateTimePickerEvent, date?: Date) => {
    setShowAndroidDate(false);
    if (event.type === "dismissed" || !date) return;

    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      return clampToFuture(next);
    });
  };

  const onChangeBookingTimeAndroid = (event: DateTimePickerEvent, date?: Date) => {
    setShowAndroidTime(false);
    if (event.type === "dismissed" || !date) return;

    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      return clampToFuture(next);
    });
  };

  const onChangeConsultDateAndroid = (event: DateTimePickerEvent, date?: Date) => {
    setShowAndroidConsultDate(false);
    if (event.type === "dismissed" || !date) return;

    setConsultDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      // keep time from base
      const fixed = ensureConsultValid(next);
      return fixed;
    });
  };

  const onChangeConsultTimeAndroid = (event: DateTimePickerEvent, date?: Date) => {
    setShowAndroidConsultTime(false);
    if (event.type === "dismissed" || !date) return;

    setConsultDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);

      const fixed = ensureConsultValid(next);
      if (!fixed) {
        Alert.alert(
          "Invalid consultation time",
          selectedDateTime
            ? "Consultation must be before the booking time."
            : "Please choose a valid consultation time."
        );
        return prev; // keep previous
      }
      return fixed;
    });
  };

  // -------- iOS time setters (no native picker) --------
  const setBookingTime = (h: number, m: number) => {
    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(h, m, 0, 0);
      return clampToFuture(next);
    });
  };

  const setConsultTime = (h: number, m: number) => {
    setConsultDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(h, m, 0, 0);
      const fixed = ensureConsultValid(next);
      return fixed;
    });
  };

  // -------- iOS date picker (inline) --------
  const onChangeIOSBookingDate = (_event: DateTimePickerEvent, date?: Date) => {
    if (!date || isNaN(date.getTime())) return;
    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      return clampToFuture(next);
    });
  };

  const onChangeIOSConsultDate = (_event: DateTimePickerEvent, date?: Date) => {
    if (!date || isNaN(date.getTime())) return;
    setConsultDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      const fixed = ensureConsultValid(next);
      return fixed;
    });
  };

  const confirm = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      onRequestSignIn();
      return;
    }
    if (!selectedDateTime) return;

    const uid = data.user.id;

    if (services.some((s) => s.artist_id === uid)) {
      Alert.alert("Not allowed", "You can’t book your own service.");
      return;
    }

    if (wantsConsultation) {
      const fixed = ensureConsultValid(consultDateTime);
      if (!fixed) {
        Alert.alert(
          "Consultation time needed",
          "Please choose a consultation date/time before the booking time."
        );
        return;
      }
      if (consultDateTime?.getTime() !== fixed.getTime()) setConsultDateTime(fixed);
    }

    try {
      setConfirming(true);

      const { data: existing, error } = await supabase
        .from("bookings")
        .select("id, service_id")
        .eq("client_id", uid)
        .in("service_id", serviceIds)
        .in("status", ["pending", "accepted"])
        .limit(1);

      if (error) throw error;
      if ((existing ?? []).length > 0) {
        Alert.alert("Already booked", "You already have an active booking for one of these services.");
        return;
      }

      let cursor = new Date(selectedDateTime);

      for (const s of services) {
        await createBooking({
          serviceId: s.id,
          artistId: s.artist_id,
          startTimeISO: cursor.toISOString(),
          notes: joinChannel ? "Join channel: yes" : "Join channel: no",
            consultation_meta:
              consultationEnabled && wantsConsultation && consultDateTime
                ? {
                    wants_consultation: true,
                    availability: [consultDateTime.toISOString()],
                    note: consultNote.trim() ? consultNote.trim() : null,

                    // ✅ If client selected a time, it's a PROPOSAL
                    consult_status: "proposed",
                    proposed_time_iso: consultDateTime.toISOString(),
                    proposed_note: "from_client",
                  }
                : null,

        });

        cursor = addMinutes(cursor, s.duration_minutes ?? 0);
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

  const dateLabel = selectedDateTime ? formatDatePretty(selectedDateTime) : "Choose date";
  const timeLabel = selectedDateTime ? formatTimePretty(selectedDateTime) : "Choose time";

  const consultDateLabel = consultDateTime ? formatDatePretty(consultDateTime) : "Choose consultation date";
  const consultTimeLabel = consultDateTime ? formatTimePretty(consultDateTime) : "Choose consultation time";

  // Filter consult time options on iOS if consult is on the booking day
  const filteredConsultTimeOptions = useMemo(() => {
    if (!consultDateTime || !selectedDateTime) return timeOptions;

    // If consult date is same day as booking date:
    // - must be strictly before booking time
    // - if same-day consult not allowed, this date should never happen (we still filter defensively)
    if (sameDay(consultDateTime, selectedDateTime)) {
      const bookingMinutes = selectedDateTime.getHours() * 60 + selectedDateTime.getMinutes();
      return timeOptions.filter((t) => t.h * 60 + t.m < bookingMinutes);
    }

    return timeOptions;
  }, [consultDateTime, selectedDateTime, timeOptions]);

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
            </View>

            {/* Time */}
            <View style={styles.stepCard}>
              <Pressable onPress={openBookingTime} style={styles.pickerRow}>
                <Text style={styles.pickerText}>{timeLabel}</Text>
                <Ionicons name="time-outline" size={18} color={"rgba(0,0,0,0.65)"} />
              </Pressable>
            </View>

            {/* Consultation */}
            {consultationEnabled && (
              <View style={[styles.summaryCard, { marginTop: 12 }]}>
                <Pressable
                  onPress={() => {
                    setWantsConsultation((v) => {
                      const next = !v;
                      if (next) {
                        setConsultDateTime((prev) => ensureConsultValid(prev ?? clampToFuture(new Date())));
                      } else {
                        setConsultDateTime(null);
                        setConsultNote("");
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
                    <View style={[styles.stepCard, { marginTop: 12 }]}>
                      <Pressable onPress={openConsultDate} style={styles.pickerRow}>
                        <Text style={styles.pickerText}>{consultDateLabel}</Text>
                        <Ionicons name="calendar-outline" size={18} color={"rgba(0,0,0,0.65)"} />
                      </Pressable>
                    </View>

                    <View style={styles.stepCard}>
                      <Pressable onPress={openConsultTime} style={styles.pickerRow}>
                        <Text style={styles.pickerText}>{consultTimeLabel}</Text>
                        <Ionicons name="time-outline" size={18} color={"rgba(0,0,0,0.65)"} />
                      </Pressable>
                    </View>

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
            )}

            <View style={[styles.summaryCard, { marginTop: 12 }]}>
              <Pressable onPress={() => setJoinChannel((v) => !v)} style={styles.agreeRow}>
                <View style={[styles.smallBox, joinChannel && styles.smallBoxOn]}>
                  {joinChannel && <Ionicons name="checkmark" size={14} color={OFF_WHITE} />}
                </View>
                <Text style={styles.agreeText}>Join this professional’s community channel</Text>
              </Pressable>

              <Pressable onPress={() => setAgreeTerms((v) => !v)} style={[styles.agreeRow, { marginTop: 10 }]}>
                <View style={[styles.smallBox, agreeTerms && styles.smallBoxOn]}>
                  {agreeTerms && <Ionicons name="checkmark" size={14} color={OFF_WHITE} />}
                </View>
                <Text style={styles.agreeText}>
                  Agree to the <Text style={{ fontWeight: "900" }}>Terms & Services</Text> of booking with Smart Beauty
                  Networking
                </Text>
              </Pressable>
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

      {/* ANDROID native pickers */}
      {Platform.OS === "android" && showAndroidDate && (
        <DateTimePicker
          value={selectedDateTime ?? clampToFuture(new Date())}
          mode="date"
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={onChangeBookingDateAndroid}
          display="default"
        />
      )}
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
      {Platform.OS === "android" && showAndroidConsultDate && (
        <DateTimePicker
          value={consultDateTime ?? clampToFuture(new Date())}
          mode="date"
          minimumDate={minDate}
          // ✅ key fix: cap consult date based on booking + same-day rule
          maximumDate={consultMaxDate}
          onChange={onChangeConsultDateAndroid}
          display="default"
        />
      )}
      {Platform.OS === "android" && showAndroidConsultTime && (
        <DateTimePicker
          value={consultDateTime ?? clampToFuture(new Date())}
          mode="time"
          onChange={onChangeConsultTimeAndroid}
          display="default"
          minuteInterval={5}
          is24Hour={false}
        />
      )}

      {/* iOS DATE modals (native date picker is stable) */}
      {Platform.OS === "ios" && (
        <>
          <Modal visible={iosDateOpen} transparent animationType="fade" onRequestClose={() => setIosDateOpen(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select date</Text>
                  <Pressable onPress={() => setIosDateOpen(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={18} color={BLACK} />
                  </Pressable>
                </View>

                <View style={styles.modalInner}>
                  <DateTimePicker
                    value={selectedDateTime ?? clampToFuture(new Date())}
                    mode="date"
                    display="inline"
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    onChange={onChangeIOSBookingDate}
                    style={{ width: "100%" }}
                  />
                </View>

                <Pressable onPress={() => setIosDateOpen(false)} style={styles.doneBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal
            visible={iosConsultDateOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIosConsultDateOpen(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Consultation date</Text>
                  <Pressable onPress={() => setIosConsultDateOpen(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={18} color={BLACK} />
                  </Pressable>
                </View>

                <View style={styles.modalInner}>
                  <DateTimePicker
                    value={consultDateTime ?? clampToFuture(new Date())}
                    mode="date"
                    display="inline"
                    minimumDate={minDate}
                    // ✅ key fix: cap consult date based on booking + same-day rule
                    maximumDate={consultMaxDate}
                    onChange={onChangeIOSConsultDate}
                    style={{ width: "100%" }}
                  />
                </View>

                <Pressable onPress={() => setIosConsultDateOpen(false)} style={styles.doneBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          {/* iOS TIME modals (custom list — avoids native crash) */}
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
                    const isSelected =
                      !!selectedDateTime &&
                      selectedDateTime.getHours() === t.h &&
                      selectedDateTime.getMinutes() === t.m;
                    return (
                      <Pressable
                        key={`${t.h}:${t.m}`}
                        onPress={() => {
                          setBookingTime(t.h, t.m);
                          setIosTimeOpen(false);
                        }}
                        style={[styles.timeRow, isSelected && styles.timeRowSelected]}
                      >
                        <Text style={[styles.timeText, isSelected && styles.timeTextSelected]}>{t.label}</Text>
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

          <Modal
            visible={iosConsultTimeOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIosConsultTimeOpen(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCardTall}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Consultation time</Text>
                  <Pressable onPress={() => setIosConsultTimeOpen(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={18} color={BLACK} />
                  </Pressable>
                </View>

                <ScrollView style={styles.timeList} contentContainerStyle={{ paddingBottom: 10 }}>
                  {filteredConsultTimeOptions.map((t) => {
                    const isSelected =
                      !!consultDateTime && consultDateTime.getHours() === t.h && consultDateTime.getMinutes() === t.m;
                    return (
                      <Pressable
                        key={`c-${t.h}:${t.m}`}
                        onPress={() => {
                          setConsultTime(t.h, t.m);
                          setIosConsultTimeOpen(false);
                        }}
                        style={[styles.timeRow, isSelected && styles.timeRowSelected]}
                      >
                        <Text style={[styles.timeText, isSelected && styles.timeTextSelected]}>{t.label}</Text>
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
        </>
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

  // modals
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", padding: 18, justifyContent: "center" },
  modalCard: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  modalCardTall: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    maxHeight: "78%",
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
  modalInner: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },
  doneBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: BLACK,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  doneText: { color: OFF_WHITE, fontWeight: "900" },

  // time list
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
