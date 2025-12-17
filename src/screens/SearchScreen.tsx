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
const OFF_WHITE = "#FFFFFF";
const MUTED = "rgba(0,0,0,0.55)";
const BORDER = "rgba(0,0,0,0.14)";
const SURFACE = "rgba(255,255,255,0.70)";
const SURFACE_2 = "rgba(255,255,255,0.96)";

const FOOTER_SAFE_SPACE = 96; // ✅ keeps primary button above your bottom footer

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

function centsToInput(cents?: number) {
  if (typeof cents !== "number") return "";
  return String(Math.round(cents / 100));
}

function fmtRating(r: number) {
  return r.toFixed(1);
}

// --- helpers for “city or postal” feel ---
function isLikelyPostalCode(q: string) {
  const s = q.trim().toUpperCase();
  // Canada: A1A 1A1 (allow no-space), US: 12345 or 12345-6789
  const ca = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(s);
  const us = /^\d{5}(-\d{4})?$/.test(s);
  return ca || us;
}

function normalizePostal(q: string) {
  const s = q.trim().toUpperCase().replace(/\s+/g, "");
  // format CA as A1A 1A1
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3)}`;
  return q.trim();
}

// --- Photon label builder (cleaner than full display_name dumps) ---
function photonLabel(p: any) {
  const props = p?.properties ?? {};
  const name = props?.name;
  const city = props?.city;
  const state = props?.state || props?.region;
  const country = props?.country;

  const parts = [name, city, state, country].filter(Boolean);

  // de-dupe adjacent duplicates (sometimes name === city)
  const cleaned: string[] = [];
  for (const part of parts) {
    if (cleaned.length === 0 || cleaned[cleaned.length - 1] !== part) cleaned.push(part);
  }
  return cleaned.join(", ");
}

export default function SearchScreen({
  services = ["Any", "Hair", "Makeup", "Nails", "Barber", "Skincare", "Lashes", "Brows"],
  initialFilters,
  onSearch,
  onSkip,
}: {
  services?: string[];
  initialFilters?: MarketplaceFilters | null;
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

  // for “AutoTrader default location”
  const [defaultLocLoading, setDefaultLocLoading] = useState(false);
  const defaultLocTriedRef = useRef(false);

  // keep last known GPS coords so autocomplete can be biased locally even when locationCoords is cleared while typing
  const lastBiasCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // ✅ advanced filters state stays the same (just moves into a modal)
  const [advanced, setAdvanced] = useState(false);
  const [minRating, setMinRating] = useState(4.0);
  const [maxDistanceKm, setMaxDistanceKm] = useState(15);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);

  const minC = useMemo(() => parseMoneyToCents(minPrice), [minPrice]);
  const maxC = useMemo(() => parseMoneyToCents(maxPrice), [maxPrice]);

  // Hydrate UI from last-used filters
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!initialFilters) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const f = initialFilters;

    const svc = f.service?.trim();
    if (svc && services.includes(svc)) setService(svc);
    else setService(services?.[0] ?? "Any");

    setMinPrice(centsToInput(f.minPriceCents));
    setMaxPrice(centsToInput(f.maxPriceCents));

    setLocationText(f.locationText ?? "");
    setLocationCoords(f.locationCoords ?? null);

    if (f.locationCoords) lastBiasCoordsRef.current = f.locationCoords;

    const advOn = typeof f.minRating === "number" || typeof f.maxDistanceKm === "number";
    setAdvanced(advOn);
    if (typeof f.minRating === "number") setMinRating(f.minRating);
    else setMinRating(4.0);
    if (typeof f.maxDistanceKm === "number") setMaxDistanceKm(f.maxDistanceKm);
    else setMaxDistanceKm(15);

    setSuggestions([]);
    setLoadingSuggest(false);
    setSuggestSlow(false);
  }, [initialFilters, services]);

  useEffect(() => {
    hydratedRef.current = false;
  }, [initialFilters]);

  // Default to current location, only if user hasn’t set one already
  useEffect(() => {
    const shouldAutofill =
      !defaultLocTriedRef.current &&
      !locationCoords &&
      !locationText?.trim() &&
      !(initialFilters?.locationCoords || initialFilters?.locationText);

    if (!shouldAutofill) return;

    defaultLocTriedRef.current = true;

    (async () => {
      if (!ExpoLocation) return;

      try {
        setDefaultLocLoading(true);

        const perm = await ExpoLocation.getForegroundPermissionsAsync();
        let status = perm?.status;

        if (status !== "granted") {
          const req = await ExpoLocation.requestForegroundPermissionsAsync();
          status = req?.status;
        }

        if (status !== "granted") return;

        const pos = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Low,
        });

        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocationCoords(coords);
        lastBiasCoordsRef.current = coords;

        try {
          const rev = await ExpoLocation.reverseGeocodeAsync({
            latitude: coords.lat,
            longitude: coords.lng,
          });
          const r0 = rev?.[0];
          const city = r0?.city || r0?.subregion || r0?.region || "";
          setLocationText(city ? `Near ${city}` : "Near me");
        } catch {
          setLocationText("Near me");
        }
      } catch {
        // ignore silently; typing still works
      } finally {
        setDefaultLocLoading(false);
      }
    })();
  }, [initialFilters, locationCoords, locationText]);

  // Typeahead using Photon (Komoot)
  useEffect(() => {
    const qRaw = locationText.trim();

    // Don’t suggest if:
    // - too short
    // - location is locked (coords set)
    if (qRaw.length < 3 || locationCoords) {
      setSuggestions([]);
      setLoadingSuggest(false);
      setSuggestSlow(false);
      return;
    }

    const q = isLikelyPostalCode(qRaw) ? normalizePostal(qRaw) : qRaw;
    const key = q.toLowerCase();

    const cached = locationCache.get(key);
    if (cached) {
      setSuggestions(cached);
      setLoadingSuggest(false);
      setSuggestSlow(false);
      return;
    }

    const controller = new AbortController();

    const debounceT = setTimeout(async () => {
      setLoadingSuggest(true);
      setSuggestSlow(false);

      const slowT = setTimeout(() => setSuggestSlow(true), 600);
      const timeoutT = setTimeout(() => controller.abort(), 2200);

      try {
        const bias = lastBiasCoordsRef.current;

        let query = q;
        if (isLikelyPostalCode(qRaw)) query = `${q} Canada`;

        let url = "https://photon.komoot.io/api/?" + `q=${encodeURIComponent(query)}` + `&limit=6` + `&lang=en`;

        if (bias) {
          url += `&lat=${encodeURIComponent(String(bias.lat))}&lon=${encodeURIComponent(String(bias.lng))}`;
        }

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        const json = await res.json();
        const features = Array.isArray(json?.features) ? json.features : [];

        const items: LocationSuggestion[] = features
          .map((f: any) => {
            const coords = f?.geometry?.coordinates;
            const lng = Number(coords?.[0]);
            const lat = Number(coords?.[1]);
            const label = photonLabel(f);

            if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            const id = String(
              f?.properties?.osm_id ??
                f?.properties?.place_id ??
                f?.properties?.osm_key ??
                `${lat},${lng},${label}`
            );

            return { id, label, lat, lng } as LocationSuggestion;
          })
          .filter((v: LocationSuggestion | null): v is LocationSuggestion => v !== null)
          .slice(0, 6);

        locationCache.set(key, items);
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        clearTimeout(slowT);
        clearTimeout(timeoutT);
        setLoadingSuggest(false);
        setSuggestSlow(false);
      }
    }, 140);

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
      lastBiasCoordsRef.current = coords;
      setSuggestions([]);

      try {
        const rev = await ExpoLocation.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });

        const r0 = rev?.[0];
        const city = r0?.city || r0?.subregion || r0?.region || "";
        setLocationText(city ? `Near ${city}` : "Near me");
      } catch {
        setLocationText("Near me");
      }

      Keyboard.dismiss();
    } catch {
      Alert.alert("Couldn’t get location", "Try again or type your city/postal code.");
    }
  };

  const pickSuggestion = (s: LocationSuggestion) => {
    setLocationText(s.label);
    setLocationCoords({ lat: s.lat, lng: s.lng });
    lastBiasCoordsRef.current = { lat: s.lat, lng: s.lng };
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

  const AdvancedModal = () => (
    <Modal transparent animationType="fade" visible={advancedModalOpen} onRequestClose={() => setAdvancedModalOpen(false)}>
      <Pressable style={styles.sheetBackdrop} onPress={() => setAdvancedModalOpen(false)} />
      <View style={styles.advModal}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Advanced filters</Text>

        <View style={{ padding: 14, gap: 14 }}>
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
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => {
                // turn off advanced and reset defaults
                setAdvanced(false);
                setMinRating(4.0);
                setMaxDistanceKm(15);
                setAdvancedModalOpen(false);
              }}
              style={[styles.modalBtn, styles.modalBtnGhost]}
            >
              <Text style={[styles.modalBtnText, styles.modalBtnTextGhost]}>Clear</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                // enable advanced when user saves
                setAdvanced(true);
                setAdvancedModalOpen(false);
              }}
              style={[styles.modalBtn, styles.modalBtnPrimary]}
            >
              <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const advancedSummary = advanced ? `${fmtRating(minRating)}★ • ${Math.round(maxDistanceKm)} km` : "Off";

  return (
    <SafeAreaView style={styles.safe}>
      <ServiceSheet />
      <AdvancedModal />

      <View style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={styles.h1}>Search</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: FOOTER_SAFE_SPACE }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.label}>Location</Text>
                {defaultLocLoading && <ActivityIndicator size="small" />}
              </View>

              <Pressable onPress={useMyLocation} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Use my location</Text>
              </Pressable>
            </View>

            <View style={{ position: "relative" }}>
              <TextInput
                placeholder="City or postal code…"
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

          {/* ✅ Advanced filters button (replaces toggle row) */}
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setAdvancedModalOpen(true);
            }}
            style={[styles.advBtn, advanced && styles.advBtnOn]}
          >
            <View>
              <Text style={[styles.advLabel, advanced && styles.advLabelOn]}>Advanced filters</Text>
              <Text style={styles.advSub}>Rating + distance</Text>
            </View>

            <View style={styles.advRight}>
              <Text style={[styles.advValue, advanced && styles.advValueOn]}>{advancedSummary}</Text>
              <Text style={styles.advChevron}>›</Text>
            </View>
          </Pressable>
        </ScrollView>

        {/* ✅ Search button moved up above footer */}
        <View style={[styles.primaryWrap, { paddingBottom: FOOTER_SAFE_SPACE - 34 }]}>
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
    backgroundColor: PINK,
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

  scrollContent: { gap: 12 },

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
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  secondaryBtnText: { fontWeight: "900", color: BLACK, opacity: 0.85, fontSize: 12 },

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

  // ✅ Advanced button (replaces toggle)
  advBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: OFF_WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advBtnOn: { backgroundColor: PINK, borderColor: "rgba(0,0,0,0.20)" },
  advLabel: { fontWeight: "900", color: BLACK, opacity: 0.85, fontSize: 14 },
  advLabelOn: { opacity: 1 },
  advSub: { marginTop: 2, color: MUTED, fontWeight: "700", fontSize: 12 },
  advRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  advValue: { fontWeight: "900", color: BLACK, opacity: 0.6, fontSize: 12 },
  advValueOn: { opacity: 0.9 },
  advChevron: { fontWeight: "900", color: MUTED, fontSize: 18, marginTop: -2 },

  badge: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontWeight: "900", color: BLACK, opacity: 0.85 },

  // Primary footer area (button lifted above the app footer)
  primaryWrap: {
    paddingTop: 8,
  },
  primaryBtn: {
    backgroundColor: BLACK,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginHorizontal: 12,
  },
  primaryText: { color: OFF_WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.4 },

  skipBtn: { marginTop: 10, alignItems: "center" },
  skipText: { color: MUTED, fontWeight: "900" },

  // Service sheet + advanced modal share the same backdrop style
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

  // Advanced modal uses the same bottom-sheet look
  advModal: {
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

  // modal buttons
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalBtnPrimary: {
    backgroundColor: BLACK,
    borderColor: BLACK,
  },
  modalBtnGhost: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.10)",
  },
  modalBtnText: { fontWeight: "900" },
  modalBtnTextPrimary: { color: OFF_WHITE },
  modalBtnTextGhost: { color: BLACK, opacity: 0.85 },
});
