// src/screens/AuthScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signIn, signUp, UserRole } from "../lib/auth";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFEF";
type ThemeMode = "light" | "dark";
const theme: ThemeMode = "light";
type Mode = "signin" | "signup";

export default function AuthScreen({ onBack }: { onBack: () => void }) {

  const BG = theme === "dark" ? BLACK : PINK;

  const logoSource =
    theme === "dark"
      ? require("../../assets/gh-dark.png")
      : require("../../assets/gh-light.png");



  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<UserRole>("client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      setLoading(true);
      const e = email.trim().toLowerCase();
      if (!e) throw new Error("Enter your email.");
      if (!password || password.length < 6)
        throw new Error("Password must be at least 6 characters.");

      if (mode === "signin") {
        await signIn(e, password);
      } else {
        await signUp(e, password, role);
        Alert.alert(
          "Account created",
          "Check your email to confirm your account (if confirmation is enabled). Then sign in."
        );
        setMode("signin");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const goAlt = () => setMode(mode === "signin" ? "signup" : "signin");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.screen, { backgroundColor: BG }]}>
          {/* back */}
          <View style={styles.topRow}>
            <Pressable onPress={onBack} style={styles.backIconBtn} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
            </Pressable>
          </View>

          <View style={styles.main}>
            {/* logo */}
            <View style={styles.logoArea}>
              <Image source={logoSource} style={styles.logo} resizeMode="contain" />
            </View>

            {/* more space between logo and inputs */}
            <View style={styles.formArea}>
              {mode === "signup" && (
                <View style={styles.roleRow}>
                  <Pressable
                    onPress={() => setRole("client")}
                    style={[
                      styles.rolePill,
                      role === "client" ? styles.roleActive : styles.roleIdle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        { color: role === "client" ? OFF_WHITE : "rgba(0,0,0,0.55)" },
                      ]}
                    >
                      Client
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setRole("artist")}
                    style={[
                      styles.rolePill,
                      role === "artist" ? styles.roleActive : styles.roleIdle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        { color: role === "artist" ? OFF_WHITE : "rgba(0,0,0,0.55)" },
                      ]}
                    >
                      Artist
                    </Text>
                  </Pressable>
                </View>
              )}

              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Username"
                placeholderTextColor="rgba(0,0,0,0.42)"
                style={styles.input}
              />

              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password"
                placeholderTextColor="rgba(0,0,0,0.42)"
                style={styles.input}
              />

              <Pressable
                onPress={submit}
                disabled={loading}
                style={[styles.loginBtn, loading && { opacity: 0.7 }]}
              >
                {loading ? (
                  <ActivityIndicator color={OFF_WHITE} />
                ) : (
                  <Text style={styles.loginText}>
                    {mode === "signin" ? "LOGIN" : "SIGN UP"}
                  </Text>
                )}
              </Pressable>

              {/* ✅ bring “Don’t have an account?” closer to login button */}
              <View style={{ height: 10 }} />
            </View>

            {/* bottom pinned */}
            <View style={styles.bottomArea}>
              <Text style={styles.helper}>
                {mode === "signin" ? "Don’t have an account?" : "Already have an account?"}
              </Text>

              <Pressable onPress={goAlt} style={styles.signupBtn}>
                <Text style={styles.signupText}>
                  {mode === "signin" ? "SIGN UP" : "SIGN IN"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ height: 12 }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 22,
  },

  topRow: {
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  backIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  main: { flex: 1 },

  // ✅ larger logo
  logoArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  logo: {
    width: 400,
    height: 400,
  },

  // ✅ more space between logo and inputs
  formArea: {
    width: "100%",
    alignSelf: "center",
    justifyContent: "flex-start",
    marginTop: 22, // more space after logo
  },

  roleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
    width: "86%",
    alignSelf: "center",
  },
  rolePill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  roleActive: { backgroundColor: BLACK },
  roleIdle: { backgroundColor: "rgba(255,255,255,0.75)" },
  roleText: {
    fontFamily: "Inter",
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // ✅ slimmer “Apple feel”
  input: {
    width: "86%",
    alignSelf: "center",
    backgroundColor: OFF_WHITE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 13, // slimmer
    fontFamily: "Inter",
    fontWeight: "700",
    fontSize: 15,
    color: BLACK,
    marginBottom: 8, // ✅ as requested
  },

  loginBtn: {
    width: "86%",
    alignSelf: "center",
    backgroundColor: BLACK,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6,
  },
  loginText: {
    color: OFF_WHITE,
    fontFamily: "Inter",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 13,
  },

  bottomArea: {
    marginTop: "auto",
    alignItems: "center",
    paddingBottom: 14,
  },
  helper: {
    fontFamily: "Inter",
    fontWeight: "700",
    color: "rgba(0,0,0,0.45)",
    marginBottom: 8, // slightly tighter
  },

  signupBtn: {
    width: "72%",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.32)",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  signupText: {
    color: BLACK,
    fontFamily: "Inter",
    fontWeight: "900",
    letterSpacing: 1.2,
    fontSize: 14,
  },
});
