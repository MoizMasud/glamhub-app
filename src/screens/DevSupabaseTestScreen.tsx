import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  StyleSheet,
} from "react-native";
import { signUp, signIn, signOut, fetchMyProfile } from "../lib/auth";
import { createGlamItem, listMyGlamItems } from "../lib/data";

const BLACK = "#000000";

export default function DevSupabaseTestScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [log, setLog] = useState("");

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

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
    >
      <Text style={styles.header}>Supabase DEV Smoke Test</Text>

      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />

      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <View style={styles.buttons}>
        <Button label="Sign Up" onPress={() =>
          safe(async () => {
            await signUp(email.trim(), password);
            addLog("✅ signUp ok — check email if confirmation is enabled");
          })
        } />

        <Button label="Sign In" onPress={() =>
          safe(async () => {
            await signIn(email.trim(), password);
            addLog("✅ signIn ok");
          })
        } />

        <Button label="Fetch Profile" onPress={() =>
          safe(async () => {
            const profile = await fetchMyProfile();
            addLog(`✅ profile loaded: ${JSON.stringify(profile)}`);
          })
        } />

        <Button label="Create Item" onPress={() =>
          safe(async () => {
            const item = await createGlamItem("First item", "RLS test");
            addLog(`✅ item created: ${JSON.stringify(item)}`);
          })
        } />

        <Button label="List Items" onPress={() =>
          safe(async () => {
            const items = await listMyGlamItems();
            addLog(`✅ items count: ${items.length}`);
          })
        } />

        <Button label="Sign Out" onPress={() =>
          safe(async () => {
            await signOut();
            addLog("✅ signOut ok");
          })
        } />
      </View>

      <Text style={styles.logTitle}>Log</Text>
      <Text style={styles.log}>{log || "(no logs yet)"}</Text>
    </ScrollView>
  );
}

function Button({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  header: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    color: BLACK,
  },
  input: {
    borderWidth: 1,
    borderColor: BLACK,
    padding: 12,
    borderRadius: 10,
  },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 12,
  },
  button: {
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    fontWeight: "600",
    color: BLACK,
  },
  logTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
  },
  log: {
    fontSize: 11,
    fontFamily: "monospace",
    opacity: 0.8,
  },
});
