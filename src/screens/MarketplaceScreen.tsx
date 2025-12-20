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
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { supabase } from "../lib/supabase";
import { listActiveServicesWithArtist, MarketplaceService } from "../lib/services";
import { avatarPublicUrl } from "../lib/profile";
import type { MarketplaceFilters } from "./SearchScreen";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const PINK_CARD = "#F6D6D6";
const MUTED = "rgba(0,0,0,0.60)";
const BORDER = "rgba(0,0,0,0.08)";

const { width: SCREEN_W } = Dimensions.get("window");

function formatPriceCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function fakeRating(id: string) {
  return 3.5 + (hash(id) % 4) * 0.5;
}

function bulletMetaFromService(s: MarketplaceService) {
  const desc = (s.description ?? "").replace(/\n/g, " ").trim();
  const tokens = desc
    .split(/[,•|/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (tokens.length === 0) return s.title ?? "";
  return tokens.join(" • ");
}

// ✅ Haversine distance (km)
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);

  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
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
  onOpenArtist: (artistId: string, selectedServiceId?: string | null) => void;
  onOpenService: (serviceId: string) => void;
  filters?: MarketplaceFilters | null;
  onEditFilters?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const effectiveFilters = filters ?? null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setIsLoggedIn(!!s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  function titleFromFilters(f?: MarketplaceFilters | null) {
    if (!f) return "Discover Artists";
    const parts: string[] = [];
    if (f.service) parts.push(f.service);
    if (f.locationText) parts.push(f.locationText);
    return parts.length ? parts.join(" • ") : "Discover Artists";
  }

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
    const f: any = filters ?? null;

    return services.filter((s) => {
      // service text match
      if (f?.service) {
        const svc = String(f.service).toLowerCase();
        if (!`${s.title} ${s.description ?? ""}`.toLowerCase().includes(svc)) return false;
      }

      // price range
      if (typeof f?.minPriceCents === "number" && s.price_cents < f.minPriceCents) return false;
      if (typeof f?.maxPriceCents === "number" && s.price_cents > f.maxPriceCents) return false;

      // location text fallback (city substring)
      if (f?.locationText && !f?.locationCoords) {
        const city = (s.artist?.city_label ?? s.artist?.city ?? "").toLowerCase();
        const needle = String(f.locationText).toLowerCase();
        if (needle && city && !city.includes(needle)) return false;
        if (needle && !city) return false;
      }

      // rating (fake)
      if (typeof f?.minRating === "number") {
        if (fakeRating(s.id) < f.minRating) return false;
      }

      // ✅ distance filter when coords exist on both sides
      if (f?.locationCoords && typeof f?.maxDistanceKm === "number") {
        const aLat = s.artist?.city_lat ?? null;
        const aLng = s.artist?.city_lng ?? null;
        if (typeof aLat !== "number" || typeof aLng !== "number") return false;

        const km = distanceKm(
          { lat: f.locationCoords.lat, lng: f.locationCoords.lng },
          { lat: aLat, lng: aLng }
        );

        if (km > f.maxDistanceKm) return false;
      }

      return true;
    });
  }, [services, filters]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <Text style={styles.title}>{titleFromFilters(effectiveFilters)}</Text>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {filtered.map((s) => {
                const displayName = s.artist?.username ?? "Artist";
                const metaLine = bulletMetaFromService(s);
                const avatarUrl = avatarPublicUrl(s.artist?.avatar_url);

                // ✅ compute distance label (only when searching by coords)
                let distLabel: string | null = null;
                if (effectiveFilters?.locationCoords) {
                  const aLat = s.artist?.city_lat ?? null;
                  const aLng = s.artist?.city_lng ?? null;
                  if (typeof aLat === "number" && typeof aLng === "number") {
                    const km = distanceKm(
                      { lat: effectiveFilters.locationCoords.lat, lng: effectiveFilters.locationCoords.lng },
                      { lat: aLat, lng: aLng }
                    );
                    distLabel = `${Math.round(km)} km`;
                  }
                }

                return (
                  <Pressable key={s.id} style={styles.card} onPress={() => onOpenArtist(s.artist_id, s.id)}>
                    <View style={styles.cardImageWrap}>
                      {avatarUrl ? (
                        <ExpoImage
                          source={{ uri: `${avatarUrl}?v=${Date.now()}` }}
                          style={styles.cardImage}
                          contentFit="cover"
                          cachePolicy="disk"
                          transition={0}
                          placeholder={{ blurhash: "L5H2EC=PM+yV0g-mq.wG9c010J}I" }}
                        />
                      ) : (
                        <View style={styles.cardImageFallback} />
                      )}
                    </View>

                    <View style={styles.cardRight}>
                      <View style={styles.nameRow}>
                        <Text style={styles.cardName} numberOfLines={1}>
                          {displayName}
                        </Text>
                        {!!distLabel && <Text style={styles.dist}>{distLabel}</Text>}
                      </View>

                      {!!metaLine && (
                        <Text style={styles.cardMeta} numberOfLines={2}>
                          {metaLine}
                        </Text>
                      )}

                      <View style={styles.cardBottomRow}>
                        <Text style={styles.cardPrice}>{formatPriceCAD(s.price_cents)}</Text>
                        <View style={styles.cardRating}>
                          <Ionicons name="star" size={14} color={BLACK} />
                          <Text style={styles.cardRatingText}>{fakeRating(s.id).toFixed(1)}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {!filtered.length && <Text style={styles.empty}>No results match your filters.</Text>}

              <View style={{ height: 110 }} />
            </ScrollView>
          </>
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
  screen: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { gap: 14, paddingTop: 10, paddingBottom: 10 },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: BLACK,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  card: {
    height: CARD_HEIGHT,
    backgroundColor: "#F6D6D6",
    borderRadius: CARD_RADIUS,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },

  cardImageWrap: {
    width: IMAGE_W,
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  cardImage: { width: "100%", height: "100%" },
  cardImageFallback: { flex: 1, backgroundColor: "rgba(0,0,0,0.10)" },

  cardRight: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 14,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: "space-between",
  },

  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: BLACK,
  },

  dist: {
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(0,0,0,0.55)",
  },

  cardMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: MUTED,
  },

  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardPrice: { fontSize: 13, fontWeight: "900", color: BLACK },
  cardRating: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardRatingText: { fontSize: 12, fontWeight: "900", color: BLACK },

  empty: {
    marginTop: 18,
    fontWeight: "800",
    color: "rgba(0,0,0,0.35)",
    textAlign: "center",
    fontSize: 18,
  },
});
