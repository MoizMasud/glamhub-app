// App.tsx
import React from "react";
import { View, StyleSheet, Text, Pressable, Image, Platform } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "./src/context/AuthContext";

import AuthScreen from "./src/screens/AuthScreen";
import SearchScreen, { MarketplaceFilters } from "./src/screens/SearchScreen";
import MarketplaceScreen from "./src/screens/MarketplaceScreen";
import AccountScreen from "./src/screens/AccountScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ArtistOnboardingScreen from "./src/screens/EditProfileScreen";
import ArtistProfileScreen from "./src/screens/ArtistProfileScreen";
import ServiceDetailsScreen from "./src/screens/ServiceDetailsScreen";
import BookingsScreen from "./src/screens/BookingsScreen"; // list of bookings
import BookingScreen from "./src/screens/BookingScreen";   // booking flow

// ✅ NEW booking screens you just added
import BookingSelectedScreen from "./src/screens/BookingSelectedScreen";

const OFF_WHITE = "#FFFFFF";
const BLACK = "#000000";
const GREY = "rgba(0,0,0,0.38)";
const BORDER = "rgba(0,0,0,0.08)";

// ✅ transparent logo with black text (no circle/background)
const GH_LOGO = require("./assets/gh-white.png");

type Route =
  | { name: "search"; filters?: MarketplaceFilters | null }
  | { name: "marketplace"; filters?: MarketplaceFilters | null }
  | { name: "bookings" }
  | { name: "auth" }
  | { name: "account" }
  | { name: "settings" }
  | { name: "onboarding" }
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
  const TabIcon = ({
    name,
    children,
    accessibilityLabel,
  }: {
    name: TabName;
    children: React.ReactNode;
    accessibilityLabel: string;
  }) => (
    <Pressable
      onPress={() => onGo(name)}
      style={styles.tabIconBtn}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );

  const isActive = (n: TabName) => active === n;

  return (
    <View style={styles.footer}>
      <TabIcon name="search" accessibilityLabel="Search">
        <Image
          source={GH_LOGO}
          resizeMode="contain"
          style={[styles.logoIcon, { opacity: isActive("search") ? 1 : 0.45 }]}
        />
      </TabIcon>

      <TabIcon name="marketplace" accessibilityLabel="Marketplace">
        <Ionicons
          name={isActive("marketplace") ? "grid" : "grid-outline"}
          size={26}
          color={isActive("marketplace") ? BLACK : GREY}
        />
      </TabIcon>

      {/* ✅ Only show when logged in */}
      {isLoggedIn && (
        <TabIcon name="bookings" accessibilityLabel="Bookings">
          <Ionicons
            name={isActive("bookings") ? "calendar" : "calendar-outline"}
            size={26}
            color={isActive("bookings") ? BLACK : GREY}
          />
        </TabIcon>
      )}

      <TabIcon name="account" accessibilityLabel="Account">
        <Ionicons
          name={isActive("account") ? "person-circle" : "person-circle-outline"}
          size={26}
          color={isActive("account") ? BLACK : GREY}
        />
      </TabIcon>
    </View>
  );
}

