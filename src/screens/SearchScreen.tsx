import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Modal,
  FlatList,
  Keyboard,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import Slider from "@react-native-community/slider";

let ExpoLocation: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoLocation = require("expo-location");
} catch {
  ExpoLocation = null;
}

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";
const MUTED = "rgba(0,0,0,0.55)";
const BORDER = "rgba(0,0,0,0.14)";
const SURFACE = "rgba(255,255,255,0.70)";
const SURFACE_2 = "rgba(255,255,255,0.96)";

export type MarketplaceFilters = {
  service?: string;
  minPriceCents?: number;
  maxPriceCents?: number;

  locationText?: string;
  locationCoords?: { lat: number; lng: number } | null;

  minRating?: number;
  maxDistanceKm?: number;
};

type LocationSuggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

// simple in-memory cache to make typeahead feel instant for repeat queries
const locationCache = new Map<string, LocationSuggestion[]>();

function parseMoneyToCents(input: string): number | undefined {
  const cleaned = input.replace(/[^0-9.]/g, "").trim();
  if (!cleaned || cleaned === ".") return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

function fmtPrice(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(0)}`;
}

function fmtRating(r: number) {
  return r.toFixed(1);
}

export default function SearchScreen({
  services = ["Any", "Hair", "Makeup", "Nails", "Barber", "Skincare", "Lashes", "Brows"],
  onSearch,
  onSkip,
}: {
  services?: string[];
  onSearch: (filters: MarketplaceFilters) => void;
  onSkip?: () => void;
}) {
  const minRef = useRef<TextInput>(null);
  const maxRef = useRef<TextInput>(null);

  const [service, setService] = useState<string>(services?.[0] ?? "Any");
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const [locationText, setLocationText] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestSlow, setSuggestSlow] = useState(false);

  const [advanced, setAdvanced] = useState(false);
  const [minRating, setMinRating] = useState(4.0);
  const [maxDistanceKm, setMaxDistanceKm] = useState(15);

  const minC = useMemo(() => parseMoneyToCents(minPrice), [minPrice]);
  const maxC = useMemo(() => parseMoneyToCents(maxPrice), [maxPrice]);

  // --- Faster typeahead: shorter debounce + cache + hard timeout + stop spinner if slow ---
  useEffect(() => {
    const q = locationText.trim();

    // only suggest when user is typing (and coords not locked)
    if (q.length < 3 || locationCoords) {
      setSuggestions([]);
      setLoadingSuggest(false);
      setSuggestSlow(false);
      return;
    }

    const key = q.toLowerCase();
    const cached = locationCache.get(key);
    if (cached) {
      setSuggestions(cached);
      setLoadingSuggest(false);
      setSuggestSlow(false);
      return;
    }

    const controller = new AbortController();

    // debounce: 150ms feels much snappier
    const debounceT = setTimeout(async () => {
      setLoadingSuggest(true);
      setSuggestSlow(false);

      // show a “slow network” hint quickly so it never feels stuck
      const slowT = setTimeout(() => setSuggestSlow(true), 700);

      // hard timeout so it never spins forever
      const timeoutT = setTimeout(() => controller.abort(), 2500);

      try {
        const url =
          "https://nominatim.openstreetmap.org/search?" +
          `q=${encodeURIComponent(q)}` +
          "&format=json&addressdetails=1&limit=6";

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "GlamHubApp/1.0 (search)",
            "Accept-Language": "en",
          },
        });

        const json = await res.json();
        const raw = Array.isArray(json) ? json : [];

        const items = raw
          .map((x: any) => {
            const label = x?.display_name as string;
            const lat = Number(x?.lat);
            const lng = Number(x?.lon);
            if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            const s: LocationSuggestion = {
              id: String(x?.place_id ?? `${lat},${lng},${label}`),
              label,
              lat,
              lng,
            };
            return s;
          })
          .filter((v: LocationSuggestion | null): v is LocationSuggestion => v !== null)
          .slice(0, 6);

        locationCache.set(key, items);
        setSuggestions(items);
      } catch (e: any) {
        // Abort = either new keystroke OR timeout; just don’t show spinner forever
        setSuggestions([]);
      } finally {
        clearTimeout(slowT);
        clearTimeout(timeoutT);
        setLoadingSuggest(false);
        setSuggestSlow(false);
      }
    }, 150);

    return () => {
      clearTimeout(debounceT);
      controller.abort();
    };
  }, [locationText, locationCoords]);

  const useMyLocation = async () => {
    if (!ExpoLocation) {
      Alert.alert("GPS not installed", "Run: npx expo install expo-location");
      return;
    }

    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Enable location permission to use GPS.");
        return;
      }

      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });

      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocationCoords(coords);
      setSuggestions([]);

      try {
        const rev = await ExpoLocation.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });

        const r0 = rev?.[0];
        const city = r0?.city || r0?.subregion || r0?.region || "";
        setLocationText(city || "Current location");
      } catch {
        setLocationText("Current location");
      }

      Keyboard.dismiss();
    } catch {
      Alert.alert("Couldn’t get location", "Try again or type your city.");
    }
  };

  const pickSuggestion = (s: LocationSuggestion) => {
    setLocationText(s.label);
    setLocationCoords({ lat: s.lat, lng: s.lng });
    setSuggestions([]);
    Keyboard.dismiss();
  };

  const submit = () => {
    const minParsed = parseMoneyToCents(minPrice);
    const maxParsed = parseMoneyToCents(maxPrice);

    if (minParsed !== undefined && maxParsed !== undefined && minParsed > maxParsed) {
      Alert.alert("Fix price range", "Min price cannot be greater than max price.");
      return;
    }

    const filters: MarketplaceFilters = {
      service: service && service !== "Any" ? service : undefined,
      minPriceCents: minParsed,
      maxPriceCents: maxParsed,
      locationText: locationText.trim() ? locationText.trim() : undefined,
      locationCoords: locationCoords ?? null,
    };

    if (advanced) {
      filters.minRating = minRating;
      filters.maxDistanceKm = maxDistanceKm;
    }

    onSearch(filters);
  };

  const ServiceSheet = () => (
    <Modal transparent animationType="fade" visible={serviceSheetOpen} onRequestClose={() => setServiceSheetOpen(false)}>
      <Pressable style={styles.sheetBackdrop} onPress={() => setServiceSheetOpen(false)} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Service</Text>

        <FlatList
          data={services}
          keyExtractor={(x) => x}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const active = item === service;
            return (
              <Pressable
                onPress={() => {
                  setService(item);
                  setServiceSheetOpen(false);
                }}
                style={[styles.sheetItem, active && styles.sheetItemActive]}
              >
                <Text style={[styles.sheetItemText, active && styles.sheetItemTextActive]}>{item}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ServiceSheet />

      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.h1}>Search</Text>
            <Text style={styles.sub}>Find the right artist, fast.</Text>
          </View>
        </View>

        {/* Scrollable content (no outer Touchable wrapper -> scrolling feels effortless) */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
          {/* Primary filters */}
          <View>
            <Text style={styles.label}>Service</Text>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setServiceSheetOpen(true);
              }}
              style={styles.select}
            >
              <Text style={styles.selectText}>{service}</Text>
              <Text style={styles.selectCaret}>▾</Text>
            </Pressable>

            <View style={{ height: 14 }} />

            <Text style={styles.label}>Price range</Text>
            <View style={styles.row}>
              <TextInput
                ref={minRef}
                placeholder="Min"
                keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                value={minPrice}
                onChangeText={setMinPrice}
                style={[styles.input, { flex: 1 }]}
                placeholderTextColor={MUTED}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => maxRef.current?.focus()}
              />
              <TextInput
                ref={maxRef}
                placeholder="Max"
                keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                value={maxPrice}
                onChangeText={setMaxPrice}
                style={[styles.input, { flex: 1 }]}
                placeholderTextColor={MUTED}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            <View style={{ height: 14 }} />

            <View style={styles.rowBetween}>
              <Text style={styles.label}>Location</Text>

              <Pressable onPress={useMyLocation} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Use my location</Text>
              </Pressable>
            </View>

            <View style={{ position: "relative" }}>
              <TextInput
                placeholder="City or address…"
                value={locationText}
                onChangeText={(t) => {
                  setLocationText(t);
                  setLocationCoords(null);
                }}
                style={styles.input}
                placeholderTextColor={MUTED}
                returnKeyType="search"
                onSubmitEditing={() => Keyboard.dismiss()}
                autoCorrect={false}
                autoCapitalize="words"
              />

              {(loadingSuggest || suggestions.length > 0 || suggestSlow) && !locationCoords && (
                <View style={styles.suggestBox}>
                  {suggestions.length > 0 ? (
                    suggestions.map((s) => (
                      <Pressable key={s.id} onPress={() => pickSuggestion(s)} style={styles.suggestItem}>
                        <Text numberOfLines={2} style={styles.suggestText}>
                          {s.label}
                        </Text>
                      </Pressable>
                    ))
                  ) : loadingSuggest ? (
                    <View style={styles.suggestLoading}>
                      <ActivityIndicator />
                      <Text style={styles.suggestLoadingText}>
                        {suggestSlow ? "Still searching… keep typing to refine" : "Searching…"}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.suggestLoading}>
                      <Text style={styles.suggestLoadingText}>No suggestions</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Advanced toggle */}
          <View style={[styles.advRow, advanced && styles.advRowOn]}>
            <View>
              <Text style={[styles.advLabel, advanced && styles.advLabelOn]}>Advanced filters</Text>
              <Text style={styles.advSub}>Rating + distance</Text>
            </View>

            <View style={styles.advRight}>
              <Text style={[styles.advState, advanced && styles.advStateOn]}>{advanced ? "ON" : "OFF"}</Text>
              <Switch
                value={advanced}
                onValueChange={setAdvanced}
                trackColor={{ false: "rgba(0,0,0,0.12)", true: "rgba(0,0,0,0.35)" }}
                thumbColor={BLACK}
              />
            </View>
          </View>

          {advanced && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Minimum rating</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{fmtRating(minRating)}★</Text>
                </View>
              </View>

              <Slider
                style={{ width: "100%", height: 36 }}
                minimumValue={0}
                maximumValue={5}
                step={0.5}
                value={minRating}
                onValueChange={(v) => setMinRating(v)}
                minimumTrackTintColor={BLACK}
                maximumTrackTintColor={"rgba(0,0,0,0.15)"}
                thumbTintColor={BLACK}
              />

              <View style={{ height: 10 }} />

              <View style={styles.rowBetween}>
                <Text style={styles.label}>Max distance</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{Math.round(maxDistanceKm)} km</Text>
                </View>
              </View>

              <Slider
                style={{ width: "100%", height: 36 }}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={maxDistanceKm}
                onValueChange={(v) => setMaxDistanceKm(v)}
                minimumTrackTintColor={BLACK}
                maximumTrackTintColor={"rgba(0,0,0,0.15)"}
                thumbTintColor={BLACK}
              />

              <Text style={styles.note}>
                Distance works best when the search location has coordinates (pick a suggestion or use GPS).
              </Text>
            </View>
          )}

          {/* spacer so content scrolls above footer */}
          <View />
        </ScrollView>

        {/* Fixed footer */}
        <View>
          <Pressable onPress={submit} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Search</Text>
          </Pressable>
        </View>
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

  root: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
  },
  h1: { fontSize: 30, fontWeight: "900", color: BLACK },
  sub: { marginTop: 3, color: MUTED, fontWeight: "700" },

  pillBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: SURFACE,
  },
  pillText: { fontWeight: "900", color: BLACK },

  scrollContent: { paddingBottom: 0, gap: 12 },

  card: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
  },

  label: { fontWeight: "900", color: BLACK, fontSize: 14 },

  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    fontWeight: "800",
    color: BLACK,
  },

  select: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectText: { fontWeight: "900", color: BLACK },
  selectCaret: { fontWeight: "900", color: MUTED },

  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  secondaryBtnText: { fontWeight: "900", color: BLACK, opacity: 0.85, fontSize: 12 },

  hint: { marginTop: 10, color: MUTED, fontWeight: "700", fontSize: 12 },

  // Suggestions
  suggestBox: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: SURFACE_2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    zIndex: 50,
  },
  suggestItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  suggestText: { fontWeight: "800", color: BLACK, opacity: 0.86, fontSize: 13 },
  suggestLoading: { padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  suggestLoadingText: { fontWeight: "800", color: BLACK, opacity: 0.7 },

  // Advanced toggle
  advRow: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.38)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advRowOn: { backgroundColor: PINK, borderColor: "rgba(0,0,0,0.20)" },
  advLabel: { fontWeight: "900", color: BLACK, opacity: 0.85, fontSize: 14 },
  advLabelOn: { opacity: 1 },
  advSub: { marginTop: 2, color: MUTED, fontWeight: "700", fontSize: 12 },
  advRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  advState: { fontWeight: "900", color: BLACK, opacity: 0.6 },
  advStateOn: { opacity: 0.9 },

  badge: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontWeight: "900", color: BLACK, opacity: 0.85 },

  note: { marginTop: 8, color: MUTED, fontWeight: "700", fontSize: 12 },

  footer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    backgroundColor: OFF_WHITE,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }
      : { elevation: 6 }),
  },

  summaryRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingHorizontal: 12, paddingBottom: 10 },
  summaryChip: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  summaryChipText: { fontWeight: "900", color: BLACK, opacity: 0.8, fontSize: 12 },

  primaryBtn: {
    backgroundColor: BLACK,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 6,
  },
  primaryText: { color: OFF_WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.4 },

  // Service sheet
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 20,
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginTop: 10,
  },
  sheetTitle: { marginTop: 10, marginLeft: 14, fontWeight: "900", color: BLACK, fontSize: 14 },
  sheetItem: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  sheetItemActive: { backgroundColor: PINK, borderColor: "rgba(0,0,0,0.18)" },
  sheetItemText: { fontWeight: "900", color: BLACK, opacity: 0.8 },
  sheetItemTextActive: { opacity: 1 },
});
