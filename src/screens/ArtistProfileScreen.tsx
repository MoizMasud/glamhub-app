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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { getArtistPublicProfile } from "../lib/profile";
import {
  listArtistActiveServices,
  getServiceDetails,
  MarketplaceService,
  ServiceRow,
} from "../lib/services";

// ✅ GlamHub palette
const PINK = "#f6d6d6";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

const MUTED = "rgba(0,0,0,0.60)";
const BORDER = "rgba(0,0,0,0.10)";
const SOFT = "rgba(0,0,0,0.04)";
const PILL_BG = "rgba(255,255,255,0.45)";

// Price formatting: $80 (not $80.00) when whole dollars
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

type ArtistProfileApi = {
  username?: string | null;
  display_name?: string | null;
  name?: string | null;
  pronouns?: string | null;
  rating?: number | null;
  bio?: string | null;
  tags?: string[] | null;
  specialties?: string[] | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  image_url?: string | null;
};

type ArtistPublic = {
  id: string;
  username?: string | null;
  pronouns?: string | null;
  rating?: number | null;
  bio?: string | null;
  tags?: string[] | null;
  avatarUrl?: string | null;
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
  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState<ArtistPublic | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  // ✅ detect if this profile belongs to the logged-in user
  const [isSelf, setIsSelf] = useState(false);

  // ✅ service selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // ✅ details popup
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [details, setDetails] = useState<MarketplaceService | null>(null);
  const detailsServiceIdRef = useRef<string | null>(null);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );
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

      // ✅ auth check first (so isSelf is correct before we render anything)
      const { data: authData } = await supabase.auth.getUser();
      const meId = authData?.user?.id ?? null;
      const self = !!meId && meId === artistId;
      setIsSelf(self);

      const [aRaw, s] = await Promise.all([
        withTimeout(getArtistPublicProfile(artistId), 12000, "Request timed out. Try again."),
        withTimeout(listArtistActiveServices(artistId), 12000, "Request timed out. Try again."),
      ]);

      const a = (aRaw as ArtistProfileApi | null) ?? null;
      const avatarUrl = a?.avatar_url ?? a?.photo_url ?? a?.image_url ?? null;

      setArtist({
        id: artistId,
        username: a?.username ?? a?.display_name ?? a?.name ?? "Artist",
        pronouns: a?.pronouns ?? null,
        rating: a?.rating ?? null,
        bio: a?.bio ?? null,
        tags: a?.tags ?? a?.specialties ?? null,
        avatarUrl,
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);

  const onPressBook = async () => {
    if (!canBook) return;

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      onRequestSignIn();
      return;
    }

    onOpenBooking({ artistId, serviceIds: selectedIds });
  };

  const headerName = artist?.username ?? "Artist";
  const pronouns = artist?.pronouns ? `(${artist.pronouns})` : "";
  const rating = artist?.rating != null ? Number(artist.rating).toFixed(1) : null;

  // ✅ KEY FIX: render NOTHING of the page until ready (prevents Book button flash)
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.fullCenter}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

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
            {/* Top bar */}
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
              {/* Header block */}
              <View style={styles.headerBlock}>
                <View style={styles.photoWrap}>
                  {artist.avatarUrl ? (
                    <Image source={{ uri: artist.avatarUrl }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoFallback]}>
                      <Text style={styles.photoFallbackText}>
                        {(headerName?.trim()?.[0] ?? "G").toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.name}>{headerName}</Text>

                <View style={styles.metaRow}>
                  {!!pronouns && <Text style={styles.metaText}>{pronouns}</Text>}
                  {rating && (
                    <View style={styles.ratingRow}>
                      <Text style={styles.metaText}>{rating}</Text>
                      <Text style={styles.star}>★</Text>
                    </View>
                  )}
                </View>

                {(artist.tags ?? []).length > 0 && (
                  <View style={styles.pillsWrap}>
                    {(artist.tags ?? []).slice(0, 6).map((t, idx) => (
                      <View key={`${t}-${idx}`} style={styles.pill}>
                        <Text style={styles.pillText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* About */}
              <Text style={styles.sectionTitle}>About Me</Text>
              <Text style={styles.about}>
                {artist.bio?.trim()
                  ? artist.bio
                  : "Professional stylist focused on soft glam, textured hair, and personalized beauty services. I prioritize comfort, inclusivity, and results that feel authentically you."}
              </Text>

              {/* Services */}
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

      {/* Service Details Popup */}
      <Modal visible={detailsOpen} transparent animationType="fade" onRequestClose={closeDetails}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Details</Text>
              <Pressable
                onPress={closeDetails}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
              >
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
                  <Pressable
                    onPress={() => openDetails(detailsServiceIdRef.current as string)}
                    style={styles.retryBtn}
                  >
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
                    <Text style={styles.detailsChipText}>
                      {formatPriceShort(details.price_cents)}
                    </Text>
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
  bookBtnText: {
    fontWeight: "900",
    color: "rgba(0,0,0,0.75)",
  },

  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerBlock: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 10,
  },

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
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: OFF_WHITE,
  },
  photoFallbackText: {
    fontSize: 30,
    fontWeight: "900",
    color: "rgba(0,0,0,0.70)",
  },

  name: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "900",
    color: BLACK,
  },

  metaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaText: { color: "rgba(0,0,0,0.65)", fontWeight: "700" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  star: { color: "rgba(0,0,0,0.65)", fontWeight: "900" },

  pillsWrap: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  pill: {
    backgroundColor: PILL_BG,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  pillText: { color: "rgba(0,0,0,0.70)", fontWeight: "800", fontSize: 12 },

  sectionTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "900",
    color: BLACK,
  },
  about: {
    marginTop: 8,
    color: "rgba(0,0,0,0.65)",
    fontWeight: "700",
    lineHeight: 18,
  },

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
  serviceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },

  serviceLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  checkboxHit: {
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  serviceName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    color: BLACK,
  },

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
  retryBtn: {
    marginTop: 12,
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryText: { color: OFF_WHITE, fontWeight: "900" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    padding: 18,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: "900", color: BLACK },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  detailsName: { fontSize: 16, fontWeight: "900", color: BLACK, marginTop: 2 },
  detailsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  detailsChip: {
    backgroundColor: SOFT,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  detailsChipText: { fontWeight: "900", color: BLACK },

  detailsDesc: { marginTop: 10, color: MUTED, fontWeight: "700", lineHeight: 18 },
});

