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
  if (svc) return `Filter ${svc}`;
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

  // ✅ REQUIRED FOR APP.TSX
  filters?: MarketplaceFilters | null;
  onEditFilters?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [clears, setClears] = useState<ClearFlags>({});

  // ✅ auth-aware header icon (login icon when logged out, burger when logged in)
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // initial check
    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });

    // keep in sync on login/logout
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
    if (clears.location) delete f.locationText;
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

    if (f?.locationText) {
      out.push({
        key: "location",
        label: `Distance • ${String(f.locationText)}`,
        kind: "outline",
        onClose: () => setClears((p) => ({ ...p, location: true })),
      });
    }

    if (typeof f?.minRating === "number") {
      out.push({
        key: "rating",
        label: `${Number(f.minRating).toFixed(1)}★+`,
        kind: "outline",
        onClose: () => setClears((p) => ({ ...p, rating: true })),
      });
    }

    return out;
  }, [effectiveFilters]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        {/* Header: back — logo — (login icon OR burger menu) */}
        <View style={styles.header}>
          <Pressable onPress={onEditFilters} style={styles.headerBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={BLACK} />
          </Pressable>

          <View style={styles.logoWrap}>
            <Image source={GH_WHITE} style={styles.logo} resizeMode="contain" />
          </View>

          <Pressable
            onPress={() => {
              if (!isLoggedIn) onRequestSignIn?.();
              else onOpenAccount();
            }}
            style={styles.headerBtn}
            hitSlop={10}
          >
            <Ionicons
              name={isLoggedIn ? "menu" : "person-circle-outline"}
              size={24}
              color={BLACK}
            />
          </Pressable>
        </View>

        <Text style={styles.title}>{titleFromFilters(effectiveFilters)}</Text>

        {/* ✅ Chips that WRAP (no overflow) */}
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
                    <Ionicons name="close" size={16} color={isPrimary ? OFF_WHITE : BLACK} />
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
                  {/* ✅ No Unsplash — clean initials avatar */}
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

            {/* prevents TabBar overlap */}
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

  // ✅ bigger logo like the screenshot (more prominent)
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

  // ✅ WRAPPING chips container (no horizontal overflow)
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 12,
    alignItems: "center",
  },

  // ✅ pill with internal close icon
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingLeft: 16,
    paddingRight: 10,
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
    fontSize: 14,
    color: BLACK,
    flexShrink: 1,
  },
  chipTextPrimary: {
    color: OFF_WHITE,
  },
  chipCloseBtn: {
    width: 30,
    height: 30,
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

  // ✅ initials avatar
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
