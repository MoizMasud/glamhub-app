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
  Image,
} from "react-native";
import { getArtistPublicProfile } from "../lib/profile";
import { listArtistActiveServices, ServiceRow } from "../lib/services";
import { Ionicons } from "@expo/vector-icons";

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";
const MUTED = "rgba(0,0,0,0.6)";

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
      <ScrollView contentContainerStyle={styles.container}>
        {/* Back */}
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
        </Pressable>


        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !artist ? (
          <View style={styles.center}>
            <Text style={{ fontWeight: "800" }}>Artist not found</Text>
          </View>
        ) : (
          <>
            {/* Avatar */}
            <View style={styles.avatarWrap}>
              {artist.avatar_url ? (
                <Image
                  source={{ uri: artist.avatar_url }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {(artist.username || "A")[0]}
                  </Text>
                </View>
              )}
            </View>

            {/* Name + meta */}
            <Text style={styles.name}>
              {artist.display_name || artist.username || "Artist"}
            </Text>

            <Text style={styles.meta}>
              (she/her) • {artist.rating ?? "4.5"} ★
            </Text>

            {/* Tags */}
            <View style={styles.tags}>
              {!!artist.specialties?.length ? (
                artist.specialties.map((t: string) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))
              ) : (
                <>
                  <View style={styles.tag}><Text style={styles.tagText}>Curly-Hair Specialist</Text></View>
                  <View style={styles.tag}><Text style={styles.tagText}>Student Discount</Text></View>
                  <View style={styles.tag}><Text style={styles.tagText}>Queer Inclusive</Text></View>
                </>
              )}
            </View>

            {/* About */}
            <Text style={styles.sectionTitle}>About Me</Text>
            <Text style={styles.about}>
              {artist.bio ||
                "Professional stylist focused on soft glam, textured hair, and personalized beauty services. I prioritize comfort, inclusivity, and results that feel authentically you."}
            </Text>

            {/* Services */}
            <Text style={styles.sectionTitle}>Services</Text>

            {services.length === 0 ? (
              <Text style={styles.empty}>No services listed yet</Text>
            ) : (
              <View style={styles.services}>
                {services.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => onOpenService(s.id)}
                    style={styles.serviceRow}
                  >
                    <Text style={styles.serviceTitle}>{s.title}</Text>
                    <Text style={styles.price}>
                      {formatPrice(s.price_cents)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PINK,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  backText: {
    fontWeight: "700",
    color: BLACK,
  },
  center: {
    marginTop: 80,
    alignItems: "center",
  },

  avatarWrap: {
    alignItems: "center",
    marginTop: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: OFF_WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: "800",
    color: BLACK,
  },

  name: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 12,
    color: BLACK,
  },
  meta: {
    textAlign: "center",
    marginTop: 4,
    color: MUTED,
    fontWeight: "600",
  },

  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  tag: {
    backgroundColor: OFF_WHITE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    color: BLACK,
  },

  sectionTitle: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "800",
    color: BLACK,
  },
  about: {
    color: BLACK,
    lineHeight: 20,
  },

  services: {
    marginTop: 4,
    gap: 12,
  },
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: OFF_WHITE,
    padding: 14,
    borderRadius: 14,
  },
  serviceTitle: {
    fontWeight: "700",
    color: BLACK,
  },
  price: {
    fontWeight: "700",
    color: BLACK,
  },

  empty: {
    color: MUTED,
    marginTop: 8,
  },
});
