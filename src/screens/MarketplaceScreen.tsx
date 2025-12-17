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
const OFF_WHITE = "#FFFFEF";
const MUTED = "rgba(0,0,0,0.55)";
const BORDER = "rgba(0,0,0,0.10)";
const AVATAR_BG = "rgba(0,0,0,0.06)";

const GH_WHITE = require("../../assets/gh-white.png");

const { width: SCREEN_W } = Dimensions.get("window");
const CHIP_MAX_W = Math.min(240, Math.floor(SCREEN_W * 0.62)); // keeps pills from overflowing

function formatPrice(cents: number) {
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

function compactMeta(s: MarketplaceService) {
  const base = s.title?.trim() ? [s.title.trim()] : [];
  const desc = (s.description ?? "").trim();
  if (!desc) return base.join(" • ");

  const tokens = desc
    .replace(/\n/g, " ")
    .split(/[,•|/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  return [...base, ...tokens].join(" • ");
}

function getInitials(name?: string | null) {
  const n = (name ?? "").trim();
  if (!n) return "GH";
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = (parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1]) ?? "";
  const out = `${first}${second}`.toUpperCase();
  return out || "GH";
}

// ✅ NEW: make location pill show only "City" (not full address string)
function compactCityLabel(raw?: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // remove our "Near " prefix if present
  const noNear = s.replace(/^near\s+/i, "").trim();
  // if it has commas, take the first chunk ("Toronto" from "Toronto, Ontario, Canada")
  const first = noNear.split(",")[0]?.trim() ?? "";
  // if it still looks long, fall back to first 2 words max
  if (first.length <= 20) return first || noNear;
  const words = noNear.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ");
}

type ClearFlags = {
  service?: boolean;
  price?: boolean;
  location?: boolean;
  rating?: boolean;
};

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
  onOpenArtist: (artistId: string) => void;
  onOpenService: (serviceId: string) => void;

  filters?: MarketplaceFilters | null;
  onEditFilters?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [clears, setClears] = useState<ClearFlags>({});

  // auth-aware header icon (login icon when logged out, burger when logged in)
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // if parent filters change, reset local “closed chips”
  useEffect(() => {
    setClears({});
  }, [filters]);

  const effectiveFilters = useMemo(() => {
    const f: any = { ...(filters ?? {}) };

    if (clears.service) delete f.service;

    // ✅ clear distance/location properly
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

    // ✅ Location chip: only show city + distance (if present)
    const hasLoc = !!f?.locationText;
    const hasKm = typeof f?.maxDistanceKm === "number";

    if (hasLoc || hasKm) {
      const kmText = hasKm ? `${Math.round(Number(f.maxDistanceKm))} km` : "";
      const cityText = hasLoc ? compactCityLabel(f.locationText) : "";

      // if both exist -> "15 km • Toronto"
      // if only city -> "Toronto"
      // if only km -> "15 km"
      const label = [kmText, cityText].filter(Boolean).join(" • ");

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
        label: `Rating ${Number(f.minRating).toFixed(1)}★`,
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
                    <Ionicons name="close" size={14} color={isPrimary ? OFF_WHITE : BLACK} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {filtered.map((s) => {
              const rating = fakeRating(s.id);
              const displayName = s.artist?.username ?? "Artist";
              const initials = getInitials(displayName);

              return (
                <Pressable key={s.id} style={styles.card} onPress={() => onOpenService(s.id)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.cardBody}>
                    <Pressable onPress={() => onOpenArtist(s.artist_id)}>
                      <Text style={styles.name} numberOfLines={1}>
                        {displayName}
                      </Text>
                    </Pressable>

                    <Text style={styles.meta} numberOfLines={2}>
                      {compactMeta(s)}
                      {s.artist?.city ? ` • ${s.artist.city}` : ""}
                    </Text>

                    <Text style={styles.price}>{formatPrice(s.price_cents)}</Text>
                  </View>

                  <View style={styles.rating}>
                    <Ionicons name="star" size={14} color={BLACK} />
                    <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  screen: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },

  logoWrap: {
    height: 56,
    width: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 44,
    width: 210,
  },

  title: {
    fontSize: 18,
    fontWeight: "900",
    color: BLACK,
    marginTop: 6,
    marginBottom: 10,
  },

  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 12,
    alignItems: "center",
  },

  // ✅ smaller pills
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  chipPrimary: {
    backgroundColor: BLACK,
    borderWidth: 1,
    borderColor: BLACK,
  },
  chipOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: BLACK,
  },
  chipText: {
    fontWeight: "900",
    fontSize: 13,
    color: BLACK,
    flexShrink: 1,
  },
  chipTextPrimary: {
    color: OFF_WHITE,
  },
  // ✅ smaller close target (still easy to tap)
  chipCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  list: { gap: 10, paddingTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  avatar: {
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: AVATAR_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "900",
    color: "rgba(0,0,0,0.75)",
    letterSpacing: 0.5,
  },

  cardBody: { flex: 1 },

  name: { fontSize: 13, fontWeight: "900", color: BLACK },
  meta: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    marginTop: 2,
  },
  price: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "900",
    color: BLACK,
  },

  rating: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    width: 44,
  },
  ratingText: { fontWeight: "900", fontSize: 11, color: BLACK },

  empty: {
    marginTop: 18,
    fontWeight: "800",
    color: "rgba(0,0,0,0.35)",
    textAlign: "center",
    fontSize: 18,
  },
});
