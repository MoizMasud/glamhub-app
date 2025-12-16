import React, { useEffect, useState } from "react";
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
} from "react-native";
import { getArtistPublicProfile } from "../lib/profile";
import { listArtistActiveServices, ServiceRow } from "../lib/services";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ArtistProfileScreen({
  artistId,
  onBack,
  onOpenService,
}: {
  artistId: string;
  onBack: () => void;
  onOpenService: (serviceId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState<any>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      setArtist(await getArtistPublicProfile(artistId));
      setServices(await listArtistActiveServices(artistId));
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [artistId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.pillBtn}>
            <Text style={styles.pillText}>Back</Text>
          </Pressable>

          <Pressable onPress={load} style={styles.pillBtn}>
            <Text style={styles.pillText}>Refresh</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: BLACK }}>Loading…</Text>
          </View>
        ) : !artist ? (
          <View style={styles.center}>
            <Text style={{ fontWeight: "900", color: BLACK }}>Artist not found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <View style={styles.hero}>
              <Text style={styles.name}>{artist.username || "Artist"}</Text>
              <Text style={styles.meta}>{artist.city || "City not set"}</Text>
              <Text style={styles.bio}>
                {artist.bio || "No bio yet."}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Services</Text>

            {services.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontWeight: "900", color: BLACK }}>
                  No services listed yet
                </Text>
              </View>
            ) : (
              services.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.card}
                  onPress={() => onOpenService(s.id)}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{s.title}</Text>
                      {!!s.description && (
                        <Text style={styles.desc}>{s.description}</Text>
                      )}
                    </View>

                    <View style={styles.pricePill}>
                      <Text style={styles.priceText}>
                        {formatPrice(s.price_cents)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardBottom}>
                    <Text style={styles.duration}>{s.duration_minutes} min</Text>

                    <Pressable
                      onPress={() => onOpenService(s.id)}
                      style={styles.bookBtn}
                    >
                      <Text style={styles.bookText}>Book</Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
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
  screen: { flex: 1, padding: 16 },
  topRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  pillBtn: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: { fontWeight: "900", color: BLACK },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  hero: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 16,
    padding: 14,
    backgroundColor: PINK,
    gap: 6,
  },
  name: { fontSize: 28, fontWeight: "900", color: BLACK },
  meta: { fontWeight: "800", color: BLACK, opacity: 0.85 },
  bio: { color: BLACK },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  empty: {
    padding: 16,
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 16,
    alignItems: "center",
  },

  card: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    backgroundColor: OFF_WHITE,
  },
  cardTop: { flexDirection: "row", gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "900", color: BLACK },
  desc: { marginTop: 6, color: BLACK, opacity: 0.85 },
  pricePill: {
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priceText: { fontWeight: "900", color: BLACK },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  duration: {
    backgroundColor: PINK,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: "900",
    color: BLACK,
  },
  bookBtn: {
    backgroundColor: BLACK,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bookText: { color: OFF_WHITE, fontWeight: "900" },
});
