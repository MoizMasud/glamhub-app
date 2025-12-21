// SettingsScreen.tsx
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
  Switch,
  TextInput,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { supabase } from "../lib/supabase";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

const MUTED = "rgba(0,0,0,0.60)";
const SOFT = "rgba(0,0,0,0.05)";

type ConsultationType = "zoom" | "google_meet";

type TimeOffRow = {
  id: string;
  artist_id: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  note: string | null;
  created_at?: string | null;
};

function isValidDate(d: any): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
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

function clampToFuture(d: Date) {
  const now = new Date();
  return d.getTime() < now.getTime() ? now : d;
}

function ensureEndAfterStart(start: Date, end: Date) {
  if (end.getTime() < start.getTime()) return new Date(start);
  return end;
}

/** ✅ Always includes year */
function formatDatePretty(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimePretty(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function toISO(d: Date) {
  return d.toISOString();
}

function toDateOnlyISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * ✅ Safe parser: prevents "1969/1970" from epoch when strings are null/empty/invalid.
 * If invalid, returns null (caller can fallback).
 */
function parseISOOrNull(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const t = iso.trim();
  if (!t) return null;

  const d = new Date(t);
  if (!isValidDate(d)) return null;

  // guard against epoch-ish junk showing as 1969/1970
  if (d.getFullYear() < 2000) return null;

  return d;
}

type PickerTarget = "startDate" | "startTime" | "endDate" | "endTime" | null;

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [autoCleanup, setAutoCleanup] = useState(false);

  const [role, setRole] = useState<string>("client");
  const isArtist = useMemo(() => role === "artist", [role]);

  // Consultation settings
  const [consultEnabled, setConsultEnabled] = useState(false);
  const [consultType, setConsultType] = useState<ConsultationType>("zoom");
  const [consultLink, setConsultLink] = useState("");
  const [consultDirty, setConsultDirty] = useState(false);

  // Time off
  const [timeOffLoading, setTimeOffLoading] = useState(false);
  const [timeOff, setTimeOff] = useState<TimeOffRow[]>([]);
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

  const [allDay, setAllDay] = useState(true);
  const [addStart, setAddStart] = useState<Date | null>(null);
  const [addEnd, setAddEnd] = useState<Date | null>(null);
  const [addNote, setAddNote] = useState("");

  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const saveProfilePatch = async (patch: Record<string, any>) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const { error } = await supabase.from("profiles").update(patch).eq("id", auth.user.id);
    if (error) throw error;
  };

  const loadTimeOff = async () => {
    try {
      setTimeOffLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("artist_time_off")
        .select("id, artist_id, start_date, end_date, start_time, end_time, all_day, note, created_at")
        .eq("artist_id", auth.user.id)
        .order("start_time", { ascending: false })
        .limit(50);

      if (error) throw error;

      const normalized: TimeOffRow[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        artist_id: String(r.artist_id),
        start_date: r.start_date ?? null,
        end_date: r.end_date ?? null,
        start_time: r.start_time ?? null,
        end_time: r.end_time ?? null,
        all_day: !!r.all_day,
        note: r.note ?? null,
        created_at: r.created_at ?? null,
      }));

      if (mountedRef.current) setTimeOff(normalized);
    } catch (e: any) {
      Alert.alert("Time off", e?.message ?? "Failed to load time off.");
      if (mountedRef.current) setTimeOff([]);
    } finally {
      if (mountedRef.current) setTimeOffLoading(false);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("profiles")
        .select("role, auto_cleanup_bookings, consultation_enabled, consultation_type, consultation_link")
        .eq("id", auth.user.id)
        .single();

      if (error) throw error;

      const nextRole = (data?.role ?? "client") as string;
      setRole(nextRole);
      setAutoCleanup(!!data?.auto_cleanup_bookings);

      setConsultEnabled(!!data?.consultation_enabled);
      const ct = (data?.consultation_type ?? "zoom") as any;
      setConsultType(ct === "google_meet" ? "google_meet" : "zoom");
      setConsultLink((data?.consultation_link ?? "") as string);
      setConsultDirty(false);

      if (nextRole === "artist") {
        await loadTimeOff();
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load settings.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onToggleAutoCleanup = (nextValue: boolean) => {
    if (!autoCleanup && nextValue) {
      Alert.alert(
        "Enable auto-remove?",
        "When enabled, cancelled/completed bookings will be automatically removed from YOUR view after 24 hours. You can turn this off anytime.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enable",
            onPress: async () => {
              try {
                setSaving(true);
                await saveProfilePatch({ auto_cleanup_bookings: true });
                if (mountedRef.current) setAutoCleanup(true);
              } catch (e: any) {
                Alert.alert("Error", e?.message ?? "Failed to save.");
              } finally {
                if (mountedRef.current) setSaving(false);
              }
            },
          },
        ]
      );
      return;
    }

    (async () => {
      try {
        setSaving(true);
        await saveProfilePatch({ auto_cleanup_bookings: nextValue });
        if (mountedRef.current) setAutoCleanup(nextValue);
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to save.");
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    })();
  };

  const saveConsultDetails = async () => {
    try {
      setSaving(true);
      await saveProfilePatch({
        consultation_enabled: consultEnabled,
        consultation_type: consultType,
        consultation_link: consultLink.trim() || null,
      });
      if (mountedRef.current) setConsultDirty(false);
      Alert.alert("Saved", "Consultation settings updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save consultation settings.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const ensureDefaults = () => {
    // ✅ No epoch defaults; always start from "now" if state empty
    const now = clampToFuture(new Date());

    const s = addStart && isValidDate(addStart) ? addStart : now;

    let e =
      addEnd && isValidDate(addEnd)
        ? addEnd
        : new Date(s.getTime() + 60 * 60 * 1000); // default +1h

    if (allDay) {
      const sd = startOfDay(s);
      const ed = endOfDay(e);
      return { start: sd, end: ensureEndAfterStart(sd, ed) };
    }

    e = ensureEndAfterStart(s, e);
    return { start: s, end: e };
  };

  const openPicker = (target: PickerTarget) => {
    const { start, end } = ensureDefaults();
    setAddStart(start);
    setAddEnd(end);
    setPickerTarget(target);
  };

  const closePicker = () => setPickerTarget(null);

  const applyPickedDate = (picked: Date) => {
    if (!isValidDate(picked)) return;
    const { start, end } = ensureDefaults();

    if (pickerTarget === "startDate") {
      setAddStart(() => {
        const next = new Date(start);
        next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        return allDay ? startOfDay(next) : next;
      });
      return;
    }

    if (pickerTarget === "endDate") {
      setAddEnd(() => {
        const next = new Date(end);
        next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        return allDay ? endOfDay(next) : next;
      });
      return;
    }

    if (pickerTarget === "startTime") {
      setAddStart(() => {
        const next = new Date(start);
        next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        return clampToFuture(next);
      });
      return;
    }

    if (pickerTarget === "endTime") {
      setAddEnd(() => {
        const next = new Date(end);
        next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        return next;
      });
      return;
    }
  };

  useEffect(() => {
    if (!allDay) return;
    setAddStart((prev) => (prev && isValidDate(prev) ? startOfDay(prev) : prev));
    setAddEnd((prev) => (prev && isValidDate(prev) ? endOfDay(prev) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDay]);

  useEffect(() => {
    if (!addStart || !isValidDate(addStart)) return;
    setAddEnd((prev) => {
      const nowEnd = prev && isValidDate(prev) ? prev : new Date(addStart.getTime() + 60 * 60 * 1000);
      let next = new Date(nowEnd);
      if (allDay) next = endOfDay(next);
      if (next.getTime() < addStart.getTime()) {
        next = allDay ? endOfDay(addStart) : new Date(addStart.getTime() + 60 * 60 * 1000);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addStart?.getTime()]);

  const addTimeOffRange = async () => {
    try {
      setSaving(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { start, end } = ensureDefaults();
      if (end.getTime() < start.getTime()) {
        Alert.alert("Invalid range", "End must be after start.");
        return;
      }

      const startDate = toDateOnlyISO(start);
      const endDate = toDateOnlyISO(end);

      const { error } = await supabase.from("artist_time_off").insert([
        {
          artist_id: auth.user.id,
          start_date: startDate,
          end_date: endDate,
          start_time: toISO(start),
          end_time: toISO(end),
          all_day: allDay,
          note: addNote.trim() || null,
        },
      ]);

      if (error) throw error;

      if (mountedRef.current) {
        setAddStart(null);
        setAddEnd(null);
        setAddNote("");
      }

      await loadTimeOff();
      Alert.alert("Saved", "Time off added.");
    } catch (e: any) {
      Alert.alert("Time off", e?.message ?? "Failed to add time off.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const deleteTimeOff = async (row: TimeOffRow) => {
    if (deletingIds[row.id]) return;

    try {
      setDeletingIds((p) => ({ ...p, [row.id]: true }));

      // ✅ Close picker if open (defensive)
      if (pickerTarget) closePicker();

      // ✅ Let UI breathe (prevents “freeze” feel)
      await new Promise((res) => setTimeout(res, 0));

      const { error } = await supabase.from("artist_time_off").delete().eq("id", row.id);
      if (error) throw error;

      if (mountedRef.current) {
        setTimeOff((prev) => prev.filter((r) => r.id !== row.id));
      }
    } catch (e: any) {
      Alert.alert("Time off", e?.message ?? "Failed to delete.");
    } finally {
      if (mountedRef.current) {
        setDeletingIds((p) => {
          const next = { ...p };
          delete next[row.id];
          return next;
        });
      }
    }
  };

  const TypePill = ({ label, value }: { label: string; value: ConsultationType }) => {
    const on = consultType === value;
    return (
      <Pressable
        onPress={() => {
          setConsultType(value);
          setConsultDirty(true);
        }}
        style={[styles.typePill, on && styles.typePillOn]}
      >
        <Text style={[styles.typePillText, on && styles.typePillTextOn]}>{label}</Text>
      </Pressable>
    );
  };

  const startLabel = addStart
    ? allDay
      ? `Start: ${formatDatePretty(addStart)}`
      : `Start: ${formatDatePretty(addStart)} • ${formatTimePretty(addStart)}`
    : "Choose start";

  const endLabel = addEnd
    ? allDay
      ? `End: ${formatDatePretty(addEnd)}`
      : `End: ${formatDatePretty(addEnd)} • ${formatTimePretty(addEnd)}`
    : "Choose end";

  const { start: safeStart, end: safeEnd } = ensureDefaults();

  const pickerMode = pickerTarget?.includes("Time") ? "time" : "date";
  const pickerValue =
    pickerTarget === "startDate" || pickerTarget === "startTime"
      ? safeStart
      : pickerTarget === "endDate" || pickerTarget === "endTime"
      ? safeEnd
      : safeStart;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={BLACK} />
          </Pressable>
          <Text style={styles.h1}>Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Auto cleanup */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Bookings</Text>

              <View style={styles.settingRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.rowTitle}>Auto-remove old bookings</Text>
                  <Text style={styles.rowSub}>Hide cancelled/completed bookings from your view after 24 hours.</Text>
                </View>
                <Switch value={autoCleanup} onValueChange={onToggleAutoCleanup} disabled={saving} />
              </View>

              {saving && <Text style={styles.savingText}>Saving…</Text>}
            </View>

            {/* Consultation (artists only) */}
            {isArtist && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Consultations</Text>
                <Text style={styles.help}>Enable consultations and share a link (Zoom or Google Meet).</Text>

                <View style={styles.settingRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.rowTitle}>Enable consultations</Text>
                    <Text style={styles.rowSub}>Let clients request/schedule a consultation before the appointment.</Text>
                  </View>
                  <Switch
                    value={consultEnabled}
                    onValueChange={(v) => {
                      setConsultEnabled(v);
                      setConsultDirty(true);
                    }}
                    disabled={saving}
                  />
                </View>

                {consultEnabled && (
                  <>
                    <Text style={styles.label}>Consultation type</Text>
                    <View style={styles.typeRow}>
                      <TypePill label="Zoom" value="zoom" />
                      <TypePill label="Google Meet" value="google_meet" />
                    </View>

                    <Text style={styles.label}>Consultation link</Text>
                    <TextInput
                      value={consultLink}
                      onChangeText={(t) => {
                        setConsultLink(t);
                        setConsultDirty(true);
                      }}
                      style={styles.input}
                      placeholder="Paste your Zoom or Google Meet link"
                      autoCapitalize="none"
                    />

                    <Pressable
                      onPress={saveConsultDetails}
                      disabled={saving || !consultDirty}
                      style={[styles.primaryBtn, (!consultDirty || saving) && { opacity: 0.55 }]}
                    >
                      <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save consultation settings"}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}

            {/* Time off (artists only) */}
            {isArtist && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Time off</Text>
                <Text style={styles.help}>
                  Block full days (vacation) or specific hours. Clients won’t be able to book any time that overlaps.
                </Text>

                <View style={[styles.settingRow, { flexDirection: "column", alignItems: "stretch", gap: 10 }]}>
                  <View style={[styles.settingRow, { marginTop: 0 }]}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={styles.rowTitle}>All day</Text>
                      <Text style={styles.rowSub}>Turn off to block specific hours instead of the full day.</Text>
                    </View>
                    <Switch value={allDay} onValueChange={setAllDay} disabled={saving} />
                  </View>

                  <Pressable onPress={() => openPicker("startDate")} style={styles.pickerRow}>
                    <Text style={styles.pickerText}>{startLabel}</Text>
                    <Ionicons name="calendar-outline" size={18} color={"rgba(0,0,0,0.65)"} />
                  </Pressable>

                  {!allDay && (
                    <Pressable onPress={() => openPicker("startTime")} style={styles.pickerRow}>
                      <Text style={styles.pickerText}>
                        {addStart ? `Start time: ${formatTimePretty(addStart)}` : "Choose start time"}
                      </Text>
                      <Ionicons name="time-outline" size={18} color={"rgba(0,0,0,0.65)"} />
                    </Pressable>
                  )}

                  <Pressable onPress={() => openPicker("endDate")} style={styles.pickerRow}>
                    <Text style={styles.pickerText}>{endLabel}</Text>
                    <Ionicons name="calendar-outline" size={18} color={"rgba(0,0,0,0.65)"} />
                  </Pressable>

                  {!allDay && (
                    <Pressable onPress={() => openPicker("endTime")} style={styles.pickerRow}>
                      <Text style={styles.pickerText}>
                        {addEnd ? `End time: ${formatTimePretty(addEnd)}` : "Choose end time"}
                      </Text>
                      <Ionicons name="time-outline" size={18} color={"rgba(0,0,0,0.65)"} />
                    </Pressable>
                  )}

                  <TextInput
                    value={addNote}
                    onChangeText={setAddNote}
                    style={styles.input}
                    placeholder="Optional note (private)"
                  />

                  <Pressable
                    onPress={addTimeOffRange}
                    disabled={saving || !addStart || !addEnd}
                    style={[styles.primaryBtn, (saving || !addStart || !addEnd) && { opacity: 0.55 }]}
                  >
                    <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Add time off"}</Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.rowTitle, { marginBottom: 6 }]}>Your blocked times</Text>

                  {timeOffLoading ? (
                    <ActivityIndicator />
                  ) : timeOff.length === 0 ? (
                    <Text style={styles.rowSub}>No time off added yet.</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {timeOff.map((r) => {
                        const s = parseISOOrNull(r.start_time) ?? new Date();
                        const e =
                          parseISOOrNull(r.end_time) ??
                          (r.all_day ? endOfDay(s) : new Date(s.getTime() + 60 * 60 * 1000));

                        const isAllDayRow = !!r.all_day;
                        const isDeleting = !!deletingIds[r.id];

                        return (
                          <View key={r.id} style={styles.timeOffRow}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                              <Text style={styles.timeOffTitle}>
                                {formatDatePretty(s)}
                                {isAllDayRow ? " (All day)" : ` • ${formatTimePretty(s)}`} → {formatDatePretty(e)}
                                {isAllDayRow ? "" : ` • ${formatTimePretty(e)}`}
                              </Text>

                              {!!r.note && <Text style={styles.timeOffNote}>{r.note}</Text>}

                              {(!r.start_time || !r.end_time) && (
                                <Text style={[styles.timeOffNote, { marginTop: 6 }]}>
                                  Note: This entry was missing time data. If it looks wrong, delete and re-add it.
                                </Text>
                              )}
                            </View>

                            <Pressable
                              disabled={isDeleting}
                              onPress={() =>
                                Alert.alert("Delete time off?", "This will remove the block.", [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: isDeleting ? "Deleting..." : "Delete",
                                    style: "destructive",
                                    onPress: () => deleteTimeOff(r),
                                  },
                                ])
                              }
                              style={[styles.trashBtn, isDeleting && { opacity: 0.5 }]}
                            >
                              {isDeleting ? (
                                <ActivityIndicator />
                              ) : (
                                <Ionicons name="trash-outline" size={18} color={BLACK} />
                              )}
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ✅ Bottom spacer so last section never gets cut off */}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
      </View>

      {/* Single stable picker */}
      <DateTimePickerModal
        isVisible={pickerTarget !== null}
        mode={pickerMode as any}
        date={pickerValue}
        onConfirm={(d) => {
          applyPickedDate(d);
          closePicker();
        }}
        onCancel={closePicker}
        minuteInterval={5}
        is24Hour={false}
        minimumDate={pickerTarget === "startDate" || pickerTarget === "startTime" ? new Date() : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  container: { flex: 1, backgroundColor: OFF_WHITE },

  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  scrollContent: {
    paddingBottom: 24,
  },

  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 18,
    padding: 14,
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    gap: 10,
  },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  help: { color: MUTED, fontWeight: "700", fontSize: 12, lineHeight: 16 },

  settingRow: {
    marginTop: 6,
    backgroundColor: OFF_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rowTitle: { fontWeight: "900", color: BLACK, fontSize: 14 },
  rowSub: { marginTop: 4, fontWeight: "800", color: MUTED, fontSize: 12, lineHeight: 16 },

  savingText: { color: MUTED, fontWeight: "800", marginTop: 2 },

  label: { fontWeight: "900", color: BLACK, marginTop: 6 },

  input: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: OFF_WHITE,
    color: BLACK,
    fontWeight: "800",
    marginTop: 6,
  },

  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 },
  typePill: {
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typePillOn: { backgroundColor: BLACK, borderColor: BLACK },
  typePillText: { fontWeight: "900", color: "rgba(0,0,0,0.75)" },
  typePillTextOn: { color: OFF_WHITE },

  primaryBtn: {
    marginTop: 10,
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: OFF_WHITE, fontWeight: "900" },

  pickerRow: {
    backgroundColor: OFF_WHITE,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  pickerText: { color: BLACK, fontWeight: "900" },

  timeOffRow: {
    backgroundColor: OFF_WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeOffTitle: { fontWeight: "900", color: BLACK },
  timeOffNote: { marginTop: 4, fontWeight: "800", color: MUTED, fontSize: 12 },

  trashBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },

  // ✅ This prevents the last text from being cut off by tab bar / home indicator
  bottomSpacer: {
    height: Platform.OS === "ios" ? 30 : 30,
  },
});
