// src/screens/MarketplaceScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { listActiveServicesWithArtist, MarketplaceService } from "../lib/services";
import type { MarketplaceFilters } from "./SearchScreen";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const OFF_WHITE = "#FFFFFF";

const PINK_CARD = "#F6D6D6";
const MUTED = "rgba(0,0,0,0.60)";
const MUTED_2 = "rgba(0,0,0,0.45)";
const CHIP_BORDER = "rgba(0,0,0,0.14)";
const BORDER = "rgba(0,0,0,0.08)";

const { width: SCREEN_W } = Dimensions.get("window");
const CHIP_MAX_W = Math.min(240, Math.floor(SCREEN_W * 0.62));

function formatPriceCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

// stable “random” rating per service (so it doesn’t change on re-render)
function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function fakeRating(id: string) {
  return 3.5 + (hash(id) % 4) * 0.5; // 3.5–5.0
}

function titleFromFilters(filters?: MarketplaceFilters | null) {
  const svc = (filters as any)?.service?.trim?.();
  if (svc) return `Filter ${svc} Services`;
  return "Filter Services";
}

// Build the service “tags” line like: "Gel X • Manicure & Pedicure • Lashes • Waxing"
function bulletMetaFromService(s: MarketplaceService) {
  const desc = (s.description ?? "").replace(/\n/g, " ").trim();
  const tokens = desc
    .split(/[,•|/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  // If no description tokens, fall back to title
  if (tokens.length === 0) {
    const t = (s.title ?? "").trim();
    return t ? t : "";
  }

  return tokens.join(" • ");
}

function compactCityLabel(raw?: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const noNear = s.replace(/^near\s+/i, "").trim();
  const first = noNear.split(",")[0]?.trim() ?? "";
  if (first.length <= 22) return first || noNear;
  const words = noNear.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ");
}

type ClearFlags = {
  service?: boolean;
  price?: boolean;
  location?: boolean;
  rating?: boolean;
};

function getAvatarUrl(displayName: string) {
  return ``;
}


export default function MarketplaceScreen({
  onRequestSignIn,
  onOpenAccount,
  onOpenArtist,
  onOpenService,
  filters,
  onEditFilters,
}: {
  onRequestSignIn?: () => void;
  onOpenAccount: () => void;

  // card tap should open artist (and can pass selected service id)
  onOpenArtist: (artistId: string, selectedServiceId?: string | null) => void;

  onOpenService: (serviceId: string) => void;

  filters?: MarketplaceFilters | null;
  onEditFilters?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [clears, setClears] = useState<ClearFlags>({});

  // UI-only segmented toggle (kept)
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  // auth aware (kept, even if not used here)
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setClears({});
  }, [filters]);

  const effectiveFilters = useMemo(() => {
    const f: any = { ...(filters ?? {}) };

    if (clears.service) delete f.service;

    if (clears.location) {
      delete f.locationText;
      delete f.locationCoords;
      delete f.maxDistanceKm;
    }

    if (clears.rating) delete f.minRating;

    if (clears.price) {
      delete f.minPriceCents;
      delete f.maxPriceCents;
    }

    return f as MarketplaceFilters;
  }, [filters, clears]);

  const load = async () => {
    try {
      setLoading(true);
      setServices(await listActiveServicesWithArtist());
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const f: any = effectiveFilters ?? null;

    return services.filter((s) => {
      if (f?.service) {
        const svc = String(f.service).toLowerCase();
        if (!`${s.title} ${s.description ?? ""}`.toLowerCase().includes(svc)) return false;
      }

      if (typeof f?.minPriceCents === "number" && s.price_cents < f.minPriceCents) return false;
      if (typeof f?.maxPriceCents === "number" && s.price_cents > f.maxPriceCents) return false;

      if (f?.locationText) {
        const city = (s.artist?.city ?? "").toLowerCase();
        const needle = String(f.locationText).toLowerCase();
        if (needle && city && !city.includes(needle)) return false;
        if (needle && !city) return false;
      }

      if (typeof f?.minRating === "number") {
        if (fakeRating(s.id) < f.minRating) return false;
      }

      return true;
    });
  }, [services, effectiveFilters]);

  const chips = useMemo(() => {
    const f: any = effectiveFilters ?? null;

    const out: Array<{
      key: string;
      label: string;
      kind: "primary" | "outline";
      onClose: () => void;
    }> = [];

    if (f?.minPriceCents || f?.maxPriceCents) {
      const min = f.minPriceCents ? `$${(f.minPriceCents / 100).toFixed(0)}` : "";
      const max = f.maxPriceCents ? `$${(f.maxPriceCents / 100).toFixed(0)}` : "";
      const label = `Price ${min && max ? `${min}-${max}` : min ? `${min}+` : max ? `≤${max}` : ""}`.trim();

      out.push({
        key: "price",
        label,
        kind: "primary",
        onClose: () => setClears((p) => ({ ...p, price: true })),
      });
    }

    if (f?.service) {
      out.push({
        key: "service",
        label: String(f.service),
        kind: "outline",
        onClose: () => setClears((p) => ({ ...p, service: true })),
      });
    }

    const hasLoc = !!f?.locationText;
    const hasKm = typeof f?.maxDistanceKm === "number";

    if (hasLoc || hasKm) {
      const kmText = hasKm ? `Distance <${Math.round(Number(f.maxDistanceKm))}km` : "";
      const cityText = hasLoc ? compactCityLabel(f.locationText) : "";
      const label = [kmText || "Distance", cityText].filter(Boolean).join(" ");

      out.push({
        key: "location",
        label,
        kind: "outline",
        onClose: () => setClears((p) => ({ ...p, location: true })),
      });
    }

    if (typeof f?.minRating === "number") {
      out.push({
        key: "rating",
        label: String(f.minRating) >= "4.5" ? "Rating 4.5+" : `Rating ${Number(f.minRating).toFixed(1)}★`,
        kind: "outline",
        onClose: () => setClears((p) => ({ ...p, rating: true })),
      });
    }

    return out;
  }, [effectiveFilters]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <Text style={styles.title}>{titleFromFilters(effectiveFilters)}</Text>

        {!!chips.length && (
          <View style={styles.chipsWrap}>
            {chips.map((c) => {
              const isPrimary = c.kind === "primary";
              return (
                <Pressable
                  key={c.key}
                  onPress={onEditFilters}
                  style={[
                    styles.chip,
                    isPrimary ? styles.chipPrimary : styles.chipOutline,
                    { maxWidth: CHIP_MAX_W },
                  ]}
                >
                  <Text
                    style={[styles.chipText, isPrimary && styles.chipTextPrimary]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {c.label}
                  </Text>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      c.onClose();
                    }}
                    hitSlop={10}
                    style={styles.chipCloseBtn}
                  >
                    <Ionicons name="close" size={14} color={isPrimary ? WHITE : BLACK} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}


        {viewMode === "map" ? (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderTitle}>Map View</Text>
            <Text style={styles.mapPlaceholderText}>V2 soon to come</Text>
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {filtered.map((s: any) => {
              const rating = fakeRating(s.id);
              const displayName = s.artist?.display_name || s.artist?.username || "Artist";
              const pronouns = s.artist?.pronouns ? `(${s.artist.pronouns})` : "";
              const metaLine = bulletMetaFromService(s);

              const avatarUrl =
                s.artist?.avatar_url ||
                getAvatarUrl(displayName);


              // Price range (if you ever add ranges later, this will still render nicely)
              const priceText = formatPriceCAD(s.price_cents);

              return (
                <Pressable
                  key={s.id}
                  style={styles.card}
                  onPress={() => onOpenArtist(s.artist_id, s.id)}
                >
                  {/* LEFT IMAGE — full height */}
                  <View style={styles.cardImageWrap}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.cardImage} />
                    ) : (
                      <View style={styles.cardImageFallback} />
                    )}
                  </View>

                  {/* RIGHT CONTENT */}
                    <View style={styles.cardRight}>
                      <View style={styles.cardTopRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={styles.cardName} numberOfLines={1}>
                            {displayName}
                            {pronouns ? <Text style={styles.cardPronouns}> {pronouns}</Text> : null}
                          </Text>

                          {!!metaLine && (
                            <Text style={styles.cardMeta} numberOfLines={2}>
                              {metaLine}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* ✅ bottom row: price left, rating right */}
                      <View style={styles.cardBottomRow}>
                        <Text style={styles.cardPrice}>{priceText}</Text>

                        <View style={styles.cardRating}>
                          <Ionicons name="star" size={14} color={BLACK} />
                          <Text style={styles.cardRatingText}>{rating.toFixed(1)}</Text>
                        </View>
                      </View>
                    </View>
                </Pressable>
              );
            })}

            {!filtered.length && <Text style={styles.empty}>No results match your filters.</Text>}

            <View style={{ height: 110 }} />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const CARD_HEIGHT = 102;
const CARD_RADIUS = 22;
const IMAGE_W = 98;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },

  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  cardPrice: {
    fontSize: 13,
    fontWeight: "900",
    color: BLACK,
  },

  screen: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    color: BLACK,
    marginTop: 6,
    marginBottom: 10,
  },

  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 10,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 34,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  chipPrimary: { backgroundColor: BLACK, borderWidth: 1, borderColor: BLACK },
  chipOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: CHIP_BORDER },
  chipText: { fontWeight: "900", fontSize: 13, color: BLACK, flexShrink: 1 },
  chipTextPrimary: { color: WHITE },
  chipCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginTop: 4,
    marginBottom: 8,
  },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  toggleBtnActive: {},
  toggleText: {
    fontSize: 12,
    fontWeight: "800",
    color: MUTED_2,
    textDecorationLine: "underline",
    textDecorationColor: "rgba(0,0,0,0.25)",
  },
  toggleTextActive: {
    color: BLACK,
    textDecorationColor: "rgba(0,0,0,0.55)",
  },

  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
  },
  mapPlaceholderTitle: { fontSize: 18, fontWeight: "900", color: BLACK },
  mapPlaceholderText: { marginTop: 6, fontSize: 13, fontWeight: "700", color: MUTED },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { gap: 14, paddingTop: 10, paddingBottom: 10 },

  // ✅ CARD (matches your reference)
  card: {
    height: CARD_HEIGHT,
    backgroundColor: PINK_CARD,
    borderRadius: CARD_RADIUS,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },

  // left image spans full height
  cardImageWrap: {
    width: IMAGE_W,
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  cardImageFallback: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.10)",
  },

  // right content spacing
  cardRight: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 14,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: "space-between",
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  cardName: {
    fontSize: 15,
    fontWeight: "900",
    color: BLACK,
    lineHeight: 18,
  },
  cardPronouns: {
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(0,0,0,0.75)",
  },

  cardMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: MUTED,
    lineHeight: 16,
  },

  cardRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 0,
    paddingTop: 2,
  },
  cardRatingText: {
    fontSize: 12,
    fontWeight: "900",
    color: BLACK,
  },

  empty: {
    marginTop: 18,
    fontWeight: "800",
    color: "rgba(0,0,0,0.35)",
    textAlign: "center",
    fontSize: 18,
  },
});
