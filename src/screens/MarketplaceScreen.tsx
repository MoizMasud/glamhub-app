// MarketplaceScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import { supabase } from "../lib/supabase";
import { listActiveServicesWithArtist, MarketplaceService } from "../lib/services";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MarketplaceScreen({
  onRequestSignIn,
  onOpenAccount,
  onOpenArtist,
  onOpenService,
}: {
  onRequestSignIn?: () => void;
  onOpenAccount: () => void;
  onOpenArtist: (artistId: string) => void;
  onOpenService: (serviceId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) =>
      [
        s.title,
        s.description,
        s.artist?.username,
        s.artist?.city,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [services, query]);

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.h1}>Marketplace</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={load} style={styles.pillBtn}>
              <Text style={styles.pillText}>Refresh</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                const { data } = await supabase.auth.getUser();
                if (!data.user) onRequestSignIn?.();
                else onOpenAccount();
              }}
              style={styles.pillBtn}
            >
              <Text style={styles.pillText}>Account</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          placeholder="Search services, artist, city…"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {filtered.map((s) => (
              <Pressable
                key={s.id}
                style={styles.card}
                onPress={() => onOpenService(s.id)}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.title}</Text>

                    <Pressable onPress={() => onOpenArtist(s.artist_id)}>
                      <Text style={styles.cardMeta}>
                        {s.artist?.username}
                        {s.artist?.city ? ` • ${s.artist.city}` : ""}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>
                      {formatPrice(s.price_cents)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  <Text style={styles.duration}>
                    {s.duration_minutes} min
                  </Text>

                  <View style={styles.bookBtn}>
                    <Text style={styles.bookText}>View details</Text>
                  </View>
                </View>
              </Pressable>
            ))}
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
  screen: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 26, fontWeight: "900", color: BLACK },
  pillBtn: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: { fontWeight: "900", color: BLACK },
  search: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 12,
    padding: 12,
  },
  list: { gap: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  cardTop: { flexDirection: "row", gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "900", color: BLACK },
  cardMeta: {
    marginTop: 4,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  pricePill: {
    backgroundColor: PINK,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  priceText: { fontWeight: "900" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between" },
  duration: {
    backgroundColor: PINK,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "900",
  },
  bookBtn: {
    backgroundColor: BLACK,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bookText: { color: OFF_WHITE, fontWeight: "900" },
});
