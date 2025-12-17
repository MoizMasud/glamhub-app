import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { supabase } from "../lib/supabase";
import { getMyProfile, setMyRole, updateMyProfile } from "../lib/profile";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../context/AuthContext";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

const MUTED = "rgba(0,0,0,0.60)";
const BORDER = "rgba(0,0,0,0.12)";
const AVATAR_BUCKET = "avatars";

type MyProfile = {
  id: string;
  role?: "client" | "artist" | string | null;
  username?: string | null;
  city?: string | null;
  bio?: string | null;
  avatar_url?: string | null; // store STORAGE PATH (e.g. uid/avatar_123.jpg) OR legacy URL
  email?: string | null;
};

type ServiceRow = {
  id: string;
  title: string;
  price_cents: number;
  duration_minutes: number;
  description: string | null;
  is_active: boolean;
};

function centsFromDollarsText(input: string) {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function dollarsFromCents(cents: number) {
  return (cents / 100).toFixed(0);
}

function extFromUri(uri: string) {
  const m = uri.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] ?? "jpg").toLowerCase();
}

function contentTypeFromExt(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "image/jpeg";
}

export default function EditProfileScreen({ onBack }: { onBack: () => void }) {
  const { refreshProfile } = useAuth(); // ✅ added

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<MyProfile | null>(null);

  // Profile fields
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");

  // Avatar:
  // - avatarPath = what we store in DB (public bucket path OR legacy full URL)
  // - avatarUrl  = what we show (public url)
  const [avatarPath, setAvatarPath] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Image upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Artist toggle (only shown if user is not already an artist)
  const isArtist = useMemo(() => (profile?.role ?? "client") === "artist", [profile?.role]);
  const [artistMode, setArtistMode] = useState(false);

  // Services
  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState<ServiceRow[]>([]);

  // Service editor modal
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [sTitle, setSTitle] = useState("");
  const [sPrice, setSPrice] = useState("");
  const [sDuration, setSDuration] = useState("60");
  const [sDesc, setSDesc] = useState("");
  const [sActive, setSActive] = useState(true);

  const effectiveArtist = isArtist || artistMode;

  // Convert stored DB value -> displayable URL (PUBLIC BUCKET)
  const toDisplayAvatarUrl = async (stored: string | null | undefined) => {
    const val = (stored ?? "").trim();
    if (!val) return "";

    // Legacy full URL already stored
    if (val.startsWith("http://") || val.startsWith("https://")) {
      return `${val}${val.includes("?") ? "&" : "?"}v=${Date.now()}`;
    }

    // Public bucket → simple public URL
    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(val);
    return `${data.publicUrl}?v=${Date.now()}`;
  };

  const loadServices = async (artistId: string) => {
    try {
      setServicesLoading(true);
      const { data, error } = await supabase
        .from("services")
        .select("id,title,price_cents,duration_minutes,description,is_active")
        .eq("artist_id", artistId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setServices((data as any) ?? []);
    } catch {
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const p = (await getMyProfile()) as MyProfile;

      setProfile(p);
      setUsername(p.username ?? "");
      setCity(p.city ?? "");
      setBio(p.bio ?? "");

      const stored = (p.avatar_url ?? "").trim();
      setAvatarPath(stored);

      if (stored) {
        const display = await toDisplayAvatarUrl(stored);
        setAvatarUrl(display);
      } else {
        setAvatarUrl("");
      }

      setArtistMode(false);
      await loadServices(p.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfileOnly = async () => {
    await updateMyProfile({
      username: username.trim() || null,
      city: city.trim() || null,
      bio: bio.trim() || null,
      // ✅ store PATH (or legacy URL)
      avatar_url: avatarPath.trim() || null,
    });
  };

  const onSave = async () => {
    try {
      setSaving(true);

      if (!username.trim()) {
        Alert.alert("Missing username", "Please enter a username (e.g. glamByMazzy).");
        return;
      }
      if (!city.trim()) {
        Alert.alert("Missing city", "Please enter your city.");
        return;
      }

      await saveProfileOnly();

      if (!isArtist && artistMode) {
        await setMyRole("artist");
        setProfile((prev) => (prev ? { ...prev, role: "artist" } : prev));
        setArtistMode(false);
      }

      // ✅ refresh global profile so avatar/username updates across app
      await refreshProfile();

      onBack();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const probeImageUrl = async (url: string) => {
    try {
      const r = await fetch(url, { method: "GET" });
      const ct = r.headers.get("content-type") || "";
      const len = r.headers.get("content-length") || "";
      const statusLine = `HTTP ${r.status} ${r.statusText}`;
      const head = `${statusLine}\nct=${ct}\nlen=${len}\nurl=${url}`;

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return `${head}\n\nbody:\n${body}`;
      }

      return head;
    } catch (e: any) {
      return `FETCH_FAILED: ${e?.message ?? "network error"}\nurl=${url}`;
    }
  };

  const pickAndUploadAvatar = async () => {
    try {
      setUploadingAvatar(true);

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        throw new Error("MEDIA_PERMISSION_DENIED: User did not grant photo library access.");
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) throw new Error("IMAGE_URI_MISSING: Image picker returned no URI.");

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(`AUTH_ERROR: ${authErr.message}`);

      const uid = authData.user?.id;
      if (!uid) throw new Error("AUTH_MISSING_USER: No authenticated user found.");

      // ✅ Read local file as bytes (fixes 0-byte uploads in RN)
      const fileRes = await fetch(uri);
      if (!fileRes.ok) throw new Error(`FILE_READ_ERROR: fetch(uri) failed (${fileRes.status}).`);

      const arrayBuffer = await fileRes.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("FILE_EMPTY: arrayBuffer.byteLength is 0 (image read failed).");
      }

      const bytes = new Uint8Array(arrayBuffer);

      const ext = extFromUri(uri);
      const contentType = contentTypeFromExt(ext);

      const path = `${uid}/avatar_${Date.now()}.${ext}`;

      // ✅ Upload bytes instead of blob
      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
        contentType,
        upsert: true,
      });

      if (upErr) throw new Error(`STORAGE_UPLOAD_FAILED: ${upErr.message}`);

      // ✅ Save path in profile
      await updateMyProfile({ avatar_url: path });

      // ✅ Public URL (bucket is public)
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error("PUBLIC_URL_MISSING: Supabase did not return a public URL.");

      // ✅ Optional: quick sanity check to ensure it's not 0 bytes again
      const test = await fetch(publicUrl, { method: "GET" });
      const len = test.headers.get("content-length") || "";
      if (!test.ok) throw new Error(`PUBLIC_URL_HTTP_ERROR: ${test.status}`);
      if (len === "0") throw new Error("PUBLIC_URL_ZERO_BYTES: Uploaded object is still 0 bytes.");

      const displayUrl = `${publicUrl}?v=${Date.now()}`;

      setAvatarPath(path);
      setAvatarUrl(displayUrl);
      setProfile((prev) => (prev ? { ...prev, avatar_url: path } : prev));

      // ✅ refresh global profile so avatar updates everywhere immediately
      await refreshProfile();
    } catch (e: any) {
      console.error("[Avatar Upload Error]", e);
      Alert.alert("Upload failed", e?.message ?? "Could not upload image.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openAddService = () => {
    setEditingServiceId(null);
    setSTitle("");
    setSPrice("");
    setSDuration("60");
    setSDesc("");
    setSActive(true);
    setServiceModalOpen(true);
  };

  const openEditService = (s: ServiceRow) => {
    setEditingServiceId(s.id);
    setSTitle(s.title ?? "");
    setSPrice(dollarsFromCents(s.price_cents ?? 0));
    setSDuration(String(s.duration_minutes ?? 60));
    setSDesc(s.description ?? "");
    setSActive(!!s.is_active);
    setServiceModalOpen(true);
  };

  const saveService = async () => {
    if (!profile?.id) return;

    const title = sTitle.trim();
    const price_cents = centsFromDollarsText(sPrice);
    const duration_minutes = Math.max(5, Number(sDuration || 0) || 60);
    const description = sDesc.trim() || null;

    if (!title) {
      Alert.alert("Missing title", "Add a service name (e.g. Soft Glam Makeup).");
      return;
    }
    if (price_cents <= 0) {
      Alert.alert("Invalid price", "Enter a price greater than $0.");
      return;
    }

    try {
      setSaving(true);

      if (editingServiceId) {
        const { error } = await supabase
          .from("services")
          .update({
            title,
            price_cents,
            duration_minutes,
            description,
            is_active: sActive,
          })
          .eq("id", editingServiceId)
          .eq("artist_id", profile.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert({
          artist_id: profile.id,
          title,
          price_cents,
          duration_minutes,
          description,
          is_active: sActive,
        });

        if (error) throw error;
      }

      setServiceModalOpen(false);
      await loadServices(profile.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save service.");
    } finally {
      setSaving(false);
    }
  };

  const toggleServiceActive = async (s: ServiceRow) => {
    if (!profile?.id) return;
    try {
      const { error } = await supabase
        .from("services")
        .update({ is_active: !s.is_active })
        .eq("id", s.id)
        .eq("artist_id", profile.id);

      if (error) throw error;
      setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
          </Pressable>

          <Text style={styles.h1}>Edit Profile</Text>

          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.screen}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Artist toggle (only if not already artist) */}
            {!isArtist && (
              <View style={styles.card}>
                <View style={styles.toggleHeader}>
                  <Text style={styles.sectionTitle}>Artist Mode</Text>

                  <Pressable
                    onPress={() => setArtistMode((v) => !v)}
                    style={[styles.togglePill, artistMode && styles.togglePillOn]}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle artist mode"
                  >
                    <View style={[styles.toggleDot, artistMode && styles.toggleDotOn]} />
                    <Text style={[styles.togglePillText, artistMode && { color: OFF_WHITE }]}>
                      {artistMode ? "On" : "Off"}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.help}>
                  Turn this on only if you offer services. You’ll be able to add services and appear in search.
                </Text>
              </View>
            )}

            {/* Profile card */}
            <View style={styles.card}>
              <View style={styles.profileImageRow}>
                <Text style={styles.label}>Profile picture</Text>

                <Pressable
                  onPress={pickAndUploadAvatar}
                  disabled={uploadingAvatar}
                  style={styles.avatarPressable}
                  accessibilityRole="button"
                  accessibilityLabel="Upload profile picture"
                >
                  <View style={styles.avatarWrap}>
                    {avatarUrl?.trim() ? (
                      <>
                        <ExpoImage
                          key={avatarUrl}
                          source={{ uri: avatarUrl.trim() }}
                          style={styles.avatarImg}
                          contentFit="cover"
                          cachePolicy="none" // keep as-is (your debug setting)
                          onError={async () => {
                            const url = avatarUrl.trim();
                            const info = await probeImageUrl(url);

                            console.log("=== AVATAR IMAGE PROBE START ===");
                            console.log(info);
                            console.log("=== AVATAR IMAGE PROBE END ===");

                            await Clipboard.setStringAsync(info);

                            Alert.alert(
                              "Image failed to load",
                              "I copied the full probe info to your clipboard.\nPaste it here and I’ll tell you the exact fix."
                            );
                          }}
                        />

                        <View style={styles.avatarEditBadge}>
                          <Ionicons name="camera-outline" size={14} color={OFF_WHITE} />
                        </View>
                      </>
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Ionicons name="cloud-upload-outline" size={22} color="rgba(0,0,0,0.55)" />
                      </View>
                    )}
                  </View>
                </Pressable>
              </View>

              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                style={styles.input}
                placeholder="e.g. glamByMazzy"
                autoCapitalize="none"
              />

              <Text style={styles.label}>City</Text>
              <TextInput value={city} onChangeText={setCity} style={styles.input} placeholder="e.g. Toronto" />

              <Text style={styles.label}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                style={[styles.input, { height: 110, textAlignVertical: "top" }]}
                placeholder="What do you specialize in? What should clients know?"
                multiline
              />
            </View>

            {/* Services (only visible when artist OR artistMode ON) */}
            {effectiveArtist && (
              <View style={styles.card}>
                <View style={styles.servicesHeader}>
                  <Text style={styles.sectionTitle}>Services</Text>
                  <Pressable onPress={openAddService} style={styles.smallBtn} accessibilityRole="button">
                    <Ionicons name="add" size={18} color={BLACK} />
                    <Text style={styles.smallBtnText}>Add</Text>
                  </Pressable>
                </View>

                {servicesLoading ? (
                  <View style={{ paddingVertical: 14, alignItems: "center" }}>
                    <ActivityIndicator />
                  </View>
                ) : services.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No services yet</Text>
                    <Text style={styles.emptySub}>Add at least 1 service so clients can book you.</Text>
                  </View>
                ) : (
                  <View style={styles.servicesList}>
                    {services.map((s, idx) => {
                      const isLast = idx === services.length - 1;
                      return (
                        <View key={s.id} style={[styles.serviceRow, !isLast && styles.serviceRowBorder]}>
                          <Pressable onPress={() => openEditService(s)} style={{ flex: 1 }} accessibilityRole="button">
                            <Text style={styles.serviceTitle}>{s.title}</Text>
                            <Text style={styles.serviceMeta}>
                              ${dollarsFromCents(s.price_cents)} • {s.duration_minutes} min
                              {s.is_active ? "" : " • Hidden"}
                            </Text>
                          </Pressable>

                          <View style={styles.serviceActions}>
                            <Pressable onPress={() => toggleServiceActive(s)} style={styles.iconPill}>
                              <Ionicons
                                name={s.is_active ? "eye-outline" : "eye-off-outline"}
                                size={18}
                                color={"rgba(0,0,0,0.75)"}
                              />
                            </Pressable>

                            <Pressable onPress={() => openEditService(s)} style={styles.iconPill}>
                              <Ionicons name="create-outline" size={18} color={"rgba(0,0,0,0.75)"} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Bottom button always Save */}
            <Pressable disabled={saving || uploadingAvatar} onPress={onSave} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{saving ? "..." : "Save"}</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>

      {/* Service editor modal */}
      <Modal transparent visible={serviceModalOpen} animationType="fade" onRequestClose={() => setServiceModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingServiceId ? "Edit Service" : "Add Service"}</Text>
              <Pressable onPress={() => setServiceModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color={BLACK} />
              </Pressable>
            </View>

            <Text style={styles.label}>Title</Text>
            <TextInput value={sTitle} onChangeText={setSTitle} style={styles.input} placeholder="e.g. Soft Glam Makeup" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Price ($)</Text>
                <TextInput
                  value={sPrice}
                  onChangeText={setSPrice}
                  style={styles.input}
                  placeholder="e.g. 80"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Duration (min)</Text>
                <TextInput
                  value={sDuration}
                  onChangeText={setSDuration}
                  style={styles.input}
                  placeholder="e.g. 60"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              value={sDesc}
              onChangeText={setSDesc}
              style={[styles.input, { height: 90, textAlignVertical: "top" }]}
              placeholder="What’s included?"
              multiline
            />

            <Pressable onPress={() => setSActive((v) => !v)} style={styles.toggleRow}>
              <Ionicons name={sActive ? "checkbox" : "square-outline"} size={18} color={"rgba(0,0,0,0.75)"} />
              <Text style={styles.toggleText}>{sActive ? "Visible to clients" : "Hidden from clients"}</Text>
            </Pressable>

            <Pressable disabled={saving} onPress={saveService} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{saving ? "..." : "Save Service"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  container: { flex: 1, backgroundColor: OFF_WHITE },

  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  avatarPressable: {
    alignSelf: "flex-start",
  },

  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BLACK,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: OFF_WHITE,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  screen: { padding: 16, gap: 12, paddingBottom: 24 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    gap: 8,
  },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: BLACK },

  label: { fontWeight: "900", color: BLACK, marginTop: 6 },

  help: { marginTop: 6, color: MUTED, fontWeight: "700", fontSize: 12, lineHeight: 16 },

  input: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: OFF_WHITE,
    color: BLACK,
    fontWeight: "800",
  },
  profileImageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: OFF_WHITE,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFallback: { flex: 1, alignItems: "center", justifyContent: "center" },

  servicesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.16)",
    backgroundColor: OFF_WHITE,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallBtnText: { fontWeight: "900", color: BLACK },

  emptyBox: {
    marginTop: 6,
    backgroundColor: OFF_WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    padding: 12,
  },
  emptyTitle: { fontWeight: "900", color: BLACK },
  emptySub: { marginTop: 6, fontWeight: "700", color: MUTED },

  servicesList: {
    marginTop: 6,
    backgroundColor: OFF_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    overflow: "hidden",
  },
  serviceRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  serviceRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  serviceTitle: { fontWeight: "900", color: BLACK, fontSize: 14 },
  serviceMeta: { marginTop: 4, fontWeight: "800", color: MUTED, fontSize: 12 },
  serviceActions: { flexDirection: "row", gap: 8 },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtn: {
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: OFF_WHITE, fontWeight: "900" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", padding: 18, justifyContent: "center" },
  modalCard: { backgroundColor: OFF_WHITE, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: BORDER },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: "900", color: BLACK },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  toggleRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  toggleText: { fontWeight: "900", color: "rgba(0,0,0,0.75)" },

  // Artist toggle pill
  toggleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  togglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.14)",
    backgroundColor: OFF_WHITE,
  },
  togglePillOn: { backgroundColor: BLACK, borderColor: BLACK },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.20)",
  },
  toggleDotOn: { backgroundColor: OFF_WHITE },
  togglePillText: { fontWeight: "900", color: BLACK },
});
