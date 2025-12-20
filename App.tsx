import React from "react";
import { View, StyleSheet, Text, Pressable, Image, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "./src/context/AuthContext";

import AuthScreen from "./src/screens/AuthScreen";
import SearchScreen, { MarketplaceFilters } from "./src/screens/SearchScreen";
import MarketplaceScreen from "./src/screens/MarketplaceScreen";
import AccountScreen from "./src/screens/AccountScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

// ✅ onboarding = Edit Profile
import EditProfileScreen from "./src/screens/EditProfileScreen";

import ArtistProfileScreen from "./src/screens/ArtistProfileScreen";
import ServiceDetailsScreen from "./src/screens/ServiceDetailsScreen";
import BookingsScreen from "./src/screens/MyBookingsScreen";
import BookingSelectedScreen from "./src/screens/BookingSelectedScreen";

const OFF_WHITE = "#FFFFFF";
const BLACK = "#000000";
const GREY = "rgba(0,0,0,0.38)";
const BORDER = "rgba(0,0,0,0.08)";

const GH_LOGO = require("./assets/gh-white.png");

type Route =
  | { name: "search"; filters?: MarketplaceFilters | null }
  | { name: "marketplace"; filters?: MarketplaceFilters | null }
  | { name: "bookings" }
  | { name: "auth" }
  | { name: "account" }
  | { name: "settings" }
  | { name: "onboarding" } // keep onboarding
  | { name: "artist"; artistId: string; selectedServiceId?: string | null }
  | { name: "service"; serviceId: string; autoBook?: boolean }
  | { name: "booking"; artistId: string; initialServiceIds?: string[] }
  | { name: "bookingSelected"; artistId: string; serviceIds: string[] };

type TabName = "search" | "marketplace" | "bookings" | "account";

function TabBar({
  active,
  onGo,
  isLoggedIn,
}: {
  active: TabName;
  onGo: (name: TabName) => void;
  isLoggedIn: boolean;
}) {
  return (
    <View style={styles.footer}>
      <Pressable onPress={() => onGo("search")} style={styles.tabIconBtn}>
        <Image source={GH_LOGO} resizeMode="contain" style={styles.logoIcon} />
      </Pressable>

      <Pressable onPress={() => onGo("marketplace")} style={styles.tabIconBtn}>
        <Ionicons
          name={active === "marketplace" ? "grid" : "grid-outline"}
          size={26}
          color={active === "marketplace" ? BLACK : GREY}
        />
      </Pressable>

      {isLoggedIn && (
        <Pressable onPress={() => onGo("bookings")} style={styles.tabIconBtn}>
          <Ionicons
            name={active === "bookings" ? "calendar" : "calendar-outline"}
            size={26}
            color={active === "bookings" ? BLACK : GREY}
          />
        </Pressable>
      )}

      <Pressable onPress={() => onGo("account")} style={styles.tabIconBtn}>
        <Ionicons
          name={active === "account" ? "person-circle" : "person-circle-outline"}
          size={26}
          color={active === "account" ? BLACK : GREY}
        />
      </Pressable>
    </View>
  );
}

function Root() {
  const { loading, user } = useAuth();

  const [route, setRoute] = React.useState<Route>({ name: "search" });
  const [postAuthRoute, setPostAuthRoute] = React.useState<Route | null>(null);

  const lastFiltersRef = React.useRef<MarketplaceFilters | null>(null);
  const prevUserIdRef = React.useRef<string | null>(null);

  // ✅ Restore redirect after login
  React.useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;

    // user just logged in while on auth
    if (route.name === "auth" && !prev && next) {
      if (postAuthRoute) {
        setRoute(postAuthRoute);
        setPostAuthRoute(null);
      } else {
        // default: go to account
        setRoute({ name: "account" });
      }
    }

    // user logged out → go to marketplace
    if (!!prev && !next) {
      setRoute({ name: "marketplace", filters: lastFiltersRef.current });
      setPostAuthRoute(null);
    }

    prevUserIdRef.current = next;
  }, [route.name, user?.id, postAuthRoute]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading…</Text>
      </View>
    );
  }

  // 🔐 AUTH (no tabs)
  if (route.name === "auth") {
    return (
      <AuthScreen
        onBack={() => {
          // go back to marketplace by default
          setRoute({ name: "marketplace", filters: lastFiltersRef.current });
        }}
      />
    );
  }

  // ✅ ONBOARDING = EDIT PROFILE
  if (route.name === "onboarding") {
    return <EditProfileScreen onBack={() => setRoute({ name: "account" })} />;
  }

  // 👤 ARTIST PROFILE
  if (route.name === "artist") {
    return (
      <ArtistProfileScreen
        artistId={route.artistId}
        onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        onOpenBooking={({ artistId, serviceIds }) => {
          if (!user) {
            setPostAuthRoute({ name: "bookingSelected", artistId, serviceIds });
            setRoute({ name: "auth" });
            return;
          }
          setRoute({ name: "bookingSelected", artistId, serviceIds });
        }}
        onRequestSignIn={() => {
          setPostAuthRoute({ name: "artist", artistId: route.artistId });
          setRoute({ name: "auth" });
        }}
      />
    );
  }

  if (route.name === "bookingSelected") {
    return (
      <BookingSelectedScreen
        artistId={route.artistId}
        serviceIds={route.serviceIds}
        onBack={() => setRoute({ name: "artist", artistId: route.artistId })}
        onRequestSignIn={() => {
          setPostAuthRoute({
            name: "bookingSelected",
            artistId: route.artistId,
            serviceIds: route.serviceIds,
          });
          setRoute({ name: "auth" });
        }}
        onBooked={() => setRoute({ name: "account" })}
      />
    );
  }

  // 🧾 SERVICE
  if (route.name === "service") {
    return (
      <ServiceDetailsScreen
        serviceId={route.serviceId}
        autoBook={!!route.autoBook}
        onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        onPressArtist={(artistId) => setRoute({ name: "artist", artistId })}
        onRequestSignInForBooking={(serviceId) => {
          setPostAuthRoute({ name: "service", serviceId, autoBook: true });
          setRoute({ name: "auth" });
        }}
        onBooked={() => setRoute({ name: "account" })}
      />
    );
  }

  const activeTab: TabName =
    route.name === "marketplace"
      ? "marketplace"
      : route.name === "bookings"
      ? "bookings"
      : route.name === "account" || route.name === "settings"
      ? "account"
      : "search";

  const showTabs =
    route.name === "search" ||
    route.name === "marketplace" ||
    route.name === "account" ||
    route.name === "bookings" ||
    route.name === "settings";

  return (
    <View style={{ flex: 1 }}>
      {route.name === "search" && (
        <SearchScreen
          initialFilters={route.filters ?? null}
          onSearch={(filters) => {
            lastFiltersRef.current = filters;
            setRoute({ name: "marketplace", filters });
          }}
        />
      )}

      {route.name === "marketplace" && (
        <MarketplaceScreen
          filters={route.filters ?? null}
          onEditFilters={() => setRoute({ name: "search", filters: route.filters })}
          onRequestSignIn={() => {
            setPostAuthRoute({ name: "marketplace", filters: lastFiltersRef.current });
            setRoute({ name: "auth" });
          }}
          onOpenAccount={() => {
            if (user) setRoute({ name: "account" });
            else {
              setPostAuthRoute({ name: "account" });
              setRoute({ name: "auth" });
            }
          }}
          onOpenArtist={(artistId, selectedServiceId) =>
            setRoute({ name: "artist", artistId, selectedServiceId: selectedServiceId ?? null })
          }
          onOpenService={(serviceId) => setRoute({ name: "service", serviceId })}
        />
      )}

      {route.name === "account" && (
        <AccountScreen
          onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
          onOpenBookings={() => setRoute({ name: "bookings" })}
          onOpenEditProfile={() => setRoute({ name: "onboarding" })}
          onOpenOnboarding={() => setRoute({ name: "onboarding" })}
          onOpenSettings={() => setRoute({ name: "settings" })}
          onSignedOut={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        />
      )}

      {route.name === "bookings" && <BookingsScreen onBack={() => setRoute({ name: "account" })} />}

      {route.name === "settings" && <SettingsScreen onBack={() => setRoute({ name: "account" })} />}

      {showTabs && (
        <TabBar
          active={activeTab}
          isLoggedIn={!!user}
          onGo={(name) => {
            if (name === "search") setRoute({ name: "search", filters: lastFiltersRef.current });
            if (name === "marketplace") setRoute({ name: "marketplace", filters: lastFiltersRef.current });

            if (name === "bookings") {
              if (!user) {
                setPostAuthRoute({ name: "bookings" });
                setRoute({ name: "auth" });
              } else setRoute({ name: "bookings" });
            }

            if (name === "account") {
              if (!user) {
                setPostAuthRoute({ name: "account" });
                setRoute({ name: "auth" });
              } else setRoute({ name: "account" });
            }
          }}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.container}>
        <Root />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: OFF_WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 26,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  tabIconBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },

  logoIcon: {
    width: 40,
    height: 40,
  },
});
