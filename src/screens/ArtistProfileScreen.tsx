// ArtistProfileScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Modal,
  Linking,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { supabase } from "../lib/supabase";
import { avatarPublicUrl } from "../lib/profile";
import {
  listArtistActiveServices,
  getServiceDetails,
  MarketplaceService,
  ServiceRow,
} from "../lib/services";
import { useAuth } from "../context/AuthContext";

const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

const MUTED = "rgba(0,0,0,0.60)";
const BORDER = "rgba(0,0,0,0.10)";
const SOFT = "rgba(0,0,0,0.04)";

function formatPriceShort(cents: number) {
  const dollars = cents / 100;
  const isWhole = Math.round(dollars) === dollars;
  return isWhole ? `$${Math.round(dollars)}` : `$${dollars.toFixed(2)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

type ConsultationType = "zoom" | "google_meet";

type ArtistProfileApi = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  phone?: string | null;

  consultation_enabled?: boolean | null;
  consultation_type?: ConsultationType | string | null;
  consultation_link?: string | null;

  pronouns?: string | null;
  rating?: number | null;
  bio?: string | null;
  tags?: string[] | null;
  specialties?: string[] | null;
  avatar_url?: string | null;
  city?: string | null;
  city_label?: string | null;
  city_lat?: number | null;
  city_lng?: number | null;
  role?: string | null;
};

type ArtistPublic = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  phone?: string | null;

  consultation_enabled?: boolean | null;
  consultation_type?: ConsultationType | string | null;
  consultation_link?: string | null;

  pronouns?: string | null;
  rating?: number | null;
  bio?: string | null;
  tags?: string[] | null;
  avatarUrl?: string | null;

  city?: string | null;
  city_label?: string | null;
  city_lat?: number | null;
  city_lng?: number | null;
};

export default function ArtistProfileScreen({
  artistId,
  onBack,
  onOpenBooking,
  onRequestSignIn,
}: {
  artistId: string;
  onBack: () => void;
  onOpenBooking: (args: { artistId: string; serviceIds: string[] }) => void;
  onRequestSignIn: () => void;
}) {
  const { profile: myProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState<ArtistPublic | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [isSelf, setIsSelf] = useState(false);
  const [avatarBust, setAvatarBust] = useState<number>(Date.now());

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [details, setDetails] = useState<MarketplaceService | null>(null);
  const detailsServiceIdRef = useRef<string | null>(null);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const canBook = selectedIds.length > 0;

  const toggleSelected = (serviceId: string) => {
    if (isSelf) return;
    setSelected((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
  };

  const openDetails = async (serviceId: string) => {
    detailsServiceIdRef.current = serviceId;
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError(null);
    setDetails(null);

    try {
      const s = await withTimeout(
        getServiceDetails(serviceId),
        12000,
        "Request timed out. Check your connection and try again."
      );
      if (detailsServiceIdRef.current !== serviceId) return;
      setDetails(s);
    } catch (e: any) {
      if (detailsServiceIdRef.current !== serviceId) return;
      setDetailsError(e?.message ?? "Failed to load service.");
    } finally {
      if (detailsServiceIdRef.current === serviceId) setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsLoading(false);
    setDetailsError(null);
    setDetails(null);
    detailsServiceIdRef.current = null;
  };

  const load = async () => {
    try {
      setLoading(true);
      setErrorText(null);

      const { data: authData } = await supabase.auth.getUser();
      const meId = authData?.user?.id ?? null;
      const self = !!meId && meId === artistId;
      setIsSelf(self);

      const bust = Date.now();
      setAvatarBust(bust);

      const profilePromise = (async () => {
        const res = await supabase
          .from("profiles")
          .select(
            "id, username, full_name, phone, consultation_enabled, consultation_type, consultation_link, bio, city, city_label, city_lat, city_lng, role, avatar_url"
          )
          .eq("id", artistId)
          .single();
        return res;
      })();

      const [pRes, s] = await Promise.all([
        withTimeout(profilePromise, 12000, "Request timed out. Try again."),
        withTimeout(listArtistActiveServices(artistId), 12000, "Request timed out. Try again."),
      ]);

      if (pRes.error) throw pRes.error;

      const a = (pRes.data as ArtistProfileApi) ?? null;

      const rawAvatar = self ? myProfile?.avatar_url ?? null : a?.avatar_url ?? null;
      const publicAvatar = rawAvatar ? avatarPublicUrl(rawAvatar) : "";
      const displayAvatar = publicAvatar ? `${publicAvatar}?v=${bust}` : "";

      if (displayAvatar) {
        await ExpoImage.prefetch(displayAvatar);
      }

      setArtist({
        id: artistId,
        username: a?.username ?? "Artist",
        full_name: a?.full_name ?? null,
        phone: a?.phone ?? null,

        consultation_enabled: !!a?.consultation_enabled,
        consultation_type: a?.consultation_type ?? "zoom",
        consultation_link: a?.consultation_link ?? null,

        pronouns: a?.pronouns ?? null,
        rating: a?.rating ?? null,
        bio: a?.bio ?? null,
        tags: a?.tags ?? a?.specialties ?? null,
        avatarUrl: publicAvatar || null,

        city: a?.city ?? null,
        city_label: a?.city_label ?? a?.city ?? null,
        city_lat: a?.city_lat ?? null,
        city_lng: a?.city_lng ?? null,
      });

      setServices(s ?? []);

      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        (s ?? []).forEach((row: any) => {
          const id = row?.id;
          if (id) next[id] = !!prev[id];
        });
        return next;
      });
    } catch (e: any) {
      setArtist(null);
      setServices([]);
      setErrorText(e?.message ?? "Failed to load artist.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, myProfile?.avatar_url]);

  const onPressBook = async () => {
    if (!canBook) return;

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      onRequestSignIn();
      return;
    }

    onOpenBooking({ artistId, serviceIds: selectedIds });
  };

  const displayName = artist?.full_name?.trim() || artist?.username?.trim() || "Artist";
  const cityText = (artist?.city_label ?? artist?.city ?? "").trim();

  const consultationLabel =
    artist?.consultation_type === "google_meet" ? "Consultation available (Google Meet)" : "Consultation available (Zoom)";

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.fullCenter}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const avatarDisplayUrl = artist?.avatarUrl ? `${artist.avatarUrl}?v=${avatarBust}` : "";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        {errorText ? (
          <View style={styles.fullCenter}>
            <Text style={styles.errTitle}>Couldn’t load profile</Text>
            <Text style={styles.errText}>{errorText}</Text>
            <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : !artist ? (
          <View style={styles.fullCenter}>
            <Text style={{ fontWeight: "900", color: BLACK }}>Artist not found</Text>
          </View>
        ) : (
          <>
            <View style={styles.topBar}>
              <Pressable onPress={onBack} style={styles.iconBtn} accessibilityRole="button">
                <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
              </Pressable>

              {!isSelf ? (
                <Pressable
                  onPress={onPressBook}
                  disabled={!canBook}
                  style={[styles.bookBtn, !canBook && { opacity: 0.45 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Book selected services"
                >
                  <Text style={styles.bookBtnText}>Book</Text>
                </Pressable>
              ) : (
                <View style={{ width: 36, height: 36 }} />
              )}
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 18 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.headerBlock}>
                <View style={styles.photoWrap}>
                  {avatarDisplayUrl ? (
                    <ExpoImage
                      key={avatarDisplayUrl}
                      source={{ uri: avatarDisplayUrl }}
                      style={styles.photo}
                      contentFit="cover"
                      cachePolicy="disk"
                      transition={0}
                    />
                  ) : (
                    <View style={[styles.photo, styles.photoFallback]}>
                      <Text style={styles.photoFallbackText}>
                        {(displayName?.trim()?.[0] ?? "G").toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.name}>{displayName}</Text>
                {!!cityText && <Text style={styles.city}>{cityText}</Text>}
              </View>

              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.about}>
                {artist.bio?.trim()
                  ? artist.bio
                  : "Professional stylist focused on modern looks, strong hygiene standards, and client comfort."}
              </Text>

              {!!artist.phone?.trim() && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Phone</Text>

                  <TouchableOpacity
                    onPress={() => {
                      if (!artist.phone) return;
                      Linking.openURL(`tel:${artist.phone}`);
                    }}
                    activeOpacity={0.6}
                    style={styles.consultLine}
                  >
                    <Ionicons name="call-outline" size={18} color={BLACK} />
                    <Text style={styles.infoText}>{artist.phone}</Text>
                  </TouchableOpacity>



                </>
              )}

              {/* ✅ Cleaner consultation display (no arrow, no click) */}
              {!!artist.consultation_enabled && (
                <View style={styles.consultLine}>
                  <Ionicons name="videocam-outline" size={18} color={"rgba(0,0,0,0.70)"} />
                  <Text style={styles.consultLineText}>{consultationLabel}</Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Services</Text>

              {services.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No services yet</Text>
                  <Text style={styles.emptySub}>This artist hasn’t listed services.</Text>
                </View>
              ) : (
                <View style={styles.servicesCard}>
                  {services.map((s: any, idx: number) => {
                    const isLast = idx === services.length - 1;
                    const isSel = !!selected[s.id];

                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => openDetails(s.id)}
                        style={[styles.serviceRow, !isLast && styles.serviceRowBorder]}
                        accessibilityRole="button"
                        accessibilityLabel="Open service details"
                      >
                        <View style={styles.serviceLeft}>
                          {!isSelf && (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                toggleSelected(s.id);
                              }}
                              hitSlop={8}
                              style={styles.checkboxHit}
                              accessibilityRole="button"
                              accessibilityLabel={isSel ? "Unselect service" : "Select service"}
                            >
                              <Ionicons
                                name={isSel ? "checkbox" : "square-outline"}
                                size={18}
                                color={"rgba(0,0,0,0.75)"}
                              />
                            </Pressable>
                          )}

                          <Text numberOfLines={1} style={styles.serviceName}>
                            {s.title}
                          </Text>
                        </View>

                        <View style={styles.serviceRight}>
                          <Text style={styles.servicePrice}>{formatPriceShort(s.price_cents)}</Text>
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={"rgba(0,0,0,0.55)"}
                            style={{ marginLeft: 8 }}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>

      <Modal visible={detailsOpen} transparent animationType="fade" onRequestClose={closeDetails}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Details</Text>
              <Pressable onPress={closeDetails} style={styles.modalCloseBtn} accessibilityRole="button">
                <Ionicons name="close" size={18} color={BLACK} />
              </Pressable>
            </View>

            {detailsLoading ? (
              <View style={[styles.fullCenter, { paddingVertical: 18 }]}>
                <ActivityIndicator />
                <Text style={{ marginTop: 10, color: MUTED, fontWeight: "700" }}>Loading…</Text>
              </View>
            ) : detailsError ? (
              <View style={{ paddingVertical: 12, gap: 10 }}>
                <Text style={{ fontWeight: "900", color: BLACK }}>Couldn’t load service</Text>
                <Text style={{ color: MUTED, fontWeight: "700" }}>{detailsError}</Text>

                {!!detailsServiceIdRef.current && (
                  <Pressable onPress={() => openDetails(detailsServiceIdRef.current as string)} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                )}
              </View>
            ) : !details ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: MUTED, fontWeight: "700" }}>No details.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.detailsName}>{details.title}</Text>

                <View style={styles.detailsRow}>
                  <View style={styles.detailsChip}>
                    <Text style={styles.detailsChipText}>{formatPriceShort(details.price_cents)}</Text>
                  </View>
                  <View style={styles.detailsChip}>
                    <Text style={styles.detailsChipText}>{details.duration_minutes} min</Text>
                  </View>
                </View>

                <Text style={styles.detailsDesc}>
                  {details.description?.trim() ? details.description : "No description yet."}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PINK,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    marginBottom: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  bookBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  bookBtnText: { fontWeight: "900", color: "rgba(0,0,0,0.75)" },

  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerBlock: { alignItems: "center", paddingTop: 8, paddingBottom: 10 },

  photoWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  photo: { width: "100%", height: "100%" },
  photoFallback: { alignItems: "center", justifyContent: "center", backgroundColor: OFF_WHITE },
  photoFallbackText: { fontSize: 30, fontWeight: "900", color: "rgba(0,0,0,0.70)" },

  name: { marginTop: 10, fontSize: 22, fontWeight: "900", color: BLACK },
  city: { marginTop: 4, color: "rgba(0,0,0,0.65)", fontWeight: "800" },

  sectionTitle: { marginTop: 10, fontSize: 18, fontWeight: "900", color: BLACK },
  about: { marginTop: 8, color: "rgba(0,0,0,0.65)", fontWeight: "700", lineHeight: 18 },

  infoCard: {
    marginTop: 10,
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: { fontWeight: "900", color: "rgba(0,0,0,0.78)" },

  // ✅ simple consultation line
  consultLine: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  consultLineText: { color: "rgba(0,0,0,0.72)", fontWeight: "900" },

  servicesCard: {
    marginTop: 10,
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },
  serviceRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  serviceRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },

  serviceLeft: { flex: 1, flexDirection: "row", alignItems: "center", paddingRight: 12 },
  checkboxHit: { marginRight: 10, alignItems: "center", justifyContent: "center" },

  serviceName: { flex: 1, fontSize: 14, fontWeight: "900", color: BLACK },
  serviceRight: { flexDirection: "row", alignItems: "center" },
  servicePrice: { fontSize: 14, fontWeight: "900", color: "rgba(0,0,0,0.78)" },

  emptyCard: {
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: SOFT,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: { fontWeight: "900", color: BLACK },
  emptySub: { marginTop: 6, fontWeight: "700", color: MUTED },

  errTitle: { fontSize: 16, fontWeight: "900", color: BLACK },
  errText: { marginTop: 8, color: MUTED, textAlign: "center", fontWeight: "700" },
  retryBtn: { marginTop: 12, backgroundColor: BLACK, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: OFF_WHITE, fontWeight: "900" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", padding: 18, justifyContent: "center" },
  modalCard: { backgroundColor: OFF_WHITE, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: BORDER },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: "900", color: BLACK },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.05)" },

  detailsName: { fontSize: 16, fontWeight: "900", color: BLACK, marginTop: 2 },
  detailsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  detailsChip: { backgroundColor: SOFT, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: BORDER },
  detailsChipText: { fontWeight: "900", color: BLACK },
  detailsDesc: { marginTop: 10, color: MUTED, fontWeight: "700", lineHeight: 18 },
});
