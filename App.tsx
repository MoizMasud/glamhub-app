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
import ArtistOnboardingScreen from "./src/screens/ArtistOnboardingScreen";
import ArtistProfileScreen from "./src/screens/ArtistProfileScreen";
import ServiceDetailsScreen from "./src/screens/ServiceDetailsScreen";

const OFF_WHITE = "#FFFFEF";
const BLACK = "#000000";
const GREY = "rgba(0,0,0,0.38)";
const BORDER = "rgba(0,0,0,0.10)";

// ✅ transparent logo with black text (no circle/background)
const GH_LOGO = require("./assets/gh-white.png"); // keep your existing path if different

type Route =
  | { name: "search"; filters?: MarketplaceFilters | null }
  | { name: "marketplace"; filters?: MarketplaceFilters | null }
  | { name: "auth" }
  | { name: "account" }
  | { name: "settings" }
  | { name: "onboarding" }
  | { name: "artist"; artistId: string }
  | { name: "service"; serviceId: string; autoBook?: boolean };

type TabName = "search" | "marketplace" | "account";

function TabBar({
  active,
  onGo,
}: {
  active: TabName;
  onGo: (name: TabName) => void;
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
      {/* "Home" is Search */}
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

      <TabIcon name="account" accessibilityLabel="Account">
        <Ionicons
          name="person-circle-outline"
          size={26}
          color={isActive("account") ? BLACK : GREY}
        />
      </TabIcon>
    </View>
  );
}

function Root() {
  const { loading, user } = useAuth();

  // ✅ Search is landing
  const [route, setRoute] = React.useState<Route>({ name: "search" });

  const [postAuthRoute, setPostAuthRoute] = React.useState<Route | null>(null);
  const prevUserIdRef = React.useRef<string | null>(null);

  // keep last known filters so Search/Marketplace tabs preserve state
  const lastFiltersRef = React.useRef<MarketplaceFilters | null>(null);

  // After login: go to requested target OR Account
  React.useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;

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

  // Remember filters whenever we see them
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

  // ✅ show footer only on main tabs (not on deep screens)
  const showTabs = route.name === "search" || route.name === "marketplace" || route.name === "account";

  const activeTab: TabName =
    route.name === "marketplace" ? "marketplace" : route.name === "account" ? "account" : "search";

  // Auth (no footer)
  if (route.name === "auth") {
    return <AuthScreen onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })} />;
  }

  // Deep screens (no footer)
  if (route.name === "onboarding") {
    return <ArtistOnboardingScreen onBack={() => setRoute({ name: "account" })} />;
  }

  if (route.name === "artist") {
    return (
      <ArtistProfileScreen
        artistId={route.artistId}
        onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        onOpenService={(serviceId) => setRoute({ name: "service", serviceId })}
      />
    );
  }

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
        onBooked={() => {
          setRoute({ name: "account" });
        }}
      />
    );
  }

  if (route.name === "settings") {
    return <SettingsScreen onBack={() => setRoute({ name: "account" })} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Search (tab “home”) */}
      {route.name === "search" && (
        <SearchScreen
          initialFilters={route.filters ?? null}
          onSearch={(filters) => {
            lastFiltersRef.current = filters;
            setRoute({ name: "marketplace", filters });
          }}
          onSkip={() => setRoute({ name: "marketplace", filters: route.filters ?? lastFiltersRef.current })}
        />
      )}

      {/* Marketplace */}
      {route.name === "marketplace" && (
        <MarketplaceScreen
          filters={route.filters ?? null}
          onEditFilters={() => setRoute({ name: "search", filters: route.filters ?? lastFiltersRef.current })}
          onRequestSignIn={() => setRoute({ name: "auth" })}
          onOpenAccount={() => (user ? setRoute({ name: "account" }) : setRoute({ name: "auth" }))}
          onOpenArtist={(artistId) => setRoute({ name: "artist", artistId })}
          onOpenService={(serviceId) => setRoute({ name: "service", serviceId })}
        />
      )}

      {/* Account */}
      {route.name === "account" && (
        <AccountScreen
          onBack={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
          onOpenOnboarding={() => setRoute({ name: "onboarding" })}
          onOpenSettings={() => setRoute({ name: "settings" })}
          onSignedOut={() => setRoute({ name: "marketplace", filters: lastFiltersRef.current })}
        />
      )}

      {showTabs && (
        <TabBar
          active={activeTab}
          onGo={(name) => {
            // Account requires login
            if (name === "account" && !user) {
              setRoute({ name: "auth" });
              return;
            }

            if (name === "search") {
              setRoute({ name: "search", filters: lastFiltersRef.current });
              return;
            }

            if (name === "marketplace") {
              setRoute({ name: "marketplace", filters: lastFiltersRef.current });
              return;
            }

            setRoute({ name: "search", filters: lastFiltersRef.current });
          }}
        />
      )}
    </View>
  );
}

export default function App() {
  const env = Constants.expoConfig?.extra?.env ?? "unknown";
  const showBadge = env === "dev" || env === "staging";

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

  badge: {
    position: "absolute",
    bottom: 88,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    zIndex: 999,
  },
  badgeText: {
    color: OFF_WHITE,
    fontWeight: "700",
    letterSpacing: 1,
    fontSize: 12,
  },

  // ✅ clean footer like screenshot (icons only)
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

  // logo icon (transparent)
  logoIcon: {
    width: 40,
    height: 40,
  },
});
