import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import Constants from "expo-constants";

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
const PINK = "#f9dfdd";
const BLACK = "#000000";

type Route =
  | { name: "search" }
  | { name: "marketplace"; filters?: MarketplaceFilters | null }
  | { name: "auth" }
  | { name: "account" }
  | { name: "settings" }
  | { name: "onboarding" }
  | { name: "artist"; artistId: string }
  | { name: "service"; serviceId: string; autoBook?: boolean };

function TabBar({
  active,
  onGo,
}: {
  active: "marketplace" | "account" | "settings";
  onGo: (r: Route) => void;
}) {
  const Tab = ({
    label,
    name,
  }: {
    label: string;
    name: "marketplace" | "account" | "settings";
  }) => {
    const isActive = active === name;
    return (
      <Pressable
        onPress={() => onGo({ name })}
        style={[styles.tabBtn, isActive && styles.tabBtnActive]}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.tabBarWrap}>
      <View style={styles.tabBar}>
        <Tab label="Marketplace" name="marketplace" />
        <Tab label="Account" name="account" />
        <Tab label="Settings" name="settings" />
      </View>
    </View>
  );
}

function Root() {
  const { loading, user } = useAuth();

  // ✅ Search is the landing screen
  const [route, setRoute] = React.useState<Route>({ name: "search" });

  const [postAuthRoute, setPostAuthRoute] = React.useState<Route | null>(null);
  const prevUserIdRef = React.useRef<string | null>(null);

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

  // Public browsing allowed logged out. Kick out of private tabs/screens.
  React.useEffect(() => {
    if (!user && (route.name === "account" || route.name === "onboarding" || route.name === "settings")) {
      setRoute({ name: "marketplace", filters: null });
    }
  }, [user, route.name]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading…</Text>
      </View>
    );
  }

  // Auth
  if (route.name === "auth") {
    return <AuthScreen onBack={() => setRoute({ name: "marketplace", filters: null })} />;
  }

  // Landing Search
  if (route.name === "search") {
    return (
      <SearchScreen
        onSearch={(filters) => setRoute({ name: "marketplace", filters })}
        onSkip={() => setRoute({ name: "marketplace", filters: null })}
      />
    );
  }

  // Deep screens
  if (route.name === "onboarding") {
    return <ArtistOnboardingScreen onBack={() => setRoute({ name: "account" })} />;
  }

  if (route.name === "artist") {
    return (
      <ArtistProfileScreen
        artistId={route.artistId}
        onBack={() => setRoute({ name: "marketplace", filters: null })}
        onOpenService={(serviceId) => setRoute({ name: "service", serviceId })}
      />
    );
  }

  if (route.name === "service") {
    return (
      <ServiceDetailsScreen
        serviceId={route.serviceId}
        autoBook={!!route.autoBook}
        onBack={() => setRoute({ name: "marketplace", filters: null })}
        onPressArtist={(artistId) => setRoute({ name: "artist", artistId })}
        onRequestSignInForBooking={(serviceId) => {
          setPostAuthRoute({ name: "service", serviceId, autoBook: true });
          setRoute({ name: "auth" });
        }}
        onBooked={() => {
          // ✅ after booking, take client straight to Account
          setRoute({ name: "account" });
        }}
      />
    );
  }

  // Main tabs
  const activeTab =
    route.name === "account" || route.name === "settings"
      ? route.name
      : "marketplace";

  return (
    <View style={{ flex: 1 }}>
      {route.name === "account" && (
        <AccountScreen
          onBack={() => setRoute({ name: "marketplace", filters: null })}
          onOpenOnboarding={() => setRoute({ name: "onboarding" })}
          onOpenSettings={() => setRoute({ name: "settings" })}
          onSignedOut={() => setRoute({ name: "marketplace", filters: null })}
        />
      )}

      {route.name === "settings" && (
        <SettingsScreen onBack={() => setRoute({ name: "marketplace", filters: null })} />
      )}

    {route.name === "marketplace" && (
      <MarketplaceScreen
        filters={route.filters ?? null}
        onEditFilters={() => setRoute({ name: "search" })}
        onRequestSignIn={() => setRoute({ name: "auth" })}
        onOpenAccount={() => (user ? setRoute({ name: "account" }) : setRoute({ name: "auth" }))}
        onOpenArtist={(artistId) => setRoute({ name: "artist", artistId })}
        onOpenService={(serviceId) => setRoute({ name: "service", serviceId })}
      />
    )}


      {!!user && (
        <TabBar
          active={activeTab}
          onGo={(r) => {
            if (!user && (r.name === "account" || r.name === "settings")) {
              setRoute({ name: "auth" });
              return;
            }
            // Marketplace tab keeps current filters if you're already on marketplace
            if (r.name === "marketplace") {
              const currentFilters = route.name === "marketplace" ? route.filters ?? null : null;
              setRoute({ name: "marketplace", filters: currentFilters });
              return;
            }
            setRoute(r);
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
    bottom: 84,
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

  tabBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  tabBar: {
    backgroundColor: OFF_WHITE,
    borderRadius: 18,
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: PINK,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  tabText: {
    color: BLACK,
    opacity: 0.7,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  tabTextActive: {
    opacity: 1,
  },
});