function Root() {
  const { loading, user } = useAuth();

  const [route, setRoute] = React.useState<Route>({ name: "search" });
  const [postAuthRoute, setPostAuthRoute] = React.useState<Route | null>(null);
  const prevUserIdRef = React.useRef<string | null>(null);

  const lastFiltersRef = React.useRef<MarketplaceFilters | null>(null);

  React.useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;

    // When user logs in on Auth screen → go back where we wanted
    if (route.name === "auth" && !prev && next) {
      if (postAuthRoute) {
        setRoute(postAuthRoute);
        setPostAuthRoute(null);
      } else {
        setRoute({ name: "account" });
      }
    }

    prevUserIdRef.current = next;
  }, [route.name, user, postAuthRoute]);

  React.useEffect(() => {
    if (route.name === "search" || route.name === "marketplace") {
      lastFiltersRef.current = route.filters ?? lastFiltersRef.current;
    }
  }, [route]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const showTabs =
    route.name === "search" ||
    route.name === "marketplace" ||
    route.name === "account" ||
    route.name === "bookings" ||
    route.name === "settings";

  const activeTab: TabName =
    route.name === "marketplace"
      ? "marketplace"
      : route.name === "bookings"
      ? "bookings"
      : route.name === "account" || route.name === "settings"
      ? "account"
      : "search";

  // Auth (no footer)
  if (route.name === "auth") {
    return (
      <AuthScreen
        onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
      />
    );
  }

  // Deep screens (no footer)
  if (route.name === "onboarding") {
    return <ArtistOnboardingScreen onBack={() => setRoute({ name: "account" })} />;
  }

  // ✅ Artist Profile (now uses popup + select + book)
  if (route.name === "artist") {
    return (
      <ArtistProfileScreen
        artistId={route.artistId}
        onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        onOpenBooking={({ artistId, serviceIds }) => {
          // if not logged in, go auth then return here
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

  // ✅ Booking (full flow: choose services + date + time)
  if (route.name === "booking") {
    return (
      <BookingScreen
        artistId={route.artistId}
        initialServiceIds={route.initialServiceIds ?? []}
        onBack={() => setRoute({ name: "artist", artistId: route.artistId })}
        onRequestSignIn={() => {
          setPostAuthRoute({
            name: "booking",
            artistId: route.artistId,
            initialServiceIds: route.initialServiceIds ?? [],
          });
          setRoute({ name: "auth" });
        }}
        onBooked={() => setRoute({ name: "account" })}
      />
    );
  }

  // ✅ Booking Selected (services already chosen on profile)
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

  // Service details still supported from marketplace
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

  return (
    <View style={{ flex: 1 }}>
      {/* Search */}
      {route.name === "search" && (
        <SearchScreen
          initialFilters={route.filters ?? null}
          onSearch={(filters) => {
            lastFiltersRef.current = filters;
            setRoute({ name: "marketplace", filters });
          }}
          onSkip={() =>
            setRoute({ name: "marketplace", filters: route.filters ?? lastFiltersRef.current })
          }
        />
      )}

      {/* Marketplace */}
      {route.name === "marketplace" && (
        <MarketplaceScreen
          filters={route.filters ?? null}
          onEditFilters={() =>
            setRoute({ name: "search", filters: route.filters ?? lastFiltersRef.current })
          }
          onRequestSignIn={() => setRoute({ name: "auth" })}
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

      {/* Account */}
      {route.name === "account" && (
        <AccountScreen
          onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
          onOpenBookings={() => setRoute({ name: "bookings" })}
          onOpenOnboarding={() => setRoute({ name: "onboarding" })}
          onOpenSettings={() => setRoute({ name: "settings" })}
          onSignedOut={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        />
      )}

      {/* ✅ Bookings */}
      {route.name === "bookings" && <BookingsScreen onBack={() => setRoute({ name: "account" })} />}

      {/* ✅ Settings */}
      {route.name === "settings" && <SettingsScreen onBack={() => setRoute({ name: "account" })} />}

      {showTabs && (
        <TabBar
          active={activeTab}
          isLoggedIn={!!user}
          onGo={(name) => {
            if (name === "search") {
              setRoute({ name: "search", filters: lastFiltersRef.current });
              return;
            }

            if (name === "marketplace") {
              setRoute({ name: "marketplace", filters: lastFiltersRef.current });
              return;
            }

            if (name === "bookings") {
              if (!user) {
                setPostAuthRoute({ name: "bookings" });
                setRoute({ name: "auth" });
              } else {
                setRoute({ name: "bookings" });
              }
              return;
            }

            if (name === "account") {
              if (!user) {
                setPostAuthRoute({ name: "account" });
                setRoute({ name: "auth" });
              } else {
                setRoute({ name: "account" });
              }
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
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
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
