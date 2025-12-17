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

  // ✅ Pickers (single source of truth)
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);

  // iOS inline picker toggles / Android dialog toggles
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [joinChannel, setJoinChannel] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const totalCents = useMemo(
    () => services.reduce((sum, s) => sum + (s?.price_cents ?? 0), 0),
    [services]
  );
  const totalDuration = useMemo(
    () => services.reduce((sum, s) => sum + (s?.duration_minutes ?? 0), 0),
    [services]
  );

  const canConfirm = services.length > 0 && !!selectedDateTime && agreeTerms && !confirming;

  const minDate = useMemo(() => {
    // allow booking starting “now”
    return new Date();
  }, []);

  const maxDate = useMemo(() => addMinutes(startOfDay(new Date()), 14 * 24 * 60), []);

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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, serviceIds.join("|")]);

  const openDate = () => {
    // ensure we have a default value
    setSelectedDateTime((prev) => prev ?? clampToFuture(new Date()));
    setShowDatePicker(true);
  };

  const openTime = () => {
    setSelectedDateTime((prev) => prev ?? clampToFuture(new Date()));
    setShowTimePicker(true);
  };

  const onChangeDate = (event: DateTimePickerEvent, date?: Date) => {
    // Android emits dismiss
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed") return;
    if (!date) return;

    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      return clampToFuture(next);
    });
  };

  const onChangeTime = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowTimePicker(false);
    if (event.type === "dismissed") return;
    if (!date) return;

    setSelectedDateTime((prev) => {
      const base = prev ?? clampToFuture(new Date());
      const next = new Date(base);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      return clampToFuture(next);
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

    // Own service protection
    if (services.some((s) => s.artist_id === uid)) {
      Alert.alert("Not allowed", "You can’t book your own service.");
      return;
    }

    try {
      setConfirming(true);

      // Active booking protection
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

            {/* ✅ Date picker */}
            <View style={styles.stepCard}>
              <Pressable onPress={openDate} style={styles.pickerRow}>
                <Text style={styles.pickerText}>{dateLabel}</Text>
                <Ionicons name="calendar-outline" size={18} color={"rgba(0,0,0,0.65)"} />
              </Pressable>

              {showDatePicker && (
                <View style={{ marginTop: 10 }}>
                  <DateTimePicker
                    value={selectedDateTime ?? clampToFuture(new Date())}
                    mode="date"
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    onChange={onChangeDate}
                    display={Platform.OS === "ios" ? "inline" : "default"}
                  />

                  {Platform.OS === "ios" && (
                    <Pressable onPress={() => setShowDatePicker(false)} style={styles.iosDoneBtn}>
                      <Text style={styles.iosDoneText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* ✅ Time picker */}
            <View style={styles.stepCard}>
              <Pressable onPress={openTime} style={styles.pickerRow}>
                <Text style={styles.pickerText}>{timeLabel}</Text>
                <Ionicons name="time-outline" size={18} color={"rgba(0,0,0,0.65)"} />
              </Pressable>

              {showTimePicker && (
                <View style={{ marginTop: 10 }}>
                  <DateTimePicker
                    value={selectedDateTime ?? clampToFuture(new Date())}
                    mode="time"
                    onChange={onChangeTime}
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minuteInterval={5}
                    is24Hour={false}
                  />

                  {Platform.OS === "ios" && (
                    <Pressable onPress={() => setShowTimePicker(false)} style={styles.iosDoneBtn}>
                      <Text style={styles.iosDoneText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

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
                  Agree to the <Text style={{ fontWeight: "900" }}>Terms & Services</Text> of booking with Smart Beauty Networking
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
    borderColor: "rgba(0,0,0,0.06)",
  },
  summaryTitle: { fontSize: 14, fontWeight: "900", color: BLACK },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryName: { color: BLACK, fontWeight: "800" },
  summaryPrice: { color: BLACK, fontWeight: "800" },
  hr: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 10 },
  muted: { marginTop: 8, color: MUTED, fontWeight: "800" },

  stepLabel: { marginTop: 14, color: MUTED, fontWeight: "900" },
  stepCard: {
    marginTop: 8,
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  // ✅ picker row button (matches your existing style language)
  pickerRow: {
    backgroundColor: OFF_WHITE,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerText: { color: BLACK, fontWeight: "900" },

  iosDoneBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: BLACK,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  iosDoneText: { color: OFF_WHITE, fontWeight: "900" },

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
