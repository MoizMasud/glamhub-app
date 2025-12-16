import React, { useEffect, useState } from "react";
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
} from "react-native";
import { getMyProfile, setMyRole, updateMyProfile } from "../lib/profile";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";

export default function ArtistOnboardingScreen({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        setUsername(p.username ?? "");
        setCity(p.city ?? "");
        setBio(p.bio ?? "");
      } catch {}
    })();
  }, []);

  const save = async () => {
    try {
      setLoading(true);
      await updateMyProfile({
        username: username.trim() || null,
        city: city.trim() || null,
        bio: bio.trim() || null,
      });
      Alert.alert("Saved", "Profile updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const becomeArtist = async () => {
    try {
      setLoading(true);
      await setMyRole("artist");
      Alert.alert("Done", "You are now an artist.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Header title="Artist Onboarding" left="Back" onLeft={onBack} />

        <View style={styles.card}>
          <Text style={styles.label}>Username</Text>
          <TextInput value={username} onChangeText={setUsername} style={styles.input} placeholder="e.g. GlamBySara" />

          <Text style={styles.label}>City</Text>
          <TextInput value={city} onChangeText={setCity} style={styles.input} placeholder="e.g. Toronto" />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            style={[styles.input, { height: 100 }]}
            placeholder="Short bio…"
            multiline
          />
        </View>

        <Pressable disabled={loading} onPress={save} style={styles.btn}>
          <Text style={styles.btnText}>{loading ? "..." : "Save Profile"}</Text>
        </Pressable>

        <Pressable disabled={loading} onPress={becomeArtist} style={styles.btnOutline}>
          <Text style={styles.btnOutlineText}>{loading ? "..." : "Become Artist"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({
  title,
  left,
  onLeft,
}: {
  title: string;
  left: string;
  onLeft: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onLeft} style={styles.pillBtn}>
        <Text style={styles.pillBtnText}>{left}</Text>
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
  screen: { flexGrow: 1, backgroundColor: OFF_WHITE, padding: 16, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 20, fontWeight: "900", color: BLACK },
  pillBtn: { borderWidth: 1, borderColor: BLACK, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pillBtnText: { color: BLACK, fontWeight: "900" },

  card: { borderWidth: 1, borderColor: BLACK, borderRadius: 16, padding: 14, backgroundColor: PINK, gap: 8 },
  label: { fontWeight: "900", color: BLACK, marginTop: 6 },
  input: { borderWidth: 1, borderColor: BLACK, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: OFF_WHITE },

  btn: { backgroundColor: BLACK, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnText: { color: OFF_WHITE, fontWeight: "900" },
  btnOutline: { borderWidth: 1, borderColor: BLACK, backgroundColor: OFF_WHITE, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnOutlineText: { color: BLACK, fontWeight: "900" },
});
