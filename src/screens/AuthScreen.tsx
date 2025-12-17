// src/screens/AuthScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Keyboard,
  TouchableWithoutFeedback,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { signIn, signUp, UserRole } from "../lib/auth";

const PINK = "#f9dfdd";
const BLACK = "#000000";
const OFF_WHITE = "#FFFFFF";

type ThemeMode = "light" | "dark";
const theme: ThemeMode = "light";
type Mode = "signin" | "signup";

const AnimatedImage = Animated.createAnimatedComponent(
  // @ts-ignore RN types are fine at runtime
  require("react-native").Image
);

export default function AuthScreen({ onBack }: { onBack: () => void }) {
  const BG = theme === "dark" ? BLACK : PINK;

  const logoSource = useMemo(
    () =>
      theme === "dark"
        ? require("../../assets/gh-dark.png")
        : require("../../assets/gh-light.png"),
    []
  );

  const { height: screenH } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<UserRole>("client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<KeyboardAwareScrollView>(null);

  // ✅ compute target logo size (same logic as before)
  const targetLogoSize = useMemo(() => {
    const base = Math.min(400, Math.max(260, Math.floor(screenH * 0.42)));
    return mode === "signup" ? Math.floor(base * 0.82) : base;
  }, [screenH, mode]);

  // ✅ animated logo size (smooth, not glitchy)
  const logoSizeAnim = useRef(new Animated.Value(targetLogoSize)).current;

  useEffect(() => {
    Animated.timing(logoSizeAnim, {
      toValue: targetLogoSize,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width/height can't use native driver
    }).start();
  }, [targetLogoSize, logoSizeAnim]);

  // ✅ reset scroll position on mode change so top/back never appears “cut off”
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToPosition(0, 0, false);
    });
  }, [mode]);

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

  const goAlt = () => {
    Keyboard.dismiss();
    setMode((m) => (m === "signin" ? "signup" : "signin"));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={{ flexGrow: 1 }}
          enableOnAndroid
          enableAutomaticScroll
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          extraScrollHeight={Platform.OS === "ios" ? 18 : 24}
          extraHeight={Platform.OS === "ios" ? 8 : 0}
        >
          <View style={[styles.screen, { backgroundColor: BG }]}>
            {/* back */}
            <View style={styles.topRow}>
              <Pressable onPress={onBack} style={styles.backIconBtn} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={"rgba(0,0,0,0.75)"} />
              </Pressable>
            </View>

            <View style={styles.main}>
              {/* logo (animated resize) */}
              <View style={styles.logoArea}>
                <AnimatedImage
                  source={logoSource}
                  resizeMode="contain"
                  style={{
                    width: logoSizeAnim,
                    height: logoSizeAnim,
                  }}
                />
              </View>

              {/* form */}
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
                  returnKeyType="next"
                  autoCorrect={false}
                />

                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor="rgba(0,0,0,0.42)"
                  style={styles.input}
                  returnKeyType="done"
                  autoCorrect={false}
                  onSubmitEditing={submit}
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
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>
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

  logoArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },

  formArea: {
    width: "100%",
    alignSelf: "center",
    justifyContent: "flex-start",
    marginTop: 22,
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

  input: {
    width: "86%",
    alignSelf: "center",
    backgroundColor: OFF_WHITE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontFamily: "Inter",
    fontWeight: "700",
    fontSize: 15,
    color: BLACK,
    marginBottom: 8,
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
    marginBottom: 8,
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
