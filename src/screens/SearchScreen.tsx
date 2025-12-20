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
  FlatList,
  Keyboard,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";

let ExpoLocation: any = null;
try {
  ExpoLocation = require("expo-location");
} catch {
  ExpoLocation = null;
}

let Slider: any = null;
try {
  Slider = require("@react-native-community/slider")?.default ?? require("@react-native-community/slider");
} catch {
  Slider = null;
}

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";
const MUTED = "rgba(0,0,0,0.55)";
const BORDER = "rgba(0,0,0,0.14)";
const SURFACE = "rgba(255,255,255,0.70)";
const SURFACE_2 = "rgba(255,255,255,0.96)";

const FOOTER_SAFE_SPACE = 96;

export type MarketplaceFilters = {
  service?: string;
  minPriceCents?: number;
  maxPriceCents?: number;

  locationText?: string;
  locationCoords?: { lat: number; lng: number } | null;

  lat?: number;
  lng?: number;

  minRating?: number; // optional
  maxDistanceKm?: number; // optional
};

type LocationSuggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

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

function isLikelyPostalCode(q: string) {
  const s = q.trim().toUpperCase();
  const ca = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(s);
  const us = /^\d{5}(-\d{4})?$/.test(s);
  return ca || us;
}

function normalizePostal(q: string) {
  const s = q.trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3)}`;
  return q.trim();
}

function photonLabel(p: any) {
  const props = p?.properties ?? {};
  const name = props?.name;
  const city = props?.city;
  const state = props?.state || props?.region;
  const country = props?.country;

  const parts = [name, city, state, country].filter(Boolean);
  const cleaned: string[] = [];
  for (const part of parts) {
    if (cleaned.length === 0 || cleaned[cleaned.length - 1] !== part) cleaned.push(part);
  }
  return cleaned.join(", ");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function MiniToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
      style={[styles.miniToggle, value && styles.miniToggleOn]}
      hitSlop={10}
    >
      <View style={[styles.miniKnob, value && styles.miniKnobOn]} />
    </Pressable>
  );
}

function InlineSliderRow({
  title,
  sub,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  enabled,
  onToggle,
  offLabel,
}: {
  title: string;
  sub?: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  offLabel: string; // e.g. "Any" / "Unlimited"
}) {
  const hasSlider = !!Slider;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onToggle(!enabled)}
        style={styles.filterHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.sliderTitle}>{title}</Text>
          {!!sub && <Text style={styles.sliderSub}>{sub}</Text>}
        </View>

        <View style={styles.filterHeaderRight}>
          <View style={styles.valuePill}>
            <Text style={styles.valuePillText}>{enabled ? valueLabel : offLabel}</Text>
          </View>

          <MiniToggle value={enabled} onChange={onToggle} />
        </View>
      </Pressable>

      {enabled && (
        <>
          <View style={{ height: 10 }} />
          {hasSlider ? (
            <Slider
              style={{ width: "100%", height: 28 }}
              minimumValue={min}
              maximumValue={max}
              step={step}
              value={value}
              onValueChange={(v: number) => {
                const nv = Number(v);
                if (!Number.isFinite(nv)) return;
                onChange(nv);
              }}
              onSlidingComplete={(v: number) => {
                const nv = Number(v);
                if (!Number.isFinite(nv)) return;
                onChange(nv);
              }}
              minimumTrackTintColor={BLACK}
              maximumTrackTintColor={"rgba(0,0,0,0.18)"}
              thumbTintColor={BLACK}
            />
          ) : (
            <View style={styles.sliderFallback}>
              <Text style={styles.sliderFallbackText}>
                Slider not installed. Run:{" "}
                <Text style={{ fontWeight: "900" }}>npx expo install @react-native-community/slider</Text>
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default function SearchScreen({
  services = ["Any", "Hair", "Makeup", "Nails", "Barber", "Skincare", "Lashes", "Brows"],
  initialFilters,
  onSearch,
}: {
  services?: string[];
  initialFilters?: MarketplaceFilters | null;
  onSearch: (filters: MarketplaceFilters) => void;
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

  const [defaultLocLoading, setDefaultLocLoading] = useState(false);
  const defaultLocTriedRef = useRef(false);
  const lastBiasCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // ✅ Advanced expanded section
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // ✅ Independent toggles
  const [useRatingFilter, setUseRatingFilter] = useState(false);
  const [useDistanceFilter, setUseDistanceFilter] = useState(false);

  // Values
  const [minRating, setMinRating] = useState(4.0);
  const [maxDistanceKm, setMaxDistanceKm] = useState(15);

  useMemo(() => parseMoneyToCents(minPrice), [minPrice]);
  useMemo(() => parseMoneyToCents(maxPrice), [maxPrice]);

  // hydrate
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

    const ratingOn = typeof f.minRating === "number";
    const distOn = typeof f.maxDistanceKm === "number";

    setUseRatingFilter(ratingOn);
    setUseDistanceFilter(distOn);

    // auto expand if any advanced filter is active
    setAdvancedExpanded(ratingOn || distOn);

    setMinRating(typeof f.minRating === "number" ? f.minRating : 4.0);
    setMaxDistanceKm(typeof f.maxDistanceKm === "number" ? f.maxDistanceKm : 15);

    setSuggestions([]);
    setLoadingSuggest(false);
    setSuggestSlow(false);
  }, [initialFilters, services]);

  useEffect(() => {
    hydratedRef.current = false;
  }, [initialFilters]);

  // default location
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
      } finally {
        setDefaultLocLoading(false);
      }
    })();
  }, [initialFilters, locationCoords, locationText]);

  // suggestions (Photon)
  useEffect(() => {
    const qRaw = locationText.trim();

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

        let url =
          "https://photon.komoot.io/api/?" +
          `q=${encodeURIComponent(query)}` +
          `&limit=6` +
          `&lang=en`;

        if (bias) url += `&lat=${encodeURIComponent(String(bias.lat))}&lon=${encodeURIComponent(String(bias.lng))}`;

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

    if (locationCoords) {
      filters.lat = locationCoords.lat;
      filters.lng = locationCoords.lng;
    }

    // ✅ Only include optional advanced filters if enabled
    if (useRatingFilter) filters.minRating = minRating;
    if (useDistanceFilter) filters.maxDistanceKm = maxDistanceKm;

    onSearch(filters);
  };

  // service sheet (simple)
  const SheetWrapper = ({
    visible,
    onClose,
    children,
  }: {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetWrapper} pointerEvents="box-none">
          {children}
        </View>
      </View>
    </Modal>
  );

  const ServiceSheet = () => (
    <SheetWrapper visible={serviceSheetOpen} onClose={() => setServiceSheetOpen(false)}>
      <View style={styles.sheet} pointerEvents="auto">
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Service</Text>

        <FlatList
          data={services}
          keyExtractor={(x) => x}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
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
    </SheetWrapper>
  );

  const anyAdvancedOn = useRatingFilter || useDistanceFilter;
  const advancedSummary = anyAdvancedOn
    ? [
        useRatingFilter ? `${fmtRating(minRating)}+` : "Any rating",
        useDistanceFilter ? `${Math.round(maxDistanceKm)} km` : "Unlimited",
      ].join(" • ")
    : "Off";

  return (
    <SafeAreaView style={styles.safe}>
      <ServiceSheet />

      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.h1}>Search</Text>
        </View>

        <View style={{ flex: 1 }}>
          <FlatList
            data={[{ key: "content" }]}
            keyExtractor={(x) => x.key}
            renderItem={() => (
              <View style={{ gap: 12, paddingBottom: FOOTER_SAFE_SPACE }}>
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

                {/* Advanced pill row */}
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setAdvancedExpanded((v) => !v);
                  }}
                  style={[styles.advPill, anyAdvancedOn && styles.advPillOn]}
                >
                  <View>
                    <Text style={[styles.advLabel, anyAdvancedOn && styles.advLabelOn]}>Advanced filters</Text>
                    <Text style={styles.advSub}>Rating + distance</Text>
                  </View>

                  <View style={styles.advRight}>
                    <Text style={[styles.advValue, anyAdvancedOn && styles.advValueOn]}>{advancedSummary}</Text>
                    <Text style={styles.advChevron}>{advancedExpanded ? "˄" : "˅"}</Text>
                  </View>
                </Pressable>

                {advancedExpanded && (
                  <View style={{ gap: 10 }}>
                    <InlineSliderRow
                      title="Rating"
                      sub="Only show artists above this rating"
                      valueLabel={`${fmtRating(minRating)}+`}
                      offLabel="Any"
                      min={0}
                      max={5}
                      step={0.5}
                      value={minRating}
                      enabled={useRatingFilter}
                      onToggle={(v) => setUseRatingFilter(v)}
                      onChange={(v) => {
                        const next = clamp(Math.round(v * 2) / 2, 0, 5);
                        setMinRating(next);
                        if (!useRatingFilter) setUseRatingFilter(true);
                      }}
                    />

                    <InlineSliderRow
                      title="Distance"
                      sub="Only show artists within this distance"
                      valueLabel={`${Math.round(maxDistanceKm)} km`}
                      offLabel="Unlimited"
                      min={1}
                      max={100}
                      step={1}
                      value={maxDistanceKm}
                      enabled={useDistanceFilter}
                      onToggle={(v) => setUseDistanceFilter(v)}
                      onChange={(v) => {
                        const next = clamp(Math.round(v), 1, 100);
                        setMaxDistanceKm(next);
                        if (!useDistanceFilter) setUseDistanceFilter(true);
                      }}
                    />
                  </View>
                )}
              </View>
            )}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            showsVerticalScrollIndicator={false}
          />

          <View style={[styles.primaryWrap, { paddingBottom: FOOTER_SAFE_SPACE - 34 }]}>
            <Pressable onPress={submit} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Search</Text>
            </Pressable>
          </View>
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
  header: { paddingBottom: 10 },
  h1: { fontSize: 30, fontWeight: "900", color: BLACK },

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

  advPill: {
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
  advPillOn: { backgroundColor: PINK, borderColor: "rgba(0,0,0,0.20)" },
  advLabel: { fontWeight: "900", color: BLACK, opacity: 0.85, fontSize: 14 },
  advLabelOn: { opacity: 1 },
  advSub: { marginTop: 2, color: MUTED, fontWeight: "700", fontSize: 12 },
  advRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  advValue: { fontWeight: "900", color: BLACK, opacity: 0.6, fontSize: 12 },
  advValueOn: { opacity: 0.9 },
  advChevron: { fontWeight: "900", color: MUTED, fontSize: 16, marginTop: -1 },

  card: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
  },
  filterHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  filterHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },

  sliderTitle: { fontWeight: "900", color: BLACK, fontSize: 14 },
  sliderSub: { marginTop: 4, fontWeight: "800", color: MUTED, fontSize: 12 },

  valuePill: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  valuePillText: { fontWeight: "900", color: BLACK, opacity: 0.85 },

  miniToggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    padding: 3,
    justifyContent: "center",
  },
  miniToggleOn: { backgroundColor: BLACK, borderColor: BLACK },
  miniKnob: { width: 20, height: 20, borderRadius: 999, backgroundColor: OFF_WHITE, transform: [{ translateX: 0 }] },
  miniKnobOn: { transform: [{ translateX: 18 }] },

  sliderFallback: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 14,
    padding: 12,
  },
  sliderFallbackText: { fontWeight: "800", color: BLACK, opacity: 0.75, fontSize: 12 },

  primaryWrap: { paddingTop: 8, position: "absolute", left: 0, right: 0, bottom: 0 },
  primaryBtn: {
    backgroundColor: BLACK,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginHorizontal: 12,
  },
  primaryText: { color: OFF_WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.4 },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  sheetWrapper: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12 },
  sheet: {
    borderRadius: 20,
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    maxHeight: "82%",
    elevation: 30,
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
