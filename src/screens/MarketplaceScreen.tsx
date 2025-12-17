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
const MUTED_2 = "rgba(0,0,0,0.45)";
const CHIP_BORDER = "rgba(0,0,0,0.14)";
const BORDER = "rgba(0,0,0,0.08)";

const { width: SCREEN_W } = Dimensions.get("window");
const CHIP_MAX_W = Math.min(240, Math.floor(SCREEN_W * 0.62));

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
  const [clears, setClears] = useState<ClearFlags>({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ✅ FIX: define effectiveFilters so title works
  const effectiveFilters = filters ?? null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setIsLoggedIn(!!s?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function titleFromFilters(filters?: MarketplaceFilters | null) {
    if (!filters) return "Discover Artists";

    const parts: string[] = [];

    if (filters.service) parts.push(filters.service);
    if (filters.locationText) parts.push(filters.locationText);
    if (filters.minPriceCents || filters.maxPriceCents) parts.push("Services");

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

                return (
                  <Pressable
                    key={s.id}
                    style={styles.card}
                    onPress={() => onOpenArtist(s.artist_id, s.id)}
                  >
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
                      <Text style={styles.cardName} numberOfLines={1}>
                        {displayName}
                      </Text>

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

  card: {
    height: CARD_HEIGHT,
    backgroundColor: PINK_CARD,
    borderRadius: CARD_RADIUS,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: BLACK,
    marginBottom: 10,
    paddingHorizontal: 4,
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

  cardName: {
    fontSize: 15,
    fontWeight: "900",
    color: BLACK,
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
