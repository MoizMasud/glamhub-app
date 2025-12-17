import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { supabase } from "../lib/supabase";
import { getServiceDetails, MarketplaceService } from "../lib/services";
import { createBooking } from "../lib/bookings";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFfF";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Prevent infinite spinner
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

export default function ServiceDetailsScreen({
  serviceId,
  autoBook,
  onBack,
  onPressArtist,
  onRequestSignInForBooking,
  onBooked,
}: {
  serviceId: string;
  autoBook?: boolean;
  onBack: () => void;
  onPressArtist: (artistId: string) => void;
  onRequestSignInForBooking: (serviceId: string) => void;
  onBooked: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<MarketplaceService | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [hasActiveBooking, setHasActiveBooking] = useState(false);

  const [bookingLoading, setBookingLoading] = useState(false);
  const didAutoBookRef = useRef(false);

  const loadService = async () => {
    try {
      setLoading(true);
      setErrorText(null);

      const s = await withTimeout(
        getServiceDetails(serviceId),
        12000,
        "Request timed out. Check your connection and try again."
      );

      setService(s);
    } catch (e: any) {
      setService(null);
      setErrorText(e?.message ?? "Failed to load service.");
    } finally {
      setLoading(false);
    }
  };

  const loadMe = async () => {
    const { data } = await supabase.auth.getUser();
    setMyUserId(data.user?.id ?? null);
  };

  const loadActiveBookingFlag = async (uid: string, sid: string) => {
    const { data, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("client_id", uid)
      .eq("service_id", sid)
      .in("status", ["pending", "accepted"])
      .limit(1);

    if (error) throw error;
    setHasActiveBooking((data ?? []).length > 0);
  };

  useEffect(() => {
    loadService();
  }, [serviceId]);

  useEffect(() => {
    loadMe();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadMe();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (myUserId) await loadActiveBookingFlag(myUserId, serviceId);
        else setHasActiveBooking(false);
      } catch {
        setHasActiveBooking(false);
      }
    })();
  }, [myUserId, serviceId]);

  const isOwnService = !!myUserId && !!service && service.artist_id === myUserId;

  const canBook =
    !!myUserId &&
    !!service &&
    !isOwnService &&
    !hasActiveBooking;

  const book = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      onRequestSignInForBooking(serviceId);
      return;
    }

    if (!service) return;

    if (user.id === service.artist_id) {
      Alert.alert("Not allowed", "You can’t book your own service.");
      return;
    }

    if (hasActiveBooking) {
      Alert.alert("Already booked", "You already have an active booking for this service.");
      return;
    }

    try {
      setBookingLoading(true);

      const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const b = await createBooking({
        serviceId: service.id,
        artistId: service.artist_id,
        startTimeISO: start,
        notes: "Booking request",
      });

      setHasActiveBooking(true);

      Alert.alert(
        "Booked ✅",
        "Your booking was created successfully.",
        [
          {
            text: "View booking",
            onPress: onBooked, // ✅ ROUTE TO ACCOUNT
          },
        ]
      );
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.toLowerCase().includes("unique")) {
        setHasActiveBooking(true);
        Alert.alert("Already booked", "You already have an active booking.");
      } else {
        Alert.alert("Error", e.message);
      }
    } finally {
      setBookingLoading(false);
    }
  };

  // Auto-book after login
  useEffect(() => {
    if (!autoBook) return;
    if (didAutoBookRef.current) return;
    if (!myUserId || loading || !service) return;

    didAutoBookRef.current = true;
    book();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBook, myUserId, loading, service?.id]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Header title="Service" onBack={onBack} />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: BLACK }}>Loading…</Text>
          </View>
        ) : errorText ? (
          <View style={styles.center}>
            <Text style={styles.errTitle}>Couldn’t load service</Text>
            <Text style={styles.errText}>{errorText}</Text>
            <Pressable onPress={loadService} style={styles.btnOutline}>
              <Text style={styles.btnOutlineText}>Retry</Text>
            </Pressable>
          </View>
        ) : !service ? (
          <View style={styles.center}>
            <Text style={{ fontWeight: "900", color: BLACK }}>Service not found</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>{service.title}</Text>

              <Text style={styles.meta}>
                {formatPrice(service.price_cents)} • {service.duration_minutes} min
              </Text>

              <Pressable onPress={() => onPressArtist(service.artist_id)}>
                <Text style={styles.artist}>
                  {service.artist?.username || "Artist"}
                  {service.artist?.city ? ` • ${service.artist.city}` : ""}
                </Text>
              </Pressable>

              <Text style={styles.desc}>
                {service.description || "No description yet."}
              </Text>

              {!myUserId && (
                <Text style={styles.hint}>
                  You can view details while logged out. Sign in to book.
                </Text>
              )}
              {isOwnService && (
                <Text style={styles.hint}>You can’t book your own service.</Text>
              )}
              {hasActiveBooking && (
                <Text style={styles.hint}>
                  You already have an active booking for this service.
                </Text>
              )}
            </View>

            <Pressable
              onPress={book}
              disabled={bookingLoading || (!!myUserId && !canBook)}
              style={[
                styles.btn,
                (bookingLoading || (!!myUserId && !canBook)) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.btnText}>
                {bookingLoading
                  ? "Booking…"
                  : !myUserId
                  ? "Book"
                  : isOwnService
                  ? "Can’t book your own"
                  : hasActiveBooking
                  ? "Already booked"
                  : "Book"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.pillBtn}>
        <Text style={styles.pillBtnText}>Back</Text>
      </Pressable>
      <Text style={styles.h1}>{title}</Text>
      <View style={{ width: 70 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  screen: {
    flexGrow: 1,
    backgroundColor: OFF_WHITE,
    padding: 16,
    gap: 12,
  },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },
  pillBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
  },
  pillBtnText: { color: BLACK, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },

  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: PINK,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: "900", color: BLACK },
  meta: {
    color: BLACK,
    fontWeight: "900",
    backgroundColor: OFF_WHITE,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  artist: {
    marginTop: 2,
    color: BLACK,
    opacity: 0.85,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  desc: { color: BLACK, lineHeight: 18, marginTop: 6 },
  hint: { marginTop: 8, color: BLACK, opacity: 0.85, fontWeight: "800" },

  btn: {
    backgroundColor: BLACK,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  btnText: { color: OFF_WHITE, fontWeight: "900" },

  errTitle: { fontSize: 18, fontWeight: "900", color: BLACK },
  errText: { marginTop: 8, color: BLACK, opacity: 0.8, textAlign: "center" },

  btnOutline: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BLACK,
    backgroundColor: OFF_WHITE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  btnOutlineText: { color: BLACK, fontWeight: "900" },
});
