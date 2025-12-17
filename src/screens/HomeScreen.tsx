import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { fetchMyProfile } from "../lib/auth";
import { setMyRole } from "../lib/profile";
import { createService, listActiveServices } from "../lib/services";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

export default function HomeScreen() {
  const { user, signOut } = useAuth();

  const [profileEmail, setProfileEmail] = useState<string>("");
  const [serviceCount, setServiceCount] = useState<number>(0);
  const [log, setLog] = useState<string>("");

  const addLog = (msg: string) => {
    setLog((prev) => `${new Date().toISOString()}  ${msg}\n${prev}`);
  };

  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      addLog(`❌ ${e.message}`);
      Alert.alert("Error", e.message);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchMyProfile();
        setProfileEmail(p?.email ?? user?.email ?? "");
        addLog("✅ profile loaded");
      } catch (e: any) {
        addLog(`❌ profile load error: ${e.message}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>You’re in ✅</Text>

        <View style={styles.card}>
          <Text style={styles.cardText}>User: {profileEmail || user?.email}</Text>
          <Text style={styles.cardText}>Active services visible: {serviceCount}</Text>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={() =>
              safe(async () => {
                await setMyRole("artist");
                addLog("✅ role updated: artist");
                Alert.alert("Updated", "You are now an artist.");
              })
            }
            style={styles.btn}
          >
            <Text style={styles.btnText}>Become Artist</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              safe(async () => {
                const s = await createService({
                  title: "Test Service",
                  description: "DEV listing for GlamHub",
                  price_cents: 7500,
                  duration_minutes: 60,
                });
                addLog(`✅ service created: ${s.id}`);
                Alert.alert("Created", "Test service created.");
              })
            }
            style={styles.btn}
          >
            <Text style={styles.btnText}>Create Test Service</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() =>
            safe(async () => {
              const items = await listActiveServices();
              setServiceCount(items.length);
              addLog(`✅ listActiveServices: ${items.length}`);
            })
          }
          style={[styles.btn, { width: "100%" }]}
        >
          <Text style={styles.btnText}>List Active Services</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            safe(async () => {
              await signOut();
            })
          }
          style={[styles.btnOutline, { width: "100%" }]}
        >
          <Text style={styles.btnOutlineText}>Sign Out</Text>
        </Pressable>

        <Text style={styles.logTitle}>Log</Text>
        <Text style={styles.log}>{log || "(no logs yet)"}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  scroll: { flex: 1, backgroundColor: OFF_WHITE },
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: BLACK,
    textAlign: "center",
  },
  card: {
    backgroundColor: PINK,
    padding: 12,
    borderRadius: 14,
    gap: 6,
  },
  cardText: {
    color: BLACK,
    fontWeight: "700",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    backgroundColor: BLACK,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: OFF_WHITE,
    fontWeight: "800",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: BLACK,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: OFF_WHITE,
  },
  btnOutlineText: {
    color: BLACK,
    fontWeight: "800",
  },
  logTitle: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
    color: BLACK,
  },
  log: {
    fontSize: 11,
    fontFamily: "monospace",
    opacity: 0.85,
    color: BLACK,
  },
});
